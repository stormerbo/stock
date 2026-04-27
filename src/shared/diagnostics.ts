// -----------------------------------------------------------
// Portfolio diagnostics — concentration, attribution, risk score
// -----------------------------------------------------------

import { guessSector } from './sector-map';
import type { StockPosition, FundPosition } from './fetch';

// ---- Types ----

export type ConcentrationRisk = {
  topHoldings: Array<{
    code: string;
    name: string;
    marketValue: number;
    ratio: number;
  }>;
  maxSingleRatio: number;
  maxSingleName: string;
  top3Ratio: number;
  warnings: string[];
};

export type SectorAllocation = {
  sectors: Array<{
    name: string;
    marketValue: number;
    ratio: number;
    stocks: Array<{ code: string; name: string }>;
  }>;
  unknownCount: number;
};

export type PnlAttribution = {
  topGainers: Array<{ code: string; name: string; pnl: number }>;
  topLosers: Array<{ code: string; name: string; pnl: number }>;
  largestDailyImpact: Array<{ code: string; name: string; dailyPnl: number }>;
};

export type RiskScore = {
  overall: number;
  concentrationScore: number;
  details: string[];
};

export type DiagnosticResult = {
  concentration: ConcentrationRisk;
  sectorAllocation: SectorAllocation;
  pnlAttribution: PnlAttribution;
  riskScore: RiskScore;
};

// ---- Concentration ----

export function calcConcentration(
  stockPositions: StockPosition[],
  fundPositions: FundPosition[]
): ConcentrationRisk {
  const items: Array<{ code: string; name: string; marketValue: number }> = [];

  for (const sp of stockPositions) {
    if (sp.shares > 0 && Number.isFinite(sp.price)) {
      items.push({ code: sp.code, name: sp.name, marketValue: sp.shares * sp.price });
    }
  }

  for (const fp of fundPositions) {
    if (fp.units > 0 && Number.isFinite(fp.latestNav)) {
      items.push({ code: fp.code, name: fp.name, marketValue: fp.units * fp.latestNav });
    }
  }

  const totalValue = items.reduce((s, i) => s + i.marketValue, 0);
  const sorted = [...items].sort((a, b) => b.marketValue - a.marketValue);

  const topHoldings = sorted.slice(0, 5).map(i => ({
    code: i.code,
    name: i.name,
    marketValue: i.marketValue,
    ratio: totalValue > 0 ? (i.marketValue / totalValue) * 100 : 0,
  }));

  const maxSingle = topHoldings[0];
  const top3 = topHoldings.slice(0, 3);
  const top3Ratio = top3.reduce((s, i) => s + i.ratio, 0);

  const warnings: string[] = [];
  if (maxSingle && maxSingle.ratio > 20) {
    warnings.push(`${maxSingle.name} 占比 ${maxSingle.ratio.toFixed(1)}%，超过 20% 阈值`);
  }
  if (top3Ratio > 60) {
    warnings.push(`前 3 大持仓合计占比 ${top3Ratio.toFixed(1)}%，持仓集中度较高`);
  }

  return {
    topHoldings,
    maxSingleRatio: maxSingle?.ratio ?? 0,
    maxSingleName: maxSingle?.name ?? '',
    top3Ratio,
    warnings,
  };
}

// ---- Sector Allocation ----

export function calcSectorAllocation(
  stockPositions: StockPosition[]
): SectorAllocation {
  const sectorMap = new Map<string, { marketValue: number; stocks: Array<{ code: string; name: string }> }>();

  for (const sp of stockPositions) {
    if (!(sp.shares > 0 && Number.isFinite(sp.price))) continue;
    const sector = guessSector(sp.code, sp.name);
    const existing = sectorMap.get(sector);
    const marketValue = sp.shares * sp.price;
    if (existing) {
      existing.marketValue += marketValue;
      existing.stocks.push({ code: sp.code, name: sp.name });
    } else {
      sectorMap.set(sector, { marketValue, stocks: [{ code: sp.code, name: sp.name }] });
    }
  }

  const totalValue = Array.from(sectorMap.values()).reduce((s, v) => s + v.marketValue, 0);
  const sectors = Array.from(sectorMap.entries())
    .map(([name, data]) => ({
      name,
      marketValue: data.marketValue,
      ratio: totalValue > 0 ? (data.marketValue / totalValue) * 100 : 0,
      stocks: data.stocks,
    }))
    .sort((a, b) => b.ratio - a.ratio);

  return {
    sectors,
    unknownCount: sectors.filter(s => s.name === '其他').reduce((c, s) => c + s.stocks.length, 0),
  };
}

// ---- P&L Attribution ----

export function calcPnlAttribution(
  stockPositions: StockPosition[],
  fundPositions: FundPosition[]
): PnlAttribution {
  const allPositions: Array<{ code: string; name: string; pnl: number; dailyPnl: number }> = [
    ...stockPositions.map(sp => ({
      code: sp.code,
      name: sp.name,
      pnl: sp.floatingPnl,
      dailyPnl: sp.dailyPnl,
    })),
    ...fundPositions.map(fp => ({
      code: fp.code,
      name: fp.name,
      pnl: fp.holdingProfit,
      dailyPnl: fp.estimatedProfit,
    })),
  ];

  const sorted = [...allPositions].sort((a, b) => b.pnl - a.pnl);
  const byDaily = [...allPositions].sort((a, b) => Math.abs(b.dailyPnl) - Math.abs(a.dailyPnl));

  return {
    topGainers: sorted.filter(i => i.pnl >= 0).slice(0, 3),
    topLosers: sorted.filter(i => i.pnl < 0).reverse().slice(0, 3),
    largestDailyImpact: byDaily.slice(0, 3),
  };
}

// ---- Risk Score ----

export function calcRiskScore(concentration: ConcentrationRisk): RiskScore {
  let concentrationScore = 0;

  // Concentration score (0-40)
  if (concentration.maxSingleRatio > 20) {
    concentrationScore = Math.min(40, (concentration.maxSingleRatio - 20) * 2);
  }
  if (concentration.top3Ratio > 60) {
    concentrationScore += 10;
  }

  const overall = Math.min(100, concentrationScore);

  const details: string[] = [];
  if (concentrationScore > 20) {
    details.push(`集中度过高（${concentrationScore.toFixed(0)}分）：最大持仓 ${concentration.maxSingleName} 占比 ${concentration.maxSingleRatio.toFixed(1)}%`);
  } else if (concentrationScore > 0) {
    details.push(`集中度适中（${concentrationScore.toFixed(0)}分）：建议关注单只持仓比例`);
  } else {
    details.push('集中度良好：持仓分布较为分散');
  }

  return {
    overall,
    concentrationScore,
    details,
  };
}

// ---- Main diagnostic ----

export function calcDiagnostics(
  stockPositions: StockPosition[],
  fundPositions: FundPosition[]
): DiagnosticResult {
  const concentration = calcConcentration(stockPositions, fundPositions);
  const sectorAllocation = calcSectorAllocation(stockPositions);
  const pnlAttribution = calcPnlAttribution(stockPositions, fundPositions);
  const riskScore = calcRiskScore(concentration);

  return {
    concentration,
    sectorAllocation,
    pnlAttribution,
    riskScore,
  };
}
