import { getLogContext } from '@/lib/context';
import { getErrorResponse } from '@/lib/error';
import { JOBS } from '@/lib/jobs';
import { formatJobKey } from '@/lib/jobs/key';
import { authenticate } from '@/lib/user-token';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ namespace: string; jobId: string }> };

export async function DELETE(req: Request, { params }: Params) {
  const log = getLogContext('user-delete-job', req);
  const [navIdent, authError] = await authenticate(req);

  if (authError !== null) {
    const res = getErrorResponse(authError);
    log.warn(`Authentication failed: ${authError}`, { status: res.status });
    return res;
  }

  const { namespace, jobId } = await params;

  const error = await JOBS.delete(log, namespace, jobId);

  if (error !== null) {
    const res = getErrorResponse(error);
    log.warn(`Failed to delete job "${jobId}" - ${error}`, { jobId, namespace, status: res.status });
    return res;
  }

  log.info(`${navIdent} deleted job "${formatJobKey({ namespace, id: jobId })}"`, { navIdent, jobId, namespace });

  return new Response('Job deleted', { status: 200 });
}
