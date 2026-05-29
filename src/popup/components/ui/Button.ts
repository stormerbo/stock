import { createElement, forwardRef, type ButtonHTMLAttributes, type CSSProperties } from 'react';
import clsx from 'clsx';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'icon';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
};

const variantStyles: Record<ButtonVariant, CSSProperties> = {
  primary: {
    background: 'var(--brand)',
    borderColor: 'transparent',
    color: 'var(--color-on-accent)',
    boxShadow: 'var(--shadow-sm)',
  },
  secondary: {
    background: 'var(--glass-bg)',
    borderColor: 'var(--glass-border)',
    color: 'var(--text-0)',
  },
  danger: {
    background: 'var(--color-danger)',
    borderColor: 'transparent',
    color: 'var(--color-on-accent)',
    boxShadow: 'var(--shadow-sm)',
  },
  ghost: {
    background: 'transparent',
    borderColor: 'transparent',
    color: 'var(--text-0)',
  },
};

const sizeStyles: Record<ButtonSize, CSSProperties> = {
  sm: { minHeight: 28, padding: '4px 10px', fontSize: 11, borderRadius: 8 },
  md: { minHeight: 32, padding: '6px 14px', fontSize: 12, borderRadius: 8 },
  icon: { width: 28, height: 28, padding: 0, borderRadius: 8 },
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    loading = false,
    disabled,
    className,
    style,
    type = 'button',
    children,
    ...props
  },
  ref,
) {
  const resolvedDisabled = disabled || loading;

  return createElement(
    'button',
    {
      ref,
      type,
      className: clsx('ui-button', `ui-button--${variant}`, `ui-button--${size}`, loading && 'ui-button--loading', className),
      disabled: resolvedDisabled,
      'aria-busy': loading || undefined,
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        border: '1px solid transparent',
        lineHeight: 1,
        fontWeight: 600,
        cursor: resolvedDisabled ? 'not-allowed' : 'pointer',
        transition: 'transform 0.15s ease, opacity 0.15s ease, background 0.15s ease, border-color 0.15s ease, color 0.15s ease',
        userSelect: 'none',
        whiteSpace: 'nowrap',
        opacity: resolvedDisabled ? 0.6 : 1,
        ...variantStyles[variant],
        ...sizeStyles[size],
        ...style,
      },
      ...props,
    },
    children,
  );
});

