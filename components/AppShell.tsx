'use client';

import { Box, VStack } from '@navikt/ds-react';
import { useParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { Footer } from '@/components/Footer';
import { Header } from '@/components/Header';
import { ThemeShell } from '@/components/ThemeShell';
import { NamespaceProvider } from '@/context/NamespaceContext';
import type { ThemeEnum } from '@/lib/theme-shared';

interface AppShellProps {
  /** Resolved server-side in `app/layout.tsx` - see `lib/theme.ts#getServerTheme`. */
  initialTheme: ThemeEnum | null;
  /** Resolved server-side, streamed in via Suspense - see `components/NamespacesServer.tsx`. */
  initialNamespaces: string[];
  children: ReactNode;
}

/**
 * The shell shared by every page (`app/layout.tsx`): theme, header, footer, and the namespace
 * context they all depend on.
 *
 * The current namespace comes straight from the route via `useParams` - present on
 * `/namespace/[namespace]`, absent (`undefined`) on `/` - rather than being threaded down from
 * each page as a prop.
 */
export const AppShell = ({ initialTheme, initialNamespaces, children }: AppShellProps) => {
  const { namespace } = useParams<{ namespace?: string }>();

  return (
    <ThemeShell initialTheme={initialTheme}>
      {(theme, toggleTheme) => (
        <NamespaceProvider namespace={namespace ?? null} initialNamespaces={initialNamespaces}>
          <VStack width="100%" minHeight="100%">
            <Header theme={theme} onToggleTheme={toggleTheme} />

            <Box
              width="100%"
              background="sunken"
              paddingInline="space-16"
              paddingBlock="space-32"
              maxWidth="500"
              flexGrow="1"
              marginInline="auto"
            >
              {children}
            </Box>

            <Footer />
          </VStack>
        </NamespaceProvider>
      )}
    </ThemeShell>
  );
};
