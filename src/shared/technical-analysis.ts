// -----------------------------------------------------------
// Technical analysis — MACD, MA, signal detection
// Shared between popup and background contexts
// -----------------------------------------------------------

import { normalizeStockCode, toTencentStockCode } from './fetch';

export type KlinePoint = {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
};

export type MacdResult = {
  dif: Array<number | null>;
  dea: Array<number | null>;
  macd: Array<number | null>;
};

export type MacdSignalType = 'golden_cross' | 'death_cross' | null;

export type MacdSignalSummary = {
  signal: MacdSignalType;
  dif: number | null;
  dea: number | null;
  macd: number | null;
};

// -----------------------------------------------------------
// MA (Simple Moving Average)
// -----------------------------------------------------------

export function calcMA(values: number[], period: number): Array<number | null> {
  const result: Array<number | null> = [];
  let rolling = 0;
  for (let i = 0; i < values.length; i += 1) {
    rolling += values[i];
    if (i >= period) {
      rolling -= values[i - period];
    }
    if (i < period - 1) {
      result.push(null);
      continue;
    }
    result.push(rolling / period);
  }
  return result;
}

// -----------------------------------------------------------
// EMA (Exponential Moving Average)
// -----------------------------------------------------------

function calcEMA(values: number[], period: number): Array<number | null> {
  const alpha = 2 / (period + 1);
  const result: Array<number | null> = [];
  let prev: number | null = null;

  values.forEach((value) => {
    if (!Number.isFinite(value)) {
      result.push(null);
      return;
    }
    if (prev === null) {
      prev = value;
      result.push(value);
      return;
    }
    prev = prev + alpha * (value - prev);
    result.push(prev);
  });
  return result;
}

// -----------------------------------------------------------
// MACD
// -----------------------------------------------------------

export function calcMACD(values: number[]): MacdResult {
  const ema12 = calcEMA(values, 12);
  const ema26 = calcEMA(values, 26);
  const dif: Array<number | null> = ema12.map((item, index) => {
    const slow = ema26[index];
    if (item === null || slow === null) return null;
    return item - slow;
  });

  const dea: Array<number | null> = [];
  const alpha = 2 / (9 + 1);
  let prevDea: number | null = null;
  dif.forEach((item) => {
    if (item === null) {
      dea.push(null);
      return;
    }
    if (prevDea === null) {
      prevDea = item;
      dea.push(item);
      return;
    }
    prevDea = prevDea + alpha * (item - prevDea);
    dea.push(prevDea);
  });

  const macd = dif.map((item, index) => {
    const signal = dea[index];
    if (item === null || signal === null) return null;
    return (item - signal) * 2;
  });

  return { dif, dea, macd };
}

// -----------------------------------------------------------
// Signal detection
// -----------------------------------------------------------

/**
 * Detect MACD golden cross / death cross from the last 2 data points.
 * Golden cross: DIF crosses above DEA (prev dif <= prev dea, current dif > current dea)
 * Death cross:  DIF crosses below DEA (prev dif >= prev dea, current dif < current dea)
 */
export function detectMacdSignal(macd: MacdResult): MacdSignalType {
  const { dif, dea } = macd;
  const len = dif.length;
  if (len < 2) return null;

  // Find last two valid dif/dea pairs
  let lastIdx = len - 1;
  let prevIdx = len - 2;

  // Scan backwards to find valid entries
  while (lastIdx > 0 && (dif[lastIdx] === null || dea[lastIdx] === null)) lastIdx--;
  prevIdx = lastIdx - 1;
  while (prevIdx > 0 && (dif[prevIdx] === null || dea[prevIdx] === null)) prevIdx--;

  if (prevIdx < 0 || dif[lastIdx] === null || dea[lastIdx] === null || dif[prevIdx] === null || dea[prevIdx] === null) {
    return null;
  }

  const prevDif = dif[prevIdx]!;
  const prevDea = dea[prevIdx]!;
  const currDif = dif[lastIdx]!;
  const currDea = dea[lastIdx]!;

  if (prevDif <= prevDea && currDif > currDea) return 'golden_cross';
  if (prevDif >= prevDea && currDif < currDea) return 'death_cross';

  return null;
}

/**
 * Get the last MACD values + signal type for comparison across days.
 */
export function getMacdSummary(macd: MacdResult): MacdSignalSummary {
  const lastIdx = macd.dif.length - 1;
  const signal = detectMacdSignal(macd);
  return {
    signal,
    dif: macd.dif[lastIdx] ?? null,
    dea: macd.dea[lastIdx] ?? null,
    macd: macd.macd[lastIdx] ?? null,
  };
}

