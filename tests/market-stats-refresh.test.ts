import test from 'node:test';
import assert from 'node:assert/strict';

import { shouldFetchMarketStats } from '../src/shared/fetch.ts';

test('shouldFetchMarketStats bypasses trading-hour restriction when ignoreTradingHours is enabled', () => {
  assert.equal(shouldFetchMarketStats(false, false), false);
  assert.equal(shouldFetchMarketStats(false, true), true);
  assert.equal(shouldFetchMarketStats(true, false), true);
});
