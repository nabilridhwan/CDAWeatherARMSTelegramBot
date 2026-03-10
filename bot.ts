import schedule from 'node-schedule';
import { Markup, Telegraf } from 'telegraf';
import { Redis } from './api/redis.api';
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
import { WeatherReportSender } from './utils/bot/weatherReportSender';
import logger from './utils/infra/logger';
import { generateVersionInfoMessage } from './utils/infra/version';
import { Rota } from './utils/schedule/rota';

export const bot = new Telegraf(process.env.BOT_ID!);

// ==============================
// Scheduled job to send weather updates
// ==============================

export const job = schedule.scheduleJob(rule, async (fireDate) => {
  try {
    const subscribedChatIds = await Redis.getSubscribedChatIdsForDate(fireDate);

    if (subscribedChatIds.length === 0) {
      logger.info('No subscribed chat IDs found. Skipping weather report.');
      return;
    }

    await WeatherReportSender.sendWeatherMessages(
      bot,
      subscribedChatIds.map((id) => parseInt(id, 10)),
      {
        jobDate: new Date(fireDate),
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
  }
});

// ==============================
// Bot command and action handlers
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

// ==============================
// Callback query handlers for setting rota subscriptions
// ==============================
bot.action('set_rota_1', async (ctx) => {
  await assignRota(1, ctx);
  const nextUpdate = Rota.getNextUpdateDateForRota(1) || job.nextInvocation();
  ctx.editMessageText(buildRotaSetSuccessMessage(1, nextUpdate));
  ctx.answerCbQuery(); // Acknowledge the callback query to remove the loading state
});

bot.action('set_rota_2', async (ctx) => {
  // call assignRota
  await assignRota(2, ctx);
  const nextUpdate = Rota.getNextUpdateDateForRota(2) || job.nextInvocation();
  ctx.editMessageText(buildRotaSetSuccessMessage(2, nextUpdate));
  ctx.answerCbQuery(); // Acknowledge the callback query to remove the loading state
});

bot.action('set_rota_3', async (ctx) => {
  await assignRota(3, ctx);
  const nextUpdate = Rota.getNextUpdateDateForRota(3) || job.nextInvocation();
  ctx.editMessageText(buildRotaSetSuccessMessage(3, nextUpdate));
  ctx.answerCbQuery(); // Acknowledge the callback query to remove the loading state
});

bot.action('set_office_hours', async (ctx) => {
  await assignRota('office_hours', ctx);
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

async function assignRota(rotaNumber: Rota.WorkingSchedule, ctx: any) {
  try {
    await Redis.setRotaSubscription(ctx.chat.id, rotaNumber);
  } catch (err) {
    logger.error(`Failed to set rota subscription: ${err}`);
  }
}

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

  await WeatherReportSender.sendWeatherMessages(bot, [ctx.chat.id], {
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

bot.command('stop', async (ctx) => {
  const chatId = ctx.chat.id;
  await Redis.removeChatFromAllSubscriptions(chatId);
  await ctx.reply(STOP_SUCCESS_MESSAGE);
  logger.info(`Stop command called by Chat ID: ${chatId}.`);
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
    buildSettingsMessages(rotaNumber) + '\n\n' + generateVersionInfoMessage(),
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
