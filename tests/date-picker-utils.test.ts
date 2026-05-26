import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCalendarWeeks,
  getDatePickerDayMeta,
  getDatePickerTriggerLabel,
  shiftMonthKey,
} from '../src/popup/components/date-picker-utils.ts';

test('getDatePickerDayMeta marks weekdays as trading days and weekends as closed', () => {
  const weekday = getDatePickerDayMeta('2026-05-26', '2026-05-26');
  const weekend = getDatePickerDayMeta('2026-05-24', '2026-05-26');

  assert.equal(weekday.weekdayLabel, '周二');
  assert.equal(weekday.tradingLabel, '交易日');
  assert.equal(weekday.isTradingDay, true);
  assert.equal(weekday.isSelected, true);
  assert.equal(weekday.isToday, true);

  assert.equal(weekend.weekdayLabel, '周日');
  assert.equal(weekend.tradingLabel, '休市');
  assert.equal(weekend.isTradingDay, false);
  assert.equal(weekend.isSelected, false);
  assert.equal(weekend.isToday, false);
});

test('buildCalendarWeeks returns a Monday-first month grid with leading days', () => {
  const weeks = buildCalendarWeeks('2026-05-15', '2026-05-26', '2026-05-26');

  assert.equal(weeks[0][0]?.dateKey, '2026-04-27');
  assert.equal(weeks[0][0]?.inMonth, false);
  assert.equal(weeks[0][0]?.tradingLabel, '交易日');
  assert.equal(weeks[0][5]?.dateKey, '2026-05-02');
  assert.equal(weeks[0][5]?.tradingLabel, '休市');
  assert.equal(weeks[4][1]?.dateKey, '2026-05-26');
  assert.equal(weeks[4][1]?.isSelected, true);
  assert.equal(weeks[4][1]?.isToday, true);
});

test('getDatePickerTriggerLabel includes the weekday hint', () => {
  assert.equal(getDatePickerTriggerLabel('2026-05-26'), '2026-05-26 周二');
});

test('shiftMonthKey moves the calendar forward and backward by one month', () => {
  assert.equal(shiftMonthKey('2026-05-01', 1), '2026-06-01');
  assert.equal(shiftMonthKey('2026-05-01', -1), '2026-04-01');
});
