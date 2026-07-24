import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Suspense } from 'react';
import { AppShellFallback } from '@/components/AppShellFallback';
import NamespacesServer from '@/components/NamespacesServer';
import { getServerTheme } from '@/lib/theme';

import './globals.css';

export const metadata: Metadata = {
  title: 'Job Status Dashboard',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const initialTheme = await getServerTheme();

  return (
    <html lang="en" className="h-full w-full">
      <body className="h-full w-full">
        <Suspense fallback={<AppShellFallback initialTheme={initialTheme} />}>
          <NamespacesServer initialTheme={initialTheme}>{children}</NamespacesServer>
        </Suspense>
      </body>
    </html>
  );
}
