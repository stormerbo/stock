import { createElement, type HTMLAttributes, type CSSProperties } from 'react';
import clsx from 'clsx';

export type PanelPadding = 'sm' | 'md' | 'lg';

export type PanelProps = HTMLAttributes<HTMLDivElement> & {
  padding?: PanelPadding;
  elevated?: boolean;
};

const paddingStyles: Record<PanelPadding, CSSProperties> = {
  sm: { padding: 12 },
  md: { padding: 16 },
  lg: { padding: 20 },
};

export function Panel({
  padding = 'md',
  elevated = false,
  className,
  style,
  children,
  ...props
}: PanelProps) {
  return createElement(
    'div',
    {
      className: clsx('ui-panel', `ui-panel--${padding}`, elevated && 'ui-panel--elevated', className),
      style: {
        background: 'var(--glass-bg)',
        border: '1px solid var(--glass-border)',
        borderRadius: 12,
        boxShadow: elevated ? 'var(--shadow-md)' : 'none',
        ...paddingStyles[padding],
        ...style,
      },
      ...props,
    },
    children,
  );
}

