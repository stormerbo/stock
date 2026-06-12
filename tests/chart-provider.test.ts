import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createChartProvider,
  type ChartProviderDeps,
} from '../src/shared/chart-provider.ts';

function makePoint(close: number) {
  return {
    date: '2026-06-12 09:30',
    open: close,
    close,
    high: close,
    low: close,
    volume: close * 10,
  };
}

function makeDeps(): ChartProviderDeps {
  return {
    fetchStockIntraday: async () => ({ source: 'eastmoney', data: [makePoint(11)] }),
    fetchStockKline: async (_code, period) => ({ source: 'eastmoney', data: [makePoint(period === 'month' ? 33 : 22)] }),
    fetchIndexIntraday: async () => ({ source: 'eastmoney', data: [makePoint(44)] }),
    fetchIndexKline: async (_code, period) => ({ source: 'eastmoney', data: [makePoint(period === 'month' ? 55 : 66)] }),
    fetchQuoteMeta: async (code, fallbackName) => ({
      name: fallbackName || code,
      price: 100,
      change: 1,
      changePct: 1,
      open: 99,
      prevClose: 98,
      high: 101,
      low: 97,
      volumeHands: 123,
      amountWanYuan: 456,
      turnoverRate: 1.2,
      peTtm: 12,
      totalMarketCapYi: 345,
      updatedAt: '10:00:00',
    }),
  };
}

test('stock minute uses stock intraday provider', async () => {
  const provider = createChartProvider(makeDeps());
  const result = await provider.fetchInstrumentIntraday({
    instrumentType: 'stock',
    code: '300758',
    period: 'minute',
  });

  assert.equal(result.source, 'eastmoney');
  assert.equal(result.data[0]?.close, 11);
});

test('index minute uses index intraday provider', async () => {
  const provider = createChartProvider(makeDeps());
  const result = await provider.fetchInstrumentIntraday({
    instrumentType: 'index',
    code: 'sh000001',
    period: 'minute',
  });

  assert.equal(result.source, 'eastmoney');
  assert.equal(result.data[0]?.close, 44);
});

test('index month kline uses index kline provider', async () => {
  const provider = createChartProvider(makeDeps());
  const result = await provider.fetchInstrumentKline({
    instrumentType: 'index',
    code: 'sh000001',
    period: 'month',
    count: 240,
  });

  assert.equal(result.source, 'eastmoney');
  assert.equal(result.data[0]?.close, 55);
});

test('detail adapter builds StockDetailData from quote meta and chart data', async () => {
  const provider = createChartProvider(makeDeps());
  const result = await provider.fetchInstrumentDetail({
    instrumentType: 'stock',
    code: '300758',
    fallbackName: '七彩化学',
    period: 'day',
  });

  assert.equal(result.name, '七彩化学');
  assert.equal(result.period, 'day');
  assert.equal(result.kline[0]?.close, 22);
  assert.equal(result.prevClose, 98);
});
