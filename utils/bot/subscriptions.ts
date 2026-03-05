import { getAirTempFromLatLng, getWGBTFromLatLng } from '../../api/weather';
import logger from '../infra/logger';
import redis from '../infra/redis';
import getRotaNumberForDate from '../schedule/getRotaNumber';
import getWBGTEmoji from '../weather/getWBGTEmoji';
import { CDA, HTTC } from '../weather/locations';
import { buildWeatherReply, escapeMarkdownV2 } from './replies';

const environment = process.env.NODE_ENV == 'production' ? 'prod' : 'dev';

const REDIS_KEY_OFFICE_HOURS_CHAT_IDS =
  `${environment}:chat_ids:office_hours` as const;
const REDIS_KEY_ROTA_CHAT_IDS_PREFIX = `${environment}:chat_ids:rota_` as const;

type ChatIDRedisKey =
  | `prod:chat_ids:rota_${RotaNumber}`
  | `prod:chat_ids:office_hours`
  | `dev:chat_ids:rota_${RotaNumber}`
  | `dev:chat_ids:office_hours`;

export type RotaNumber = 1 | 2 | 3;
export type WorkingSchedule = RotaNumber | 'office_hours';
type WbgtReading = Awaited<ReturnType<typeof getWGBTFromLatLng>>;
type AirTempReading = Awaited<ReturnType<typeof getAirTempFromLatLng>>;

type WeatherReadings = {
  cdaWBGT: WbgtReading;
  cdaAirTemp: AirTempReading;
  httcWBGT: WbgtReading;
  httcAirTemp: AirTempReading;
};

function getRotaSubscriptionKey(rota: RotaNumber): ChatIDRedisKey {
  return `${REDIS_KEY_ROTA_CHAT_IDS_PREFIX}${rota}`;
}

export async function getAllSubscribedChatIdsForDate(
  fireDate: Date,
): Promise<string[]> {
  const rotaNumber = getRotaNumberForDate(fireDate);

  const [allWeekdaySubscribers, rotaSubscribers] = await Promise.all([
    redis.smembers(REDIS_KEY_OFFICE_HOURS_CHAT_IDS),
    redis.smembers(getRotaSubscriptionKey(rotaNumber)),
  ]);

  return Array.from(new Set([...allWeekdaySubscribers, ...rotaSubscribers]));
}

export async function fetchWeatherReadings(): Promise<WeatherReadings> {
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

export function buildEscapedWeatherReply(
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

export async function getSubscribedChatIdsForDate(
  fireDate: Date,
): Promise<string[]> {
  const rotaNumber = getRotaNumberForDate(fireDate);

  const [allWeekdaySubscribers, rotaSubscribers] = await Promise.all([
    redis.smembers(REDIS_KEY_OFFICE_HOURS_CHAT_IDS),
    redis.smembers(getRotaSubscriptionKey(rotaNumber)),
  ]);

  return Array.from(new Set([...allWeekdaySubscribers, ...rotaSubscribers]));
}

export async function getChatSubscriptionRota(
  chatId: number,
): Promise<WorkingSchedule | null> {
  const [
    isSubscribedOfficeHours,
    isSubscribedToRota1,
    isSubscribedToRota2,
    isSubscribedToRota3,
  ] = await Promise.all([
    redis.sismember(REDIS_KEY_OFFICE_HOURS_CHAT_IDS, chatId),
    redis.sismember(getRotaSubscriptionKey(1), chatId),
    redis.sismember(getRotaSubscriptionKey(2), chatId),
    redis.sismember(getRotaSubscriptionKey(3), chatId),
  ]);

  if (isSubscribedOfficeHours == 1) {
    return 'office_hours';
  }

  if (isSubscribedToRota1 == 1) {
    return 1;
  }

  if (isSubscribedToRota2 == 1) {
    return 2;
  }

  if (isSubscribedToRota3 == 1) {
    return 3;
  }

  return null;
}

export async function removeChatFromAllSubscriptions(chatId: number) {
  await Promise.all([
    redis.srem(REDIS_KEY_OFFICE_HOURS_CHAT_IDS, chatId),
    redis.srem(getRotaSubscriptionKey(1), chatId),
    redis.srem(getRotaSubscriptionKey(2), chatId),
    redis.srem(getRotaSubscriptionKey(3), chatId),
  ]);
}

export async function setRotaSubscription(
  chatId: number,
  rotaNumber: WorkingSchedule,
): Promise<void> {
  await removeChatFromAllSubscriptions(chatId);

  if (rotaNumber === 'office_hours') {
    await redis.sadd(REDIS_KEY_OFFICE_HOURS_CHAT_IDS, chatId);
    logger.info(`Set Chat ID: ${chatId} to Office Hours subscription.`);
    return;
  }

  await redis.sadd(getRotaSubscriptionKey(rotaNumber), chatId);
  logger.info(`Set Chat ID: ${chatId} to Rota ${rotaNumber}.`);
}
