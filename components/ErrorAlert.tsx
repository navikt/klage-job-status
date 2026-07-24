'use client';

import { BodyLong, Button, LocalAlert, VStack } from '@navikt/ds-react';
import { ErrorReferenceType, type ErrorWithDigest, getErrorReference } from '@/lib/tracer';

interface ErrorAlertProps {
  title: string;
  description: string;
  error: ErrorWithDigest;
  retry: () => void;
}

/**
 * Shared UI for the `error.tsx` boundaries (`app/error.tsx`, `app/namespace/[namespace]/error.tsx`).
 * Next.js replaces `error.message` with a generic placeholder for Server Component errors in
 * production, so `title`/`description` can't depend on the actual message - each boundary passes
 * copy written for the realistic cause(s) on its own segment instead. `error.digest` is shown as
 * a "Trace ID" if it was set by `withTraceDigest`, or a generic "Error reference" otherwise (see
 * `getErrorReference` in `lib/tracer.ts`).
 */
export const ErrorAlert = ({ title, description, error, retry }: ErrorAlertProps) => {
  const reference = getErrorReference(error);

  return (
    <VStack align="center" justify="center" width="100%" minHeight="100%" gap="space-16">
      <LocalAlert status="error">
        <LocalAlert.Header>
          <LocalAlert.Title>{title}</LocalAlert.Title>
        </LocalAlert.Header>
        <LocalAlert.Content>
          <BodyLong size="small" spacing>
            {description}
          </BodyLong>

          {reference !== undefined ? (
            <BodyLong size="small">
              <span>{REFERENCE_LABEL[reference.type]}: </span>
              <code>{reference.value}</code>
            </BodyLong>
          ) : null}
        </LocalAlert.Content>
      </LocalAlert>

      <Button variant="secondary" onClick={retry}>
        Try again
      </Button>
    </VStack>
  );
};

const REFERENCE_LABEL: Record<ErrorReferenceType, string> = {
  [ErrorReferenceType.TRACE_ID]: 'Trace ID',
  [ErrorReferenceType.DIGEST]: 'Error reference',
};
