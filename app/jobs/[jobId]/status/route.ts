import { Status } from '@common/common';
import { AccessScope } from '@/lib/api-key/scope';
import { verifyApiKey } from '@/lib/api-key/verify';
import { getLogContext } from '@/lib/context';
import { ErrorEnum, getErrorResponse } from '@/lib/error';
import { JOBS } from '@/lib/jobs';
import { isRequestTooLarge, readLimitedBody } from '@/lib/request';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ jobId: string }> };

export async function GET(req: Request, { params }: Params) {
  const log = getLogContext('get-job-status', req);
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

  return new Response(status.status, { status: 200 });
}

export async function PUT(req: Request, { params }: Params) {
  const log = getLogContext('set-job-status', req);
  const [namespace, apiKeyError] = verifyApiKey(log, req, AccessScope.WRITE);

  if (apiKeyError !== null) {
    const res = getErrorResponse(apiKeyError);
    log.warn(`API key verification failed: ${apiKeyError}`, { status: res.status });
    return res;
  }

  const { jobId } = await params;

  if (isRequestTooLarge(req)) {
    const res = getErrorResponse(ErrorEnum.PAYLOAD_TOO_LARGE);
    log.warn(`Request body too large for job "${jobId}"`, { jobId, namespace, status: res.status });
    return res;
  }

  const status = await readLimitedBody(req);

  if (status === null) {
    const res = getErrorResponse(ErrorEnum.PAYLOAD_TOO_LARGE);
    log.warn(`Request body too large for job "${jobId}"`, { jobId, namespace, status: res.status });
    return res;
  }

  if (status !== Status.SUCCESS && status !== Status.FAILED && status !== Status.RUNNING) {
    log.info(`Tried to set invalid status "${status}" for job "${jobId}"`, { namespace, status: 400 });

    return new Response(
      `Invalid status "${status}". Expected ${Status.SUCCESS}, ${Status.FAILED}, or ${Status.RUNNING}`,
      { status: 400 },
    );
  }

  const [job, error] = await JOBS.update(log, namespace, jobId, status);

  if (error !== null) {
    const res = getErrorResponse(error);
    log.info(`Failed to update job "${jobId}" to status "${status}" - ${error}`, {
      namespace,
      jobId,
      jobStatus: status,
      error,
      status: res.status,
    });
    return res;
  }

  return Response.json(job, { status: 200 });
}
