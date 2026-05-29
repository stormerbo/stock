import type { ColorScheme } from './display';

export type TokenThemeMode = 'dark' | 'light' | 'white';

type TokenValue = string;
type TokenGroup<T extends string> = Readonly<Record<T, TokenValue>>;

export const primitiveTokens = {
  color: {
    slate950: '#0f1118',
    slate900: '#171a26',
    slate800: '#23283a',
    ink950: '#1d2740',
    ink700: '#4b5778',
    ink500: '#6b7799',
    ink400: '#9098b5',
    white: '#f4f6ff',
    whiteMuted: '#c5cbe2',
    blue600: '#3f67f0',
    blue500: '#5fa2ff',
    violet600: '#6b5cf6',
    violetSoft: 'rgba(107, 92, 246, 0.2)',
    red600: '#cf2e2e',
    red500: '#ff5e57',
    green600: '#13964b',
    green500: '#1fc66d',
    amber500: '#f59e0b',
    emerald500: '#22c55e',
    danger500: '#ef4444',
  },
  font: {
    sans: "'Avenir Next', 'PingFang SC', 'Noto Sans SC', 'Segoe UI', sans-serif",
    mono: "'SFMono-Regular', Menlo, Monaco, Consolas, monospace",
  },
  space: {
    1: '4px',
    2: '8px',
    3: '12px',
    4: '16px',
    5: '20px',
    6: '24px',
    8: '32px',
  },
  radius: {
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '20px',
    pill: '999px',
  },
  shadow: {
    sm: '0 3px 8px rgba(10, 13, 22, 0.04)',
    md: '0 10px 24px rgba(5, 8, 20, 0.10)',
    lg: '0 22px 56px rgba(5, 8, 20, 0.20)',
  },
  blur: {
    sm: 'blur(12px) saturate(118%)',
    md: 'blur(18px) saturate(124%)',
    lg: 'blur(24px) saturate(128%)',
  },
} as const;

export const semanticThemeTokens: Readonly<
  Record<TokenThemeMode, TokenGroup<
    | 'color-bg'
    | 'color-surface'
    | 'color-surface-strong'
    | 'color-border'
    | 'color-border-strong'
    | 'color-line'
    | 'color-text'
    | 'color-text-muted'
    | 'color-text-faint'
    | 'color-accent'
    | 'color-accent-soft'
    | 'color-on-accent'
    | 'color-warning'
    | 'color-success'
    | 'color-danger'
    | 'state-hover-bg'
    | 'state-active-bg'
    | 'state-focus-ring'
    | 'state-disabled-fg'
    | 'state-muted-bg'
    | 'surface-glass'
    | 'surface-glass-strong'
    | 'surface-glass-border'
    | 'surface-shadow'
    | 'surface-blur'
    | 'overlay-backdrop'
  >>
