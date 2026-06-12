import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_GOLD_REFRESH_SECONDS,
  normalizeRefreshConfig,
} from '../src/shared/refresh-config.ts';

test('normalizeRefreshConfig fills missing gold refresh seconds for legacy configs', () => {
  const config = normalizeRefreshConfig({
    stockRefreshSeconds: 15,
    fundRefreshSeconds: 60,
    indexRefreshSeconds: 30,
    marketStatsRefreshSeconds: 30,
  });

  assert.equal(config.goldRefreshSeconds, DEFAULT_GOLD_REFRESH_SECONDS);
  assert.equal(config.stockRefreshSeconds, 15);
  assert.equal(config.marketStatsRefreshSeconds, 30);
});

test('normalizeRefreshConfig clamps unsupported gold refresh values to fixed options', () => {
  assert.equal(
    normalizeRefreshConfig({ goldRefreshSeconds: 29 }).goldRefreshSeconds,
    30,
  );
  assert.equal(
    normalizeRefreshConfig({ goldRefreshSeconds: 88 }).goldRefreshSeconds,
    60,
  );
  assert.equal(
    normalizeRefreshConfig({ goldRefreshSeconds: 999 }).goldRefreshSeconds,
    300,
  );
});

test('normalizeRefreshConfig preserves known values and defaults the remaining fields', () => {
  const config = normalizeRefreshConfig({ goldRefreshSeconds: 300 });

  assert.equal(config.goldRefreshSeconds, 300);
  assert.equal(config.stockRefreshSeconds, 15);
  assert.equal(config.fundRefreshSeconds, 60);
  assert.equal(config.indexRefreshSeconds, 30);
  assert.equal(config.marketStatsRefreshSeconds, 30);
});

test('normalizeRefreshConfig enforces a 5-second minimum for non-gold refresh intervals', () => {
  const config = normalizeRefreshConfig({
    stockRefreshSeconds: 1,
    fundRefreshSeconds: 2,
    indexRefreshSeconds: 4,
    marketStatsRefreshSeconds: 3,
  });

  assert.equal(config.stockRefreshSeconds, 5);
  assert.equal(config.fundRefreshSeconds, 5);
  assert.equal(config.indexRefreshSeconds, 5);
  assert.equal(config.marketStatsRefreshSeconds, 5);
});
