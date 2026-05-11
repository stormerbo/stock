// -----------------------------------------------------------
// 综合评分与评级系统 — 纯计算模块
// -----------------------------------------------------------

import {
  calcMA,
  calcMACD,
  detectMacdSignal,
  getMacdSummary,
  calcRSI,
  calcKDJ,
  calcBollinger,
  type KlinePoint,
} from './technical-analysis';
import {
  isFundamentalDataValid,
  type FundamentalData,
} from './fundamentals';
import {
  type MaxDrawdownResult,
  type VolatilityResult,
} from './risk-metrics';

// ---- 类型定义 ----

export type ScoreInput = {
  kline: KlinePoint[];
  fundamentals: FundamentalData;
  maxDrawdown: MaxDrawdownResult | null;
  volatility: VolatilityResult | null;
  suspended?: boolean;
};

export type ScoreBreakdown = {
  macd: number;
  maAlignment: number;
  rsi: number;
  volume: number;
  kdj: number;
  bollinger: number;
  pe: number;
  roe: number;
  profitGrowth: number;
  dividendYield: number;
  volatility: number;
  drawdown: number;
};

export type StockScoreResult = {
  totalScore: number;
  rating: 'S' | 'A' | 'B' | 'C' | 'D';
  dimensions: {
    technical: number;
    fundamental: number;
    risk: number;
  };
  breakdown: ScoreBreakdown;
  warnings: string[];
};

// ---- 辅助函数 ----

function lastValid<T>(arr: Array<T | null>): T | null {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i] !== null && arr[i] !== undefined) return arr[i];
  }
  return null;
}

function clampScore(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}

// ---- 技术面子指标 ----

function scoreMacd(closes: number[]): number {
  if (closes.length < 26) return 50;
  const macd = calcMACD(closes);
  const signal = detectMacdSignal(macd);
  const summary = getMacdSummary(macd);

  let score = 50;
  if (signal === 'golden_cross') {
    score = 90;
  } else if (signal === 'death_cross') {
    score = 10;
  } else if (summary.dif !== null && summary.dea !== null) {
    score = summary.dif > summary.dea ? 60 : 40;
  }

  // 柱状图修正
  if (summary.macd !== null && summary.macd > 0) score = Math.min(100, score + 5);
  if (summary.macd !== null && summary.macd < 0) score = Math.max(0, score - 5);

  return clampScore(score);
}

function scoreMaAlignment(closes: number[]): number {
  const ma5 = lastValid(calcMA(closes, 5));
  const ma10 = lastValid(calcMA(closes, 10));
  const ma20 = lastValid(calcMA(closes, 20));

  if (ma5 === null || ma10 === null || ma20 === null) return 50;

  if (ma5 > ma10 && ma10 > ma20) return 90;
  if (ma5 < ma10 && ma10 < ma20) return 10;

  // 部分缠绕
  const deviations = [Math.abs(ma5 - ma10), Math.abs(ma10 - ma20), Math.abs(ma5 - ma20)];
  const maxDev = Math.max(...deviations);
  const avgMA = (ma5 + ma10 + ma20) / 3;
  if (avgMA > 0 && maxDev / avgMA < 0.02) return 50; // 紧密缠绕
  return 50;
}

function scoreRsi(closes: number[]): number {
  const rsiArr = calcRSI(closes, 14);
  const rsi = lastValid(rsiArr);
  if (rsi === null) return 50;

  if (rsi >= 30 && rsi < 40) return 80;
  if (rsi >= 40 && rsi < 60) return 60;
  if (rsi >= 60 && rsi < 70) return 40;
  if (rsi >= 70) return 20;
  if (rsi < 30) return 70;
  return 50;
}

function scoreVolume(kline: KlinePoint[]): number {
  if (kline.length < 6) return 50;
  const volumes = kline.map((k) => k.volume);
  const ma5Arr = calcMA(volumes, 5);
  const ma5 = lastValid(ma5Arr);
  if (ma5 === null || ma5 === 0) return 50;

  const latest = kline[kline.length - 1];
  const ratio = latest.volume / ma5;
  const isUp = latest.close >= latest.open;

  if (ratio > 1.5) return isUp ? 80 : 20;
  if (ratio < 0.5) return 20;
  return 50;
}

