export type ColorScheme = 'cn' | 'us';

export type DisplayConfig = {
  colorScheme: ColorScheme;
  decimalPlaces: number;
  privacyHidden: boolean;
};

export const DISPLAY_STORAGE_KEY = 'displayConfig';

export const DEFAULT_DISPLAY_CONFIG: DisplayConfig = {
  colorScheme: 'cn',
  decimalPlaces: 2,
  privacyHidden: false,
};

export function normalizeDisplayConfig(value: unknown): DisplayConfig {
  const cfg = (value && typeof value === 'object' ? value : {}) as Partial<DisplayConfig>;
  const colorScheme: ColorScheme = cfg.colorScheme === 'us' ? 'us' : 'cn';
  const decimalPlaces = Number.isFinite(cfg.decimalPlaces) ? Math.min(4, Math.max(0, Number(cfg.decimalPlaces))) : DEFAULT_DISPLAY_CONFIG.decimalPlaces;
  const privacyHidden = typeof cfg.privacyHidden === 'boolean' ? cfg.privacyHidden : DEFAULT_DISPLAY_CONFIG.privacyHidden;
  return { colorScheme, decimalPlaces, privacyHidden };
}
