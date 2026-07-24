export enum ThemeEnum {
  Light = 'light',
  Dark = 'dark',
}

const THEME_VALUES: readonly string[] = Object.values(ThemeEnum);
export const isTheme = (value: string | null | undefined): value is ThemeEnum =>
  value !== null && value !== undefined && THEME_VALUES.includes(value);

/** Shared by `hooks/theme.ts` (client) and `lib/theme.ts` (server), which both read/write it. */
export const THEME_COOKIE_NAME = 'theme';
