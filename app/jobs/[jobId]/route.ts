import { JobEventType, Status } from '@common/common';
import { AcceptType, formatAcceptValues, getAcceptValues, preferred } from '@/lib/accept';
import { AccessScope } from '@/lib/api-key/scope';
import { verifyApiKey } from '@/lib/api-key/verify';
import { getLogContext } from '@/lib/context';
import { ErrorEnum, getErrorResponse } from '@/lib/error';
import { JOBS } from '@/lib/jobs';
import { formatJobKey, isValidJobId } from '@/lib/jobs/key';
import type { Unsubscribe } from '@/lib/jobs/pubsub';
import { parseJson } from '@/lib/json';
import { isRequestTooLarge, readLimitedBody } from '@/lib/request';
import { SSE_HEADERS, sseEvent, sseHeartbeat } from '@/lib/sse';
import { isCreateJobInput } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ jobId: string }> };

export async function GET(req: Request, { params }: Params) {
  const log = getLogContext('get-job', req);
  const [namespace, apiKeyError] = verifyApiKey(log, req, AccessScope.READ);

  if (apiKeyError !== null) {
    const res = getErrorResponse(apiKeyError);
    log.warn(`API key verification failed: ${apiKeyError}`, { status: res.status });
    return res;
  }

  const accept = getAcceptValues(req.headers.get('accept'));

  if (accept.length === 0) {
    log.warn('Missing Accept header', { namespace, status: 400 });
    return new Response('Missing Accept header', { status: 400 });
  }

  const preferredType = preferred(accept, [AcceptType.SSE, AcceptType.JSON]);

  if (preferredType === null) {
    log.warn('No acceptable content type supported. Only text/event-stream and application/json are available.', {
      namespace,
      accept: formatAcceptValues(accept),
      status: 406,
    });
    return new Response(
      'No acceptable content type supported. Only text/event-stream and application/json are available. Set the Accept header to one of these values or */*.',
      { status: 406 },
    );
  }

  const { jobId } = await params;
  const [job, error] = await JOBS.get(log, namespace, jobId);

  if (error !== null) {
    const res = getErrorResponse(error);
    log.warn(`Failed to get job "${jobId}" - ${error}`, { jobId, namespace, status: res.status });
    return res;
  }

  if (preferredType === AcceptType.JSON) {
    return Response.json(job, { status: 200 });
  }

  if (job.status !== Status.RUNNING) {
    // The client's preferred type is SSE, but for a job that has already ended, JSON is a
    // simpler response to produce - and just as valid, as long as the client's `Accept` header
    // actually allows JSON too, not only `text/event-stream`. Serving JSON here is what lets a
    // client like `action/run.ts` - which sends `Accept: text/event-stream, application/json` -
    // detect an already-ended job via the response's `Content-Type` and fall back to polling
    // instead of opening a stream with nothing left to send.
    const acceptsJson = accept.some(({ type }) => type === AcceptType.JSON || type === AcceptType.ANY);

    if (acceptsJson) {
      return Response.json(job, { status: 200 });
    }

    // The client only accepts `text/event-stream` - serve a single event and close the stream
    // immediately.
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(sseEvent({ eventType: JobEventType.CREATED, job }));
        controller.close();
      },
    });

    return new Response(body, { headers: SSE_HEADERS });
  }

  let heartbeatIntervalId: ReturnType<typeof setInterval> | null = null;
  let unsubscribe: Unsubscribe | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      heartbeatIntervalId = setInterval(() => {
        try {
          controller.enqueue(sseHeartbeat());
        } catch {
          // Controller already closed (client disconnected).
        }
      }, 1_000);

      controller.enqueue(sseEvent({ eventType: JobEventType.CREATED, job }));

      unsubscribe = await JOBS.subscribe(log, namespace, jobId, async (update) => {
        try {
          controller.enqueue(sseEvent(update));
        } catch {
          // Controller already closed (client disconnected).
        }

        // If the job is deleted or stopped, unsubscribe and close the stream.
        if (update.eventType === JobEventType.DELETED || update.job.status !== Status.RUNNING) {
          if (heartbeatIntervalId !== null) {
            clearInterval(heartbeatIntervalId);
          }

          await unsubscribe?.();

          try {
            controller.close();
          } catch {
            // Controller already closed.
          }
        }
      });
    },
    async cancel() {
      if (heartbeatIntervalId !== null) {
        clearInterval(heartbeatIntervalId);
      }

      await unsubscribe?.();
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}

export async function POST(req: Request, { params }: Params) {
  const log = getLogContext('create-job', req);
  const [namespace, apiKeyError] = verifyApiKey(log, req, AccessScope.WRITE);

  if (apiKeyError !== null) {
    const res = getErrorResponse(apiKeyError);
    log.warn(`API key verification failed: ${apiKeyError}`, { status: res.status });
    return res;
  }

  const { jobId } = await params;

  if (!isValidJobId(jobId)) {
    const res = getErrorResponse(ErrorEnum.INVALID_JOB_ID);
    log.warn(`Invalid job ID "${jobId}"`, { jobId, namespace, status: res.status });
    return res;
  }

  if (isRequestTooLarge(req)) {
    const res = getErrorResponse(ErrorEnum.PAYLOAD_TOO_LARGE);
    log.warn(`Request body too large for job "${jobId}"`, { jobId, namespace, status: res.status });
    return res;
  }

  // The README documents this endpoint's request `Content-Type` as `text/plain`, while also
  // allowing an optional JSON payload - so the body is read and parsed regardless of what
  // `Content-Type` (if any) the client sends.
  const body = await readLimitedBody(req);

  if (body === null) {
    const res = getErrorResponse(ErrorEnum.PAYLOAD_TOO_LARGE);
    log.warn(`Request body too large for job "${jobId}"`, { jobId, namespace, status: res.status });
    return res;
  }

  const data = body.length === 0 ? undefined : parseJson(body);

  if (body.length > 0 && data === null) {
    log.warn(`Invalid JSON body for job "${jobId}"`, { jobId, namespace, status: 400 });
    return new Response('Invalid JSON', { status: 400 });
  }

  if (data !== undefined && !isCreateJobInput(data)) {
    log.warn(`Invalid input data for job "${jobId}"`, {
      jobId,
      namespace,
      data: JSON.stringify(data),
      status: 400,
    });
    return new Response('Invalid input', { status: 400 });
  }

  const [job, error] = await JOBS.create(log, namespace, jobId, data);

  if (error !== null) {
    const res = getErrorResponse(error);
    log.warn(`Failed to create job "${jobId}" - ${error}`, { jobId, namespace, status: res.status });
    return res;
  }

  log.debug(`Created job "${formatJobKey(job)}"`, { namespace });

  return Response.json(job, { status: 201 });
}

export async function DELETE(req: Request, { params }: Params) {
  const log = getLogContext('delete-job', req);
  const [namespace, apiKeyError] = verifyApiKey(log, req, AccessScope.WRITE);

  if (apiKeyError !== null) {
    const res = getErrorResponse(apiKeyError);
    log.warn(`API key verification failed: ${apiKeyError}`, { status: res.status });
    return res;
  }

  const { jobId } = await params;
  const error = await JOBS.delete(log, namespace, jobId);

  if (error !== null) {
    const res = getErrorResponse(error);
    log.warn(`Failed to delete job "${jobId}" - ${error}`, { jobId, namespace, status: res.status });
    return res;
  }

  return new Response(`Deleted job ${jobId}`, { status: 200 });
}
