import test from 'node:test';
import assert from 'node:assert/strict';

import { getStockRowBadges } from '../src/popup/components/stock-row-badges.ts';

test('getStockRowBadges places stock badge on the name row and tech badge on the code row', () => {
  const badges = getStockRowBadges({
    code: '300576',
    hasTechSignal: true,
  });

  assert.deepEqual(badges, {
    nameRowBadge: { label: '创', tone: 'growth' },
    codeRowBadge: { label: '技', tone: 'signal' },
  });
});

test('getStockRowBadges keeps the code row empty when there is no tech signal', () => {
  const badges = getStockRowBadges({
    code: '600498',
    hasTechSignal: false,
  });

  assert.deepEqual(badges, {
    nameRowBadge: null,
    codeRowBadge: null,
  });
});
