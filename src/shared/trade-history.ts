// -----------------------------------------------------------
// Trade history — buy/sell/dividend recording for accurate P&L
// -----------------------------------------------------------

export const TRADE_HISTORY_KEY = 'stockTradeHistory';
export const TRADE_HISTORY_SYNC_KEY = 'stockTradeHistory_sync'; // legacy sync key
export const TRADE_HISTORY_MIGRATION_KEY = 'stockTradeHistory_migrated_to_sync';

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

function toFiniteNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Number.NaN;
}

function normalizeTradeRecord(raw: unknown, fallbackCode: string): StockTradeRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const id = typeof record.id === 'string' && record.id.trim() ? record.id : '';
  const stockCode = typeof record.stockCode === 'string' && record.stockCode.trim()
    ? record.stockCode.trim()
    : typeof record.code === 'string' && record.code.trim()
      ? record.code.trim()
      : fallbackCode;
  const date = typeof record.date === 'string' && record.date.trim() ? record.date.trim() : '';
  const typeRaw = typeof record.type === 'string' ? record.type : typeof record.tradeType === 'string' ? record.tradeType : '';
  const type = typeRaw === 'buy' || typeRaw === 'sell' || typeRaw === 'dividend' ? typeRaw : null;
  const shares = toFiniteNumber(record.shares ?? record.qty ?? record.volume);
  const price = toFiniteNumber(record.price ?? record.unitPrice);
  const total = toFiniteNumber(record.total);
  const fees = toFiniteNumber(record.fees);
  const commission = toFiniteNumber(record.commission);
  const stampTax = toFiniteNumber(record.stampTax);
  const transferFee = toFiniteNumber(record.transferFee);
  const createdAt = typeof record.createdAt === 'string' && record.createdAt.trim()
    ? record.createdAt.trim()
    : new Date().toISOString();
  const note = typeof record.note === 'string' && record.note.trim() ? record.note.trim() : undefined;

  if (!id || !stockCode || !date || !type || !Number.isFinite(shares) || !Number.isFinite(price)) return null;

  return {
    id,
    stockCode,
    date,
    type,
    shares,
    price,
    total: Number.isFinite(total) ? total : undefined,
    fees: Number.isFinite(fees) ? fees : undefined,
    commission: Number.isFinite(commission) ? commission : undefined,
    stampTax: Number.isFinite(stampTax) ? stampTax : undefined,
    transferFee: Number.isFinite(transferFee) ? transferFee : undefined,
    note,
    createdAt,
  };
}

function compareTrades(a: StockTradeRecord, b: StockTradeRecord): number {
  const dateDiff = a.date.localeCompare(b.date);
  if (dateDiff !== 0) return dateDiff;
  const createdAtA = a.createdAt ?? '';
  const createdAtB = b.createdAt ?? '';
  const createdDiff = createdAtA.localeCompare(createdAtB);
  if (createdDiff !== 0) return createdDiff;
  return a.id.localeCompare(b.id);
}

export function countTradeHistory(history: Record<string, StockTradeRecord[]>): number {
  return Object.values(history).reduce((sum, trades) => sum + trades.length, 0);
}

export function mergeTradeHistory(primary: Record<string, StockTradeRecord[]>, secondary: Record<string, StockTradeRecord[]>): Record<string, StockTradeRecord[]> {
  const merged: Record<string, StockTradeRecord[]> = {};
  const codes = new Set([...Object.keys(primary), ...Object.keys(secondary)]);
  for (const code of codes) {
    const all = [...(primary[code] ?? []), ...(secondary[code] ?? [])];
    const unique = new Map<string, StockTradeRecord>();
    for (const trade of all) {
      if (!trade || typeof trade.id !== 'string') continue;
      if (!unique.has(trade.id)) {
        unique.set(trade.id, trade);
      }
    }
    const rows = [...unique.values()].sort(compareTrades);
    if (rows.length > 0) merged[code] = rows;
  }
  return merged;
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
  const sorted = [...trades].sort(compareTrades);

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
  baseAmount: number; // 当日收益率分母（昨收持仓市值 + 今日买入成本）
  changePct: number; // 当日收益率
};

