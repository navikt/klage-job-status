import { Status } from '@common/common';
import { AccessScope } from '@/lib/api-key/scope';
import { verifyApiKey } from '@/lib/api-key/verify';
import { getLogContext } from '@/lib/context';
import { getErrorResponse } from '@/lib/error';
import { JOBS } from '@/lib/jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ jobId: string }> };

export async function GET(req: Request, { params }: Params) {
  const log = getLogContext('get-job-success', req);
  const [namespace, apiKeyError] = verifyApiKey(log, req, AccessScope.READ);

  if (apiKeyError !== null) {
    const res = getErrorResponse(apiKeyError);
    log.warn(`API key verification failed: ${apiKeyError}`, { status: res.status });
    return res;
  }

  const { jobId } = await params;
  const [status, error] = await JOBS.get(log, namespace, jobId);

  if (error !== null) {
    const res = getErrorResponse(error);
    log.warn(`Failed to get job "${jobId}" - ${error}`, { jobId, namespace, status: res.status });
    return res;
  }

  return new Response(status.status === Status.SUCCESS ? 'true' : 'false', { status: 200 });
}

export async function PUT(req: Request, { params }: Params) {
  const log = getLogContext('set-job-success', req);
  const [namespace, apiKeyError] = verifyApiKey(log, req, AccessScope.WRITE);

  if (apiKeyError !== null) {
    const res = getErrorResponse(apiKeyError);
    log.warn(`API key verification failed: ${apiKeyError}`, { status: res.status });
    return res;
  }

  const { jobId } = await params;
  const [job, error] = await JOBS.update(log, namespace, jobId, Status.SUCCESS);

  if (error !== null) {
    const res = getErrorResponse(error);
    log.warn(`Failed to update job "${jobId}" to status "${Status.SUCCESS}" - ${error}`, {
      jobId,
      namespace,
      status: res.status,
    });
    return res;
  }

  return Response.json(job, { status: 200 });
}
