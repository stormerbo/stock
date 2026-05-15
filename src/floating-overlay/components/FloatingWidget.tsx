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

const COLLAPSED_W = 34;
const COLLAPSED_RIGHT = 8;

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

  // Shared drag start
  const startDrag = useCallback((e: React.MouseEvent, currentPos: Position) => {
    dragging.current = true;
    dragOrigin.current = { x: e.clientX, y: e.clientY };
    posOrigin.current = { ...currentPos };
    e.preventDefault();
  }, []);

  // Mouse move/up effect — differs by collapsed vs expanded
  useEffect(() => {
    if (!collapsed) {
      // Expanded: full XY drag on header
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
    } else {
      // Collapsed: vertical-only drag — snap X to right edge
      const rightPanelW = 320; // approximate panel width
      const targetX = window.innerWidth - rightPanelW - 8;
      const onMouseMove = (e: MouseEvent) => {
        if (!dragging.current) return;
        setPos({
          x: targetX,
          y: posOrigin.current.y + (e.clientY - dragOrigin.current.y),
        });
      };
      const onMouseUp = () => {
        if (!dragging.current) return;
        dragging.current = false;
        setPos((prev) => {
          const vh = window.innerHeight;
          const clampedY = Math.max(8, Math.min(prev.y, vh - 80));
          const newPos = { x: targetX, y: clampedY };
          onPositionChange(newPos);
          return newPos;
        });
      };
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
      return () => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };
    }
  }, [collapsed, onPositionChange]);

  // Collapsed state — right-edge vertical tab
  if (collapsed) {
    const tc = toneClass(totalChangePct);
    return (
      <div
        className="float-collapsed-tab"
        style={{ top: pos.y, right: COLLAPSED_RIGHT }}
        onMouseDown={(e) => startDrag(e, pos)}
        onClick={onToggleCollapse}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter') onToggleCollapse(); }}
      >
        <span className={`float-collapsed-tab-dot ${tc}`} />
        <span className="float-collapsed-tab-count">{stockCount}</span>
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
      <div className="float-header" onMouseDown={(e) => startDrag(e, pos)}>
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
          <button className="float-btn" onClick={onRefresh} title="刷新" type="button">↻</button>
          <button className="float-btn" onClick={onToggleCollapse} title="折叠" type="button">─</button>
          <button className="float-btn" onClick={onClose} title="关闭" type="button">✕</button>
        </div>
      </div>

      {/* Body */}
      <div className="float-body">
        {children}
      </div>
    </div>
  );
}
