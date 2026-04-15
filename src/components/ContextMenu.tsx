import { useEffect, useRef } from 'react';
import { cn } from '@/utils/cn';
import { Pin, ArrowUpDown, Star, Trash2 } from 'lucide-react';

interface ContextMenuProps {
  isOpen: boolean;
  x: number;
  y: number;
  pinned: boolean;
  watched: boolean;
  onClose: () => void;
  onTogglePin: () => void;
  onEditSort: () => void;
  onToggleWatch: () => void;
  onDelete: () => void;
}

export function ContextMenu({
  isOpen,
  x,
  y,
  pinned,
  watched,
  onClose,
  onTogglePin,
  onEditSort,
  onToggleWatch,
  onDelete,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭菜单
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEsc);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // 确保菜单不超出视口
  const menuStyle: React.CSSProperties = {
    position: 'fixed',
    left: Math.min(x, window.innerWidth - 160),
    top: Math.min(y, window.innerHeight - 200),
    zIndex: 1000,
  };

  return (
    <div
      ref={menuRef}
      style={menuStyle}
      className="bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[140px]"
    >
      <MenuItem onClick={onTogglePin}>
        <Pin size={14} className={cn(pinned && 'fill-current')} />
        <span>{pinned ? '取消钉住' : '钉住置顶'}</span>
      </MenuItem>

      <MenuItem onClick={onEditSort}>
        <ArrowUpDown size={14} />
        <span>编辑排序</span>
      </MenuItem>

      <MenuItem onClick={onToggleWatch}>
        <Star size={14} className={cn(watched && 'fill-amber-400 text-amber-400')} />
        <span>{watched ? '取消关注' : '特别关注'}</span>
      </MenuItem>

      <div className="my-1 border-t border-gray-100" />

      <MenuItem onClick={onDelete} className="text-red-500 hover:text-red-600 hover:bg-red-50">
        <Trash2 size={14} />
        <span>移除持仓</span>
      </MenuItem>
    </div>
  );
}

interface MenuItemProps {
  children: React.ReactNode;
  onClick: () => void;
  className?: string;
}

function MenuItem({ children, onClick, className }: MenuItemProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2 transition-colors',
        className
      )}
    >
      {children}
    </button>
  );
}
