import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseEastmoneyIntradayTrends,
  parseEastmoneyKlineRows,
  parseTencentKlineRows,
  parseTencentMinuteRows,
} from '../src/shared/stock-chart-sources.ts';

test('parseEastmoneyIntradayTrends normalizes trend rows into minute kline points', () => {
  const points = parseEastmoneyIntradayTrends([
    '2026-06-12 09:30,0.00,1272.00,1272.00,1272.00,600,76320000.00,1272.000',
    '2026-06-12 09:31,1272.00,1272.85,1272.85,1268.00,1101,139925633.00,1271.285',
  ]);

  assert.equal(points.length, 2);
  assert.equal(points[0]?.date, '2026-06-12 09:30');
  assert.equal(points[0]?.open, 1272);
  assert.equal(points[1]?.close, 1272.85);
  assert.equal(points[1]?.low, 1268);
});

test('parseEastmoneyKlineRows normalizes kline rows', () => {
  const points = parseEastmoneyKlineRows([
    '2026-06-12,1272.00,1272.85,1278.00,1268.00,1101,139925633.00,0.0,0.0,0.0,0.0',
  ]);

  assert.equal(points.length, 1);
  assert.equal(points[0]?.open, 1272);
  assert.equal(points[0]?.close, 1272.85);
  assert.equal(points[0]?.volume, 1101);
});

test('parseTencentMinuteRows normalizes Tencent minute payload', () => {
  const points = parseTencentMinuteRows(['0930 1272.00 100', '0931 1272.85 180'], '20260612', 1270);

  assert.equal(points.length, 2);
  assert.equal(points[0]?.date, '2026-06-12 09:30');
  assert.equal(points[0]?.open, 1270);
  assert.equal(points[0]?.close, 1272);
  assert.equal(points[1]?.volume, 80);
});

test('parseTencentKlineRows skips malformed rows and keeps valid rows', () => {
  const points = parseTencentKlineRows([
    ['2026-06-12', '1272', '1272.85', '1278', '1268', '1101'],
    ['bad'],
  ]);

  assert.equal(points.length, 1);
  assert.equal(points[0]?.high, 1278);
});
