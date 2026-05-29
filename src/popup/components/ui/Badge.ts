import { createElement, type HTMLAttributes, type CSSProperties } from 'react';
import clsx from 'clsx';

export type BadgeTone = 'neutral' | 'positive' | 'negative' | 'warning' | 'accent';
export type BadgeSize = 'sm' | 'md';

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
  size?: BadgeSize;
  color?: string;
};

const toneStyles: Record<BadgeTone, CSSProperties> = {
  neutral: {
    background: 'var(--state-muted-bg)',
    borderColor: 'var(--glass-border)',
    color: 'var(--text-1)',
  },
  positive: {
    background: 'color-mix(in srgb, var(--color-success) 12%, transparent)',
    borderColor: 'color-mix(in srgb, var(--color-success) 25%, transparent)',
    color: 'var(--color-success)',
  },
  negative: {
    background: 'color-mix(in srgb, var(--color-danger) 12%, transparent)',
    borderColor: 'color-mix(in srgb, var(--color-danger) 25%, transparent)',
    color: 'var(--color-danger)',
  },
  warning: {
    background: 'color-mix(in srgb, var(--color-warning) 14%, transparent)',
    borderColor: 'color-mix(in srgb, var(--color-warning) 24%, transparent)',
    color: 'var(--color-warning)',
  },
  accent: {
    background: 'color-mix(in srgb, var(--color-accent-soft) 70%, transparent)',
    borderColor: 'color-mix(in srgb, var(--color-accent) 28%, transparent)',
    color: 'var(--color-accent)',
  },
};

const sizeStyles: Record<BadgeSize, CSSProperties> = {
  sm: { minHeight: 18, padding: '0 6px', fontSize: 10, borderRadius: 4 },
  md: { minHeight: 22, padding: '0 8px', fontSize: 11, borderRadius: 6 },
};

export function Badge({
  tone = 'neutral',
  size = 'sm',
  color,
  className,
  style,
  children,
  ...props
}: BadgeProps) {
  const customStyle = color
    ? {
        background: `${color}22`,
        borderColor: `${color}44`,
        color,
      }
    : toneStyles[tone];

  return createElement(
    'span',
    {
      className: clsx('ui-badge', `ui-badge--${tone}`, `ui-badge--${size}`, className),
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        border: '1px solid transparent',
        lineHeight: 1,
        fontWeight: 600,
        whiteSpace: 'nowrap',
        userSelect: 'none',
        ...customStyle,
        ...sizeStyles[size],
        ...style,
      },
      ...props,
    },
    children,
  );
}

