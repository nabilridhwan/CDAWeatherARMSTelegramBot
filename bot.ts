import schedule from 'node-schedule';
import { randomUUID } from 'node:crypto';
import { Markup, Telegraf } from 'telegraf';
import { Lightning } from './api/lightning.api';
import { Redis } from './api/redis.api';
import { MessageQueue } from './utils/bot/messageQueue';
import {
  buildAlreadySubscribedMessage,
  buildRotaSetSuccessMessage,
  buildSettingsMessages,
  HELP_MESSAGE,
  LOADING_MESSAGE,
  STOP_SUCCESS_MESSAGE,
  WELCOME_SUBSCRIBED_MESSAGE,
} from './utils/bot/replies';
import { rule } from './utils/bot/rule';
import { env } from './utils/infra/env';
import logger from './utils/infra/logger';
import { Rota } from './utils/schedule/rota';

export type BotRuntime = {
  bot: Telegraf;
  job: schedule.Job;
};

// Creates the Telegraf instance only when startup calls it.
export function createBot(): Telegraf {
  return new Telegraf(env.BOT_ID);
}

function registerBotActionHandlers(bot: Telegraf, job: schedule.Job) {
  // ==============================
  // #region Callback query handlers for setting rota subscriptions
  // ==============================
  bot.action('set_rota_1', async (ctx) => {
    await Redis.assignRota(1, ctx);
    const nextUpdate = Rota.getNextUpdateDateForRota(1) || job.nextInvocation();
    ctx.editMessageText(buildRotaSetSuccessMessage(1, nextUpdate));
    ctx.answerCbQuery(); // Acknowledge the callback query to remove the loading state
  });

  bot.action('set_rota_2', async (ctx) => {
    // call assignRota
    await Redis.assignRota(2, ctx);
    const nextUpdate = Rota.getNextUpdateDateForRota(2) || job.nextInvocation();
    ctx.editMessageText(buildRotaSetSuccessMessage(2, nextUpdate));
    ctx.answerCbQuery(); // Acknowledge the callback query to remove the loading state
  });

  bot.action('set_rota_3', async (ctx) => {
    await Redis.assignRota(3, ctx);
    const nextUpdate = Rota.getNextUpdateDateForRota(3) || job.nextInvocation();
    ctx.editMessageText(buildRotaSetSuccessMessage(3, nextUpdate));
    ctx.answerCbQuery(); // Acknowledge the callback query to remove the loading state
  });

  bot.action('set_office_hours', async (ctx) => {
    await Redis.assignRota('office_hours', ctx);
    const nextUpdate = job.nextInvocation();
    ctx.editMessageText(buildRotaSetSuccessMessage('office_hours', nextUpdate));
    ctx.answerCbQuery(); // Acknowledge the callback query to remove the loading state
  });

  bot.action('stop_updates', async (ctx) => {
    if (!ctx.chat) return;
    try {
      await Redis.removeChatFromAllSubscriptions(ctx.chat.id);
    } catch (err) {
      logger.error(`Failed to remove chat ID from subscriptions: ${err}`);
    }
    ctx.editMessageText(STOP_SUCCESS_MESSAGE);
    ctx.answerCbQuery(); // Acknowledge the callback query to remove the loading state
  });

  bot.action('lightning_cda', async (ctx) => {
    const data = await Lightning.retrieveLightningData(
      Lightning.Defaults.CDA.latitude,
      Lightning.Defaults.CDA.longitude,
      'CDA',
    );

    ctx.editMessageText(data.message);
    ctx.answerCbQuery(); // Acknowledge the callback query to remove the loading state
  });

  bot.action('lightning_httc', async (ctx) => {
    const data = await Lightning.retrieveLightningData(
      Lightning.Defaults.HTTC.latitude,
      Lightning.Defaults.HTTC.longitude,
      'HTTC',
    );

    ctx.editMessageText(data.message);
    ctx.answerCbQuery(); // Acknowledge the callback query to remove the loading state
  });
}

