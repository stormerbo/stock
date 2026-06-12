import { fetchTextViaExtension, formatQuoteTime, toEastmoneySecidFromTencent, toNumber } from './fetch.ts';

export type StockChartSource = 'eastmoney' | 'tencent';
export type StockChartIntradayPeriod = 'minute' | 'fiveDay';
export type StockChartKlinePeriod = 'day' | 'week' | 'month' | 'year' | 'm120' | 'm60' | 'm30' | 'm15' | 'm5';

export type StockChartKlinePoint = {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
};

export type StockQuoteMeta = {
  name: string;
  price: number;
  change: number;
  changePct: number;
  open: number;
  prevClose: number;
  high: number;
  low: number;
  volumeHands: number;
  amountWanYuan: number;
  turnoverRate: number;
  peTtm: number;
  totalMarketCapYi: number;
  updatedAt: string;
};

type TencentMinuteResponse = {
  data?: Record<string, {
    data?: { date?: string; data?: string[] };
  }>;
};

type TencentFiveDayResponse = {
  data?: Record<string, {
    data?: Array<{ date?: string; prec?: string; data?: string[] }>;
  }>;
};

type TencentKlineResponse = {
  data?: Record<string, {
    qfqday?: string[][];
    day?: string[][];
    qfqweek?: string[][];
    week?: string[][];
    qfqmonth?: string[][];
    month?: string[][];
    year?: string[][];
  }>;
};

type TencentMklineResponse = {
  data?: Record<string, {
    m5?: string[][];
    m15?: string[][];
    m30?: string[][];
    m60?: string[][];
    m120?: string[][];
  }>;
};

function formatDateTime(value: string): string {
  if (/^\d{12}$/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)} ${value.slice(8, 10)}:${value.slice(10, 12)}`;
  }
  if (/^\d{8}$/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  }
  return value;
}

export function parseEastmoneyIntradayTrends(trends: string[]): StockChartKlinePoint[] {
  return trends
    .map((line) => {
      const parts = String(line).split(',');
      if (parts.length < 6) return null;
      const [date, openRaw, closeRaw, highRaw, lowRaw, volumeRaw] = parts;
      const close = toNumber(closeRaw);
      const open = toNumber(openRaw);
      const high = toNumber(highRaw);
      const low = toNumber(lowRaw);
      const volume = toNumber(volumeRaw);
      const effectiveOpen = Number.isFinite(open) && open !== 0 ? open : close;
      return {
        date: String(date),
        open: effectiveOpen,
        close,
        high: Number.isFinite(high) ? high : close,
        low: Number.isFinite(low) ? low : close,
        volume: Number.isFinite(volume) ? volume : 0,
      };
    })
    .filter((item): item is StockChartKlinePoint => (
      item !== null
      && Number.isFinite(item.open)
      && Number.isFinite(item.close)
      && Number.isFinite(item.high)
      && Number.isFinite(item.low)
      && Number.isFinite(item.volume)
    ));
}

export function parseEastmoneyKlineRows(rows: string[]): StockChartKlinePoint[] {
  return rows
    .map((line) => {
      const parts = String(line).split(',');
      if (parts.length < 6) return null;
      const [date, open, close, high, low, volume] = parts;
      return {
        date: String(date),
        open: toNumber(open),
        close: toNumber(close),
        high: toNumber(high),
        low: toNumber(low),
        volume: toNumber(volume),
      };
    })
    .filter((item): item is StockChartKlinePoint => (
      item !== null
      && Number.isFinite(item.open)
      && Number.isFinite(item.close)
      && Number.isFinite(item.high)
      && Number.isFinite(item.low)
      && Number.isFinite(item.volume)
    ));
}

export function parseTencentMinuteRows(lines: string[] | undefined, tradeDate: string, startPrev?: number): StockChartKlinePoint[] {
  if (!Array.isArray(lines)) return [];
  const date = formatDateTime(tradeDate).slice(0, 10);
  let prev = Number.isFinite(startPrev) ? (startPrev as number) : Number.NaN;
  let prevCumVol = 0;

  return lines
    .map((line) => {
      const [timeRaw, priceRaw, volumeRaw] = String(line).split(' ');
      const price = toNumber(priceRaw);
      const cumVol = toNumber(volumeRaw);
      const volume = Math.max(0, cumVol - prevCumVol);
      prevCumVol = cumVol;
      const normalizedTime = /^\d{4}$/.test(timeRaw) ? `${timeRaw.slice(0, 2)}:${timeRaw.slice(2, 4)}` : timeRaw;
      const open = Number.isFinite(prev) ? prev : price;
      const close = price;
      const high = Math.max(open, close);
      const low = Math.min(open, close);
      prev = close;
      return {
        date: `${date} ${normalizedTime}`,
        open,
        close,
        high,
        low,
        volume,
      };
    })
    .filter((item) => (
      Number.isFinite(item.open)
      && Number.isFinite(item.close)
      && Number.isFinite(item.high)
      && Number.isFinite(item.low)
      && Number.isFinite(item.volume)
      && item.date.slice(-5) <= '15:00'
    ));
}

export function parseTencentKlineRows(rows: string[][] | undefined): StockChartKlinePoint[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => {
      if (!Array.isArray(row) || row.length < 6) return null;
      const [date, open, close, high, low, volume] = row;
      return {
        date: formatDateTime(String(date)),
        open: toNumber(open),
        close: toNumber(close),
        high: toNumber(high),
        low: toNumber(low),
        volume: toNumber(volume),
      };
    })
    .filter((item): item is StockChartKlinePoint => (
      item !== null
      && Number.isFinite(item.open)
      && Number.isFinite(item.close)
      && Number.isFinite(item.high)
      && Number.isFinite(item.low)
      && Number.isFinite(item.volume)
    ));
}

export async function fetchTencentQuoteMeta(tencentCode: string, fallbackName = ''): Promise<StockQuoteMeta> {
  const text = await fetchTextViaExtension(`https://qt.gtimg.cn/q=${tencentCode}`);
  const matched = text.match(new RegExp(`v_${tencentCode}="([^"]*)"`));
  const parts = matched?.[1]?.split('~') ?? [];
  if (parts.length < 46) throw new Error('missing quote payload');
  return {
    name: parts[1] || fallbackName || tencentCode,
    price: toNumber(parts[3]),
    change: toNumber(parts[31]),
    changePct: toNumber(parts[32]),
    open: toNumber(parts[5]),
    prevClose: toNumber(parts[4]),
    high: toNumber(parts[33]),
    low: toNumber(parts[34]),
    volumeHands: toNumber(parts[36]),
    amountWanYuan: toNumber(parts[37]),
    turnoverRate: toNumber(parts[38]),
    peTtm: toNumber(parts[39]),
    totalMarketCapYi: toNumber(parts[45]),
    updatedAt: formatQuoteTime(parts[30] || ''),
  };
}

