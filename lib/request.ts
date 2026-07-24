/**
 * Matches the `maxRequestBodySize` previously configured on the Bun server. Request
 * bodies for these endpoints are just short strings/JSON (namespace, jobId, status),
 * so this is generous while still bounding worst-case payload size.
 */
export const MAX_REQUEST_BODY_SIZE = 256;

/**
 * Returns `true` if the request declares (via `Content-Length`) a body that exceeds
 * `MAX_REQUEST_BODY_SIZE`. This is only a fast-path rejection for well-behaved clients -
 * requests without a `Content-Length` header (e.g. chunked transfer encoding) are not
 * rejected here. Callers must still read the body via `readLimitedBody`, which enforces
 * the limit while streaming regardless of what headers claim.
 */
export const isRequestTooLarge = (req: Request): boolean => {
  const contentLength = req.headers.get('content-length');

  if (contentLength === null) {
    return false;
  }

  const length = Number.parseInt(contentLength, 10);

  return !Number.isNaN(length) && length > MAX_REQUEST_BODY_SIZE;
};

/**
 * Reads the request body as text, enforcing `maxSize` while streaming so that requests
 * without a (truthful) `Content-Length` header - e.g. chunked transfer encoding - can't
 * bypass `isRequestTooLarge` and be buffered in full by `req.text()` / `req.json()`.
 *
 * Returns `null` if the body exceeds `maxSize`.
 */
export const readLimitedBody = async (
  req: Request,
  maxSize: number = MAX_REQUEST_BODY_SIZE,
): Promise<string | null> => {
  if (req.body === null) {
    return '';
  }

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    total += value.byteLength;

    if (total > maxSize) {
      await reader.cancel();
      return null;
    }

    chunks.push(value);
  }

  const body = new Uint8Array(total);
  let offset = 0;

  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder().decode(body);
};
