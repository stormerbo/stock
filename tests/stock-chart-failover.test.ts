import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createStockChartFailover,
  type StockChartFetcherSet,
} from '../src/shared/stock-chart-failover.ts';
import type { StockChartKlinePoint } from '../src/shared/stock-chart-sources.ts';

function makePoint(close: number): StockChartKlinePoint {
  return {
    date: '2026-06-12',
    open: close,
    close,
    high: close,
    low: close,
    volume: 1,
  };
}

test('primary success returns without calling fallback', async () => {
  let fallbackCalls = 0;
  const fetchers: StockChartFetcherSet = {
    eastmoney: {
      fetchIntraday: async () => [makePoint(1)],
      fetchKline: async () => [makePoint(2)],
    },
    tencent: {
      fetchIntraday: async () => {
        fallbackCalls += 1;
        return [makePoint(3)];
      },
      fetchKline: async () => {
        fallbackCalls += 1;
        return [makePoint(4)];
      },
    },
  };
  const failover = createStockChartFailover(fetchers, {
    enableTencentFallback: true,
  });

  const result = await failover.fetchKline('600519', 'day');

  assert.equal(result.source, 'eastmoney');
  assert.equal(result.data[0]?.close, 2);
  assert.equal(fallbackCalls, 0);
});

test('primary failure falls back to Tencent', async () => {
  const fetchers: StockChartFetcherSet = {
    eastmoney: {
      fetchIntraday: async () => {
        throw new Error('rate limited');
      },
      fetchKline: async () => {
        throw new Error('rate limited');
      },
    },
    tencent: {
      fetchIntraday: async () => [makePoint(3)],
      fetchKline: async () => [makePoint(4)],
    },
  };
  const failover = createStockChartFailover(fetchers, {
    enableTencentFallback: true,
  });

  const result = await failover.fetchIntraday('600519', 'minute');

  assert.equal(result.source, 'tencent');
  assert.equal(result.data[0]?.close, 3);
});

test('empty primary data also falls back to Tencent', async () => {
  const fetchers: StockChartFetcherSet = {
    eastmoney: {
      fetchIntraday: async () => [],
      fetchKline: async () => [],
    },
    tencent: {
      fetchIntraday: async () => [makePoint(5)],
      fetchKline: async () => [makePoint(6)],
    },
  };
  const failover = createStockChartFailover(fetchers, {
    enableTencentFallback: true,
  });

  const result = await failover.fetchKline('600519', 'day');

  assert.equal(result.source, 'tencent');
  assert.equal(result.data[0]?.close, 6);
});

test('repeated primary failures open a short-lived circuit breaker', async () => {
  let eastmoneyCalls = 0;
  const fetchers: StockChartFetcherSet = {
    eastmoney: {
      fetchIntraday: async () => {
        eastmoneyCalls += 1;
        throw new Error('limited');
      },
      fetchKline: async () => {
        eastmoneyCalls += 1;
        throw new Error('limited');
      },
    },
    tencent: {
      fetchIntraday: async () => [makePoint(7)],
      fetchKline: async () => [makePoint(8)],
    },
  };
  const failover = createStockChartFailover(fetchers, {
    circuitOpenMs: 60_000,
    failureThreshold: 2,
    enableTencentFallback: true,
  });

  await failover.fetchKline('600519', 'day');
  await failover.fetchKline('600519', 'day');
  await failover.fetchKline('600519', 'day');

  assert.equal(eastmoneyCalls, 2);
});

test('both sources failing surface an error', async () => {
  const fetchers: StockChartFetcherSet = {
    eastmoney: {
      fetchIntraday: async () => {
        throw new Error('eastmoney down');
      },
      fetchKline: async () => {
        throw new Error('eastmoney down');
      },
    },
    tencent: {
      fetchIntraday: async () => {
        throw new Error('tencent down');
      },
      fetchKline: async () => {
        throw new Error('tencent down');
      },
    },
  };
  const failover = createStockChartFailover(fetchers);

  await assert.rejects(() => failover.fetchIntraday('600519', 'minute'));
});

test('WAF-style Tencent failures immediately open the Tencent circuit', async () => {
  let tencentCalls = 0;
  const fetchers: StockChartFetcherSet = {
    eastmoney: {
      fetchIntraday: async () => {
        throw new Error('eastmoney empty');
      },
      fetchKline: async () => {
        throw new Error('eastmoney empty');
      },
    },
    tencent: {
      fetchIntraday: async () => {
        tencentCalls += 1;
        throw new Error('HTTP 501 waf.tencent.com/501page.html');
      },
      fetchKline: async () => {
        tencentCalls += 1;
        throw new Error('HTTP 501 waf.tencent.com/501page.html');
      },
    },
  };
  const failover = createStockChartFailover(fetchers, {
    circuitOpenMs: 60_000,
    failureThreshold: 3,
    enableTencentFallback: true,
  });

  await assert.rejects(() => failover.fetchIntraday('600519', 'minute'));
  await assert.rejects(() => failover.fetchIntraday('600519', 'minute'));

  assert.equal(tencentCalls, 1);
});

test('Tencent fallback is disabled by default to avoid WAF retries', async () => {
  let tencentCalls = 0;
  const fetchers: StockChartFetcherSet = {
    eastmoney: {
      fetchIntraday: async () => {
        throw new Error('eastmoney down');
      },
      fetchKline: async () => {
        throw new Error('eastmoney down');
      },
    },
    tencent: {
      fetchIntraday: async () => {
        tencentCalls += 1;
        return [makePoint(9)];
      },
      fetchKline: async () => {
        tencentCalls += 1;
        return [makePoint(10)];
      },
    },
  };
  const failover = createStockChartFailover(fetchers);

  await assert.rejects(() => failover.fetchIntraday('600519', 'minute'));
  assert.equal(tencentCalls, 0);
});
