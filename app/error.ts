import { ErrorEnum } from '@app/types';

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
    case ErrorEnum.UNKNOWN:
      return new Response('Unknown error', { status: 500 });
    default:
      return new Response('Unknown error', { status: 500 });
  }
};
