import type { KlinePoint } from './technical-analysis.ts';

export type VolumePriceTag =
  | 'bull_confirmed'
  | 'bull_unconfirmed'
  | 'bear_confirmed'
  | 'bear_unconfirmed'
  | 'bearish_divergence'
  | 'bullish_divergence'
  | 'volatility_expansion'
  | 'trend_follow_through'
  | 'healthy_pullback';

export type VolumePriceSummary = 'bullish' | 'bearish' | 'neutral';
export type VolumePriceTone = 'positive' | 'negative' | 'info';

export type VolumePriceAssessment = {
  directionScore: number;
  riskScore: number;
  volumeRatio: number;
  atrExpansionRatio: number;
  obvBias: 'up' | 'down' | 'flat';
  priceBias: 'up' | 'down' | 'sideways';
  tags: VolumePriceTag[];
  summary: VolumePriceSummary;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function average(values: number[]): number {
  if (values.length === 0) return Number.NaN;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function calcMA(values: number[], period: number): Array<number | null> {
  const result: Array<number | null> = [];
  let rolling = 0;
  for (let index = 0; index < values.length; index += 1) {
    rolling += values[index];
    if (index >= period) rolling -= values[index - period];
    if (index < period - 1) {
      result.push(null);
      continue;
    }
    result.push(rolling / period);
  }
  return result;
}

function calcSMMA(values: number[], period: number): Array<number | null> {
  const result: Array<number | null> = [];
  let prev: number | null = null;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!Number.isFinite(value)) {
      result.push(null);
      continue;
    }
    if (prev === null) {
      if (index < period) {
        result.push(null);
        continue;
      }
      const seed = average(values.slice(index - period + 1, index + 1).filter((item) => Number.isFinite(item)));
      prev = seed;
      result.push(seed);
      continue;
    }
    prev = ((prev * (period - 1)) + value) / period;
    result.push(prev);
  }
  return result;
}

function calcATR(highs: number[], lows: number[], closes: number[], period = 14): Array<number | null> {
  const tr: number[] = [Number.NaN];
  for (let index = 1; index < closes.length; index += 1) {
    tr.push(Math.max(
      highs[index] - lows[index],
      Math.abs(highs[index] - closes[index - 1]),
      Math.abs(lows[index] - closes[index - 1]),
    ));
  }
  return calcSMMA(tr, period);
}

function calcOBV(closes: number[], volumes: number[]): number[] {
  const result: number[] = [volumes[0] ?? 0];
  for (let index = 1; index < closes.length; index += 1) {
    const prev = result[index - 1] ?? 0;
    if (closes[index] > closes[index - 1]) result.push(prev + volumes[index]);
    else if (closes[index] < closes[index - 1]) result.push(prev - volumes[index]);
    else result.push(prev);
  }
  return result;
}

function lastValid(values: Array<number | null>): number | null {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = values[index];
    if (value !== null && Number.isFinite(value)) return value;
  }
  return null;
}

function countRecentConfirmations(closes: number[], volumes: number[], lookback = 5): { bullish: number; bearish: number } {
  let bullish = 0;
  let bearish = 0;
  const start = Math.max(1, closes.length - lookback);
  for (let index = start; index < closes.length; index += 1) {
    const priorVolumeAvg = average(volumes.slice(Math.max(0, index - 10), index));
    if (!Number.isFinite(priorVolumeAvg) || priorVolumeAvg <= 0) continue;
    const volumeStrength = volumes[index] / priorVolumeAvg;
    if (closes[index] > closes[index - 1] && volumeStrength >= 1.05) bullish += 1;
    if (closes[index] < closes[index - 1] && volumeStrength >= 1.05) bearish += 1;
  }
  return { bullish, bearish };
}

function findStageDivergence(
  closes: number[],
  lows: number[],
  volumes: number[],
  obvSeries: number[],
): 'bearish' | 'bullish' | null {
  if (closes.length < 18) return null;
  const end = closes.length - 1;
  const highWindowStart = Math.max(0, end - 12);
  const highWindowEnd = Math.max(highWindowStart + 1, end - 4);
  let priorHighIndex = highWindowStart;
  let priorLowIndex = highWindowStart;
  for (let index = highWindowStart; index < highWindowEnd; index += 1) {
    if (closes[index] > closes[priorHighIndex]) priorHighIndex = index;
    if (lows[index] < lows[priorLowIndex]) priorLowIndex = index;
  }

  const priorHighVolume = average(volumes.slice(Math.max(0, priorHighIndex - 2), priorHighIndex + 1));
  const recentHighVolume = average(volumes.slice(Math.max(0, end - 2), end + 1));
  const madeHigherHigh = closes[end] > closes[priorHighIndex] * 1.003;
  const obvFailedHigh = obvSeries[end] < obvSeries[priorHighIndex] * 0.99;
  const volumeFailedHigh = Number.isFinite(priorHighVolume) && Number.isFinite(recentHighVolume)
    ? recentHighVolume < priorHighVolume * 0.75
    : false;
  if (madeHigherHigh && (obvFailedHigh || volumeFailedHigh)) return 'bearish';

  const priorLowVolume = average(volumes.slice(Math.max(0, priorLowIndex - 2), priorLowIndex + 1));
  const recentLowVolume = average(volumes.slice(Math.max(0, end - 2), end + 1));
  const madeLowerLow = lows[end] < lows[priorLowIndex] * 0.997;
  const obvHeldLow = obvSeries[end] > obvSeries[priorLowIndex] * 1.01;
  const volumeHeldLow = Number.isFinite(priorLowVolume) && Number.isFinite(recentLowVolume)
    ? recentLowVolume < priorLowVolume * 0.8
    : false;
  if (madeLowerLow && (obvHeldLow || volumeHeldLow)) return 'bullish';

  return null;
}

