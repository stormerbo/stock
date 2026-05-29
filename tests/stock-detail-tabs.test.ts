import test from 'node:test';
import assert from 'node:assert/strict';

import { getStockDetailTabs } from '../src/popup/views/stock-detail-tabs.ts';

test('getStockDetailTabs always exposes the trades tab', () => {
  const tabs = getStockDetailTabs(0);
  assert.equal(tabs.at(-1)?.value, 'trades');
  assert.equal(tabs.at(-1)?.label, '交易');
});

test('getStockDetailTabs keeps trades tab label stable when there are records', () => {
  const tabs = getStockDetailTabs(3);
  assert.equal(tabs.at(-1)?.value, 'trades');
  assert.equal(tabs.at(-1)?.label, '交易');
});