function eastmoneyKlt(period: StockChartKlinePeriod): number {
  switch (period) {
    case 'day': return 101;
    case 'week': return 102;
    case 'month': return 103;
    case 'year': return 104;
    case 'm120': return 120;
    case 'm60': return 60;
    case 'm30': return 30;
    case 'm15': return 15;
    case 'm5': return 5;
  }
}

export async function fetchEastmoneyIntraday(tencentCode: string, period: StockChartIntradayPeriod): Promise<StockChartKlinePoint[]> {
  const secid = toEastmoneySecidFromTencent(tencentCode);
  if (!secid) throw new Error('invalid stock code');
  const ndays = period === 'fiveDay' ? 5 : 1;
  const text = await fetchTextViaExtension(
    `https://push2his.eastmoney.com/api/qt/stock/trends2/get?secid=${encodeURIComponent(secid)}&fields1=f1,f2,f3,f4,f5,f6,f7&fields2=f51,f52,f53,f54,f55,f56,f57,f58&iscr=0&ndays=${ndays}`,
  );
  const json = JSON.parse(text) as { data?: { trends?: string[] } };
  return parseEastmoneyIntradayTrends(json.data?.trends ?? []);
}

export async function fetchEastmoneyKline(tencentCode: string, period: StockChartKlinePeriod, count: number): Promise<StockChartKlinePoint[]> {
  const secid = toEastmoneySecidFromTencent(tencentCode);
  if (!secid) throw new Error('invalid stock code');
  const text = await fetchTextViaExtension(
    `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${encodeURIComponent(secid)}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=${eastmoneyKlt(period)}&fqt=1&beg=20000101&end=20500101&lmt=${count}`,
  );
  const json = JSON.parse(text) as { data?: { klines?: string[] } };
  return parseEastmoneyKlineRows(json.data?.klines ?? []);
}

export async function fetchTencentIntraday(tencentCode: string, period: StockChartIntradayPeriod): Promise<StockChartKlinePoint[]> {
  if (period === 'minute') {
    const response = await fetch(`https://web.ifzq.gtimg.cn/appstock/app/minute/query?code=${tencentCode}`);
    const json = await response.json() as TencentMinuteResponse;
    const payload = json.data?.[tencentCode];
    return parseTencentMinuteRows(payload?.data?.data, payload?.data?.date ?? '', Number.NaN);
  }

  const response = await fetch(`https://web.ifzq.gtimg.cn/appstock/app/day/query?code=${tencentCode}`);
  const json = await response.json() as TencentFiveDayResponse;
  const payload = json.data?.[tencentCode];
  const merged: StockChartKlinePoint[] = [];
  (payload?.data ?? []).slice().reverse().forEach((day) => {
    merged.push(...parseTencentMinuteRows(day.data, day.date ?? '', toNumber(day.prec)));
  });
  return merged;
}

export async function fetchTencentKline(tencentCode: string, period: StockChartKlinePeriod, count: number): Promise<StockChartKlinePoint[]> {
  if (period === 'year' || period === 'day' || period === 'week' || period === 'month') {
    const response = await fetch(`https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${tencentCode},${period},,,${count},qfq`);
    const json = await response.json() as TencentKlineResponse;
    const payload = json.data?.[tencentCode];
    const rows = period === 'day'
      ? (payload?.qfqday ?? payload?.day)
      : period === 'week'
        ? (payload?.qfqweek ?? payload?.week)
        : period === 'month'
          ? (payload?.qfqmonth ?? payload?.month)
          : payload?.year;
    return parseTencentKlineRows(rows);
  }

  const response = await fetch(`https://proxy.finance.qq.com/ifzqgtimg/appstock/app/kline/mkline?param=${tencentCode},${period},,${count}`);
  const json = await response.json() as TencentMklineResponse;
  const payload = json.data?.[tencentCode];
  return parseTencentKlineRows(payload?.[period] ?? []);
}
