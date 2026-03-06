import { Context, Telegraf } from 'telegraf';
import {
  buildEscapedWeatherReply,
  buildWeatherFetchFailedMessage,
} from '../bot/replies';
import fetchWeatherReadings from '../weather/fetchWeatherReadings';
import logger from './logger';

export async function sendScheduledWeatherMessages(
  bot: Telegraf<Context>,
  chatIds: string[],
  escapedReply: string,
) {
  if (chatIds.length === 0) {
    return;
  }

  const sendResults = await Promise.allSettled(
    chatIds.map(async (chatId) => {
      try {
        await bot.telegram.sendMessage(chatId, escapedReply, {
          parse_mode: 'MarkdownV2',
        });

        logger.info(`Weather report sent to chat ID: ${chatId}`);
      } catch (error) {
        logger.error(
          `Failed to send weather report to chat ID ${chatId}:`,
          error,
        );

        try {
          await bot.telegram.sendMessage(
            chatId,
            buildWeatherFetchFailedMessage(error),
          );
        } catch (fallbackError) {
          logger.error(
            `Failed to send fallback weather error message to chat ID ${chatId}:`,
            fallbackError,
          );
        }
      }
    }),
  );

  const rejectedCount = sendResults.filter(
    (result) => result.status === 'rejected',
  ).length;

  if (rejectedCount > 0) {
    logger.error(
      `Scheduled weather send encountered ${rejectedCount} unexpected rejection(s).`,
    );
  }
}

export async function sendOnDemandWeatherMessage(
  bot: Telegraf<Context>,
  chatId: number,
  loadingMessageId: number,
) {
  try {
    const readings = await fetchWeatherReadings();
    const escapedReply = buildEscapedWeatherReply(readings);

    await bot.telegram.editMessageText(
      chatId,
      loadingMessageId,
      undefined,
      escapedReply,
      {
        parse_mode: 'MarkdownV2',
      },
    );

    logger.info(`On-demand weather report sent to chat ID: ${chatId}`);
  } catch (error) {
    logger.error(
      `Failed to process on-demand weather report for chat ID ${chatId}:`,
      error,
    );

    try {
      await bot.telegram.editMessageText(
        chatId,
        loadingMessageId,
        undefined,
        buildWeatherFetchFailedMessage(error),
      );
    } catch (fallbackError) {
      logger.error(
        `Failed to edit loading message with fallback text for chat ID ${chatId}:`,
        fallbackError,
      );
    }
  }
}
