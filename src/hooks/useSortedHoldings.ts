import { useMemo } from 'react';
import type { HoldingWithQuote, SortField, SortOrder } from '@/types';

// 排序函数
function getSortValue(holding: HoldingWithQuote, field: SortField): number {
  switch (field) {
    case 'profit':
      return holding.profit;
    case 'daily':
      return holding.dailyProfit;
    case 'position':
      return holding.positionRatio;
    case 'default':
    default:
      return holding.sortOrder;
  }
}

// 排序持仓
export function useSortedHoldings(
  holdings: HoldingWithQuote[],
  sortField: SortField,
  sortOrder: SortOrder
): HoldingWithQuote[] {
  return useMemo(() => {
    // 分离置顶和非置顶
    const pinned = holdings.filter((h) => h.pinned);
    const normal = holdings.filter((h) => !h.pinned);

    // 排序非置顶项
    normal.sort((a, b) => {
      const va = getSortValue(a, sortField);
      const vb = getSortValue(b, sortField);
      return sortOrder === 'asc' ? va - vb : vb - va;
    });

    // 置顶项按 sortOrder 排序
    pinned.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

    return [...pinned, ...normal];
  }, [holdings, sortField, sortOrder]);
}
