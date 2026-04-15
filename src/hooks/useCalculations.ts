import { useMemo } from 'react';
import type { Holding, StockQuote, HoldingWithQuote, OverviewData } from '@/types';
import { addMarketSuffix } from '@/utils/stock';

// 计算单个持仓的数据
function calculateHolding(
  holding: Holding,
  quote?: StockQuote
): HoldingWithQuote {
  const currentPrice = quote?.close || 0;
  const preClose = quote?.preClose || 0;
  const marketValue = currentPrice * holding.shares;
  const costValue = holding.costPrice * holding.shares;
  const profit = marketValue - costValue;
  const profitPct = holding.costPrice > 0 ? (profit / costValue) * 100 : 0;
  const dailyProfit = (currentPrice - preClose) * holding.shares;
  const dailyProfitPct = preClose > 0 ? ((currentPrice - preClose) / preClose) * 100 : 0;

  return {
    ...holding,
    quote,
    currentPrice,
    marketValue,
    profit,
    profitPct,
    dailyProfit,
    dailyProfitPct,
    positionRatio: 0, // 稍后计算
  };
}

// 计算所有持仓数据
export function useCalculations(
  holdings: Holding[],
  quotes: StockQuote[]
): {
  holdingsWithQuotes: HoldingWithQuote[];
  overview: OverviewData;
} {
  return useMemo(() => {
    const quoteMap = new Map(quotes.map((q) => [q.code, q]));

    // 计算每个持仓
    const holdingsWithQuotes = holdings.map((h) => {
      const fullCode = addMarketSuffix(h.code);
      const quote = quoteMap.get(fullCode);
      return calculateHolding(h, quote);
    });

    // 计算总市值
    const totalMarketValue = holdingsWithQuotes.reduce(
      (sum, h) => sum + h.marketValue,
      0
    );

    // 计算仓位比
    holdingsWithQuotes.forEach((h) => {
      h.positionRatio = totalMarketValue > 0 ? (h.marketValue / totalMarketValue) * 100 : 0;
    });

    // 计算概览数据
    const totalCost = holdingsWithQuotes.reduce(
      (sum, h) => sum + h.costPrice * h.shares,
      0
    );
    const totalPrevClose = holdingsWithQuotes.reduce(
      (sum, h) => sum + (h.quote?.preClose || 0) * h.shares,
      0
    );

    const overview: OverviewData = {
      totalMarketValue,
      totalProfit: totalMarketValue - totalCost,
      dailyProfit: holdingsWithQuotes.reduce((sum, h) => sum + h.dailyProfit, 0),
      dailyProfitPct: totalPrevClose > 0
        ? ((totalMarketValue - totalPrevClose) / totalPrevClose) * 100
        : 0,
    };

    return { holdingsWithQuotes, overview };
  }, [holdings, quotes]);
}
