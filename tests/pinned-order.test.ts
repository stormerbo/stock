import test from 'node:test';
import assert from 'node:assert/strict';

import { applyPinnedOrder, insertAfterPinned, reorderCodes } from '../src/popup/utils/sorting.ts';

test('applyPinnedOrder toggles one item without clearing other pinned items', () => {
  const rows = [
    { code: 'A', pinned: true },
    { code: 'B', pinned: true },
    { code: 'C', pinned: false },
  ];

  const next = applyPinnedOrder(rows, 'C');

  assert.deepEqual(next.map((item) => ({ code: item.code, pinned: item.pinned })), [
    { code: 'A', pinned: true },
    { code: 'B', pinned: true },
    { code: 'C', pinned: true },
  ]);
});

test('insertAfterPinned appends new items after the full pinned block', () => {
  const rows = [
    { code: 'A', pinned: true },
    { code: 'B', pinned: true },
    { code: 'C', pinned: false },
  ];

  const next = insertAfterPinned(rows, { code: 'D', pinned: false });

  assert.deepEqual(next.map((item) => item.code), ['A', 'B', 'D', 'C']);
});

test('reorderCodes keeps pinned codes fixed at the front', () => {
  const next = reorderCodes(['A', 'B', 'C', 'D'], 'D', 'B', ['A', 'C']);
  assert.deepEqual(next, ['A', 'C', 'D', 'B']);
});