> = {
  dark: {
    'color-bg': primitiveTokens.color.slate950,
    'color-surface': primitiveTokens.color.slate900,
    'color-surface-strong': primitiveTokens.color.slate800,
    'color-border': 'rgba(255, 255, 255, 0.12)',
    'color-border-strong': 'rgba(255, 255, 255, 0.18)',
    'color-line': 'rgba(255, 255, 255, 0.09)',
    'color-text': primitiveTokens.color.white,
    'color-text-muted': primitiveTokens.color.whiteMuted,
    'color-text-faint': '#7a829e',
    'color-accent': primitiveTokens.color.violet600,
    'color-accent-soft': primitiveTokens.color.violetSoft,
    'color-on-accent': primitiveTokens.color.white,
    'color-warning': primitiveTokens.color.amber500,
    'color-success': primitiveTokens.color.emerald500,
    'color-danger': primitiveTokens.color.danger500,
    'state-hover-bg': 'rgba(255, 255, 255, 0.06)',
    'state-active-bg': 'rgba(107, 92, 246, 0.15)',
    'state-focus-ring': 'rgba(107, 92, 246, 0.45)',
    'state-disabled-fg': '#5a6278',
    'state-muted-bg': 'rgba(255, 255, 255, 0.05)',
    'surface-glass': 'rgba(255, 255, 255, 0.05)',
    'surface-glass-strong': 'rgba(255, 255, 255, 0.09)',
    'surface-glass-border': 'rgba(255, 255, 255, 0.06)',
    'surface-shadow': '0 10px 28px rgba(3, 6, 16, 0.22)',
    'surface-blur': 'blur(20px) saturate(135%)',
    'overlay-backdrop': 'rgba(0, 0, 0, 0.6)',
  },
  light: {
    'color-bg': '#f2f6ff',
    'color-surface': '#e8efff',
    'color-surface-strong': '#d8e4ff',
    'color-border': 'rgba(34, 56, 102, 0.18)',
    'color-border-strong': 'rgba(34, 56, 102, 0.22)',
    'color-line': 'rgba(34, 56, 102, 0.16)',
    'color-text': primitiveTokens.color.ink950,
    'color-text-muted': primitiveTokens.color.ink700,
    'color-text-faint': primitiveTokens.color.ink500,
    'color-accent': primitiveTokens.color.blue600,
    'color-accent-soft': 'rgba(63, 103, 240, 0.15)',
    'color-on-accent': primitiveTokens.color.white,
    'color-warning': primitiveTokens.color.amber500,
    'color-success': primitiveTokens.color.emerald500,
    'color-danger': primitiveTokens.color.danger500,
    'state-hover-bg': 'rgba(0, 0, 0, 0.04)',
    'state-active-bg': 'rgba(63, 103, 240, 0.1)',
    'state-focus-ring': 'rgba(63, 103, 240, 0.38)',
    'state-disabled-fg': primitiveTokens.color.ink400,
    'state-muted-bg': 'rgba(255, 255, 255, 0.3)',
    'surface-glass': 'rgba(255, 255, 255, 0.16)',
    'surface-glass-strong': 'rgba(255, 255, 255, 0.22)',
    'surface-glass-border': 'rgba(101, 123, 168, 0.08)',
    'surface-shadow': '0 10px 24px rgba(68, 91, 141, 0.15)',
    'surface-blur': 'blur(18px) saturate(125%)',
    'overlay-backdrop': 'rgba(244, 247, 255, 0.72)',
  },
  white: {
    'color-bg': '#ffffff',
    'color-surface': '#ffffff',
    'color-surface-strong': '#f6f9ff',
    'color-border': 'rgba(28, 45, 89, 0.14)',
    'color-border-strong': 'rgba(28, 45, 89, 0.18)',
    'color-line': 'rgba(28, 45, 89, 0.12)',
    'color-text': primitiveTokens.color.ink950,
    'color-text-muted': primitiveTokens.color.ink700,
    'color-text-faint': primitiveTokens.color.ink500,
    'color-accent': primitiveTokens.color.blue600,
    'color-accent-soft': 'rgba(63, 103, 240, 0.15)',
    'color-on-accent': primitiveTokens.color.white,
    'color-warning': primitiveTokens.color.amber500,
    'color-success': primitiveTokens.color.emerald500,
    'color-danger': primitiveTokens.color.danger500,
    'state-hover-bg': 'rgba(0, 0, 0, 0.04)',
    'state-active-bg': 'rgba(63, 103, 240, 0.1)',
    'state-focus-ring': 'rgba(63, 103, 240, 0.38)',
    'state-disabled-fg': primitiveTokens.color.ink400,
    'state-muted-bg': 'rgba(255, 255, 255, 0.9)',
    'surface-glass': 'rgba(255, 255, 255, 0.9)',
    'surface-glass-strong': 'rgba(255, 255, 255, 0.98)',
    'surface-glass-border': 'rgba(28, 45, 89, 0.08)',
    'surface-shadow': '0 8px 20px rgba(24, 41, 82, 0.08)',
    'surface-blur': 'blur(18px) saturate(125%)',
    'overlay-backdrop': 'rgba(255, 255, 255, 0.76)',
  },
} as const;

export const componentTokens = {
  nav: {
    width: '70px',
    itemHeight: '36px',
  },
  table: {
    rowHeight: '36px',
    headerHeight: '32px',
  },
  badge: {
    bg: 'var(--state-muted-bg)',
    fg: 'var(--color-text-muted)',
    positiveBg: 'color-mix(in srgb, var(--color-up) 12%, transparent)',
    negativeBg: 'color-mix(in srgb, var(--color-down) 12%, transparent)',
  },
} as const;

