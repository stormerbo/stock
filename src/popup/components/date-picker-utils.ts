import { getShanghaiToday } from '../../shared/fetch';

export type DatePickerDayMeta = {
  dateKey: string;
  dayNumber: number;
  inMonth: boolean;
  isSelected: boolean;
  isToday: boolean;
  isTradingDay: boolean;
  weekdayLabel: string;
  tradingLabel: '交易日' | '休市';
};

const SHANGHAI_DATE_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const SHANGHAI_WEEKDAY_FMT = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  weekday: 'short',
});

const SHANGHAI_WEEKDAY_INDEX_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Shanghai',
  weekday: 'short',
});

const SHANGHAI_MONTH_TITLE_FMT = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: 'long',
});

function formatParts(date: Date): { year: string; month: string; day: string } {
  const parts = SHANGHAI_DATE_FMT.formatToParts(date);
  return {
    year: parts.find((item) => item.type === 'year')?.value ?? '0000',
    month: parts.find((item) => item.type === 'month')?.value ?? '00',
    day: parts.find((item) => item.type === 'day')?.value ?? '00',
  };
}

export function parseShanghaiDate(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map((item) => Number(item));
  return new Date(Date.UTC(year || 0, (month || 1) - 1, day || 1));
}

export function formatShanghaiDateKey(date: Date): string {
  const { year, month, day } = formatParts(date);
  return `${year}-${month}-${day}`;
}

export function getDatePickerWeekdayLabel(dateKey: string): string {
  return SHANGHAI_WEEKDAY_FMT.format(parseShanghaiDate(dateKey));
}

export function isDateTradingDay(dateKey: string): boolean {
  const weekday = SHANGHAI_WEEKDAY_INDEX_FMT.format(parseShanghaiDate(dateKey));
  return weekday !== 'Sat' && weekday !== 'Sun';
}

export function getDatePickerDayMeta(
  dateKey: string,
  selectedDate: string,
  todayDate: string = getShanghaiToday(),
): DatePickerDayMeta {
  const date = parseShanghaiDate(dateKey);
  return {
    dateKey,
    dayNumber: Number(formatParts(date).day),
    inMonth: true,
    isSelected: dateKey === selectedDate,
    isToday: dateKey === todayDate,
    isTradingDay: isDateTradingDay(dateKey),
    weekdayLabel: getDatePickerWeekdayLabel(dateKey),
    tradingLabel: isDateTradingDay(dateKey) ? '交易日' : '休市',
  };
}

export function getDatePickerTriggerLabel(dateKey: string): string {
  return `${dateKey} ${getDatePickerWeekdayLabel(dateKey)}`;
}

export function getMonthKey(dateKey: string): string {
  return `${dateKey.slice(0, 7)}-01`;
}

export function shiftMonthKey(dateKey: string, offsetMonths: number): string {
  const date = parseShanghaiDate(getMonthKey(dateKey));
  date.setUTCMonth(date.getUTCMonth() + offsetMonths);
  return formatShanghaiDateKey(date).slice(0, 7) + '-01';
}

function getWeekdayIndex(date: Date): number {
  const weekday = SHANGHAI_WEEKDAY_INDEX_FMT.format(date);
  return weekday === 'Sun'
    ? 0
    : weekday === 'Mon'
      ? 1
      : weekday === 'Tue'
        ? 2
        : weekday === 'Wed'
          ? 3
          : weekday === 'Thu'
            ? 4
            : weekday === 'Fri'
              ? 5
              : 6;
}

export function buildCalendarWeeks(
  viewDateKey: string,
  selectedDate: string,
  todayDate: string = getShanghaiToday(),
): DatePickerDayMeta[][] {
  const monthStart = parseShanghaiDate(getMonthKey(viewDateKey));
  const start = new Date(monthStart.getTime());
  const offset = (getWeekdayIndex(monthStart) + 6) % 7;
  start.setUTCDate(start.getUTCDate() - offset);

  const weeks: DatePickerDayMeta[][] = [];
  for (let week = 0; week < 6; week++) {
    const row: DatePickerDayMeta[] = [];
    for (let day = 0; day < 7; day++) {
      const cell = new Date(start.getTime());
      cell.setUTCDate(start.getUTCDate() + week * 7 + day);
      const dateKey = formatShanghaiDateKey(cell);
      row.push({
        ...getDatePickerDayMeta(dateKey, selectedDate, todayDate),
        inMonth: dateKey.slice(0, 7) === viewDateKey.slice(0, 7),
      });
    }
    weeks.push(row);
  }
  return weeks;
}

export function getMonthTitle(dateKey: string): string {
  return SHANGHAI_MONTH_TITLE_FMT.format(parseShanghaiDate(dateKey));
}
