import test from 'node:test';
import assert from 'node:assert/strict';

import { runManualRefresh } from '../src/popup/manual-refresh.ts';

test('manual refresh waits for background force-refresh before local follow-up', async () => {
  const steps: string[] = [];
  let releaseForceRefresh: (() => void) | null = null;

  const forceRefresh = new Promise<void>((resolve) => {
    releaseForceRefresh = () => {
      steps.push('force-refresh:done');
      resolve();
    };
  });

  const running = runManualRefresh({
    clearStockIntraday: async () => {
      steps.push('stock-intraday:cleared');
    },
    forceRefresh: async () => {
      steps.push('force-refresh:start');
      await forceRefresh;
    },
    refreshFundsDirect: async () => {
      steps.push('funds:refresh');
    },
    afterRefresh: () => {
      steps.push('after-refresh');
    },
  });

  steps.push('before-release');
  assert.deepEqual(steps, ['stock-intraday:cleared', 'before-release']);

  await Promise.resolve();
  assert.deepEqual(steps, ['stock-intraday:cleared', 'before-release', 'force-refresh:start']);

  releaseForceRefresh?.();
  await running;

  assert.deepEqual(steps, [
    'stock-intraday:cleared',
    'before-release',
    'force-refresh:start',
    'force-refresh:done',
    'funds:refresh',
    'after-refresh',
  ]);
});
