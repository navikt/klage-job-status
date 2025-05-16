import { createHmac } from 'node:crypto';
import { isAccessScope } from '@app/api-key/scope';
import { API_KEY_SECRET } from '@app/api-key/secret';
import { ErrorEnum } from '@app/error';

export const generateApiKey = (namespace: string, scope: string): [null, ErrorEnum] | [string, null] => {
  if (!isAccessScope(scope)) {
    return [null, ErrorEnum.INVALID_SCOPE];
  }

  const key = `${namespace}:${scope}`;
  const signature = createHmac('sha256', API_KEY_SECRET).update(key).digest('base64url');

  return [`${key}.${signature}`, null];
};
