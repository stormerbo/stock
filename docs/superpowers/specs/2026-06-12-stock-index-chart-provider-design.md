# 股票与指数统一图表 Provider 设计

## 背景

当前项目里的股票/指数图表数据链路已经出现明显分叉：

- 股票列表小分时使用 `src/shared/fetch.ts` 里的 `fetchStockIntraday()`
- 股票详情页使用 `src/popup/stockDetail.ts` + `src/shared/stock-chart-failover.ts`
- 指数详情页曾经在 `src/popup/views/IndexDetailModal.tsx` 内直接请求腾讯分钟接口
- 指数日/周/月 K 线此前也在 `src/popup/stockDetail.ts` 内走单独链路
- 后台刷新、风控计算、popup 首屏兜底刷新各自持有部分图表抓取逻辑

最近因为腾讯图表接口被 WAF/501 限制，已经陆续做了多处补丁，把若干入口切到了东方财富接口。但修复是分散落地的，导致：

- 图表抓取入口过多，难以确认某个页面是否还残留旧接口
- 股票与指数虽然展示结构接近，但没有共享统一数据层
- 页面组件仍可能直接决定“该打哪个接口”，职责过重
- 后续如果继续新增周期、增加 failover、替换数据源，维护成本会继续上升

本次要做的是把 `股票 + 指数` 图表数据统一收口到一层共享 provider。黄金图表不在本次范围内。

## 目标

- 为股票和指数提供统一的图表数据获取入口
- 统一分时、五日分时、K 线的标准输出结构
- 页面层不再直接关心东方财富/腾讯等底层接口差异
- 股票保留现有 failover 能力；指数默认直接走东方财富稳定链路
- 列表小分时、详情页、后台刷新尽量复用同一 provider，避免再次分叉

## 非目标

- 不改黄金图表链路
- 不重做现有 `IntradayChart` / `KlineChart` 组件视觉表现
- 不在本次统一中扩展新的图表品种或新增新的技术指标
- 不强制把所有 quote 基础行情也统一成同一 provider；本次重点是图表数据与详情图表组装链路

## 设计原则

### 1. 页面层不碰底层接口

popup 页面、列表组件、弹窗组件不再直接拼接东方财富/腾讯 URL，也不直接解析原始 JSON 结构。

### 2. 统一“图表数据”和“详情数据”两个层次

图表 provider 负责：

- 识别标的类型（股票/指数）
- 选择底层数据源
- 处理 failover / fallback
- 输出统一 kline/intraday 数据结构

详情 adapter 负责：

- 获取 quote 元数据
- 把 quote + 图表数据组装成 `StockDetailData`

这样既能复用图表数据，也不会把“详情页专属字段”强塞进底层 provider。

### 3. 底层 source 保持单一职责

现有 `stock-chart-sources.ts` 继续只负责：

- 东财分时/K 线抓取与解析
- 腾讯分时/K 线抓取与解析
- quote 元数据抓取

它不直接服务页面，不承担页面级决策。

### 4. 股票与指数在统一入口分流，不在页面分流

统一入口根据 `instrumentType` 决定：

- `stock`：优先走东财，必要时按现有策略决定是否允许腾讯 fallback
- `index`：默认走东财，不再分散保留腾讯分钟/K 线请求

## 目标结构

新增：

- `src/shared/chart-provider.ts`

保留并复用：

- `src/shared/stock-chart-sources.ts`
- `src/shared/stock-chart-failover.ts`

收缩职责：

- `src/popup/stockDetail.ts`
- `src/popup/views/IndexDetailModal.tsx`
- `src/shared/fetch.ts` 中的股票分时包装函数

## 核心接口设计

### ChartInstrumentType

```ts
type ChartInstrumentType = 'stock' | 'index';
```

### ChartIntradayPeriod

```ts
type ChartIntradayPeriod = 'minute' | 'fiveDay';
```

### ChartKlinePeriod

```ts
type ChartKlinePeriod =
  | 'day'
  | 'week'
  | 'month'
  | 'year'
  | 'm120'
  | 'm60'
  | 'm30'
  | 'm15'
  | 'm5';
```

### Provider 标准输出

统一继续使用项目里已经成熟的 K 线点结构：

```ts
type ChartPoint = {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
};
```

统一 provider 暴露的接口：

```ts
type FetchInstrumentIntradayInput = {
  instrumentType: ChartInstrumentType;
  code: string;
  period: ChartIntradayPeriod;
};

type FetchInstrumentKlineInput = {
  instrumentType: ChartInstrumentType;
  code: string;
  period: ChartKlinePeriod;
  count?: number;
};

type FetchInstrumentDetailInput = {
  instrumentType: ChartInstrumentType;
  code: string;
  fallbackName?: string;
  period: ChartIntradayPeriod | ChartKlinePeriod;
};
```

导出函数：

