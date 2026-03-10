import { afterEach, describe, expect, it, vi } from 'vitest';
import { Rota } from '../../utils/schedule/rota';

vi.mock('../../bot', () => ({
  rule: {
    nextInvocationDate: vi.fn(),
  },
  job: {
    nextInvocation: vi.fn(() => new Date('2026-03-10T09:50:00+08:00')),
  },
}));

describe('getRotaNumberForDate', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns rota 3 on the reference date', () => {
    const result = Rota.getRotaNumberForDate(
      new Date('2025-10-06T00:00:00+08:00'),
    );
    expect(result).toBe(3);
  });

  it('cycles forward every day as 3 -> 2 -> 1 -> 3', () => {
    expect(
      Rota.getRotaNumberForDate(new Date('2025-10-07T00:00:00+08:00')),
    ).toBe(2);
    expect(
      Rota.getRotaNumberForDate(new Date('2025-10-08T00:00:00+08:00')),
    ).toBe(1);
    expect(
      Rota.getRotaNumberForDate(new Date('2025-10-09T00:00:00+08:00')),
    ).toBe(3);
  });

  it('cycles backward correctly for dates before reference', () => {
    expect(
      Rota.getRotaNumberForDate(new Date('2025-10-05T00:00:00+08:00')),
    ).toBe(1);
    expect(
      Rota.getRotaNumberForDate(new Date('2025-10-04T00:00:00+08:00')),
    ).toBe(2);
    expect(
      Rota.getRotaNumberForDate(new Date('2025-10-03T00:00:00+08:00')),
    ).toBe(3);
  });

  it('uses current date when no argument is passed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-10-07T00:00:00+08:00'));

    expect(Rota.getRotaNumberForDate()).toBe(2);
  });
});
