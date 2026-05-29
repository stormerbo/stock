import type { ThemeMode } from '../popup/types';

export const THEME_STORAGE_KEY = 'popup-theme';

export function normalizeThemeMode(value: unknown): ThemeMode {
  return value === 'light' || value === 'dark' || value === 'white' ? value : 'dark';
}
