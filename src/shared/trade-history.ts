// -----------------------------------------------------------
// Trade history — buy/sell/dividend recording for accurate P&L
// -----------------------------------------------------------

export const TRADE_HISTORY_KEY = 'stockTradeHistory';

export type TradeType = 'buy' | 'sell' | 'dividend';

export type StockTradeRecord = {
  id: string;
  stockCode: string;
  date: string;           // "YYYY-MM-DD"
  type: TradeType;
  shares: number;          // positive; for 'sell', the number of shares sold
  price: number;           // per-share price
  total?: number;          // total amount (if omitted, computed as shares * price)
  fees?: number;           // transaction fees (commission + stamp tax, etc.)
  note?: string;
  createdAt: string;       // ISO timestamp
};

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
      const cost = t.shares * t.price + (t.fees ?? 0);
      shares += t.shares;
      totalCost += cost;
    } else if (t.type === 'sell') {
      if (shares <= 0) continue; // no position to sell from
      const sellShares = Math.min(t.shares, shares);
      const avgCost = totalCost / shares;
      const sellRevenue = sellShares * t.price - (t.fees ?? 0);
      realizedPnl += sellRevenue - sellShares * avgCost;
      // Reduce totalCost proportionally
      totalCost *= (shares - sellShares) / shares;
      shares -= sellShares;
    } else if (t.type === 'dividend') {
      realizedPnl += (t.total ?? 0) - (t.fees ?? 0);
    }
  }

  // Round to avoid floating point noise
  const round2 = (v: number) => Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;

  return {
    shares: Math.max(0, Math.round(shares)),
    avgCost: shares > 0 ? round2(totalCost / shares) : 0,
    totalCost: round2(totalCost),
    realizedPnl: round2(realizedPnl),
    tradeCount,
  };
}

// -----------------------------------------------------------
// Persistence
// -----------------------------------------------------------

export async function loadTradeHistory(): Promise<Record<string, StockTradeRecord[]>> {
  try {
    const result = await chrome.storage.sync.get(TRADE_HISTORY_KEY);
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
  await chrome.storage.sync.set({ [TRADE_HISTORY_KEY]: history });
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
