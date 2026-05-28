export type ColorScheme = 'cn' | 'us';

export type DisplayConfig = {
  colorScheme: ColorScheme;
  decimalPlaces: number;
  privacyHidden: boolean;
  stockPrivacyHidden: boolean;
  fundPrivacyHidden: boolean;
};

export const DISPLAY_STORAGE_KEY = 'displayConfig';

export const DEFAULT_DISPLAY_CONFIG: DisplayConfig = {
  colorScheme: 'cn',
  decimalPlaces: 2,
  privacyHidden: false,
  stockPrivacyHidden: false,
  fundPrivacyHidden: false,
};

export function normalizeDisplayConfig(value: unknown): DisplayConfig {
  const cfg = (value && typeof value === 'object' ? value : {}) as Partial<DisplayConfig>;
  const colorScheme: ColorScheme = cfg.colorScheme === 'us' ? 'us' : 'cn';
  const decimalPlaces = Number.isFinite(cfg.decimalPlaces) ? Math.min(4, Math.max(0, Number(cfg.decimalPlaces))) : DEFAULT_DISPLAY_CONFIG.decimalPlaces;
  const legacyHidden = typeof cfg.privacyHidden === 'boolean' ? cfg.privacyHidden : DEFAULT_DISPLAY_CONFIG.privacyHidden;
  const stockPrivacyHidden = typeof cfg.stockPrivacyHidden === 'boolean' ? cfg.stockPrivacyHidden : legacyHidden;
  const fundPrivacyHidden = typeof cfg.fundPrivacyHidden === 'boolean' ? cfg.fundPrivacyHidden : legacyHidden;
  const privacyHidden = stockPrivacyHidden || fundPrivacyHidden;
  return { colorScheme, decimalPlaces, privacyHidden, stockPrivacyHidden, fundPrivacyHidden };
}
