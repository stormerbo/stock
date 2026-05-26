import test from 'node:test';
import assert from 'node:assert/strict';

import { computeKlinePriceBounds, shouldShowMinuteOnlySignals } from '../src/popup/components/kline-scale.ts';

test('computeKlinePriceBounds keeps the visible range tight when one candle has an outlier wick', () => {
  const bars = [
    { open: 100, high: 101, low: 99.5, close: 100.2 },
    { open: 100.2, high: 101.1, low: 99.8, close: 100.1 },
    { open: 100.1, high: 101.2, low: 99.9, close: 100.4 },
    { open: 100.4, high: 130, low: 99.7, close: 100.3 },
    { open: 100.3, high: 101.3, low: 99.9, close: 100.6 },
    { open: 100.6, high: 101.4, low: 100, close: 100.8 },
  ];

  const bounds = computeKlinePriceBounds(bars);

  assert.ok(bounds.max - bounds.min < 15, 'expected a tighter scale than the raw outlier range');
  assert.ok(bounds.min <= 99.5);
  assert.ok(bounds.max >= 101.4);
});

test('shouldShowMinuteOnlySignals hides the summary block on non-minute periods', () => {
  assert.equal(shouldShowMinuteOnlySignals('minute'), true);
  assert.equal(shouldShowMinuteOnlySignals('day'), false);
  assert.equal(shouldShowMinuteOnlySignals('week'), false);
});
