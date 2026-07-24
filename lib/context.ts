import { type Extra, LOGS } from '@/lib/logging';

export interface Context {
  debug: (msg: string, extra?: Extra) => void;
  info: (msg: string, extra?: Extra) => void;
  warn: (msg: string, extra?: Extra) => void;
  error: (msg: string, extra?: Extra) => void;
}

export const getLogContext = (module: string, req: Request): Context => {
  const { url, method, referrer } = req;

  return {
    debug: (msg, extra) => LOGS.debug(msg, module, { url, method, referrer, ...extra }),
    info: (msg, extra) => LOGS.info(msg, module, { url, method, referrer, ...extra }),
    warn: (msg, extra) => LOGS.warn(msg, module, { url, method, referrer, ...extra }),
    error: (msg, extra) => LOGS.error(msg, module, { url, method, referrer, ...extra }),
  };
};
