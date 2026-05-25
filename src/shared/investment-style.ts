import type { StockHoldingConfig, FundHoldingConfig, FundPosition } from './fetch';
import { type StockTradeRecord, computePositionFromTrades } from './trade-history';
import { calcVolatility } from './risk-metrics';

export type StyleDimensions = {
  concentration: number;
  turnover: number;
  holdPeriod: number;
  winRate: number;
  profitLossRatio: number;
  riskAppetite: number;
};

export type StyleDataPoints = {
  stockCount: number;
  fundCount: number;
  top3Weight: number;
  fundWeight: number;
  monthlyTrades: number;
  avgHoldDays: number;
  winRate: number;
  realizedPnl: number;
  totalPnl: number;
  avgAnnualVolatility: number;
};

export type StyleProfile = {
  dimensions: StyleDimensions;
  label: string;
  description: string;
  dataPoints: StyleDataPoints;
  calculatedAt: number;
};

const STYLE_CACHE_KEY = 'investmentStyleProfile';
const STYLE_LAST_CALC_KEY = '_lastStyleCalcTime';
const STYLE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MIN_TRADES_FOR_STATS = 2;

function score(value: number, min: number, max: number): number {
  const clamped = Math.max(min, Math.min(max, value));
  return Math.round(((clamped - min) / (max - min)) * 100);
}

function dedupStockCodes(holdings: StockHoldingConfig[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const h of holdings) {
    const code = h.code.trim().toLowerCase();
    if (code && !seen.has(code)) {
      seen.add(code);
      result.push(h.code);
    }
  }
  return result;
}

function calcPortfolioWeights(holdings: StockHoldingConfig[], fundHoldings: FundHoldingConfig[], fundPositions: FundPosition[]): number[] {
  const stockWeights = dedupStockCodes(holdings).map((code) => {
    const total = holdings
      .filter((h) => h.code.trim().toLowerCase() === code.trim().toLowerCase())
      .reduce((s, h) => s + Math.max(0, h.shares) * Math.max(0, h.cost), 0);
    return total;
  });
  const fundMap = new Map<string, number>();
  for (const fp of fundPositions) {
    if (Number.isFinite(fp.holdingAmount) && fp.holdingAmount > 0) {
      fundMap.set(fp.code, fp.holdingAmount);
    }
  }
  const fundWeights = fundHoldings.map((h) => fundMap.get(h.code) ?? 0);
  const allWeights = [...stockWeights, ...fundWeights].filter((v) => v > 0);
  allWeights.sort((a, b) => b - a);
  return allWeights;
}

function calcConcentration(holdings: StockHoldingConfig[], fundHoldings: FundHoldingConfig[] = [], fundPositions: FundPosition[] = []): number {
  const weights = calcPortfolioWeights(holdings, fundHoldings, fundPositions);
  const n = weights.length;
  if (n === 0) return 0;
  if (n === 1) return 100;
  const totalValue = weights.reduce((s, v) => s + v, 0);
  if (totalValue <= 0) return 0;
  const top3Weight = weights.slice(0, 3).reduce((s, v) => s + v, 0);
  return score(top3Weight / totalValue, 0.3, 0.9);
}

function calcTop3Weight(holdings: StockHoldingConfig[], fundHoldings: FundHoldingConfig[] = [], fundPositions: FundPosition[] = []): number {
  const weights = calcPortfolioWeights(holdings, fundHoldings, fundPositions);
  const totalValue = weights.reduce((s, v) => s + v, 0);
  return totalValue > 0 ? weights.slice(0, 3).reduce((s, v) => s + v, 0) / totalValue : 0;
}

function calcFundWeight(holdings: StockHoldingConfig[], fundHoldings: FundHoldingConfig[], fundPositions: FundPosition[]): number {
  const stockTotal = dedupStockCodes(holdings).reduce((s, code) => {
    const total = holdings
      .filter((h) => h.code.trim().toLowerCase() === code.trim().toLowerCase())
      .reduce((sum, h) => sum + Math.max(0, h.shares) * Math.max(0, h.cost), 0);
    return s + total;
  }, 0);
  const fundTotal = fundPositions.reduce((s, fp) => s + (Number.isFinite(fp.holdingAmount) ? fp.holdingAmount : 0), 0);
  const totalValue = stockTotal + fundTotal;
  return totalValue > 0 ? fundTotal / totalValue : 0;
}

