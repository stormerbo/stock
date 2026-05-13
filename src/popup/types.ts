// Shared types used across popup components
import type {
  StockPosition,
  FundPosition,
  StockHoldingConfig,
  FundHoldingConfig,
  MarketStats,
} from '../shared/fetch';

export type PageTab = 'stocks' | 'funds' | 'account' | 'notifications' | 'analytics' | 'trades';
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

export type SortingMode = 'stocks' | 'funds' | null;

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