```ts
fetchInstrumentIntraday(input): Promise<{ data: ChartPoint[]; source: string }>
fetchInstrumentKline(input): Promise<{ data: ChartPoint[]; source: string }>
fetchInstrumentDetail(input): Promise<StockDetailData>
```

说明：

- `fetchInstrumentIntraday()` / `fetchInstrumentKline()` 是纯图表数据接口
- `fetchInstrumentDetail()` 是 popup 详情页/弹窗使用的统一详情接口
- `source` 用于调试与后续日志观察，但页面默认不展示

## 标的识别与数据源策略

### 股票

- 使用现有 `toTencentStockCode()` / `normalizeStockCode()` 规范化代码
- 分时：
  - `minute` / `fiveDay` 先走东财
  - 按现有 failover 策略决定是否允许腾讯 fallback
- K 线：
  - `day/week/month/year/m120/m60/m30/m15/m5` 统一走现有 `fetchStockKlineWithFallback()`

### 指数

- 使用现有腾讯风格指数代码，如 `sh000001` / `sz399300`
- 分时：
  - `minute` / `fiveDay` 统一走东财 `trends2`
- K 线：
  - `day/week/month` 统一走东财 `kline/get`
- 本次不额外支持指数分钟级多周期 K 线（如 `m5/m15`），与现有产品行为保持一致

### Quote 元数据

- 股票详情、指数详情继续通过现有 `fetchTencentQuoteMeta()` 拿标准行情元数据
- 图表 provider 只统一图表链路，不在本次重做 quote provider

## 迁移方案

### 第一步：建立 provider

新增 `src/shared/chart-provider.ts`，封装：

- `fetchStockIntradayWithFallback()` 的股票分时调用
- `fetchStockKlineWithFallback()` 的股票 K 线调用
- `fetchEastmoneyIntraday()` 的指数分时调用
- 指数东财 K 线调用
- `fetchTencentQuoteMeta()` 的详情元数据拼装

### 第二步：替换 popup 详情入口

把：

- `fetchTencentStockDetail()`
- `fetchIndexKlineDetail()`

改造成对统一 provider 的轻量包装，或者直接迁移调用方到 provider。

目标是让 `stockDetail.ts` 从“多接口聚合器”收缩为“兼容层/过渡层”，后续可以继续变薄。

### 第三步：替换指数详情页专属逻辑

`IndexDetailModal.tsx` 不再自己决定从哪个接口拉分钟数据，只调用统一 detail/provider 接口。

### 第四步：替换列表和后台的股票小分时

把 `fetch.ts` 中的 `fetchStockIntraday()` 改成 provider 的轻包装，或者直接在后台/列表使用 provider。

目标是：

- popup 首屏缺数据补拉
- popup 交易时段轮询补拉
- background 定时刷新

三处共享同一图表入口。

### 第五步：清理残留直连接口

在完成迁移后，扫描并移除页面层残留的：

- `minute/query`
- `day/query`
- `fqkline/get`
- `mkline`

直连代码，避免未来再出现“某个角落没切过去”的情况。

## 兼容性与风险

### 风险 1：统一后影响已有详情页展示

控制方式：

- provider 输出仍沿用当前 `StockDetailData` / `StockDetailKlinePoint` 结构
- 先不改 `KlineChart` / `IntradayChart` 的输入契约

### 风险 2：指数与股票在东财数据含义上存在差异

控制方式：

- 统一的数据结构只保留页面真正需要的公共字段
- 指数分钟图的成交量继续按累计量差分得到单分钟量
- 指数 K 线默认使用不复权 `fqt=0`

### 风险 3：provider 过于臃肿

控制方式：

- `chart-provider.ts` 只做分流与组装
- 原始 source 解析仍放在 `stock-chart-sources.ts`
- failover 策略仍放在 `stock-chart-failover.ts`

## 测试策略

新增/补充以下测试：

### 1. provider 层单测

- 股票 minute 走股票 failover provider
- 股票 day K 走股票 failover provider
- 指数 minute 走东财 intraday provider
- 指数 month K 正确映射 `klt=103`

### 2. 适配层测试

- 指数分钟点从统一 `ChartPoint[]` 正确转为详情页分钟点
- 列表小分时包装函数能从 provider 输出得到 `{ time, price }` 数据

### 3. 构建验证

- `npm run build`

### 4. 人工验证

- 股票列表小分时
- 股票详情分时 / 五日 / 日周月年 / 分钟 K
- 顶部指数详情分时 / 日周月 K

## 实施结果预期

完成后，代码结构会变成：

- 页面层只关心“我要股票/指数的某种图表”
- provider 层决定“从哪个 source 拉、是否 failover、如何标准化”
- source 层只处理“这个接口怎么请求、怎么解析”

这样后面不管是继续加更多指数、修复某个单一接口、还是切换数据源，都会集中在一层完成，不需要再在 popup、background、详情页之间到处补洞。