// -----------------------------------------------------------
// RSI (Relative Strength Index)
// -----------------------------------------------------------

export function calcRSI(values: number[], period = 14): Array<number | null> {
  const result: Array<number | null> = [];
  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 0; i < values.length; i += 1) {
    if (i < period) {
      result.push(null);
      if (i > 0) {
        const change = values[i] - values[i - 1];
        if (change > 0) avgGain += change;
        else avgLoss -= change;
      }
      if (i === period - 1) {
        avgGain /= period;
        avgLoss /= period;
      }
      continue;
    }

    const change = values[i] - values[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    if (avgLoss === 0) {
      result.push(100);
    } else {
      const rs = avgGain / avgLoss;
      result.push(100 - 100 / (1 + rs));
    }
  }
  return result;
}

// -----------------------------------------------------------
// KDJ (Stochastic Indicator)
// -----------------------------------------------------------

export type KdjResult = {
  k: Array<number | null>;
  d: Array<number | null>;
  j: Array<number | null>;
};

export function calcKDJ(
  highs: number[],
  lows: number[],
  closes: number[],
  period = 9,
): KdjResult {
  const k: Array<number | null> = [];
  const d: Array<number | null> = [];
  const j: Array<number | null> = [];
  let prevK = 50;
  let prevD = 50;

  for (let i = 0; i < closes.length; i += 1) {
    if (i < period - 1) {
      k.push(null);
      d.push(null);
      j.push(null);
      continue;
    }

    const highPeriod = Math.max(...highs.slice(i - period + 1, i + 1));
    const lowPeriod = Math.min(...lows.slice(i - period + 1, i + 1));

    let rsv: number;
    if (highPeriod === lowPeriod) {
      rsv = 50;
    } else {
      rsv = ((closes[i] - lowPeriod) / (highPeriod - lowPeriod)) * 100;
    }

    const currentK = (2 / 3) * prevK + (1 / 3) * rsv;
    const currentD = (2 / 3) * prevD + (1 / 3) * currentK;
    const currentJ = 3 * currentK - 2 * currentD;

    k.push(currentK);
    d.push(currentD);
    j.push(currentJ);

    prevK = currentK;
    prevD = currentD;
  }

  return { k, d, j };
}

// -----------------------------------------------------------
// Bollinger Bands
// -----------------------------------------------------------

export type BollingerResult = {
  middle: Array<number | null>;
  upper: Array<number | null>;
  lower: Array<number | null>;
  width: Array<number | null>;
};

export function calcBollinger(values: number[], period = 20, multiplier = 2): BollingerResult {
  const middle = calcMA(values, period);
  const upper: Array<number | null> = [];
  const lower: Array<number | null> = [];
  const width: Array<number | null> = [];

  for (let i = 0; i < values.length; i += 1) {
    const m = middle[i];
    if (m === null || i < period - 1) {
      upper.push(null);
      lower.push(null);
      width.push(null);
      continue;
    }

    const slice = values.slice(i - period + 1, i + 1);
    const mean = m;
    const squaredDiffs = slice.map((v) => (v - mean) ** 2);
    const stdDev = Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / period);
    const bandWidth = ((mean + multiplier * stdDev) - (mean - multiplier * stdDev)) / mean * 100;

    upper.push(mean + multiplier * stdDev);
    lower.push(mean - multiplier * stdDev);
    width.push(bandWidth);
  }

  return { middle, upper, lower, width };
}

// -----------------------------------------------------------
// WR (Williams %R)
// -----------------------------------------------------------

export function calcWR(
  highs: number[],
  lows: number[],
  closes: number[],
  period = 14,
): Array<number | null> {
  const result: Array<number | null> = [];

  for (let i = 0; i < closes.length; i += 1) {
    if (i < period - 1) {
      result.push(null);
      continue;
    }

    const highPeriod = Math.max(...highs.slice(i - period + 1, i + 1));
    const lowPeriod = Math.min(...lows.slice(i - period + 1, i + 1));

    if (highPeriod === lowPeriod) {
      result.push(-50);
    } else {
      const wr = ((highPeriod - closes[i]) / (highPeriod - lowPeriod)) * -100;
      result.push(wr);
    }
  }

  return result;
}

// -----------------------------------------------------------
// Unified signal detection
// -----------------------------------------------------------

export type TechnicalSignal = {
  type: string;
  indicator: string;
  label: string;
  guidance: string;
  severity: 'positive' | 'negative' | 'info';
};

/**
 * Detect all technical signals from K-line data.
 * Includes: MACD, RSI, KDJ, Bollinger, Volume MA, WR
 */
