// Shared types used across popup components
import type {
  StockPosition,
  FundPosition,
  StockHoldingConfig,
  FundHoldingConfig,
  MarketStats,
} from '../shared/fetch';

export type PageTab = 'stocks' | 'funds' | 'notifications' | 'trades' | 'account';
export type ThemeMode = 'dark' | 'light';

export type IndexDetailTarget = {
  code: string;
  label: string;
};

export type SearchStock = {
  code: string;
  name: string;
};

export type FundSearchEntry = SearchStock & {
  jp: string;
  category: string;
  fullNamePinyin: string;
  haystack: string;
};

export type RowContextMenuState =
  | { kind: 'stock'; code: string; x: number; y: number }
  | { kind: 'fund'; code: string; x: number; y: number };

/** 股票列排序 key */
export type StockSortKey = 'name' | 'floatingPnl' | 'holdingRate' | 'dailyPnl' | 'dailyChangePct' | 'cost' | 'price' | 'shares' | 'positionRatio';
/** 基金列排序 key */
export type FundSortKey = 'name' | 'holdingProfit' | 'holdingProfitRate' | 'estimatedProfit' | 'holdingAmount' | 'estimatedNav' | 'changePct';
/** 排序方向 */
export type SortDir = 'asc' | 'desc';

export type ColumnSort<T extends string> = {
  key: T;
  dir: SortDir;
} | { key: null; dir: null };

export type StockDetailTarget = {
  code: string;
  name: string;
};

export type FundDetailTarget = {
  code: string;
  name: string;
};

export type TradeHistoryTarget = {
  code: string;
  name: string;
};

export type StockRow = StockPosition & {
  pinned: boolean;
  special: boolean;
  tags: string[];
  addedPrice?: number;
  addedAt?: string;
};

export type FundRow = FundPosition & {
  pinned: boolean;
  special: boolean;
  tags: string[];
  addedNav?: number;
  addedAt?: string;
};

export type NotificationRecord = {
  id: string;
  code: string;
  name: string;
  message: string;
  ruleType: string;
  price: number;
  changePct: number;
  firedAt: number;
  read: boolean;
};

export type PortfolioConfig = {
  stockHoldings: StockHoldingConfig[];
  fundHoldings: FundHoldingConfig[];
};

export type IntradayDataPoint = {
  time: string;
  price: number;
  minuteIndex: number;
};

export type { MarketStats };