function calcTurnover(trades: StockTradeRecord[]): number {
  if (trades.length === 0) return 0;
  const dates = trades.map((t) => t.date).filter(Boolean);
  if (dates.length === 0) return 0;
  dates.sort();
  const first = new Date(dates[0]);
  const last = new Date(dates[dates.length - 1]);
  const months = Math.max(1, (last.getTime() - first.getTime()) / (30 * 24 * 3600 * 1000));
  const monthlyTrades = trades.length / months;
  return score(monthlyTrades, 0, 8);
}

function calcMonthlyTrades(trades: StockTradeRecord[]): number {
  if (trades.length === 0) return 0;
  const dates = trades.map((t) => t.date).filter(Boolean);
  if (dates.length === 0) return 0;
  dates.sort();
  const first = new Date(dates[0]);
  const last = new Date(dates[dates.length - 1]);
  const months = Math.max(1, (last.getTime() - first.getTime()) / (30 * 24 * 3600 * 1000));
  return Math.round((trades.length / months) * 10) / 10;
}

function calcHoldingPeriod(trades: StockTradeRecord[]): { score: number; avgDays: number } {
  if (trades.length < 2) return { score: 0, avgDays: 0 };
  const dates = trades.map((t) => t.date).filter(Boolean).sort();
  if (dates.length < 2) return { score: 0, avgDays: 0 };
  const first = new Date(dates[0]);
  const last = new Date(dates[dates.length - 1]);
  const avgDays = (last.getTime() - first.getTime()) / (dates.length * 24 * 3600 * 1000);
  return { score: score(avgDays, 3, 180), avgDays: Math.round(avgDays) };
}

function calcWinRate(trades: StockTradeRecord[]): { score: number; rate: number; avgProfit: number; avgLoss: number } {
  const sells = trades.filter((t) => t.type === 'sell');
  if (sells.length < MIN_TRADES_FOR_STATS) return { score: 0, rate: 0, avgProfit: 0, avgLoss: 0 };
  let wins = 0;
  let totalProfit = 0;
  let totalLoss = 0;
  let winCount = 0;
  let lossCount = 0;
  const sorted = [...trades].sort((a, b) => a.date.localeCompare(b.date));
  const positions: Array<{ shares: number; cost: number }> = [];
  for (const t of sorted) {
    if (t.type === 'buy') {
      positions.push({ shares: t.shares, cost: t.price });
    } else if (t.type === 'sell') {
      let remaining = t.shares;
      let sellProceeds = 0;
      let sellCost = 0;
      while (remaining > 0 && positions.length > 0) {
        const lot = positions[0];
        const qty = Math.min(remaining, lot.shares);
        sellProceeds += qty * t.price;
        sellCost += qty * lot.cost;
        lot.shares -= qty;
        remaining -= qty;
        if (lot.shares <= 0) positions.shift();
      }
      const profit = sellProceeds - sellCost;
      if (profit > 0) {
        wins++;
        totalProfit += profit;
        winCount++;
      } else if (profit < 0) {
        totalLoss += Math.abs(profit);
        lossCount++;
      }
    }
  }
  const rate = sells.length > 0 ? wins / sells.length : 0;
  const score = Math.round(rate * 100);
  return {
    score,
    rate,
    avgProfit: winCount > 0 ? Math.round((totalProfit / winCount) * 100) / 100 : 0,
    avgLoss: lossCount > 0 ? Math.round((totalLoss / lossCount) * 100) / 100 : 0,
  };
}

function calcProfitLossRatio(avgProfit: number, avgLoss: number): number {
  if (avgLoss <= 0) return avgProfit > 0 ? 100 : 0;
  return score(avgProfit / avgLoss, 0.5, 3);
}

function calcRiskAppetite(volatilities: number[]): number {
  if (volatilities.length === 0) return 0;
  const avgVol = volatilities.reduce((s, v) => s + v, 0) / volatilities.length;
  return score(avgVol * 100, 10, 50);
}

