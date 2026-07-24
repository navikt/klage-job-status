'use client';

import { useCallback, useEffect, useState } from 'react';
import { isTheme, THEME_COOKIE_NAME, ThemeEnum } from '@/lib/theme-shared';

/** ~1 year, in seconds. */
const THEME_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/**
 * Reads the `theme` cookie. Prefers the Cookie Store API
 * (https://developer.mozilla.org/en-US/docs/Web/API/Cookie_Store_API) - Baseline since June
 * 2025 - falling back to parsing `document.cookie` for older browsers that don't have it.
 */
const readThemeCookie = async (): Promise<ThemeEnum | null> => {
  if (window.cookieStore !== undefined) {
    const cookie = await window.cookieStore.get(THEME_COOKIE_NAME);
    return isTheme(cookie?.value) ? cookie.value : null;
  }

  const match = document.cookie.match(/(?:^|;\s*)theme=([^;]*)/);
  const value = match?.[1];

  return isTheme(value) ? value : null;
};

/** Writes the `theme` cookie - see `readThemeCookie` for the same Cookie Store API preference. */
const writeThemeCookie = async (theme: ThemeEnum): Promise<void> => {
  if (window.cookieStore !== undefined) {
    await window.cookieStore.set({
      name: THEME_COOKIE_NAME,
      value: theme,
      path: '/',
      maxAge: THEME_COOKIE_MAX_AGE_SECONDS,
      sameSite: 'lax',
    });

    return;
  }

  // Fallback for browsers without the Cookie Store API (checked above) - there's no other
  // cross-browser way to write a cookie.
  // biome-ignore lint/suspicious/noDocumentCookie: see above.
  document.cookie = `${THEME_COOKIE_NAME}=${theme}; path=/; max-age=${THEME_COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
};

/**
 * Theme state, initialized from `initialTheme` - resolved server-side in `app/layout.tsx` from
 * the `theme` cookie or, failing that, the `Sec-CH-Prefers-Color-Scheme` client hint (see
 * `lib/theme.ts`) - so the server can render the right theme on the very first response, instead
 * of needing a client-only render.
 *
 * If neither was available (a first-time visitor whose browser doesn't send the client hint -
 * currently only Chromium does), `initialTheme` is `null` and the server rendered `light` as a
 * guess. This effect corrects that guess once, from `matchMedia`, and persists it to the cookie
 * so every later request (from any browser) renders the right theme immediately.
 */
export const useTheme = (initialTheme: ThemeEnum | null): [ThemeEnum, () => void] => {
  const [theme, setTheme] = useState(initialTheme ?? ThemeEnum.Light);

  useEffect(() => {
    if (initialTheme !== null) {
      return;
    }

    const preferredTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? ThemeEnum.Dark : ThemeEnum.Light;

    setTheme(preferredTheme);
    writeThemeCookie(preferredTheme);
  }, [initialTheme]);

  // Cookies don't fire an event in other tabs the way `localStorage` does, so instead pick up a
  // theme changed in another tab when this one regains focus.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') {
        return;
      }

      readThemeCookie().then((cookieTheme) => {
        if (cookieTheme !== null) {
          setTheme(cookieTheme);
        }
      });
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((currentTheme) => {
      const newTheme = currentTheme === ThemeEnum.Light ? ThemeEnum.Dark : ThemeEnum.Light;
      writeThemeCookie(newTheme);
      return newTheme;
    });
  }, []);

  return [theme, toggleTheme];
};
