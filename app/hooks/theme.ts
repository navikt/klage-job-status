import { Observable } from '@app/observable/observable';
import { useSyncExternalStore } from 'react';

export enum ThemeEnum {
  Light = 'light',
  Dark = 'dark',
}

const THEME_VALUES = Object.values(ThemeEnum);
const isTheme = (value: unknown): value is ThemeEnum => THEME_VALUES.includes(value as ThemeEnum);

const LOCAL_STORAGE_THEME_KEY = 'theme';

const getTheme = (): ThemeEnum => {
  const storedTheme = localStorage.getItem(LOCAL_STORAGE_THEME_KEY);

  if (isTheme(storedTheme)) {
    return storedTheme;
  }

  if (storedTheme !== null) {
    console.warn(`Invalid theme value in local storage: "${storedTheme}". Falling back to browser preference.`);
    localStorage.removeItem(LOCAL_STORAGE_THEME_KEY);
  }

  // Default to browser preference if no theme is set in local storage.
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? ThemeEnum.Dark : ThemeEnum.Light;
};

const store = new Observable<ThemeEnum>(getTheme(), (theme) => {
  localStorage.setItem(LOCAL_STORAGE_THEME_KEY, theme);
  return theme;
});

const listener = ({ newValue }: StorageEvent) => {
  if (isTheme(newValue)) {
    store.set(newValue);
  }
};

// Listen for changes in local storage to update the theme.
// This is useful when the user changes the theme in another tab.
window.addEventListener('storage', listener);

export const useToggleTheme = () => () =>
  store.set((theme) => (theme === ThemeEnum.Light ? ThemeEnum.Dark : ThemeEnum.Light));

export const useTheme = () => useSyncExternalStore(store.subscribe, store.get, getTheme);
