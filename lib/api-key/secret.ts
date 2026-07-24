/**
 * Read the API key signing secret lazily (at request time) rather than at module load,
 * so that `next build` does not fail when the environment variable is absent.
 */
export const getApiKeySecret = (): string => {
  const secret = process.env.API_KEY_SECRET;

  if (secret === undefined || secret.length === 0) {
    throw new Error('API_KEY_SECRET is not defined');
  }

  return secret;
};
