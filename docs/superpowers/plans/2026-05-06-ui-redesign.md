# UI 全面改版实施计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将赚钱助手 Chrome 扩展的 UI 从 glassmorphism 风格全面改造为同花顺式专业金融工具风格

**Architecture:** 分 6 个 Chunk 渐进替换 CSS 变量和样式，每 Chunk 独立可构建验证。核心是 `index.css` 的 CSS 变量体系重写 + 各组件样式适配。

**Tech Stack:** React 18 + TypeScript + Vite + Tailwind CSS（仅 utility class）+ 自定义 CSS

**Design Spec:** `docs/superpowers/specs/2026-05-06-ui-redesign-design.md`

---

## 文件改动范围

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| `src/popup/index.css` | 重度修改 | CSS 变量体系 + 所有组件样式 |
| `src/popup/App.tsx` | 轻度修改 | 侧边栏宽度调整、部分 className |
| `src/popup/SectorHeatMap.tsx` | 轻度修改 | tile 配色引用 |
| `src/popup/StockDetailView.tsx` | 轻度修改 | 标题栏结构 |
| 其他 `*.tsx` | 不变 | 组件逻辑不变 |

---

## Chunk 1: CSS 变量体系 + 基础布局

### Task 1.1: 重写 CSS 变量

**Files:**
- Modify: `src/popup/index.css:1-20`（`:root` 和 `body.theme-light` 变量块）

- [ ] **Step 1: 替换 `:root` 变量块**

将当前 18 个变量：
```css
:root {
  --bg-0: #0f1118;
  --bg-1: #171a26;
  --bg-2: #23283a;
  --text-0: #f4f6ff;
  --text-1: #c5cbe2;
  --line: rgba(255, 255, 255, 0.09);
  --glass-bg: rgba(255, 255, 255, 0.05);
  --glass-bg-strong: rgba(255, 255, 255, 0.09);
  --glass-border: rgba(255, 255, 255, 0.06);
  --glass-shadow: 0 10px 28px rgba(3, 6, 16, 0.22);
  --glass-blur: blur(20px) saturate(135%);
  --brand: #6b5cf6;
  --brand-soft: rgba(107, 92, 246, 0.2);
  --up: #ff5e57;
  --down: #1fc66d;
  --panel-opacity: 0.95;
}
```

替换为：
```css
:root {
  /* Background */
  --bg-page: #12161f;
  --bg-card: #1a1f2b;
  --bg-sidebar: #161b28;
  --bg-sidebar-hover: #1f2535;
  /* Text */
  --text-primary: #f4f6ff;
  --text-secondary: #6b7394;
  --text-tertiary: #4a5270;
  /* Border & Divider */
  --border-color: #1e2748;
  --border-light: rgba(255, 255, 255, 0.06);
  /* Brand */
  --brand: #3b6ff5;
  --brand-soft: rgba(59, 111, 245, 0.15);
  --brand-hover: #5080ff;
  /* Market */
  --up: #e64545;
  --down: #2db860;
  --up-bg: rgba(230, 69, 69, 0.10);
  --down-bg: rgba(45, 184, 96, 0.10);
  /* Misc */
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-xl: 12px;
  --shadow-card: 0 1px 3px rgba(0, 0, 0, 0.12);
}
```

- [ ] **Step 2: 替换 `body.theme-light` 变量块**

```css
body.theme-light {
  --bg-page: #f5f6fa;
  --bg-card: #ffffff;
  --bg-sidebar: #ebedf5;
  --bg-sidebar-hover: #e0e3f0;
  --text-primary: #1d2740;
  --text-secondary: #8e96b8;
  --text-tertiary: #b0b9d4;
  --border-color: #e8ebf2;
  --border-light: rgba(0, 0, 0, 0.06);
  --brand: #3b6ff5;
  --brand-soft: rgba(59, 111, 245, 0.10);
  --brand-hover: #2d5de0;
  --up: #cf2e2e;
  --down: #13964b;
  --up-bg: rgba(207, 46, 46, 0.08);
  --down-bg: rgba(19, 150, 75, 0.08);
  --shadow-card: 0 1px 3px rgba(0, 0, 0, 0.06);
}
```

