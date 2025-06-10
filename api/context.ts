import { type Extra, LOGS } from '@api/logging';
import { getSpanId, getTraceId } from '@api/trace-id';
import type { BunRequest } from 'bun';

export interface Context {
  debug: (msg: string, extra?: Extra) => void;
  info: (msg: string, extra?: Extra) => void;
  warn: (msg: string, extra?: Extra) => void;
  error: (msg: string, extra?: Extra) => void;
}

export const getLogContext = (module: string, req: BunRequest): Context => {
  const trace_id = getTraceId();
  const span_id = getSpanId();

  const { url, method, referrer } = req;

  return {
    debug: (msg, extra) => LOGS.debug(msg, trace_id, span_id, module, { url, method, referrer, ...extra }),
    info: (msg, extra) => LOGS.info(msg, trace_id, span_id, module, { url, method, referrer, ...extra }),
    warn: (msg, extra) => LOGS.warn(msg, trace_id, span_id, module, { url, method, referrer, ...extra }),
    error: (msg, extra) => LOGS.error(msg, trace_id, span_id, module, { url, method, referrer, ...extra }),
  };
};
