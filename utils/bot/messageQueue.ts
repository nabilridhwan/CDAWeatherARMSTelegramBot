import PQueue from 'p-queue';
import { Context, Telegraf } from 'telegraf';

import { Weather } from '../../api/weather.api';
import logger from '../infra/logger';
import { buildErrorMessage, buildWeatherReply } from './replies';

export namespace MessageQueue {
  const SEND_QUEUE_CONCURRENCY = 5;
  const SEND_QUEUE_INTERVAL_CAP = 20;
  const SEND_QUEUE_INTERVAL_MS = 1_000;
  const MAX_SEND_ATTEMPTS = 3;
  const RETRY_BASE_DELAY_MS = 300;

  // Shared queue to smooth outbound Telegram traffic across scheduled and on-demand sends.
  const sendQueue = new PQueue({
    concurrency: SEND_QUEUE_CONCURRENCY,
    intervalCap: SEND_QUEUE_INTERVAL_CAP,
    interval: SEND_QUEUE_INTERVAL_MS,
    carryoverConcurrencyCount: true,
  });

  export interface ErrorContext {
    type:
      | 'weather fetch failure'
      | 'message send/edit failure'
      | 'on-demand weather report failure';
    message: string;
    error: unknown;
  }

  type TelegramError = {
    response?: {
      error_code?: number;
      parameters?: {
        retry_after?: number;
      };
    };
    code?: string;
    message?: string;
  };

  function asTelegramError(error: unknown): TelegramError {
    if (typeof error === 'object' && error !== null) {
      return error as TelegramError;
    }

    return {};
  }

  function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function isRetryableTelegramError(error: unknown): boolean {
    const normalized = asTelegramError(error);
    const errorCode = normalized.response?.error_code;

    if (errorCode === 429) {
      return true;
    }

    if (typeof errorCode === 'number' && errorCode >= 500) {
      return true;
    }

    const networkErrorCodes = new Set([
      'ECONNABORTED',
      'ECONNRESET',
      'ETIMEDOUT',
      'EAI_AGAIN',
      'ENOTFOUND',
    ]);

    if (normalized.code && networkErrorCodes.has(normalized.code)) {
      return true;
    }

    return errorCode == null;
  }

