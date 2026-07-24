import { isValidNamespace } from '@common/common';
import { generateApiKey } from '@/lib/api-key/create';
import { AccessScope } from '@/lib/api-key/scope';
import { getLogContext } from '@/lib/context';
import { getErrorResponse } from '@/lib/error';
import { authenticate } from '@/lib/user-token';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ namespace: string }> };

export async function GET(req: Request, { params }: Params) {
  const log = getLogContext('user-get-namespace-keys', req);
  const [navIdent, authError] = await authenticate(req);

  if (authError !== null) {
    const res = getErrorResponse(authError);
    log.warn(`Authentication failed: ${authError}`, { status: res.status });
    return res;
  }

  const { namespace: rawNamespace } = await params;
  const namespace = rawNamespace.toLowerCase();

  if (!isValidNamespace(namespace)) {
    log.warn(`API keys - Invalid namespace "${namespace}" for ${navIdent}`, { navIdent, namespace, status: 400 });
    return new Response('Invalid namespace', { status: 400 });
  }

  const [readKey, readError] = generateApiKey(namespace, AccessScope.READ);

  if (readError !== null) {
    const res = getErrorResponse(readError);

    log.warn(`Failed to generate read API key for namespace "${namespace}" - ${readError}`, {
      navIdent,
      namespace,
      status: res.status,
    });

    return res;
  }

  const [writeKey, writeError] = generateApiKey(namespace, AccessScope.WRITE);

  if (writeError !== null) {
    const res = getErrorResponse(writeError);

    log.warn(`Failed to generate write API key for namespace "${namespace}" - ${writeError}`, {
      navIdent,
      namespace,
      status: res.status,
    });

    return res;
  }

  log.info(`${navIdent} generated API keys for namespace "${namespace}"`, { navIdent, namespace, status: 200 });

  return Response.json({ readKey, writeKey }, { status: 200 });
}
