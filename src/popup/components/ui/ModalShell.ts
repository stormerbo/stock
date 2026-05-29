import { createElement, type MouseEvent, type ReactNode } from 'react';
import { X } from 'lucide-react';
import clsx from 'clsx';
import { Button } from './Button.ts';
import { Panel } from './Panel.ts';

export type ModalShellProps = {
  open: boolean;
  title?: ReactNode;
  subtitle?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  width?: number | string;
  className?: string;
  panelClassName?: string;
  onClose: () => void;
};

export function ModalShell({
  open,
  title,
  subtitle,
  children,
  footer,
  width = 320,
  className,
  panelClassName,
  onClose,
}: ModalShellProps) {
  if (!open) return null;

  return createElement(
    'div',
    {
      className: clsx('ui-modal-overlay', className),
      role: 'dialog',
      'aria-modal': 'true',
      onClick: onClose,
      style: {
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        background: 'var(--overlay-backdrop)',
        backdropFilter: 'blur(10px)',
      },
    },
    createElement(
      Panel,
      {
        elevated: true,
        className: clsx('ui-modal-panel', panelClassName),
        style: {
          width,
          maxWidth: 'calc(100vw - 32px)',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          background: 'var(--bg-1)',
          borderColor: 'var(--glass-border)',
          boxShadow: 'var(--shadow-lg)',
        },
        onClick: (event: MouseEvent<HTMLDivElement>) => event.stopPropagation(),
      },
      createElement(
        'div',
        { style: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 } },
        createElement(
          'div',
          { style: { minWidth: 0 } },
          title ? createElement('div', { style: { fontSize: 14, fontWeight: 700, color: 'var(--text-0)' } }, title) : null,
          subtitle ? createElement('div', { style: { marginTop: 4, fontSize: 12, lineHeight: 1.5, color: 'var(--text-1)' } }, subtitle) : null,
        ),
        createElement(
          Button,
          {
            variant: 'ghost',
            size: 'icon',
            onClick: onClose,
            'aria-label': '关闭弹窗',
            style: { flexShrink: 0, color: 'var(--text-1)' },
          },
          createElement(X, { size: 16 }),
        ),
      ),
      children
        ? createElement('div', { style: { fontSize: 13, lineHeight: 1.6, color: 'var(--text-0)', whiteSpace: 'pre-wrap' } }, children)
        : null,
      footer
        ? createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 } }, footer)
        : null,
    ),
  );
}
