// 股票持仓
export interface Holding {
  code: string;           // 股票代码（6位数字）
  name: string;           // 股票名称
  costPrice: number;      // 成本价
  shares: number;         // 持仓股数
  pinned: boolean;        // 是否置顶
  watched: boolean;       // 是否特别关注
  sortOrder: number;      // 排序序号
  addedAt: number;        // 添加时间戳
  lastModified: number;   // 最后修改时间戳（用于冲突解决）
}

// 股票行情
export interface StockQuote {
  code: string;           // 带后缀的代码
  name: string;           // 股票名称
  open: number;           // 开盘价
  high: number;           // 最高价
  low: number;            // 最低价
  close: number;          // 收盘价/现价
  preClose: number;       // 昨收价
  change: number;         // 涨跌额
  pctChange: number;      // 涨跌幅（%）
  volume: number;         // 成交量
  amount: number;         // 成交额
}

// 股票基础信息
export interface StockBasic {
  code: string;           // 带后缀的代码
  name: string;           // 股票名称
  area?: string;          // 地区
  industry?: string;      // 行业
  market?: string;        // 市场类型
}

// 应用设置
export interface Settings {
  refreshInterval: number;    // 刷新间隔（秒）
  colorMode: 'red-up' | 'green-up';  // 涨跌颜色模式
  decimals: number;           // 小数位数
  lastModified: number;       // 最后修改时间
}

// Tushare 配置
export interface TushareConfig {
  token: string;
  lastModified: number;
}

// 存储元数据
export interface StorageMeta {
  lastSyncAt: number;     // 最后同步时间
  version: number;        // 数据版本
}

// 排序字段
export type SortField = 'default' | 'profit' | 'daily' | 'position';

// 排序方向
export type SortOrder = 'asc' | 'desc';

// 计算后的持仓数据（含实时行情）
export interface HoldingWithQuote extends Holding {
  quote?: StockQuote;         // 实时行情
  currentPrice: number;       // 当前价格
  marketValue: number;        // 市值
  profit: number;             // 浮动盈亏
  profitPct: number;          // 盈亏百分比
  dailyProfit: number;        // 当日盈亏
  dailyProfitPct: number;     // 当日盈亏百分比
  positionRatio: number;      // 仓位比
}

// 概览数据
export interface OverviewData {
  totalMarketValue: number;   // 总市值
  totalProfit: number;        // 总浮动盈亏
  dailyProfit: number;        // 总当日盈亏
  dailyProfitPct: number;     // 总当日盈亏百分比
}

// API 响应错误
export interface APIError {
  code: number;
  msg: string;
}

// Tushare API 请求参数
export interface TushareRequest {
  api_name: string;
  token: string;
  params?: Record<string, unknown>;
  fields?: string;
}

// Tushare API 响应
export interface TushareResponse<T = unknown> {
  code: number;
  msg: string;
  data: {
    fields: string[];
    items: T[][];
  };
}
