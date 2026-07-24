import { getLogContext } from '@/lib/context';
import { getErrorResponse } from '@/lib/error';
import { JOBS } from '@/lib/jobs';
import { authenticate } from '@/lib/user-token';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const log = getLogContext('user-get-namespaces', req);
  const [, authError] = await authenticate(req);

  if (authError !== null) {
    const res = getErrorResponse(authError);
    log.warn(`Authentication failed: ${authError}`, { status: res.status });
    return res;
  }

  const namespaces = await JOBS.getNamespaces(log);

  return Response.json(namespaces, { status: 200 });
}
