import { beforeEach, describe, expect, it, vi } from 'vitest';
import { rule } from '../../bot';
import getNextUpdateDateForRota from '../../utils/schedule/getNextUpdateDateForRota';
import getRotaNumberForDate from '../../utils/schedule/getRotaNumber';

vi.mock('../../bot', () => ({
  rule: {
    nextInvocationDate: vi.fn(),
  },
}));

vi.mock('../../utils/schedule/getRotaNumber', () => ({
  default: vi.fn(),
}));

describe('getNextUpdateDateForRota', () => {
  const mockedNextInvocationDate = vi.mocked(rule.nextInvocationDate);
  const mockedGetRotaNumberForDate = vi.mocked(getRotaNumberForDate);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns first next invocation for office hours', () => {
    const fromDate = new Date('2026-03-05T08:00:00+08:00');
    const firstInvocation = new Date('2026-03-05T09:50:00+08:00');

    mockedNextInvocationDate.mockReturnValueOnce(firstInvocation);

    const result = getNextUpdateDateForRota('office_hours', fromDate);

    expect(result).toEqual(firstInvocation);
    expect(mockedNextInvocationDate).toHaveBeenCalledWith(fromDate);
    expect(mockedGetRotaNumberForDate).not.toHaveBeenCalled();
  });

  it('skips non-matching rota and returns first matching invocation', () => {
    const fromDate = new Date('2026-03-05T16:00:00+08:00');
    const firstInvocation = new Date('2026-03-06T09:50:00+08:00');
    const secondInvocation = new Date('2026-03-11T09:50:00+08:00');

    mockedNextInvocationDate
      .mockReturnValueOnce(firstInvocation)
      .mockReturnValueOnce(secondInvocation);

    mockedGetRotaNumberForDate.mockReturnValueOnce(2).mockReturnValueOnce(3);

    const result = getNextUpdateDateForRota(3, fromDate);

    expect(result).toEqual(secondInvocation);
    expect(mockedNextInvocationDate).toHaveBeenNthCalledWith(1, fromDate);
    expect(mockedNextInvocationDate).toHaveBeenNthCalledWith(
      2,
      new Date(firstInvocation.getTime() + 60_000),
    );
    expect(mockedGetRotaNumberForDate).toHaveBeenCalledTimes(2);
  });

  it('returns null when no next invocation exists', () => {
    const fromDate = new Date('2026-03-05T08:00:00+08:00');

    mockedNextInvocationDate.mockReturnValueOnce(null as never);

    const result = getNextUpdateDateForRota(1, fromDate);

    expect(result).toBeNull();
    expect(mockedGetRotaNumberForDate).not.toHaveBeenCalled();
  });
});
