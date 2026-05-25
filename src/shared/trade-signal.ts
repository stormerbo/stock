import { calcMA, calcMACD, calcSAR, calcMOM, fetchDayFqKline, type KlinePoint, type MacdResult } from './technical-analysis';
import { calcMaxDrawdown, calcVolatility } from './risk-metrics';

export type TradeSignal = {
  code: string;
  name: string;
  score: number;
  label: string;
  level: 'strong_buy' | 'buy' | 'hold' | 'reduce' | 'avoid';
  reasons: string[];
  details: {
    trendScore: number;
    momentumScore: number;
    riskScore: number;
    supportScore: number;
    price: number;
    ma5: number | null;
    ma10: number | null;
    ma20: number | null;
    ma60: number | null;
    macdSignal: string;
    volPct: number;
    drawdownPct: number;
  };
  calculatedAt: number;
};

const SIGNAL_CACHE_KEY = 'tradeSignals';
const SIGNAL_LAST_CALC_KEY = '_lastTradeSignalTime';
const SIGNAL_CACHE_TTL_MS = 4 * 60 * 60 * 1000;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function last<T>(arr: T[]): T | undefined { return arr[arr.length - 1]; }

function levelInfo(score: number): TradeSignal['level'] {
  if (score >= 80) return 'strong_buy';
  if (score >= 60) return 'buy';
  if (score >= 40) return 'hold';
  if (score >= 20) return 'reduce';
  return 'avoid';
}

export function levelLabel(level: TradeSignal['level']): string {
  switch (level) {
    case 'strong_buy': return '建议加仓';
    case 'buy': return '建议建仓';
    case 'hold': return '继续持有';
    case 'reduce': return '建议减仓';
    case 'avoid': return '建议观望';
  }
}

export function levelColor(level: TradeSignal['level']): string {
  switch (level) {
    case 'strong_buy': return '#22c55e';
    case 'buy': return '#4ade80';
    case 'hold': return '#facc15';
    case 'reduce': return '#f97316';
    case 'avoid': return '#ef4444';
  }
}

function calcTrendScore(kline: KlinePoint[]): { score: number; ma5: number | null; ma10: number | null; ma20: number | null; ma60: number | null } {
  const closes = kline.map((k) => k.close);
  const ma5 = calcMA(closes, 5);
  const ma10 = calcMA(closes, 10);
  const ma20 = calcMA(closes, 20);
  const ma60 = calcMA(closes, 60);

  const ma5Last = last(ma5);
  const ma10Last = last(ma10);
  const ma20Last = last(ma20);
  const ma60Last = last(ma60);

  let score = 50;
  const reasons: string[] = [];

  if (ma5Last != null && ma10Last != null && ma20Last != null && ma60Last != null) {
    if (ma5Last > ma10Last && ma10Last > ma20Last && ma20Last > ma60Last) {
      score = 90;
    } else if (ma5Last > ma10Last && ma10Last > ma20Last) {
      score = 75;
    } else if (ma5Last > ma20Last) {
      score = 60;
    } else if (ma5Last < ma20Last && ma10Last < ma20Last) {
      score = 30;
    }
    if (ma5Last < ma10Last && ma10Last < ma20Last && ma20Last < ma60Last) {
      score = 10;
    }
  }

  return { score, ma5: ma5Last ?? null, ma10: ma10Last ?? null, ma20: ma20Last ?? null, ma60: ma60Last ?? null };
}

function calcMomentumScore(kline: KlinePoint[]): { score: number; macdSignal: string } {
  const closes = kline.map((k) => k.close);
  const highs = kline.map((k) => k.high);
  const lows = kline.map((k) => k.low);

  let score = 50;
  let macdLabel = '中性';

  if (closes.length < 26) return { score, macdSignal: '数据不足' };

  const macd = calcMACD(closes);
  const mom = calcMOM(closes, 10);

  const difLast = last(macd.dif);
  const deaLast = last(macd.dea);
  const macdLast = last(macd.macd);
  const momLast = last(mom);

  if (difLast != null && deaLast != null && macdLast != null) {
    const difPrev = macd.dif[macd.dif.length - 2];
    if (difLast > deaLast && difPrev != null && difPrev <= (macd.dea[macd.dea.length - 2] ?? 0)) {
      score += 20;
      macdLabel = '金叉';
    } else if (difLast < deaLast && difPrev != null && difPrev >= (macd.dea[macd.dea.length - 2] ?? 0)) {
      score -= 20;
      macdLabel = '死叉';
    } else if (difLast > deaLast) {
      score += 10;
      macdLabel = '多头';
    } else {
      score -= 10;
      macdLabel = '空头';
    }

    if (macdLast > 0) score += 5;
    else score -= 5;
  }

  if (momLast != null) {
    if (momLast > 0) score += 5;
    else score -= 5;
  }

  return { score: clamp(score, 0, 100), macdSignal: macdLabel };
}

