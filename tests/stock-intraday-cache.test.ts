import test from 'node:test';
import assert from 'node:assert/strict';

import {
  STOCK_INTRADAY_CACHE_VERSION,
  hasUsableStockIntradayData,
  shouldRefreshStockIntraday,
} from '../src/shared/stock-intraday-cache.ts';

test('version mismatch invalidates same-day intraday cache', () => {
  const shouldRefresh = shouldRefreshStockIntraday({
    today: '2026-06-12',
    intradayDate: '2026-06-12',
    intradayVersion: STOCK_INTRADAY_CACHE_VERSION - 1,
    isTradingHours: false,
    intraday: {
      data: [{ time: '09:30', price: 12.3 }],
      prevClose: 12.1,
    },
  });

  assert.equal(shouldRefresh, true);
});

test('malformed intraday data is treated as unusable even when non-empty', () => {
  assert.equal(
    hasUsableStockIntradayData({
      data: [{ time: '2026-06-12 09:30', price: 12.3 }],
      prevClose: 12.1,
    }),
    false,
  );
});

test('same-day valid cache can be reused outside trading hours', () => {
  const shouldRefresh = shouldRefreshStockIntraday({
    today: '2026-06-12',
    intradayDate: '2026-06-12',
    intradayVersion: STOCK_INTRADAY_CACHE_VERSION,
    isTradingHours: false,
    intraday: {
      data: [{ time: '09:30', price: 12.3 }],
      prevClose: 12.1,
    },
  });

  assert.equal(shouldRefresh, false);
});
