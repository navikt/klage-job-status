import { createHmac } from 'node:crypto';
import { isAccessScope } from '@/lib/api-key/scope';
import { getApiKeySecret } from '@/lib/api-key/secret';
import { ErrorEnum } from '@/lib/error';

export const generateApiKey = (namespace: string, scope: string): [null, ErrorEnum] | [string, null] => {
  if (!isAccessScope(scope)) {
    return [null, ErrorEnum.INVALID_SCOPE];
  }

  const key = `${namespace}:${scope}`;
  const signature = createHmac('sha256', getApiKeySecret()).update(key).digest('base64url');

  return [`${key}.${signature}`, null];
};
