import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

type Position = { x: number; y: number };

type Props = {
  initialPosition: Position;
  collapsed: boolean;
  onPositionChange: (pos: Position) => void;
  onToggleCollapse: () => void;
  onClose: () => void;
  children: ReactNode;
};

function clamp(pos: Position, panelWidth: number, panelHeight: number): Position {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return {
    x: Math.max(10, Math.min(pos.x, vw - panelWidth - 10)),
    y: Math.max(10, Math.min(pos.y, vh - panelHeight - 10)),
  };
}

export default function FloatingWidget({
  initialPosition, collapsed, onPositionChange, onToggleCollapse, onClose, children,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Position>(initialPosition);
  const dragging = useRef(false);
  const dragOrigin = useRef({ x: 0, y: 0 });
  const posOrigin = useRef({ x: 0, y: 0 });

  useEffect(() => {
    setPos(initialPosition);
  }, [initialPosition]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    // Only drag from header
    const target = e.target as HTMLElement;
    if (!target.closest('.float-panel-header')) return;

    dragging.current = true;
    dragOrigin.current = { x: e.clientX, y: e.clientY };
    posOrigin.current = { ...pos };
    e.preventDefault();
  }, [pos]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const dx = e.clientX - dragOrigin.current.x;
      const dy = e.clientY - dragOrigin.current.y;
      setPos({
        x: posOrigin.current.x + dx,
        y: posOrigin.current.y + dy,
      });
    };

    const onMouseUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      // Clamp and save final position
      setPos((prev) => {
        const el = panelRef.current;
        if (!el) return prev;
        const clamped = clamp(prev, el.offsetWidth, el.offsetHeight);
        onPositionChange(clamped);
        return clamped;
      });
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [onPositionChange]);

  const totalChange = 0; // computed in parent, passed if needed

  if (collapsed) {
    return (
      <div
        className="float-panel float-glass float-collapsed"
        style={{ left: pos.x, top: pos.y }}
        onClick={onToggleCollapse}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter') onToggleCollapse(); }}
      >
        <span className="float-collapsed-dot" style={{ background: '#6b5cf6' }} />
        <span className="float-collapsed-label">悬浮自选股</span>
        <span className="float-collapsed-change">{'>'}</span>
      </div>
    );
  }

  return (
    <div
      ref={panelRef}
      className="float-panel"
      style={{ left: pos.x, top: pos.y }}
    >
      <div
        className="float-panel-header float-glass"
        onMouseDown={onMouseDown}
      >
        <span className="float-panel-title">悬浮自选股</span>
        <button
          className="float-panel-btn"
          onClick={onToggleCollapse}
          title="折叠"
          type="button"
        >
          _
        </button>
        <button
          className="float-panel-btn"
          onClick={onClose}
          title="关闭"
          type="button"
        >
          ×
        </button>
      </div>
      <div className="float-panel-body float-glass">
        {children}
      </div>
    </div>
  );
}
