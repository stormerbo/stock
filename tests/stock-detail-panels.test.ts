import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getQuickStatsCollapsedSummary,
  getQuickStatsSummaryKeys,
  getQuickStatsToggleState,
} from '../src/popup/views/stock-detail-panels.ts';

test('getQuickStatsToggleState defaults to collapsed quick stats copy', () => {
  const collapsed = getQuickStatsToggleState(false);
  const expanded = getQuickStatsToggleState(true);

  assert.equal(collapsed.expanded, false);
  assert.equal(collapsed.label, '展开详细行情');
  assert.equal(collapsed.ariaLabel, '展开顶部详细行情');

  assert.equal(expanded.expanded, true);
  assert.equal(expanded.label, '收起详细行情');
  assert.equal(expanded.ariaLabel, '收起顶部详细行情');
});

test('getQuickStatsSummaryKeys keeps the collapsed summary minimal', () => {
  assert.deepEqual(getQuickStatsSummaryKeys(), ['open', 'high', 'low']);
});

test('getQuickStatsCollapsedSummary keeps only the three key fields visible', () => {
  assert.deepEqual(getQuickStatsCollapsedSummary(), [
    { key: 'open', label: '今开' },
    { key: 'high', label: '最高' },
    { key: 'low', label: '最低' },
  ]);
});
