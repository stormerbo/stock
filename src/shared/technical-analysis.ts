// -----------------------------------------------------------
// Technical analysis — MACD, MA, signal detection
// Shared between popup and background contexts
// -----------------------------------------------------------

import { normalizeStockCode, toTencentStockCode } from './fetch.ts';
import { fetchStockKlineWithFallback } from './stock-chart-failover.ts';
import { assessVolumePriceContext } from './volume-price-context.ts';

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
 * Includes: MACD (cross + histogram), RSI, KDJ, Bollinger, Volume MA,
 *           MA Cross (MA5/10), BIAS, WR
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

  // 6. MA Cross (MA5 / MA10 golden / death cross)
  if (kline.length >= 10) {
    const ma5 = calcMA(closes, 5);
    const ma10 = calcMA(closes, 10);
    let lastIdx = ma5.length - 1;
    let prevIdx = lastIdx - 1;
    while (lastIdx > 0 && (ma5[lastIdx] === null || ma10[lastIdx] === null)) lastIdx--;
    prevIdx = lastIdx - 1;
    while (prevIdx > 0 && (ma5[prevIdx] === null || ma10[prevIdx] === null)) prevIdx--;
    if (prevIdx >= 0 && ma5[lastIdx] !== null && ma10[lastIdx] !== null && ma5[prevIdx] !== null && ma10[prevIdx] !== null) {
      const p5 = ma5[prevIdx]!;
      const p10 = ma10[prevIdx]!;
      const c5 = ma5[lastIdx]!;
      const c10 = ma10[lastIdx]!;
      if (p5 <= p10 && c5 > c10) {
        signals.push({
          type: 'ma5_10_golden_cross',
          indicator: 'ma_cross',
          label: 'MA5/10 金叉',
          guidance: '5日均线上穿10日均线，短线趋势转强，可积极关注',
          severity: 'positive',
        });
      } else if (p5 >= p10 && c5 < c10) {
        signals.push({
          type: 'ma5_10_death_cross',
          indicator: 'ma_cross',
          label: 'MA5/10 死叉',
          guidance: '5日均线下穿10日均线，短线趋势转弱，注意防范风险',
          severity: 'negative',
        });
      }
    }
  }

  // 7. BIAS (乖离率) — price deviation from MA5
  if (kline.length >= 5) {
    const ma5 = calcMA(closes, 5);
    const lastMa5 = ma5[ma5.length - 1];
    const lastClose = closes[closes.length - 1];
    if (lastMa5 !== null && lastMa5 > 0 && Number.isFinite(lastClose)) {
      const bias = ((lastClose - lastMa5) / lastMa5) * 100;
      if (bias > 8) {
        signals.push({
          type: 'bias_high',
          indicator: 'bias',
          label: `乖离率偏高(${bias.toFixed(1)}%)`,
          guidance: `股价偏离5日均线 ${bias.toFixed(1)}%，短期涨幅过大，注意回调风险`,
          severity: 'negative',
        });
      } else if (bias < -8) {
        signals.push({
          type: 'bias_low',
          indicator: 'bias',
          label: `乖离率偏低(${bias.toFixed(1)}%)`,
          guidance: `股价偏离5日均线 ${bias.toFixed(1)}%，短期跌幅过大，存在反弹需求`,
          severity: 'positive',
        });
      }
    }
  }

  // 8. MACD histogram turning (red/green bar flip)
  if (kline.length >= 26) {
    const macd = calcMACD(closes);
    const m = macd.macd;
    let lastIdx = m.length - 1;
    let prevIdx = lastIdx - 1;
    while (lastIdx > 0 && (m[lastIdx] === null)) lastIdx--;
    prevIdx = lastIdx - 1;
    while (prevIdx > 0 && (m[prevIdx] === null)) prevIdx--;
    if (prevIdx >= 0 && m[lastIdx] !== null && m[prevIdx] !== null) {
      const pm = m[prevIdx]!;
      const cm = m[lastIdx]!;
      if (pm <= 0 && cm > 0) {
        signals.push({
          type: 'macd_histogram_turn_positive',
          indicator: 'macd',
          label: 'MACD 翻红',
          guidance: 'MACD 柱由负转正，空方力量减弱，有望形成金叉',
          severity: 'positive',
        });
      } else if (pm >= 0 && cm < 0) {
        signals.push({
          type: 'macd_histogram_turn_negative',
          indicator: 'macd',
          label: 'MACD 翻绿',
          guidance: 'MACD 柱由正转负，多头力量减弱，注意死叉风险',
          severity: 'negative',
        });
      }
    }
  }

  // 9. WR
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

  // 10. CCI — 商品通道指数
  if (kline.length >= 20) {
    const cci = calcCCI(highs, lows, closes);
    const lastCci = cci[cci.length - 1];
    const prevCci = cci.length >= 2 ? cci[cci.length - 2] : null;
    if (lastCci !== null) {
      if (lastCci > 100 && prevCci !== null && prevCci <= 100) {
        signals.push({
          type: 'cci_break_100',
          indicator: 'cci',
          label: `CCI 突破+100(${lastCci.toFixed(0)})`,
          guidance: `CCI(${lastCci.toFixed(0)})向上突破+100，进入超强区间，趋势可能加速`,
          severity: 'positive',
        });
      } else if (lastCci < -100 && prevCci !== null && prevCci >= -100) {
        signals.push({
          type: 'cci_break_neg100',
          indicator: 'cci',
          label: `CCI 跌破-100(${lastCci.toFixed(0)})`,
          guidance: `CCI(${lastCci.toFixed(0)})向下跌破-100，进入超弱区间，注意下行风险`,
          severity: 'negative',
        });
      }
      if (lastCci > 150) {
        signals.push({
          type: 'cci_overbought',
          indicator: 'cci',
          label: `CCI 超买(${lastCci.toFixed(0)})`,
          guidance: `CCI(${lastCci.toFixed(0)})超过+150，严重超买，警惕回调`,
          severity: 'negative',
        });
      } else if (lastCci < -150) {
        signals.push({
          type: 'cci_oversold',
          indicator: 'cci',
          label: `CCI 超卖(${lastCci.toFixed(0)})`,
          guidance: `CCI(${lastCci.toFixed(0)})低于-150，严重超卖，关注反弹`,
          severity: 'positive',
        });
      }
    }
  }

  // 11. OBV — 能量潮
  if (kline.length >= 20) {
    const obv = calcOBV(closes, volumes);
    const obvMa = calcMA(obv as number[], 20);
    const lastObv = obv[obv.length - 1];
    const lastObvMa = obvMa[obvMa.length - 1];
    const prevObv = obv.length >= 2 ? obv[obv.length - 2] : null;
    if (lastObv !== null && lastObvMa !== null && prevObv !== null) {
      if (lastObv > lastObvMa && prevObv <= lastObvMa) {
        signals.push({
          type: 'obv_break_ma',
          indicator: 'obv',
          label: 'OBV 上穿均线',
          guidance: 'OBV 上穿 20 日均线，量能配合良好，上涨趋势健康',
          severity: 'positive',
        });
      } else if (lastObv < lastObvMa && prevObv >= lastObvMa) {
        signals.push({
          type: 'obv_break_ma_down',
          indicator: 'obv',
          label: 'OBV 跌破均线',
          guidance: 'OBV 跌破 20 日均线，量能萎缩，资金流出迹象',
          severity: 'negative',
        });
      }
    }
  }

  // 12. PSY — 心理线
  if (kline.length >= 24) {
    const psy = calcPSY(closes);
    const lastPsy = psy[psy.length - 1];
    if (lastPsy !== null) {
      if (lastPsy > 75) {
        signals.push({
          type: 'psy_overheat',
          indicator: 'psy',
          label: `PSY 过热(${lastPsy.toFixed(0)})`,
          guidance: `PSY(${lastPsy.toFixed(0)})超过75，上涨天数过多，市场情绪过热，注意回调`,
          severity: 'negative',
        });
      } else if (lastPsy < 25) {
        signals.push({
          type: 'psy_oversold',
          indicator: 'psy',
          label: `PSY 过冷(${lastPsy.toFixed(0)})`,
          guidance: `PSY(${lastPsy.toFixed(0)})低于25，下跌天数过多，市场情绪低迷，关注反弹`,
          severity: 'positive',
        });
      }
    }
  }

  // 13. DMI — 趋向指标（简化版：PDI/MDI 金叉死叉）
  if (kline.length >= 14) {
    const dmi = calcDMI(highs, lows, closes);
    const lastPdi = dmi.pdi[dmi.pdi.length - 1];
    const lastMdi = dmi.mdi[dmi.mdi.length - 1];
    const prevPdi = dmi.pdi.length >= 2 ? dmi.pdi[dmi.pdi.length - 2] : null;
    const prevMdi = dmi.mdi.length >= 2 ? dmi.mdi[dmi.mdi.length - 2] : null;
    if (lastPdi !== null && lastMdi !== null && prevPdi !== null && prevMdi !== null) {
      if (prevPdi <= prevMdi && lastPdi > lastMdi) {
        signals.push({
          type: 'dmi_golden_cross',
          indicator: 'dmi',
          label: 'DMI 金叉(PDI上穿MDI)',
          guidance: 'PDI 上穿 MDI，多方力量占优，上涨趋势确认',
          severity: 'positive',
        });
      } else if (prevPdi >= prevMdi && lastPdi < lastMdi) {
        signals.push({
          type: 'dmi_death_cross',
          indicator: 'dmi',
          label: 'DMI 死叉(PDI跌破MDI)',
          guidance: 'PDI 跌破 MDI，空方力量占优，下跌趋势确认',
          severity: 'negative',
        });
      }
    }
  }

  // 14. SAR — 抛物线转向
  if (kline.length >= 10) {
    const sar = calcSAR(highs, lows, closes);
    const lastSar = sar[sar.length - 1];
    const lastClose = closes[closes.length - 1];
    const prevSar = sar.length >= 2 ? sar[sar.length - 2] : null;
    const prevClose = closes.length >= 2 ? closes[closes.length - 2] : null;
    if (lastSar !== null && lastClose !== null && prevSar !== null && prevClose !== null) {
      if (prevClose <= prevSar && lastClose > lastSar) {
        signals.push({
          type: 'sar_bullish',
          indicator: 'sar',
          label: 'SAR 翻多',
          guidance: '价格上穿 SAR 指标，趋势由空转多，发出买入信号',
          severity: 'positive',
        });
      } else if (prevClose >= prevSar && lastClose < lastSar) {
        signals.push({
          type: 'sar_bearish',
          indicator: 'sar',
          label: 'SAR 翻空',
          guidance: '价格跌破 SAR 指标，趋势由多转空，发出卖出信号',
          severity: 'negative',
        });
      }
    }
  }

  // 15. MOM — 动量指标
  if (kline.length >= 12) {
    const mom = calcMOM(closes, 10);
    const lastMom = mom[mom.length - 1];
    const prevMom = mom.length >= 2 ? mom[mom.length - 2] : null;
    if (lastMom !== null && prevMom !== null) {
      if (prevMom <= 0 && lastMom > 0) {
        signals.push({
          type: 'mom_positive',
          indicator: 'mom',
          label: 'MOM 翻正',
          guidance: '动量指标由负转正，上涨动能增强',
          severity: 'positive',
        });
      } else if (prevMom >= 0 && lastMom < 0) {
        signals.push({
          type: 'mom_negative',
          indicator: 'mom',
          label: 'MOM 翻负',
          guidance: '动量指标由正转负，下跌动能增强',
          severity: 'negative',
        });
      }
    }
  }

  // 16. ATR — 平均真实波幅（辅助判断波动率变化）
  if (kline.length >= 14) {
    const atr = calcATR(highs, lows, closes);
    const atrMa = calcMA(atr as number[], 14);
    const lastAtr = atr[atr.length - 1];
    const lastAtrMa = atrMa[atrMa.length - 1];
    if (lastAtr !== null && lastAtrMa !== null && lastAtrMa > 0) {
      const ratio = lastAtr / lastAtrMa;
      if (ratio > 1.5) {
        signals.push({
          type: 'atr_expand',
          indicator: 'atr',
          label: `ATR 波幅扩大(${ratio.toFixed(1)}x)`,
          guidance: `ATR(${ratio.toFixed(1)}倍均线)波幅显著扩大，价格波动加剧，注意风险控制`,
          severity: 'info',
        });
      } else if (ratio < 0.6) {
        signals.push({
          type: 'atr_shrink',
          indicator: 'atr',
          label: `ATR 波幅收窄(${ratio.toFixed(1)}x)`,
          guidance: `ATR(${ratio.toFixed(1)}倍均线)波幅持续收窄，蓄势整理，即将选择方向`,
          severity: 'info',
        });
      }
    }
  }

  const volumePrice = assessVolumePriceContext(kline);
  if (volumePrice.tags.includes('bull_confirmed')) {
    signals.push({
      type: 'volume_price_bull_confirmed',
      indicator: 'volume_price',
      label: '量价共振看多',
      guidance: `放量上攻且趋势评分 ${volumePrice.directionScore}，量价配合良好，可把它视为上涨确认而非单点异动`,
      severity: 'positive',
    });
  } else if (volumePrice.tags.includes('bear_confirmed')) {
    signals.push({
      type: 'volume_price_bear_confirmed',
      indicator: 'volume_price',
      label: '量价共振转弱',
      guidance: `放量下行且风险评分 ${volumePrice.riskScore}，抛压释放更明确，宜把风控放在前面`,
      severity: 'negative',
    });
  } else if (volumePrice.tags.includes('bull_unconfirmed')) {
    signals.push({
      type: 'volume_price_bull_unconfirmed',
      indicator: 'volume_price',
      label: '缩量上涨待确认',
      guidance: `价格走强但量能仅为 5 日均量的 ${volumePrice.volumeRatio.toFixed(2)} 倍，冲高延续性仍待确认`,
      severity: 'info',
    });
  } else if (volumePrice.tags.includes('bear_unconfirmed')) {
    signals.push({
      type: 'volume_price_bear_unconfirmed',
      indicator: 'volume_price',
      label: '缩量回落观察',
      guidance: `价格回落但量能未明显放大，弱势成立度一般，先观察是否继续放量`,
      severity: 'info',
    });
  }

  if (volumePrice.tags.includes('bearish_divergence')) {
    signals.push({
      type: 'volume_price_bearish_divergence',
      indicator: 'volume_price',
      label: '量价背离预警',
      guidance: '价格仍在上冲，但 OBV 未同步转强，量价出现背离，注意冲高回落风险',
      severity: 'negative',
    });
  } else if (volumePrice.tags.includes('bullish_divergence')) {
    signals.push({
      type: 'volume_price_bullish_divergence',
      indicator: 'volume_price',
      label: '量价背离修复',
      guidance: '价格仍偏弱，但量能和 OBV 已先行改善，存在弱转强修复的可能',
      severity: 'positive',
    });
  }

  if (volumePrice.tags.includes('trend_follow_through')) {
    signals.push({
      type: 'volume_price_follow_through',
      indicator: 'volume_price',
      label: '连续量价确认',
      guidance: '最近数日上涨过程中量能持续配合，趋势不是单日脉冲，更接近阶段性共振推进',
      severity: 'positive',
    });
  }

  if (volumePrice.tags.includes('healthy_pullback')) {
    signals.push({
      type: 'volume_price_healthy_pullback',
      indicator: 'volume_price',
      label: '缩量回踩健康',
      guidance: '上升趋势中的回踩伴随量能递减，筹码松动有限，若再度放量上攻更值得关注',
      severity: 'info',
    });
  }

  return signals;
}

