import Redis from 'ioredis';

export const redisConnectionOptions = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  family: 6,
  maxRetriesPerRequest: null,
};

const redis = new Redis(redisConnectionOptions);

export default redis;
