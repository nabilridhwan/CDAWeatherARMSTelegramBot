import schedule from 'node-schedule';
import { Telegraf } from 'telegraf';
import { getAirTempFromLatLng, getWGBTFromLatLng } from '../api/weather';
import getRotaNumberForDate from './getRotaNumber';
import getWBGTEmoji from './getWBGTEmoji';
import { CDA, HTTC } from './locations';
import logger from './logger';
import redis from './redis';
import {
  buildAlreadySubscribedMessage,
  buildRotaSetSuccessMessage,
  buildWeatherReply,
  escapeMarkdownV2,
  HELP_MESSAGE,
  INVALID_ROTA_MESSAGE,
  INVALID_ROTA_RANGE_MESSAGE,
  LOADING_MESSAGE,
  SETROTA_ERROR_MESSAGE,
  STOP_SUCCESS_MESSAGE,
  WEATHER_FETCH_FAILED_MESSAGE,
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
          .catch(() => {
            return bot.telegram.sendMessage(
              chatId,
              WEATHER_FETCH_FAILED_MESSAGE,
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
    loadingMessage,
    isChatSubscribed,
    isSubscribedToRota1,
    isSubscribedToRota2,
    isSubscribedToRota3,
  ] = await Promise.all([
    ctx.reply(LOADING_MESSAGE),
    redis.sismember(SUBSCRIBED_CHAT_IDS_KEY, ctx.chat.id),
    redis.sismember(getRotaSubscriptionKey(1), ctx.chat.id),
    redis.sismember(getRotaSubscriptionKey(2), ctx.chat.id),
    redis.sismember(getRotaSubscriptionKey(3), ctx.chat.id),
  ]);

  const hasSubscribedToAnyChat =
    isChatSubscribed == 1 ||
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

    ctx.telegram.editMessageText(
      ctx.chat.id,
      loadingMessage.message_id,
      undefined,
      msg,
    );

    logger.info(
      'Chat ID: ' + ctx.chat.id + ' is already subscribed. No action taken.',
    );
    return;
  }

  await redis.sadd(SUBSCRIBED_CHAT_IDS_KEY, ctx.chat.id);

  ctx.telegram.editMessageText(
    ctx.chat.id,
    loadingMessage.message_id,
    undefined,
    WELCOME_SUBSCRIBED_MESSAGE,
  );

  logger.info('Added Chat ID: ' + ctx.chat.id + ' to subscribed chat IDs.');
});

bot.command('setrota', async (ctx) => {
  const { rota, isInvalidFormat } = parseRotaFromCommand(ctx.message.text);
  if (!rota) {
    ctx.reply(
      isInvalidFormat ? INVALID_ROTA_MESSAGE : INVALID_ROTA_RANGE_MESSAGE,
    );
    return;
  }

  try {
    await removeChatFromAllSubscriptions(ctx.chat.id);
  } catch (err) {
    logger.error(`Failed to remove chat ID from other rota sets: ${err}`);
    ctx.reply(SETROTA_ERROR_MESSAGE);
    return;
  }

  await redis.sadd(getRotaSubscriptionKey(rota), ctx.chat.id);
  ctx.reply(buildRotaSetSuccessMessage(rota));
  logger.info(`Set Chat ID: ${ctx.chat.id} to Rota ${rota}.`);
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
      WEATHER_FETCH_FAILED_MESSAGE,
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