// -----------------------------------------------------------
// CCI — Commodity Channel Index
// -----------------------------------------------------------
export function calcCCI(highs: number[], lows: number[], closes: number[], period = 14): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) { result.push(null); continue; }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sum += (highs[j] + lows[j] + closes[j]) / 3;
    }
    const tp = (highs[i] + lows[i] + closes[i]) / 3;
    const ma = sum / period;
    let mad = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const tpj = (highs[j] + lows[j] + closes[j]) / 3;
      mad += Math.abs(tpj - ma);
    }
    mad /= period;
    result.push(mad > 0 ? (tp - ma) / (0.015 * mad) : 0);
  }
  return result;
}

// -----------------------------------------------------------
// OBV — On-Balance Volume
// -----------------------------------------------------------
export function calcOBV(closes: number[], volumes: number[]): (number | null)[] {
  const result: (number | null)[] = [volumes[0] ?? null];
  for (let i = 1; i < closes.length; i++) {
    const prev = result[i - 1];
    if (prev === null) { result.push(null); continue; }
    if (closes[i] > closes[i - 1]) result.push(prev + volumes[i]);
    else if (closes[i] < closes[i - 1]) result.push(prev - volumes[i]);
    else result.push(prev);
  }
  return result;
}

// -----------------------------------------------------------
// PSY — Psychological Line
// -----------------------------------------------------------
export function calcPSY(closes: number[], period = 24): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) { result.push(null); continue; }
    let upDays = 0;
    for (let j = i - period + 1; j <= i; j++) {
      if (closes[j] > closes[j - 1]) upDays++;
    }
    result.push((upDays / period) * 100);
  }
  return result;
}

