import { createElement, forwardRef, type FocusEvent, type InputHTMLAttributes } from 'react';
import clsx from 'clsx';

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  compact?: boolean;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { compact = false, className, style, onFocus, onBlur, ...props },
  ref,
) {
  const handleFocus = (event: FocusEvent<HTMLInputElement>) => {
    event.currentTarget.style.borderColor = 'color-mix(in srgb, var(--brand) 45%, var(--glass-border))';
    event.currentTarget.style.boxShadow = '0 0 0 3px color-mix(in srgb, var(--brand-soft) 42%, transparent)';
    onFocus?.(event);
  };

  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    event.currentTarget.style.borderColor = 'var(--glass-border)';
    event.currentTarget.style.boxShadow = 'none';
    onBlur?.(event);
  };

  return createElement('input', {
    ref,
    className: clsx('ui-input', compact && 'ui-input--compact', className),
    style: {
      width: '100%',
      minHeight: compact ? 28 : 34,
      padding: compact ? '4px 8px' : '6px 10px',
      borderRadius: 8,
      border: '1px solid var(--glass-border)',
      background: 'var(--input-bg)',
      color: 'var(--text-0)',
      font: 'inherit',
      fontSize: compact ? 11 : 12,
      lineHeight: 1.2,
      outline: 'none',
      transition: 'border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease',
      ...style,
    },
    ...props,
    onFocus: handleFocus,
    onBlur: handleBlur,
  });
});