function scoreKdj(highs: number[], lows: number[], closes: number[]): number {
  if (closes.length < 9) return 50;
  const kdj = calcKDJ(highs, lows, closes);
  const kNow = lastValid(kdj.k);
  const dNow = lastValid(kdj.d);

  if (kNow === null || dNow === null) return 50;

  // 检查金叉/死叉：最近两天 K-D 关系变化
  const kPrev = kdj.k.length >= 2 ? kdj.k[kdj.k.length - 2] : null;
  const dPrev = kdj.d.length >= 2 ? kdj.d[kdj.d.length - 2] : null;

  if (kPrev !== null && dPrev !== null) {
    if (kPrev <= dPrev && kNow > dNow) return 90; // 金叉
    if (kPrev >= dPrev && kNow < dNow) return 10; // 死叉
  }

  if (kNow < 20) return 80;
  if (kNow >= 20 && kNow < 40) return 70;
  if (kNow >= 40 && kNow < 60) return 55;
  if (kNow >= 60 && kNow < 80) return 40;
  return 20; // K >= 80
}

function scoreBollinger(closes: number[]): number {
  if (closes.length < 20) return 50;
  const boll = calcBollinger(closes);
  const upper = lastValid(boll.upper);
  const middle = lastValid(boll.middle);
  const lower = lastValid(boll.lower);
  if (upper === null || middle === null || lower === null) return 50;

  const close = closes[closes.length - 1];
  if (close > upper) return 30;

  const range = upper - lower;
  if (range <= 0) return 50;
  const pos = (close - lower) / range;

  if (pos < 0.1) return 80;
  if (pos >= 0.1 && pos < 0.4) return 65;
  if (pos >= 0.4 && pos < 0.6) return 60;
  if (pos >= 0.6 && pos < 0.9) return 40;
  return 20; // pos >= 0.9
}

// ---- 基本面子指标 ----

function scorePE(peTtm: number): number {
  if (!Number.isFinite(peTtm)) return 50;
  if (peTtm < 0) return 50;
  if (peTtm < 15) return 90;
  if (peTtm < 25) return 70;
  if (peTtm < 40) return 50;
  if (peTtm < 80) return 30;
  return 10;
}

function scoreROE(roe: number): number {
  if (!Number.isFinite(roe)) return 50;
  if (roe > 20) return 90;
  if (roe > 15) return 80;
  if (roe > 10) return 60;
  if (roe > 5) return 40;
  if (roe > 0) return 20;
  return 10;
}

function scoreProfitGrowth(growth: number): number {
  if (!Number.isFinite(growth)) return 50;
  if (growth > 30) return 90;
  if (growth > 20) return 80;
  if (growth > 10) return 60;
  if (growth > 0) return 50;
  return 20;
}

function scoreDividendYield(yield_: number): number {
  if (!Number.isFinite(yield_)) return 50;
  if (yield_ > 4) return 90;
  if (yield_ > 2) return 70;
  if (yield_ > 1) return 50;
  return 30;
}

// ---- 风险面子指标 ----

function scoreVolatility(vol: VolatilityResult | null): number {
  if (!vol) return 50;
  const pct = vol.annualizedVolatility * 100;
  if (pct < 20) return 90;
  if (pct < 30) return 70;
  if (pct < 40) return 50;
  if (pct < 50) return 30;
  return 10;
}

function scoreDrawdown(dd: MaxDrawdownResult | null): number {
  if (!dd) return 50;
  const absDD = Math.abs(dd.maxDrawdown) * 100;
  if (absDD < 10) return 90;
  if (absDD < 20) return 70;
  if (absDD < 30) return 50;
  if (absDD < 40) return 30;
  return 10;
}

// ---- 评级映射 ----

function ratingFromScore(score: number): StockScoreResult['rating'] {
  if (score >= 85) return 'S';
  if (score >= 70) return 'A';
  if (score >= 55) return 'B';
  if (score >= 40) return 'C';
  return 'D';
}

// ---- 主编排函数 ----

