import { configDotenv } from 'dotenv';

configDotenv();

export const env = {
  get BOT_ID(): string {
    return process.env.BOT_ID ?? '';
  },

  get DATA_GOV_API_KEY(): string {
    return process.env.DATA_GOV_API_KEY ?? '';
  },

  get REDIS_HOST(): string {
    return process.env.REDIS_HOST ?? 'localhost';
  },

  get REDIS_PORT(): number {
    return parseInt(process.env.REDIS_PORT ?? '6379', 10);
  },

  get REDIS_PASSWORD(): string | undefined {
    return process.env.REDIS_PASSWORD || undefined;
  },

  get HOST(): string {
    return process.env.HOST ?? 'http://localhost:8080';
  },

  get PORT(): number {
    return parseInt(process.env.PORT ?? '8080', 10);
  },

  get SECRET_TOKEN(): string {
    return process.env.SECRET_TOKEN ?? '';
  },

  get NODE_ENV(): string {
    return process.env.NODE_ENV ?? 'development';
  },
};
