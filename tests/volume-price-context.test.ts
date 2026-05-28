import test from 'node:test';
import assert from 'node:assert/strict';

import { detectAllSignals, type KlinePoint } from '../src/shared/technical-analysis.ts';
import { assessVolumePriceContext } from '../src/shared/volume-price-context.ts';

function buildKline(
  closes: number[],
  volumes: number[],
  wiggle = 1.2,
): KlinePoint[] {
  return closes.map((close, index) => {
    const prev = index > 0 ? closes[index - 1] : close - 0.4;
    const open = index === 0 ? close - 0.2 : prev;
    const high = Math.max(open, close) + wiggle;
    const low = Math.min(open, close) - wiggle;
    return {
      date: `2026-05-${String(index + 1).padStart(2, '0')}`,
      open,
      close,
      high,
      low,
      volume: volumes[index],
    };
  });
}

test('assessVolumePriceContext marks a breakout with expanding volume as bullish confirmation', () => {
  const closes = [
    100, 100.4, 100.8, 101.2, 101.7,
    102.1, 102.4, 102.8, 103.1, 103.6,
    104.1, 104.5, 105, 105.4, 105.9,
    106.3, 106.8, 107.1, 107.6, 108,
    108.8, 109.4, 110.1, 111.2, 112.6,
  ];
  const volumes = [
    100, 102, 98, 101, 99,
    100, 103, 101, 102, 100,
    99, 101, 102, 100, 103,
    101, 100, 102, 101, 103,
    165, 188, 212, 245, 280,
  ];

  const assessment = assessVolumePriceContext(buildKline(closes, volumes));

  assert.equal(assessment.summary, 'bullish');
  assert.ok(assessment.directionScore > 35);
  assert.ok(assessment.tags.includes('bull_confirmed'));
  assert.ok(assessment.volumeRatio > 1.6);
});

test('assessVolumePriceContext flags a rising price move with weak volume as unconfirmed', () => {
  const closes = [
    100, 100.3, 100.7, 101, 101.2,
    101.5, 101.9, 102.1, 102.5, 102.8,
    103.1, 103.3, 103.7, 104, 104.2,
    104.6, 104.9, 105.1, 105.4, 105.8,
    106.1, 106.3, 106.6, 106.9, 107.1,
  ];
  const volumes = [
    140, 142, 138, 141, 139,
    140, 143, 141, 142, 140,
    139, 141, 142, 140, 143,
    141, 140, 142, 141, 143,
    78, 75, 72, 69, 66,
  ];

  const assessment = assessVolumePriceContext(buildKline(closes, volumes, 0.9));

  assert.ok(assessment.directionScore > 0);
  assert.ok(assessment.tags.includes('bull_unconfirmed'));
  assert.ok(!assessment.tags.includes('bull_confirmed'));
  assert.ok(assessment.riskScore >= 0);
});

test('detectAllSignals adds a volume-price confirmation signal for technical reports', () => {
  const closes = [
    100, 100.4, 100.8, 101.2, 101.7,
    102.1, 102.4, 102.8, 103.1, 103.6,
    104.1, 104.5, 105, 105.4, 105.9,
    106.3, 106.8, 107.1, 107.6, 108,
    108.8, 109.4, 110.1, 111.2, 112.6,
    113.2, 113.8, 114.6, 115.4, 116.1,
  ];
  const volumes = [
    100, 102, 98, 101, 99,
    100, 103, 101, 102, 100,
    99, 101, 102, 100, 103,
    101, 100, 102, 101, 103,
    165, 188, 212, 245, 280,
    260, 275, 292, 305, 318,
  ];

  const signals = detectAllSignals(buildKline(closes, volumes));

  assert.ok(signals.some((signal) => signal.type === 'volume_price_bull_confirmed'));
});

