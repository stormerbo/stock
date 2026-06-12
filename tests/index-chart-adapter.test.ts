import test from 'node:test';
import assert from 'node:assert/strict';

import {
  eastmoneyIndexKlt,
  mapIndexMinutePoints,
} from '../src/popup/index-chart-adapter.ts';

test('eastmoney index kline period maps day week month correctly', () => {
  assert.equal(eastmoneyIndexKlt('day'), 101);
  assert.equal(eastmoneyIndexKlt('week'), 102);
  assert.equal(eastmoneyIndexKlt('month'), 103);
});

test('mapIndexMinutePoints converts eastmoney intraday bars into incremental volumes', () => {
  const points = mapIndexMinutePoints([
    { date: '2026-06-12 09:30', open: 3400, close: 3401, high: 3402, low: 3399, volume: 1000 },
    { date: '2026-06-12 09:31', open: 3401, close: 3403, high: 3404, low: 3400, volume: 2500 },
  ]);

  assert.deepEqual(points, [
    { time: '09:30', price: 3401, cumulativeVolume: 1000, volume: 1000 },
    { time: '09:31', price: 3403, cumulativeVolume: 2500, volume: 1500 },
  ]);
});
