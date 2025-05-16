export enum ErrorEnum {
  NOT_FOUND = 'NOT_FOUND',
  ALREADY_ENDED = 'ALREADY_ENDED',
  ALREADY_EXISTS = 'ALREADY_EXISTS',
  ERROR_UPDATING = 'ERROR_UPDATING',
  ERROR_DELETING = 'ERROR_DELETING',
  INVALID_JOB_ID = 'INVALID_JOB_ID',
  /**
   * The request is missing the API_KEY header or the API_KEY header format is invalid.
   */
  UNAUTHENTICATED = 'UNAUTHENTICATED',
  /**
   * The provided API key does not have the required scope, namespace or signature.
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