function calcRiskScore(kline: KlinePoint[]): { score: number; drawdownPct: number; volPct: number } {
  const closes = kline.map((k) => k.close);

  let drawdownPct = 0;
  let volPct = 0;
  let score = 50;

  const dd = calcMaxDrawdown(closes, closes.map((_, i) => String(i)));
  if (dd) drawdownPct = Math.abs(dd.maxDrawdown) * 100;

  const vol = calcVolatility(closes);
  if (vol) volPct = vol.annualizedVolatility * 100;

  if (drawdownPct < 10) score += 15;
  else if (drawdownPct > 30) score -= 20;
  else if (drawdownPct > 20) score -= 10;

  if (volPct < 25) score += 10;
  else if (volPct > 50) score -= 15;
  else if (volPct > 35) score -= 5;

  return { score: clamp(score, 0, 100), drawdownPct, volPct };
}

function calcSupportScore(kline: KlinePoint[], currentPrice: number): number {
  const highs = kline.map((k) => k.high);
  const lows = kline.map((k) => k.low);
  const closes = kline.map((k) => k.close);

  const sar = calcSAR(highs, lows, closes);
  const sarLast = last(sar);

  let score = 50;

  if (sarLast != null && currentPrice > 0) {
    const dist = (currentPrice - sarLast) / currentPrice;
    if (dist > 0.05) score += 15;
    else if (dist > 0.02) score += 5;
    else if (dist < -0.05) score -= 20;
    else if (dist < -0.02) score -= 10;
  }

  return clamp(score, 0, 100);
}

function generateReasons(signal: TradeSignal): string[] {
  const reasons: string[] = [];
  const d = signal.details;

  if (d.trendScore >= 75) reasons.push('均线多头排列，趋势向上');
  else if (d.trendScore <= 30) reasons.push('均线空头排列，趋势向下');

  if (d.macdSignal === '金叉') reasons.push('MACD 金叉，短期动能转强');
  else if (d.macdSignal === '死叉') reasons.push('MACD 死叉，短期动能减弱');
  else if (d.macdSignal === '多头') reasons.push('MACD 处于多头区间');
  else if (d.macdSignal === '空头') reasons.push('MACD 处于空头区间');

  if (d.drawdownPct > 25) reasons.push(`最大回撤 ${d.drawdownPct.toFixed(0)}%，风险较高`);
  if (d.volPct > 45) reasons.push(`波动率 ${d.volPct.toFixed(0)}%，波动较大`);

  if (d.ma20 != null && d.price < d.ma20) reasons.push('股价位于 MA20 下方');

  if (reasons.length === 0) reasons.push('各项指标中性，方向不明确');
  return reasons;
}

export function calcTradeSignal(code: string, name: string, kline: KlinePoint[], currentPrice: number): TradeSignal | null {
  if (kline.length < 30 || !Number.isFinite(currentPrice) || currentPrice <= 0) return null;

  const trend = calcTrendScore(kline);
  const momentum = calcMomentumScore(kline);
  const risk = calcRiskScore(kline);
  const support = calcSupportScore(kline, currentPrice);

  const totalScore = Math.round(
    trend.score * 0.40 + momentum.score * 0.30 + risk.score * 0.15 + support * 0.15,
  );

  const level = levelInfo(totalScore);
  const label = levelLabel(level);

  const signal: TradeSignal = {
    code,
    name,
    score: totalScore,
    label,
    level,
    reasons: [],
    details: {
      trendScore: trend.score,
      momentumScore: momentum.score,
      riskScore: risk.score,
      supportScore: support,
      price: currentPrice,
      ma5: trend.ma5,
      ma10: trend.ma10,
      ma20: trend.ma20,
      ma60: trend.ma60,
      macdSignal: momentum.macdSignal,
      volPct: risk.volPct,
      drawdownPct: risk.drawdownPct,
    },
    calculatedAt: Date.now(),
  };

  signal.reasons = generateReasons(signal);
  return signal;
}

export async function calcAllTradeSignals(
  holdings: Array<{ code: string; name: string }>,
  currentPrices: Record<string, number>,
): Promise<TradeSignal[]> {
  const results: TradeSignal[] = [];
  for (const h of holdings) {
    const price = currentPrices[h.code];
    if (!Number.isFinite(price) || price <= 0) continue;
    try {
      const kline = await fetchDayFqKline(h.code, 120);
      const signal = calcTradeSignal(h.code, h.name, kline, price);
      if (signal) results.push(signal);
    } catch {
      // skip
    }
  }
  return results;
}

export async function loadCachedTradeSignals(): Promise<TradeSignal[]> {
  try {
    const result = await chrome.storage.local.get(SIGNAL_CACHE_KEY);
    return (result[SIGNAL_CACHE_KEY] as TradeSignal[]) ?? [];
  } catch {
    return [];
  }
}

export async function saveTradeSignalsCache(signals: TradeSignal[]): Promise<void> {
  try {
    await chrome.storage.local.set({ [SIGNAL_CACHE_KEY]: signals, [SIGNAL_LAST_CALC_KEY]: Date.now() });
  } catch {
    // best effort
  }
}

export async function shouldRecalcTradeSignals(): Promise<boolean> {
  try {
    const result = await chrome.storage.local.get(SIGNAL_LAST_CALC_KEY);
    const lastCalc = (result[SIGNAL_LAST_CALC_KEY] as number) ?? 0;
    return Date.now() - lastCalc > SIGNAL_CACHE_TTL_MS;
  } catch {
    return true;
  }
}
