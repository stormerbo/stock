import test from 'node:test';
import assert from 'node:assert/strict';

import { buildRefreshAlarmPeriods } from '../src/background/refresh-alarms.ts';

test('buildRefreshAlarmPeriods includes gold refresh alarm using config value', () => {
  const periods = buildRefreshAlarmPeriods({
    stockRefreshSeconds: 15,
    fundRefreshSeconds: 60,
    indexRefreshSeconds: 30,
    marketStatsRefreshSeconds: 30,
    goldRefreshSeconds: 300,
  });

  assert.deepEqual(periods, {
    'refresh-stocks': 15 / 60,
    'refresh-funds': 60 / 60,
    'refresh-indexes': 30 / 60,
    'refresh-gold': 300 / 60,
    'refresh-market-stats': 1,
  });
});
