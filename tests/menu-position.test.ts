import test from 'node:test';
import assert from 'node:assert/strict';

import { adjustMenuRectToViewport, clampMenuPosition } from '../src/popup/utils/menu-position.ts';

test('clampMenuPosition keeps the menu inside the viewport', () => {
  assert.deepEqual(
    clampMenuPosition(760, 560, 132, 148, 800, 600),
    { left: 660, top: 444 },
  );
});

test('clampMenuPosition respects the minimum margin', () => {
  assert.deepEqual(
    clampMenuPosition(-20, -10, 150, 72, 800, 600),
    { left: 8, top: 8 },
  );
});

test('adjustMenuRectToViewport repositions the measured rect back into view', () => {
  assert.deepEqual(
    adjustMenuRectToViewport(
      { left: 746, top: 540, right: 858, bottom: 690, width: 112, height: 150 },
      800,
      600,
    ),
    { left: 680, top: 442 },
  );
});