// Registers all bot commands/actions against provided runtime instances.
// Injecting bot/job here keeps handler setup explicit and decoupled from module import.
function registerHandlers(bot: Telegraf, job: schedule.Job) {
  // ==============================
  // #region Bot command and action handlers
  // ==============================

  bot.start(async (ctx) => {
    logger.info(
      `Start command called by Chat ID: ${ctx.chat.id}. Next update at ${new Date(job.nextInvocation()).toLocaleString('en-SG', { timeZone: 'Asia/Singapore' })}`,
    );

    const subscriptionRota = await Redis.getChatSubscriptionRota(ctx.chat.id);
    const rotaNumber: Rota.WorkingSchedule | null = subscriptionRota;
    const hasSubscribedToAnyChat = rotaNumber !== null;

    if (hasSubscribedToAnyChat) {
      const nextUpdateForSubscription =
        Rota.getNextUpdateDateForRota(rotaNumber) ??
        new Date(job.nextInvocation());

      const msg = buildAlreadySubscribedMessage(
        rotaNumber,
        nextUpdateForSubscription,
      );

      ctx.telegram.sendMessage(ctx.chat.id, msg, undefined);

      logger.info(
        'Chat ID: ' + ctx.chat.id + ' is already subscribed. No action taken.',
      );
      return;
    }

    ctx.telegram.sendMessage(
      ctx.chat.id,
      WELCOME_SUBSCRIBED_MESSAGE,
      Markup.inlineKeyboard([
        Markup.button.callback('Rota 1', 'set_rota_1'),
        Markup.button.callback('Rota 2', 'set_rota_2'),
        Markup.button.callback('Rota 3', 'set_rota_3'),
        Markup.button.callback('Office Hours', 'set_office_hours'),
      ]),
    );

    logger.info('Added Chat ID: ' + ctx.chat.id + ' to subscribed chat IDs.');
  });

  bot.command('weather', async (ctx) => {
    logger.info(
      'Weather command called by user: ' +
        ctx.from.username +
        ' (ID: ' +
        ctx.from.id +
        ') in chat ID: ' +
        ctx.chat.id,
    );

    const loadingMessage = await ctx.reply(LOADING_MESSAGE);

    await MessageQueue.sendWeatherMessages(bot, [ctx.chat.id], {
      jobDate: new Date(),
      editMessageId: loadingMessage.message_id,
    });

    logger.info(
      'Processed on-demand weather data for user: ' +
        ctx.from.username +
        ' (ID: ' +
        ctx.from.id +
        ') in chat ID: ' +
        ctx.chat.id,
    );
  });

  bot.command('lightning', async (ctx) => {
    logger.info(
      'Lightning command called by user: ' +
        ctx.from.username +
        ' (ID: ' +
        ctx.from.id +
        ') in chat ID: ' +
        ctx.chat.id,
    );

    const loadingMessage = await ctx.reply(LOADING_MESSAGE);

    ctx.telegram.sendMessage(
      ctx.chat.id,
      'Please select your location:',
      Markup.inlineKeyboard([
        Markup.button.callback('CDA', 'lightning_cda'),
        Markup.button.callback('HTTC', 'lightning_httc'),
      ]),
    );
  });

  bot.command('settings', async (ctx) => {
    const rotaNumber = await Redis.getChatSubscriptionRota(ctx.chat.id);

    if (rotaNumber === null) {
      await ctx.telegram.sendMessage(
        ctx.chat.id,
        'You are not currently subscribed to any schedule. Use /start to subscribe.',
      );
      return;
    }

    ctx.telegram.sendMessage(
      ctx.chat.id,
      buildSettingsMessages(rotaNumber),
      Markup.inlineKeyboard([
        [
          Markup.button.callback('Rota 1', 'set_rota_1'),
          Markup.button.callback('Rota 2', 'set_rota_2'),
          Markup.button.callback('Rota 3', 'set_rota_3'),
          Markup.button.callback('Office Hours', 'set_office_hours'),
        ],
        [Markup.button.callback('Stop Updates', 'stop_updates')],
      ]),
    );
  });

  bot.help((ctx) => {
    ctx.reply(HELP_MESSAGE);
  });
}

function registerAdminHandlers(bot: Telegraf, job: schedule.Job) {
  // Usage: /announcement [message]
  // Example: /announcement Weather update will be delayed today due to API issues.
  bot.command('announcement', async (ctx) => {
    if (ctx.from.id.toString() !== env.OWNER_USER_ID) {
      ctx.reply('You are not authorized to use this command.');
      return;
    }

    const announcement = ctx.message.text.split(' ').slice(1).join(' ');

    if (!announcement) {
      ctx.reply('Please provide a message for the announcement.');
      return;
    }

    const subscribedChatIds = await Redis.getAllChatIds();

    await MessageQueue.sendAnnouncementMessages(
      bot,
      subscribedChatIds.map((id) => parseInt(id, 10)),
      announcement,
    );

    ctx.reply('✅ Announcement sent to all subscribed chats.');
    ctx.reply('📢 Your announcement: ' + announcement);

    logger.info(
      `Admin announcement sent by user: ${ctx.from.username} (ID: ${ctx.from.id}). Message: ${announcement}`,
    );
  });
}

// ==============================
// #region Scheduled job to send weather updates
// ==============================
// Creates the scheduler job lazily so importing this module does not start background work.
function createJob(bot: Telegraf): schedule.Job {
  return schedule.scheduleJob(rule, async (fireDate) => {
    const jobDate = new Date(fireDate);
    const lockKey = Redis.getWeatherJobLockKey(jobDate);
    const lockValue = randomUUID();
    const lockTtlSeconds = 120;

    try {
      const lockAcquired = await Redis.acquireDistributedLock(
        lockKey,
        lockValue,
        lockTtlSeconds,
      );

      if (!lockAcquired) {
        logger.info(
          `Skipped weather send at ${jobDate.toISOString()} because scheduler lock is already held by another instance.`,
        );
        return;
      }

      const subscribedChatIds =
        await Redis.getSubscribedChatIdsForDate(jobDate);

      if (subscribedChatIds.length === 0) {
        logger.info('No subscribed chat IDs found. Skipping weather report.');
        return;
      }

      await MessageQueue.sendWeatherMessages(
        bot,
        subscribedChatIds.map((id) => parseInt(id, 10)),
        {
          jobDate,
        },
      );

      logger.info(
        'Sent weather reports to all subscribed chat IDs at ' +
          new Date().toLocaleString('en-SG', {
            timeZone: 'Asia/Singapore',
          }),
      );
    } catch (error) {
      logger.error('Error fetching weather data:', error);
    } finally {
      try {
        await Redis.releaseDistributedLock(lockKey, lockValue);
      } catch (error) {
        logger.error('Failed to release scheduler lock:', error);
      }
    }
  });
}

// Composition root for this module: builds bot + scheduler, wires handlers, and returns runtime.
// Caller controls when runtime starts by deciding when to invoke this function.
export function startBot(): BotRuntime {
  const bot = createBot();
  const job = createJob(bot);
  registerBotActionHandlers(bot, job);
  registerAdminHandlers(bot, job);
  registerHandlers(bot, job);
  return { bot, job };
}
