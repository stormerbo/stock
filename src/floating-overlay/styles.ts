export const OVERLAY_CSS = `
:host {
  all: initial;
  --bg-0: #0f1118;
  --bg-1: #171a26;
  --bg-2: #23283a;
  --text-0: #f4f6ff;
  --text-1: #c5cbe2;
  --text-2: #7a829e;
  --up: #ff5e57;
  --down: #1fc66d;
  --brand: #6b5cf6;
  --overlay-radius: 12px;
  --overlay-shadow: 0 8px 32px rgba(0, 0, 0, 0.45);
  --overlay-bg: rgba(15, 17, 24, 0.93);
}

:host * {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  font-family: 'PingFang SC', -apple-system, 'Segoe UI', sans-serif;
  font-size: 12px;
  line-height: 1.4;
  color: var(--text-0);
}

/* ========== Panel ========== */
.float-panel {
  position: fixed;
  z-index: 2147483646;
  user-select: none;
  min-width: 280px;
  max-width: min(380px, calc(100vw - 20px));
}

.float-panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  cursor: grab;
  border-radius: var(--overlay-radius) var(--overlay-radius) 0 0;
}

.float-panel-header:active {
  cursor: grabbing;
}

.float-panel-title {
  flex: 1;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-0);
  letter-spacing: 0.3px;
}

.float-panel-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 4px;
  color: var(--text-2);
  font-size: 14px;
  line-height: 1;
  transition: color 0.15s, background 0.15s;
}

.float-panel-btn:hover {
  color: var(--text-0);
  background: var(--bg-2);
}

.float-panel-body {
  max-height: 70vh;
  overflow-y: auto;
  border-radius: 0 0 var(--overlay-radius) var(--overlay-radius);
}

.float-panel-body::-webkit-scrollbar {
  width: 4px;
}

.float-panel-body::-webkit-scrollbar-thumb {
  background: var(--bg-2);
  border-radius: 2px;
}

/* ========== Collapsed bar ========== */
.float-collapsed {
  cursor: pointer;
  padding: 8px 14px;
  border-radius: var(--overlay-radius);
  display: flex;
  align-items: center;
  gap: 10px;
  transition: opacity 0.15s;
}

.float-collapsed:hover {
  opacity: 0.85;
}

.float-collapsed-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.float-collapsed-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-1);
}

.float-collapsed-change {
  font-size: 12px;
  font-weight: 600;
}

/* ========== Glass background ========== */
.float-glass {
  background: var(--overlay-bg);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: var(--overlay-shadow);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
}

/* ========== Stock Card ========== */
.stock-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  transition: background 0.1s;
}

.stock-card:hover {
  background: rgba(255, 255, 255, 0.04);
}

.stock-card-info {
  min-width: 0;
  flex: 1;
}

.stock-card-name {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-0);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stock-card-code {
  font-size: 10px;
  color: var(--text-2);
}

.stock-card-price {
  text-align: right;
  flex-shrink: 0;
  min-width: 55px;
}

.stock-card-price-value {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-0);
  font-variant-numeric: tabular-nums;
}

.stock-card-price-change {
  font-size: 11px;
  font-weight: 500;
}

.stock-card-chart {
  flex-shrink: 0;
  width: 100px;
  height: 28px;
}

.stock-card-spacer {
  flex: 1;
}

/* ========== Empty / Loading ========== */
.float-empty {
  padding: 24px 16px;
  text-align: center;
  color: var(--text-2);
  font-size: 12px;
  line-height: 1.6;
}

.float-empty-hint {
  margin-top: 4px;
  font-size: 11px;
  opacity: 0.7;
}

.float-loading {
  padding: 16px;
  text-align: center;
  color: var(--text-2);
  font-size: 11px;
}

/* ========== Up / Down colors ========== */
.color-up {
  color: var(--up);
}

.color-down {
  color: var(--down);
}

/* ========== Light theme ========== */
.theme-light {
  --bg-0: #f5f6fa;
  --bg-1: #ffffff;
  --bg-2: #e8ecf4;
  --text-0: #1a1d2e;
  --text-1: #4a4f6a;
  --text-2: #8e94aa;
  --overlay-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
  --overlay-bg: rgba(245, 246, 250, 0.95);
}

.theme-light .stock-card {
  border-top-color: rgba(0, 0, 0, 0.06);
}

.theme-light .stock-card:hover {
  background: rgba(0, 0, 0, 0.02);
}

.theme-light .float-glass {
  border-color: rgba(0, 0, 0, 0.08);
}

.theme-light .float-panel-body::-webkit-scrollbar-thumb {
  background: var(--bg-2);
}

.theme-light .float-panel-btn:hover {
  color: var(--text-0);
  background: var(--bg-2);
}
`;
