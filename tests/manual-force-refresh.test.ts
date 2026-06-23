import test from 'node:test';
import assert from 'node:assert/strict';

import { runManualForceRefresh } from '../src/background/manual-force-refresh.ts';

test('runManualForceRefresh refreshes every market data source and clears derived caches', async () => {
  const steps: string[] = [];

  await runManualForceRefresh({
    refreshStocks: async (force) => { steps.push(`stocks:${String(force)}`); },
    refreshFunds: async () => { steps.push('funds'); },
    refreshIndexes: async (force) => { steps.push(`indexes:${String(force)}`); },
    refreshGolds: async (force) => { steps.push(`golds:${String(force)}`); },
    refreshMarketStats: async (force) => { steps.push(`market-stats:${String(force)}`); },
    clearDerivedCaches: async () => { steps.push('clear-caches'); },
    afterRefresh: () => { steps.push('after-refresh'); },
  });

  assert.deepEqual(steps, [
    'stocks:true',
    'funds',
    'indexes:true',
    'golds:true',
    'market-stats:true',
    'clear-caches',
    'after-refresh',
  ]);
});
