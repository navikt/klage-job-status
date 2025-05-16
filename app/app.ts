import { AcceptType, getAcceptValues, preferred } from '@app/accept';
import { generateApiKey } from '@app/api-key/create';
import { AccessScope } from '@app/api-key/scope';
import { verifyApiKey } from '@app/api-key/verify';
import { ErrorEnum, getErrorResponse } from '@app/error';
import { JOBS } from '@app/jobs';
import type { CreateJobInput } from '@app/types';
import { authenticate } from '@app/user-token';
import { type Job, Status } from '@common/common';

const isCreateStatusInput = (data: unknown): data is CreateJobInput => data !== null && typeof data === 'object';

const JOBS_PATH = '/jobs';
const PATH = `${JOBS_PATH}/:jobId`;

await JOBS.init();

/**
 * Bun limits headers to 16KiB by default. Use `--max-http-header-size=2048` to set the number of bytes explicitly.
 */
Bun.serve({
  port: 8080,
  maxRequestBodySize: 256,
  idleTimeout: 10,
  routes: {
    [JOBS_PATH]: {
      GET: async (req) => {
        const [namespace, apiKeyError] = verifyApiKey(req, AccessScope.READ);

        if (apiKeyError !== null) {
          return getErrorResponse(apiKeyError);
        }

        const jobs = await JOBS.getAll(namespace);

        return Response.json(jobs, { status: 200 });
      },
    },
    [PATH]: {
      GET: async (req) => {
        const [namespace, apiKeyError] = verifyApiKey(req, AccessScope.READ);

        if (apiKeyError !== null) {
          return getErrorResponse(apiKeyError);
        }

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

        const { jobId } = req.params;
        const [status, error] = await JOBS.get(namespace, jobId);

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

            JOBS.subscribe(namespace, jobId, (update) => {
              controller.enqueue(sse(update));

              if (update.status !== Status.RUNNING) {
                if (heartbeatIntervalId !== null) {
                  clearInterval(heartbeatIntervalId);
                }

                JOBS.unsubscribe(namespace, jobId);

                controller.close();
              }
            });
          },
          cancel() {
            JOBS.unsubscribe(namespace, jobId);

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
        const { jobId } = req.params;

        if (!JOB_ID_REGEX.test(jobId) || !validateLength(jobId, JOB_ID_MIN_LENGTH, JOB_ID_MAX_LENGTH)) {
          return getErrorResponse(ErrorEnum.INVALID_JOB_ID);
        }

        const [namespace, apiKeyError] = verifyApiKey(req, AccessScope.WRITE);

        if (apiKeyError !== null) {
          return getErrorResponse(apiKeyError);
        }

        const data = req.headers.get('Content-Type') === 'application/json' ? await req.json() : undefined;

        if (data !== undefined && !isCreateStatusInput(data)) {
          return new Response('Invalid input', { status: 400 });
        }

        const error = await JOBS.create(namespace, req.params.jobId, data);

        if (error !== null) {
          return getErrorResponse(error);
        }

        console.debug(`Created job "${req.params.jobId}" in namespace "${namespace}"`);

        return new Response('Job created', { status: 200 });
      },

      DELETE: async (req) => {
        const [namespace, apiKeyError] = verifyApiKey(req, AccessScope.WRITE);

        if (apiKeyError !== null) {
          return getErrorResponse(apiKeyError);
        }

        const error = await JOBS.delete(namespace, req.params.jobId);

        if (error !== null) {
          return getErrorResponse(error);
        }

        return new Response('Deleted job', { status: 200 });
      },
    },

    [`${PATH}/status`]: {
      GET: async (req) => {
        const [namespace, apiKeyError] = verifyApiKey(req, AccessScope.READ);

        if (apiKeyError !== null) {
          return getErrorResponse(apiKeyError);
        }

        const [status, error] = await JOBS.get(namespace, req.params.jobId);

        if (error !== null) {
          return getErrorResponse(error);
        }

        return new Response(status.status, { status: 200 });
      },

      PUT: async (req) => {
        const [namespace, apiKeyError] = verifyApiKey(req, AccessScope.WRITE);

        if (apiKeyError !== null) {
          return getErrorResponse(apiKeyError);
        }

        const status = await req.text();

        if (status !== Status.SUCCESS && status !== Status.FAILED && status !== Status.RUNNING) {
          console.info(`Tried to set invalid status "${status}" for job "${req.params.jobId}"`);

          return new Response(
            `Invalid status "${status}". Expected ${Status.SUCCESS}, ${Status.FAILED}, or ${Status.RUNNING}`,
            { status: 400 },
          );
        }

        const error = await JOBS.update(namespace, req.params.jobId, status);

        if (error !== null) {
          console.info(`Failed to update job "${req.params.jobId}" to status "${status}" - ${error}`);

          return getErrorResponse(error);
        }

        return new Response('Job updated', { status: 200 });
      },
    },

    [`${PATH}/success`]: {
      GET: async (req) => {
        const [namespace, apiKeyError] = verifyApiKey(req, AccessScope.READ);

        if (apiKeyError !== null) {
          return getErrorResponse(apiKeyError);
        }

        const [status, error] = await JOBS.get(namespace, req.params.jobId);

        if (error !== null) {
          return getErrorResponse(error);
        }

        return new Response(status.status === Status.SUCCESS ? 'true' : 'false', { status: 200 });
      },

      PUT: async (req) => {
        const [namespace, apiKeyError] = verifyApiKey(req, AccessScope.WRITE);

        if (apiKeyError !== null) {
          return getErrorResponse(apiKeyError);
        }

        const error = await JOBS.update(namespace, req.params.jobId, Status.SUCCESS);

        if (error !== null) {
          return getErrorResponse(error);
        }

        return new Response('Job updated', { status: 200 });
      },
    },

    [`${PATH}/failed`]: {
      GET: async (req) => {
        const [namespace, apiKeyError] = verifyApiKey(req, AccessScope.READ);

        if (apiKeyError !== null) {
          return getErrorResponse(apiKeyError);
        }

        const [status, error] = await JOBS.get(namespace, req.params.jobId);

        if (error !== null) {
          return getErrorResponse(error);
        }

        return new Response(status.status === Status.FAILED ? 'true' : 'false', { status: 200 });
      },

      PUT: async (req) => {
        const [namespace, apiKeyError] = verifyApiKey(req, AccessScope.WRITE);

        if (apiKeyError !== null) {
          return getErrorResponse(apiKeyError);
        }

        const error = await JOBS.update(namespace, req.params.jobId, Status.FAILED);

        if (error !== null) {
          return getErrorResponse(error);
        }

        return new Response('Job updated', { status: 200 });
      },
    },

    [`${PATH}/running`]: {
      GET: async (req) => {
        const [namespace, apiKeyError] = verifyApiKey(req, AccessScope.READ);

        if (apiKeyError !== null) {
          return getErrorResponse(apiKeyError);
        }

        const [status, error] = await JOBS.get(namespace, req.params.jobId);

        if (error !== null) {
          return getErrorResponse(error);
        }

        return new Response(status.status === Status.RUNNING ? 'true' : 'false', { status: 200 });
      },

      PUT: async (req) => {
        const [namespace, apiKeyError] = verifyApiKey(req, AccessScope.WRITE);

        if (apiKeyError !== null) {
          return getErrorResponse(apiKeyError);
        }

        const error = await JOBS.update(namespace, req.params.jobId, Status.RUNNING);

        if (error !== null) {
          return getErrorResponse(error);
        }

        return new Response('Job updated', { status: 200 });
      },
    },

    '/api-keys/:namespace': {
      GET: (req) => {
        const [navIdent, authError] = authenticate(req);

        if (authError !== null) {
          return getErrorResponse(authError);
        }

        const namespace = req.params.namespace.toLowerCase();

        if (
          !NAMESPACE_REGEX.test(namespace) ||
          !validateLength(namespace, NAMESPACE_MIN_LENGTH, NAMESPACE_MAX_LENGTH)
        ) {
          console.warn(`API keys - Invalid namespace "${namespace}" for ${navIdent}`);
          return new Response('Invalid namespace', { status: 400 });
        }

        const [readKey, readError] = generateApiKey(namespace, AccessScope.READ);

        if (readError !== null) {
          return getErrorResponse(readError);
        }

        const [writeKey, writeError] = generateApiKey(namespace, AccessScope.WRITE);

        if (writeError !== null) {
          return getErrorResponse(writeError);
        }

        console.info(`${navIdent} generated API keys for namespace "${namespace}"`);

        return Response.json({ readKey, writeKey }, { status: 200 });
      },
    },

    '/isAlive': new Response('OK'),
    '/isReady': async () => {
      const isAlive = await JOBS.ping();

      return isAlive ? new Response('OK') : new Response('Not Ready', { status: 418 });
    },
  },
});

const NAMESPACE_REGEX = /^[a-z-_]+$/;
const NAMESPACE_MAX_LENGTH = 64;
const NAMESPACE_MIN_LENGTH = 3;
const JOB_ID_REGEX = /^[a-zA-Z0-9-_]+$/;
const JOB_ID_MAX_LENGTH = 64;
const JOB_ID_MIN_LENGTH = 3;

const validateLength = (value: string, min: number, max: number): boolean => value.length > min && value.length < max;

const sse = (status: Job) => `event:job\ndata:${JSON.stringify(status)}\n\n`;
