import { configDotenv } from 'dotenv';
import express, { type Request, type Response } from 'express';
import helmet from 'helmet';
import { readFile } from 'node:fs/promises';
import { Redis } from './api/redis.api';
import { startBot } from './bot';
import { version } from './package.json';
import logger from './utils/infra/logger';
import { ensureSecretToken } from './utils/security/generateSecretToken';

configDotenv();
ensureSecretToken();

const app = express();
const { bot, job } = startBot();

bot.telegram.setWebhook(
  `${process.env.HOST || 'http://localhost:8080'}/telegram-webhook`,
  {
    secret_token: process.env.SECRET_TOKEN,
  },
);

app.use(helmet());
app.use(bot.webhookCallback('/telegram-webhook'));

app.use('/telegram-webhook', (req: any, res: any, next) => {
  const token = req.get('X-Telegram-Bot-Api-Secret-Token');
  if (token !== process.env.SECRET_TOKEN) {
    logger.error('Unauthorized access attempt detected from IP:', req.ip);
    return res.sendStatus(403);
  }
  next();
});

app.get('/logs', async (req: Request, res: Response) => {
  try {
    // Read logs from the logs/app.log file
    const logs = await readFile('logs/app.log', 'utf8');
    const logsByLines = logs.split('\n').filter((l) => !!l);
    res.json(logsByLines);
  } catch (error) {
    logger.error('Error reading logs:', error);
    res.status(500).send('Failed to read logs. Please try again later.');
  }
});

app.get('/health', async (req: any, res: any) => {
  const environment = process.env.NODE_ENV === 'production' ? 'prod' : 'dev';
  const subscriptionKeys = {
    rota_1: `${environment}:chat_ids:rota_1`,
    rota_2: `${environment}:chat_ids:rota_2`,
    rota_3: `${environment}:chat_ids:rota_3`,
    office_hours: `${environment}:chat_ids:office_hours`,
  };

  const [memberStatsEntries, subscribedChatIds] = await Promise.all([
    Promise.all(
      Object.entries(subscriptionKeys).map(
        async ([key, redisKey]) =>
          [key, await Redis.getRedisClient().scard(redisKey)] as const,
      ),
    ),
    Redis.getRedisClient().sunion(...Object.values(subscriptionKeys)),
  ]);

  const member_stats = Object.fromEntries(memberStatsEntries);

  return res.status(200).json({
    status: 'ok',
    message: 'Bot is running and healthy.',
    version,
    host: process.env.HOST,
    subscribedChatCount: subscribedChatIds.length,
    member_stats,
    nextUpdate: job.nextInvocation()
      ? job
          .nextInvocation()
          .toLocaleString('en-SG', { timeZone: 'Asia/Singapore' })
      : 'No scheduled updates.',
  });
});

// Run the server!
app.listen(process.env.PORT || 8080, () => {
  logger.info(`Server is running on port ${process.env.PORT || 8080}`);
});

// Enable graceful stop
let isShuttingDown = false;

async function shutdown(signal: 'SIGINT' | 'SIGTERM', exitCode?: number) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  logger.info(`Bot stopping gracefully on ${signal}.`);

  job.cancel();
  bot.stop(signal);

  try {
    await Redis.getRedisClient().quit();
  } catch (error) {
    logger.error('Error while closing infra during shutdown:', error);
  }

  if (typeof exitCode === 'number') {
    process.exit(exitCode);
  }
}

process.once('SIGINT', () => {
  void shutdown('SIGINT');
});

process.once('SIGTERM', () => {
  void shutdown('SIGTERM');
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  void shutdown('SIGTERM', 1);
  // Log the error, perform cleanup, and potentially restart the application.
  // It's crucial to exit the process after handling uncaught exceptions.
});

process.on('unhandledRejection', (err) => {
  logger.error('Unhandled Rejection:', err);
  void shutdown('SIGTERM', 1);
  // Log the error, perform cleanup, and potentially restart the application.
  // It's crucial to exit the process after handling unhandled rejections.
});