test('assessVolumePriceContext rewards multi-day volume-price follow-through instead of only the last session', () => {
  const closes = [
    100, 99.8, 100.1, 100.4, 100.7,
    101, 101.4, 101.8, 102.2, 102.7,
    103.1, 103.6, 104.2, 104.9, 105.7,
    106.6, 107.8, 109.1, 110.5, 112,
    113.4, 114.6, 115.7, 116.6, 117.4,
  ];
  const volumes = [
    96, 99, 97, 98, 100,
    101, 104, 106, 108, 111,
    115, 118, 123, 128, 136,
    145, 158, 174, 191, 205,
    214, 226, 235, 244, 248,
  ];

  const assessment = assessVolumePriceContext(buildKline(closes, volumes));

  assert.equal(assessment.summary, 'bullish');
  assert.ok(assessment.directionScore >= 70);
  assert.ok(assessment.tags.includes('trend_follow_through'));
});

test('assessVolumePriceContext detects stage divergence using prior swing confirmation, not just the latest close', () => {
  const closes = [
    100, 101.2, 102.5, 103.8, 105,
    106.2, 107.5, 108.7, 109.9, 111.2,
    112.5, 113.7, 114.8, 116, 117.1,
    116.4, 115.6, 114.9, 114.3, 114.8,
    115.4, 116.1, 116.9, 117.6, 118.2,
  ];
  const volumes = [
    120, 130, 140, 150, 165,
    180, 198, 216, 234, 252,
    272, 290, 306, 322, 338,
    155, 148, 142, 137, 132,
    126, 122, 118, 114, 110,
  ];

  const assessment = assessVolumePriceContext(buildKline(closes, volumes, 1));

  assert.ok(assessment.tags.includes('bearish_divergence'));
  assert.ok(assessment.riskScore >= 20);
});

test('assessVolumePriceContext treats a shrinking-volume pullback inside an uptrend as healthy', () => {
  const closes = [
    100, 100.6, 101.2, 101.9, 102.7,
    103.5, 104.2, 105, 105.9, 106.8,
    107.7, 108.7, 109.8, 111, 112.2,
    113.4, 114.8, 116.1, 117.4, 118.6,
    119.4, 119.1, 118.8, 118.6, 118.9,
  ];
  const volumes = [
    100, 102, 104, 107, 111,
    116, 121, 127, 133, 140,
    148, 157, 168, 180, 193,
    207, 222, 238, 255, 272,
    208, 182, 159, 141, 136,
  ];

  const assessment = assessVolumePriceContext(buildKline(closes, volumes, 0.9));

  assert.equal(assessment.summary, 'bullish');
  assert.ok(assessment.tags.includes('healthy_pullback'));
  assert.ok(assessment.riskScore <= 5);
});

test('detectAllSignals surfaces follow-through and healthy pullback structure signals', () => {
  const followThroughCloses = [
    100, 99.8, 100.1, 100.4, 100.7,
    101, 101.4, 101.8, 102.2, 102.7,
    103.1, 103.6, 104.2, 104.9, 105.7,
    106.6, 107.8, 109.1, 110.5, 112,
    113.4, 114.6, 115.7, 116.6, 117.4,
    118.1, 118.9, 119.8, 120.7, 121.5,
  ];
  const followThroughVolumes = [
    96, 99, 97, 98, 100,
    101, 104, 106, 108, 111,
    115, 118, 123, 128, 136,
    145, 158, 174, 191, 205,
    214, 226, 235, 244, 248,
    255, 262, 268, 276, 284,
  ];
  const pullbackCloses = [
    97.5, 98.1, 98.8, 99.3, 99.8,
    100, 100.6, 101.2, 101.9, 102.7,
    103.5, 104.2, 105, 105.9, 106.8,
    107.7, 108.7, 109.8, 111, 112.2,
    113.4, 114.8, 116.1, 117.4, 118.6,
    119.4, 119.1, 118.8, 118.6, 118.9,
  ];
  const pullbackVolumes = [
    92, 95, 97, 99, 100,
    100, 102, 104, 107, 111,
    116, 121, 127, 133, 140,
    148, 157, 168, 180, 193,
    207, 222, 238, 255, 272,
    208, 182, 159, 141, 136,
  ];

  const followSignals = detectAllSignals(buildKline(followThroughCloses, followThroughVolumes));
  const pullbackSignals = detectAllSignals(buildKline(pullbackCloses, pullbackVolumes, 0.9));

  assert.ok(followSignals.some((signal) => signal.type === 'volume_price_follow_through'));
  assert.ok(pullbackSignals.some((signal) => signal.type === 'volume_price_healthy_pullback'));
});
