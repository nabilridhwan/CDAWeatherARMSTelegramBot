import { Queue, Worker } from 'bullmq';
import { Context, Telegraf } from 'telegraf';
import {
  buildEscapedWeatherReply,
  buildWeatherFetchFailedMessage,
} from '../bot/replies';
import fetchWeatherReadings from '../weather/fetchWeatherReadings';
import logger from './logger';
import { redisConnectionOptions } from './redis';

type ScheduledWeatherMessageJobData = {
  type: 'scheduled';
  chatId: string;
  escapedReply: string;
};

type OnDemandWeatherMessageJobData = {
  type: 'on_demand';
  chatId: number;
  loadingMessageId: number;
};

type WeatherMessageJobData =
  | ScheduledWeatherMessageJobData
  | OnDemandWeatherMessageJobData;

const WEATHER_REPORT_QUEUE_NAME = 'weather-report-messages';

const weatherReportQueue = new Queue<WeatherMessageJobData>(
  WEATHER_REPORT_QUEUE_NAME,
  {
    connection: redisConnectionOptions,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
      removeOnComplete: true,
      removeOnFail: 100,
    },
  },
);

let weatherReportWorker: Worker<WeatherMessageJobData> | null = null;

async function processScheduledWeatherMessage(
  bot: Telegraf<Context>,
  data: ScheduledWeatherMessageJobData,
) {
  try {
    await bot.telegram.sendMessage(data.chatId, data.escapedReply, {
      parse_mode: 'MarkdownV2',
    });

    logger.info(`Weather report sent to chat ID: ${data.chatId}`);
  } catch (error) {
    logger.error(
      `Failed to send weather report to chat ID ${data.chatId}:`,
      error,
    );

    try {
      await bot.telegram.sendMessage(
        data.chatId,
        buildWeatherFetchFailedMessage(error),
      );
    } catch (fallbackError) {
      logger.error(
        `Failed to send fallback weather error message to chat ID ${data.chatId}:`,
        fallbackError,
      );
    }
  }
}

async function processOnDemandWeatherMessage(
  bot: Telegraf<Context>,
  data: OnDemandWeatherMessageJobData,
) {
  try {
    const readings = await fetchWeatherReadings();
    const escapedReply = buildEscapedWeatherReply(readings);

    await bot.telegram.editMessageText(
      data.chatId,
      data.loadingMessageId,
      undefined,
      escapedReply,
      {
        parse_mode: 'MarkdownV2',
      },
    );

    logger.info(`On-demand weather report sent to chat ID: ${data.chatId}`);
  } catch (error) {
    logger.error(
      `Failed to process on-demand weather report for chat ID ${data.chatId}:`,
      error,
    );

    try {
      await bot.telegram.editMessageText(
        data.chatId,
        data.loadingMessageId,
        undefined,
        buildWeatherFetchFailedMessage(error),
      );
    } catch (fallbackError) {
      logger.error(
        `Failed to edit loading message with fallback text for chat ID ${data.chatId}:`,
        fallbackError,
      );
    }
  }
}

export function initialiseWeatherReportWorker(bot: Telegraf<Context>) {
  if (weatherReportWorker) {
    return weatherReportWorker;
  }

  weatherReportWorker = new Worker<WeatherMessageJobData>(
    WEATHER_REPORT_QUEUE_NAME,
    async (job) => {
      if (job.data.type === 'scheduled') {
        await processScheduledWeatherMessage(bot, job.data);
        return;
      }

      await processOnDemandWeatherMessage(bot, job.data);
    },
    {
      connection: redisConnectionOptions,
      concurrency: 10,
    },
  );

  weatherReportWorker.on('failed', (job, error) => {
    logger.error(
      `Weather queue job failed (${job?.id ?? 'unknown-job-id'}):`,
      error,
    );
  });

  weatherReportWorker.on('error', (error) => {
    logger.error('Weather queue worker error:', error);
  });

  return weatherReportWorker;
}

export async function enqueueScheduledWeatherMessages(
  chatIds: string[],
  escapedReply: string,
) {
  if (chatIds.length === 0) {
    return;
  }

  const timestamp = Date.now();

  await weatherReportQueue.addBulk(
    chatIds.map((chatId) => ({
      name: 'send-scheduled-weather-message',
      data: {
        type: 'scheduled',
        chatId,
        escapedReply,
      } as ScheduledWeatherMessageJobData,
      opts: {
        jobId: `scheduled:${timestamp}:${chatId}`,
      },
    })),
  );
}

export async function enqueueOnDemandWeatherMessage(
  chatId: number,
  loadingMessageId: number,
) {
  await weatherReportQueue.add(
    'send-on-demand-weather-message',
    {
      type: 'on_demand',
      chatId,
      loadingMessageId,
    },
    {
      jobId: `on-demand:${chatId}:${loadingMessageId}`,
      attempts: 1,
    },
  );
}

export async function closeWeatherReportQueue() {
  if (weatherReportWorker) {
    await weatherReportWorker.close();
    weatherReportWorker = null;
  }

  await weatherReportQueue.close();
}

export async function getWeatherReportQueueCounts() {
  return weatherReportQueue.getJobCounts(
    'waiting',
    'active',
    'completed',
    'failed',
    'delayed',
    'paused',
  );
}
