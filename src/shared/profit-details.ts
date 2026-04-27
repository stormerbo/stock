import type { FundHoldingConfig, FundPosition, StockHoldingConfig, StockPosition } from './fetch';
import { computePositionFromTrades, type StockTradeRecord } from './trade-history';

export const DAILY_PROFIT_DETAILS_KEY = 'dailyProfitDetails';
export const DAILY_PROFIT_PENDING_SNAPSHOT_KEY = 'dailyProfitPendingSnapshot';
export const DAILY_PROFIT_HISTORY_KEEP_DAYS = 240;

export type DailyStockProfitItem = {
  code: string;
  name: string;
  shares: number;
  cost: number;
  price: number;
  dailyPnl: number;
  dailyChangePct: number;
  floatingPnl: number;
  positionValue: number;
};

export type DailyFundProfitItem = {
  code: string;
  name: string;
  units: number;
  cost: number;
  latestNav: number;
  estimatedNav: number;
  navDisclosedToday: boolean;
  holdingAmount: number;
  holdingProfit: number;
  estimatedProfit: number;
  changePct: number;
};

export type DailyProfitDetailRecord = {
  date: string;
  updatedAt: string;
  stockCount: number;
  fundCount: number;
  stockDailyPnl: number;
  fundDailyProfit: number;
  totalDailyProfit: number;
  stockHoldingProfit: number;
  fundHoldingProfit: number;
  totalHoldingProfit: number;
  stockMarketValue: number;
  fundHoldingAmount: number;
  totalAssets: number;
  stocks: DailyStockProfitItem[];
  funds: DailyFundProfitItem[];
};

function round2(value: number): number {
  if (!Number.isFinite(value)) return Number.NaN;
  return Math.round(value * 100) / 100;
}

function sumFinite(values: number[]): number {
  return values.reduce((sum, value) => (Number.isFinite(value) ? sum + value : sum), 0);
}

function toSafeNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : Number.NaN;
}

export function buildDailyProfitDetailRecord(
  date: string,
  stockPositions: StockPosition[],
  fundPositions: FundPosition[],
  stockHoldings: StockHoldingConfig[],
  fundHoldings: FundHoldingConfig[],
  updatedAt = new Date().toISOString(),
  stockTradeHistory?: Record<string, StockTradeRecord[]>,
): DailyProfitDetailRecord {
  const stockMap = new Map(stockPositions.map((item) => [item.code, item]));
  const fundMap = new Map(fundPositions.map((item) => [item.code, item]));

  const stocks: DailyStockProfitItem[] = stockHoldings
    .filter((holding) => Number(holding.shares) > 0)
    .map((holding) => {
      const row = stockMap.get(holding.code);

      // If trade history exists, derive shares/cost from trades
      let shares: number;
      let cost: number;
      const trades = stockTradeHistory?.[holding.code];
      if (trades && trades.length > 0) {
        const computed = computePositionFromTrades(trades);
        shares = computed.shares;
        cost = computed.avgCost;
      } else {
        shares = Math.max(0, Number(holding.shares) || 0);
        cost = Math.max(0, Number(holding.cost) || 0);
      }

      const price = toSafeNumber(row?.price);
      const dailyPnl = toSafeNumber(row?.dailyPnl);
      const dailyChangePct = toSafeNumber(row?.dailyChangePct);
      const floatingPnl = Number.isFinite(price) && shares > 0 ? (price - cost) * shares : Number.NaN;
      const positionValue = Number.isFinite(price) ? price * shares : Number.NaN;

      return {
        code: holding.code,
        name: row?.name || holding.code,
        shares,
        cost,
        price,
        dailyPnl,
        dailyChangePct,
        floatingPnl,
        positionValue,
      };
    });

  const funds: DailyFundProfitItem[] = fundHoldings
    .filter((holding) => Number(holding.units) > 0)
    .map((holding) => {
      const row = fundMap.get(holding.code);
      const units = Math.max(0, Number(holding.units) || 0);
      const cost = Math.max(0, Number(holding.cost) || 0);

      return {
        code: holding.code,
        name: row?.name || holding.name || holding.code,
        units,
        cost,
        latestNav: toSafeNumber(row?.latestNav),
        estimatedNav: toSafeNumber(row?.estimatedNav),
        navDisclosedToday: Boolean(row?.navDisclosedToday),
        holdingAmount: toSafeNumber(row?.holdingAmount),
        holdingProfit: toSafeNumber(row?.holdingProfit),
        estimatedProfit: toSafeNumber(row?.estimatedProfit),
        changePct: toSafeNumber(row?.changePct),
      };
    });

  const stockDailyPnl = round2(sumFinite(stocks.map((item) => item.dailyPnl)));
  const fundDailyProfit = round2(sumFinite(funds.map((item) => item.estimatedProfit)));
  const totalDailyProfit = round2(stockDailyPnl + fundDailyProfit);

  const stockHoldingProfit = round2(sumFinite(stocks.map((item) => item.floatingPnl)));
  const fundHoldingProfit = round2(sumFinite(funds.map((item) => item.holdingProfit)));
  const totalHoldingProfit = round2(stockHoldingProfit + fundHoldingProfit);

  const stockMarketValue = round2(sumFinite(stocks.map((item) => item.positionValue)));
  const fundHoldingAmount = round2(sumFinite(funds.map((item) => item.holdingAmount)));
  const totalAssets = round2(stockMarketValue + fundHoldingAmount);

  return {
    date,
    updatedAt,
    stockCount: stocks.length,
    fundCount: funds.length,
    stockDailyPnl,
    fundDailyProfit,
    totalDailyProfit,
    stockHoldingProfit,
    fundHoldingProfit,
    totalHoldingProfit,
    stockMarketValue,
    fundHoldingAmount,
    totalAssets,
    stocks,
    funds,
  };
}

