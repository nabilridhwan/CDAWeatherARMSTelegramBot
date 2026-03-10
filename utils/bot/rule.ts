import schedule from 'node-schedule';

// Cron rule to run every weekday at 09:50, 11:50, 13:50, and 15:50 in Singapore timezone
export const rule = new schedule.RecurrenceRule();
rule.dayOfWeek = new schedule.Range(1, 5); // Monday to Friday
rule.hour = [9, 11, 13, 15];
rule.minute = 50;
rule.tz = 'Singapore';
