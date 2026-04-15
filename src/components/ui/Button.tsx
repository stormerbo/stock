import { cn } from '@/utils/cn';
import type { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'default' | 'danger';
  size?: 'sm' | 'md';
}

export function Button({
  variant = 'default',
  size = 'md',
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'rounded font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary-400 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed',
        {
          'bg-primary-500 text-white hover:bg-primary-600': variant === 'primary',
          'bg-white border border-gray-300 text-gray-700 hover:border-primary-500 hover:text-primary-500': variant === 'default',
          'bg-white border border-red-500 text-red-500 hover:bg-red-500 hover:text-white': variant === 'danger',
        },
        {
          'px-3 py-1.5 text-sm': size === 'sm',
          'px-4 py-2 text-sm': size === 'md',
        },
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
