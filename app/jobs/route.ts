import { AccessScope } from '@/lib/api-key/scope';
import { verifyApiKey } from '@/lib/api-key/verify';
import { getLogContext } from '@/lib/context';
import { getErrorResponse } from '@/lib/error';
import { JOBS } from '@/lib/jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const log = getLogContext('get-all-jobs', req);
  const [namespace, apiKeyError] = verifyApiKey(log, req, AccessScope.READ);

  if (apiKeyError !== null) {
    const res = getErrorResponse(apiKeyError);
    log.warn(`API key verification failed: ${apiKeyError}`, { status: res.status });
    return res;
  }

  const jobs = await JOBS.getAll(log, namespace);

  return Response.json(jobs, { status: 200 });
}