- [ ] **Step 3: 在文件顶部添加 CSS transition 让主题切换平滑**

```css
body {
  transition: background-color 0.2s ease, color 0.2s ease;
}
```

- [ ] **Step 4: 构建验证**

```bash
npm run build
```
预期：构建成功（此时旧样式仍引用旧变量名，会有视觉错乱，但不应有构建错误）

- [ ] **Step 5: Commit**

```bash
git add src/popup/index.css
git commit -m "refactor: CSS 变量体系重写为同花顺风格配色"
```

---

### Task 1.2: 重写全局基础样式

**Files:**
- Modify: `src/popup/index.css:20-95`（`*`, `html`, `body`, `#root`, `.popup-root` 相关样式）

- [ ] **Step 1: 更新 html/body/#root 尺寸**

```css
html, body, #root {
  margin: 0;
  width: 800px;
  height: 600px;
  min-height: 600px;
  max-height: 600px;
  overflow: hidden;
}

html {
  background: transparent !important;
}

body {
  font-family: 'PingFang SC', 'Noto Sans SC', 'Helvetica Neue', sans-serif;
  color: var(--text-primary);
  background: transparent;
  -webkit-font-smoothing: antialiased;
}
```

- [ ] **Step 2: 替换 `.popup-root` 和 `::before` — 去除径向渐变**

当前 `.popup-root::before` 有大量径向渐变和 backdrop-filter，替换为纯色背景：

```css
.popup-root {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--bg-page);
}

.popup-root::before {
  display: none; /* 不再需要伪元素背景 */
}

body.theme-light .popup-root {
  background: var(--bg-page);
}
```

- [ ] **Step 3: 构建验证**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/popup/index.css
git commit -m "refactor: 去除毛玻璃背景，改为纯色页面背景"
```

---

## Chunk 2: 侧边栏 + 顶部区域

### Task 2.1: 侧边栏瘦身

**Files:**
- Modify: `src/popup/index.css:109-179`（`.side-nav`, `.nav-btn` 等）
- Modify: `src/popup/App.tsx`（grid 列宽）

- [ ] **Step 1: CSS — 侧边栏从 70px 收窄到 52px**

替换 `.side-nav` 样式块：

```css
.side-nav {
  width: 52px;
  height: 100%;
  background: var(--bg-sidebar);
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 6px;
}

.nav-btn {
  width: 40px;
  height: 40px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  border-radius: var(--radius-lg);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  font-size: 9px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
  position: relative;
}

.nav-btn:hover {
  background: var(--bg-sidebar-hover);
  color: var(--text-primary);
}

.nav-btn.active {
  background: var(--brand);
  color: #ffffff;
}

.nav-spacer {
  flex: 1;
}

