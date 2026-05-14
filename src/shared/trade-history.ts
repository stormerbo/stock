// -----------------------------------------------------------
// Trade history — buy/sell/dividend recording for accurate P&L
// -----------------------------------------------------------

export const TRADE_HISTORY_KEY = 'stockTradeHistory';
export const TRADE_HISTORY_SYNC_KEY = 'stockTradeHistory_sync'; // old sync key for migration

export type TradeType = 'buy' | 'sell' | 'dividend';

export type StockTradeRecord = {
  id: string;
  stockCode: string;
  date: string;           // "YYYY-MM-DD"
  type: TradeType;
  shares: number;          // positive; for 'sell', the number of shares sold
  price: number;           // per-share price
  total?: number;          // total amount (if omitted, computed as shares * price)
  /** @deprecated 改用 commission/stampTax/transferFee */
  fees?: number;           // transaction fees (commission + stamp tax, etc.)
  commission?: number;     // 手续费（佣金）
  stampTax?: number;       // 印花税（仅卖出时产生）
  transferFee?: number;    // 过户费
  note?: string;
  createdAt: string;       // ISO timestamp
};

/** 计算单笔交易的总费用（兼容新旧字段） */
export function totalFees(t: StockTradeRecord): number {
  if (t.commission != null || t.stampTax != null || t.transferFee != null) {
    return (t.commission ?? 0) + (t.stampTax ?? 0) + (t.transferFee ?? 0);
  }
  return t.fees ?? 0;
}

export type TradeComputedPosition = {
  shares: number;          // current position size
  avgCost: number;         // weighted average cost per share
  totalCost: number;       // total cost basis of current position
  realizedPnl: number;     // cumulative realized P&L from sells and dividends
  tradeCount: number;      // total number of trades recorded
};

