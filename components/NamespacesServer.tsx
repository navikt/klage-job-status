import type { ReactNode } from 'react';
import { AppShell } from '@/components/AppShell';
import { getNamespacesForRequest } from '@/lib/namespaces';
import type { ThemeEnum } from '@/lib/theme-shared';

interface NamespacesServerProps {
  initialTheme: ThemeEnum | null;
  children: ReactNode;
}

/**
 * Awaits the namespace list server-side (see `lib/namespaces.ts`) before rendering the rest of
 * the app shell, so `AppShell`'s `NamespaceProvider` always starts with real data instead of an
 * empty list and a client-side loading state.
 *
 * Rendered inside a `<Suspense>` boundary in `app/layout.tsx`, so Next.js streams
 * `AppShellFallback` immediately and swaps in this component's output once the (memoized) Valkey
 * lookup resolves - no client-side fetch/loading state needed in `NamespaceContext` at all.
 */
export default async function NamespacesServer({ initialTheme, children }: NamespacesServerProps) {
  const namespaces = await getNamespacesForRequest();

  return (
    <AppShell initialTheme={initialTheme} initialNamespaces={namespaces}>
      {children}
    </AppShell>
  );
}
