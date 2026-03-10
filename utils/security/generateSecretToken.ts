import crypto from 'crypto';

export function ensureSecretToken(): string {
  if (process.env.SECRET_TOKEN?.trim()) {
    return process.env.SECRET_TOKEN;
  }

  const generatedToken = crypto.randomBytes(32).toString('base64url');
  process.env.SECRET_TOKEN = generatedToken;

  return generatedToken;
}
