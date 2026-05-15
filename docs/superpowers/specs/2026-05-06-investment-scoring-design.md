# 综合评分与评级系统 — 设计文档

## 概述

在现有技术分析、基本面、风险指标的基础上，构建统一的综合评分体系，为每只持仓**股票**输出 0-100 分数和 S/A/B/C/D 评级，辅助投资决策。**基金不参与评分**（基金缺少 K 线和技术指标）。

## 评分模型

### 维度权重（趋势交易型）

| 一级维度 | 权重 | 二级指标 | 分权重 |
|----------|------|----------|--------|
| 技术面 | 50% | MACD 方向（金叉/死叉/趋势） | 15% |
| | | 均线排列（MA5/10/20 多空排列） | 10% |
| | | RSI 位置（超卖=高分，超买=低分） | 10% |
| | | 量能（相对 5 日均量） | 5% |
| | | KDJ 位置 + 金叉/死叉 | 5% |
| | | 布林带位置 | 5% |
| 基本面 | 30% | PE 绝对估值（基于 PE_TTM 区间） | 10% |
| | | ROE 水平 | 8% |
| | | 净利润增速 | 7% |
| | | 股息率 | 5% |
| 风险面 | 20% | 年化波动率 | 10% |
| | | 最大回撤（60 日） | 10% |

### 评分映射

- **技术面**：每个二级指标输出 0-100 子分数，按分权重加权汇总
- **基本面**：PE 越低分数越高（有上限），ROE/增速/股息越高分越高
- **风险面**：波动越低分数越高，回撤越小分数越高（反向指标）
- **最终分数** = 技术面×0.5 + 基本面×0.3 + 风险面×0.2

### 评级区间

| 评级 | 分数区间 | 含义 |
|------|----------|------|
| S | 85-100 | 强烈看多 |
| A | 70-84 | 看多 |
| B | 55-69 | 中性偏多 |
| C | 40-54 | 中性偏空 |
| D | 0-39 | 看空 |

## 类型定义

```typescript
// src/shared/scoring.ts
// 依赖类型来自：
//   KlinePoint          — src/shared/technical-analysis.ts
//   FundamentalData     — src/shared/fundamentals.ts
//   MaxDrawdownResult   — src/shared/risk-metrics.ts
//   VolatilityResult    — src/shared/risk-metrics.ts

/** 评分输入 — 所有数据由调用方预先获取 */
export type ScoreInput = {
  kline: KlinePoint[];
  fundamentals: FundamentalData;
  maxDrawdown: MaxDrawdownResult | null;
  volatility: VolatilityResult | null;
};

/** 子分数明细 */
export type ScoreBreakdown = {
  macd: number;           // MACD 子分 0-100
  maAlignment: number;    // 均线排列子分
  rsi: number;            // RSI 子分
  volume: number;         // 量能子分
  kdj: number;            // KDJ 子分
  bollinger: number;      // 布林带子分
  pe: number;             // PE 子分
  roe: number;            // ROE 子分
  profitGrowth: number;   // 利润增速子分
  dividendYield: number;  // 股息率子分
  volatility: number;     // 波动率子分
  drawdown: number;       // 回撤子分
};

/** 评分输出 */
export type StockScoreResult = {
  totalScore: number;            // 0-100
  rating: 'S' | 'A' | 'B' | 'C' | 'D';
  dimensions: {
    technical: number;   // 技术面汇总分 0-100
    fundamental: number; // 基本面汇总分 0-100
    risk: number;        // 风险面汇总分 0-100
  };
  breakdown: ScoreBreakdown;  // 各子指标明细（用于雷达图/AnalyticsView）
  warnings: string[];         // 如 "基本面数据缺失"、"K线不足30日"
};
```

## 架构设计

### 新增文件

```
src/shared/scoring.ts        # 评分计算纯函数 + 类型定义
src/popup/AnalyticsView.tsx  # 分析面板 Tab 页
```

### 修改文件

```
src/popup/App.tsx            # 列表项加入评分圆环（仅股票行） + 新增 Analytics Tab
```

### 数据流与编排

**编排层在 App.tsx**：App.tsx 已有定时拉取行情数据的逻辑（通过 `chrome.storage.local` 监听）。评分计算在行情数据到齐后触发：

```
App.tsx: refreshData()
  1. fetchBatchStockQuotes()       → StockPosition[]
  2. 对每只持仓股票并发：
     - fetchDayFqKline(code)        → KlinePoint[]
     - fetchFundamentals(code)      → FundamentalData
  3. 计算风险指标：
     - calcMaxDrawdownFromKline()   → MaxDrawdownResult | null
     - calcVolatilityFromKline()    → VolatilityResult | null
  4. computeStockScore(input)       → StockScoreResult
  5. 存入 state: Map<string, StockScoreResult>
  6. 列表项读取 state 渲染 ScoreBadge
  7. AnalyticsView 读取 state 渲染面板
```

评分计算在 `refreshData()` 中与行情刷新一起执行，复用已有的 loading/error 状态。步骤 2-4 用 `Promise.all` 并发执行。

