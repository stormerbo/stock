import test from 'node:test';
import assert from 'node:assert/strict';

import { calcStopSuggest, sanitizeStopSuggestionsCache } from '../src/shared/stop-suggest.ts';
import type { KlinePoint } from '../src/shared/technical-analysis.ts';

function buildKline(
  closes: number[],
  volumes: number[],
  wiggle = 1.1,
): KlinePoint[] {
  return closes.map((close, index) => {
    const prev = index > 0 ? closes[index - 1] : close - 0.3;
    const open = index === 0 ? close - 0.1 : prev;
    return {
      date: `2026-04-${String(index + 1).padStart(2, '0')}`,
      open,
      close,
      high: Math.max(open, close) + wiggle,
      low: Math.min(open, close) - wiggle,
      volume: volumes[index],
    };
  });
}

test('calcStopSuggest widens bullish confirmed setups and tightens bearish confirmed ones', () => {
  const baseHoldings = [
    { code: '600001', shares: 100, cost: 100 },
    { code: '600002', shares: 100, cost: 100 },
  ];

  const bullishCloses = [
    100, 100.5, 101, 101.5, 102,
    102.5, 103, 103.5, 104, 104.5,
    105, 105.5, 106, 106.5, 107,
    107.5, 108, 108.5, 109, 109.5,
    110.4, 111.1, 112, 113.2, 114.5,
  ];
  const bullishVolumes = [
    100, 101, 99, 102, 100,
    101, 100, 102, 101, 103,
    100, 102, 101, 103, 100,
    101, 102, 100, 101, 102,
    175, 198, 220, 246, 270,
  ];

  const bearishCloses = [
    100, 100.5, 101, 101.5, 102,
    102.5, 103, 103.5, 104, 104.5,
    105, 105.4, 105.8, 106.1, 106.3,
    106.5, 106.2, 105.8, 105.1, 104.4,
    103.5, 102.8, 101.9, 100.8, 99.6,
  ];
  const bearishVolumes = [
    100, 101, 99, 102, 100,
    101, 100, 102, 101, 103,
    100, 102, 101, 103, 100,
    101, 130, 148, 171, 195,
    220, 242, 265, 289, 314,
  ];

  const suggestions = calcStopSuggest(
    baseHoldings,
    {
      '600001': buildKline(bullishCloses, bullishVolumes),
      '600002': buildKline(bearishCloses, bearishVolumes),
    },
    {
      '600001': bullishCloses[bullishCloses.length - 1],
      '600002': bearishCloses[bearishCloses.length - 1],
    },
    {
      '600001': '放量上攻',
      '600002': '放量走弱',
    },
  );

  const bullish = suggestions.find((item) => item.code === '600001');
  const bearish = suggestions.find((item) => item.code === '600002');

  assert.ok(bullish);
  assert.ok(bearish);
  assert.ok(bullish!.assessmentTags.includes('bull_confirmed'));
  assert.ok(bearish!.assessmentTags.includes('bear_confirmed'));
  assert.ok(bullish!.stopFactor > 1);
  assert.ok(bullish!.rewardFactor > 1);
  assert.ok(bearish!.stopFactor < 1);
  assert.ok(bearish!.rewardFactor < 1);
  assert.ok((bullish!.currentPrice - bullish!.stopLoss) > (bearish!.currentPrice - bearish!.stopLoss));
});

test('sanitizeStopSuggestionsCache drops stale entries that predate the volume-price fields', () => {
  const stale = [
    {
      code: '600001',
      name: '旧缓存',
      currentPrice: 12.3,
      stopLoss: 11.5,
      takeProfit: 13.8,
      atr: 0.6,
      atrPct: 4.8,
      trendDirection: 'up',
      trendStrength: 0.5,
      calculatedAt: Date.now(),
    },
  ];

  assert.deepEqual(sanitizeStopSuggestionsCache(stale), []);
});
