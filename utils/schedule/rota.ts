import { rule } from '../../bot';

export namespace Rota {
  export type RotaNumber = 1 | 2 | 3;
  export type WorkingSchedule = RotaNumber | 'office_hours';

  const environment = process.env.NODE_ENV == 'production' ? 'prod' : 'dev';

  export const REDIS_KEY_OFFICE_HOURS_CHAT_IDS =
    `${environment}:chat_ids:office_hours` as const;
  export const REDIS_KEY_ROTA_CHAT_IDS_PREFIX =
    `${environment}:chat_ids:rota_` as const;

  export type ChatIDRedisKey =
    | `prod:chat_ids:rota_${Rota.RotaNumber}`
    | `prod:chat_ids:office_hours`
    | `dev:chat_ids:rota_${Rota.RotaNumber}`
    | `dev:chat_ids:office_hours`;

  export function getRedisKeyForRota(rota: RotaNumber): ChatIDRedisKey {
    return `${REDIS_KEY_ROTA_CHAT_IDS_PREFIX}${rota}`;
  }

  export function getNextUpdateDateForRota(
    rota: WorkingSchedule,
    fromDate: Date = new Date(),
  ): Date | null {
    let cursor = fromDate;

    for (let attempt = 0; attempt < 200; attempt++) {
      const nextInvocation = rule.nextInvocationDate(cursor);

      if (!nextInvocation) {
        return null;
      }

      const nextDate = nextInvocation;

      if (rota === 'office_hours' || getRotaNumberForDate(nextDate) === rota) {
        return nextDate;
      }

      cursor = new Date(nextDate.getTime() + 60_000);
    }

    return null;
  }

  export function getRotaNumberForDate(
    inputDate: Date = new Date(),
  ): 1 | 2 | 3 {
    // Reference date for Rota 3
    const referenceDate = new Date('2025-10-06T00:00:00+08:00');

    // Cycle order array maps index to rota number (Day 0 = Rota 3)
    const rotaCycle: (1 | 2 | 3)[] = [3, 2, 1];

    // Calculate difference in milliseconds
    const diffTime = inputDate.getTime() - referenceDate.getTime();

    // Calculate day difference
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    // Get modulo index handling negatives
    const idx = ((diffDays % 3) + 3) % 3;

    return rotaCycle[idx];
  }
}
