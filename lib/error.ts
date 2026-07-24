import { MAX_REQUEST_BODY_SIZE } from '@/lib/request';

export enum ErrorEnum {
  NOT_FOUND = 'NOT_FOUND',
  ALREADY_ENDED = 'ALREADY_ENDED',
  ALREADY_EXISTS = 'ALREADY_EXISTS',
  ERROR_UPDATING = 'ERROR_UPDATING',
  ERROR_DELETING = 'ERROR_DELETING',
  INVALID_JOB_ID = 'INVALID_JOB_ID',
  /**
   * The request body exceeds the maximum allowed size.
   */
  PAYLOAD_TOO_LARGE = 'PAYLOAD_TOO_LARGE',
  /**
   * The request is missing the API_KEY header, the API_KEY header format is invalid, or the
   * key's signature does not match (missing, forged or tampered with).
   */
  UNAUTHENTICATED = 'UNAUTHENTICATED',
  /**
   * The provided API key is authentic, but does not have the required scope or namespace.
   */
  UNAUTHORIZED = 'UNAUTHORIZED',
  INVALID_SCOPE = 'INVALID_SCOPE',
  INVALID_NAMESPACE = 'INVALID_NAMESPACE',
  UNKNOWN = 'UNKNOWN',
}

export const getErrorResponse = (error: ErrorEnum): Response => {
  switch (error) {
    case ErrorEnum.NOT_FOUND:
      return new Response('Job not found', { status: 404 });
    case ErrorEnum.ALREADY_ENDED:
      return new Response('Job already ended', { status: 409 });
    case ErrorEnum.ALREADY_EXISTS:
      return new Response('Job already exists', { status: 409 });
    case ErrorEnum.ERROR_UPDATING:
      return new Response('Error updating job data', { status: 500 });
    case ErrorEnum.ERROR_DELETING:
      return new Response('Error deleting job data', { status: 500 });
    case ErrorEnum.INVALID_JOB_ID:
      return new Response('Invalid job ID', { status: 400 });
    case ErrorEnum.PAYLOAD_TOO_LARGE:
      return new Response(`Request body too large. Max size is ${MAX_REQUEST_BODY_SIZE} bytes.`, { status: 413 });
    case ErrorEnum.UNAUTHENTICATED:
      return new Response(
        'Unauthenticated. Refer to the <a href="https://github.com/navikt/klage-job-status/blob/main/README.md">README</a> on how to get and use API keys.',
        {
          status: 401,
          headers: { 'Content-Type': 'text/html' },
        },
      );
    case ErrorEnum.UNAUTHORIZED:
      return new Response('Unauthorized. You do not have access to the requested resource or action.', { status: 403 });
    case ErrorEnum.INVALID_SCOPE:
      return new Response('Invalid scope.', { status: 400 });
    case ErrorEnum.INVALID_NAMESPACE:
      return new Response('Invalid namespace.', { status: 400 });
    case ErrorEnum.UNKNOWN:
      return new Response('Unknown error', { status: 500 });
  }
};
