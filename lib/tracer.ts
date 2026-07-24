import { type Attributes, SpanStatusCode, trace } from '@opentelemetry/api';
import type { ErrorInfo } from 'next/error';

const tracer = trace.getTracer('klage-job-status');

/**
 * An `Error` with an optional `digest`, matching the shape Next.js passes to Server Component
 * error boundaries (`app/error.tsx`, `app/namespace/[namespace]/error.tsx`). Extend `Error`
 * directly rather than typing `digest` on plain `Error` instances via a cast.
 */
export class ErrorWithDigest extends Error {
  digest?: string;
}

/**
 * Props for an App Router `error.tsx` boundary. Reuses Next.js's own `ErrorInfo` type (exported,
 * somewhat confusingly, from `next/error` rather than `next/navigation` or similar) for `reset`/
 * `retry`, replacing only `error`'s type with {@link ErrorWithDigest}.
 */
export type ErrorBoundaryProps = Omit<ErrorInfo, 'error'> & { error: ErrorWithDigest };

/**
 * Prefixes `digest` values set by `withTraceDigest`, so `getTraceId` can tell them apart from
 * Next.js's own auto-generated digest (an opaque hash - see `error-telemetry-utils.js` in the
 * Next.js source) for any other error that didn't go through `withTraceDigest`. Distinguishing
 * by string format alone (e.g. checking for a 32-character hex string) would be fragile, since
 * it'd depend on undocumented internals of both formats.
 */
const TRACE_DIGEST_PREFIX = 'trace-id:';

/**
 * Creates an `ErrorWithDigest` with `digest` set to the current active span's trace ID, if one
 * exists. Next.js only auto-generates `error.digest` when it isn't already set on a thrown
 * `Error` (see `create-error-handler.js` in the Next.js source), so setting it here means Server
 * Component error boundaries receive a value that's directly useful for looking up the request
 * in Grafana Tempo, instead of Next's own opaque hash.
 */
export const withTraceDigest = (message: string): ErrorWithDigest => {
  const error = new ErrorWithDigest(message);
  const traceId = trace.getActiveSpan()?.spanContext().traceId;

  if (traceId !== undefined) {
    error.digest = `${TRACE_DIGEST_PREFIX}${traceId}`;
  }

  return error;
};

/**
 * A reference to show alongside an error, extracted from `error.digest`. `TRACE_ID` means
 * `digest` was set by `withTraceDigest` and can be looked up in Grafana Tempo; `DIGEST` means it
 * wasn't (e.g. Next.js's own auto-generated hash for an error that didn't go through
 * `withTraceDigest`) but is still worth showing as a fallback reference.
 */
export enum ErrorReferenceType {
  TRACE_ID,
  DIGEST,
}

export interface ErrorReference {
  type: ErrorReferenceType;
  value: string;
}

/**
 * Extracts a reference to show for `error.digest`, distinguishing a trace ID set by
 * `withTraceDigest` from any other digest (see {@link ErrorReference}). Returns `undefined` when
 * there's no digest, or when it isn't a string - Next.js only guarantees `digest` is truthy
 * before forwarding it (see `create-error-handler.js`), not that it's a string, so a thrown
 * value with a pre-existing non-string `digest` property could otherwise reach here.
 */
export const getErrorReference = ({ digest }: ErrorWithDigest): ErrorReference | undefined => {
  if (typeof digest !== 'string') {
    return undefined;
  }

  return digest.startsWith(TRACE_DIGEST_PREFIX)
    ? { type: ErrorReferenceType.TRACE_ID, value: digest.slice(TRACE_DIGEST_PREFIX.length) }
    : { type: ErrorReferenceType.DIGEST, value: digest };
};

/**
 * Runs `fn` inside a new active span named `name`, recording any thrown error on the span
 * (exception + `ERROR` status) before rethrowing, and always ending the span afterwards.
 */
export const withSpan = <T>(name: string, attributes: Attributes, fn: () => Promise<T>): Promise<T> =>
  tracer.startActiveSpan(name, { attributes }, async (span) => {
    try {
      return await fn();
    } catch (error) {
      span.recordException(error instanceof Error ? error : String(error));
      span.setStatus({ code: SpanStatusCode.ERROR, message: error instanceof Error ? error.message : String(error) });
      throw error;
    } finally {
      span.end();
    }
  });

/** Synchronous counterpart to {@link withSpan}, for CPU-only work such as verifying a signature. */
export const withSyncSpan = <T>(name: string, attributes: Attributes, fn: () => T): T =>
  tracer.startActiveSpan(name, { attributes }, (span) => {
    try {
      return fn();
    } catch (error) {
      span.recordException(error instanceof Error ? error : String(error));
      span.setStatus({ code: SpanStatusCode.ERROR, message: error instanceof Error ? error.message : String(error) });
      throw error;
    } finally {
      span.end();
    }
  });