// -----------------------------------------------------------
// DMI — Directional Movement Index (simplified: PDI / MDI)
// -----------------------------------------------------------
export function calcDMI(highs: number[], lows: number[], closes: number[], period = 14): {
  pdi: (number | null)[]; mdi: (number | null)[];
} {
  const up: (number | null)[] = [null];
  const down: (number | null)[] = [null];
  const tr: (number | null)[] = [null];
  for (let i = 1; i < closes.length; i++) {
    up.push(highs[i] - highs[i - 1] > lows[i - 1] - lows[i] ? Math.max(0, highs[i] - highs[i - 1]) : 0);
    down.push(lows[i - 1] - lows[i] > highs[i] - highs[i - 1] ? Math.max(0, lows[i - 1] - lows[i]) : 0);
    tr.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1])));
  }
  const trSmooth = calcSMMA(tr as number[], period);
  const upSmooth = calcSMMA(up as number[], period);
  const downSmooth = calcSMMA(down as number[], period);
  const pdi: (number | null)[] = [];
  const mdi: (number | null)[] = [];
  for (let i = 0; i < closes.length; i++) {
    const t = trSmooth[i];
    pdi.push(t !== null && t > 0 ? (upSmooth[i] ?? 0) / t * 100 : null);
    mdi.push(t !== null && t > 0 ? (downSmooth[i] ?? 0) / t * 100 : null);
  }
  return { pdi, mdi };
}

