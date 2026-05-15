import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

type Position = { x: number; y: number };

type Props = {
  initialPosition: Position;
  collapsed: boolean;
  opacity: number;
  panelWidth: number | undefined;
  panelHeight: number | undefined;
  stockCount: number;
  totalChangePct: number;
  lastUpdated: string | null;
  onPositionChange: (pos: Position) => void;
  onToggleCollapse: () => void;
  onClose: () => void;
  onRefresh: () => void;
  onOpacityChange: (opacity: number) => void;
  onResize: (size: { w: number; h: number }) => void;
  children: ReactNode;
};

const MIN_W = 200;
const MAX_W = 600;
const COLLAPSED_RIGHT = 4;

function toneClass(value: number): string {
  if (value > 0) return 'up';
  if (value < 0) return 'down';
  return 'neutral';
}

export default function FloatingWidget({
  initialPosition, collapsed, opacity, panelWidth, panelHeight, stockCount, totalChangePct, lastUpdated,
  onPositionChange, onToggleCollapse, onClose, onRefresh, onOpacityChange, onResize, children,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Position>(initialPosition);
  const dragging = useRef(false);
  const dragOrigin = useRef({ x: 0, y: 0 });
  const posOrigin = useRef({ x: 0, y: 0 });
  const [showOpacity, setShowOpacity] = useState(false);
  const opacityRef = useRef<HTMLDivElement>(null);
  // Only treat as right-edge if position is the exact default sentinel value
  const isRightEdge = useRef(initialPosition.x >= 9999);
  const resizing = useRef(false);
  const resizeOrigin = useRef({ x: 0, y: 0, fromLeft: false });
  const sizeOrigin = useRef({ w: 0, h: 0, px: 0 });

  // On first render, clamp position to viewport
  useEffect(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const panelEstW = (panelWidth && panelWidth >= MIN_W) ? panelWidth : 320;
    if (isRightEdge.current) {
      setPos({ x: 0, y: Math.max(8, Math.min(initialPosition.y, vh - 80)) });
    } else {
      setPos({
        x: Math.max(8, Math.min(initialPosition.x, vw - panelEstW - 8)),
        y: Math.max(8, Math.min(initialPosition.y, vh - 80)),
      });
    }
  }, [initialPosition, panelWidth]);

  // Close opacity slider on outside click
  useEffect(() => {
    if (!showOpacity) return;
    const handler = (e: MouseEvent) => {
      if (opacityRef.current && !opacityRef.current.contains(e.target as Node)) {
        setShowOpacity(false);
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [showOpacity]);

  // ---- Panel drag ----
  const startDrag = useCallback((e: React.MouseEvent, currentPos: Position) => {
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('.float-opacity-popup') || target.closest('.float-opacity-slider')) return;
    dragging.current = true;
    const el = panelRef.current;
    const startX = isRightEdge.current && el
      ? window.innerWidth - el.offsetWidth - 8
      : currentPos.x;
    isRightEdge.current = false;
    dragOrigin.current = { x: e.clientX, y: e.clientY };
    posOrigin.current = { x: startX, y: currentPos.y };
    e.preventDefault();
  }, []);

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
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          const clamped = {
            x: Math.max(8, Math.min(prev.x, vw - el.offsetWidth - 8)),
            y: Math.max(8, Math.min(prev.y, vh - el.offsetHeight - 8)),
          };
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
      const targetX = window.innerWidth - 320 - 8;
      const onMouseMove = (e: MouseEvent) => {
        if (!dragging.current) return;
        setPos({ x: targetX, y: posOrigin.current.y + (e.clientY - dragOrigin.current.y) });
      };
      const onMouseUp = (e: MouseEvent) => {
        if (!dragging.current) return;
        dragging.current = false;
        const dx = Math.abs(e.clientX - dragOrigin.current.x);
        const dy = Math.abs(e.clientY - dragOrigin.current.y);
        if (dx < 3 && dy < 3) { onToggleCollapse(); return; }
        const vh = window.innerHeight;
        const clampedY = Math.max(8, Math.min(posOrigin.current.y + (e.clientY - dragOrigin.current.y), vh - 80));
        onPositionChange({ x: targetX, y: clampedY });
      };
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
      return () => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };
    }
  }, [collapsed, onPositionChange]);

  // ---- Resize (width + height) ----
  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizing.current = true;
    const el = panelRef.current;
    const target = e.target as HTMLElement;
    // Track which corner was grabbed
    const fromLeft = target.closest('.float-resize-corner.left') !== null;
    sizeOrigin.current = { w: el?.offsetWidth ?? 320, h: el?.offsetHeight ?? 400, px: pos.x };
    resizeOrigin.current = { x: e.clientX, y: e.clientY, fromLeft };
  }, [pos.x]);

  useEffect(() => {
    const MIN_H = 200;
    const MAX_H = 800;
    const onMouseMove = (e: MouseEvent) => {
      if (!resizing.current) return;
      const dx = e.clientX - resizeOrigin.current.x;
      let newW = sizeOrigin.current.w + (resizeOrigin.current.fromLeft ? -dx : dx);
      newW = Math.max(MIN_W, Math.min(MAX_W, newW));
      const newH = Math.max(MIN_H, Math.min(MAX_H, sizeOrigin.current.h + (e.clientY - resizeOrigin.current.y)));
      // Update position if resizing from left corner
      if (resizeOrigin.current.fromLeft) {
        const deltaX = sizeOrigin.current.w - newW; // positive when shrinking
        isRightEdge.current = false;
        setPos((prev) => ({ x: prev.x + deltaX, y: prev.y }));
      }
      onResize({ w: newW, h: newH });
    };
    const onMouseUp = () => {
      resizing.current = false;
      // Save final position (important for left-corner resize)
      setPos((prev) => {
        onPositionChange(prev);
        return prev;
      });
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [onResize, onPositionChange]);

  // ---- Collapsed state ----
  if (collapsed) {
    const tc = toneClass(totalChangePct);
    console.log('[悬浮窗] 折叠态 pos:', pos.y, 'opacity:', opacity);
    return (
      <div
        className="float-collapsed-tab"
        style={{ top: Math.max(8, Math.min(pos.y, window.innerHeight - 60)), right: COLLAPSED_RIGHT, opacity }}
        onMouseDown={(e) => {
          dragging.current = true;
          dragOrigin.current = { x: e.clientX, y: e.clientY };
          posOrigin.current = { ...pos };
        }}
        role="button" tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter') onToggleCollapse(); }}
      >
        <span className={`float-collapsed-tab-dot ${tc}`} />
      </div>
    );
  }

  // ---- Expanded state ----
  setTimeout(() => {
    if (panelRef.current) {
      const r = panelRef.current.getBoundingClientRect();
      console.log('[悬浮窗] 实际位置:', JSON.stringify({ left: r.left, top: r.top, width: r.width, height: r.height, vw: window.innerWidth, vh: window.innerHeight }));
    }
  }, 100);
  console.log('[悬浮窗] 展开态', isRightEdge.current ? '(右侧)' : '(固定位置)', 'pos:', pos, 'w:', panelWidth, 'h:', panelHeight);
  const tc = toneClass(totalChangePct);
  const panelStyle: React.CSSProperties = isRightEdge.current
    ? { right: 8, top: pos.y, opacity }
    : { left: pos.x, top: pos.y, opacity };
  if (panelWidth && panelWidth > 0) panelStyle.width = panelWidth;
  // 忽略过小的高度（< 200px 可能是误操作）
  const bodyStyle: React.CSSProperties = {};
  const effectiveHeight = (panelHeight && panelHeight >= 200) ? panelHeight : 0;
  if (effectiveHeight > 0) bodyStyle.maxHeight = effectiveHeight;

  return (
    <div ref={panelRef} className="float-panel" style={panelStyle}>
      {/* Header */}
      <div className="float-header" onMouseDown={(e) => startDrag(e, pos)}>
        <div className="float-header-title">
          <span className={`float-header-indicator ${tc}`} />
          <span>Mini股票</span>
          {lastUpdated && <span className="float-header-time">{lastUpdated}</span>}
        </div>
        <div className="float-header-actions">
          <div className="float-opacity-wrap" ref={opacityRef}>
            <button className="float-btn" onClick={(e) => { e.stopPropagation(); setShowOpacity((v) => !v); }} title="透明度" type="button" style={{ opacity: opacity < 0.8 ? opacity + 0.2 : 1 }}>◐</button>
            {showOpacity && (
              <div className="float-opacity-popup">
                <input type="range" min={0.5} max={1} step={0.05} value={opacity} onChange={(e) => onOpacityChange(parseFloat(e.target.value))} className="float-opacity-slider" />
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
      <div className="float-body" style={bodyStyle}>{children}</div>

      {/* Resize handles: bottom-left corner, bottom-right corner, bottom edge */}
      <div className="float-resize-corner left" onMouseDown={startResize} />
      <div className="float-resize-edge" onMouseDown={startResize} />
      <div className="float-resize-corner right" onMouseDown={startResize} />
    </div>
  );
}
