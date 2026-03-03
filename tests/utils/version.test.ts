import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildSettingsMessage,
  getBotVersionInfo,
} from '../../utils/infra/version';

describe('version helpers', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('uses custom version env when provided', () => {
    vi.stubEnv('BOT_VERSION', '2026.03.03');

    expect(getBotVersionInfo()).toEqual({
      value: '2026.03.03',
      source: 'custom-env',
    });
  });

  it('falls back to commit env and shortens sha', () => {
    vi.stubEnv('GIT_COMMIT_SHA', 'abc1234567890');

    expect(getBotVersionInfo()).toEqual({
      value: 'abc1234',
      source: 'commit-env',
    });
  });

  it('falls back to local git commit when no env version exists', () => {
    expect(
      getBotVersionInfo({
        getGitCommit: () => 'deafbee',
      }),
    ).toEqual({
      value: 'deafbee',
      source: 'git',
    });
  });

  it('falls back to npm package version when git commit is unavailable', () => {
    vi.stubEnv('npm_package_version', '1.2.3');

    expect(
      getBotVersionInfo({
        getGitCommit: () => null,
      }),
    ).toEqual({
      value: '1.2.3',
      source: 'package-env',
    });
  });

  it('builds settings message with version and source', () => {
    vi.stubEnv('BOT_VERSION', 'release-42');

    expect(buildSettingsMessage()).toBe(
      'Current bot version: release-42\nVersion source: custom-env',
    );
  });
});
