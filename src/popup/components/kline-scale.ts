export type KlinePointLike = {
  open: number;
  high: number;
  low: number;
  close: number;
};

function finiteOrNaN(value: number): number {
  return Number.isFinite(value) ? value : Number.NaN;
}

function getSortedFinite(values: number[]): number[] {
  return values.filter(Number.isFinite).sort((a, b) => a - b);
}

export function computeKlinePriceBounds(points: KlinePointLike[]): { min: number; max: number } {
  const validPoints = points.filter((point) =>
    [point.open, point.high, point.low, point.close].every(Number.isFinite),
  );
  if (validPoints.length === 0) {
    return { min: 0, max: 1 };
  }

  const highs = getSortedFinite(validPoints.map((point) => point.high));
  const lows = getSortedFinite(validPoints.map((point) => point.low));

  const actualMin = finiteOrNaN(lows[0] ?? Number.NaN);
  const actualMax = finiteOrNaN(highs[highs.length - 1] ?? Number.NaN);
  if (!Number.isFinite(actualMin) || !Number.isFinite(actualMax)) {
    return { min: 0, max: 1 };
  }

  const actualRange = Math.max(actualMax - actualMin, Math.max(actualMax * 0.0005, 0.01));
  const actualPad = Math.max(actualRange * 0.03, actualMax * 0.001, 0.01);

  if (validPoints.length < 5) {
    return {
      min: actualMin - actualPad,
      max: actualMax + actualPad,
    };
  }

  const trimCount = Math.max(1, Math.floor(validPoints.length * 0.08));
  const trimmedLow = finiteOrNaN(lows[Math.min(trimCount, lows.length - 1)] ?? Number.NaN);
  const trimmedHigh = finiteOrNaN(highs[Math.max(0, highs.length - 1 - trimCount)] ?? Number.NaN);

  if (!Number.isFinite(trimmedLow) || !Number.isFinite(trimmedHigh)) {
    return {
      min: actualMin - actualPad,
      max: actualMax + actualPad,
    };
  }

  const trimmedRange = Math.max(trimmedHigh - trimmedLow, Math.max(trimmedHigh * 0.0005, 0.01));
  const outlierRatio = actualRange / trimmedRange;

  if (outlierRatio > 1.6) {
    const tightPad = Math.max(trimmedRange * 0.035, actualMax * 0.001, 0.01);
    const highOutlierGap = actualMax - trimmedHigh;
    const lowOutlierGap = trimmedLow - actualMin;
    const trimHigh = highOutlierGap > lowOutlierGap * 1.5 && highOutlierGap > actualRange * 0.12;
    const trimLow = lowOutlierGap > highOutlierGap * 1.5 && lowOutlierGap > actualRange * 0.12;
    if (trimHigh && trimLow) {
      return {
        min: trimmedLow - tightPad,
        max: trimmedHigh + tightPad,
      };
    }
    if (trimHigh) {
      return {
        min: actualMin - tightPad,
        max: trimmedHigh + tightPad,
      };
    }
    if (trimLow) {
      return {
        min: trimmedLow - tightPad,
        max: actualMax + tightPad,
      };
    }
    return {
      min: actualMin - actualPad,
      max: actualMax + actualPad,
    };
  }

  return {
    min: actualMin - actualPad,
    max: actualMax + actualPad,
  };
}

export function shouldShowMinuteOnlySignals(period: string): boolean {
  return period === 'minute';
}
