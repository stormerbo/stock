// -----------------------------------------------------------
// Risk metrics — max drawdown & volatility calculations
// -----------------------------------------------------------

export type MaxDrawdownResult = {
  maxDrawdown: number;      // e.g. -0.2534 = -25.34%
  peakDate: string;
  troughDate: string;
  peakIndex: number;
  troughIndex: number;
};

export type VolatilityResult = {
  dailyVolatility: number;
  annualizedVolatility: number;
};

/**
 * 计算最大回撤
 * @param closePrices 收盘价数组（按时间顺序）
 * @param dates 对应日期字符串数组
 */
export function calcMaxDrawdown(
  closePrices: number[],
  dates: string[]
): MaxDrawdownResult | null {
  if (closePrices.length < 2) return null;

  let peakPrice = closePrices[0];
  let peakIndex = 0;
  let maxDrawdown = 0;
  let troughIndex = 0;

  for (let i = 1; i < closePrices.length; i++) {
    const price = closePrices[i];
    if (!Number.isFinite(price)) continue;

    if (price > peakPrice) {
      peakPrice = price;
      peakIndex = i;
    }

    const drawdown = (price - peakPrice) / peakPrice;
    if (drawdown < maxDrawdown) {
      maxDrawdown = drawdown;
      troughIndex = i;
    }
  }

  if (maxDrawdown >= 0) return null; // never had a drawdown

  return {
    maxDrawdown,
    peakDate: dates[peakIndex] ?? '',
    troughDate: dates[troughIndex] ?? '',
    peakIndex,
    troughIndex,
  };
}

/**
 * 计算波动率（日波动率和年化波动率）
 * @param closePrices 收盘价数组（按时间顺序）
 */
export function calcVolatility(closePrices: number[]): VolatilityResult | null {
  if (closePrices.length < 3) return null;

  // 计算日收益率
  const dailyReturns: number[] = [];
  for (let i = 1; i < closePrices.length; i++) {
    const prev = closePrices[i - 1];
    const curr = closePrices[i];
    if (!Number.isFinite(prev) || !Number.isFinite(curr) || prev === 0) continue;
    dailyReturns.push((curr - prev) / prev);
  }

  if (dailyReturns.length < 2) return null;

  // 计算标准差
  const mean = dailyReturns.reduce((s, r) => s + r, 0) / dailyReturns.length;
  const variance = dailyReturns.reduce((s, r) => s + (r - mean) ** 2, 0) / (dailyReturns.length - 1);
  const dailyVol = Math.sqrt(variance);

  return {
    dailyVolatility: dailyVol,
    annualizedVolatility: dailyVol * Math.sqrt(252),
  };
}

/**
 * 从 K-line 数据计算最大回撤的便捷包装
 */
export function calcMaxDrawdownFromKline(
  kline: Array<{ date: string; close: number }>
): MaxDrawdownResult | null {
  const prices = kline.map(k => k.close);
  const dates = kline.map(k => k.date);
  return calcMaxDrawdown(prices, dates);
}

/**
 * 从 K-line 数据计算波动率的便捷包装
 */
export function calcVolatilityFromKline(
  kline: Array<{ close: number }>
): VolatilityResult | null {
  const prices = kline.map(k => k.close);
  return calcVolatility(prices);
}