/** 计算当日盈亏，按开盘权益 + 当日现金流统一口径计算 */
export function computeDailyPnlFromTrades(
  trades: StockTradeRecord[],
  currentPrice: number,
  prevClose: number,
  today: string,
): DailyPnlResult {
  const nan = { pnl: Number.NaN, baseAmount: Number.NaN, changePct: Number.NaN };
  if (!Array.isArray(trades) || trades.length === 0) return nan;
  if (!Number.isFinite(currentPrice) || !Number.isFinite(prevClose)) return nan;

  const sorted = [...trades].sort(compareTrades);

  let openingShares = 0;
  let buyAmountToday = 0;
  let sellAmountToday = 0;
  let dividendToday = 0;
  let endShares = 0;

  for (const t of sorted) {
    if (t.date < today) {
      if (t.type === 'buy') {
        openingShares += t.shares;
      } else if (t.type === 'sell') {
        if (openingShares <= 0) continue;
        const sellShares = Math.min(t.shares, openingShares);
        openingShares -= sellShares;
      }
    }
  }

  endShares = openingShares;

  for (const t of sorted) {
    if (t.date !== today) continue;

    if (t.type === 'buy') {
      buyAmountToday += t.shares * t.price + totalFees(t);
      endShares += t.shares;
    } else if (t.type === 'sell') {
      const sellShares = Math.min(t.shares, endShares);
      if (sellShares <= 0) continue;
      const grossAmount = sellShares * t.price;
      const feeRatio = t.shares > 0 ? sellShares / t.shares : 0;
      sellAmountToday += grossAmount - totalFees(t) * feeRatio;
      endShares -= sellShares;
    } else if (t.type === 'dividend') {
      dividendToday += (t.total ?? 0) - totalFees(t);
    }
  }

  const openingValue = openingShares * prevClose;
  const closingValue = endShares * currentPrice;
  const pnl = closingValue + sellAmountToday + dividendToday - openingValue - buyAmountToday;
  const baseAmount = openingValue + buyAmountToday;
  const changePct = baseAmount > 0 ? (pnl / baseAmount) * 100 : Number.NaN;

  return {
    pnl: Math.round(pnl * 100) / 100,
    baseAmount: Math.round(baseAmount * 100) / 100,
    changePct: Math.round(changePct * 100) / 100,
  };
}

// -----------------------------------------------------------
// Persistence
// -----------------------------------------------------------

export function sanitizeTradeHistory(raw: unknown): Record<string, StockTradeRecord[]> {
  if (!raw || typeof raw !== 'object') return {};
  const clean: Record<string, StockTradeRecord[]> = {};
  for (const [code, records] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(records)) continue;
    const normalized = records
      .map((record) => normalizeTradeRecord(record, code))
      .filter((record): record is StockTradeRecord => Boolean(record));
    if (normalized.length > 0) {
      clean[code] = normalized;
    }
  }
  return clean;
}

export async function loadTradeHistory(): Promise<Record<string, StockTradeRecord[]>> {
  try {
    const [syncResult, localResult] = await Promise.all([
      chrome.storage.sync.get([TRADE_HISTORY_KEY, TRADE_HISTORY_SYNC_KEY, TRADE_HISTORY_MIGRATION_KEY]),
      chrome.storage.local.get(TRADE_HISTORY_KEY),
    ]);
    const migrated = Boolean(syncResult[TRADE_HISTORY_MIGRATION_KEY]);
    const syncRaw = syncResult[TRADE_HISTORY_KEY] ?? syncResult[TRADE_HISTORY_SYNC_KEY];
    const syncClean = sanitizeTradeHistory(syncRaw);
    const localClean = sanitizeTradeHistory(localResult[TRADE_HISTORY_KEY]);

    if (migrated) {
      if (countTradeHistory(syncClean) > 0) {
        if (syncResult[TRADE_HISTORY_SYNC_KEY]) {
          void chrome.storage.sync.remove(TRADE_HISTORY_SYNC_KEY).catch(() => {});
        }
        return syncClean;
      }
      if (countTradeHistory(localClean) > 0) {
        void chrome.storage.sync.set({
          [TRADE_HISTORY_KEY]: localClean,
          [TRADE_HISTORY_MIGRATION_KEY]: true,
        }).catch(() => {});
        if (syncResult[TRADE_HISTORY_SYNC_KEY]) {
          void chrome.storage.sync.remove(TRADE_HISTORY_SYNC_KEY).catch(() => {});
        }
        return localClean;
      }
      if (syncResult[TRADE_HISTORY_SYNC_KEY]) {
        void chrome.storage.sync.remove(TRADE_HISTORY_SYNC_KEY).catch(() => {});
      }
      return {};
    }

    const merged = mergeTradeHistory(syncClean, localClean);
    if (countTradeHistory(merged) === 0) {
      return {};
    }

    void chrome.storage.sync.set({
      [TRADE_HISTORY_KEY]: merged,
      [TRADE_HISTORY_MIGRATION_KEY]: true,
    }).catch(() => {});
    if (syncResult[TRADE_HISTORY_SYNC_KEY]) {
      void chrome.storage.sync.remove(TRADE_HISTORY_SYNC_KEY).catch(() => {});
    }
    void chrome.storage.local.set({ [TRADE_HISTORY_KEY]: merged }).catch(() => {});
    return merged;
  } catch {
    return {};
  }
}

