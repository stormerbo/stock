import { normalizeStockCode, type StockHoldingConfig, type StockPosition } from '../../shared/fetch.ts';

function hasUsableQuote(position: StockPosition | undefined): boolean {
  return Boolean(position && Number.isFinite(position.price) && position.price > 0);
}

export function getStockQuoteRefreshCandidates(
  holdings: StockHoldingConfig[],
  positions: StockPosition[],
): StockHoldingConfig[] {
  const positionMap = new Map(
    positions.map((item) => [normalizeStockCode(item.code) || item.code, item]),
  );

  return holdings.filter((holding) => {
    const code = normalizeStockCode(holding.code);
    if (!code) return false;
    return !hasUsableQuote(positionMap.get(code));
  });
}
