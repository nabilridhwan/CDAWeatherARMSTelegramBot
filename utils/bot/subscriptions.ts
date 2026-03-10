import { getAirTempFromLatLng, getWGBTFromLatLng } from '../../api/weather';
import redis from '../infra/redis';
import { Rota } from '../schedule/rota';
import getWBGTEmoji from '../weather/getWBGTEmoji';
import { CDA, HTTC } from '../weather/locations';
import { buildWeatherReply, escapeMarkdownV2 } from './replies';

type WbgtReading = Awaited<ReturnType<typeof getWGBTFromLatLng>>;
type AirTempReading = Awaited<ReturnType<typeof getAirTempFromLatLng>>;

type WeatherReadings = {
  cdaWBGT: WbgtReading;
  cdaAirTemp: AirTempReading;
  httcWBGT: WbgtReading;
  httcAirTemp: AirTempReading;
};

export async function getAllSubscribedChatIdsForDate(
  fireDate: Date,
): Promise<string[]> {
  const rotaNumber = Rota.getRotaNumberForDate(fireDate);

  const [allWeekdaySubscribers, rotaSubscribers] = await Promise.all([
    redis.smembers(Rota.REDIS_KEY_OFFICE_HOURS_CHAT_IDS),
    redis.smembers(Rota.getRedisKeyForRota(rotaNumber)),
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
