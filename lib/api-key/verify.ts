import { createHmac, timingSafeEqual } from 'node:crypto';
import { type AccessScope, validateScope } from '@/lib/api-key/scope';
import { getApiKeySecret } from '@/lib/api-key/secret';
import type { Context } from '@/lib/context';
import { ErrorEnum } from '@/lib/error';
import { withSyncSpan } from '@/lib/tracer';

/**
 * Verify the API key in the request headers.
 * @param requiredScope - The required scope for the API key.
 */
export const verifyApiKey = (
  log: Context,
  req: Request,
  requiredScope: AccessScope,
): [string, null] | [null, ErrorEnum] =>
  withSyncSpan('api-key.verify', { 'api_key.required_scope': requiredScope }, () => {
    const apiKey = req.headers.get('API_KEY');

    if (apiKey === null) {
      log.warn('API_KEY header is missing');
      return [null, ErrorEnum.UNAUTHENTICATED];
    }

    const [key, signature] = apiKey.split('.');

    if (key === undefined) {
      log.warn(`API key is malformed "${apiKey}"`);
      return [null, ErrorEnum.UNAUTHENTICATED];
    }

    if (signature === undefined) {
      log.warn(`API key signature is missing for key "${key}"`);
      return [null, ErrorEnum.UNAUTHENTICATED];
    }

    // Verify signature.
    const expectedSignature = Uint8Array.from(createHmac('sha256', getApiKeySecret()).update(key).digest());
    const actualSignature = Uint8Array.from(Buffer.from(signature, 'base64url'));

    if (expectedSignature.length !== actualSignature.length) {
      log.warn(`API key signature length mismatch for key "${key}"`);
      return [null, ErrorEnum.UNAUTHENTICATED];
    }

    if (!timingSafeEqual(expectedSignature, actualSignature)) {
      log.warn(`API key signature mismatch for key "${key}"`);
      return [null, ErrorEnum.UNAUTHENTICATED];
    }

    // Verify namespace and scope.
    const [namespace, scope] = key.split(':');

    if (!validateScope(scope, requiredScope)) {
      log.warn(`API key invalid scope. Required "${requiredScope}", got "${scope}"`);
      return [null, ErrorEnum.UNAUTHORIZED];
    }

    if (namespace === undefined) {
      log.warn(`API key namespace is missing in key "${key}"`);
      return [null, ErrorEnum.INVALID_NAMESPACE];
    }

    return [namespace, null];
  });
