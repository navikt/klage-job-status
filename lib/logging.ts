enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

export type Extra = Record<string, string | number | boolean | Error>;
export type LogFunction = (message: string, module: string, extra?: Extra) => void;

const log =
  (level: LogLevel): LogFunction =>
  (message, module, extra) =>
    console[level](
      JSON.stringify({
        ...extra,
        level,
        message,
        time: new Date().toISOString(),
        module,
      }),
    );

export const LOGS = {
  debug: log(LogLevel.DEBUG),
  info: log(LogLevel.INFO),
  warn: log(LogLevel.WARN),
  error: log(LogLevel.ERROR),
};
