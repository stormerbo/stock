import { getDesignTokenVariables, serializeCssVariables } from '../shared/design-tokens';

const darkThemeVariables = serializeCssVariables(getDesignTokenVariables('dark'));
const lightThemeVariables = serializeCssVariables(getDesignTokenVariables('light'));
const whiteThemeVariables = serializeCssVariables(getDesignTokenVariables('white'));

export const OVERLAY_CSS = `
:host {
  all: initial;
  ${darkThemeVariables}
  --bg-surface: var(--color-surface);
  --bg-header: linear-gradient(135deg, color-mix(in srgb, var(--color-accent-soft) 90%, transparent), color-mix(in srgb, var(--color-accent) 10%, transparent));
  --bg-card: color-mix(in srgb, var(--surface-glass) 80%, transparent);
  --bg-card-hover: color-mix(in srgb, var(--surface-glass-strong) 78%, transparent);
  --border-color: color-mix(in srgb, var(--color-border) 72%, transparent);
  --text-primary: var(--color-text);
  --text-secondary: var(--color-text-muted);
  --text-tertiary: var(--color-text-faint);
  --up: var(--color-up);
  --up-bg: color-mix(in srgb, var(--color-up) 12%, transparent);
  --down: var(--color-down);
  --down-bg: color-mix(in srgb, var(--color-down) 12%, transparent);
  --brand: var(--color-accent);
  --brand-glow: color-mix(in srgb, var(--color-accent) 25%, transparent);
  --radius: 14px;
  --shadow: var(--shadow-lg);
  --font: var(--font-sans);
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
  backdrop-filter: var(--surface-blur);
  -webkit-backdrop-filter: var(--surface-blur);
  border: 1px solid var(--surface-glass-border);
  border-top: 1px solid color-mix(in srgb, var(--color-border-strong) 70%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--color-border) 26%, transparent);
  font-family: var(--font);
  font-size: 12px;
  line-height: 1.4;
  color: var(--text-primary);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  position: relative;
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
  background: var(--state-hover-bg);
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
  box-shadow: var(--shadow-sm);
  backdrop-filter: var(--surface-blur);
  -webkit-backdrop-filter: var(--surface-blur);
  white-space: nowrap;
}

.float-opacity-slider {
  -webkit-appearance: none;
  appearance: none;
  width: 72px;
  height: 4px;
  border-radius: 2px;
  background: color-mix(in srgb, var(--color-line) 90%, transparent);
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
  background: color-mix(in srgb, var(--color-line) 90%, transparent);
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
  border-bottom: 1px solid color-mix(in srgb, var(--color-line) 44%, transparent);
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
  background: var(--bg-surface);
  backdrop-filter: var(--surface-blur);
  -webkit-backdrop-filter: var(--surface-blur);
  border: 1px solid color-mix(in srgb, var(--color-border) 90%, transparent);
  box-shadow: var(--shadow-md);
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
  background: var(--bg-card);
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
  border-top: 1px dashed color-mix(in srgb, var(--color-line) 86%, transparent);
  height: 0;
}

.stock-detail-grid-mid {
  border-top-color: color-mix(in srgb, var(--color-line) 100%, transparent);
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
  ${lightThemeVariables}
  --bg-surface: var(--color-surface);
  --bg-header: linear-gradient(135deg, color-mix(in srgb, var(--color-accent-soft) 90%, transparent), color-mix(in srgb, var(--color-accent) 8%, transparent));
  --bg-card: color-mix(in srgb, var(--state-muted-bg) 88%, transparent);
  --bg-card-hover: var(--state-hover-bg);
  --border-color: color-mix(in srgb, var(--color-border) 72%, transparent);
  --text-primary: var(--color-text);
  --text-secondary: var(--color-text-muted);
  --text-tertiary: var(--color-text-faint);
  --up: var(--color-up);
  --down: var(--color-down);
  --shadow: var(--shadow-md);
}

.theme-white {
  ${whiteThemeVariables}
  --bg-surface: var(--color-surface);
  --bg-header: linear-gradient(135deg, color-mix(in srgb, var(--color-accent-soft) 88%, transparent), color-mix(in srgb, var(--color-accent) 6%, transparent));
  --bg-card: color-mix(in srgb, var(--state-muted-bg) 96%, transparent);
  --bg-card-hover: var(--state-hover-bg);
  --border-color: color-mix(in srgb, var(--color-border) 72%, transparent);
  --text-primary: var(--color-text);
  --text-secondary: var(--color-text-muted);
  --text-tertiary: var(--color-text-faint);
  --up: var(--color-up);
  --down: var(--color-down);
  --shadow: var(--shadow-md);
}

.theme-light .stock-card,
.theme-white .stock-card {
  border-bottom-color: color-mix(in srgb, var(--color-line) 44%, transparent);
}

.theme-light .float-body::-webkit-scrollbar-thumb,
.theme-white .float-body::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--color-line) 90%, transparent);
}

.theme-light .float-btn:hover,
.theme-white .float-btn:hover {
  background: var(--state-hover-bg);
}

.theme-light .float-collapsed-tab,
.theme-white .float-collapsed-tab {
  border-color: color-mix(in srgb, var(--color-border) 90%, transparent);
  box-shadow: var(--shadow-sm);
}

/* =================================================================
   Glass theme overrides
   ================================================================= */
.theme-glass {
  --bg-surface: color-mix(in srgb, var(--color-surface) 24%, transparent);
  --bg-card: color-mix(in srgb, var(--surface-glass) 60%, transparent);
  --bg-card-hover: color-mix(in srgb, var(--surface-glass-strong) 64%, transparent);
  --border-color: color-mix(in srgb, var(--surface-glass-border) 70%, transparent);
  --bg-header: linear-gradient(135deg, color-mix(in srgb, var(--color-accent-soft) 72%, transparent), color-mix(in srgb, var(--color-accent) 10%, transparent));
}

.theme-glass .float-panel,
.theme-glass .float-collapsed-tab {
  backdrop-filter: var(--surface-blur);
  -webkit-backdrop-filter: var(--surface-blur);
}

.theme-glass .float-opacity-popup {
  background: color-mix(in srgb, var(--color-surface) 30%, transparent);
  backdrop-filter: var(--blur-lg);
  -webkit-backdrop-filter: var(--blur-lg);
}
`;
