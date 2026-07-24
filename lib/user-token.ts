import { getToken, parseAzureUserToken, validateAzureToken } from '@navikt/oasis';
import { headers } from 'next/headers';
import { IS_LOCAL } from '@/lib/env';
import { ErrorEnum } from '@/lib/error';

export const authenticate = (req: Request): Promise<[string, null] | [null, ErrorEnum]> =>
  authenticateToken(getToken(req));

/**
 * Same as `authenticate`, but for use in Server Components / Suspense-streamed RSCs (e.g.
 * `lib/namespaces.ts`), which don't have a `Request` object to read headers from - only
 * `next/headers`'s `headers()`.
 */
export const authenticateFromHeaders = async (): Promise<[string, null] | [null, ErrorEnum]> => {
  const headersList = await headers();
  return authenticateToken(getToken(headersList));
};

/** Validates the Azure AD user token issued by Wonderwall, then extracts its `NAVident` claim. */
const authenticateToken = async (token: string | null): Promise<[string, null] | [null, ErrorEnum]> => {
  if (IS_LOCAL) {
    return ['T123456', null];
  }

  if (token === null) {
    return [null, ErrorEnum.UNAUTHENTICATED];
  }

  const validation = await validateAzureToken(token);

  if (!validation.ok) {
    return [null, ErrorEnum.UNAUTHENTICATED];
  }

  const parsed = parseAzureUserToken(token);

  if (!parsed.ok || parsed.NAVident === undefined) {
    return [null, ErrorEnum.UNAUTHENTICATED];
  }

  return [parsed.NAVident, null];
};