function detectHealthyPullback(closes: number[], volumes: number[], priceBias: VolumePriceAssessment['priceBias']): boolean {
  if (priceBias !== 'up' || closes.length < 8) return false;
  const recentCloses = closes.slice(-5);
  const recentVolumes = volumes.slice(-5);
  const peak = Math.max(...recentCloses);
  const trough = Math.min(...recentCloses.slice(-4));
  const drawdownPct = peak > 0 ? ((peak - trough) / peak) * 100 : 0;
  if (drawdownPct > 1.8) return false;

  let weakDays = 0;
  for (let index = closes.length - 4; index < closes.length; index += 1) {
    if (closes[index] <= closes[index - 1]) weakDays += 1;
  }
  const shrinkingVolume = recentVolumes[1] >= recentVolumes[2]
    && recentVolumes[2] >= recentVolumes[3];
  const latestVolumeVsTrend = recentVolumes[recentVolumes.length - 1] <= average(volumes.slice(-11, -1));
  return weakDays >= 2 && shrinkingVolume && latestVolumeVsTrend;
}

export function assessVolumePriceContext(kline: KlinePoint[]): VolumePriceAssessment {
  if (kline.length < 20) {
    return {
      directionScore: 0,
      riskScore: 0,
      volumeRatio: 1,
      atrExpansionRatio: 1,
      obvBias: 'flat',
      priceBias: 'sideways',
      tags: [],
      summary: 'neutral',
    };
  }

  const closes = kline.map((item) => item.close);
  const highs = kline.map((item) => item.high);
  const lows = kline.map((item) => item.low);
  const volumes = kline.map((item) => item.volume);
  const lastClose = closes[closes.length - 1];
  const prevClose = closes[closes.length - 2] ?? lastClose;
  const lookbackClose = closes[Math.max(0, closes.length - 6)] ?? prevClose;

  const ma5Series = calcMA(closes, 5);
  const ma10Series = calcMA(closes, 10);
  const ma20Series = calcMA(closes, 20);
  const ma20Recent = ma20Series.filter((value): value is number => value !== null).slice(-6);
  const ma5 = lastValid(ma5Series);
  const ma10 = lastValid(ma10Series);
  const ma20 = lastValid(ma20Series);

  const volumeMa5 = average(volumes.slice(-11, -1));
  const volumeRatio = Number.isFinite(volumeMa5) && volumeMa5 > 0
    ? volumes[volumes.length - 1] / volumeMa5
    : 1;

  const obvSeries = calcOBV(closes, volumes);
  const obvMa20Series = calcMA(obvSeries, 20);
  const lastObv = obvSeries[obvSeries.length - 1] ?? 0;
  const prevObv = obvSeries[obvSeries.length - 2] ?? lastObv;
  const lastObvMa20 = lastValid(obvMa20Series);

  const atrSeries = calcATR(highs, lows, closes, 14);
  const atrSeriesNumbers = atrSeries.filter((value): value is number => value !== null);
  const lastAtr = atrSeriesNumbers[atrSeriesNumbers.length - 1] ?? 0;
  const atrMa = average(atrSeriesNumbers.slice(-14));
  const atrExpansionRatio = Number.isFinite(lastAtr) && Number.isFinite(atrMa) && atrMa > 0
    ? lastAtr / atrMa
    : 1;

  const recentHigh = Math.max(...highs.slice(-21, -1));
  const recentLow = Math.min(...lows.slice(-21, -1));
  const priceChange5Pct = lookbackClose > 0 ? ((lastClose - lookbackClose) / lookbackClose) * 100 : 0;
  const latestSlope = ma20Recent.length >= 6 ? ma20Recent[ma20Recent.length - 1] - ma20Recent[0] : 0;

  let priceBias: VolumePriceAssessment['priceBias'] = 'sideways';
  if (ma5 !== null && ma10 !== null && ma20 !== null) {
    if (lastClose > ma20 && ma5 >= ma10 && latestSlope > 0) priceBias = 'up';
    else if (lastClose < ma20 && ma5 <= ma10 && latestSlope < 0) priceBias = 'down';
  }

  let obvBias: VolumePriceAssessment['obvBias'] = 'flat';
  if (lastObvMa20 !== null) {
    if (lastObv > lastObvMa20 && lastObv >= prevObv) obvBias = 'up';
    else if (lastObv < lastObvMa20 && lastObv <= prevObv) obvBias = 'down';
  }

  let directionScore = 0;
  let riskScore = 0;
  const tags = new Set<VolumePriceTag>();
  const bullishDay = lastClose > prevClose;
  const bearishDay = lastClose < prevClose;
  const breakoutUp = lastClose > recentHigh;
  const breakoutDown = lastClose < recentLow;
  const recentConfirmations = countRecentConfirmations(closes, volumes);

  if (priceBias === 'up') directionScore += 18;
  else if (priceBias === 'down') directionScore -= 18;

  if (breakoutUp) directionScore += 16;
  if (breakoutDown) directionScore -= 16;

  if (priceChange5Pct >= 3) directionScore += 8;
  else if (priceChange5Pct <= -3) directionScore -= 8;

  if (recentConfirmations.bullish >= 4) {
    directionScore += 14;
    riskScore -= 4;
    tags.add('trend_follow_through');
  } else if (recentConfirmations.bearish >= 4) {
    directionScore -= 14;
    riskScore += 10;
  }

  if (volumeRatio >= 1.25 && bullishDay) {
    directionScore += 24;
    riskScore -= 8;
    tags.add('bull_confirmed');
  } else if (volumeRatio >= 1.25 && bearishDay) {
    directionScore -= 24;
    riskScore += 22;
    tags.add('bear_confirmed');
  } else if (volumeRatio <= 0.95 && bullishDay) {
    directionScore += 8;
    riskScore += 12;
    tags.add('bull_unconfirmed');
  } else if (volumeRatio <= 0.95 && bearishDay) {
    directionScore -= 8;
    riskScore += 8;
    tags.add('bear_unconfirmed');
  }

  if (obvBias === 'up') directionScore += 12;
  else if (obvBias === 'down') directionScore -= 12;

  const stageDivergence = findStageDivergence(closes, lows, volumes, obvSeries);
  const bullishDivergence = stageDivergence === 'bullish' || (priceChange5Pct <= -1 && obvBias === 'up');
  const bearishDivergence = stageDivergence === 'bearish' || (priceChange5Pct >= 1 && obvBias === 'down');

  if (bearishDivergence) {
    directionScore -= 18;
    riskScore += 28;
    tags.add('bearish_divergence');
  }
  if (bullishDivergence) {
    directionScore += 18;
    riskScore -= 8;
    tags.add('bullish_divergence');
  }

  if (atrExpansionRatio >= 1.2) {
    riskScore += 16;
    tags.add('volatility_expansion');
  } else if (atrExpansionRatio <= 0.85) {
    riskScore -= 6;
  }

  if (detectHealthyPullback(closes, volumes, priceBias)) {
    tags.add('healthy_pullback');
    tags.delete('bull_unconfirmed');
    directionScore += 8;
    riskScore -= 12;
  }

  directionScore = clamp(Math.round(directionScore), -100, 100);
  riskScore = clamp(Math.round(riskScore), -100, 100);

  let summary: VolumePriceSummary = 'neutral';
  if (directionScore >= 20) summary = 'bullish';
  else if (directionScore <= -20) summary = 'bearish';

  return {
    directionScore,
    riskScore,
    volumeRatio: Number.isFinite(volumeRatio) ? Math.round(volumeRatio * 100) / 100 : 1,
    atrExpansionRatio: Number.isFinite(atrExpansionRatio) ? Math.round(atrExpansionRatio * 100) / 100 : 1,
    obvBias,
    priceBias,
    tags: Array.from(tags),
    summary,
  };
}

