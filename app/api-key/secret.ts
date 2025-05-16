const secret = process.env.API_KEY_SECRET;

if (secret === undefined || secret.length === 0) {
  throw new Error('API_KEY_SECRET is not defined');
}

export const API_KEY_SECRET = secret;
