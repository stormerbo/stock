import type { ThemeMode } from '../popup/types';
import type { ColorScheme } from './display';
import { applyCssVariables, getDesignTokenVariables, type TokenThemeMode } from './design-tokens';

export const THEME_STORAGE_KEY = 'popup-theme';

export function normalizeThemeMode(value: unknown): ThemeMode {
  return value === 'light' || value === 'dark' || value === 'white' ? value : 'dark';
}

export function resolveThemeMode(value: unknown): TokenThemeMode {
  return normalizeThemeMode(value);
}

export function getThemeVariables(
  themeMode: ThemeMode,
  colorScheme: ColorScheme = 'cn',
): Record<string, string> {
  return getDesignTokenVariables(themeMode, colorScheme);
}

export function applyThemeVariables(
  target: Document | HTMLElement,
  themeMode: ThemeMode,
  colorScheme: ColorScheme = 'cn',
): Record<string, string> {
  const host = target instanceof HTMLElement ? target : target.documentElement;
  const variables = getThemeVariables(themeMode, colorScheme);
  applyCssVariables(host, variables);
  return variables;
}