export function getVolumePriceTone(assessment: Pick<VolumePriceAssessment, 'summary' | 'tags' | 'riskScore'>): VolumePriceTone {
  if (assessment.tags.includes('bear_confirmed') || assessment.tags.includes('bearish_divergence') || assessment.summary === 'bearish') {
    return 'negative';
  }
  if (assessment.tags.includes('bull_confirmed') || assessment.tags.includes('bullish_divergence') || assessment.summary === 'bullish') {
    return 'positive';
  }
  return assessment.riskScore > 15 ? 'negative' : 'info';
}

export function describeVolumePriceAssessment(assessment: Pick<VolumePriceAssessment, 'summary' | 'tags'>): string {
  if (assessment.tags.includes('bearish_divergence')) return '顶背离预警';
  if (assessment.tags.includes('bullish_divergence')) return '低位背离修复';
  if (assessment.tags.includes('healthy_pullback')) return '缩量回踩健康';
  if (assessment.tags.includes('trend_follow_through')) return '量价连续确认';
  if (assessment.tags.includes('bull_confirmed')) return '放量确认';
  if (assessment.tags.includes('bear_confirmed')) return '放量走弱';
  if (assessment.tags.includes('bull_unconfirmed')) return '缩量上行';
  if (assessment.tags.includes('bear_unconfirmed')) return '缩量回落';
  if (assessment.summary === 'bullish') return '偏多';
  if (assessment.summary === 'bearish') return '偏空';
  return '量价中性';
}
