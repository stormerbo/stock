// -----------------------------------------------------------
// Fund trade history — subscribe/redeem/dividend recording
// -----------------------------------------------------------

export const FUND_TRADE_HISTORY_KEY = 'fundTradeHistory';

export type FundTradeType = 'subscribe' | 'redeem' | 'dividend';

export type FundTradeRecord = {
  id: string;
  fundCode: string;
  date: string;            // "YYYY-MM-DD"
  type: FundTradeType;     // subscribe=申购, redeem=赎回, dividend=分红
  units: number;           // 份额
  amount: number;          // 金额（元）
  nav: number;             // 交易时净值
  subscriptionFee?: number; // 申购费
  redemptionFee?: number;   // 赎回费
  note?: string;
  createdAt: string;       // ISO timestamp
};

export type FundTradeComputedPosition = {
  units: number;       // current position (份额)
  avgCost: number;     // weighted average cost per unit
  totalCost: number;   // total cost basis
  realizedPnl: number; // cumulative realized P&L
  tradeCount: number;
};

export function totalFundFees(t: FundTradeRecord): number {
  return (t.subscriptionFee ?? 0) + (t.redemptionFee ?? 0);
}

function genTradeId(): string {
  return `ft_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// -----------------------------------------------------------
// Pure computation — derives position from trade history
// -----------------------------------------------------------

export function computeFundPositionFromTrades(
  trades: FundTradeRecord[],
): FundTradeComputedPosition {
  if (!Array.isArray(trades) || trades.length === 0) {
    return { units: 0, avgCost: 0, totalCost: 0, realizedPnl: 0, tradeCount: 0 };
  }

  const sorted = [...trades].sort((a, b) => a.date.localeCompare(b.date));

  let units = 0;
  let totalCost = 0;
  let realizedPnl = 0;

  for (const t of sorted) {
    if (t.type === 'subscribe') {
      const cost = t.amount + totalFundFees(t);
      units += t.units;
      totalCost += cost;
    } else if (t.type === 'redeem') {
      if (units <= 0) continue;
      const redeemUnits = Math.min(t.units, units);
      const avgCost = totalCost / units;
      const redeemAmount = t.amount - totalFundFees(t);
      realizedPnl += redeemAmount - redeemUnits * avgCost;
      totalCost *= (units - redeemUnits) / units;
      units -= redeemUnits;
    } else if (t.type === 'dividend') {
      realizedPnl += t.amount - totalFundFees(t);
    }
  }

  const round4 = (v: number) => Number.isFinite(v) ? Math.round(v * 10000) / 10000 : 0;
  const round2 = (v: number) => Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;

  return {
    units: round4(units),
    avgCost: units > 0 ? round4(totalCost / units) : 0,
    totalCost: round2(totalCost),
    realizedPnl: round2(realizedPnl),
    tradeCount: sorted.length,
  };
}

// -----------------------------------------------------------
// Persistence
// -----------------------------------------------------------

export async function loadFundTradeHistory(): Promise<Record<string, FundTradeRecord[]>> {
  try {
    const result = await chrome.storage.sync.get(FUND_TRADE_HISTORY_KEY);
    const raw = result[FUND_TRADE_HISTORY_KEY] as Record<string, FundTradeRecord[]> | undefined;
    if (!raw || typeof raw !== 'object') return {};
    const clean: Record<string, FundTradeRecord[]> = {};
    for (const [code, records] of Object.entries(raw)) {
      if (!Array.isArray(records)) continue;
      clean[code] = records.filter((r) =>
        r && typeof r.id === 'string' && r.fundCode && r.type &&
        Number.isFinite(r.units) && Number.isFinite(r.amount) && Number.isFinite(r.nav)
      );
    }
    return clean;
  } catch {
    return {};
  }
}

export async function saveFundTradeHistory(history: Record<string, FundTradeRecord[]>): Promise<void> {
  await chrome.storage.sync.set({ [FUND_TRADE_HISTORY_KEY]: history });
}

export async function getFundTradesForCode(code: string): Promise<FundTradeRecord[]> {
  const all = await loadFundTradeHistory();
  return all[code] || [];
}

export async function addFundTrade(trade: Omit<FundTradeRecord, 'id' | 'createdAt'>): Promise<FundTradeRecord> {
  const record: FundTradeRecord = {
    ...trade,
    id: genTradeId(),
    createdAt: new Date().toISOString(),
  };
  const all = await loadFundTradeHistory();
  if (!all[trade.fundCode]) all[trade.fundCode] = [];
  all[trade.fundCode].push(record);
  await saveFundTradeHistory(all);
  return record;
}

export async function deleteFundTrade(fundCode: string, tradeId: string): Promise<void> {
  const all = await loadFundTradeHistory();
  const records = all[fundCode];
  if (!records) return;
  all[fundCode] = records.filter((r) => r.id !== tradeId);
  if (all[fundCode].length === 0) delete all[fundCode];
  await saveFundTradeHistory(all);
}
