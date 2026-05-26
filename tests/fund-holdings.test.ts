import test from 'node:test';
import assert from 'node:assert/strict';

import { getFundHoldingAddButtonState } from '../src/popup/views/fund-holdings.ts';

test('getFundHoldingAddButtonState keeps the action cell visible after the stock is already added', () => {
  const active = getFundHoldingAddButtonState(false);
  const added = getFundHoldingAddButtonState(true);

  assert.equal(active.label, '+自选');
  assert.equal(active.disabled, false);
  assert.equal(added.label, '已自选');
  assert.equal(added.disabled, true);
  assert.equal(added.className, 'fund-add-stock-btn is-added');
});
