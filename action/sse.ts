import { handleJob } from '@action/handle-job';
import { formatJobName } from '@action/job-name';
import { ExitCode, error } from '@actions/core';
import { isJob, type Job } from '@common/common';

const parseSseEvent = (chunk: string): Job | null => {
  const parts = chunk.trim().split('\n');

  let event: string | null = null;
  let data: string | null = null;

  for (const part of parts) {
    if (part.startsWith('event:')) {
      event = part.substring(6).trim();

      if (event !== 'job') {
        return null;
      }
    } else if (part.startsWith('data:')) {
      data = part.substring(5).trim();
    }
  }
  if (event === null || data === null) {
    return null;
  }

  const job: unknown = JSON.parse(data);

  if (!isJob(job)) {
    error(`Unexpected SSE data:\n${JSON.stringify(job)}`, { title: `${formatJobName()} - Unexpected SSE data` });
    process.exit(ExitCode.Failure);
  }

  return job;
};

export const sse = async (response: Response) => {
  if (response.body === null) {
    error('Failed to fetch SSE stream', { title: `${formatJobName()} - SSE failed` });
    process.exit(ExitCode.Failure);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');

  while (true) {
    const { value, done } = await reader.read();

    if (done) {
      break;
    }

    const chunk = decoder.decode(value);

    const job = parseSseEvent(chunk);

    if (job) {
      handleJob(job);
    }
  }
};
