# 股票与指数统一图表 Provider Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立股票与指数统一图表 provider，让列表小分时、详情页和后台刷新共用同一套图表数据入口。

**Architecture:** 新增 `src/shared/chart-provider.ts` 作为统一图表入口，负责股票/指数分流、复用现有 stock failover、统一返回标准化图表数据，并提供详情页适配。上层 popup/background 不再直接决定底层接口，现有 `stock-chart-sources.ts` 与 `stock-chart-failover.ts` 保持 source/failover 单一职责。

**Tech Stack:** TypeScript, React 18, Chrome Extension storage/background, Node test runner, Vite

---

## Chunk 1: Provider 基础能力

### Task 1: 建立 provider 的最小行为测试

**Files:**
- Create: `tests/chart-provider.test.ts`
- Reference: `src/shared/stock-chart-failover.ts`
- Reference: `src/shared/stock-chart-sources.ts`

- [ ] **Step 1: 写失败测试，锁定 provider 行为**

覆盖：
- 股票 `minute` 通过 stock failover 获取
- 指数 `minute` 通过东财 intraday 获取
- 指数 `month` K 线使用月 K 参数
- `fetchInstrumentDetail()` 能把 quote + kline 组装成 `StockDetailData`

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/chart-provider.test.ts`
Expected: FAIL，提示 provider 文件或导出不存在

- [ ] **Step 3: 写最小 provider 实现**

Create: `src/shared/chart-provider.ts`

实现：
- `fetchInstrumentIntraday(input)`
- `fetchInstrumentKline(input)`
- `fetchInstrumentDetail(input)`
- 统一输入 `instrumentType/code/period`

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test tests/chart-provider.test.ts`
Expected: PASS

### Task 2: 收口指数 minute/K 线适配

**Files:**
- Modify: `src/popup/index-chart-adapter.ts`
- Modify: `src/shared/stock-chart-sources.ts`
- Test: `tests/index-chart-adapter.test.ts`

- [ ] **Step 1: 让指数分钟点适配完全围绕 provider 标准输出**

把分钟点适配限定为从统一 `ChartPoint[]` 转 `{ time, price, cumulativeVolume, volume }`

- [ ] **Step 2: 跑适配测试**

Run: `node --test tests/index-chart-adapter.test.ts`
Expected: PASS

## Chunk 2: 迁移 popup / background 调用方

### Task 3: popup 股票列表与初始化刷新切到 provider

**Files:**
- Modify: `src/shared/fetch.ts`
- Modify: `src/popup/App.tsx`
- Modify: `src/popup/components/StockTable.tsx`
- Reference: `src/shared/stock-intraday-cache.ts`

- [ ] **Step 1: 将 `fetchStockIntraday()` 改为 provider 轻包装**

要求：
- 不再自己决定底层 source
- 输出继续兼容现有 `{ data: [{time, price}], prevClose }`

- [ ] **Step 2: 让 popup 初始化缺口补拉和交易时段轮询继续走同一包装**

无需更改 `IntradayChart` 输入协议

- [ ] **Step 3: 运行构建与相关测试**

Run:
- `node --test tests/stock-intraday-cache.test.ts`
- `npm run build`

Expected: PASS

### Task 4: 指数详情页切到 provider

**Files:**
- Modify: `src/popup/stockDetail.ts`
- Modify: `src/popup/views/IndexDetailModal.tsx`
- Reference: `src/shared/chart-provider.ts`

- [ ] **Step 1: `stockDetail.ts` 改为 provider 兼容层**

保留外部导出名称，内部改调统一 provider

- [ ] **Step 2: `IndexDetailModal.tsx` 只使用 provider/detail adapter**

移除页面层对具体 source 的假设

- [ ] **Step 3: 跑指数相关测试与构建**

Run:
- `node --test tests/index-chart-adapter.test.ts tests/chart-provider.test.ts`
- `npm run build`

Expected: PASS

### Task 5: background 股票分时刷新切到 provider

**Files:**
- Modify: `src/background/index.ts`
- Modify: `src/shared/fetch.ts`

- [ ] **Step 1: background 分时刷新通过 provider 包装层获取**

确保 popup / background 共用同一股票分时入口

- [ ] **Step 2: 保持缓存版本与旧数据失效逻辑兼容**

- [ ] **Step 3: 运行构建**

Run: `npm run build`
Expected: PASS

## Chunk 3: 清理分叉与验证

### Task 6: 删除/收缩重复图表抓取逻辑

**Files:**
- Modify: `src/popup/stockDetail.ts`
- Modify: `src/popup/views/IndexDetailModal.tsx`
- Modify: `src/shared/fetch.ts`

- [ ] **Step 1: 删除不再需要的页面层直连接口分支**

目标：
- popup 页面不再直连图表原始接口
- 保留必要兼容导出，但减少重复实现

- [ ] **Step 2: 扫描残留旧图表接口调用**

Run: `rg -n "minute/query|day/query|fqkline/get|mkline" src`
Expected: 仅保留 source/failover 层允许存在的调用

### Task 7: 最终验证

**Files:**
- Test: `tests/chart-provider.test.ts`
- Test: `tests/stock-chart-failover.test.ts`
- Test: `tests/stock-chart-sources.test.ts`
- Test: `tests/index-chart-adapter.test.ts`
- Test: `tests/stock-intraday-cache.test.ts`

- [ ] **Step 1: 跑图表统一相关测试**

Run:
- `node --test tests/chart-provider.test.ts`
- `node --test tests/index-chart-adapter.test.ts`
- `node --test tests/stock-chart-failover.test.ts tests/stock-chart-sources.test.ts tests/stock-intraday-cache.test.ts`

Expected: PASS

- [ ] **Step 2: 跑完整构建**

Run: `npm run build`
Expected: PASS

- [ ] **Step 3: 手工核对影响面**

确认：
- 股票列表小分时正常
- 股票详情分时/K 线正常
- 顶部指数详情分时/K 线正常
- background 刷新后缓存结构正常