  function getRetryDelayMs(error: unknown, attempt: number): number {
    const normalized = asTelegramError(error);
    const retryAfter = normalized.response?.parameters?.retry_after;

    if (typeof retryAfter === 'number' && retryAfter > 0) {
      return retryAfter * 1_000;
    }

    const jitter = Math.floor(Math.random() * 100);
    return RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1) + jitter;
  }

  async function sendOrEditMessage(
    bot: Telegraf<Context>,
    chatId: number,
    message: string,
    opts: {
      editMessageId?: number;
    },
  ) {
    if (opts.editMessageId != null) {
      await bot.telegram.editMessageText(
        chatId,
        opts.editMessageId,
        undefined,
        message,
        {
          parse_mode: 'MarkdownV2',
        },
      );
      logger.info(`Weather report edited for chat ID: ${chatId}`);
      return;
    }

    await bot.telegram.sendMessage(chatId, message, {
      parse_mode: 'MarkdownV2',
    });
    logger.info(`Weather report sent to chat ID: ${chatId}`);
  }

  async function sendWithRetry(
    bot: Telegraf<Context>,
    chatId: number,
    message: string,
    opts: {
      editMessageId?: number;
    },
  ) {
    for (let attempt = 1; attempt <= MAX_SEND_ATTEMPTS; attempt++) {
      try {
        await sendOrEditMessage(bot, chatId, message, opts);
        return;
      } catch (error) {
        const shouldRetry =
          attempt < MAX_SEND_ATTEMPTS && isRetryableTelegramError(error);

        if (!shouldRetry) {
          throw error;
        }

        const delayMs = getRetryDelayMs(error, attempt);
        logger.warn(
          `Retrying weather send for chat ID ${chatId} (attempt ${attempt + 1}/${MAX_SEND_ATTEMPTS}) in ${delayMs}ms.`,
        );
        await sleep(delayMs);
      }
    }
  }

  async function notifyChatAboutError(
    bot: Telegraf<Context>,
    chatId: number,
    context: ErrorContext,
  ) {
    try {
      await bot.telegram.sendMessage(chatId, buildErrorMessage(context));
    } catch (notifyError) {
      logger.error(
        `Failed to send error message to chat ID ${chatId} after ${context}:`,
        notifyError,
      );
    }
  }

  async function enqueueMessageSend(
    bot: Telegraf<Context>,
    chatId: number,
    message: string,
    opts: {
      editMessageId?: number;
    },
  ) {
    await sendQueue.add(async () => {
      try {
        await sendWithRetry(bot, chatId, message, opts);
      } catch (error) {
        logger.error(`Failed to send message to chat ID ${chatId}:`, error);

        await notifyChatAboutError(bot, chatId, {
          type: 'message send/edit failure',
          message: 'Failed to send or edit message',
          error,
        });
      }
    });
  }

  export async function sendAnnouncementMessages(
    bot: Telegraf<Context>,
    chatIds: number[],
    announcement: string,
  ) {
    try {
      await Promise.all(
        chatIds.map((chatId) =>
          enqueueMessageSend(bot, chatId, announcement, {}),
        ),
      );

      logger.info('Announcement messages sent to all subscribed chats.');
    } catch (error) {
      logger.error('Failed to send announcement messages:', error);
    }
  }

  export async function sendWeatherMessages(
    bot: Telegraf<Context>,
    chatIds: number[],
    opts: Parameters<typeof buildWeatherReply>[2] & {
      editMessageId?: number;
    },
  ) {
    if (chatIds.length === 0) {
      return;
    }

    let msg: string;

    try {
      const { data: readings, isCached } =
        await Weather.getCachedOrFetchWeatherDataForBot();
      msg = buildWeatherReply(
        {
          heatStress: readings.cdaWBGT.heatStress,
          wbgt: readings.cdaWBGT.wbgt,
          airTemp: readings.cdaAirTemp.value,
          emoji: Weather.Parser.parseWBGTHeatStress(
            readings.cdaWBGT.heatStress,
          ),
          dateTime: readings.cdaWBGT.dateTime,
        },
        {
          heatStress: readings.httcWBGT.heatStress,
          wbgt: readings.httcWBGT.wbgt,
          airTemp: readings.httcAirTemp.value,
          emoji: Weather.Parser.parseWBGTHeatStress(
            readings.httcWBGT.heatStress,
          ),
          dateTime: readings.httcWBGT.dateTime,
        },
        { ...opts, isCached },
      );
    } catch (error) {
      logger.error(
        'Failed to fetch weather readings before sending reports:',
        error,
      );

      await Promise.all(
        chatIds.map((chatId) =>
          sendQueue.add(() =>
            notifyChatAboutError(bot, chatId, {
              type: 'weather fetch failure',
              message: 'Failed to fetch weather data',
              error,
            }),
          ),
        ),
      );

      return;
    }

    // If opts.editMessageId is provided, we will attempt to edit the existing message instead of sending a new one. This is used for on-demand weather updates to replace the loading message with the weather report.
    await Promise.all(
      chatIds.map((chatId) => enqueueMessageSend(bot, chatId, msg, opts)),
    );
  }

  export async function waitForIdle() {
    await sendQueue.onIdle();
  }

  // export async function sendOnDemandWeatherMessage(
  //   bot: Telegraf<Context>,
  //   chatId: number,
  //   loadingMessageId: number,
  // ) {
  //   try {
  //     const { data: readings, isCached } = await Weather.getCachedOrFetchWeatherDataForBot();
  //     const escapedReply = buildEscapedWeatherReply(readings, { isCached });

  //     await bot.telegram.editMessageText(
  //       chatId,
  //       loadingMessageId,
  //       undefined,
  //       escapedReply,
  //       {
  //         parse_mode: 'MarkdownV2',
  //       },
  //     );

  //     logger.info(`On-demand weather report sent to chat ID: ${chatId}`);
  //   } catch (error) {
  //     logger.error(
  //       `Failed to process on-demand weather report for chat ID ${chatId}:`,
  //       error,
  //     );

  //     await notifyChatAboutError(
  //       bot,
  //       chatId,
  //       error,
  //       'on-demand weather report failure',
  //     );
  //   }
  // }
}
