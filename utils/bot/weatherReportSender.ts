import { Context, Telegraf } from 'telegraf';

import { Weather } from '../../api/weather.api';
import logger from '../infra/logger';
import {
  buildEscapedWeatherReply,
  buildWeatherFetchFailedMessage,
} from './replies';

export namespace WeatherReportSender {
  async function notifyChatAboutError(
    bot: Telegraf<Context>,
    chatId: number,
    error: unknown,
    context: string,
  ) {
    try {
      await bot.telegram.sendMessage(
        chatId,
        buildWeatherFetchFailedMessage(error),
      );
    } catch (notifyError) {
      logger.error(
        `Failed to send error message to chat ID ${chatId} after ${context}:`,
        notifyError,
      );
    }
  }

  export async function sendWeatherMessages(
    bot: Telegraf<Context>,
    chatIds: number[],
    opts: Parameters<typeof buildEscapedWeatherReply>[1] & {
      editMessageId?: number;
    },
  ) {
    if (chatIds.length === 0) {
      return;
    }

    let escapedReply: string;

    try {
      const readings = await Weather.retrieveWeatherDataForBot();
      escapedReply = buildEscapedWeatherReply(readings, opts);
    } catch (error) {
      logger.error(
        'Failed to fetch weather readings before sending reports:',
        error,
      );

      await Promise.all(
        chatIds.map((chatId) =>
          notifyChatAboutError(bot, chatId, error, 'weather fetch failure'),
        ),
      );

      return;
    }

    // If opts.editMessageId is provided, we will attempt to edit the existing message instead of sending a new one. This is used for on-demand weather updates to replace the loading message with the weather report.

    await Promise.all(
      chatIds.map(async (chatId) => {
        try {
          if (opts.editMessageId != null) {
            await bot.telegram.editMessageText(
              chatId,
              opts.editMessageId,
              undefined,
              escapedReply,
              {
                parse_mode: 'MarkdownV2',
              },
            );

            logger.info(`Weather report edited for chat ID: ${chatId}`);
            return;
          }

          await bot.telegram.sendMessage(chatId, escapedReply, {
            parse_mode: 'MarkdownV2',
          });

          logger.info(`Weather report sent to chat ID: ${chatId}`);
        } catch (error) {
          logger.error(
            `Failed to send weather report to chat ID ${chatId}:`,
            error,
          );

          await notifyChatAboutError(
            bot,
            chatId,
            error,
            'weather report send/edit failure',
          );
        }
      }),
    );
  }

  // export async function sendOnDemandWeatherMessage(
  //   bot: Telegraf<Context>,
  //   chatId: number,
  //   loadingMessageId: number,
  // ) {
  //   try {
  //     const readings = await Weather.retrieveWeatherDataForBot();
  //     const escapedReply = buildEscapedWeatherReply(readings);

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
