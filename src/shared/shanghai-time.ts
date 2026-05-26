const SHANGHAI_DATE_TIME_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function getShanghaiParts(date: Date): { year: number; month: number; day: number; hour: number; minute: number } {
  const parts = SHANGHAI_DATE_TIME_FMT.formatToParts(date);
  return {
    year: Number(parts.find((part) => part.type === 'year')?.value ?? '1970'),
    month: Number(parts.find((part) => part.type === 'month')?.value ?? '1'),
    day: Number(parts.find((part) => part.type === 'day')?.value ?? '1'),
    hour: Number(parts.find((part) => part.type === 'hour')?.value ?? '0'),
    minute: Number(parts.find((part) => part.type === 'minute')?.value ?? '0'),
  };
}

export function getNextShanghaiScheduledTime(hour: number, minute: number, now: Date = new Date()): Date {
  const current = getShanghaiParts(now);
  const isLaterToday = current.hour > hour || (current.hour === hour && current.minute >= minute);
  const dayOffset = isLaterToday ? 1 : 0;

  return new Date(Date.UTC(
    current.year,
    current.month - 1,
    current.day + dayOffset,
    hour - 8,
    minute,
    0,
    0,
  ));
}

export function formatShanghaiMonthDayTime(value: number | string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  const parts = SHANGHAI_DATE_TIME_FMT.formatToParts(date);
  const month = parts.find((part) => part.type === 'month')?.value ?? '01';
  const day = parts.find((part) => part.type === 'day')?.value ?? '01';
  const hour = parts.find((part) => part.type === 'hour')?.value ?? '00';
  const minute = parts.find((part) => part.type === 'minute')?.value ?? '00';
  return `${month}-${day} ${hour}:${minute}`;
}
