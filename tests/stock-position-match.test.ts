import test from 'node:test';
import assert from 'node:assert/strict';

import { buildStockPositionMap, getStockPositionByHoldingCode } from '../src/popup/utils/stock-position-match.ts';
import type { StockPosition } from '../src/shared/fetch.ts';

test('stock position matching treats legacy prefixed codes and normalized holding codes as the same stock', () => {
  const positions: StockPosition[] = [
    {
      code: 'sh688001',
      name: '华兴源创',
      shares: 0,
      cost: 0,
      price: 81.41,
      prevClose: 79.5,
      floatingPnl: Number.NaN,
      dailyPnl: Number.NaN,
      dailyChangePct: 2.4,
      suspended: false,
      updatedAt: '14:23:50',
    },
  ];

  const map = buildStockPositionMap(positions);
  const matched = getStockPositionByHoldingCode(map, '688001');

  assert.equal(matched?.name, '华兴源创');
  assert.equal(matched?.price, 81.41);
});
