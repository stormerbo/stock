import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseGoldIntradayRows,
  parseGoldKlineRows,
} from '../src/shared/fetch.ts';

test('parseGoldIntradayRows normalizes eastmoney trend rows into chart points', () => {
  const parsed = parseGoldIntradayRows([
    '2026-06-10 08:00,4333.40,4333.40,4333.40,4333.40,0,0.00,0.000',
    '2026-06-10 08:01,4333.40,4335.20,4335.20,4333.40,12,52000.00,4334.300',
    '2026-06-10 08:02,4335.10,4334.90,4335.50,4334.80,8,33000.00,4334.500',
  ], 4333.4);

  assert.equal(parsed.prevClose, 4333.4);
  assert.deepEqual(parsed.data.map((item) => item.time), ['08:00', '08:01', '08:02']);
  assert.equal(parsed.data[1]?.price, 4335.2);
});

test('parseGoldIntradayRows ignores malformed rows without crashing', () => {
  const parsed = parseGoldIntradayRows([
    'bad row',
    '2026-06-10 08:01,4333.40,4335.20,4335.20,4333.40,12,52000.00,4334.300',
  ], 4333.4);

  assert.equal(parsed.data.length, 1);
  assert.equal(parsed.data[0]?.time, '08:01');
});

test('parseGoldKlineRows normalizes eastmoney kline rows for day week and month periods', () => {
  const rows = [
    '2026-06-10,4333.40,4335.20,4336.80,4329.50,0,0.00,0.00,0.04,1.80,0.00',
    '2026-06-11,4335.20,4342.10,4345.00,4332.10,0,0.00,0.00,0.16,6.90,0.00',
  ];

  const parsed = parseGoldKlineRows(rows);

  assert.equal(parsed.length, 2);
  assert.equal(parsed[0]?.open, 4333.4);
  assert.equal(parsed[1]?.close, 4342.1);
  assert.equal(parsed[1]?.high, 4345);
  assert.equal(parsed[1]?.low, 4332.1);
});

test('parseGoldKlineRows skips malformed OHLC rows', () => {
  const parsed = parseGoldKlineRows([
    'bad row',
    '2026-06-11,4335.20,4342.10,4345.00,4332.10,0,0.00,0.00,0.16,6.90,0.00',
  ]);

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.date, '2026-06-11');
});