export function upsertDailyProfitDetailHistory(
  history: DailyProfitDetailRecord[],
  nextRecord: DailyProfitDetailRecord,
  keepDays = DAILY_PROFIT_HISTORY_KEEP_DAYS,
): DailyProfitDetailRecord[] {
  const dedup = history.filter((item) => item.date !== nextRecord.date);
  const merged = [nextRecord, ...dedup]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, keepDays);
  return merged;
}

function normalizeStockItem(raw: unknown): DailyStockProfitItem | null {
  const source = raw as Partial<DailyStockProfitItem> | null | undefined;
  const code = String(source?.code ?? '').trim();
  if (!code) return null;
  return {
    code,
    name: String(source?.name ?? code),
    shares: Math.max(0, Number(source?.shares) || 0),
    cost: Math.max(0, Number(source?.cost) || 0),
    price: toSafeNumber(source?.price),
    dailyPnl: toSafeNumber(source?.dailyPnl),
    dailyChangePct: toSafeNumber(source?.dailyChangePct),
    floatingPnl: toSafeNumber(source?.floatingPnl),
    positionValue: toSafeNumber(source?.positionValue),
  };
}

function normalizeFundItem(raw: unknown): DailyFundProfitItem | null {
  const source = raw as Partial<DailyFundProfitItem> | null | undefined;
  const code = String(source?.code ?? '').trim();
  if (!code) return null;
  return {
    code,
    name: String(source?.name ?? code),
    units: Math.max(0, Number(source?.units) || 0),
    cost: Math.max(0, Number(source?.cost) || 0),
    latestNav: toSafeNumber(source?.latestNav),
    estimatedNav: toSafeNumber(source?.estimatedNav),
    navDisclosedToday: Boolean(source?.navDisclosedToday),
    holdingAmount: toSafeNumber(source?.holdingAmount),
    holdingProfit: toSafeNumber(source?.holdingProfit),
    estimatedProfit: toSafeNumber(source?.estimatedProfit),
    changePct: toSafeNumber(source?.changePct),
  };
}

function normalizeDetail(raw: unknown): DailyProfitDetailRecord | null {
  const source = raw as Partial<DailyProfitDetailRecord> | null | undefined;
  const date = String(source?.date ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  const stocks = Array.isArray(source?.stocks)
    ? source.stocks.map(normalizeStockItem).filter((item): item is DailyStockProfitItem => item !== null)
    : [];
  const funds = Array.isArray(source?.funds)
    ? source.funds.map(normalizeFundItem).filter((item): item is DailyFundProfitItem => item !== null)
    : [];

  return {
    date,
    updatedAt: String(source?.updatedAt ?? ''),
    stockCount: Number(source?.stockCount) || stocks.length,
    fundCount: Number(source?.fundCount) || funds.length,
    stockDailyPnl: toSafeNumber(source?.stockDailyPnl),
    fundDailyProfit: toSafeNumber(source?.fundDailyProfit),
    totalDailyProfit: toSafeNumber(source?.totalDailyProfit),
    stockHoldingProfit: toSafeNumber(source?.stockHoldingProfit),
    fundHoldingProfit: toSafeNumber(source?.fundHoldingProfit),
    totalHoldingProfit: toSafeNumber(source?.totalHoldingProfit),
    stockMarketValue: toSafeNumber(source?.stockMarketValue),
    fundHoldingAmount: toSafeNumber(source?.fundHoldingAmount),
    totalAssets: toSafeNumber(source?.totalAssets),
    stocks,
    funds,
  };
}

export function normalizeDailyProfitDetailHistory(raw: unknown): DailyProfitDetailRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(normalizeDetail)
    .filter((item): item is DailyProfitDetailRecord => item !== null)
    .sort((a, b) => b.date.localeCompare(a.date));
}
