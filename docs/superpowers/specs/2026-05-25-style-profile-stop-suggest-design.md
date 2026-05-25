# 投资风格画像 + 智能止盈止损建议 — 设计文档

## 概述

在现有 Chrome 扩展「赚钱助手」中新增两个功能模块：
1. **投资风格画像**：基于持仓数据、交易记录、历史波动率，持续追踪用户投资风格
2. **智能止盈止损建议**：基于 ATR + 趋势强度，为每只持仓股票动态计算建议止盈/止损价位

## 架构

```
src/shared/
├── investment-style.ts    ← 新增：画像计算逻辑
├── stop-suggest.ts        ← 新增：止盈止损计算逻辑

src/background/index.ts    ← 改动：refreshStocks() 尾部触发计算

src/popup/
├── views/
│   ├── StyleProfile.tsx       ← 新增：投资画像面板
│   └── StopSuggestPanel.tsx   ← 新增：全局止盈止损一览
├── components/
│   └── RadarChart.tsx         ← 新增：雷达图组件（纯 SVG）
└── App.tsx                    ← 改动：侧边栏添加入口
```

## 模块设计

### 1. 投资风格画像 (`investment-style.ts`)

#### 六维指标

| 维度 | 含义 | 数据来源 | 评分逻辑（0-100） |
|---|---|---|---|
| **集中度** | 持仓是否分散 | stockHoldings config | 前 3 大仓位占比加权，越集中分越高 |
| **换手率** | 交易频繁程度 | stockTradeHistory | 月均交易笔数，>4 笔/月 = 高分 |
| **持仓周期** | 平均持有天数 | 交易记录买卖配对 | <7 天 = 低分，>90 天 = 高分 |
| **胜率** | 盈利交易占比 | 卖出记录盈亏 | 直接百分比，>60% = 高分 |
| **盈亏比** | 单笔盈利/亏损比 | 卖出记录 | >2:1 = 高分，<1:1 = 低分 |
| **风险偏好** | 持仓波动率水平 | K 线 → 日波动率 | 平均年化波动率越高分越高 |

#### 人格标签映射

```
激进型        → 集中度>70 + 换手率>60 + 风险偏好>70
价值投资型    → 持仓周期>70 + 换手率<40
趋势跟随型    → 换手率40-70 + 胜率40-60
均衡型        → 所有维度在30-70之间（默认）
稳健型        → 集中度<40 + 风险偏好<40
```

取最匹配的一个标签，附 2-3 句规则生成的自然语言评语。

#### 存储结构

```typescript
type StyleProfile = {
  dimensions: {
    concentration: number;
    turnover: number;
    holdPeriod: number;
    winRate: number;
    profitLossRatio: number;
    riskAppetite: number;
  };
  label: string;
  description: string;
  dataPoints: {
    stockCount: number;
    top3Weight: number;
    monthlyTrades: number;
    avgHoldDays: number;
    winRate: number;
    avgProfit: number;
    avgLoss: number;
    avgAnnualVolatility: number;
  };
  calculatedAt: number;
};
```

Storage key: `investmentStyleProfile` → `chrome.storage.local`

#### 计算触发

`refreshStocks()` 完成后异步调用。24h 缓存判断（key: `_lastStyleCalcTime`），检测持仓配置或交易记录变化时强制重算。

### 2. 智能止盈止损 (`stop-suggest.ts`)

#### 计算方法

基于 **ATR（平均真实波幅，14 日）** + **趋势强度调整**：

```
止损价 = current_price - (ATR × baseMultiplier × trendFactor)
止盈价 = current_price + (ATR × baseMultiplier × (2 - trendFactor))
```

| 参数 | 含义 | 取值 |
|---|---|---|
| ATR | 14 日平均真实波幅 | 从日 K 线计算 |
| baseMultiplier | 基础倍数 | 2.0 |
| trendFactor | 趋势因子 | 0.5~1.5，由 MA20 斜率决定 |

趋势方向判定：
- MA20 斜率 > 阈值 → 上升趋势，trendFactor > 1
- MA20 斜率 < -阈值 → 下降趋势，trendFactor < 1
- 其他 → 震荡，trendFactor ≈ 1

#### 存储结构

```typescript
type StopSuggest = {
  code: string;
  name: string;
  currentPrice: number;
  stopLoss: number;
  takeProfit: number;
  atr: number;
  atrPct: number;
  trendDirection: 'up' | 'down' | 'sideways';
  trendStrength: number;
  calculatedAt: number;
};
```

