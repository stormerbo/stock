import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseGoldQuoteRows,
  type GoldQuote,
} from '../src/shared/fetch.ts';

test('parseGoldQuoteRows maps eastmoney rows into domestic and international gold quotes', () => {
  const quotes = parseGoldQuoteRows([
    {
      source: 'eastmoney-ulist',
      secid: '118.AU9999',
      code: 'AU9999',
      label: '国内现货金',
      market: 'domestic',
      unit: '元/克',
      row: { f2: 944.98, f3: 0.42, f4: 3.97, f12: 'AU9999', f13: 118, f14: '黄金9999', f18: 941.01, f124: 1781060460 },
    },
    {
      source: 'eastmoney-ulist',
      secid: '118.SHAU',
      code: 'SHAU',
      label: '上海金',
      market: 'domestic',
      unit: '元/克',
      row: { f2: 946.07, f3: 0.31, f4: 2.9, f12: 'SHAU', f13: 118, f14: '上海金', f18: 943.17, f124: 1781060460 },
    },
    {
      source: 'eastmoney-ulist',
      secid: '122.XAU',
      code: 'XAU',
      label: '国际现货金',
      market: 'international',
      unit: '美元/盎司',
      row: { f2: 4173.59, f3: -2.02, f4: -85.93, f12: 'XAU', f13: 122, f14: '黄金/美元', f18: 4259.52, f124: 1781060487 },
    },
    {
      source: 'eastmoney-ulist',
      secid: '101.GC00Y',
      code: 'GC00Y',
      label: 'COMEX 黄金',
      market: 'international',
      unit: '美元/盎司',
      row: { f2: 4202.4, f3: -1.96, f4: -84, f12: 'GC00Y', f13: 101, f14: 'COMEX黄金', f18: 4286.4, f124: 1781059887 },
    },
  ]);

  assert.equal(quotes.length, 4);
  assert.deepEqual(
    quotes.map((quote) => [quote.code, quote.label, quote.market, quote.unit]),
    [
      ['cn_spot_gold', '国内现货金', 'domestic', '元/克'],
      ['sh_gold', '上海金', 'domestic', '元/克'],
      ['intl_spot_gold', '国际现货金', 'international', '美元/盎司'],
      ['comex_gold', 'COMEX 黄金', 'international', '美元/盎司'],
    ],
  );
  assert.equal(quotes[0].price, 944.98);
  assert.equal(quotes[2].changePct, -2.02);
  assert.match(quotes[3].updatedAt, /^\d{2}:\d{2}:\d{2}$/);
});

test('parseGoldQuoteRows converts invalid numeric fields into NaN but preserves metadata', () => {
  const [quote] = parseGoldQuoteRows([
    {
      source: 'eastmoney-ulist',
      secid: '122.XAU',
      code: 'XAU',
      label: '国际现货金',
      market: 'international',
      unit: '美元/盎司',
      row: { f2: '-', f3: '', f4: null, f12: 'XAU', f13: 122, f14: '黄金/美元', f18: undefined, f124: 'bad' },
    },
  ]);

  assert.equal(quote.label, '国际现货金');
  assert.equal(quote.market, 'international');
  assert.equal(Number.isNaN(quote.price), true);
  assert.equal(Number.isNaN(quote.change), true);
  assert.equal(Number.isNaN(quote.changePct), true);
  assert.equal(quote.updatedAt, '-');
});

test('parseGoldQuoteRows keeps stable output ordering for page sections', () => {
  const quotes = parseGoldQuoteRows([
    {
      source: 'eastmoney-ulist',
      secid: '101.GC00Y',
      code: 'GC00Y',
      label: 'COMEX 黄金',
      market: 'international',
      unit: '美元/盎司',
      row: { f2: 4202.4, f3: -1.96, f4: -84, f12: 'GC00Y', f13: 101, f14: 'COMEX黄金', f18: 4286.4, f124: 1781059887 },
    },
    {
      source: 'eastmoney-ulist',
      secid: '118.AU9999',
      code: 'AU9999',
      label: '国内现货金',
      market: 'domestic',
      unit: '元/克',
      row: { f2: 944.98, f3: 0.42, f4: 3.97, f12: 'AU9999', f13: 118, f14: '黄金9999', f18: 941.01, f124: 1781060460 },
    },
  ]);

  assert.deepEqual(quotes.map((quote: GoldQuote) => quote.code), ['cn_spot_gold', 'comex_gold']);
});
