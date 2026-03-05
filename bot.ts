import schedule from 'node-schedule';
import { Markup, Telegraf } from 'telegraf';
import {
  buildAlreadySubscribedMessage,
  buildEscapedWeatherReply,
  buildRotaSetSuccessMessage,
  buildSettingsMessages,
  buildWeatherFetchFailedMessage,
  HELP_MESSAGE,
  LOADING_MESSAGE,
  STOP_SUCCESS_MESSAGE,
  WELCOME_SUBSCRIBED_MESSAGE,
} from './utils/bot/replies';
import {
  getChatSubscriptionRota,
  getSubscribedChatIdsForDate,
  removeChatFromAllSubscriptions,
  setRotaSubscription,
  SubscriptionRota,
} from './utils/bot/subscriptions';
import logger from './utils/infra/logger';
import { generateVersionInfoMessage } from './utils/infra/version';
import getRotaNumberForDate from './utils/schedule/getRotaNumber';
import fetchWeatherReadings from './utils/weather/fetchWeatherReadings';

export const bot = new Telegraf(process.env.BOT_ID!);

// ==============================
// Scheduled job to send weather updates
// ==============================

// Cron rule to run every weekday at 09:50, 11:50, 13:50, and 15:50 in Singapore timezone
const rule = new schedule.RecurrenceRule();
rule.dayOfWeek = new schedule.Range(1, 5); // Monday to Friday
rule.hour = [9, 11, 13, 15];
rule.minute = 50;
rule.tz = 'Singapore';

export const job = schedule.scheduleJob(rule, async (fireDate) => {
  try {
    const subscribedChatIds = await getSubscribedChatIdsForDate(fireDate);

    if (subscribedChatIds.length === 0) {
      logger.info('No subscribed chat IDs found. Skipping weather report.');
      return;
    }

    const readings = await fetchWeatherReadings();
    const escapedReply = buildEscapedWeatherReply(readings, {
      jobDate: new Date(fireDate),
      nextUpdate: new Date(job.nextInvocation()),
    });

    const sendingChatPromises = await Promise.allSettled(
      subscribedChatIds.map((chatId) =>
        bot.telegram
          .sendMessage(chatId, escapedReply, {
            parse_mode: 'MarkdownV2',
          })
          .catch((error) => {
            return bot.telegram.sendMessage(
              chatId,
              buildWeatherFetchFailedMessage(error),
            );
          }),
      ),
    );

    sendingChatPromises.forEach((result) => {
      if (result.status === 'rejected') {
        logger.error(`Failed to send message: ${result.reason}`);
      } else {
        logger.info(`Weather report sent to chat ID: ${result.value.chat.id}`);
      }
    });

    logger.info(
      'Weather report sent to all subscribed chat IDs at ' +
        new Date().toLocaleString('en-SG', {
          timeZone: 'Asia/Singapore',
        }),
    );
  } catch (error) {
    logger.error('Error fetching weather data:', error);
  }
});

function getNextUpdateForSubscription(
  subscriptionRota: SubscriptionRota,
  fromDate: Date = new Date(),
): Date | null {
  let cursor = fromDate;

  for (let attempt = 0; attempt < 200; attempt++) {
    const nextInvocation = rule.nextInvocationDate(cursor);

    if (!nextInvocation) {
      return null;
    }

    const nextDate = nextInvocation;

    if (
      subscriptionRota === 'office_hours' ||
      getRotaNumberForDate(nextDate) === subscriptionRota
    ) {
      return nextDate;
    }

    cursor = new Date(nextDate.getTime() + 60_000);
  }

  return null;
}

// ==============================
// Bot command and action handlers
// ==============================

bot.start(async (ctx) => {
  logger.info(
    `Start command called by Chat ID: ${ctx.chat.id}. Next update at ${new Date(job.nextInvocation()).toLocaleString('en-SG', { timeZone: 'Asia/Singapore' })}`,
  );

  const subscriptionRota = await getChatSubscriptionRota(ctx.chat.id);
  const rotaNumber: SubscriptionRota | null = subscriptionRota;
  const hasSubscribedToAnyChat = rotaNumber !== null;

  if (hasSubscribedToAnyChat) {
    const nextUpdateForSubscription =
      getNextUpdateForSubscription(rotaNumber) ??
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
  ctx.editMessageText(buildRotaSetSuccessMessage(1));
  ctx.answerCbQuery(); // Acknowledge the callback query to remove the loading state
});

bot.action('set_rota_2', async (ctx) => {
  // call assignRota
  await assignRota(2, ctx);
  ctx.editMessageText(buildRotaSetSuccessMessage(2));
  ctx.answerCbQuery(); // Acknowledge the callback query to remove the loading state
});

bot.action('set_rota_3', async (ctx) => {
  await assignRota(3, ctx);
  ctx.editMessageText(buildRotaSetSuccessMessage(3));
  ctx.answerCbQuery(); // Acknowledge the callback query to remove the loading state
});

bot.action('set_office_hours', async (ctx) => {
  await assignRota('office_hours', ctx);
  ctx.editMessageText(buildRotaSetSuccessMessage('office_hours'));
  ctx.answerCbQuery(); // Acknowledge the callback query to remove the loading state
});

bot.action('stop_updates', async (ctx) => {
  if (!ctx.chat) return;
  try {
    await removeChatFromAllSubscriptions(ctx.chat.id);
  } catch (err) {
    logger.error(`Failed to remove chat ID from subscriptions: ${err}`);
  }
  ctx.editMessageText(STOP_SUCCESS_MESSAGE);
  ctx.answerCbQuery(); // Acknowledge the callback query to remove the loading state
});

async function assignRota(rotaNumber: SubscriptionRota, ctx: any) {
  try {
    await setRotaSubscription(ctx.chat.id, rotaNumber);
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

  try {
    const readings = await fetchWeatherReadings();
    const escapedReply = buildEscapedWeatherReply(readings);

    await ctx.telegram.editMessageText(
      ctx.chat.id,
      loadingMessage.message_id,
      undefined,
      escapedReply,
      { parse_mode: 'MarkdownV2' },
    );

    logger.info(
      'Weather data sent to user: ' +
        ctx.from.username +
        ' (ID: ' +
        ctx.from.id +
        ') in chat ID: ' +
        ctx.chat.id,
    );
  } catch (error) {
    logger.error('Error fetching weather data:', error);
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      loadingMessage.message_id,
      undefined,
      buildWeatherFetchFailedMessage(error),
    );
  }
});

bot.command('stop', async (ctx) => {
  const chatId = ctx.chat.id;
  await removeChatFromAllSubscriptions(chatId);
  await ctx.reply(STOP_SUCCESS_MESSAGE);
  logger.info(`Stop command called by Chat ID: ${chatId}.`);
});

bot.command('settings', async (ctx) => {
  const rotaNumber = await getChatSubscriptionRota(ctx.chat.id);

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