Storage key: `stopSuggestions` → `chrome.storage.local`

#### 计算触发

与画像相同，`refreshStocks()` 尾部触发。复用现有 K 线缓存，无额外网络请求。

### 3. UI 组件

#### 雷达图 (`RadarChart.tsx`)

- 纯 SVG 实现，无外部依赖
- 六边形网格 + 数据多边形填充
- 支持深色/浅色主题（读取现有 displayConfig）
- Props: `{ dimensions: Record<string, number>; labels: Record<string, string> }`

#### 投资画像面板 (`StyleProfile.tsx`)

```
┌─────────────────────────────────┐
│  🎯 投资风格：均衡型             │
│  你的持仓分散度适中...           │
│                                 │
│  ┌─── 六维雷达图 ──────────┐    │
│  │   (RadarChart)         │    │
│  └────────────────────────┘    │
│                                 │
│  集中度    ████████░░  65%      │
│  换手率    ████░░░░░░  30%      │
│  持仓周期  ██████████  85%      │
│  胜率      ██████░░░░  52%      │
│  盈亏比    ███████░░░  60%      │
│  风险偏好  ████░░░░░░  28%      │
└─────────────────────────────────┘
```

#### 止盈止损全局面板 (`StopSuggestPanel.tsx`)

```
┌───────────────────────────────────────────┐
│  ⚠️ 风控建议                              │
│  基于 ATR(14) + 趋势强度自动计算           │
│                                           │
│  股票      现价      止损      止盈   趋势  │
│  ──────────────────────────────────────── │
│  宁德时代  205.30   194.80   221.50  ↑强势 │
│  招商银行  38.20    36.50    40.80   →震荡 │
│  贵州茅台  1680.00  1610.00  1780.00 ↓走弱 │
└───────────────────────────────────────────┘
```

#### 个股详情嵌入

在 `StockDetailView.tsx` 中添加 `StopSuggestBlock` 组件：

```
┌─────────────────┐
│ 💡 智能建议      │
│ ATR: 5.20 (2.5%) │
│ 止损: ¥194.80    │
│ 止盈: ¥221.50    │
│ 趋势: ↑ 强势     │
└─────────────────┘
```

### 4. 侧边栏入口

`src/popup/App.tsx` 的 `SideNav` 中添加两个新入口：
- 📊 投资画像 → 打开 `StyleProfile` 面板
- ⚠️ 风控建议 → 打开 `StopSuggestPanel` 面板

### 5. 与现有告警系统的关系

止盈止损建议是**参考数据**，不是自动告警规则。用户可手动根据建议价创建 `price_up`/`price_down` 告警，或在建议旁提供「一键创建告警」按钮（可选后续实现）。

## 数据流

```
refreshStocks() 完成
  → async calcAndCacheStyleProfile()     // 24h 缓存，有变化重算
  → async calcAndCacheStopSuggestions()  // 复用 K 线缓存
  → 写入 chrome.storage.local

popup 打开
  → 读 chrome.storage.local (investmentStyleProfile / stopSuggestions)
  → 即时渲染
```

## 边界情况

- **无交易记录**：画像中胜率/盈亏比/持仓周期标记为「数据不足」，标签基于集中度和风险偏好给出
- **空持仓**：画像面板显示「暂无持仓数据」
- **K 线数据不足**（上市 < 14 天）：该股止盈止损标记为「数据不足」
- **非交易时段**：止盈止损建议基于最近一次缓存数据显示，不阻塞 UI

## 文件清单

| 文件 | 操作 | 说明 |
|---|---|---|
| `src/shared/investment-style.ts` | 新增 | 画像计算函数 + 类型 |
| `src/shared/stop-suggest.ts` | 新增 | 止盈止损计算 + ATR 函数 |
| `src/background/index.ts` | 改动 | refreshStocks 尾部触发计算 |
| `src/popup/components/RadarChart.tsx` | 新增 | SVG 雷达图 |
| `src/popup/views/StyleProfile.tsx` | 新增 | 画像面板 |
| `src/popup/views/StopSuggestPanel.tsx` | 新增 | 止盈止损面板 |
| `src/popup/components/StopSuggestBlock.tsx` | 新增 | 个股详情嵌入块 |
| `src/popup/App.tsx` | 改动 | 侧边栏入口 |
| `src/popup/components/SideNav.tsx` | 改动 | 新导航项 |
| `src/popup/views/StockDetailView.tsx` | 改动 | 嵌入建议块 |
