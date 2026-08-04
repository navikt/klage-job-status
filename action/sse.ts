import { handleJob } from '@action/handle-job';
import { debug, ExitCode, error, info, warning } from '@actions/core';
import { isJob, isJobEventType, type Job, JobEventType } from '@common/common';
import { parseJson } from '@/lib/json';

const EVENT_PREFIX = 'event:';
const EVENT_PREFIX_LENGTH = EVENT_PREFIX.length;
const DATA_PREFIX = 'data:';
const DATA_PREFIX_LENGTH = DATA_PREFIX.length;

/** Exported for `action/sse.test.ts` - not used outside this module otherwise. */
export const parseSseEvent = (chunk: string): Job | null => {
  const lines = chunk.trim().split('\n');

  let event: string | null = null;
  let data: string | null = null;

  for (const line of lines) {
    if (line.startsWith(EVENT_PREFIX)) {
      event = line.substring(EVENT_PREFIX_LENGTH).trim();
    } else if (line.startsWith(DATA_PREFIX)) {
      data = line.substring(DATA_PREFIX_LENGTH).trim();
    }
  }

  if (event === null) {
    warning(`Missing SSE event type in chunk:\n${chunk}`, { title: 'SSE parse warning' });
    return null;
  }

  if (!isJobEventType(event)) {
    warning(`Unknown SSE event type "${event}" in chunk:\n${chunk}`, { title: 'SSE parse warning' });
    return null;
  }

  if (event === JobEventType.HEARTBEAT) {
    debug('Received SSE heartbeat event');
    return null;
  }

  if (data === null) {
    warning(`Missing SSE data in chunk:\n${chunk}`, { title: 'SSE parse warning' });
    return null;
  }

  if (data.length === 0) {
    warning(`Empty SSE data in chunk:\n${chunk}`, { title: 'SSE parse warning' });
    return null;
  }

  const job = parseJson(data);

  if (!isJob(job)) {
    warning(`Unexpected SSE data:\n${data}`, { title: 'SSE parse warning' });
    return null;
  }

  return job;
};

export const sse = async (response: Response) => {
  if (response.body === null) {
    error('Failed to fetch SSE stream');
    process.exit(ExitCode.Failure);
  }

  info('Waiting for SSE events...');

  for await (const chunk of readSseEvents(response.body)) {
    debug(`Received SSE chunk\n${chunk}`);

    const job = parseSseEvent(chunk);

    if (job !== null) {
      handleJob(job); // This will exit the process if the job is not running.
    } else {
      debug(`Skipping SSE event:\n${chunk}`);
    }
  }
};

/**
 * Reads `stream`, buffering across `reader.read()` calls, and yields each complete SSE event
 * (`event:...\ndata:...\n\n`) as soon as its terminating blank line has arrived - regardless of
 * how the underlying reads happened to be chunked.
 *
 * A single SSE event is not guaranteed to arrive in one `read()` call - large payloads (e.g. a
 * long job `name`) can be split across multiple reads at an arbitrary byte offset, including
 * mid-line. Without this buffering, each raw read would be parsed as if it were a complete
 * event, corrupting both halves of the split event instead of just delaying it by one read.
 *
 * Exported for `action/sse.test.ts` - not used outside this module otherwise.
 */
export async function* readSseEvents(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    while (true) {
      const { value, done } = await reader.read();

      if (done) {
        if (buffer.trim().length > 0) {
          debug(`SSE stream ended with an incomplete trailing event, discarding it:\n${buffer}`);
        }

        return;
      }

      buffer += decoder.decode(value, { stream: true });

      const lastEventBoundary = buffer.lastIndexOf('\n\n');

      if (lastEventBoundary === -1) {
        continue;
      }

      const completeEvents = buffer.slice(0, lastEventBoundary);
      buffer = buffer.slice(lastEventBoundary + 2);

      yield* completeEvents.split('\n\n');
    }
  } finally {
    reader.releaseLock();
  }
}
