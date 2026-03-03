import schedule from 'node-schedule';
import { Markup, Telegraf } from 'telegraf';
import { getAirTempFromLatLng, getWGBTFromLatLng } from '../../api/weather';
import logger from '../infra/logger';
import redis from '../infra/redis';
import getRotaNumberForDate from '../schedule/getRotaNumber';
import getWBGTEmoji from '../weather/getWBGTEmoji';
import { CDA, HTTC } from '../weather/locations';
import {
  buildAlreadySubscribedMessage,
  buildRotaSetSuccessMessage,
  buildWeatherFetchFailedMessage,
  buildWeatherReply,
  escapeMarkdownV2,
  HELP_MESSAGE,
  LOADING_MESSAGE,
  SETROTA_ERROR_MESSAGE,
  STOP_SUCCESS_MESSAGE,
  WELCOME_SUBSCRIBED_MESSAGE,
} from './replies';

export const bot = new Telegraf(process.env.BOT_ID!);

const SUBSCRIBED_CHAT_IDS_KEY = 'subscribed_chat_ids';
const SUBSCRIBED_CHAT_IDS_ROTA_PREFIX = 'subscribed_chat_ids_rota_';

type RotaNumber = 1 | 2 | 3;
type WbgtReading = Awaited<ReturnType<typeof getWGBTFromLatLng>>;
type AirTempReading = Awaited<ReturnType<typeof getAirTempFromLatLng>>;

type WeatherReadings = {
  cdaWBGT: WbgtReading;
  cdaAirTemp: AirTempReading;
  httcWBGT: WbgtReading;
  httcAirTemp: AirTempReading;
};

function getRotaSubscriptionKey(rota: RotaNumber) {
  return `${SUBSCRIBED_CHAT_IDS_ROTA_PREFIX}${rota}`;
}

async function getAllSubscribedChatIdsForDate(
  fireDate: Date,
): Promise<string[]> {
  const rotaNumber = getRotaNumberForDate(fireDate);

  const [allWeekdaySubscribers, rotaSubscribers] = await Promise.all([
    redis.smembers(SUBSCRIBED_CHAT_IDS_KEY),
    redis.smembers(getRotaSubscriptionKey(rotaNumber)),
  ]);

  return Array.from(new Set([...allWeekdaySubscribers, ...rotaSubscribers]));
}

async function fetchWeatherReadings(): Promise<WeatherReadings> {
  const [cdaWBGT, cdaAirTemp, httcWBGT, httcAirTemp] = await Promise.all([
    getWGBTFromLatLng(CDA.latitude, CDA.longitude),
    getAirTempFromLatLng(CDA.latitude, CDA.longitude),
    getWGBTFromLatLng(HTTC.latitude, HTTC.longitude),
    getAirTempFromLatLng(HTTC.latitude, HTTC.longitude),
  ]);

  return {
    cdaWBGT,
    cdaAirTemp,
    httcWBGT,
    httcAirTemp,
  };
}

function buildEscapedWeatherReply(
  readings: WeatherReadings,
  options?: {
    jobDate?: Date;
    nextUpdate?: Date;
  },
) {
  const reply = buildWeatherReply(
    {
      heatStress: readings.cdaWBGT.heatStress,
      wbgt: readings.cdaWBGT.wbgt,
      airTemp: readings.cdaAirTemp.value,
      emoji: getWBGTEmoji(readings.cdaWBGT.heatStress),
      dateTime: readings.cdaWBGT.dateTime,
    },
    {
      heatStress: readings.httcWBGT.heatStress,
      wbgt: readings.httcWBGT.wbgt,
      airTemp: readings.httcAirTemp.value,
      emoji: getWBGTEmoji(readings.httcWBGT.heatStress),
      dateTime: readings.httcWBGT.dateTime,
    },
    options,
  );

  return escapeMarkdownV2(reply);
}

async function removeChatFromAllSubscriptions(chatId: number) {
  await Promise.all([
    redis.srem(SUBSCRIBED_CHAT_IDS_KEY, chatId),
    redis.srem(getRotaSubscriptionKey(1), chatId),
    redis.srem(getRotaSubscriptionKey(2), chatId),
    redis.srem(getRotaSubscriptionKey(3), chatId),
  ]);
}

