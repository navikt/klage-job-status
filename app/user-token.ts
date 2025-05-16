import { IS_LOCAL } from '@app/env';
import { ErrorEnum } from '@app/error';

export const authenticate = (req: Request): [string, null] | [null, ErrorEnum] => {
  if (IS_LOCAL) {
    return ['T123456', null];
  }

  const authorization = req.headers.get('Authorization');

  if (authorization === null) {
    return [null, ErrorEnum.UNAUTHENTICATED];
  }

  const [, token] = authorization.split(' ');

  if (token === undefined) {
    return [null, ErrorEnum.UNAUTHENTICATED];
  }

  const [_header, payload, _sign] = token.split('.');

  if (payload === undefined) {
    return [null, ErrorEnum.UNAUTHENTICATED];
  }

  const json = JSON.parse(atob(payload));

  if (!isTokenPayload(json)) {
    return [null, ErrorEnum.UNAUTHENTICATED];
  }

  return [json.NAVident, null];
};

interface TokenPayload {
  sub: string; // Subject (user ID)
  exp: number; // Expiration time (in seconds since epoch)
  NAVident: string; // NAVident (user identifier)
}

const isTokenPayload = (payload: unknown): payload is TokenPayload => {
  if (typeof payload !== 'object' || payload === null) {
    return false;
  }

  const { sub, exp, NAVident } = payload as TokenPayload;

  if (typeof sub !== 'string' || typeof NAVident !== 'string') {
    return false;
  }

  if (typeof exp !== 'number') {
    return false;
  }

  return true;
};