export async function saveTradeHistory(history: Record<string, StockTradeRecord[]>): Promise<void> {
  const clean = sanitizeTradeHistory(history);
  let saved = false;
  try {
    await chrome.storage.sync.set({
      [TRADE_HISTORY_KEY]: clean,
      [TRADE_HISTORY_MIGRATION_KEY]: true,
    });
    saved = true;
  } catch {
    // sync could fail due to quota/offline sync state; still persist locally.
  }
  try {
    await chrome.storage.local.set({ [TRADE_HISTORY_KEY]: clean });
    saved = true;
  } catch {
    // best effort
  }
  if (!saved) {
    throw new Error('保存交易记录失败');
  }
}

/** Migrate trade history to sync storage, keep local as compatibility mirror. */
export async function migrateTradeHistoryToSync(): Promise<void> {
  try {
    const [syncResult, localResult] = await Promise.all([
      chrome.storage.sync.get([TRADE_HISTORY_KEY, TRADE_HISTORY_SYNC_KEY, TRADE_HISTORY_MIGRATION_KEY]),
      chrome.storage.local.get(TRADE_HISTORY_KEY),
    ]);
    const syncClean = sanitizeTradeHistory(syncResult[TRADE_HISTORY_KEY] ?? syncResult[TRADE_HISTORY_SYNC_KEY]);
    const localClean = sanitizeTradeHistory(localResult[TRADE_HISTORY_KEY]);
    const merged = mergeTradeHistory(syncClean, localClean);

    if (Object.keys(merged).length > 0) {
      await chrome.storage.sync.set({
        [TRADE_HISTORY_KEY]: merged,
        [TRADE_HISTORY_MIGRATION_KEY]: true,
      });
      if (syncResult[TRADE_HISTORY_SYNC_KEY]) {
        await chrome.storage.sync.remove(TRADE_HISTORY_SYNC_KEY);
      }
      await chrome.storage.local.set({ [TRADE_HISTORY_KEY]: merged });
      return;
    }

    if (!syncResult[TRADE_HISTORY_MIGRATION_KEY]) {
      await chrome.storage.sync.set({ [TRADE_HISTORY_MIGRATION_KEY]: true });
    }
  } catch {
    // best effort
  }
}

/** @deprecated 已改为 migrateTradeHistoryToSync，保留兼容旧调用 */
export async function migrateTradeHistoryToLocal(): Promise<void> {
  await migrateTradeHistoryToSync();
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
  try {
    const [syncResult, localResult] = await Promise.all([
      chrome.storage.sync.get([TRADE_HISTORY_KEY, TRADE_HISTORY_SYNC_KEY, TRADE_HISTORY_MIGRATION_KEY]),
      chrome.storage.local.get(TRADE_HISTORY_KEY),
    ]);
    const syncClean = sanitizeTradeHistory(syncResult[TRADE_HISTORY_KEY] ?? syncResult[TRADE_HISTORY_SYNC_KEY]);
    const localClean = sanitizeTradeHistory(localResult[TRADE_HISTORY_KEY]);
    const merged = mergeTradeHistory(syncClean, localClean);
    const records = merged[stockCode];
    if (!records || records.length === 0) return;

    const next = { ...merged };
    next[stockCode] = records.filter((r) => r.id !== tradeId);
    if (next[stockCode].length === 0) delete next[stockCode];

    await chrome.storage.sync.set({
      [TRADE_HISTORY_KEY]: next,
      [TRADE_HISTORY_MIGRATION_KEY]: true,
    });
    if (syncResult[TRADE_HISTORY_SYNC_KEY]) {
      await chrome.storage.sync.remove(TRADE_HISTORY_SYNC_KEY);
    }
    await chrome.storage.local.set({ [TRADE_HISTORY_KEY]: next });
  } catch {
    // best effort
  }
}
