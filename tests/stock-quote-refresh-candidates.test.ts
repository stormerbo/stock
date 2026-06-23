import test from 'node:test';
import assert from 'node:assert/strict';

import { getStockQuoteRefreshCandidates } from '../src/popup/utils/stock-quote-refresh.ts';
import type { StockHoldingConfig, StockPosition } from '../src/shared/fetch.ts';

test('getStockQuoteRefreshCandidates includes holdings whose cached quote price is zero', () => {
  const holdings: StockHoldingConfig[] = [
    { code: '688146', shares: 100, cost: 10 },
    { code: '688001', shares: 100, cost: 80 },
  ];
  const positions: StockPosition[] = [
    {
      code: '688146',
      name: '中船特气',
      shares: 100,
      cost: 10,
      price: 0,
      prevClose: 389.99,
      floatingPnl: -1000,
      dailyPnl: -38999,
      dailyChangePct: 0,
      updatedAt: '08:30:16',
    },
    {
      code: '688001',
      name: '华兴源创',
      shares: 100,
      cost: 80,
      price: 81.41,
      prevClose: 79.5,
      floatingPnl: 141,
      dailyPnl: 191,
      dailyChangePct: 2.4,
      updatedAt: '14:23:50',
    },
  ];

  const candidates = getStockQuoteRefreshCandidates(holdings, positions);
  assert.deepEqual(candidates.map((item) => item.code), ['688146']);
});
