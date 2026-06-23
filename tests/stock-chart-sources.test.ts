import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseEastmoneyIntradayTrends,
  parseEastmoneyKlineRows,
  parseTencentQuoteMetaPayload,
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

test('parseTencentQuoteMetaPayload marks suspended stocks from zero-volume quote payloads', () => {
  const active = parseTencentQuoteMetaPayload('1~华兴源创~688001~81.41~79.50~79.11~15208035~7725355~7482477~81.40~11~81.39~3~81.38~9~81.35~2~81.28~16~81.41~8~81.42~5~81.45~15~81.46~2~81.48~5~~20260623142350~1.91~2.40~84.98~76.00~81.41/15208035/1253700000~15208035~125370~3.22~338.65~S~84.98~76.00~11.30~383.90~383.90');
  const suspended = parseTencentQuoteMetaPayload('1~中船特气~688146~389.99~389.99~0.00~0~0~0~0.00~0~0.00~0~0.00~0~0.00~0~0.00~0~0.00~0~0.00~0~0.00~0~0.00~0~0.00~0~~20260623142737~0.00~0.00~0.00~0.00~389.99/0/0~0~0~0.00~573.30~S~0.00~0.00~0.00~565.37~2064.65');

  assert.equal(active.suspended, false);
  assert.equal(suspended.suspended, true);
  assert.equal(suspended.price, 389.99);
});
