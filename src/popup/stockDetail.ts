import { fetchInstrumentDetail } from '../shared/chart-provider.ts';

export { calcMA, calcMACD } from '../shared/technical-analysis';

export type StockDetailKlinePoint = {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
};

export type StockPeriod =
  | 'minute'
  | 'fiveDay'
  | 'day'
  | 'week'
  | 'month'
  | 'year'
  | 'm120'
  | 'm60'
  | 'm30'
  | 'm15'
  | 'm5';

export type StockDetailData = {
  code: string;
  name: string;
  price: number;
  change: number;
  changePct: number;
  open: number;
  prevClose: number;
  high: number;
  low: number;
  volumeHands: number;
  amountWanYuan: number;
  turnoverRate: number;
  peTtm: number;
  totalMarketCapYi: number;
  updatedAt: string;
  period: StockPeriod;
  kline: StockDetailKlinePoint[];
};

/**
 * 判断当前时间是否在 A 股交易时段内（09:00 - 15:00）。
 * 非交易时段不自动刷新行情数据，但手动刷新不受限制。
 */
export function isTradingHours(): boolean {
  const now = new Date();
  const hours = now.getHours();
  return hours >= 9 && hours < 15;
}

export async function fetchTencentStockDetail(
  code: string,
  fallbackName = '',
  period: StockPeriod = 'day',
): Promise<StockDetailData> {
  return fetchInstrumentDetail({
    instrumentType: 'stock',
    code,
    fallbackName,
    period,
  });
}

export async function fetchIndexKlineDetail(
  tencentCode: string,
  fallbackLabel = '',
  period: StockPeriod = 'day',
): Promise<StockDetailData> {
  return fetchInstrumentDetail({
    instrumentType: 'index',
    code: tencentCode,
    fallbackName: fallbackLabel,
    period,
  });
}
