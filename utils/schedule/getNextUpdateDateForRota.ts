import { rule } from '../../bot';
import { WorkingSchedule } from '../bot/subscriptions';
import getRotaNumberForDate from './getRotaNumber';

export default function getNextUpdateDateForRota(
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
