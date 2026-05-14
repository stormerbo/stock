// -----------------------------------------------------------
// Shared snapshot recalculation — used by both background SW
// and TradeHistoryPage, replacing two near-duplicate copies.
// -----------------------------------------------------------

import { computePositionFromTrades } from './trade-history';
import type { StockTradeRecord } from './trade-history';
import type { DailyAssetSnapshot, StockPosition, FundPosition } from './fetch';
import { getHoldingsAtDate } from './holding-history';
import type { HoldingChangeEvent } from './holding-history';

export type RecalcContext = {
  tradeHistory: Record<string, StockTradeRecord[]>;
  holdingHistory: HoldingChangeEvent[];
  stockPositions: StockPosition[];
  fundPositions: FundPosition[];
  /** code → dateStr → closePrice */
  klinePriceMap: Map<string, Map<string, number>>;
  /** code → dateStr → NAV */
  fundNavMap: Map<string, Map<string, number>>;
};

export type RecalcProgress = {
  currentDate: string;
  totalDates: number;
  processedDates: number;
};

// -----------------------------------------------------------
// Public entry point
// -----------------------------------------------------------

export function recalcSnapshotsInRange(
  startDate: string,
  endDate: string,
  ctx: RecalcContext,
  onProgress?: (p: RecalcProgress) => void,
): DailyAssetSnapshot[] {
  const snapshots: DailyAssetSnapshot[] = [];
  const cursor = new Date(startDate);
  const end = new Date(endDate);
  const tradedCodes = new Set(Object.keys(ctx.tradeHistory));
  let processedCount = 0;

  // Pre-count trading days for progress
  let totalDates = 0;
  {
    const tmp = new Date(startDate);
    while (tmp <= end) {
      if (tmp.getDay() !== 0 && tmp.getDay() !== 6) totalDates++;
      tmp.setDate(tmp.getDate() + 1);
    }
  }

  while (cursor <= end) {
    const dateStr = cursor.toISOString().slice(0, 10);
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6) {
      const snapshot = recalcSingleDate(dateStr, ctx, tradedCodes);
      snapshots.push(snapshot);
    }
    processedCount++;
    cursor.setDate(cursor.getDate() + 1);

    if (onProgress && processedCount % 10 === 0) {
      onProgress({ currentDate: dateStr, totalDates, processedDates: processedCount });
    }
  }

  return snapshots;
}

// -----------------------------------------------------------
// Per-date calculation
// -----------------------------------------------------------

function recalcSingleDate(
  date: string,
  ctx: RecalcContext,
  tradedCodes: Set<string>,
): DailyAssetSnapshot {
  let stockRealizedPnl = 0;
  let stockFloatingAtDate = 0;
  let fundPnlAtDate = 0;

  // (A) Stocks WITH trade records — authoritative reconstruction
  for (const [code, trades] of Object.entries(ctx.tradeHistory)) {
    const upToDate = trades.filter((t) => t.date <= date);
    if (upToDate.length === 0) continue;

    const pos = computePositionFromTrades(upToDate);
    stockRealizedPnl += pos.realizedPnl;

    if (pos.shares > 0) {
      const closePrice = ctx.klinePriceMap.get(code)?.get(date);
      if (Number.isFinite(closePrice)) {
        stockFloatingAtDate += (closePrice! - pos.avgCost) * pos.shares;
      }
    }
  }

  // (B) Stocks without trade records — use holding change history
  const holdingsAtDate = getHoldingsAtDate(ctx.holdingHistory, date);
  for (const [code, holding] of holdingsAtDate) {
    if (tradedCodes.has(code)) continue;
    if (holding.shares <= 0 || holding.cost <= 0) continue;

    const closePrice = ctx.klinePriceMap.get(code)?.get(date);
    if (Number.isFinite(closePrice)) {
      stockFloatingAtDate += (closePrice! - holding.cost) * holding.shares;
    }
  }

  // (C) Fallback — stocks in current positions not covered by (A) or (B)
  // This covers the migration period before holding history was recorded.
  for (const sp of ctx.stockPositions) {
    if (tradedCodes.has(sp.code)) continue;
    if (holdingsAtDate.has(sp.code)) continue;

    const closePrice = ctx.klinePriceMap.get(sp.code)?.get(date);
    if (Number.isFinite(closePrice) && sp.shares > 0 && sp.cost > 0) {
      stockFloatingAtDate += (closePrice! - sp.cost) * sp.shares;
    } else if (Number.isFinite(sp.floatingPnl)) {
      stockFloatingAtDate += sp.floatingPnl;
    }
  }

  // (D) Fund positions
  for (const fp of ctx.fundPositions) {
    const nav = ctx.fundNavMap.get(fp.code)?.get(date);
    if (Number.isFinite(nav) && fp.units > 0 && fp.cost > 0) {
      fundPnlAtDate += (nav! - fp.cost) * fp.units;
    } else if (Number.isFinite(fp.holdingProfit)) {
      fundPnlAtDate += fp.holdingProfit;
    }
  }

  const floatingPnl = stockFloatingAtDate + fundPnlAtDate;
  const stockPnl = stockFloatingAtDate + stockRealizedPnl;

  return {
    date,
    totalPnl: Math.round((stockPnl + fundPnlAtDate) * 100) / 100,
    floatingPnl: Math.round(floatingPnl * 100) / 100,
    realizedPnl: Math.round(stockRealizedPnl * 100) / 100,
    stockPnl: Math.round(stockPnl * 100) / 100,
    fundPnl: Math.round(fundPnlAtDate * 100) / 100,
  };
}
