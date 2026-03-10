import crypto from 'crypto';

/**
 * Ensures that a secret token is set in the environment variables.
 * If not set, it generates a new one.
 * @returns The secret token.
 */
export function ensureSecretToken(): string {
  if (process.env.SECRET_TOKEN?.trim()) {
    return process.env.SECRET_TOKEN;
  }

  const generatedToken = crypto.randomBytes(32).toString('base64url');
  process.env.SECRET_TOKEN = generatedToken;

  return generatedToken;
}
