import crypto from 'crypto';

// Inject the secret token into the environment variable
process.env.SECRET_TOKEN = crypto.randomBytes(32).toString('base64url');
