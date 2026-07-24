// Ambient declarations for non-code imports handled by the Next.js bundler.
declare module '*.css';

// Minimal ambient types for the Cookie Store API (https://developer.mozilla.org/en-US/docs/Web/API/Cookie_Store_API).
// Baseline 2025, but not yet in TypeScript's bundled `lib.dom.d.ts` - see `hooks/theme.ts`, which
// feature-detects it and falls back to `document.cookie` for older browsers.
interface CookieStoreGetOptions {
  name: string;
}

interface CookieListItem {
  name: string;
  value: string;
}

interface CookieInit {
  name: string;
  value: string;
  path?: string;
  maxAge?: number;
  sameSite?: 'strict' | 'lax' | 'none';
}

interface CookieStore {
  get(name: string): Promise<CookieListItem | null>;
  get(options: CookieStoreGetOptions): Promise<CookieListItem | null>;
  set(name: string, value: string): Promise<void>;
  set(options: CookieInit): Promise<void>;
}

interface Window {
  readonly cookieStore?: CookieStore;
}
