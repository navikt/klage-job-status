import { AcceptType, getAcceptValues, preferred } from '@app/accept';
import { getErrorResponse } from '@app/error';
import { JOBS } from '@app/jobs';
import type { CreateJobInput } from '@app/types';
import { type Job, Status } from '@common/common';

const isCreateStatusInput = (data: unknown): data is CreateJobInput => data !== null && typeof data === 'object';

const PATH = '/jobs/:namespace/:jobId';

await JOBS.init();

/**
 * Bun limits headers to 16KiB by default. Use `--max-http-header-size=2048` to set the number of bytes explicitly.
 */
Bun.serve({
  port: 8080,
  maxRequestBodySize: 256,
  idleTimeout: 10,
  routes: {
    [PATH]: {
      GET: async (req) => {
        const { params } = req;
        const accept = getAcceptValues(req.headers.get('accept'));

        if (accept.length === 0) {
          return new Response('Missing Accept header', { status: 400 });
        }

        const preferredType = preferred(accept, [AcceptType.SSE, AcceptType.JSON]);

        if (preferredType === null) {
          return new Response(
            'No acceptable content type supported. Only text/event-stream and application/json are available. Set the Accept header to one of these values or */*.',
            { status: 406 },
          );
        }

        const [status, error] = await JOBS.get(params);

        if (error !== null) {
          return getErrorResponse(error);
        }

        if (preferredType === 'application/json') {
          return Response.json(status, { status: 200 });
        }

        if (status.status !== Status.RUNNING) {
          return Response.json(status, { status: 200 });
        }

        let heartbeatIntervalId: NodeJS.Timeout | null = null;

        const stream = new ReadableStream({
          start(controller) {
            heartbeatIntervalId = setInterval(() => {
              controller.enqueue('event:heartbeat\n\n');
            }, 1_000);

            controller.enqueue(sse(status));

            JOBS.subscribe(params, (update) => {
              controller.enqueue(sse(update));

              if (update.status !== Status.RUNNING) {
                if (heartbeatIntervalId !== null) {
                  clearInterval(heartbeatIntervalId);
                }

                JOBS.unsubscribe(params);

                controller.close();
              }
            });
          },
          cancel() {
            JOBS.unsubscribe(params);

            if (heartbeatIntervalId !== null) {
              clearInterval(heartbeatIntervalId);
            }
          },
        });

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          },
        });
      },

      POST: async (req) => {
        const data = req.headers.get('Content-Type') === 'application/json' ? await req.json() : undefined;

        if (data !== undefined && !isCreateStatusInput(data)) {
          return new Response('Invalid input', { status: 400 });
        }

        const error = await JOBS.create(req.params, data);

        if (error !== null) {
          return getErrorResponse(error);
        }

        return new Response('Job created', { status: 200 });
      },

      DELETE: async (req) => {
        const error = await JOBS.delete(req.params);

        if (error !== null) {
          return getErrorResponse(error);
        }

        return new Response('Deleted job', { status: 200 });
      },
    },

    [`${PATH}/status`]: {
      GET: async (req) => {
        const [status, error] = await JOBS.get(req.params);

        if (error !== null) {
          return getErrorResponse(error);
        }

        return new Response(status.status, { status: 200 });
      },

      PUT: async (req) => {
        const status = await req.text();

        if (status !== Status.SUCCESS && status !== Status.FAILED && status !== Status.RUNNING) {
          return new Response(
            `Invalid status "${status}". Expected ${Status.SUCCESS}, ${Status.FAILED}, or ${Status.RUNNING}`,
            { status: 400 },
          );
        }

        const error = await JOBS.update(req.params, status);

        if (error !== null) {
          return getErrorResponse(error);
        }

        return new Response('Job updated', { status: 200 });
      },
    },

    [`${PATH}/success`]: {
      GET: async (req) => {
        const [status, error] = await JOBS.get(req.params);

        if (error !== null) {
          return getErrorResponse(error);
        }

        return new Response(status.status === Status.SUCCESS ? 'true' : 'false', { status: 200 });
      },

      PUT: async (req) => {
        const error = await JOBS.update(req.params, Status.SUCCESS);

        if (error !== null) {
          return getErrorResponse(error);
        }

        return new Response('Job updated', { status: 200 });
      },
    },

    [`${PATH}/failed`]: {
      GET: async (req) => {
        const [status, error] = await JOBS.get(req.params);

        if (error !== null) {
          return getErrorResponse(error);
        }

        return new Response(status.status === Status.FAILED ? 'true' : 'false', { status: 200 });
      },

      PUT: async (req) => {
        const error = await JOBS.update(req.params, Status.FAILED);

        if (error !== null) {
          return getErrorResponse(error);
        }

        return new Response('Job updated', { status: 200 });
      },
    },

    [`${PATH}/running`]: {
      GET: async (req) => {
        const [status, error] = await JOBS.get(req.params);

        if (error !== null) {
          return getErrorResponse(error);
        }

        return new Response(status.status === Status.RUNNING ? 'true' : 'false', { status: 200 });
      },

      PUT: async (req) => {
        const error = await JOBS.update(req.params, Status.RUNNING);

        if (error !== null) {
          return getErrorResponse(error);
        }

        return new Response('Job updated', { status: 200 });
      },
    },

    '/isAlive': new Response('OK'),
    '/isReady': async () => {
      const isAlive = await JOBS.ping();

      return isAlive ? new Response('OK') : new Response('Not Ready', { status: 418 });
    },
  },
});

const sse = (status: Job) => `event:job\ndata:${JSON.stringify(status)}\n\n`;
