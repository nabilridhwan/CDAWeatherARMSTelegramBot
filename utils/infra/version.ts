import { execSync } from 'node:child_process';

type VersionSource =
  | 'custom-env'
  | 'commit-env'
  | 'git'
  | 'package-env'
  | 'unknown';

export type BotVersionInfo = {
  value: string;
  source: VersionSource;
};

type VersionResolverDependencies = {
  getGitCommit?: () => string | null;
};

const CUSTOM_VERSION_ENV_KEYS = ['BOT_VERSION', 'APP_VERSION', 'VERSION'];
const COMMIT_ENV_KEYS = [
  'GIT_COMMIT_SHA',
  'COMMIT_SHA',
  'SOURCE_VERSION',
  'VERCEL_GIT_COMMIT_SHA',
  'RAILWAY_GIT_COMMIT_SHA',
  'HEROKU_SLUG_COMMIT',
];

function getFirstNonEmptyEnvValue(keys: string[]): string | null {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
  }

  return null;
}

function shortenCommit(value: string): string {
  return /^[0-9a-f]{8,}$/i.test(value) ? value.slice(0, 7) : value;
}

function getGitCommitFromRepo(): string | null {
  try {
    const commit = execSync('git rev-parse --short HEAD', {
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    }).trim();

    return commit || null;
  } catch {
    return null;
  }
}

export function getBotVersionInfo(
  dependencies?: VersionResolverDependencies,
): BotVersionInfo {
  const customVersion = getFirstNonEmptyEnvValue(CUSTOM_VERSION_ENV_KEYS);
  if (customVersion) {
    return {
      value: customVersion,
      source: 'custom-env',
    };
  }

  const commitFromEnv = getFirstNonEmptyEnvValue(COMMIT_ENV_KEYS);
  if (commitFromEnv) {
    return {
      value: shortenCommit(commitFromEnv),
      source: 'commit-env',
    };
  }

  const commitFromGit =
    dependencies?.getGitCommit !== undefined
      ? dependencies.getGitCommit()
      : getGitCommitFromRepo();
  if (commitFromGit) {
    return {
      value: commitFromGit,
      source: 'git',
    };
  }

  const packageVersion = process.env.npm_package_version?.trim();
  if (packageVersion) {
    return {
      value: packageVersion,
      source: 'package-env',
    };
  }

  return {
    value: 'unknown',
    source: 'unknown',
  };
}

export function generateVersionInfoMessage(): string {
  const versionInfo = getBotVersionInfo();

  return `Current bot version: ${versionInfo.value}\nVersion source: ${versionInfo.source}`;
}
