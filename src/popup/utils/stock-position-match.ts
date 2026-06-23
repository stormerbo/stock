import { normalizeStockCode, type StockPosition } from '../../shared/fetch.ts';

function positionCodeKey(code: string): string {
  const normalized = normalizeStockCode(code);
  return normalized || code.trim().toLowerCase();
}

export function buildStockPositionMap(positions: StockPosition[]): Map<string, StockPosition> {
  const map = new Map<string, StockPosition>();
  for (const position of positions) {
    const key = positionCodeKey(position.code);
    if (!key) continue;
    map.set(key, position);
  }
  return map;
}

export function getStockPositionByHoldingCode(
  map: Map<string, StockPosition>,
  holdingCode: string,
): StockPosition | undefined {
  const key = positionCodeKey(holdingCode);
  if (!key) return undefined;
  return map.get(key);
}
