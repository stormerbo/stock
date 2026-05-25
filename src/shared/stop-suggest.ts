import { calcATR, calcMA, fetchDayFqKline, type KlinePoint } from './technical-analysis';
import type { StockHoldingConfig, StockPosition } from './fetch';

export type StopSuggest = {
  code: string;
  name: string;
  currentPrice: number;
  stopLoss: number;
  takeProfit: number;
  atr: number;
  atrPct: number;
  trendDirection: 'up' | 'down' | 'sideways';
  trendStrength: number;
  calculatedAt: number;
};

type TrendMeta = { dir: 'up' | 'down' | 'sideways'; label: string; icon: string };

export function trendMeta(dir: 'up' | 'down' | 'sideways'): TrendMeta {
  if (dir === 'up') return { dir: 'up', label: '偏强', icon: '↑' };
  if (dir === 'down') return { dir: 'down', label: '偏弱', icon: '↓' };
  return { dir: 'sideways', label: '震荡', icon: '→' };
}

const STOP_CACHE_KEY = 'stopSuggestions';
const STOP_LAST_CALC_KEY = '_lastStopCalcTime';
const STOP_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const BASE_MULTIPLIER = 2.0;
const ATR_PERIOD = 14;
const MA_PERIOD = 20;
const TREND_SLOPE_WINDOW = 5;

function calcMASlope(values: number[], period: number): number {
  const ma = calcMA(values, period);
  const valid = ma.filter((v): v is number => v !== null);
  if (valid.length < TREND_SLOPE_WINDOW + 1) return 0;
  const recent = valid.slice(-TREND_SLOPE_WINDOW - 1);
  const y = recent.slice(-TREND_SLOPE_WINDOW);
  const xMean = (TREND_SLOPE_WINDOW - 1) / 2;
  const yMean = y.reduce((s, v) => s + v, 0) / TREND_SLOPE_WINDOW;
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < TREND_SLOPE_WINDOW; i++) {
    const xi = i - xMean;
    numerator += xi * (y[i] - yMean);
    denominator += xi * xi;
  }
  return denominator > 0 ? numerator / denominator : 0;
}

function trendFactor(slope: number, avgPrice: number): number {
  if (avgPrice <= 0) return 1.0;
  const normalizedSlope = (slope / avgPrice) * 100;
  const clamped = Math.max(-0.5, Math.min(0.5, normalizedSlope));
  return 1 + clamped;
}

function trendDirection(slope: number, avgPrice: number): 'up' | 'down' | 'sideways' {
  if (avgPrice <= 0) return 'sideways';
  const threshold = 0.002 * avgPrice;
  if (slope > threshold) return 'up';
  if (slope < -threshold) return 'down';
  return 'sideways';
}

function roundPrice(v: number): number {
  return Math.round(v * 100) / 100;
}

export function calcStopSuggest(
  holdings: StockHoldingConfig[],
  klineByCode: Record<string, KlinePoint[]>,
  currentPrices: Record<string, number>,
  nameByCode: Record<string, string> = {},
): StopSuggest[] {
  const results: StopSuggest[] = [];
  for (const h of holdings) {
    const kline = klineByCode[h.code];
    const price = currentPrices[h.code];
    if (!kline || kline.length < ATR_PERIOD + 1 || !Number.isFinite(price) || price <= 0) continue;

    const highs = kline.map((k) => k.high);
    const lows = kline.map((k) => k.low);
    const closes = kline.map((k) => k.close);

    const atrSeries = calcATR(highs, lows, closes, ATR_PERIOD);
    const lastAtr = atrSeries.reduce<number | null>((prev, cur) => cur ?? prev, null);
    if (lastAtr === null || lastAtr <= 0) continue;

    const slope = calcMASlope(closes, MA_PERIOD);
    const avgPrice = closes.filter((v) => Number.isFinite(v)).slice(-MA_PERIOD).reduce((s, v) => s + v, 0) / Math.min(MA_PERIOD, closes.length);
    const tf = trendFactor(slope, avgPrice);
    const dir = trendDirection(slope, avgPrice);
    const strength = Math.min(1, Math.abs(slope) / (avgPrice * 0.005));

    const stopLoss = roundPrice(price - lastAtr * BASE_MULTIPLIER * tf);
    const takeProfit = roundPrice(price + lastAtr * BASE_MULTIPLIER * (2 - tf));

    results.push({
      code: h.code,
      name: nameByCode[h.code] || h.name || h.code,
      currentPrice: price,
      stopLoss,
      takeProfit,
      atr: roundPrice(lastAtr),
      atrPct: roundPrice((lastAtr / price) * 100),
      trendDirection: dir,
      trendStrength: strength,
      calculatedAt: Date.now(),
    });
  }
  return results;
}

export async function loadCachedStopSuggestions(): Promise<StopSuggest[]> {
  try {
    const result = await chrome.storage.local.get(STOP_CACHE_KEY);
    return (result[STOP_CACHE_KEY] as StopSuggest[]) ?? [];
  } catch {
    return [];
  }
}

export async function saveStopSuggestionsCache(suggestions: StopSuggest[]): Promise<void> {
  try {
    await chrome.storage.local.set({ [STOP_CACHE_KEY]: suggestions, [STOP_LAST_CALC_KEY]: Date.now() });
  } catch {
    // best effort
  }
}

export async function shouldRecalcStop(): Promise<boolean> {
  try {
    const result = await chrome.storage.local.get(STOP_LAST_CALC_KEY);
    const lastCalc = (result[STOP_LAST_CALC_KEY] as number) ?? 0;
    return Date.now() - lastCalc > STOP_CACHE_TTL_MS;
  } catch {
    return true;
  }
}
