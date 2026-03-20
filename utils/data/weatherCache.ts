// import redis from '../infra/redis';
import { tz } from '@date-fns/tz';
import { formatISO } from 'date-fns';
import { Redis } from '../../api/redis.api';
import { Weather } from '../../api/weather.api';

export namespace Cache {
  const CACHE_KEY_PREFIX = 'weather';

  export async function getCachedWeatherData(
    cacheKey: string,
  ): Promise<Weather.Types.WeatherReadings | null> {
    const cachedData = await Redis.getRedisClient().get(cacheKey);
    if (cachedData) {
      return JSON.parse(cachedData);
    }
    return null;
  }

  export async function setCachedWeatherData(
    cacheKey: string,
    data: Weather.Types.WeatherReadings,
  ): Promise<void> {
    await Redis.getRedisClient().set(
      cacheKey,
      JSON.stringify(data),
      'EX',
      getNextTTLForCurrentQuarterHour(3 * 60),
    );
  }

  // Get nearest quarter hour TTL. For example, if it's 9:50, the TTL should be 15 minutes (until 10:00). If it's 9:10, the TTL should be 5 minutes (until 9:15).
  // Also add bufferSecs to account for the time taken to fetch and cache the data, so that it doesn't expire before the next request comes in.
  export function getNextTTLForCurrentQuarterHour(bufferSecs: number): number {
    const now = new Date();
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();
    const totalSeconds = minutes * 60 + seconds;
    const nextQuarterHourInSeconds =
      Math.ceil(totalSeconds / (15 * 60)) * (15 * 60);
    const ttl = nextQuarterHourInSeconds - totalSeconds + bufferSecs;
    return ttl;
  }

  export function getQuarterHourTimestamp(date: Date): string {
    const minutes = date.getMinutes();
    const quarterHour = Math.floor(minutes / 15) * 15;
    date.setMinutes(quarterHour, 0, 0);
    return formatISO(date, { in: tz('Asia/Singapore') });
  }

  export function getCacheKeyForCurrentQuarterHour(): string {
    const now = new Date();
    const quarterHourTimestamp = getQuarterHourTimestamp(now);
    return `${CACHE_KEY_PREFIX}:snapshot:${quarterHourTimestamp}`;
  }
}
