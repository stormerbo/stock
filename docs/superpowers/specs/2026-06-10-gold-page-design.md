# 金价页功能设计文档

## 概述

在现有 Chrome 扩展「赚钱助手」中新增一个独立的 `金价` 页面，用于查看国内与国际黄金实时行情。

首发范围只覆盖 4 个报价：

1. 国内现货金
2. 上海金
3. 国际现货金
4. COMEX 黄金

该功能沿用项目现有的数据流模式：

1. `background` 定时拉取金价
2. 写入 `chrome.storage.local`
3. `popup` 监听缓存并实时展示
4. `options` 提供统一的刷新频率设置

## 设计目标

### 主目标

- 让用户在扩展内快速查看黄金实时行情
- 保持与股票、基金、指数一致的数据刷新体验
- 将国内和国际金价分组展示，降低扫读成本
- 把金价刷新配置纳入现有设置体系

### 次目标

- 为未来增加金价详情、提醒、走势图预留结构
- 在接口失败时保留最近一次缓存，不让页面空白
- 尽量复用现有 popup、background、options 的模式

### 不做的事

- 不做走势图
- 不做金价提醒
- 不做用户自定义品种
- 不做复杂换算和多币种折算
- 不做角标显示金价

## 信息架构

### 导航

在侧边栏新增一个一级入口：

- `金价`

建议位置：

- 放在 `基金` 与 `交易` 之间，保持“行情类页面在前、记录和管理页面在后”的顺序

### 页面结构

`金价` 页为独立页面，不复用股票或基金表格。

页面分成两组卡片：

1. 国内金价
2. 国际金价

每组展示 2 张卡片，总计 4 张。

### 卡片字段

每张卡片展示：

- 名称
- 最新价
- 涨跌额
- 涨跌幅
- 计价单位
- 更新时间

不展示买卖盘口、不展示图表、不展示历史区间。

## 数据模型

在 `src/shared/fetch.ts` 中新增类型：

```ts
export type GoldQuote = {
  code: string;
  label: string;
  market: 'domestic' | 'international';
  price: number;
  change: number;
  changePct: number;
  unit: string;
  updatedAt: string;
};
```

### 字段说明

| 字段 | 含义 |
|---|---|
| `code` | 金价品种唯一标识 |
| `label` | 展示名称 |
| `market` | 国内 / 国际分组 |
| `price` | 最新价 |
| `change` | 相对上一参考价的涨跌额 |
| `changePct` | 涨跌幅 |
| `unit` | 计价单位，例如 `元/克`、`美元/盎司` |
| `updatedAt` | 本次数据更新时间 |

### 建议 code

| 品种 | code |
|---|---|
| 国内现货金 | `cn_spot_gold` |
| 上海金 | `sh_gold` |
| 国际现货金 | `intl_spot_gold` |
| COMEX 黄金 | `comex_gold` |

## 存储设计

### Local Storage

新增缓存 key：

- `goldQuotes`
- `goldUpdatedAt`

其中：

- `goldQuotes` 存储 `GoldQuote[]`
- `goldUpdatedAt` 存储最近一次成功刷新时间

### Sync Storage

沿用现有 `refreshConfig`，新增字段：

```ts
type RefreshConfig = {
  stockRefreshSeconds: number;
  fundRefreshSeconds: number;
  indexRefreshSeconds: number;
  goldRefreshSeconds: number;
};
```

默认值建议：

```ts
goldRefreshSeconds: 60
```

## 数据获取设计

### 共享拉取函数

在 `src/shared/fetch.ts` 中新增：

- `fetchGoldQuotes(): Promise<GoldQuote[]>`

该函数负责统一拉取 4 个品种，完成以下工作：

1. 请求第三方行情接口
2. 解析原始返回
3. 将字段整理为统一 `GoldQuote`
4. 对无效数字使用 `Number.NaN`
5. 对单个品种失败做容错，避免整个页面直接不可用

### 接口策略

首版只要求“功能结构和接入点正确”，接口实现上遵循以下原则：

- 优先选择可稳定获取实时或准实时行情的数据源
- 国内与国际可来自不同接口，但在 `fetchGoldQuotes()` 中统一归一
- 如果某个品种暂时无法获取涨跌幅，可允许该字段为 `Number.NaN`
- 如果第三方接口限制较强，应优先保证默认 60 秒刷新可用

接口最终选择应在实现阶段确认，但不影响当前页面和数据流设计。

## 后台刷新设计

### Alarm

在 `src/background/index.ts` 中新增独立 alarm：

- `refresh-gold`

并新增一套金价刷新函数，例如：

- `refreshGolds()`

### 刷新职责

`refreshGolds()` 负责：

