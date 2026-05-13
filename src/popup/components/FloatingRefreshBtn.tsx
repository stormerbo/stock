import { useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';

export default function FloatingRefreshBtn({ onRefresh, spinning }: { onRefresh: () => void; spinning: boolean }) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const dragging = useRef(false);
  const dragOrigin = useRef({ x: 0, y: 0 });
  const posOrigin = useRef({ right: 12, bottom: 12 });
  const [pos, setPos] = useState<{ right: number; bottom: number }>({ right: 12, bottom: 12 });

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    dragOrigin.current = { x: e.clientX, y: e.clientY };
    posOrigin.current = pos;
    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const dx = ev.clientX - dragOrigin.current.x;
      const dy = ev.clientY - dragOrigin.current.y;
      setPos({
        right: Math.max(0, posOrigin.current.right - dx),
        bottom: Math.max(0, posOrigin.current.bottom - dy),
      });
    };
    const onUp = () => {
      dragging.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const handleClick = (e: React.MouseEvent) => {
    if (dragging.current) return;
    e.stopPropagation();
    onRefresh();
  };

  return (
    <button
      ref={btnRef}
      type="button"
      className="floating-refresh-btn"
      style={{ right: pos.right, bottom: pos.bottom }}
      onMouseDown={onMouseDown}
      onClick={handleClick}
      title="刷新数据"
    >
      <RefreshCw size={14} className={spinning ? 'spinning' : ''} />
    </button>
  );
}