// Smoothed Moving Average (Wilder's method, used in DMI)
function calcSMMA(values: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    if (i < period) {
      sum += values[i];
      result.push(null);
      if (i === period - 1) result[result.length - 1] = sum / period;
      continue;
    }
    const prev = result[i - 1];
    result.push(prev !== null ? (prev * (period - 1) + values[i]) / period : null);
  }
  return result;
}

// -----------------------------------------------------------
// SAR — Parabolic Stop and Reverse
// -----------------------------------------------------------
export function calcSAR(highs: number[], lows: number[], closes: number[], acceleration = 0.02, maxAcc = 0.2): (number | null)[] {
  const result: (number | null)[] = [];
  if (closes.length < 3) return closes.map(() => null);
  let isUp = closes[1] >= closes[0];
  let sar = isUp ? lows.slice(0, 2).reduce((a, b) => Math.min(a, b), Infinity) : highs.slice(0, 2).reduce((a, b) => Math.max(a, b), -Infinity);
  let ep = isUp ? highs.slice(0, 2).reduce((a, b) => Math.max(a, b), -Infinity) : lows.slice(0, 2).reduce((a, b) => Math.min(a, b), Infinity);
  let af = acceleration;
  result.push(null);
  result.push(sar);
  for (let i = 2; i < closes.length; i++) {
    sar = sar + af * (ep - sar);
    if (isUp) {
      sar = Math.min(sar, lows[i - 1], lows[i - 2] ?? lows[i - 1]);
      if (lows[i] < sar) { isUp = false; sar = ep; af = acceleration; ep = lows[i]; }
      else { if (highs[i] > ep) { ep = highs[i]; af = Math.min(af + acceleration, maxAcc); } }
    } else {
      sar = Math.max(sar, highs[i - 1], highs[i - 2] ?? highs[i - 1]);
      if (highs[i] > sar) { isUp = true; sar = ep; af = acceleration; ep = highs[i]; }
      else { if (lows[i] < ep) { ep = lows[i]; af = Math.min(af + acceleration, maxAcc); } }
    }
    result.push(sar);
  }
  return result;
}

// -----------------------------------------------------------
// MOM — Momentum
// -----------------------------------------------------------
export function calcMOM(closes: number[], period = 10): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period) { result.push(null); continue; }
    result.push(closes[i] - closes[i - period]);
  }
  return result;
}

// -----------------------------------------------------------
// ATR — Average True Range
// -----------------------------------------------------------
export function calcATR(highs: number[], lows: number[], closes: number[], period = 14): (number | null)[] {
  const tr: (number | null)[] = [null];
  for (let i = 1; i < closes.length; i++) {
    tr.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1])));
  }
  return calcSMMA(tr as number[], period);
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
  const { data } = await fetchStockKlineWithFallback(tencentCode, 'day', count);
  return data;
}
