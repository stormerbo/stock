import { cn } from '@/utils/cn';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md';
}

export function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
}: ModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className={cn(
          'bg-white rounded-lg shadow-xl flex flex-col max-h-[90vh]',
          size === 'sm' ? 'w-full max-w-sm' : 'w-full max-w-md'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || subtitle) && (
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div>
              {title && <h2 className="text-base font-semibold text-gray-900">{title}</h2>}
              {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-auto p-5">{children}</div>
        {footer && <div className="px-5 py-4 border-t border-gray-100">{footer}</div>}
      </div>
    </div>
  );
}
