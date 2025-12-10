import { AcceptType, getAcceptValues, preferred } from '@api/accept';
import { generateApiKey } from '@api/api-key/create';
import { AccessScope } from '@api/api-key/scope';
import { verifyApiKey } from '@api/api-key/verify';
import { getLogContext } from '@api/context';
import { ErrorEnum, getErrorResponse } from '@api/error';
import { FileLoader } from '@api/file-loader';
import { formatJobKey } from '@api/job-key';
import { JOBS } from '@api/jobs';
import { LOGS } from '@api/logging';
import { getSpanId, getTraceId } from '@api/trace-id';
import type { CreateJobInput } from '@api/types';
import { authenticate } from '@api/user-token';
import {
  type CreateJobEvent,
  isValidNamespace,
  type JobEvent,
  JobEventType,
  Status,
  validateLength,
} from '@common/common';

const INDEX_FILE = new FileLoader('./index.html');

const isCreateStatusInput = (data: unknown): data is CreateJobInput => data !== null && typeof data === 'object';

const JOBS_PATH = '/jobs';
const JOB_PATH = `${JOBS_PATH}/:jobId`;

JOBS.init();

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
        const log = getLogContext('get-all-jobs', req);
        const [namespace, apiKeyError] = verifyApiKey(log, req, AccessScope.READ);

        if (apiKeyError !== null) {
          const res = getErrorResponse(apiKeyError);
          log.warn(`API key verification failed: ${apiKeyError}`, { status: res.status });
          return res;
        }

        const jobs = await JOBS.getAll(log, namespace);

        return Response.json(jobs, { status: 200 });
      },
    },

    [JOB_PATH]: {
      GET: async (req) => {
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
            accept: accept.join(', '),
            status: 406,
          });
          return new Response(
            'No acceptable content type supported. Only text/event-stream and application/json are available. Set the Accept header to one of these values or */*.',
            { status: 406 },
          );
        }

        const { jobId } = req.params;
        const [job, error] = await JOBS.get(log, namespace, jobId);

        if (error !== null) {
          const res = getErrorResponse(error);
          log.warn(`Failed to get job "${jobId}" - ${error}`, { jobId, namespace, status: res.status });
          return res;
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

            JOBS.subscribe(log, namespace, jobId, (update) => {
              controller.enqueue(sse(update));

              // If the job is deleted or stopped, unsubscribe and close the stream.
              if (update.eventType === JobEventType.DELETED || update.job.status !== Status.RUNNING) {
                if (heartbeatIntervalId !== null) {
                  clearInterval(heartbeatIntervalId);
                }

                JOBS.unsubscribe(log, namespace, jobId);
                controller.close();
                return;
              }
            });
          },
          cancel() {
            JOBS.unsubscribe(log, namespace, jobId);

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
        const log = getLogContext('create-job', req);
        const [namespace, apiKeyError] = verifyApiKey(log, req, AccessScope.WRITE);

        if (apiKeyError !== null) {
          const res = getErrorResponse(apiKeyError);
          log.warn(`API key verification failed: ${apiKeyError}`, { status: res.status });
          return res;
        }

        const { jobId } = req.params;

        if (!JOB_ID_REGEX.test(jobId) || !validateLength(jobId, JOB_ID_MIN_LENGTH, JOB_ID_MAX_LENGTH)) {
          const res = getErrorResponse(ErrorEnum.INVALID_JOB_ID);
          log.warn(`Invalid job ID "${jobId}"`, { jobId, namespace, status: res.status });
          return res;
        }

        const data = req.headers.get('Content-Type') === 'application/json' ? await req.json() : undefined;

        if (data !== undefined && !isCreateStatusInput(data)) {
          log.warn(`Invalid input data for job "${jobId}"`, {
            jobId,
            namespace,
            data: JSON.stringify(data),
            status: 400,
          });
          return new Response('Invalid input', { status: 400 });
        }

        const [job, error] = await JOBS.create(log, namespace, req.params.jobId, data);

        if (error !== null) {
          const res = getErrorResponse(error);
          log.warn(`Failed to create job "${jobId}" - ${error}`, { jobId, namespace, status: res.status });
          return res;
        }

        log.debug(`Created job "${formatJobKey(job)}"`, { namespace });

        return Response.json(job, { status: 201 });
      },

      DELETE: async (req) => {
        const log = getLogContext('delete-job', req);
        const [namespace, apiKeyError] = verifyApiKey(log, req, AccessScope.WRITE);

        if (apiKeyError !== null) {
          const res = getErrorResponse(apiKeyError);
          log.warn(`API key verification failed: ${apiKeyError}`, { status: res.status });
          return res;
        }

        const { jobId } = req.params;
        const error = await JOBS.delete(log, namespace, jobId);

        if (error !== null) {
          const res = getErrorResponse(error);
          log.warn(`Failed to delete job "${jobId}" - ${error}`, { jobId, namespace, status: res.status });
          return res;
        }

        return new Response('Deleted job', { status: 200 });
      },
    },

    [`${JOB_PATH}/status`]: {
      GET: async (req) => {
        const log = getLogContext('get-job-status', req);
        const [namespace, apiKeyError] = verifyApiKey(log, req, AccessScope.READ);

        if (apiKeyError !== null) {
          const res = getErrorResponse(apiKeyError);
          log.warn(`API key verification failed: ${apiKeyError}`, { status: res.status });
          return res;
        }

        const { jobId } = req.params;
        const [status, error] = await JOBS.get(log, namespace, jobId);

        if (error !== null) {
          const res = getErrorResponse(error);
          log.warn(`Failed to get job "${jobId}" - ${error}`, { jobId, namespace, status: res.status });
          return res;
        }

        return new Response(status.status, { status: 200 });
      },

      PUT: async (req) => {
        const log = getLogContext('set-job-status', req);
        const [namespace, apiKeyError] = verifyApiKey(log, req, AccessScope.WRITE);

        if (apiKeyError !== null) {
          const res = getErrorResponse(apiKeyError);
          log.warn(`API key verification failed: ${apiKeyError}`, { status: res.status });
          return res;
        }

        const { jobId } = req.params;
        const status = await req.text();

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
      },
    },

    [`${JOB_PATH}/success`]: {
      GET: async (req) => {
        const log = getLogContext('get-job-success', req);
        const [namespace, apiKeyError] = verifyApiKey(log, req, AccessScope.READ);

        if (apiKeyError !== null) {
          const res = getErrorResponse(apiKeyError);
          log.warn(`API key verification failed: ${apiKeyError}`, { status: res.status });
          return res;
        }

        const { jobId } = req.params;
        const [status, error] = await JOBS.get(log, namespace, jobId);

        if (error !== null) {
          const res = getErrorResponse(error);
          log.warn(`Failed to get job "${jobId}" - ${error}`, { jobId, namespace, status: res.status });
          return res;
        }

        return new Response(status.status === Status.SUCCESS ? 'true' : 'false', { status: 200 });
      },

      PUT: async (req) => {
        const log = getLogContext('set-job-success', req);
        const [namespace, apiKeyError] = verifyApiKey(log, req, AccessScope.WRITE);

        if (apiKeyError !== null) {
          const res = getErrorResponse(apiKeyError);
          log.warn(`API key verification failed: ${apiKeyError}`, { status: res.status });
          return res;
        }

        const { jobId } = req.params;
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
      },
    },

    [`${JOB_PATH}/failed`]: {
      GET: async (req) => {
        const log = getLogContext('get-job-failed', req);
        const [namespace, apiKeyError] = verifyApiKey(log, req, AccessScope.READ);

        if (apiKeyError !== null) {
          const res = getErrorResponse(apiKeyError);
          log.warn(`API key verification failed: ${apiKeyError}`, { status: res.status });
          return res;
        }

        const { jobId } = req.params;
        const [job, error] = await JOBS.get(log, namespace, jobId);

        if (error !== null) {
          const res = getErrorResponse(error);
          log.warn(`Failed to get job "${jobId}" - ${error}`, { jobId, namespace, status: res.status });
          return res;
        }

        return new Response(job.status === Status.FAILED ? 'true' : 'false', { status: 200 });
      },

      PUT: async (req) => {
        const log = getLogContext('set-job-failed', req);
        const [namespace, apiKeyError] = verifyApiKey(log, req, AccessScope.WRITE);

        if (apiKeyError !== null) {
          const res = getErrorResponse(apiKeyError);
          log.warn(`API key verification failed: ${apiKeyError}`, { status: res.status });
          return res;
        }

        const { jobId } = req.params;
        const [job, error] = await JOBS.update(log, namespace, jobId, Status.FAILED);

        if (error !== null) {
          const res = getErrorResponse(error);
          log.warn(`Failed to update job "${jobId}" to status "${Status.FAILED}" - ${error}`, {
            jobId,
            namespace,
            status: res.status,
          });
          return res;
        }

        return Response.json(job, { status: 200 });
      },
    },

    [`${JOB_PATH}/running`]: {
      GET: async (req) => {
        const log = getLogContext('get-job-running', req);
        const [namespace, apiKeyError] = verifyApiKey(log, req, AccessScope.READ);

        if (apiKeyError !== null) {
          const res = getErrorResponse(apiKeyError);
          log.warn(`API key verification failed: ${apiKeyError}`, { status: res.status });
          return res;
        }

        const { jobId } = req.params;
        const [status, error] = await JOBS.get(log, namespace, jobId);

        if (error !== null) {
          const res = getErrorResponse(error);
          log.warn(`Failed to get job "${jobId}" - ${error}`, { jobId, namespace, status: res.status });
          return res;
        }

        return new Response(status.status === Status.RUNNING ? 'true' : 'false', { status: 200 });
      },

      PUT: async (req) => {
        const log = getLogContext('set-job-running', req);
        const [namespace, apiKeyError] = verifyApiKey(log, req, AccessScope.WRITE);

        if (apiKeyError !== null) {
          const res = getErrorResponse(apiKeyError);
          log.warn(`API key verification failed: ${apiKeyError}`, { status: res.status });
          return res;
        }

        const { jobId } = req.params;
        const [job, error] = await JOBS.update(log, namespace, jobId, Status.RUNNING);

        if (error !== null) {
          const res = getErrorResponse(error);
          log.warn(`Failed to update job "${jobId}" to status "${Status.RUNNING}" - ${error}`, {
            jobId,
            namespace,
            status: res.status,
          });
          return res;
        }

        return Response.json(job, { status: 200 });
      },
    },

    '/api/jobs/:namespace': {
      GET: async (req) => {
        const log = getLogContext('user-get-namespace-jobs', req);
        const [navIdent, authError] = authenticate(req);

        if (authError !== null) {
          const res = getErrorResponse(authError);
          log.warn(`Authentication failed: ${authError}`, { status: res.status });
          return res;
        }

        const namespace = req.params.namespace.toLowerCase();

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
            accept: accept.join(', '),
            status: 406,
          });
          return new Response(
            'No acceptable content type supported. Only text/event-stream and application/json are available. Set the Accept header to one of these values or */*.',
            { status: 406 },
          );
        }

        const jobs = await JOBS.getAll(log, namespace);

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

        log.warn(`Unsupported Accept header: ${accept.join(', ')}`, {
          namespace,
          navIdent,
          accept: accept.join(', '),
          status: 406,
        });
        return new Response('Unsupported Accept header', { status: 406 });
      },
    },

    '/api/namespaces': {
      GET: async (req) => {
        const log = getLogContext('user-get-namespaces', req);
        const [, authError] = authenticate(req);

        if (authError !== null) {
          const res = getErrorResponse(authError);
          log.warn(`Authentication failed: ${authError}`, { status: res.status });
          return res;
        }

        const namespaces = await JOBS.getNamespaces(log);

        return Response.json(namespaces, { status: 200 });
      },
    },

    '/api/namespaces/:namespace/jobs/:jobId': {
      DELETE: async (req) => {
        const log = getLogContext('user-delete-job', req);
        const [navIdent, authError] = authenticate(req);

        if (authError !== null) {
          const res = getErrorResponse(authError);
          log.warn(`Authentication failed: ${authError}`, { status: res.status });
          return res;
        }

        const { namespace, jobId } = req.params;

        const error = await JOBS.delete(log, namespace, jobId);

        if (error !== null) {
          const res = getErrorResponse(error);
          log.warn(`Failed to delete job "${jobId}" - ${error}`, { jobId, namespace, status: res.status });
          return res;
        }

        log.info(`${navIdent} deleted job "${formatJobKey({ namespace, id: jobId })}"`, { navIdent, jobId, namespace });

        return new Response('Job deleted', { status: 200 });
      },
    },

    '/api/namespaces/:namespace/keys': {
      GET: (req) => {
        const log = getLogContext('user-get-namespace-keys', req);
        const [navIdent, authError] = authenticate(req);

        if (authError !== null) {
          const res = getErrorResponse(authError);
          log.warn(`Authentication failed: ${authError}`, { status: res.status });
          return res;
        }

        const namespace = req.params.namespace.toLowerCase();

        if (!isValidNamespace(namespace)) {
          log.warn(`API keys - Invalid namespace "${namespace}" for ${navIdent}`, { navIdent, namespace, status: 400 });
          return new Response('Invalid namespace', { status: 400 });
        }

        const [readKey, readError] = generateApiKey(namespace, AccessScope.READ);

        if (readError !== null) {
          const res = getErrorResponse(readError);

          log.warn(`Failed to generate read API key for namespace "${namespace}" - ${readError}`, {
            navIdent,
            namespace,
            status: res.status,
          });

          return res;
        }

        const [writeKey, writeError] = generateApiKey(namespace, AccessScope.WRITE);

        if (writeError !== null) {
          const res = getErrorResponse(writeError);

          log.warn(`Failed to generate write API key for namespace "${namespace}" - ${writeError}`, {
            navIdent,
            namespace,
            status: res.status,
          });

          return res;
        }

        log.info(`${navIdent} generated API keys for namespace "${namespace}"`, { navIdent, namespace, status: 200 });

        return Response.json({ readKey, writeKey }, { status: 200 });
      },
    },

    '/isAlive': async () => {
      if (!INDEX_FILE.isReady) {
        LOGS.error('isAlive - Index file not ready', getTraceId(), getSpanId(), 'is-alive');
        return new Response('Index file not ready', { status: 418 });
      }

      if (!JOBS.isReady) {
        LOGS.error('isAlive - Jobs system not ready', getTraceId(), getSpanId(), 'is-alive');
        return new Response('Jobs system not ready', { status: 418 });
      }

      if (!(await JOBS.ping())) {
        LOGS.error('isAlive - Jobs system not responding', getTraceId(), getSpanId(), 'is-alive');
        return new Response('Jobs system not responding', { status: 418 });
      }

      return new Response('OK', { status: 200 });
    },

    '/isReady': async () => {
      if (!INDEX_FILE.isReady) {
        LOGS.error('isReady - Index HTML file not found', getTraceId(), getSpanId(), 'is-ready');
        return new Response('Index file not ready', { status: 418 });
      }

      if (!JOBS.isReady) {
        LOGS.error('isReady - Jobs system not ready', getTraceId(), getSpanId(), 'is-ready');
        return new Response('Jobs system not ready', { status: 418 });
      }

      return new Response('OK', { status: 200 });
    },

    '/*': {
      GET: () => {
        try {
          return new Response(INDEX_FILE.content, { headers: { Location: '/app', 'Content-Type': 'text/html' } });
        } catch (err) {
          if (err instanceof Error) {
            LOGS.error(`Index HTML file not found - ${err.message}`, getTraceId(), getSpanId(), 'index-html');
          } else {
            LOGS.error('Index HTML file not found', getTraceId(), getSpanId(), 'index-html');
          }

          return new Response('Service Unavailable', { status: 503 });
        }
      },
    },
  },
});

const JOB_ID_REGEX = /^[a-zA-Z0-9-_]+$/;
const JOB_ID_MAX_LENGTH = 64;
const JOB_ID_MIN_LENGTH = 3;

const sse = ({ eventType, job }: JobEvent) => `event:${eventType}\ndata:${JSON.stringify(job)}\n\n`;