function avgAnnualVolatility(volatilities: number[]): number {
  if (volatilities.length === 0) return 0;
  return Math.round(volatilities.reduce((s, v) => s + v, 0) / volatilities.length * 10000) / 100;
}

function determineLabel(d: StyleDimensions): string {
  if (d.concentration > 70 && d.turnover > 60 && d.riskAppetite > 70) return '激进型';
  if (d.holdPeriod > 70 && d.turnover < 40) return '价值投资型';
  if (d.turnover >= 40 && d.turnover <= 70 && d.winRate >= 40 && d.winRate <= 60) return '趋势跟随型';
  if (d.concentration < 40 && d.riskAppetite < 40) return '稳健型';
  return '均衡型';
}

function generateDescription(label: string, dp: StyleDataPoints): string {
  const assetStr = dp.fundCount > 0 ? `${dp.stockCount} 只股票 + ${dp.fundCount} 只基金` : `${dp.stockCount} 只股票`;
  const fundNote = dp.fundWeight > 0.01 ? `基金占 ${(dp.fundWeight * 100).toFixed(0)}% 仓位。` : '';
  const pnlNote = dp.totalPnl !== 0
    ? `累计盈亏 ${dp.totalPnl >= 0 ? '+' : ''}${dp.totalPnl.toFixed(0)}（已实现 ${dp.realizedPnl >= 0 ? '+' : ''}${dp.realizedPnl.toFixed(0)}）。`
    : '';
  const lines: string[] = [];
  if (label === '激进型') {
    lines.push(`持仓高度集中（前3大占 ${(dp.top3Weight * 100).toFixed(0)}%），交易频繁（月均 ${dp.monthlyTrades} 笔），偏好高波动标的。${fundNote}`);
    lines.push(dp.winRate > 0.5 ? '高换手中保持不错胜率，但需警惕集中风险。' : '高波动+高换手率组合风险较大，建议适度分散。');
  } else if (label === '价值投资型') {
    lines.push(`持股周期长（均 ${dp.avgHoldDays} 天），交易频率低（月均 ${dp.monthlyTrades} 笔），不追逐短期波动。${fundNote}`);
    lines.push(dp.winRate > 0.6 ? '耐心持有带来了较高的胜率，继续坚守能力圈。' : '选股眼光需要时间验证，保持耐心。');
  } else if (label === '趋势跟随型') {
    lines.push(`换手率适中（月均 ${dp.monthlyTrades} 笔），跟随市场节奏调整仓位，兼具灵活性和纪律性。${fundNote}`);
    lines.push(dp.winRate > 0.5 ? '趋势判断整体在线，注意避免追涨杀跌。' : '趋势策略当前胜率平平，可考虑优化进出场信号。');
  } else if (label === '稳健型') {
    lines.push(`持仓 ${assetStr}，偏好低波动、高确定性品种，风险控制意识强。${fundNote}`);
    lines.push('稳健风格适合长期复利积累，可适度增加优质标的提升收益弹性。');
  } else {
    lines.push(`持仓 ${assetStr}，各项指标处于均衡区间，没有极端偏好。${fundNote}`);
    lines.push('均衡风格攻守兼备，可尝试在某些维度刻意倾斜以获得风格溢价。');
  }
  if (pnlNote) lines.push(pnlNote);
  return lines.join('\n');
}