function genTradeId(): string {
  return `t_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// -----------------------------------------------------------
// Pure computation — derives position from trade history
// -----------------------------------------------------------

export function computePositionFromTrades(
  trades: StockTradeRecord[],
): TradeComputedPosition {
  if (!Array.isArray(trades) || trades.length === 0) {
    return { shares: 0, avgCost: 0, totalCost: 0, realizedPnl: 0, tradeCount: 0 };
  }

  // Sort ascending by date for chronological processing
  const sorted = [...trades].sort((a, b) => a.date.localeCompare(b.date));

  let shares = 0;
  let totalCost = 0; // total cost basis of current position
  let realizedPnl = 0;
  let tradeCount = 0;

  for (const t of sorted) {
    tradeCount++;

    if (t.type === 'buy') {
      const cost = t.shares * t.price + totalFees(t);
      shares += t.shares;
      totalCost += cost;
    } else if (t.type === 'sell') {
      if (shares <= 0) continue; // no position to sell from
      const sellShares = Math.min(t.shares, shares);
      const avgCost = totalCost / shares;
      const sellRevenue = sellShares * t.price - totalFees(t);
      realizedPnl += sellRevenue - sellShares * avgCost;
      // Reduce totalCost proportionally
      totalCost *= (shares - sellShares) / shares;
      shares -= sellShares;
    } else if (t.type === 'dividend') {
      realizedPnl += (t.total ?? 0) - totalFees(t);
    }
  }

  // Round to avoid floating point noise
  const round3 = (v: number) => Number.isFinite(v) ? Math.round(v * 1000) / 1000 : 0;
  const round2 = (v: number) => Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;

  return {
    shares: Math.max(0, Math.round(shares)),
    avgCost: shares > 0 ? round3(totalCost / shares) : 0,
    totalCost: round3(totalCost),
    realizedPnl: round2(realizedPnl),
    tradeCount,
  };
}

/** 当日盈亏计算结果 */
export type DailyPnlResult = {
  pnl: number;       // 当日盈亏金额
};

/** 计算当日盈亏，区分隔夜持仓、今日卖出和今日买入 */
export function computeDailyPnlFromTrades(
  trades: StockTradeRecord[],
  currentPrice: number,
  prevClose: number,
  today: string,
): DailyPnlResult {
  const nan = { pnl: Number.NaN };
  if (!Array.isArray(trades) || trades.length === 0) return nan;
  if (!Number.isFinite(currentPrice) || !Number.isFinite(prevClose)) return nan;

  const sorted = [...trades].sort((a, b) => a.date.localeCompare(b.date));

  let yesterdayShares = 0;
  let todayBuyShares = 0;
  let todayBuyAmount = 0;
  let soldTodayPnl = 0;

  for (const t of sorted) {
    if (t.date < today) {
      if (t.type === 'buy') {
        yesterdayShares += t.shares;
      } else if (t.type === 'sell') {
        if (yesterdayShares <= 0) continue;
        const sellShares = Math.min(t.shares, yesterdayShares);
        yesterdayShares -= sellShares;
      }
    }
  }

  // 处理今天交易，计算当日盈亏
  for (const t of sorted) {
    if (t.date === today) {
      if (t.type === 'buy') {
        todayBuyShares += t.shares;
        todayBuyAmount += t.shares * t.price + totalFees(t);
      } else if (t.type === 'sell') {
        let remaining = t.shares;
        if (todayBuyShares > 0) {
          const fromToday = Math.min(remaining, todayBuyShares);
          todayBuyShares -= fromToday;
          todayBuyAmount *= (todayBuyShares + fromToday > 0 ? todayBuyShares / (todayBuyShares + fromToday) : 0);
          remaining -= fromToday;
        }
        if (remaining > 0 && yesterdayShares > 0) {
          const sellFromYesterday = Math.min(remaining, yesterdayShares);
          soldTodayPnl += (t.price - prevClose) * sellFromYesterday;
          yesterdayShares -= sellFromYesterday;
        }
      }
    }
  }

  const overnightPnl = (currentPrice - prevClose) * yesterdayShares;
  const intradayPnl = todayBuyShares > 0
    ? (currentPrice - todayBuyAmount / todayBuyShares) * todayBuyShares
    : 0;

  return { pnl: Math.round((overnightPnl + soldTodayPnl + intradayPnl) * 100) / 100 };
}

// -----------------------------------------------------------
// Persistence
// -----------------------------------------------------------

export async function loadTradeHistory(): Promise<Record<string, StockTradeRecord[]>> {
  try {
    const result = await chrome.storage.local.get(TRADE_HISTORY_KEY);
    const raw = result[TRADE_HISTORY_KEY] as Record<string, StockTradeRecord[]> | undefined;
    if (!raw || typeof raw !== 'object') return {};
    // Basic sanitization
    const clean: Record<string, StockTradeRecord[]> = {};
    for (const [code, records] of Object.entries(raw)) {
      if (!Array.isArray(records)) continue;
      clean[code] = records.filter((r) => r && typeof r.id === 'string' && r.stockCode && r.type && Number.isFinite(r.shares) && Number.isFinite(r.price));
    }
    return clean;
  } catch {
    return {};
  }
}

export async function saveTradeHistory(history: Record<string, StockTradeRecord[]>): Promise<void> {
  await chrome.storage.local.set({ [TRADE_HISTORY_KEY]: history });
}

/** Migrate trade history from chrome.storage.sync → local (once). */
export async function migrateTradeHistoryToLocal(): Promise<void> {
  try {
    // Check if data already exists in local
    const localResult = await chrome.storage.local.get(TRADE_HISTORY_KEY);
    if (localResult[TRADE_HISTORY_KEY]) return; // already migrated

    // Try reading from sync (old key or same key)
    const syncResult = await chrome.storage.sync.get(TRADE_HISTORY_KEY);
    const raw = syncResult[TRADE_HISTORY_KEY] as Record<string, StockTradeRecord[]> | undefined;
    if (raw && typeof raw === 'object' && Object.keys(raw).length > 0) {
      await chrome.storage.local.set({ [TRADE_HISTORY_KEY]: raw });
      // Clear from sync after successful migration
      await chrome.storage.sync.remove(TRADE_HISTORY_KEY);
    }
  } catch {
    // best effort
  }
}

export async function getTradesForStock(code: string): Promise<StockTradeRecord[]> {
  const all = await loadTradeHistory();
  return all[code] || [];
}

export async function addTrade(trade: Omit<StockTradeRecord, 'id' | 'createdAt'>): Promise<StockTradeRecord> {
  const record: StockTradeRecord = {
    ...trade,
    id: genTradeId(),
    createdAt: new Date().toISOString(),
  };
  const all = await loadTradeHistory();
  const codes = trade.stockCode;
  if (!all[codes]) all[codes] = [];
  all[codes].push(record);
  await saveTradeHistory(all);
  return record;
}

export async function deleteTrade(stockCode: string, tradeId: string): Promise<void> {
  const all = await loadTradeHistory();
  const records = all[stockCode];
  if (!records) return;
  all[stockCode] = records.filter((r) => r.id !== tradeId);
  if (all[stockCode].length === 0) delete all[stockCode];
  await saveTradeHistory(all);
}
