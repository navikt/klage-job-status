import { describe, expect, test } from 'bun:test';
// `action/sse.ts` imports `@action/handle-job`, which pulls in `@action/input` transitively -
// see `action/test-env.ts` for why this must be imported before anything that touches it.
import './test-env';
import { parseSseEvent, readSseEvents } from '@action/sse';
import { type Job, Status } from '@common/common';

const RUNNING_JOB: Job = {
  id: 'job-1',
  namespace: 'klage',
  name: 'My job',
  created: 1_000,
  modified: 1_000,
  timeout: 60,
  status: Status.RUNNING,
  ended: null,
};

const sseChunk = (event: string, data?: string): string =>
  data === undefined ? `event:${event}\n\n` : `event:${event}\ndata:${data}\n\n`;

describe('parseSseEvent', () => {
  test('parses a "created" event containing a job', () => {
    expect(parseSseEvent(sseChunk('created', JSON.stringify(RUNNING_JOB)))).toEqual(RUNNING_JOB);
  });

  test('parses an "updated" event containing a job', () => {
    const updated: Job = { ...RUNNING_JOB, status: Status.SUCCESS, ended: 2_000 };
    expect(parseSseEvent(sseChunk('updated', JSON.stringify(updated)))).toEqual(updated);
  });

  test('returns null for a heartbeat event', () => {
    expect(parseSseEvent(sseChunk('heartbeat'))).toBeNull();
  });

  test('returns null when the event type is missing', () => {
    expect(parseSseEvent(`data:${JSON.stringify(RUNNING_JOB)}\n\n`)).toBeNull();
  });

  test('returns null for an unknown event type', () => {
    expect(parseSseEvent(sseChunk('not-a-real-event-type', JSON.stringify(RUNNING_JOB)))).toBeNull();
  });

  test('returns null when data is missing', () => {
    expect(parseSseEvent('event:created\n\n')).toBeNull();
  });

  test('returns null when data is empty', () => {
    expect(parseSseEvent(sseChunk('created', ''))).toBeNull();
  });

  test('returns null when data is not a valid job', () => {
    expect(parseSseEvent(sseChunk('created', JSON.stringify({ foo: 'bar' })))).toBeNull();
  });

  test('returns null when data is not valid JSON', () => {
    expect(parseSseEvent(sseChunk('created', '{not json'))).toBeNull();
  });
});

const streamOf = (chunks: string[]): ReadableStream<Uint8Array> => {
  const encoder = new TextEncoder();

  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }

      controller.close();
    },
  });
};

const collect = async (stream: ReadableStream<Uint8Array>): Promise<string[]> => {
  const events: string[] = [];

  for await (const event of readSseEvents(stream)) {
    events.push(event);
  }

  return events;
};

describe('readSseEvents', () => {
  test('yields a single event received in one read', async () => {
    const event = sseChunk('created', JSON.stringify(RUNNING_JOB));

    expect(await collect(streamOf([event]))).toEqual([event.trim()]);
  });

  test('yields multiple events received in one read', async () => {
    const created = sseChunk('created', JSON.stringify(RUNNING_JOB));
    const updated: Job = { ...RUNNING_JOB, status: Status.SUCCESS, ended: 2_000 };
    const updatedEvent = sseChunk('updated', JSON.stringify(updated));

    expect(await collect(streamOf([created + updatedEvent]))).toEqual([created.trim(), updatedEvent.trim()]);
  });

  test('reassembles an event whose "data:" line is split mid-line across multiple reads', async () => {
    // Reproduces a production bug: a long job `name` pushed a `data:` line's JSON payload
    // across a stream chunk boundary, right in the middle of the `"status"` field. Each half
    // was previously parsed as its own (invalid) "event", instead of being buffered and
    // reassembled into the one complete event they actually make up.
    const event = sseChunk('updated', JSON.stringify(RUNNING_JOB));
    const splitPoint = event.indexOf('"status"');
    const firstRead = event.slice(0, splitPoint);
    const secondRead = event.slice(splitPoint);

    expect(await collect(streamOf([firstRead, secondRead]))).toEqual([event.trim()]);
  });

  test('reassembles an event split exactly on the blank-line boundary between reads', async () => {
    const event = sseChunk('created', JSON.stringify(RUNNING_JOB));
    const splitPoint = event.indexOf('\n\n') + 1; // between the two newlines making up the blank line
    const firstRead = event.slice(0, splitPoint);
    const secondRead = event.slice(splitPoint);

    expect(await collect(streamOf([firstRead, secondRead]))).toEqual([event.trim()]);
  });

  test('discards an incomplete trailing event when the stream ends without a blank line', async () => {
    const incompleteEvent = 'event:created\ndata:{"id":"job-1"';

    expect(await collect(streamOf([incompleteEvent]))).toEqual([]);
  });
});
