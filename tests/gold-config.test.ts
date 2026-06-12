import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GOLD_INSTRUMENTS,
  getGoldInstrumentById,
  getGoldInstrumentsByMarket,
} from '../src/shared/gold-config.ts';

test('gold instrument registry keeps domestic and international grouping order stable', () => {
  assert.deepEqual(
    getGoldInstrumentsByMarket('domestic').map((item) => item.id),
    ['cn_spot_gold', 'sh_gold', 'gold_td', 'ny_gold_tn12'],
  );

  assert.deepEqual(
    getGoldInstrumentsByMarket('international').map((item) => item.id),
    ['intl_spot_gold', 'comex_gold', 'london_gold'],
  );
});

test('gold instrument registry exposes the expanded built-in gold set', () => {
  assert.equal(GOLD_INSTRUMENTS.length, 7);
  assert.deepEqual(
    GOLD_INSTRUMENTS.map((item) => item.label),
    ['国内现货金', '上海金', '黄金 T+D', '国际现货金', 'COMEX 黄金', '港伦敦金', '纽约金 TN12'],
  );
});

test('gold instrument registry stores quote and chart metadata for every instrument', () => {
  const instrument = getGoldInstrumentById('london_gold');

  assert.ok(instrument);
  assert.equal(instrument?.secid, '123.HLAU');
  assert.equal(instrument?.unit, '美元/盎司');
  assert.equal(instrument?.market, 'international');
  assert.deepEqual(instrument?.supportedPeriods, ['minute', 'day', 'week', 'month']);
});
