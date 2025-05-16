import { createHmac, timingSafeEqual } from 'node:crypto';
import { type AccessScope, validateScope } from '@api/api-key/scope';
import { API_KEY_SECRET } from '@api/api-key/secret';
import { ErrorEnum } from '@api/error';

/**
 * Verify the API key.
 * @example klage:read.MU71PJn99JCV2a2py6uQw3_aL7I6YSH_Dd3HLAhr5WM
 * @param apiKey - The API key to verify.
 * @param requiredScope - The required scope for the API key.
 * @param requiredNamespace - The required namespace for the API key. If no namespace is required, any namespace is valid.
 * @returns boolean - True if the API key is valid, false otherwise.
 */
export const verifyApiKey = (req: Request, requiredScope: AccessScope): [string, null] | [null, ErrorEnum] => {
  const apiKey = req.headers.get('API_KEY');

  if (apiKey === null) {
    console.warn('API_KEY header is missing');
    return [null, ErrorEnum.UNAUTHENTICATED];
  }

  const [key, signature] = apiKey.split('.');

  if (key === undefined) {
    console.warn(`API key is malformed "${apiKey}"`);
    return [null, ErrorEnum.UNAUTHENTICATED];
  }

  if (signature === undefined) {
    console.warn(`API key signature is missing for key "${key}"`);
    return [null, ErrorEnum.UNAUTHENTICATED];
  }

  // Verify signature.
  const expectedSignature = Uint8Array.from(createHmac('sha256', API_KEY_SECRET).update(key).digest());
  const actualSignature = Uint8Array.from(Buffer.from(signature, 'base64url'));

  if (expectedSignature.length !== actualSignature.length) {
    console.warn(`API key signature length mismatch for key "${key}"`);
    return [null, ErrorEnum.UNAUTHORIZED];
  }

  if (!timingSafeEqual(expectedSignature, actualSignature)) {
    console.warn(`API key signature mismatch for key "${key}"`);
    return [null, ErrorEnum.UNAUTHENTICATED];
  }

  // Verify namespace and scope.
  const [namespace, scope] = key.split(':');

  if (!validateScope(scope, requiredScope)) {
    console.warn(`API key invalid scope. Required "${requiredScope}", got "${scope}"`);
    return [null, ErrorEnum.UNAUTHORIZED];
  }

  if (namespace === undefined) {
    console.warn(`API key namespace is missing in key "${key}"`);
    return [null, ErrorEnum.INVALID_NAMESPACE];
  }

  return [namespace, null];
};
