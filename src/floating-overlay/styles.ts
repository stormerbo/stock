export const OVERLAY_CSS = `
:host {
  all: initial;
  --bg-surface: rgba(18, 22, 33, 0.35);
  --bg-header: linear-gradient(135deg, rgba(107, 92, 246, 0.18), rgba(59, 130, 246, 0.08));
  --bg-card: rgba(255, 255, 255, 0.04);
  --bg-card-hover: rgba(255, 255, 255, 0.07);
  --border-color: rgba(255, 255, 255, 0.08);
  --text-primary: #f1f5f9;
  --text-secondary: #94a3b8;
  --text-tertiary: #64748b;
  --up: #f87171;
  --up-bg: rgba(248, 113, 113, 0.12);
  --down: #34d399;
  --down-bg: rgba(52, 211, 153, 0.12);
  --brand: #818cf8;
  --brand-glow: rgba(129, 140, 248, 0.25);
  --radius: 14px;
  --shadow: 0 12px 48px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.3);
  --font: 'PingFang SC', -apple-system, 'Segoe UI', Roboto, sans-serif;
}

:host * {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

/* =================================================================
   Panel Shell
   ================================================================= */
.float-panel {
  position: absolute;
  z-index: 1;
  user-select: none;
  pointer-events: all;
  min-width: 200px;
  max-width: min(380px, calc(100vw - 24px));
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  background: var(--bg-surface);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(40px) saturate(1.6);
  -webkit-backdrop-filter: blur(40px) saturate(1.6);
  font-family: var(--font);
  font-size: 12px;
  line-height: 1.4;
  color: var(--text-primary);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  position: relative;
}

/* Glass inner glow overlay — subtle gradient keeps text readable */
.float-panel::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: var(--radius);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.05) 0%, transparent 40%),
    linear-gradient(0deg, rgba(0, 0, 0, 0.3) 0%, transparent 40%);
  pointer-events: none;
  z-index: 0;
}

.float-panel > * {
  position: relative;
  z-index: 1;
}

/* =================================================================
   Header
   ================================================================= */
.float-header {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px 6px 4px;
  cursor: grab;
  background: var(--bg-header);
  border-bottom: 1px solid var(--border-color);
  user-select: none;
  -webkit-user-select: none;
  flex-shrink: 0;
}

.float-header:active {
  cursor: grabbing;
}

.float-header-title {
  flex: 1;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  letter-spacing: 0.5px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.float-header-indicator {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--up);
  flex-shrink: 0;
}

.float-header-indicator.down {
  background: var(--down);
}

.float-header-indicator.neutral {
  background: var(--text-tertiary);
}

.float-header-time {
  font-size: 10px;
  color: var(--text-tertiary);
  font-weight: 400;
  margin-left: 4px;
}

.float-header-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.float-btn {
  background: none;
  border: none;
  cursor: pointer;
  width: 20px;
  height: 20px;
  border-radius: 5px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
  font-size: 12px;
  line-height: 1;
  transition: all 0.12s;
  flex-shrink: 0;
  padding: 0;
}

.float-btn:hover {
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.08);
}

/* Opacity control */
.float-opacity-wrap {
  position: relative;
}

.float-opacity-popup {
  position: absolute;
  top: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 8px;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(20px) saturate(1.4);
  -webkit-backdrop-filter: blur(20px) saturate(1.4);
  white-space: nowrap;
}

.float-opacity-slider {
  -webkit-appearance: none;
  appearance: none;
  width: 72px;
  height: 4px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.15);
  outline: none;
  cursor: pointer;
}

.float-opacity-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--brand);
  cursor: pointer;
  box-shadow: 0 0 4px var(--brand-glow);
}

.float-opacity-label {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-secondary);
  min-width: 28px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

/* =================================================================
   Resize handles (no visible indicator, just hit areas)
   ================================================================= */
.float-resize-corner {
  position: absolute;
  bottom: 0;
  width: 20px;
  height: 20px;
  z-index: 5;
  cursor: nwse-resize;
}

.float-resize-corner.left {
  left: 0;
  cursor: nesw-resize;
}

.float-resize-corner.right {
  right: 0;
  cursor: nwse-resize;
}

.float-resize-edge {
  position: absolute;
  bottom: 0;
  left: 20px;
  right: 20px;
  height: 6px;
  z-index: 5;
  cursor: ns-resize;
}

/* =================================================================
   Body / Scroll
   ================================================================= */
.float-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.float-body::-webkit-scrollbar {
  width: 3px;
}

.float-body::-webkit-scrollbar-track {
  background: transparent;
}

.float-body::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
}

/* =================================================================
   Stock Card
   ================================================================= */
.stock-card {
  display: flex;
  align-items: center;
  gap: 0;
  padding: 7px 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  transition: background 0.1s;
  position: relative;
}

.stock-card:last-child {
  border-bottom: none;
}

.stock-card:hover {
  background: var(--bg-card-hover);
}

.stock-card-accent {
  width: 3px;
  height: 32px;
  border-radius: 2px;
  flex-shrink: 0;
  margin-right: 10px;
}

.stock-card-accent.up {
  background: var(--up);
  box-shadow: 0 0 6px var(--up);
}

.stock-card-accent.down {
  background: var(--down);
  box-shadow: 0 0 6px var(--down);
}

.stock-card-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.stock-card-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.3;
}

.stock-card-code {
  font-size: 10px;
  color: var(--text-tertiary);
  line-height: 1.2;
}

.stock-card-chart {
  flex-shrink: 0;
  width: 88px;
  height: 28px;
  margin: 0 8px;
  opacity: 0.85;
}

.stock-card-price {
  text-align: right;
  flex-shrink: 0;
  min-width: 62px;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.stock-card-price-value {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
  letter-spacing: -0.3px;
}

.stock-card-price-change {
  font-size: 11px;
  font-weight: 600;
  line-height: 1.2;
}

/* =================================================================
   Collapsed Tab (right-edge circle)
   ================================================================= */
.float-collapsed-tab {
  position: absolute;
  z-index: 1;
  cursor: pointer;
  pointer-events: all;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: rgba(18, 22, 33, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: -1px 2px 8px rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(30px) saturate(1.6);
  -webkit-backdrop-filter: blur(30px) saturate(1.6);
  font-family: var(--font);
  user-select: none;
  -webkit-user-select: none;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: opacity 0.12s;
  overflow: hidden;
}

.float-collapsed-tab:hover {
  opacity: 0.8;
}

.float-collapsed-tab-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
  box-shadow: 0 0 8px currentColor;
}

.float-collapsed-tab-dot.up { color: var(--up); background: var(--up); }
.float-collapsed-tab-dot.down { color: var(--down); background: var(--down); }
.float-collapsed-tab-dot.neutral { color: var(--text-tertiary); background: var(--text-tertiary); }

/* =================================================================
   Empty State
   ================================================================= */
.float-empty {
  padding: 32px 20px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.float-empty-icon {
  font-size: 24px;
  opacity: 0.4;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.04);
}

.float-empty-text {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.float-empty-hint {
  font-size: 11px;
  color: var(--text-tertiary);
}

/* =================================================================
   Detail View
   ================================================================= */
.stock-detail {
  padding: 0;
}

.stock-detail-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-color);
}

.stock-detail-back {
  flex-shrink: 0;
  font-size: 14px;
}

.stock-detail-title {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.stock-detail-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.stock-detail-code {
  font-size: 10px;
  color: var(--text-tertiary);
}

.stock-detail-price-section {
  text-align: right;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.stock-detail-price {
  font-size: 18px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.5px;
  line-height: 1.1;
}

.stock-detail-change {
  font-size: 12px;
  font-weight: 600;
}

.stock-detail-chart-area {
  display: flex;
  padding: 10px 8px 10px 4px;
  gap: 4px;
  position: relative;
}

.stock-detail-yaxis {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 6px 0;
  flex-shrink: 0;
  width: 40px;
}

.stock-detail-ylabel {
  font-size: 9px;
  font-weight: 500;
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
  text-align: right;
  line-height: 1;
}

.stock-detail-chart-wrap {
  flex: 1;
  position: relative;
  min-height: 96px;
}

.stock-detail-grid {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  pointer-events: none;
}

.stock-detail-grid-line {
  border-top: 1px dashed rgba(255, 255, 255, 0.08);
  height: 0;
}

.stock-detail-grid-mid {
  border-top-color: rgba(255, 255, 255, 0.15);
  position: relative;
}

.stock-detail-chart-wrap svg.intraday-chart {
  width: 100% !important;
  height: 100% !important;
  display: block;
}

.stock-detail-stats {
  display: flex;
  gap: 0;
  border-top: 1px solid var(--border-color);
  padding: 8px 12px;
}

.stock-detail-stat {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-width: 0;
}

.stock-detail-stat-label {
  font-size: 9px;
  color: var(--text-tertiary);
  white-space: nowrap;
}

.stock-detail-stat-value {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* =================================================================
   Drag & drop
   ================================================================= */
.stock-card.dragging {
  opacity: 0.4;
}

.stock-card.drag-over {
  border-top: 2px solid var(--brand);
}

/* =================================================================
   Up / Down color classes
   ================================================================= */
.color-up { color: var(--up); }
.color-down { color: var(--down); }

/* =================================================================
   Light theme overrides
   ================================================================= */
.theme-light {
  --bg-surface: rgba(248, 250, 252, 0.6);
  --bg-header: linear-gradient(135deg, rgba(129, 140, 248, 0.10), rgba(99, 102, 241, 0.04));
  --bg-card: rgba(0, 0, 0, 0.02);
  --bg-card-hover: rgba(0, 0, 0, 0.04);
  --border-color: rgba(148, 163, 184, 0.2);
  --text-primary: #0f172a;
  --text-secondary: #475569;
  --text-tertiary: #94a3b8;
  --up: #dc2626;
  --down: #16a34a;
  --shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06);
}

.theme-light .stock-card {
  border-bottom-color: rgba(0, 0, 0, 0.04);
}

.theme-light .float-body::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.1);
}

.theme-light .float-btn:hover {
  background: rgba(0, 0, 0, 0.06);
}

.theme-light .float-collapsed-tab {
  background: rgba(248, 250, 252, 0.78);
  border-color: rgba(0, 0, 0, 0.12);
  box-shadow: -1px 2px 8px rgba(0, 0, 0, 0.1);
}
`;
