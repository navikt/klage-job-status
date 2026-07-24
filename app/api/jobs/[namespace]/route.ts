import { type CreateJobEvent, isValidNamespace, type JobEvent, JobEventType } from '@common/common';
import { AcceptType, formatAcceptValues, getAcceptValues, preferred } from '@/lib/accept';
import { getLogContext } from '@/lib/context';
import { getErrorResponse } from '@/lib/error';
import { JOBS } from '@/lib/jobs';
import { SSE_HEADERS, sseEvent, sseHeartbeat } from '@/lib/sse';
import { authenticate } from '@/lib/user-token';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ namespace: string }> };

export async function GET(req: Request, { params }: Params) {
  const log = getLogContext('user-get-namespace-jobs', req);
  const [navIdent, authError] = await authenticate(req);

  if (authError !== null) {
    const res = getErrorResponse(authError);
    log.warn(`Authentication failed: ${authError}`, { status: res.status });
    return res;
  }

  const { namespace: rawNamespace } = await params;
  const namespace = rawNamespace.toLowerCase();

  if (!isValidNamespace(namespace)) {
    log.warn(`Jobs - Invalid namespace "${namespace}"`, { namespace, navIdent, status: 400 });
    return new Response('Invalid namespace', { status: 400 });
  }

  const accept = getAcceptValues(req.headers.get('accept'));

  if (accept.length === 0) {
    log.warn('Missing Accept header', { namespace, navIdent, status: 400 });
    return new Response('Missing Accept header', { status: 400 });
  }

  const preferredType = preferred(accept, [AcceptType.SSE, AcceptType.JSON]);

  if (preferredType === null) {
    log.warn('No acceptable content type supported', {
      namespace,
      navIdent,
      accept: formatAcceptValues(accept),
      status: 406,
    });
    return new Response(
      'No acceptable content type supported. Only text/event-stream and application/json are available. Set the Accept header to one of these values or */*.',
      { status: 406 },
    );
  }

  const jobs = await JOBS.getAll(log, namespace);

  if (preferredType === AcceptType.JSON) {
    return Response.json(jobs, { status: 200 });
  }

  let heartbeatIntervalId: ReturnType<typeof setInterval> | null = null;

  // `controller` is only assigned once the stream's `start()` runs below. Subscribing to Valkey
  // happens *before* that, so by the time `listener` can possibly fire, `start()` has already run
  // synchronously (there's no `await` in between) and `controller` is guaranteed to be set.
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;

  const push = (bytes: Uint8Array) => {
    try {
      controller?.enqueue(bytes);
    } catch {
      // Controller already closed (client disconnected).
    }
  };

  // Subscribed *before* the response (and its stream) is even returned below - not inside the
  // stream's `start()`, which only runs once the client has begun consuming the response body.
  // `subscribeNamespace` does a real round trip to Valkey (`psubscribeLazy`); doing it lazily,
  // after the client already considers its `EventSource` connected, would open a real window
  // where a job created/updated between "client connected" and "server actually subscribed"
  // publishes an event nobody is listening for yet - Valkey pub/sub has no backlog, so that
  // event would be lost forever. Awaiting it here guarantees the subscription is active before
  // the client can possibly be listening.
  const unsubscribe = await JOBS.subscribeNamespace(namespace, (update: JobEvent) => {
    push(sseEvent(update));
  });

  const stream = new ReadableStream({
    start(streamController) {
      controller = streamController;

      heartbeatIntervalId = setInterval(() => {
        push(sseHeartbeat());
      }, 1_000);

      // A snapshot of the jobs that existed at the very start of this request (`jobs`, fetched
      // above). The client already has this same data via the server-rendered `initialJobs`
      // prop on first load (see `components/JobsServer.tsx`), but replaying it here too means a
      // *reconnect* (the browser's `EventSource` retries automatically on any drop) also
      // resyncs the full current state, not just future events - covering for anything missed
      // while disconnected.
      for (const job of jobs) {
        const event: CreateJobEvent = { job, eventType: JobEventType.CREATED };
        push(sseEvent(event));
      }
    },
    async cancel() {
      if (heartbeatIntervalId !== null) {
        clearInterval(heartbeatIntervalId);
      }

      await unsubscribe();
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
