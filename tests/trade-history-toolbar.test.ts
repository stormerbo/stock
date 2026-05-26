import test from 'node:test';
import assert from 'node:assert/strict';

import { getTradeHistoryToolbarActions } from '../src/popup/views/trade-history-toolbar.ts';

test('getTradeHistoryToolbarActions returns consistent icon-only toolbar actions', () => {
  const actions = getTradeHistoryToolbarActions(false);

  assert.deepEqual(actions.map((item) => item.key), ['recalculate_holdings', 'open_recalc_modal', 'add_trade']);
  assert.deepEqual(actions.map((item) => item.title), ['重算持仓', '重新计算累计收益', '新增交易']);
  assert.deepEqual(actions.map((item) => item.ariaLabel), ['重算持仓', '重新计算累计收益', '新增交易']);
  assert.deepEqual(actions.map((item) => item.icon), ['rotate', 'clock', 'plus']);
  assert.deepEqual(actions.map((item) => item.variant), ['brand', 'ghost', 'brand']);
  assert.deepEqual(actions.map((item) => item.disabled), [false, false, false]);
});

test('getTradeHistoryToolbarActions disables only the recalculate button while loading', () => {
  const actions = getTradeHistoryToolbarActions(true);

  assert.deepEqual(actions.map((item) => item.disabled), [true, false, false]);
});
