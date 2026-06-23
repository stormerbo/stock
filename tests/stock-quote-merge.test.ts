import test from 'node:test';
import assert from 'node:assert/strict';

import { mergeStockQuoteSources, type StockPosition } from '../src/shared/fetch.ts';

test('mergeStockQuoteSources falls back to secondary quote when primary price is zero', () => {
  const primary: StockPosition[] = [
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
      suspended: false,
      updatedAt: '08:30:16',
    },
  ];
  const fallback: StockPosition[] = [
    {
      code: '688146',
      name: '中船特气',
      shares: 100,
      cost: 10,
      price: 389.99,
      prevClose: 389.99,
      floatingPnl: 37999,
      dailyPnl: 0,
      dailyChangePct: 0,
      suspended: true,
      updatedAt: '14:27:40',
    },
  ];

  const merged = mergeStockQuoteSources(primary, fallback);

  assert.equal(merged[0]?.price, 389.99);
  assert.equal(merged[0]?.suspended, true);
  assert.equal(merged[0]?.updatedAt, '14:27:40');
});

test('mergeStockQuoteSources keeps primary quote when primary price is valid', () => {
  const primary: StockPosition[] = [
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
      suspended: false,
      updatedAt: '14:23:50',
    },
  ];
  const fallback: StockPosition[] = [
    {
      code: '688001',
      name: '华兴源创',
      shares: 100,
      cost: 80,
      price: 81.4,
      prevClose: 79.5,
      floatingPnl: 140,
      dailyPnl: 190,
      dailyChangePct: 2.39,
      suspended: false,
      updatedAt: '14:23:49',
    },
  ];

  const merged = mergeStockQuoteSources(primary, fallback);

  assert.equal(merged[0]?.price, 81.41);
  assert.equal(merged[0]?.updatedAt, '14:23:50');
});

test('mergeStockQuoteSources prefers fallback when it provides suspended status for the same valid price', () => {
  const primary: StockPosition[] = [
    {
      code: '688146',
      name: '中船特气',
      shares: 100,
      cost: 10,
      price: 389.99,
      prevClose: 389.99,
      floatingPnl: 37999,
      dailyPnl: 0,
      dailyChangePct: 0,
      suspended: false,
      updatedAt: '15:19:16',
    },
  ];
  const fallback: StockPosition[] = [
    {
      code: '688146',
      name: '中船特气',
      shares: 100,
      cost: 10,
      price: 389.99,
      prevClose: 389.99,
      floatingPnl: 37999,
      dailyPnl: 0,
      dailyChangePct: 0,
      suspended: true,
      updatedAt: '15:19:37',
    },
  ];

  const merged = mergeStockQuoteSources(primary, fallback);

  assert.equal(merged[0]?.suspended, true);
  assert.equal(merged[0]?.updatedAt, '15:19:37');
});
