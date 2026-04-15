// Tushare API 配置
export const TUSHARE_BASE_URL = 'https://api.tushare.pro';
export const TUSHARE_REG_URL = 'https://tushare.pro/weborder/#/login?reg=368222';

// 存储键名
export const STORAGE_KEYS = {
  META: '_meta',
  TUSHARE: 'tushare',
  HOLDINGS: 'holdings',
  SETTINGS: 'settings',
  STOCK_NAMES: 'stockNames',
} as const;

// 默认设置
export const DEFAULT_SETTINGS = {
  refreshInterval: 10,
  colorMode: 'red-up' as const,
  decimals: 2,
};

// 限制
export const MAX_HOLDINGS = 100;
export const MIN_REFRESH_INTERVAL = 5;
export const MAX_REFRESH_INTERVAL = 300;

// 市场后缀映射
export const MARKET_SUFFIXES: Record<string, string[]> = {
  SH: ['6'],      // 上海
  SZ: ['0', '3'], // 深圳
  BJ: ['4', '8'], // 北京
};

// 股票标签映射
export const MARKET_TAGS: Record<string, string> = {
  '0': '深',
  '3': '创',
  '6': '沪',
  '4': '北',
  '8': '北',
};
