import { describe, expect, test } from 'bun:test';
// `action/sse.ts` imports `@action/handle-job`, which pulls in `@action/input` transitively -
// see `action/test-env.ts` for why this must be imported before anything that touches it.
import './test-env';
import { parseSseEvent } from '@action/sse';
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
