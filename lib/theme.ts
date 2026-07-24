import { cookies, headers } from 'next/headers';
import { isTheme, THEME_COOKIE_NAME, type ThemeEnum } from '@/lib/theme-shared';

/**
 * Resolves the theme to render for this request, so the server can send the right theme in its
 * very first response instead of only knowing it after client-side JS runs.
 *
 * There is no standard, universally supported way to read `prefers-color-scheme` from a
 * completely unknown, first-time visitor - that preference lives in the OS/browser, not in
 * anything sent over HTTP by default. This resolves it in order of reliability:
 *
 * 1. The `theme` cookie - set once the client knows the user's real preference, whether from an
 *    explicit toggle or an inferred one (see `hooks/theme.ts#useTheme`). Works for every
 *    browser, but only from a visitor's *second* request onwards.
 * 2. The `Sec-CH-Prefers-Color-Scheme` User-Preference Media Features Client Hint, opted into via
 *    the `Accept-CH` response header set in `middleware.ts`. Only Chromium-based browsers
 *    currently implement this, and, like the cookie, only from the second request onwards (a
 *    browser only starts sending a hint after seeing the server ask for it once).
 * 3. `null` - genuinely unknown. The caller should render a default (this app uses `light`) and
 *    let the client correct it via `matchMedia` on mount, same as it would for a brand new
 *    visitor on a non-Chromium browser.
 */
export const getServerTheme = async (): Promise<ThemeEnum | null> => {
  const cookieStore = await cookies();
  const cookieTheme = cookieStore.get(THEME_COOKIE_NAME)?.value;

  if (isTheme(cookieTheme)) {
    return cookieTheme;
  }

  const headersList = await headers();
  const clientHintTheme = headersList.get('sec-ch-prefers-color-scheme');

  return isTheme(clientHintTheme) ? clientHintTheme : null;
};
