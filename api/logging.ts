enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

export enum Method {
  GET = 'GET',
  POST = 'POST',
  DELETE = 'DELETE',
  PUT = 'PUT',
}

export type Extra = Record<string, string | number | boolean | Error>;
export type LogFunction = (msg: string, trace_id: string, span_id: string, module: string, extra?: Extra) => void;

export const log =
  (level: LogLevel): LogFunction =>
  (message, trace_id, span_id, module, extra) =>
    console[level](
      JSON.stringify({
        ...extra,
        level,
        message,
        time: new Date().toISOString(),
        module,
        trace_id,
        span_id,
      }),
    );

export const LOGS = {
  debug: log(LogLevel.DEBUG),
  info: log(LogLevel.INFO),
  warn: log(LogLevel.WARN),
  error: log(LogLevel.ERROR),
};
