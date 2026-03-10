import { beforeEach, describe, expect, it, vi } from 'vitest';
import { rule } from '../../utils/bot/rule';
import { Rota } from '../../utils/schedule/rota';

vi.mock('../../bot', () => ({
  rule: {
    nextInvocationDate: vi.fn(),
  },
}));

describe('getNextUpdateDateForRota', () => {
  const mockedNextInvocationDate = vi.mocked(rule.nextInvocationDate);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns first next invocation for office hours', () => {
    const fromDate = new Date('2026-03-05T08:00:00+08:00');
    const firstInvocation = new Date('2026-03-05T09:50:00+08:00');

    mockedNextInvocationDate.mockReturnValueOnce(firstInvocation);

    const result = Rota.getNextUpdateDateForRota('office_hours', fromDate);

    expect(result).toEqual(firstInvocation);
    expect(mockedNextInvocationDate).toHaveBeenCalledWith(fromDate);
  });

  it('skips non-matching rota and returns first matching invocation', () => {
    const fromDate = new Date('2026-03-05T16:00:00+08:00');
    const firstInvocation = new Date('2026-03-06T09:50:00+08:00');
    const secondInvocation = new Date('2026-03-11T09:50:00+08:00');

    mockedNextInvocationDate
      .mockReturnValueOnce(firstInvocation)
      .mockReturnValueOnce(secondInvocation);

    const result = Rota.getNextUpdateDateForRota(3, fromDate);

    expect(result).toEqual(secondInvocation);
    expect(mockedNextInvocationDate).toHaveBeenNthCalledWith(1, fromDate);
    expect(mockedNextInvocationDate).toHaveBeenNthCalledWith(
      2,
      new Date(firstInvocation.getTime() + 60_000),
    );
  });

  it('returns null when no next invocation exists', () => {
    const fromDate = new Date('2026-03-05T08:00:00+08:00');

    mockedNextInvocationDate.mockReturnValueOnce(null as never);

    const result = Rota.getNextUpdateDateForRota(1, fromDate);

    expect(result).toBeNull();
  });
});
