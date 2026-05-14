import type { StockRow, FundRow, StockSortKey, FundSortKey, SortDir } from '../types';

// -----------------------------------------------------------
// Column sort
// -----------------------------------------------------------

type NumericAccessor<T> = (row: T) => number;
type StringAccessor<T> = (row: T) => string;

function numericCompare<T>(a: T, b: T, getVal: NumericAccessor<T>, dir: SortDir): number {
  const va = getVal(a);
  const vb = getVal(b);
  if (!Number.isFinite(va) && !Number.isFinite(vb)) return 0;
  if (!Number.isFinite(va)) return 1; // NaN at bottom
  if (!Number.isFinite(vb)) return -1;
  return dir === 'asc' ? va - vb : vb - va;
}

function stringCompare<T>(a: T, b: T, getVal: StringAccessor<T>, dir: SortDir): number {
  const va = getVal(a).toLowerCase();
  const vb = getVal(b).toLowerCase();
  return dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
}

/** Sort stock rows by column key */
export function sortStockRows(rows: StockRow[], key: StockSortKey, dir: SortDir): StockRow[] {
  const sorted = [...rows];
  sorted.sort((a, b) => {
    switch (key) {
      case 'name': return stringCompare(a, b, (r) => r.name || r.code, dir);
      case 'floatingPnl': return numericCompare(a, b, (r) => r.floatingPnl, dir);
      case 'holdingRate': return numericCompare(a, b, (r) => {
        if (r.cost <= 0 || !Number.isFinite(r.price)) return Number.NaN;
        return ((r.price - r.cost) / r.cost) * 100;
      }, dir);
      case 'dailyPnl': return numericCompare(a, b, (r) => r.dailyPnl, dir);
      case 'dailyChangePct': return numericCompare(a, b, (r) => r.dailyChangePct, dir);
      case 'cost': return numericCompare(a, b, (r) => r.cost, dir);
      case 'price': return numericCompare(a, b, (r) => r.price, dir);
      case 'shares': return numericCompare(a, b, (r) => r.shares, dir);
      case 'positionRatio': return numericCompare(a, b, (r) => {
        if (!Number.isFinite(r.price) || r.shares <= 0) return Number.NaN;
        return r.price * r.shares;
      }, dir);
      default: return 0;
    }
  });
  return sorted;
}

/** Sort fund rows by column key */
export function sortFundRows(rows: FundRow[], key: FundSortKey, dir: SortDir): FundRow[] {
  const sorted = [...rows];
  sorted.sort((a, b) => {
    switch (key) {
      case 'name': return stringCompare(a, b, (r) => r.name || r.code, dir);
      case 'holdingProfit': return numericCompare(a, b, (r) => r.holdingProfit, dir);
      case 'holdingProfitRate': return numericCompare(a, b, (r) => r.holdingProfitRate, dir);
      case 'estimatedProfit': return numericCompare(a, b, (r) => r.estimatedProfit, dir);
      case 'holdingAmount': return numericCompare(a, b, (r) => r.holdingAmount, dir);
      case 'estimatedNav': return numericCompare(a, b, (r) => r.estimatedNav, dir);
      case 'changePct': return numericCompare(a, b, (r) => r.changePct, dir);
      default: return 0;
    }
  });
  return sorted;
}

// -----------------------------------------------------------
// Pin helpers
// -----------------------------------------------------------

export function applyPinnedOrder<T extends { code: string; pinned?: boolean }>(items: T[], code: string): T[] {
  const target = items.find((item) => item.code === code);
  if (!target) return items;

  if (target.pinned) {
    return items.map((item) => (item.code === code ? { ...item, pinned: false } : { ...item, pinned: false }));
  }

  const currentPinned = items.find((item) => item.pinned && item.code !== code);
  const remaining = items
    .filter((item) => item.code !== code && item.code !== currentPinned?.code)
    .map((item) => ({ ...item, pinned: false }));

  const next: T[] = [{ ...target, pinned: true }];
  if (currentPinned) {
    next.push({ ...currentPinned, pinned: false });
  }
  return [...next, ...remaining];
}

export function insertAfterPinned<T extends { pinned?: boolean }>(items: T[], nextItem: T): T[] {
  const pinnedIndex = items.findIndex((item) => item.pinned);
  if (pinnedIndex === -1) {
    return [nextItem, ...items];
  }
  return [
    ...items.slice(0, pinnedIndex + 1),
    nextItem,
    ...items.slice(pinnedIndex + 1),
  ];
}

// -----------------------------------------------------------
// Drag reorder helpers
// -----------------------------------------------------------

export function reorderCodes(codes: string[], draggedCode: string, targetCode: string, lockedCode?: string): string[] {
  if (draggedCode === targetCode) return codes;

  const movable = lockedCode ? codes.filter((code) => code !== lockedCode) : [...codes];
  const fromIndex = movable.indexOf(draggedCode);
  const targetIndex = movable.indexOf(targetCode);
  if (fromIndex < 0 || targetIndex < 0) return codes;

  const next = [...movable];
  const [dragged] = next.splice(fromIndex, 1);
  next.splice(targetIndex, 0, dragged);

  return lockedCode ? [lockedCode, ...next] : next;
}

export function moveCodeAfterPinned(codes: string[], draggedCode: string, lockedCode?: string): string[] {
  const movable = lockedCode ? codes.filter((code) => code !== lockedCode) : [...codes];
  const fromIndex = movable.indexOf(draggedCode);
  if (fromIndex < 0) return codes;

  const next = [...movable];
  const [dragged] = next.splice(fromIndex, 1);
  next.unshift(dragged);

  return lockedCode ? [lockedCode, ...next] : next;
}

export function sortRowsByCodes<T extends { code: string }>(rows: T[], codes: string[]): T[] {
  const rowMap = new Map(rows.map((row) => [row.code, row]));
  const ordered = codes
    .map((code) => rowMap.get(code))
    .filter((row): row is T => row !== undefined);
  const used = new Set(ordered.map((row) => row.code));
  const rest = rows.filter((row) => !used.has(row.code));
  return [...ordered, ...rest];
}
