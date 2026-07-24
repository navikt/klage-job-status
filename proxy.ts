import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

/**
 * Opts into the `Sec-CH-Prefers-Color-Scheme` Client Hint (part of the User-Preference Media
 * Features Client Hints spec), so supporting browsers start sending their OS/browser dark-mode
 * preference as a request header on later requests - letting `lib/theme.ts#getServerTheme`
 * render the right theme server-side for some first-time visitors, without waiting for
 * client-side JS.
 *
 * Only Chromium-based browsers currently implement this hint (not Firefox or Safari), and even
 * they only start sending it from their *next* request onwards - never the very first one of a
 * session. It's a best-effort improvement layered on top of the `theme` cookie, not a full
 * solution - see `lib/theme.ts` for the fallback chain, and `hooks/theme.ts#useTheme` for how an
 * unknown theme is resolved client-side instead.
 */
export function proxy(_request: NextRequest) {
  const response = NextResponse.next();

  response.headers.set('Accept-CH', 'Sec-CH-Prefers-Color-Scheme');
  response.headers.append('Vary', 'Sec-CH-Prefers-Color-Scheme');
  // Tells supporting browsers this hint matters enough to retry the request once they've agreed
  // to send it, instead of waiting until the next unrelated navigation.
  response.headers.set('Critical-CH', 'Sec-CH-Prefers-Color-Scheme');

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