为控制 API 请求量，K 线和基本面数据复用 `fetchDayFqKline` 和 `fetchFundamentals` 的现有调用逻辑，不额外增加请求频率。评分计算仅在以下时机触发：(1) popup 打开时的首次刷新；(2) 用户手动点击刷新按钮；(3) 后台定时刷新触发 storage 变更通知（复用现有 `chrome.storage.local` 监听机制）。

### 缓存策略

评分结果存在 React state 中（`useState<Map<string, StockScoreResult>>`），随行情数据一起刷新。不持久化到 `chrome.storage`，不引入额外缓存层。原因：
- 评分输入数据每次刷新都会变化（K 线新增一天、价格变动）
- 计算是纯 CPU 操作，60 只股票以内耗时 <50ms
- 避免 `chrome.storage` 写入配额和同步复杂度

`scoring.ts` 是纯计算模块，不涉及网络请求和存储 I/O。

## 组件设计

### ScoreBadge（持仓列表内嵌，仅股票行）

- 位置：每条股票行右侧，价格之后
- 形态：小圆环进度条（SVG ring），中间显示评级字母（S/A/B/C/D）
- 颜色：S=#FFD700(金), A=#2aa568(绿), B=#3b82f6(蓝), C=#f59e0b(橙), D=#e45555(红)
- 尺寸：24×24px 圆环
- 基金行：不显示评分（基金无技术分析数据）

### AnalyticsView（独立 Tab 页，仅股票）

两个区域：

1. **评分排行榜** — 柱状图列出所有股票的 totalScore 降序排列，柱子颜色对应评级
2. **雷达图** — 选中股票的三维度展开（技术/基本面/风险），三个轴+填充区域

不使用图表库，用纯 SVG/CSS 实现。柱状图用 div + CSS height，雷达图用 SVG polygon。

不包含行业对比（Phase 1 不做，行业分类数据需要单独的来源设计）。

## 计算细节

### 技术面子指标量化规则

以下所有规则在 `computeStockScore()` 内部实现，参考现有 `technical-analysis.ts` 的函数：

- **MACD（15%权重内独立评分）**：金叉=90，死叉=10，无信号+DIF>DEA=60，无信号+DIF<DEA=40。使用 `detectMacdSignal()` 判断交叉，`getMacdSummary()` 获取 DIF/DEA 方向。柱状图翻红/翻绿作为附加 ±5 分修正。
- **均线排列**：使用 `calcMA(closes, 5/10/20)` 获取最新值。MA5>MA10>MA20 多头排列=90，MA5<MA10<MA20 空头排列=10，部分交叉/缠绕=50
- **RSI**：使用 `calcRSI(closes, 14)` 获取最新值。30-40区间=80分（超卖后反弹预期），40-60区间=60分，60-70区间=40分，>70=20分（超买），<30=70分。注意：<30 不给最高分是因为超卖可能延续
- **量能**：当前量 / 5日均量（`calcMA(volumes, 5)` 最新值）。比值>1.5 且当日收涨=80，比值>1.5 且收跌=20（放量下跌），比值<0.5=20，其余=50
- **KDJ**：使用 `calcKDJ()` 获取最新 K/D/J。优先检查 K-D 金叉/死叉（金叉=90，死叉=10），无交叉时看 K 值区间：K<20=80，20-40=70，40-60=55，60-80=40，>80=20
- **布林带**：使用 `calcBollinger()` 获取最新上/中/下轨。计算相对位置 `pos = (close - lower) / (upper - lower)`（0=下轨，1=上轨）。pos<0.1=80（近下轨），0.1-0.4=65，0.4-0.6=60（中轨），0.6-0.9=40，>0.9=20（近上轨）。若 close>upper（突破上轨）=30

### 基本面子指标量化规则

- **PE**（绝对值区间）：PE_TTM <0（亏损）=50，0-15=90，15-25=70，25-40=50，40-80=30，>80=10。无数据=50
- **ROE**：>20%=90，15-20%=80，10-15%=60，5-10%=40，0-5%=20，负值=10。无数据=50
- **利润增速**（净利润同比增长）：>30%=90，20-30%=80，10-20%=60，0-10%=50，负值=20。无数据=50
- **股息率**：>4%=90，2-4%=70，1-2%=50，<1%=30。无数据=50

### 风险面子指标量化规则

- **年化波动率**：`volatility` 为 null → 给 50 分。有效时：<20%=90，20-30%=70，30-40%=50，40-50%=30，>50%=10
- **最大回撤（60日）**：`maxDrawdown` 为 null → 给 50 分。有效时：绝对值 <10%=90，10-20%=70，20-30%=50，30-40%=30，>40%=10

### 缺失数据的降级处理

| 场景 | 处理 |
|------|------|
| K 线 < 30 根 | 技术面权重从 50%→30%，基本面 30%→42%，风险面 20%→28%（按原比例重新分配技术面让出的 20% 权重）。MACD/均线/布林等需要足够数据点的指标内部用 null 安全处理 |
| K 线 < 5 根 | 技术面整体给 50 分。`maxDrawdown`/`volatility` 为 null，风险面给 50 分 |
| 基本面全无效（`isFundamentalDataValid()=false`） | 基本面维度给 50 分，`warnings` 中加入 "基本面数据缺失" |
| 停牌股票（price===prevClose，无日内波动） | 跳过评分计算，`totalScore=0, rating='D'`（占位），`warnings` 中加入 "停牌" |