.side-nav-footer {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.theme-toggle-btn {
  width: 36px;
  height: 36px;
}
```

- [ ] **Step 2: App.tsx — 更新 grid 列宽**

```tsx
// 将 grid-template-columns: 70px 1fr 改为 52px 1fr
gridTemplateColumns: '52px 1fr'
```

位置：查找 `grid-template-columns: 70px 1fr` 或 style 属性中的列宽定义。

- [ ] **Step 3: 构建验证**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/popup/index.css src/popup/App.tsx
git commit -m "refactor: 侧边栏瘦身至 52px，纯图标化导航"
```

---

### Task 2.2: 指数横条 + 页面头部简化

**Files:**
- Modify: `src/popup/index.css:196-270`（`.index-strip`, `.index-card` 等）
- Modify: `src/popup/index.css:535-550`（`.page-header`）

- [ ] **Step 1: 简化指数横条**

```css
.index-strip {
  padding: 6px 8px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.index-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
}

.index-card {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  border-left: 3px solid transparent;
  cursor: pointer;
  transition: border-color 0.15s ease;
}

.index-card:hover {
  border-color: var(--brand);
}

.index-card p {
  font-size: 9px;
  color: var(--text-secondary);
  margin: 0;
  white-space: nowrap;
}

.index-card strong {
  font-size: 13px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 2: 更新 index-card 涨跌左侧色条**

在 JSX 中给 `.index-card` 添加 inline style `borderLeftColor`（涨=var(--up), 跌=var(--down)）。此改动在 `App.tsx` 的 index-card 渲染处。

- [ ] **Step 3: 简化 page-header**

```css
.page-header {
  padding: 6px 8px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-shrink: 0;
}
```

- [ ] **Step 4: 构建验证并 commit**

```bash
npm run build
git add src/popup/index.css src/popup/App.tsx
git commit -m "refactor: 指数横条与页头简化，添加涨跌左侧色条"
```

---

## Chunk 3: 表格样式重写

### Task 3.1: 主数据表格（股票/基金）

**Files:**
- Modify: `src/popup/index.css:1078-1200`（`.data-table` 相关所有样式）

- [ ] **Step 1: 重写 `.data-table` 基础样式**

```css
.data-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.data-table thead th {
  position: sticky;
  top: 0;
  z-index: 3;
  background: var(--bg-card);
  color: var(--text-secondary);
  font-weight: 600;
  font-size: 10px;
  text-align: right;
  padding: 6px 8px;
  white-space: nowrap;
  border-bottom: 1px solid var(--border-color);
  border-right: 1px solid var(--border-color);
}

.data-table thead th:last-child {
  border-right: none;
}

.data-table thead th:first-child,
.data-table thead th:nth-child(2) {
  text-align: left;
}

.data-table tbody td {
  padding: 5px 8px;
  font-size: 11px;
  font-weight: 500;
  text-align: right;
  border-bottom: 1px solid var(--border-color);
  border-right: 1px solid var(--border-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  vertical-align: middle;
}

.data-table tbody td:last-child {
  border-right: none;
}

.data-table tbody td:first-child,
.data-table tbody td:nth-child(2) {
  text-align: left;
}

.data-table tbody tr:hover {
  background: var(--bg-sidebar-hover);
}
```

- [ ] **Step 2: 添加左侧涨跌色条（给每行的第一个 td）**

```css
.data-table tbody td:first-child {
  border-left: 3px solid transparent;
  padding-left: 5px;
}
```

在 App.tsx 中，给 `td:first-child` 根据涨跌幅添加 `borderLeftColor` inline style。

- [ ] **Step 3: 更新表头背景色**

原来表头使用 `color-mix(in srgb, var(--glass-bg-strong) 30%, transparent)` + `backdrop-filter`。现在改为纯色 `var(--bg-card)`。

- [ ] **Step 4: 更新所有引用旧变量的表格子样式**

检查并更新：`.stock-table`, `.fund-table`, `.sorting-row`, `.dragging-row`, `.locked-row`, `.placeholder-hint`, `.inline-edit-input`, `.skeleton-row`, `.name-col`, `.drag-handle`, `.pinned-flag`, `.stock-badge`, `.editable-trigger` 等，将所有 `var(--text-1)` → `var(--text-secondary)`，`var(--text-0)` → `var(--text-primary)`，`var(--line)` → `var(--border-color)` 等。

- [ ] **Step 5: 构建验证并 commit**

```bash
npm run build
git add src/popup/index.css src/popup/App.tsx
git commit -m "refactor: 表格样式重写，border-collapse + 左侧涨跌色条"
```

---

## Chunk 4: 详情面板统一

### Task 4.1: 股票详情 + 基金详情 + 指数详情

**Files:**
- Modify: `src/popup/index.css:1600-2550`（stock detail, fund detail, index modal 相关样式）

- [ ] **Step 1: 更新所有详情面板的变量引用**

全局替换这些区域中的变量：
- `var(--bg-0)` → `var(--bg-page)`
- `var(--bg-1)` → `var(--bg-card)`
- `var(--text-0)` → `var(--text-primary)`
- `var(--text-1)` → `var(--text-secondary)`
- `var(--line)` → `var(--border-color)`
- `var(--glass-border)` → `var(--border-color)`
- `var(--glass-bg)` → `var(--bg-sidebar-hover)`
- `var(--glass-bg-strong)` → `var(--bg-sidebar-hover)`
- `var(--glass-shadow)` → `var(--shadow-card)`
- `var(--brand)` 保持不变

- [ ] **Step 2: 移除所有 `backdrop-filter` 和 `-webkit-backdrop-filter`**

搜索并删除以下模式：
```css
backdrop-filter: ...;
-webkit-backdrop-filter: ...;
```

- [ ] **Step 3: 统一详情页 Header 样式**

使 StockDetailView、FundDetailView、SectorDetailView、LonghuBangModal 的 header 使用一致的返回按钮 + 标题结构。

- [ ] **Step 4: 构建验证并 commit**

```bash
npm run build
git add src/popup/index.css
git commit -m "refactor: 详情面板统一，去除所有 backdrop-filter"
```

---

## Chunk 5: 剩余组件

### Task 5.1: 账户页 + 通知面板 + Demo + Tags

**Files:**
- Modify: `src/popup/index.css`（account dashboard, notification, demo guide, tag editor, diagnostic 相关样式）

- [ ] **Step 1: 全局搜索替换旧变量名**

在整个 `index.css` 中运行替换：
- `var(--text-0)` → `var(--text-primary)`（全文件）
- `var(--text-1)` → `var(--text-secondary)`（全文件）
- `var(--line)` → `var(--border-color)`（全文件）
- `var(--bg-2)` → `var(--bg-sidebar-hover)`（全文件）
- `var(--glass-bg)` → `rgba(255,255,255,0.04)` 或 `var(--bg-sidebar-hover)`
- `var(--glass-bg-strong)` → `rgba(255,255,255,0.08)`
- `var(--glass-border)` → `var(--border-color)`

- [ ] **Step 2: 检查剩余 `var(--bg-0)` 和 `var(--bg-1)` 引用**

确保所有 `--bg-0` / `--bg-1` 都替换为 `--bg-page` / `--bg-card`。

- [ ] **Step 3: 更新 `.search-box`, `.search-suggestions` 等搜索相关样式**

```css
.search-box {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
}

.search-suggestions {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
}
```

- [ ] **Step 4: 构建验证并 commit**

```bash
npm run build
git add src/popup/index.css
git commit -m "refactor: 全局组件变量迁移，清除所有旧 CSS 变量引用"
```

---

## Chunk 6: 最终清理与验证

### Task 6.1: 删除废弃 CSS

- [ ] **Step 1: 检查是否还有未使用的旧变量名**

```bash
grep -n 'var(--bg-0)\|var(--bg-1)\|var(--bg-2)\|var(--glass-blur)\|var(--glass-shadow)\|var(--panel-opacity)' src/popup/index.css
```
预期：无匹配（全部已替换）

- [ ] **Step 2: 删除 `@keyframes shimmer` 和骨架屏（如需要）**

检查骨架屏动画是否仍使用旧变量，是则更新。

- [ ] **Step 3: 移除 `.grid-overlay`（已废弃）**

```css
.grid-overlay {
  display: none;
}
```
可删除。

- [ ] **Step 4: 全量构建 + 类型检查**

```bash
npm run build
```
预期：tsc + vite build 均无错误

- [ ] **Step 5: 目视检查 CSS 文件大小**

```bash
wc -l src/popup/index.css
```
预期：比原来的 4827 行减少（去除了大量 backdrop-filter 和径向渐变代码）

- [ ] **Step 6: Commit**

```bash
git add src/popup/index.css
git commit -m "chore: 最终清理，删除废弃 CSS 和旧变量引用"
```

---

## 验证清单

改版完成后逐项验证：

- [ ] `npm run build` 无错误
- [ ] 深色主题：页面底 `#12161f`，卡片 `#1a1f2b`，品牌蓝 `#3b6ff5`
- [ ] 浅色主题：页面底 `#f5f6fa`，卡片 `#ffffff`，品牌蓝 `#3b6ff5`
- [ ] 侧边栏 52px，纯图标，选中态蓝色实心方块
- [ ] 表格行有左侧涨（红）跌（绿）色条
- [ ] 表格 `border-collapse: collapse`，无断开线
- [ ] 无 `backdrop-filter` 残留
- [ ] 无径向渐变背景残留
- [ ] 所有 10 个页面结构完整，无视觉错乱
- [ ] 龙虎榜、成分股详情页无闪烁
- [ ] 800×600 窗口内容完整可见
