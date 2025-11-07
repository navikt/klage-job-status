import { handleJob } from '@action/handle-job';
import { debug, ExitCode, error, info, warning } from '@actions/core';
import { isJob, isJobEventType, type Job, JobEventType } from '@common/common';

const EVENT_PREFIX = 'event:';
const EVENT_PREFIX_LENGTH = EVENT_PREFIX.length;
const DATA_PREFIX = 'data:';
const DATA_PREFIX_LENGTH = DATA_PREFIX.length;

const parseSseEvent = (chunk: string): Job | null => {
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

  const job: unknown = JSON.parse(data);

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

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');

  info('Waiting for SSE events...');

  while (true) {
    const { value, done } = await reader.read();

    if (done) {
      break;
    }

    const chunk = decoder.decode(value);

    debug(`Received SSE chunk\n${chunk}`);

    const job = parseSseEvent(chunk);

    if (job !== null) {
      handleJob(job); // This will exit the process if the job is not running.
    } else {
      debug(`Skipping SSE event:\n${chunk}`);
    }
  }
};
