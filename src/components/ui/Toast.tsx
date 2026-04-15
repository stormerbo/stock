import { cn } from '@/utils/cn';
import { CheckCircle, AlertCircle, X } from 'lucide-react';
import { useEffect, useState } from 'react';

type ToastType = 'success' | 'error';

interface ToastProps {
  message: string;
  type?: ToastType;
  duration?: number;
  onClose: () => void;
}

export function Toast({ message, type = 'success', duration = 2000, onClose }: ToastProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // 触发进入动画
    requestAnimationFrame(() => setIsVisible(true));

    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onClose, 300); // 等待动画结束
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  return (
    <div
      className={cn(
        'fixed bottom-20 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2.5 rounded-lg shadow-lg transition-all duration-300 z-50',
        type === 'success' ? 'bg-gray-900 text-white' : 'bg-red-500 text-white',
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      )}
    >
      {type === 'success' ? (
        <CheckCircle size={16} className="text-green-400" />
      ) : (
        <AlertCircle size={16} />
      )}
      <span className="text-sm font-medium">{message}</span>
      <button onClick={onClose} className="ml-2 hover:opacity-70">
        <X size={14} />
      </button>
    </div>
  );
}
