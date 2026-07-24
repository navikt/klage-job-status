'use client';

import { Theme } from '@navikt/ds-react';
import { useTheme } from '@/hooks/theme';
import type { ThemeEnum } from '@/lib/theme-shared';

interface ThemeShellProps {
  /** Resolved server-side in `app/layout.tsx` - see `lib/theme.ts#getServerTheme`. */
  initialTheme: ThemeEnum | null;
  children: (theme: ThemeEnum, toggleTheme: () => void) => React.ReactNode;
}

/**
 * Shared `<Theme>` wrapper for `AppShell` and `AppShellFallback`, so both render the
 * correct theme immediately and stay in sync on how the theme is resolved and applied.
 */
export const ThemeShell = ({ initialTheme, children }: ThemeShellProps) => {
  const [theme, toggleTheme] = useTheme(initialTheme);

  return (
    <Theme theme={theme} hasBackground={false} className="flex min-h-full w-full">
      {children(theme, toggleTheme)}
    </Theme>
  );
};
