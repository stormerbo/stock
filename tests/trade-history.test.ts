import test from 'node:test';
import assert from 'node:assert/strict';

import { computeDailyPnlFromTrades, type StockTradeRecord } from '../src/shared/trade-history.ts';

function makeTrade(partial: Partial<StockTradeRecord> & Pick<StockTradeRecord, 'stockCode' | 'date' | 'type' | 'shares' | 'price'>): StockTradeRecord {
  return {
    id: partial.id ?? `${partial.type}-${partial.date}-${partial.shares}-${partial.price}`,
    stockCode: partial.stockCode,
    date: partial.date,
    type: partial.type,
    shares: partial.shares,
    price: partial.price,
    total: partial.total,
    fees: partial.fees,
    commission: partial.commission,
    stampTax: partial.stampTax,
    transferFee: partial.transferFee,
    note: partial.note,
    createdAt: partial.createdAt ?? `${partial.date}T09:30:00.000Z`,
  };
}

test('computeDailyPnlFromTrades uses opening market value for overnight positions', () => {
  const result = computeDailyPnlFromTrades([
    makeTrade({ stockCode: '600000', date: '2026-05-21', type: 'buy', shares: 100, price: 9 }),
  ], 12, 10, '2026-05-22');

  assert.equal(result.pnl, 200);
  assert.equal(result.baseAmount, 1000);
  assert.equal(result.changePct, 20);
});

test('computeDailyPnlFromTrades includes same-day round-trip realized pnl and fees', () => {
  const result = computeDailyPnlFromTrades([
    makeTrade({ stockCode: '600000', date: '2026-05-22', type: 'buy', shares: 100, price: 10, commission: 10, createdAt: '2026-05-22T09:31:00.000Z' }),
    makeTrade({ stockCode: '600000', date: '2026-05-22', type: 'sell', shares: 100, price: 11, commission: 11, createdAt: '2026-05-22T10:15:00.000Z' }),
  ], 11, 10, '2026-05-22');

  assert.equal(result.pnl, 79);
  assert.equal(result.baseAmount, 1010);
  assert.ok(Math.abs(result.changePct - 7.82) < 0.001);
});

test('computeDailyPnlFromTrades handles mixed overnight and same-day trades without switching formula', () => {
  const result = computeDailyPnlFromTrades([
    makeTrade({ stockCode: '600000', date: '2026-05-21', type: 'buy', shares: 100, price: 9 }),
    makeTrade({ stockCode: '600000', date: '2026-05-22', type: 'buy', shares: 50, price: 11, createdAt: '2026-05-22T09:35:00.000Z' }),
    makeTrade({ stockCode: '600000', date: '2026-05-22', type: 'sell', shares: 80, price: 12, commission: 8, createdAt: '2026-05-22T10:00:00.000Z' }),
  ], 12, 10, '2026-05-22');

  assert.equal(result.pnl, 242);
  assert.equal(result.baseAmount, 1550);
  assert.ok(Math.abs(result.changePct - 15.61) < 0.001);
});
