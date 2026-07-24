'use client';

import { Loader, VStack } from '@navikt/ds-react';
import { ThemeShell } from '@/components/ThemeShell';
import type { ThemeEnum } from '@/lib/theme-shared';

interface AppShellFallbackProps {
  /** Same as `AppShell`'s - resolved server-side, so even the fallback has the right theme. */
  initialTheme: ThemeEnum | null;
}

/**
 * `<Suspense>` fallback for `NamespacesServer` (see `app/layout.tsx`), shown while the namespace
 * list is being fetched. Renders its own `<Theme>` (rather than waiting for `AppShell`'s) so the
 * correct theme applies immediately, with no flash once the real shell streams in.
 */
export const AppShellFallback = ({ initialTheme }: AppShellFallbackProps) => (
  <ThemeShell initialTheme={initialTheme}>
    {() => (
      <VStack align="center" justify="center" width="100%" minHeight="100%">
        <Loader size="3xlarge" title="Loading..." />
      </VStack>
    )}
  </ThemeShell>
);
