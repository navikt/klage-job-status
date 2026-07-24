import type { JobEvent } from '@common/common';

const encoder = new TextEncoder();

/**
 * Encode a job event as an SSE `event`/`data` frame.
 *
 * Chunks enqueued into a `ReadableStream` response body must be `Uint8Array` when running on
 * Node's `undici` (unlike Bun, which accepts strings), hence the explicit `TextEncoder`.
 */
export const sseEvent = ({ eventType, job }: JobEvent): Uint8Array =>
  encoder.encode(`event:${eventType}\ndata:${JSON.stringify(job)}\n\n`);

export const sseHeartbeat = (): Uint8Array => encoder.encode('event:heartbeat\n\n');

export const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
} as const;
