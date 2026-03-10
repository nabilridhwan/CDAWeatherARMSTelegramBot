import RedisClient from 'ioredis';
import { env } from '../utils/infra/env';
import logger from '../utils/infra/logger';
import { Rota } from '../utils/schedule/rota';

export namespace Redis {
  const environment = env.NODE_ENV === 'production' ? 'prod' : 'dev';
  const WEATHER_JOB_LOCK_KEY_PREFIX = `${environment}:locks:weather_job`;
  const RELEASE_LOCK_SCRIPT = `
    if redis.call("GET", KEYS[1]) == ARGV[1] then
      return redis.call("DEL", KEYS[1])
    else
      return 0
    end
  `;

  export const redisConnectionOptions = {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD,
    family: 6,
    maxRetriesPerRequest: null,
  };

  let redisClient: RedisClient | null = null;

  export function getRedisClient(): RedisClient {
    if (!redisClient) {
      redisClient = new RedisClient(redisConnectionOptions);
    }

    return redisClient;
  }

  export async function testConnection(): Promise<void> {
    try {
      const redis = getRedisClient();
      await redis.ping();
      console.log('Successfully connected to Redis');
    } catch (error) {
      console.error('Failed to connect to Redis:', error);
      throw error;
    }
  }

  export function getWeatherJobLockKey(fireDate: Date): string {
    const minuteSlot = Math.floor(fireDate.getTime() / 60_000);
    return `${WEATHER_JOB_LOCK_KEY_PREFIX}:${minuteSlot}`;
  }

  export async function acquireDistributedLock(
    lockKey: string,
    lockValue: string,
    ttlSeconds: number,
  ): Promise<boolean> {
    const redis = getRedisClient();
    const lockResult = await redis.set(
      lockKey,
      lockValue,
      'EX',
      ttlSeconds,
      'NX',
    );

    return lockResult === 'OK';
  }

  export async function releaseDistributedLock(
    lockKey: string,
    lockValue: string,
  ): Promise<boolean> {
    const redis = getRedisClient();
    const result = await redis.eval(RELEASE_LOCK_SCRIPT, 1, lockKey, lockValue);
    return result === 1;
  }

  export async function assignRota(rotaNumber: Rota.WorkingSchedule, ctx: any) {
    try {
      await Redis.setRotaSubscription(ctx.chat.id, rotaNumber);
    } catch (err) {
      logger.error(`Failed to set rota subscription: ${err}`);
    }
  }

  export async function getSubscribedChatIdsForDate(
    fireDate: Date,
  ): Promise<string[]> {
    const redis = getRedisClient();
    const rotaNumber = Rota.getRotaNumberForDate(fireDate);

    const [allWeekdaySubscribers, rotaSubscribers] = await Promise.all([
      redis.smembers(Rota.REDIS_KEY_OFFICE_HOURS_CHAT_IDS),
      redis.smembers(Rota.getRedisKeyForRota(rotaNumber)),
    ]);

    return Array.from(new Set([...allWeekdaySubscribers, ...rotaSubscribers]));
  }

  export async function removeChatFromAllSubscriptions(chatId: number) {
    const redis = getRedisClient();
    await Promise.all([
      redis.srem(Rota.REDIS_KEY_OFFICE_HOURS_CHAT_IDS, chatId),
      redis.srem(Rota.getRedisKeyForRota(1), chatId),
      redis.srem(Rota.getRedisKeyForRota(2), chatId),
      redis.srem(Rota.getRedisKeyForRota(3), chatId),
    ]);
  }

  export async function setRotaSubscription(
    chatId: number,
    rotaNumber: Rota.WorkingSchedule,
  ): Promise<void> {
    const redis = getRedisClient();
    await removeChatFromAllSubscriptions(chatId);

    if (rotaNumber === 'office_hours') {
      await redis.sadd(Rota.REDIS_KEY_OFFICE_HOURS_CHAT_IDS, chatId);
      logger.info(`Set Chat ID: ${chatId} to Office Hours subscription.`);
      return;
    }

    await redis.sadd(Rota.getRedisKeyForRota(rotaNumber), chatId);
    logger.info(`Set Chat ID: ${chatId} to Rota ${rotaNumber}.`);
  }

  export async function getChatSubscriptionRota(
    chatId: number,
  ): Promise<Rota.WorkingSchedule | null> {
    const redis = getRedisClient();
    const [
      isSubscribedOfficeHours,
      isSubscribedToRota1,
      isSubscribedToRota2,
      isSubscribedToRota3,
    ] = await Promise.all([
      redis.sismember(Rota.REDIS_KEY_OFFICE_HOURS_CHAT_IDS, chatId),
      redis.sismember(Rota.getRedisKeyForRota(1), chatId),
      redis.sismember(Rota.getRedisKeyForRota(2), chatId),
      redis.sismember(Rota.getRedisKeyForRota(3), chatId),
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
}