function parseRotaFromCommand(text: string): {
  rota: RotaNumber | null;
  isInvalidFormat: boolean;
} {
  const rotaStr = text.split(' ').slice(1)[0];
  const rota = Number(rotaStr);

  if (!rotaStr || Number.isNaN(rota)) {
    return {
      rota: null,
      isInvalidFormat: true,
    };
  }

  if (![1, 2, 3].includes(rota)) {
    return {
      rota: null,
      isInvalidFormat: false,
    };
  }

  return {
    rota: rota as RotaNumber,
    isInvalidFormat: false,
  };
}

// Cron rule to run every weekday at 09:50, 11:50, 13:50, and 15:50 in Singapore timezone
const rule = new schedule.RecurrenceRule();
rule.dayOfWeek = new schedule.Range(1, 5); // Monday to Friday
rule.hour = [9, 11, 13, 15];
rule.minute = 50;
rule.tz = 'Singapore';

export const job = schedule.scheduleJob(rule, async (fireDate) => {
  try {
    const subscribedChatIds = await getAllSubscribedChatIdsForDate(fireDate);

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

bot.start(async (ctx) => {
  logger.info(
    `Start command called by Chat ID: ${ctx.chat.id}. Next update at ${new Date(job.nextInvocation()).toLocaleString('en-SG', { timeZone: 'Asia/Singapore' })}`,
  );

  const [
    isSubscribedOfficeHours,
    isSubscribedToRota1,
    isSubscribedToRota2,
    isSubscribedToRota3,
  ] = await Promise.all([
    redis.sismember(SUBSCRIBED_CHAT_IDS_KEY, ctx.chat.id),
    redis.sismember(getRotaSubscriptionKey(1), ctx.chat.id),
    redis.sismember(getRotaSubscriptionKey(2), ctx.chat.id),
    redis.sismember(getRotaSubscriptionKey(3), ctx.chat.id),
  ]);

  const hasSubscribedToAnyChat =
    isSubscribedOfficeHours == 1 ||
    isSubscribedToRota1 == 1 ||
    isSubscribedToRota2 == 1 ||
    isSubscribedToRota3 == 1;

  if (hasSubscribedToAnyChat) {
    const msg = buildAlreadySubscribedMessage({
      isSubscribedToRota1,
      isSubscribedToRota2,
      isSubscribedToRota3,
      nextUpdate: new Date(job.nextInvocation()),
    });

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
      Markup.button.callback('Set Rota 1', 'set_rota_1'),
      Markup.button.callback('Set Rota 2', 'set_rota_2'),
      Markup.button.callback('Set Rota 3', 'set_rota_3'),
      Markup.button.callback('Office Hours', 'set_office_hours'),
    ]),
  );

  logger.info('Added Chat ID: ' + ctx.chat.id + ' to subscribed chat IDs.');
});

// handler for set_rota_1, set_rota_2, set_rota_3, and set_office_hours callback buttons
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
  assignRota('office_hours', ctx);
  ctx.editMessageText(buildRotaSetSuccessMessage('office_hours'));
  ctx.answerCbQuery(); // Acknowledge the callback query to remove the loading state
});

async function assignRota(rotaNumber: RotaNumber | 'office_hours', ctx: any) {
  try {
    await removeChatFromAllSubscriptions(ctx.chat.id);
  } catch (err) {
    logger.error(`Failed to remove chat ID from other rota sets: ${err}`);
    ctx.reply(SETROTA_ERROR_MESSAGE);
    return;
  }

  if (rotaNumber === 'office_hours') {
    await redis.sadd(SUBSCRIBED_CHAT_IDS_KEY, ctx.chat.id);
    ctx.reply(
      'You have been subscribed to receive updates every weekday during office hours. You will receive updates on all weekdays without rota differentiation.',
    );
    logger.info(`Set Chat ID: ${ctx.chat.id} to Office Hours subscription.`);
    return;
  }

  await redis.sadd(getRotaSubscriptionKey(rotaNumber), ctx.chat.id);
  ctx.reply(buildRotaSetSuccessMessage(rotaNumber));
  logger.info(`Set Chat ID: ${ctx.chat.id} to Rota ${rotaNumber}.`);
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

bot.help((ctx) => {
  ctx.reply(HELP_MESSAGE);
});