export function computeStockScore(input: ScoreInput): StockScoreResult {
  const warnings: string[] = [];
  const { kline, fundamentals, maxDrawdown, volatility, suspended } = input;

  // 停牌
  if (suspended) {
    return {
      totalScore: 0,
      rating: 'D',
      dimensions: { technical: 0, fundamental: 0, risk: 0 },
      breakdown: {
        macd: 0, maAlignment: 0, rsi: 0, volume: 0, kdj: 0, bollinger: 0,
        pe: 0, roe: 0, profitGrowth: 0, dividendYield: 0,
        volatility: 0, drawdown: 0,
      },
      warnings: ['停牌'],
    };
  }

  // 权重调整
  let wTech = 0.50;
  let wFund = 0.30;
  let wRisk = 0.20;

  if (kline.length < 5) {
    // K线严重不足：技术面给 50，风险面给 50
    const techScore = 50;
    const riskScore = 50;
    const fundValid = isFundamentalDataValid(fundamentals);
    const fundScore = fundValid
      ? calcFundamentalScore(
          scorePE(fundamentals.peTtm),
          scoreROE(fundamentals.roe),
          scoreProfitGrowth(fundamentals.profitGrowth),
          scoreDividendYield(fundamentals.dividendYield),
        )
      : (warnings.push('基本面数据缺失'), 50);

    const totalScore = Math.round(techScore * wTech + fundScore * wFund + riskScore * wRisk);
    return {
      totalScore: clampScore(totalScore),
      rating: ratingFromScore(totalScore),
      dimensions: { technical: techScore, fundamental: fundScore, risk: riskScore },
      breakdown: {
        macd: 50, maAlignment: 50, rsi: 50, volume: 50, kdj: 50, bollinger: 50,
        pe: scorePE(fundamentals.peTtm),
        roe: scoreROE(fundamentals.roe),
        profitGrowth: scoreProfitGrowth(fundamentals.profitGrowth),
        dividendYield: scoreDividendYield(fundamentals.dividendYield),
        volatility: scoreVolatility(volatility),
        drawdown: scoreDrawdown(maxDrawdown),
      },
      warnings,
    };
  }

  if (kline.length < 30) {
    // 调整权重：技术面让出 20% 按原比例分配给基本面和风险面
    wTech = 0.30;
    wFund = 0.30 + 0.20 * (0.30 / (0.30 + 0.20)); // = 0.42
    wRisk = 0.20 + 0.20 * (0.20 / (0.30 + 0.20)); // = 0.28
  }

  // 提取数组
  const closes = kline.map((k) => k.close);
  const highs = kline.map((k) => k.high);
  const lows = kline.map((k) => k.low);

  // 技术面计算
  const macd = scoreMacd(closes);
  const maAlignment = scoreMaAlignment(closes);
  const rsi = scoreRsi(closes);
  const volume = scoreVolume(kline);
  const kdj = scoreKdj(highs, lows, closes);
  const bollinger = scoreBollinger(closes);

  const techScore = calcTechScore(macd, maAlignment, rsi, volume, kdj, bollinger);

  // 基本面计算
  const fundValid = isFundamentalDataValid(fundamentals);
  const pe = scorePE(fundamentals.peTtm);
  const roe = scoreROE(fundamentals.roe);
  const profitGrowth = scoreProfitGrowth(fundamentals.profitGrowth);
  const dividendYield = scoreDividendYield(fundamentals.dividendYield);

  const fundScore = fundValid
    ? calcFundamentalScore(pe, roe, profitGrowth, dividendYield)
    : (warnings.push('基本面数据缺失'), 50);

  // 风险面计算
  const volScore = scoreVolatility(volatility);
  const ddScore = scoreDrawdown(maxDrawdown);
  const riskScore = calcRiskScore(volScore, ddScore);

  const totalScore = Math.round(techScore * wTech + fundScore * wFund + riskScore * wRisk);

  return {
    totalScore: clampScore(totalScore),
    rating: ratingFromScore(totalScore),
    dimensions: { technical: clampScore(techScore), fundamental: clampScore(fundScore), risk: clampScore(riskScore) },
    breakdown: { macd, maAlignment, rsi, volume, kdj, bollinger, pe, roe, profitGrowth, dividendYield, volatility: volScore, drawdown: ddScore },
    warnings,
  };
}

// ---- 维度汇总 ----

function calcTechScore(macd: number, ma: number, rsi: number, vol: number, kdj: number, boll: number): number {
  // 权重：MACD 15%, MA 10%, RSI 10%, Volume 5%, KDJ 5%, Bollinger 5%
  // 在 50% 内部归一化
  const totalWeight = 15 + 10 + 10 + 5 + 5 + 5;
  return (macd * 15 + ma * 10 + rsi * 10 + vol * 5 + kdj * 5 + boll * 5) / totalWeight;
}

function calcFundamentalScore(pe: number, roe: number, profitGrowth: number, dividendYield: number): number {
  // 权重：PE 10%, ROE 8%, ProfitGrowth 7%, DividendYield 5%
  const totalWeight = 10 + 8 + 7 + 5;
  return (pe * 10 + roe * 8 + profitGrowth * 7 + dividendYield * 5) / totalWeight;
}

function calcRiskScore(volScore: number, ddScore: number): number {
  // 权重各 10%，在 20% 内部各占一半
  return (volScore + ddScore) / 2;
}
