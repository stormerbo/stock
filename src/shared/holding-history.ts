// -----------------------------------------------------------
// Holding change history — tracks config changes for accurate
// historical P&L reconstruction without full trade records
// -----------------------------------------------------------

export type HoldingChangeType = 'add' | 'update' | 'remove' | 'snapshot';

export type HoldingChangeEvent = {
  code: string;
  date: string;           // YYYY-MM-DD
  shares: number;         // post-change value, 0 if removed
  cost: number;           // post-change value, 0 if removed
  changeType: HoldingChangeType;
  timestamp: number;      // epoch ms, for ordering within a day
};

export const HOLDING_HISTORY_KEY = 'stockHoldingHistory';

// -----------------------------------------------------------
// Diff: compare old vs new holdings config, emit events
// -----------------------------------------------------------

type HoldingLike = { code: string; shares: number; cost: number };

export function diffHoldings(
  oldList: HoldingLike[],
  newList: HoldingLike[],
): HoldingChangeEvent[] {
  const events: HoldingChangeEvent[] = [];
  const now = Date.now();
  const today = new Date().toISOString().slice(0, 10);

  const oldMap = new Map(oldList.map((h) => [h.code, h]));
  const newMap = new Map(newList.map((h) => [h.code, h]));

  // Removed stocks
  for (const [code, old] of oldMap) {
    if (!newMap.has(code)) {
      events.push({
        code,
        date: today,
        shares: 0,
        cost: 0,
        changeType: 'remove',
        timestamp: now,
      });
    }
  }

  // Added or updated stocks
  for (const [code, h] of newMap) {
    const old = oldMap.get(code);
    if (!old) {
      events.push({
        code,
        date: today,
        shares: h.shares,
        cost: h.cost,
        changeType: 'add',
        timestamp: now,
      });
    } else if (old.shares !== h.shares || old.cost !== h.cost) {
      events.push({
        code,
        date: today,
        shares: h.shares,
        cost: h.cost,
        changeType: 'update',
        timestamp: now,
      });
    }
  }

  return events;
}

// -----------------------------------------------------------
// Reconstruct holdings at a given date
// -----------------------------------------------------------

export function getHoldingsAtDate(
  history: HoldingChangeEvent[],
  date: string,
): Map<string, { shares: number; cost: number }> {
  const result = new Map<string, { shares: number; cost: number }>();

  const sorted = history
    .filter((e) => e.date <= date)
    .sort((a, b) =>
      a.date !== b.date
        ? a.date.localeCompare(b.date)
        : a.timestamp - b.timestamp,
    );

  for (const e of sorted) {
    if (e.changeType === 'remove') {
      result.delete(e.code);
    } else {
      result.set(e.code, { shares: e.shares, cost: e.cost });
    }
  }

  return result;
}

// -----------------------------------------------------------
// Persistence
// -----------------------------------------------------------

export async function loadHoldingHistory(): Promise<HoldingChangeEvent[]> {
  try {
    const result = await chrome.storage.local.get(HOLDING_HISTORY_KEY);
    return (result[HOLDING_HISTORY_KEY] ?? []) as HoldingChangeEvent[];
  } catch {
    return [];
  }
}

export async function appendHoldingHistory(
  events: HoldingChangeEvent[],
): Promise<void> {
  if (events.length === 0) return;
  const existing = await loadHoldingHistory();
  existing.push(...events);
  await chrome.storage.local.set({ [HOLDING_HISTORY_KEY]: existing });
}
