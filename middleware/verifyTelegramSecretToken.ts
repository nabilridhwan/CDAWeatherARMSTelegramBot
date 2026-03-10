import type { NextFunction, Request, Response } from 'express';
import { env } from '../utils/infra/env';
import logger from '../utils/infra/logger';

export function verifyTelegramSecretToken(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const token = req.get('X-Telegram-Bot-Api-Secret-Token');

  if (token !== env.SECRET_TOKEN) {
    logger.error('Unauthorized access attempt detected from IP:', req.ip);
    res.sendStatus(403);
    return;
  }

  next();
}
