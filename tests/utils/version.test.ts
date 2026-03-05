import { describe, expect, it } from 'vitest';
import { generateVersionInfoMessage } from '../../utils/infra/version';

describe('generateVersionInfoMessage', () => {
  it('returns version from package.json', () => {
    expect(generateVersionInfoMessage()).toMatch(/^Version: \d+\.\d+\.\d+/);
  });
});