const primitiveCssVariables = {
  '--font-sans': primitiveTokens.font.sans,
  '--font-mono': primitiveTokens.font.mono,
  '--space-1': primitiveTokens.space[1],
  '--space-2': primitiveTokens.space[2],
  '--space-3': primitiveTokens.space[3],
  '--space-4': primitiveTokens.space[4],
  '--space-5': primitiveTokens.space[5],
  '--space-6': primitiveTokens.space[6],
  '--space-8': primitiveTokens.space[8],
  '--radius-sm': primitiveTokens.radius.sm,
  '--radius-md': primitiveTokens.radius.md,
  '--radius-lg': primitiveTokens.radius.lg,
  '--radius-xl': primitiveTokens.radius.xl,
  '--radius-pill': primitiveTokens.radius.pill,
  '--shadow-sm': primitiveTokens.shadow.sm,
  '--shadow-md': primitiveTokens.shadow.md,
  '--shadow-lg': primitiveTokens.shadow.lg,
  '--blur-sm': primitiveTokens.blur.sm,
  '--blur-md': primitiveTokens.blur.md,
  '--blur-lg': primitiveTokens.blur.lg,
  '--color-slate-950': primitiveTokens.color.slate950,
  '--color-slate-900': primitiveTokens.color.slate900,
  '--color-slate-800': primitiveTokens.color.slate800,
  '--color-ink-950': primitiveTokens.color.ink950,
  '--color-ink-700': primitiveTokens.color.ink700,
  '--color-ink-500': primitiveTokens.color.ink500,
  '--color-blue-600': primitiveTokens.color.blue600,
  '--color-blue-500': primitiveTokens.color.blue500,
  '--color-red-600': primitiveTokens.color.red600,
  '--color-green-600': primitiveTokens.color.green600,
  '--color-amber-500': primitiveTokens.color.amber500,
  '--color-emerald-500': primitiveTokens.color.emerald500,
} as const;

const componentCssVariables = {
  '--nav-width': componentTokens.nav.width,
  '--nav-item-height': componentTokens.nav.itemHeight,
  '--table-row-height': componentTokens.table.rowHeight,
  '--table-header-height': componentTokens.table.headerHeight,
  '--badge-bg': componentTokens.badge.bg,
  '--badge-fg': componentTokens.badge.fg,
  '--badge-positive-bg': componentTokens.badge.positiveBg,
  '--badge-negative-bg': componentTokens.badge.negativeBg,
} as const;

export function getThemeColorTokens(themeMode: TokenThemeMode, colorScheme: ColorScheme): Record<string, string> {
  const semantic = semanticThemeTokens[themeMode];
  const up = colorScheme === 'us' ? primitiveTokens.color.green600 : primitiveTokens.color.red600;
  const down = colorScheme === 'us' ? primitiveTokens.color.red600 : primitiveTokens.color.green600;

  return {
    '--color-bg': semantic['color-bg'],
    '--color-surface': semantic['color-surface'],
    '--color-surface-strong': semantic['color-surface-strong'],
    '--color-border': semantic['color-border'],
    '--color-border-strong': semantic['color-border-strong'],
    '--color-line': semantic['color-line'],
    '--color-text': semantic['color-text'],
    '--color-text-muted': semantic['color-text-muted'],
    '--color-text-faint': semantic['color-text-faint'],
    '--color-accent': semantic['color-accent'],
    '--color-accent-soft': semantic['color-accent-soft'],
    '--color-on-accent': semantic['color-on-accent'],
    '--color-up': up,
    '--color-down': down,
    '--color-warning': semantic['color-warning'],
    '--color-success': semantic['color-success'],
    '--color-danger': semantic['color-danger'],
    '--state-hover-bg': semantic['state-hover-bg'],
    '--state-active-bg': semantic['state-active-bg'],
    '--state-focus-ring': semantic['state-focus-ring'],
    '--state-disabled-fg': semantic['state-disabled-fg'],
    '--state-muted-bg': semantic['state-muted-bg'],
    '--surface-glass': semantic['surface-glass'],
    '--surface-glass-strong': semantic['surface-glass-strong'],
    '--surface-glass-border': semantic['surface-glass-border'],
    '--surface-shadow': semantic['surface-shadow'],
    '--surface-blur': semantic['surface-blur'],
    '--overlay-backdrop': semantic['overlay-backdrop'],
  };
}

export function getDesignTokenVariables(themeMode: TokenThemeMode, colorScheme: ColorScheme = 'cn'): Record<string, string> {
  return {
    ...primitiveCssVariables,
    ...componentCssVariables,
    ...getThemeColorTokens(themeMode, colorScheme),
  };
}

export function serializeCssVariables(variables: Record<string, string>): string {
  return Object.entries(variables)
    .map(([name, value]) => `${name}: ${value};`)
    .join('\n  ');
}

export function applyCssVariables(target: HTMLElement, variables: Record<string, string>): void {
  Object.entries(variables).forEach(([name, value]) => {
    target.style.setProperty(name, value);
  });
}