export function detectAllSignals(kline: KlinePoint[]): TechnicalSignal[] {
  if (kline.length < 30) return [];

  const closes = kline.map((k) => k.close);
  const highs = kline.map((k) => k.high);
  const lows = kline.map((k) => k.low);
  const volumes = kline.map((k) => k.volume);
  const signals: TechnicalSignal[] = [];

  // 1. MACD
  const macd = calcMACD(closes);
  const macdSignal = detectMacdSignal(macd);
  if (macdSignal === 'golden_cross') {
    signals.push({
      type: 'macd_golden_cross',
      indicator: 'macd',
      label: 'MACD 金叉',
      guidance: 'DIF 上穿 DEA 线，中期趋势转强，关注上涨动能',
      severity: 'positive',
    });
  } else if (macdSignal === 'death_cross') {
    signals.push({
      type: 'macd_death_cross',
      indicator: 'macd',
      label: 'MACD 死叉',
      guidance: 'DIF 下穿 DEA 线，中期趋势转弱，注意回调风险',
      severity: 'negative',
    });
  }

  // 2. RSI
  const rsi = calcRSI(closes);
  const lastRsi = rsi[rsi.length - 1];
  if (lastRsi !== null) {
    if (lastRsi > 70) {
      signals.push({
        type: 'rsi_overbought',
        indicator: 'rsi',
        label: `RSI 超买(${lastRsi.toFixed(1)})`,
        guidance: `RSI(${lastRsi.toFixed(1)}) 进入超买区间(>70)，短期可能见顶，建议逢高减仓`,
        severity: 'negative',
      });
    } else if (lastRsi < 30) {
      signals.push({
        type: 'rsi_oversold',
        indicator: 'rsi',
        label: `RSI 超卖(${lastRsi.toFixed(1)})`,
        guidance: `RSI(${lastRsi.toFixed(1)}) 进入超卖区间(<30)，短期可能见底，可关注反弹机会`,
        severity: 'positive',
      });
    }
  }

  // 3. KDJ
  if (kline.length >= 9) {
    const kdj = calcKDJ(highs, lows, closes);
    const lastK = kdj.k[kdj.k.length - 1];
    const lastD = kdj.d[kdj.d.length - 1];

    // Detect K-D cross (scan last 2 valid entries)
    let kdCross: 'golden_cross' | 'death_cross' | null = null;
    let lastIdx = kdj.k.length - 1;
    let prevIdx = lastIdx - 1;
    while (lastIdx > 0 && (kdj.k[lastIdx] === null || kdj.d[lastIdx] === null)) lastIdx--;
    prevIdx = lastIdx - 1;
    while (prevIdx > 0 && (kdj.k[prevIdx] === null || kdj.d[prevIdx] === null)) prevIdx--;
    if (prevIdx >= 0 && kdj.k[lastIdx] !== null && kdj.d[lastIdx] !== null && kdj.k[prevIdx] !== null && kdj.d[prevIdx] !== null) {
      const pk = kdj.k[prevIdx]!;
      const pd = kdj.d[prevIdx]!;
      const ck = kdj.k[lastIdx]!;
      const cd = kdj.d[lastIdx]!;
      if (pk <= pd && ck > cd) kdCross = 'golden_cross';
      else if (pk >= pd && ck < cd) kdCross = 'death_cross';
    }

    if (kdCross === 'golden_cross') {
      signals.push({
        type: 'kdj_golden_cross',
        indicator: 'kdj',
        label: 'KDJ 金叉',
        guidance: 'K 线上穿 D 线，短线买入信号，有望继续上涨',
        severity: 'positive',
      });
    } else if (kdCross === 'death_cross') {
      signals.push({
        type: 'kdj_death_cross',
        indicator: 'kdj',
        label: 'KDJ 死叉',
        guidance: 'K 线下穿 D 线，短线卖出信号，注意调整风险',
        severity: 'negative',
      });
    } else if (lastK !== null && lastK > 80) {
      signals.push({
        type: 'kdj_overbought',
        indicator: 'kdj',
        label: `KDJ 超买(${lastK.toFixed(1)})`,
        guidance: `KDJ 处于高位(K=${lastK.toFixed(1)}>80)，短期涨幅较大，注意回调风险`,
        severity: 'negative',
      });
    } else if (lastK !== null && lastK < 20) {
      signals.push({
        type: 'kdj_oversold',
        indicator: 'kdj',
        label: `KDJ 超卖(${lastK.toFixed(1)})`,
        guidance: `KDJ 处于低位(K=${lastK.toFixed(1)}<20)，短期跌幅较大，存在反弹需求`,
        severity: 'positive',
      });
    }
  }

  // 4. Bollinger
  if (kline.length >= 20) {
    const boll = calcBollinger(closes);
    const lastIdx = closes.length - 1;
    const lastClose = closes[lastIdx];
    const lastUpper = boll.upper[boll.upper.length - 1];
    const lastLower = boll.lower[boll.lower.length - 1];

    if (lastUpper !== null && lastLower !== null && lastClose !== null) {
      if (lastClose >= lastUpper) {
        signals.push({
          type: 'boll_upper_breakout',
          indicator: 'bollinger',
          label: '突破上轨',
          guidance: '股价突破布林带上轨，强势特征明显，但追高需谨慎',
          severity: 'info',
        });
      } else if (lastClose <= lastLower) {
        signals.push({
          type: 'boll_lower_breakout',
          indicator: 'bollinger',
          label: '跌破下轨',
          guidance: '股价跌破布林带下轨，弱势明显，关注超跌反弹机会',
          severity: 'info',
        });
      }

      // Squeeze detection: current width is minimum of last 20 widths
      const validWidths = boll.width.filter((w): w is number => w !== null);
      if (validWidths.length >= 10) {
        const recentWidths = validWidths.slice(-20);
        const currentWidth = recentWidths[recentWidths.length - 1];
        const minWidth = Math.min(...recentWidths);
        if (currentWidth <= minWidth * 1.05) {
          signals.push({
            type: 'boll_squeeze',
            indicator: 'bollinger',
            label: '布林带收窄',
            guidance: '布林带持续收窄，即将选择方向突破，留意量能变化',
            severity: 'info',
          });
        }
      }
    }
  }

  // 5. Volume
  if (kline.length >= 10) {
    const vma5 = calcMA(volumes, 5);
    const lastVol = volumes[volumes.length - 1];
    const lastVma5 = vma5[vma5.length - 1];
    if (lastVma5 !== null && lastVma5 > 0) {
      const ratio = lastVol / lastVma5;
      if (ratio >= 2) {
        signals.push({
          type: 'vol_surge',
          indicator: 'volume',
          label: `量能放大(${ratio.toFixed(1)}x)`,
          guidance: `成交量放大至 5 日均量的 ${ratio.toFixed(1)} 倍，市场关注度提升，关注价格方向`,
          severity: 'info',
        });
      } else if (ratio <= 0.5) {
        signals.push({
          type: 'vol_shrink',
          indicator: 'volume',
          label: `量能萎缩(${ratio.toFixed(1)}x)`,
          guidance: `成交量萎缩至 5 日均量的 ${(ratio * 100).toFixed(0)}%，交投清淡，观望为宜`,
          severity: 'info',
        });
      }
    }
  }

  // 6. WR
  if (kline.length >= 14) {
    const wr = calcWR(highs, lows, closes);
    const lastWr = wr[wr.length - 1];
    if (lastWr !== null) {
      if (lastWr > -20) {
        signals.push({
          type: 'wr_overbought',
          indicator: 'wr',
          label: `WR 超买(${lastWr.toFixed(1)})`,
          guidance: `威廉指标(${lastWr.toFixed(1)}>-20)处于超买区，短期高位，存在回调需求`,
          severity: 'negative',
        });
      } else if (lastWr < -80) {
        signals.push({
          type: 'wr_oversold',
          indicator: 'wr',
          label: `WR 超卖(${lastWr.toFixed(1)})`,
          guidance: `威廉指标(${lastWr.toFixed(1)}<-80)处于超卖区，短期低位，存在反弹机会`,
          severity: 'positive',
        });
      }
    }
  }

  return signals;
}

// -----------------------------------------------------------
// K-line fetching (works in both popup and service worker)
// -----------------------------------------------------------

/**
 * Fetch day K-line data from Tencent API.
 * Works in both popup and background service worker contexts.
 */
export async function fetchDayFqKline(
  code: string,
  count = 60,
): Promise<KlinePoint[]> {
  const plainCode = normalizeStockCode(code);
  const tencentCode = toTencentStockCode(plainCode);
  if (!tencentCode) throw new Error('invalid stock code');

  const response = await fetch(
    `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${tencentCode},day,,,${count},qfq`,
  );
  const json = (await response.json()) as {
    data?: Record<string, { qfqday?: string[][] }>;
  };
  const payload = json.data?.[tencentCode];
  const rows = payload?.qfqday;
  if (!rows || !Array.isArray(rows)) return [];

  const results: KlinePoint[] = [];
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 6) continue;
    const [date, open, close, high, low, volume] = row;
    const item = {
      date: String(date),
      open: Number(open),
      close: Number(close),
      high: Number(high),
      low: Number(low),
      volume: Number(volume),
    };
    if (Number.isFinite(item.close)) {
      results.push(item);
    }
  }
  return results;
}
