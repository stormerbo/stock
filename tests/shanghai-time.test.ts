import test from 'node:test';
import assert from 'node:assert/strict';

import {
  formatShanghaiMonthDayTime,
  getNextShanghaiScheduledTime,
} from '../src/shared/shanghai-time.ts';

test('getNextShanghaiScheduledTime returns the same day 15:30 when current Shanghai time is before 15:30', () => {
  const now = new Date('2026-05-26T06:00:00.000Z'); // 14:00 Shanghai
  const next = getNextShanghaiScheduledTime(15, 30, now);

  assert.equal(next.toISOString(), '2026-05-26T07:30:00.000Z');
});

test('getNextShanghaiScheduledTime rolls to tomorrow 15:30 when current Shanghai time is after 15:30', () => {
  const now = new Date('2026-05-26T08:00:00.000Z'); // 16:00 Shanghai
  const next = getNextShanghaiScheduledTime(15, 30, now);

  assert.equal(next.toISOString(), '2026-05-27T07:30:00.000Z');
});

test('formatShanghaiMonthDayTime formats timestamps in Shanghai time', () => {
  assert.equal(formatShanghaiMonthDayTime('2026-05-26T07:30:00.000Z'), '05-26 15:30');
});