1. 读取当前刷新配置
2. 调用 `fetchGoldQuotes()`
3. 将结果写入 `chrome.storage.local`
4. 更新 `goldUpdatedAt`
5. 在失败时保留旧缓存

### 刷新频率

金价刷新频率不走自由输入，走固定选项配置：

- `30 秒`
- `60 秒`
- `5 分钟`

默认值：

- `60 秒`

### 时间策略

金价刷新不受 A 股交易时段限制。

原因：

- 国际黄金在夜间同样有较强查看需求
- 如果绑定 A 股时段，会让金价页在最有价值的时段不可用
- 该模块更接近全天候行情，而不是仅限沪深交易时段

### 容错策略

若本次请求失败：

- 不清空已有 `goldQuotes`
- 保留上次成功缓存
- 可记录错误日志
- 页面继续展示最近一次成功结果

这样用户至少能看到最近一次行情，而不是整页空白。

## Popup 设计

### 类型扩展

在 `src/popup/types.ts` 中：

- 给 `PageTab` 增加 `gold`

```ts
export type PageTab =
  | 'stocks'
  | 'funds'
  | 'gold'
  | 'notifications'
  | 'trades'
  | 'account'
  | 'risk';
```

### 侧边栏

在 `src/popup/components/SideNav.tsx` 中新增“金价”入口。

要求：

- 风格与现有导航项一致
- 点击后切换到 `gold` 页
- 切换时清理详情弹层状态，避免与股票/基金详情残留状态冲突

### 页面组件

建议新增独立页面组件：

- `src/popup/views/GoldPage.tsx`

职责：

1. 接收 `GoldQuote[]`
2. 按 `market` 分组
3. 渲染国内 / 国际两个板块
4. 渲染 4 张行情卡片
5. 为空态和错误态提供基础提示

### 页面布局

推荐结构：

```text
金价
├── 国内金价
│   ├── 国内现货金
│   └── 上海金
└── 国际金价
    ├── 国际现货金
    └── COMEX 黄金
```

每张卡片建议展示：

```text
名称
最新价
涨跌额 + 涨跌幅
单位
更新时间
```

### 视觉和交互原则

- 以卡片为主，不用表格
- 涨跌颜色继续沿用 A 股语义：涨红跌绿
- 单位和更新时间做次级信息
- 页面支持三种主题模式
- 首版不提供排序和筛选

## 设置页设计

在 `src/options/App.tsx` 的刷新设置区域新增：

- `金价刷新频率`

表现形式建议与现有设置保持一致，使用固定选项控件，不允许自由输入。

### 固定选项

| 选项值 | 含义 |
|---|---|
| `30` | 30 秒 |
| `60` | 60 秒 |
| `300` | 5 分钟 |

### 设计原则

- 金价刷新频率并入统一 `refreshConfig`
- 不为金价单独增加新的设置存储 key
- 不允许输入任意秒数，降低误配置和接口压力风险

## 数据流

```text
options 修改 goldRefreshSeconds
  ↓
background 读取 refreshConfig 并重建 refresh-gold alarm
  ↓
refreshGolds() 定时拉取 fetchGoldQuotes()
  ↓
写入 chrome.storage.local.goldQuotes
  ↓
popup 监听 storage 变化
  ↓
GoldPage 实时更新卡片
```

## 边界情况

### 1. 部分品种拉取失败

- 页面仍展示成功的品种
- 失败品种显示占位信息
- 不因单个品种失败拖垮整页

### 2. 全部拉取失败

- 若已有缓存，继续展示旧缓存
- 若无缓存，显示“金价数据暂不可用”

### 3. 涨跌字段缺失

- `change` 或 `changePct` 不可解析时显示 `--`
- 不应影响价格本身的展示

### 4. 夜间或周末

- 若接口可返回最新国际金价，则正常展示
- 若接口在休市仅返回最后成交价，页面照常显示最近值

## 测试与验证范围

### 功能验证

- 左侧导航可进入 `金价` 页
- 4 个金价品种正常显示
- 国内 / 国际分组正确
- 刷新频率设置可保存并生效
- background 定时刷新会更新 `goldQuotes`

### 容错验证

- 接口失败时旧缓存不丢失
- 单个品种解析失败不影响其他品种显示
- popup 首次打开时可读到最近缓存

### UI 验证

- 深色 / 浅色 / 白色主题下可读性正常
- 卡片在 popup 尺寸下不拥挤
- 单位和更新时间层级清晰

## 后续扩展点

本设计为首发最小可用版本，后续可以在此基础上继续增加：

- 金价详情页
- 日内走势图 / K 线
- 金价提醒
- 白银 / 铂金等更多贵金属
- 人民币汇率联动展示
- 品牌金店零售价

当前版本刻意不引入这些扩展，以保持交付简单、稳定、容易验证。
