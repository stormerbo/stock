import test from 'node:test';
import assert from 'node:assert/strict';

import { isEtfFundName } from '../src/shared/fetch.ts';

test('isEtfFundName recognizes ETF names but not ETF-linked funds', () => {
  assert.equal(isEtfFundName('华夏上证50ETF'), true);
  assert.equal(isEtfFundName('华夏上证50ETF联接A'), false);
  assert.equal(isEtfFundName('易方达沪深300指数增强'), false);
});
