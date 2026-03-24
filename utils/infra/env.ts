import { createEnv } from '@t3-oss/env-core';
import { configDotenv } from 'dotenv';
import { z } from 'zod';
import { ensureSecretToken } from '../security/generateSecretToken';

configDotenv();

export const env = createEnv({
  server: {
    BOT_ID: z.string(),
    DATA_GOV_API_KEY: z.string(),
    REDIS_HOST: z.string(),
    REDIS_PORT: z.coerce.number(),
    REDIS_PASSWORD: z.string(),
    HOST: z.string(),
    PORT: z.coerce.number().default(8080),
    SECRET_TOKEN: z.string().default(ensureSecretToken()),
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    OWNER_USER_ID: z.string(),
  },
  runtimeEnvStrict: {
    BOT_ID: process.env.BOT_ID,
    DATA_GOV_API_KEY: process.env.DATA_GOV_API_KEY,
    REDIS_HOST: process.env.REDIS_HOST,
    REDIS_PORT: process.env.REDIS_PORT,
    REDIS_PASSWORD: process.env.REDIS_PASSWORD,
    HOST: process.env.HOST,
    PORT: process.env.PORT,
    SECRET_TOKEN: process.env.SECRET_TOKEN,
    NODE_ENV: process.env.NODE_ENV,
    OWNER_USER_ID: process.env.OWNER_USER_ID,
  },
  emptyStringAsUndefined: true,
});
