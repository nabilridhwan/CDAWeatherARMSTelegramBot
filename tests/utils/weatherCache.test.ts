import { afterEach, describe, expect, it, vi } from 'vitest';
import { Cache } from '../../utils/data/weatherCache';

describe('weather cache time logic', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns TTL to next quarter hour plus 3 minute buffer at 08:50', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-20T08:50:00+08:00'));

    const ttl = Cache.getNextTTLForCurrentQuarterHour(3 * 60);

    // 08:50 -> 09:00 is 10 minutes, plus 3 minute buffer = 13 minutes.
    expect(ttl).toBe(13 * 60);
  });

  it('returns 08:45 quarter hour timestamp for 08:50', () => {
    const quarterHour = Cache.getQuarterHourTimestamp(
      new Date('2026-03-20T08:50:00+08:00'),
    );

    expect(quarterHour).toBe('2026-03-20T08:45:00+08:00');
  });

  it('returns 08:30 quarter hour timestamp for 08:44', () => {
    const quarterHour = Cache.getQuarterHourTimestamp(
      new Date('2026-03-20T08:44:00+08:00'),
    );

    expect(quarterHour).toBe('2026-03-20T08:30:00+08:00');
  });

  it('returns 08:45 quarter hour timestamp for 08:46', () => {
    const quarterHour = Cache.getQuarterHourTimestamp(
      new Date('2026-03-20T08:46:00+08:00'),
    );

    expect(quarterHour).toBe('2026-03-20T08:45:00+08:00');
  });

  it('keeps exact quarter boundaries unchanged', () => {
    expect(
      Cache.getQuarterHourTimestamp(new Date('2026-03-20T08:00:00+08:00')),
    ).toBe('2026-03-20T08:00:00+08:00');
    expect(
      Cache.getQuarterHourTimestamp(new Date('2026-03-20T08:15:00+08:00')),
    ).toBe('2026-03-20T08:15:00+08:00');
    expect(
      Cache.getQuarterHourTimestamp(new Date('2026-03-20T08:30:00+08:00')),
    ).toBe('2026-03-20T08:30:00+08:00');
    expect(
      Cache.getQuarterHourTimestamp(new Date('2026-03-20T08:45:00+08:00')),
    ).toBe('2026-03-20T08:45:00+08:00');
  });

  it('floors to previous quarter just before each boundary', () => {
    expect(
      Cache.getQuarterHourTimestamp(new Date('2026-03-20T08:14:59+08:00')),
    ).toBe('2026-03-20T08:00:00+08:00');
    expect(
      Cache.getQuarterHourTimestamp(new Date('2026-03-20T08:29:59+08:00')),
    ).toBe('2026-03-20T08:15:00+08:00');
    expect(
      Cache.getQuarterHourTimestamp(new Date('2026-03-20T08:44:59+08:00')),
    ).toBe('2026-03-20T08:30:00+08:00');
    expect(
      Cache.getQuarterHourTimestamp(new Date('2026-03-20T08:59:59+08:00')),
    ).toBe('2026-03-20T08:45:00+08:00');
  });

  it('handles midnight and day rollover correctly for quarter hour timestamp', () => {
    expect(
      Cache.getQuarterHourTimestamp(new Date('2026-03-20T00:00:00+08:00')),
    ).toBe('2026-03-20T00:00:00+08:00');
    expect(
      Cache.getQuarterHourTimestamp(new Date('2026-03-20T00:00:01+08:00')),
    ).toBe('2026-03-20T00:00:00+08:00');
    expect(
      Cache.getQuarterHourTimestamp(new Date('2026-03-20T23:59:59+08:00')),
    ).toBe('2026-03-20T23:45:00+08:00');
  });

  it('returns exactly buffer seconds on exact quarter boundary', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-20T09:00:00+08:00'));

    const ttl = Cache.getNextTTLForCurrentQuarterHour(3 * 60);

    expect(ttl).toBe(3 * 60);
  });

  it('rolls over to next day quarter correctly near midnight', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-20T23:59:59+08:00'));

    const ttl = Cache.getNextTTLForCurrentQuarterHour(3 * 60);

    // 1 second to next day 00:00:00, plus 3 minute buffer.
    expect(ttl).toBe(181);
  });

  it('builds cache key with current quarter hour timestamp', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-20T08:46:01+08:00'));

    const key = Cache.getCacheKeyForCurrentQuarterHour();

    expect(key).toBe('weather:snapshot:2026-03-20T08:45:00+08:00');
  });
});
