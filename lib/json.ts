/**
 * `JSON.parse` throws on invalid input, which is easy to forget to guard against - especially
 * for data coming from outside the process (SSE payloads, Valkey values, request bodies, JWTs).
 * Centralizes that `try`/`catch` so every parse site handles the failure the same way - the
 * specific error is never useful here, just whether parsing succeeded.
 */
export const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};
