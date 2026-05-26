import test from 'node:test';
import assert from 'node:assert/strict';

import { getStockLimitPct } from '../src/shared/stock-limit.ts';

test('getStockLimitPct resolves common mainland stock limit tiers', () => {
  assert.equal(getStockLimitPct('600000', '浦发银行'), 0.1);
  assert.equal(getStockLimitPct('688001', '华兴源创'), 0.2);
  assert.equal(getStockLimitPct('300750', '宁德时代'), 0.2);
  assert.equal(getStockLimitPct('830000', '北交所示例'), 0.3);
});

test('getStockLimitPct uses the ST rule when the name is marked special treatment', () => {
  assert.equal(getStockLimitPct('000001', 'ST深发展A'), 0.05);
  assert.equal(getStockLimitPct('600000', '*ST浦发'), 0.05);
});
