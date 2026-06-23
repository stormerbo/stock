import test from 'node:test';
import assert from 'node:assert/strict';

import { guessSector } from '../src/shared/sector-map.ts';

test('guessSector classifies STAR Market codes before generic Shanghai main board fallback', () => {
  assert.equal(guessSector('688001'), '科创板');
  assert.equal(guessSector('688981'), '半导体');
});