export function calcStyleProfile(
  holdings: StockHoldingConfig[],
  allTrades: Record<string, StockTradeRecord[]>,
  closePricesByCode: Record<string, number[]>,
  fundHoldings: FundHoldingConfig[] = [],
  fundPositions: FundPosition[] = [],
  floatingPnl = 0,
): StyleProfile | null {
  if (holdings.length === 0 && fundHoldings.length === 0) return null;

  const allTradesList = Object.values(allTrades).flat();
  const concentration = calcConcentration(holdings, fundHoldings, fundPositions);
  const top3Weight = calcTop3Weight(holdings, fundHoldings, fundPositions);
  const fundWeight = calcFundWeight(holdings, fundHoldings, fundPositions);
  const turnover = calcTurnover(allTradesList);
  const monthlyTrades = calcMonthlyTrades(allTradesList);
  const { score: holdPeriodScore, avgDays } = calcHoldingPeriod(allTradesList);

  let winRateScore = 0;
  let winRate = 0;
  let avgProfit = 0;
  let avgLoss = 0;
  // 汇总全部持仓的交易记录计算胜率/盈亏比
  const allTradesForHeld = Object.values(allTrades).flat();
  const wr = calcWinRate(allTradesForHeld);
  winRateScore = wr.score;
  winRate = wr.rate;
  avgProfit = wr.avgProfit;
  avgLoss = wr.avgLoss;

  const profitLossRatio = calcProfitLossRatio(avgProfit, avgLoss);

  const heldCodes = [...new Map(holdings.map((h) => [h.code.trim().toLowerCase(), h.code])).keys()];
  const volatilities: number[] = [];
  for (const code of heldCodes) {
    const closes = closePricesByCode[code];
    if (closes && closes.length >= 3) {
      const vr = calcVolatility(closes);
      if (vr) volatilities.push(vr.annualizedVolatility);
    }
  }
  const riskAppetite = calcRiskAppetite(volatilities);

  let realizedPnl = 0;
  for (const trades of Object.values(allTrades)) {
    realizedPnl += computePositionFromTrades(trades).realizedPnl;
  }
  const totalPnl = Math.round((realizedPnl + floatingPnl) * 100) / 100;

  const dimensions: StyleDimensions = {
    concentration,
    turnover,
    holdPeriod: holdPeriodScore,
    winRate: winRateScore,
    profitLossRatio,
    riskAppetite,
  };

  const dataPoints: StyleDataPoints = {
    stockCount: dedupStockCodes(holdings).length,
    fundCount: fundHoldings.length,
    top3Weight,
    fundWeight,
    monthlyTrades,
    avgHoldDays: avgDays,
    winRate,
    realizedPnl: Math.round(realizedPnl * 100) / 100,
    totalPnl: Math.round(totalPnl * 100) / 100,
    avgAnnualVolatility: avgAnnualVolatility(volatilities),
  };

  const label = determineLabel(dimensions);
  const description = generateDescription(label, dataPoints);

  return {
    dimensions,
    label,
    description,
    dataPoints,
    calculatedAt: Date.now(),
  };
}

export async function loadCachedStyleProfile(): Promise<StyleProfile | null> {
  try {
    const result = await chrome.storage.local.get(STYLE_CACHE_KEY);
    const raw = result[STYLE_CACHE_KEY] as StyleProfile | undefined;
    if (!raw?.dimensions) return null;
    raw.dataPoints = {
      stockCount: raw.dataPoints.stockCount ?? 0,
      fundCount: (raw.dataPoints as Record<string, number>).fundCount ?? 0,
      top3Weight: raw.dataPoints.top3Weight ?? 0,
      fundWeight: (raw.dataPoints as Record<string, number>).fundWeight ?? 0,
      monthlyTrades: raw.dataPoints.monthlyTrades ?? 0,
      avgHoldDays: raw.dataPoints.avgHoldDays ?? 0,
      winRate: raw.dataPoints.winRate ?? 0,
      realizedPnl: (raw.dataPoints as Record<string, number>).realizedPnl ?? 0,
      totalPnl: (raw.dataPoints as Record<string, number>).totalPnl ?? 0,
      avgAnnualVolatility: raw.dataPoints.avgAnnualVolatility ?? 0,
    };
    return raw;
  } catch {
    return null;
  }
}

export async function saveStyleProfileCache(profile: StyleProfile): Promise<void> {
  try {
    await chrome.storage.local.set({ [STYLE_CACHE_KEY]: profile, [STYLE_LAST_CALC_KEY]: Date.now() });
  } catch {
    // best effort
  }
}

export async function shouldRecalcStyle(): Promise<boolean> {
  try {
    const result = await chrome.storage.local.get(STYLE_LAST_CALC_KEY);
    const lastCalc = (result[STYLE_LAST_CALC_KEY] as number) ?? 0;
    if (Date.now() - lastCalc > STYLE_CACHE_TTL_MS) return true;
    const profile = await loadCachedStyleProfile();
    if (!profile) return true;
    return false;
  } catch {
    return true;
  }
}
