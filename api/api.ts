import { extname, join } from 'node:path';
import { AcceptType, getAcceptValues, preferred } from '@api/accept';
import { generateApiKey } from '@api/api-key/create';
import { AccessScope } from '@api/api-key/scope';
import { verifyApiKey } from '@api/api-key/verify';
import { ErrorEnum, getErrorResponse } from '@api/error';
import { formatJobKey } from '@api/job-key';
import { JOBS } from '@api/jobs';
import { MIME_TYPES } from '@api/mime';
import type { CreateJobInput } from '@api/types';
import { authenticate } from '@api/user-token';
import {
  type CreateJobEvent,
  type JobEvent,
  JobEventType,
  Status,
  isValidNamespace,
  validateLength,
} from '@common/common';

const isCreateStatusInput = (data: unknown): data is CreateJobInput => data !== null && typeof data === 'object';

const JOBS_PATH = '/jobs';
const JOB_PATH = `${JOBS_PATH}/:jobId`;

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
    [JOB_PATH]: {
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
        const [job, error] = await JOBS.get(namespace, jobId);

        if (error !== null) {
          return getErrorResponse(error);
        }

        if (preferredType === 'application/json') {
          return Response.json(job, { status: 200 });
        }

        if (job.status !== Status.RUNNING) {
          return Response.json(job, { status: 200 });
        }

        let heartbeatIntervalId: NodeJS.Timeout | null = null;

        const stream = new ReadableStream({
          start(controller) {
            heartbeatIntervalId = setInterval(() => {
              controller.enqueue('event:heartbeat\n\n');
            }, 1_000);

            controller.enqueue(sse({ eventType: JobEventType.CREATED, job }));

            JOBS.subscribe(namespace, jobId, (update) => {
              controller.enqueue(sse(update));

              // If the job is deleted or stopped, unsubscribe and close the stream.
              if (update.eventType === JobEventType.DELETED || update.job.status !== Status.RUNNING) {
                if (heartbeatIntervalId !== null) {
                  clearInterval(heartbeatIntervalId);
                }

                JOBS.unsubscribe(namespace, jobId);
                controller.close();
                return;
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

        const [job, error] = await JOBS.create(namespace, req.params.jobId, data);

        if (error !== null) {
          return getErrorResponse(error);
        }

        console.debug(`Created job "${formatJobKey(job)}"`);

        return Response.json(job, { status: 201 });
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

    [`${JOB_PATH}/status`]: {
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

        const [job, error] = await JOBS.update(namespace, req.params.jobId, status);

        if (error !== null) {
          console.info(`Failed to update job "${req.params.jobId}" to status "${status}" - ${error}`);

          return getErrorResponse(error);
        }

        return Response.json(job, { status: 200 });
      },
    },

    [`${JOB_PATH}/success`]: {
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

        const [job, error] = await JOBS.update(namespace, req.params.jobId, Status.SUCCESS);

        if (error !== null) {
          return getErrorResponse(error);
        }

        return Response.json(job, { status: 200 });
      },
    },

    [`${JOB_PATH}/failed`]: {
      GET: async (req) => {
        const [namespace, apiKeyError] = verifyApiKey(req, AccessScope.READ);

        if (apiKeyError !== null) {
          return getErrorResponse(apiKeyError);
        }

        const [job, error] = await JOBS.get(namespace, req.params.jobId);

        if (error !== null) {
          return getErrorResponse(error);
        }

        return new Response(job.status === Status.FAILED ? 'true' : 'false', { status: 200 });
      },

      PUT: async (req) => {
        const [namespace, apiKeyError] = verifyApiKey(req, AccessScope.WRITE);

        if (apiKeyError !== null) {
          return getErrorResponse(apiKeyError);
        }

        const [job, error] = await JOBS.update(namespace, req.params.jobId, Status.FAILED);

        if (error !== null) {
          return getErrorResponse(error);
        }

        return Response.json(job, { status: 200 });
      },
    },

    [`${JOB_PATH}/running`]: {
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

        const [job, error] = await JOBS.update(namespace, req.params.jobId, Status.RUNNING);

        if (error !== null) {
          return getErrorResponse(error);
        }

        return Response.json(job, { status: 200 });
      },
    },

    '/api/jobs/:namespace': {
      GET: async (req) => {
        const [, authError] = authenticate(req);

        if (authError !== null) {
          return getErrorResponse(authError);
        }

        const namespace = req.params.namespace.toLowerCase();

        if (!isValidNamespace(namespace)) {
          console.warn(`Jobs - Invalid namespace "${namespace}"`);
          return new Response('Invalid namespace', { status: 400 });
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

        const jobs = await JOBS.getAll(namespace);

        if (preferredType === 'application/json') {
          return Response.json(jobs, { status: 200 });
        }

        if (preferredType === 'text/event-stream') {
          let heartbeatIntervalId: NodeJS.Timeout | null = null;

          const stream = new ReadableStream({
            start(controller) {
              heartbeatIntervalId = setInterval(() => {
                controller.enqueue('event:heartbeat\n\n');
              }, 1_000);

              for (const job of jobs) {
                const event: CreateJobEvent = { job, eventType: JobEventType.CREATED };
                controller.enqueue(sse(event));
              }

              JOBS.subscribeAll(namespace, (update) => {
                controller.enqueue(sse(update));
              });
            },
            cancel() {
              if (heartbeatIntervalId !== null) {
                clearInterval(heartbeatIntervalId);
              }

              JOBS.unsubscribeAll(namespace);
            },
          });

          return new Response(stream, {
            headers: {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              Connection: 'keep-alive',
            },
          });
        }

        return new Response('Unsupported Accept header', { status: 406 });
      },
    },

    '/api/namespaces': {
      GET: async (req) => {
        const [, authError] = authenticate(req);

        if (authError !== null) {
          return getErrorResponse(authError);
        }

        const namespaces = await JOBS.getNamespaces();

        return Response.json(namespaces, { status: 200 });
      },
    },

    '/api/namespaces/:namespace/keys': {
      GET: (req) => {
        const [navIdent, authError] = authenticate(req);

        if (authError !== null) {
          return getErrorResponse(authError);
        }

        const namespace = req.params.namespace.toLowerCase();

        if (!isValidNamespace(namespace)) {
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

    '/assets/*': {
      GET: (req) => {
        const url = new URL(req.url);
        const path = url.pathname.replace('/assets', '');

        return new Response(Bun.file(join(import.meta.dir, './public/assets', path)), {
          headers: {
            'Content-Type': MIME_TYPES[extname(path)] || 'application/octet-stream',
          },
        });
      },
    },

    '/*': {
      GET: () => {
        return new Response(Bun.file(join(import.meta.dir, './public/index.html')), {
          headers: {
            Location: '/app',
            'Content-Type': 'text/html',
          },
        });
      },
    },
  },
});

const JOB_ID_REGEX = /^[a-zA-Z0-9-_]+$/;
const JOB_ID_MAX_LENGTH = 64;
const JOB_ID_MIN_LENGTH = 3;

const sse = ({ eventType, job }: JobEvent) => `event:${eventType}\ndata:${JSON.stringify(job)}\n\n`;
