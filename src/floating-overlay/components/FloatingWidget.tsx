import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

type Position = { x: number; y: number };

type Props = {
  initialPosition: Position;
  collapsed: boolean;
  stockCount: number;
  totalChangePct: number;
  lastUpdated: string | null;
  onPositionChange: (pos: Position) => void;
  onToggleCollapse: () => void;
  onClose: () => void;
  onRefresh: () => void;
  children: ReactNode;
};

function clamp(pos: Position, w: number, h: number): Position {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return {
    x: Math.max(8, Math.min(pos.x, vw - w - 8)),
    y: Math.max(8, Math.min(pos.y, vh - h - 8)),
  };
}

function toneClass(value: number): string {
  if (value > 0) return 'up';
  if (value < 0) return 'down';
  return 'neutral';
}

function formatChangePct(value: number): string {
  if (!Number.isFinite(value)) return '--';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

export default function FloatingWidget({
  initialPosition, collapsed, stockCount, totalChangePct, lastUpdated,
  onPositionChange, onToggleCollapse, onClose, onRefresh, children,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Position>(initialPosition);
  const dragging = useRef(false);
  const dragOrigin = useRef({ x: 0, y: 0 });
  const posOrigin = useRef({ x: 0, y: 0 });

  useEffect(() => {
    setPos(initialPosition);
  }, [initialPosition]);

  const onHeaderMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true;
    dragOrigin.current = { x: e.clientX, y: e.clientY };
    posOrigin.current = { ...pos };
    e.preventDefault();
  }, [pos]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      setPos({
        x: posOrigin.current.x + (e.clientX - dragOrigin.current.x),
        y: posOrigin.current.y + (e.clientY - dragOrigin.current.y),
      });
    };
    const onMouseUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
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

  // Collapsed state — pill
  if (collapsed) {
    const tc = toneClass(totalChangePct);
    return (
      <div
        className="float-collapsed"
        style={{ left: pos.x, top: pos.y }}
        onClick={onToggleCollapse}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter') onToggleCollapse(); }}
      >
        <span className={`float-collapsed-dot ${tc}`} />
        <div className="float-collapsed-info">
          <span className="float-collapsed-label">自选股</span>
          {stockCount > 0 && <span className="float-collapsed-count">{stockCount}只</span>}
        </div>
        {stockCount > 0 && (
          <span className={`float-collapsed-change ${tc}`}>
            {formatChangePct(totalChangePct)}
          </span>
        )}
        <span className="float-collapsed-arrow">▸</span>
      </div>
    );
  }

  // Expanded state — panel
  const tc = toneClass(totalChangePct);

  return (
    <div
      ref={panelRef}
      className="float-panel"
      style={{ left: pos.x, top: pos.y }}
    >
      {/* Header */}
      <div className="float-header" onMouseDown={onHeaderMouseDown}>
        <div className="float-drag-handle" aria-label="拖拽">
          <span className="float-drag-dot" />
          <span className="float-drag-dot" />
          <span className="float-drag-dot" />
        </div>
        <div className="float-header-title">
          <span className={`float-header-indicator ${tc}`} />
          <span>自选股</span>
          {lastUpdated && (
            <span className="float-header-time">{lastUpdated}</span>
          )}
        </div>
        <div className="float-header-actions">
          <button className="float-btn" onClick={onRefresh} title="刷新" type="button">
            ↻
          </button>
          <button className="float-btn" onClick={onToggleCollapse} title="折叠" type="button">
            ─
          </button>
          <button className="float-btn" onClick={onClose} title="关闭" type="button">
            ✕
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="float-body">
        {children}
      </div>
    </div>
  );
}
