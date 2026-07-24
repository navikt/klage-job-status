import { HStack } from '@navikt/ds-react';

/**
 * `<Suspense>` fallback for `JobsServer` (see `app/namespace/[namespace]/page.tsx`), shown while
 * the initial job snapshot is being fetched server-side.
 */
export const JobsListFallback = () => (
  <HStack align="center" justify="center" height="50" className="text-text-subtle">
    Loading jobs...
  </HStack>
);
