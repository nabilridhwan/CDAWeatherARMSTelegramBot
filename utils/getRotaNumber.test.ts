import { afterEach, describe, expect, it, vi } from 'vitest';
import getRotaNumberForDate from './getRotaNumber';

describe('getRotaNumberForDate', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns rota 3 on the reference date', () => {
    const result = getRotaNumberForDate(new Date('2025-10-06T00:00:00+08:00'));
    expect(result).toBe(3);
  });

  it('cycles forward every day as 3 -> 2 -> 1 -> 3', () => {
    expect(getRotaNumberForDate(new Date('2025-10-07T00:00:00+08:00'))).toBe(2);
    expect(getRotaNumberForDate(new Date('2025-10-08T00:00:00+08:00'))).toBe(1);
    expect(getRotaNumberForDate(new Date('2025-10-09T00:00:00+08:00'))).toBe(3);
  });

  it('cycles backward correctly for dates before reference', () => {
    expect(getRotaNumberForDate(new Date('2025-10-05T00:00:00+08:00'))).toBe(1);
    expect(getRotaNumberForDate(new Date('2025-10-04T00:00:00+08:00'))).toBe(2);
    expect(getRotaNumberForDate(new Date('2025-10-03T00:00:00+08:00'))).toBe(3);
  });

  it('uses current date when no argument is passed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-10-07T00:00:00+08:00'));

    expect(getRotaNumberForDate()).toBe(2);
  });
});
