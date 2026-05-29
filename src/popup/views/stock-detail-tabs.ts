import type { StockPeriod } from '../stockDetail';

export type StockDetailTabValue = StockPeriod | 'fundamental' | 'analysis' | 'trades';

export type StockDetailTab = {
  label: string;
  value: StockDetailTabValue;
};

const BASE_TABS: StockDetailTab[] = [
  { label: '分时', value: 'minute' },
  { label: '五日', value: 'fiveDay' },
  { label: '日K', value: 'day' },
  { label: '周K', value: 'week' },
  { label: '月K', value: 'month' },
  { label: '年K', value: 'year' },
  { label: '120分', value: 'm120' },
  { label: '60分', value: 'm60' },
  { label: '30分', value: 'm30' },
  { label: '15分', value: 'm15' },
  { label: '5分', value: 'm5' },
  { label: '基本面', value: 'fundamental' },
  { label: '分析', value: 'analysis' },
];

export function getStockDetailTabs(tradeCount: number): StockDetailTab[] {
  void tradeCount;
  return [
    ...BASE_TABS,
    { label: '交易', value: 'trades' },
  ];
}
