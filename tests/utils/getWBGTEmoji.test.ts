import { describe, expect, it } from 'vitest';
import getWBGTEmoji from '../../utils/weather/getWBGTEmoji';

describe('getWBGTEmoji', () => {
  it('returns green for low heat stress', () => {
    expect(getWBGTEmoji('Low')).toBe('🟢');
  });

  it('returns yellow for moderate heat stress', () => {
    expect(getWBGTEmoji('Moderate')).toBe('🟡');
  });

  it('returns red for high heat stress variants', () => {
    expect(getWBGTEmoji('High')).toBe('🔴');
    expect(getWBGTEmoji('Very High')).toBe('🔴');
  });

  it('returns white for unknown values', () => {
    expect(getWBGTEmoji('Unknown')).toBe('⚪');
  });
});
