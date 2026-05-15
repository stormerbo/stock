import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

type Position = { x: number; y: number };

type Props = {
  initialPosition: Position;
  collapsed: boolean;
  opacity: number;
  stockCount: number;
  totalChangePct: number;
  lastUpdated: string | null;
  onPositionChange: (pos: Position) => void;
  onToggleCollapse: () => void;
  onClose: () => void;
  onRefresh: () => void;
  onOpacityChange: (opacity: number) => void;
  children: ReactNode;
};

const COLLAPSED_RIGHT = 4;

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
  initialPosition, collapsed, opacity = 1, stockCount, totalChangePct, lastUpdated,
  onPositionChange, onToggleCollapse, onClose, onRefresh, onOpacityChange, children,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Position>(initialPosition);
  const dragging = useRef(false);
  const dragOrigin = useRef({ x: 0, y: 0 });
  const posOrigin = useRef({ x: 0, y: 0 });
  const [showOpacity, setShowOpacity] = useState(false);

  // Snap to right edge unless user has explicitly positioned it
  useEffect(() => {
    setPos((prev) => {
      const rightEdge = window.innerWidth - 320 - 8;
      // 9999 = default, < 100 = old default → snap to right
      const isDefault = initialPosition.x >= 9999 || initialPosition.x < 100;
      const x = isDefault ? rightEdge : initialPosition.x;
      return { x, y: initialPosition.y };
    });
  }, [initialPosition]);

  // Shared drag start — skip if clicking a button or the opacity popup
  const startDrag = useCallback((e: React.MouseEvent, currentPos: Position) => {
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('.float-opacity-popup') || target.closest('.float-opacity-slider')) return;
    dragging.current = true;
    dragOrigin.current = { x: e.clientX, y: e.clientY };
    posOrigin.current = { ...currentPos };
    e.preventDefault();
  }, []);

  // Mouse move/up effect — differs by collapsed vs expanded
  useEffect(() => {
    if (!collapsed) {
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
      const rightPanelW = 320;
      const targetX = window.innerWidth - rightPanelW - 8;
      const onMouseMove = (e: MouseEvent) => {
        if (!dragging.current) return;
        setPos({
          x: targetX,
          y: posOrigin.current.y + (e.clientY - dragOrigin.current.y),
        });
      };
      const onMouseUp = (e: MouseEvent) => {
        if (!dragging.current) return;
        dragging.current = false;
        const dx = Math.abs(e.clientX - dragOrigin.current.x);
        const dy = Math.abs(e.clientY - dragOrigin.current.y);
        if (dx < 3 && dy < 3) {
          onToggleCollapse();
          return;
        }
        const vh = window.innerHeight;
        const clampedY = Math.max(8, Math.min(posOrigin.current.y + (e.clientY - dragOrigin.current.y), vh - 80));
        const newPos = { x: targetX, y: clampedY };
        onPositionChange(newPos);
      };
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
      return () => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };
    }
  }, [collapsed, onPositionChange]);

  // ---- Collapsed state ----
  if (collapsed) {
    const tc = toneClass(totalChangePct);
    return (
      <div
        className="float-collapsed-tab"
        style={{ top: pos.y, right: COLLAPSED_RIGHT, opacity }}
        onMouseDown={(e) => {
          dragging.current = true;
          dragOrigin.current = { x: e.clientX, y: e.clientY };
          posOrigin.current = { ...pos };
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter') onToggleCollapse(); }}
      >
        <span className={`float-collapsed-tab-dot ${tc}`} />
      </div>
    );
  }

  // ---- Expanded state ----
  const tc = toneClass(totalChangePct);

  return (
    <div
      ref={panelRef}
      className="float-panel"
      style={{ left: pos.x, top: pos.y, opacity }}
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
          {lastUpdated && <span className="float-header-time">{lastUpdated}</span>}
        </div>
        <div className="float-header-actions">
          <div className="float-opacity-wrap">
            <button
              className="float-btn"
              onClick={() => setShowOpacity((v) => !v)}
              title="透明度"
              type="button"
              style={{ opacity: opacity < 0.8 ? opacity + 0.2 : 1 }}
            >
              ◐
            </button>
            {showOpacity && (
              <div className="float-opacity-popup">
                <input
                  type="range"
                  min={0.2}
                  max={1}
                  step={0.05}
                  value={opacity}
                  onChange={(e) => onOpacityChange(parseFloat(e.target.value))}
                  className="float-opacity-slider"
                />
                <span className="float-opacity-label">{Math.round(opacity * 100)}%</span>
              </div>
            )}
          </div>
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
