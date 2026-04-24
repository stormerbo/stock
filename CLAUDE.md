# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

赚钱助手 是一个 Chrome 扩展，用于管理 A 股股票和基金持仓。基于 React 18 + TypeScript + Vite + Tailwind CSS + CRXJS 构建。

## 常用命令

```bash
npm install          # 安装依赖
npm run dev          # 开发模式（带热更新）
npm run build        # 构建生产版本（先 tsc 再 vite build）
npm run preview      # 预览构建产物
npm run lint         # ESLint 检查
```

构建产物输出到 `dist/` 文件夹，通过 Chrome 的 `chrome://extensions/` 加载已解压的扩展程序。

## 架构概览

### 核心模块

- **`src/popup/App.tsx`** — 扩展 popup 主界面，包含股票/基金/账户三个 Tab 页，内联搜索、拖拽排序、内联编辑、深色/浅色主题切换
- **`src/background/index.ts`** — Chrome Service Worker，负责定时刷新行情数据、更新扩展角标（badge）、发送告警通知
- **`src/options/App.tsx`** — 设置页面，配置角标模式、刷新策略、股价告警规则
- **`src/shared/fetch.ts`** — 共享数据层，所有类型定义（`StockPosition`/`FundPosition`/`MarketIndexQuote`）和数据获取函数集中在此

### 数据流

1. **后台刷新**：`background/index.ts` 使用 `chrome.alarms` 定时拉取行情（只在 A 股交易时段内），写入 `chrome.storage.local`
2. **前端消费**：`popup/App.tsx` 监听 `chrome.storage.local` 的变化，实时更新 UI
3. **用户配置**：股票/基金持仓配置存储在 `chrome.storage.sync`，popup 修改后自动同步

### 数据存储

| Key | Storage Area | 内容 |
|-----|-------------|------|
| `stockHoldings` | sync | 用户持仓配置 `{code, shares, cost, pinned?, special?}` |
| `fundHoldings` | sync | 基金持仓配置 `{code, units, cost, name?, pinned?, special?}` |
| `stockPositions` | local | 实时股票行情数据 |
| `fundPositions` | local | 实时基金行情数据 |
| `indexPositions` | local | 市场指数行情 |
| `badgeConfig` | sync | 角标显示模式配置 |
| `refreshConfig` | sync | 刷新间隔配置 |
| `alertConfig` | sync | 告警规则配置 |
| `displayConfig` | sync | 显示偏好（涨跌色、小数位） |

### 外部 API

行情数据全部来自腾讯财经和天天基金：
- 股票实时行情：`https://qt.gtimg.cn/q=`（GB18030 编码）
- 分时数据：`https://web.ifzq.gtimg.cn/appstock/app/minute/query`
- 市场指数：`https://qt.gtimg.cn/q=`（`s_` 前缀）
- 基金数据：`https://fundmobapi.eastmoney.com/` + `https://fundgz.1234567.com.cn/`

### 共享模块

- **`src/shared/fetch.ts`** — 类型定义 + 数据获取工具
- **`src/shared/alerts.ts`** — 告警配置类型、规则匹配逻辑、防抖（cooldown）机制
- **`src/types/chrome.d.ts`** — Chrome API 类型声明（不依赖 `@types/chrome`）

### 页面组件

- **`src/popup/StockDetailView.tsx`** — 股票详情弹窗（分时图、K线等）
- **`src/popup/FundDetailView.tsx`** — 基金详情弹窗
- **`src/popup/IndexDetailModal.tsx`** — 指数详情弹窗

### 消息通信

Popup 通过 `chrome.runtime.sendMessage` 向 background 发送 `{ type: 'fetch-text', url: '...' }` 来处理跨域请求（popup CSP 限制）。

## 注意事项

- 项目使用 `@crxjs/vite-plugin` 进行 Chrome 扩展构建，manifest.json 中直接引用 `src/` 下的源文件
- TypeScript 配置使用 `bundler` 模块解析 + `@/*` 路径别名指向 `src/`
- 所有数字型数据使用 `Number.isFinite()` 进行有效性判断，无效值统一为 `Number.NaN`
- 涨跌色调：CSS 中 `.up` = 红色（涨），`.down` = 绿色（跌），符合 A 股习惯
