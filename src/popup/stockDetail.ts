import { toNumber, normalizeStockCode, toTencentStockCode, formatQuoteTime } from '../shared/fetch';
export { calcMA, calcMACD } from '../shared/technical-analysis';

export type StockDetailKlinePoint = {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
};

export type StockPeriod =
  | "minute"
  | "fiveDay"
  | "day"
  | "week"
  | "month"
  | "year"
  | "m120"
  | "m60"
  | "m30"
  | "m15"
  | "m5";

export type StockDetailData = {
  code: string;
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
  period: StockPeriod;
  kline: StockDetailKlinePoint[];
};

type TencentKlineResponse = {
  data?: Record<string, {
    qfqday?: string[][];
    qfqweek?: string[][];
    qfqmonth?: string[][];
    year?: string[][];
    qt?: Record<string, string[]>;
  }>;
};

type TencentMinuteResponse = {
  data?: Record<string, {
    data?: {
      date?: string;
      data?: string[];
    };
    qt?: Record<string, string[]>;
  }>;
};

type TencentFiveDayResponse = {
  data?: Record<string, {
    data?: Array<{
      date?: string;
      prec?: string;
      data?: string[];
    }>;
    qt?: Record<string, string[]>;
  }>;
};

type TencentMklineResponse = {
  data?: Record<string, {
    m5?: string[][];
    m15?: string[][];
    m30?: string[][];
    m60?: string[][];
    m120?: string[][];
    qt?: Record<string, string[]>;
  }>;
};

function parseKlineRows(rows: string[][] | undefined): StockDetailKlinePoint[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => {
      if (!Array.isArray(row) || row.length < 6) return null;
      const [date, open, close, high, low, volume] = row;
      return {
        date: String(date),
        open: toNumber(open),
        close: toNumber(close),
        high: toNumber(high),
        low: toNumber(low),
        volume: toNumber(volume),
      };
    })
    .filter((row): row is StockDetailKlinePoint => (
      row !== null
      && Number.isFinite(row.open)
      && Number.isFinite(row.close)
      && Number.isFinite(row.high)
      && Number.isFinite(row.low)
      && Number.isFinite(row.volume)
    ));
}

function formatDateTime(value: string): string {
  if (/^\d{12}$/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)} ${value.slice(8, 10)}:${value.slice(10, 12)}`;
  }
  if (/^\d{8}$/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  }
  return value;
}

function parseMinuteTicks(lines: string[] | undefined, tradeDate: string, startPrev?: number): StockDetailKlinePoint[] {
  if (!Array.isArray(lines)) return [];
  const date = formatDateTime(tradeDate).slice(0, 10);
  let prev = Number.isFinite(startPrev) ? (startPrev as number) : Number.NaN;
  // API returns cumulative volume; track previous to compute per-minute increment
  let prevCumVol = 0;

  return lines
    .map((line) => {
      const [timeRaw, priceRaw, volumeRaw] = String(line).split(" ");
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
    .filter((row) => (
      Number.isFinite(row.open)
      && Number.isFinite(row.close)
      && Number.isFinite(row.high)
      && Number.isFinite(row.low)
      && Number.isFinite(row.volume)
      && row.date.slice(-5) <= '15:00'
    ));
}

function parseQuoteMeta(quote: string[], fallbackName: string, plainCode: string) {
  return {
    name: quote[1] || fallbackName || plainCode,
    price: toNumber(quote[3]),
    change: toNumber(quote[31]),
    changePct: toNumber(quote[32]),
    open: toNumber(quote[5]),
    prevClose: toNumber(quote[4]),
    high: toNumber(quote[33]),
    low: toNumber(quote[34]),
    volumeHands: toNumber(quote[36]),
    amountWanYuan: toNumber(quote[37]),
    turnoverRate: toNumber(quote[38]),
    peTtm: toNumber(quote[39]),
    totalMarketCapYi: toNumber(quote[45]),
    updatedAt: formatQuoteTime(quote[30] || ""),
  };
}

function buildDetail(code: string, plainCode: string, fallbackName: string, quote: string[], period: StockPeriod, kline: StockDetailKlinePoint[]): StockDetailData {
  return {
    code: plainCode || code,
    ...parseQuoteMeta(quote, fallbackName, plainCode || code),
    period,
    kline,
  };
}

async function fetchFqPeriod(tencentCode: string, period: "day" | "week" | "month" | "year", count: number): Promise<{ quote: string[]; kline: StockDetailKlinePoint[] }> {
  const response = await fetch(`https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${tencentCode},${period},,,${count},qfq`);
  const json = await response.json() as TencentKlineResponse;
  const payload = json.data?.[tencentCode];
  const quote = payload?.qt?.[tencentCode];
  if (!payload || !quote) throw new Error("missing quote payload");
  const rows = period === "day"
    ? payload.qfqday
    : period === "week"
      ? payload.qfqweek
      : period === "month"
        ? payload.qfqmonth
        : payload.year;
  return { quote, kline: parseKlineRows(rows) };
}

/**
 * 从日线数据聚合计算年K线。
 * 腾讯 API 的年K只返回当年数据（通常只有1条），所以改用东方财富 API 获取历史年K。
 */
async function fetchEastmoneyYearKline(tencentCode: string): Promise<StockDetailKlinePoint[]> {
  // 东方财富 secid 规则：0.xxxx = 深圳, 1.xxxx = 上海
  const plainCode = tencentCode.replace(/^(sh|sz)/, "");
  const marketCode = tencentCode.startsWith("sh") ? "1" : "0";
  const secid = `${marketCode}.${plainCode}`;

  try {
    const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=104&fqt=1&beg=20000101&end=20500101&lmt=100`;
    const response = await fetch(url);
    const json = await response.json() as {
      data?: { klines?: string[] };
    };

    const klines = json.data?.klines ?? [];
    if (klines.length === 0) return [];

    return klines
      .map((line) => {
        const parts = line.split(",");
        if (parts.length < 6) return null;
        // 格式: 日期,开盘,收盘,最高,最低,成交量,成交额,振幅,涨跌幅,涨跌额,换手率
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
      .filter((item): item is StockDetailKlinePoint => (
        item !== null
        && Number.isFinite(item.open)
        && Number.isFinite(item.close)
        && Number.isFinite(item.high)
        && Number.isFinite(item.low)
        && Number.isFinite(item.volume)
      ));
  } catch {
    // 东方财富 API 失败时回退到腾讯的年K数据（当前年）
    const { kline } = await fetchFqPeriod(tencentCode, "year", 240);
    return kline;
  }
}

async function fetchMinutePeriod(tencentCode: string): Promise<{ quote: string[]; kline: StockDetailKlinePoint[] }> {
  const response = await fetch(`https://web.ifzq.gtimg.cn/appstock/app/minute/query?code=${tencentCode}`);
  const json = await response.json() as TencentMinuteResponse;
  const payload = json.data?.[tencentCode];
  const quote = payload?.qt?.[tencentCode];
  const tradeDate = payload?.data?.date ?? "";
  if (!payload || !quote) throw new Error("missing quote payload");
  return { quote, kline: parseMinuteTicks(payload.data?.data, tradeDate, toNumber(quote[4])) };
}

async function fetchFiveDayPeriod(tencentCode: string): Promise<{ quote: string[]; kline: StockDetailKlinePoint[] }> {
  const response = await fetch(`https://web.ifzq.gtimg.cn/appstock/app/day/query?code=${tencentCode}`);
  const json = await response.json() as TencentFiveDayResponse;
  const payload = json.data?.[tencentCode];
  const quote = payload?.qt?.[tencentCode];
  if (!payload || !quote) throw new Error("missing quote payload");
  const merged: StockDetailKlinePoint[] = [];
  (payload.data ?? []).slice().reverse().forEach((day) => {
    const dayKline = parseMinuteTicks(day.data, day.date ?? "", toNumber(day.prec));
    merged.push(...dayKline);
  });
  return { quote, kline: merged };
}

async function fetchMklinePeriod(tencentCode: string, period: "m5" | "m15" | "m30" | "m60" | "m120", count: number): Promise<{ quote: string[]; kline: StockDetailKlinePoint[] }> {
  const response = await fetch(`https://proxy.finance.qq.com/ifzqgtimg/appstock/app/kline/mkline?param=${tencentCode},${period},,${count}`);
  const json = await response.json() as TencentMklineResponse;
  const payload = json.data?.[tencentCode];
  const quote = payload?.qt?.[tencentCode];
  if (!payload || !quote) throw new Error("missing quote payload");
  const rows = payload[period] ?? [];
  const kline = rows
    .map((row) => {
      if (!Array.isArray(row) || row.length < 6) return null;
      const [dt, open, close, high, low, volume] = row;
      return {
        date: formatDateTime(String(dt)),
        open: toNumber(open),
        close: toNumber(close),
        high: toNumber(high),
        low: toNumber(low),
        volume: toNumber(volume),
      };
    })
    .filter((row): row is StockDetailKlinePoint => row !== null);
  return { quote, kline };
}

/**
 * 判断当前时间是否在 A 股交易时段内（09:00 - 15:00）。
 * 非交易时段不自动刷新行情数据，但手动刷新不受限制。
 */
export function isTradingHours(): boolean {
  const now = new Date();
  const hours = now.getHours();
  return hours >= 9 && hours < 15;
}

export async function fetchTencentStockDetail(code: string, fallbackName = "", period: StockPeriod = "day"): Promise<StockDetailData> {
  const plainCode = normalizeStockCode(code);
  const tencentCode = toTencentStockCode(plainCode);
  if (!tencentCode) {
    throw new Error("invalid stock code");
  }

  if (period === "minute") {
    const { quote, kline } = await fetchMinutePeriod(tencentCode);
    return buildDetail(code, plainCode, fallbackName, quote, period, kline);
  }
  if (period === "fiveDay") {
    const { quote, kline } = await fetchFiveDayPeriod(tencentCode);
    return buildDetail(code, plainCode, fallbackName, quote, period, kline);
  }
  if (period === "day" || period === "week" || period === "month" || period === "year") {
    const count = period === "day" ? 800 : 240;
    if (period === "year") {
      const kline = await fetchEastmoneyYearKline(tencentCode);
      // 年K需要从日线单独拿报价
      const { quote } = await fetchFqPeriod(tencentCode, "day", 1);
      return buildDetail(code, plainCode, fallbackName, quote, period, kline);
    }
    const { quote, kline } = await fetchFqPeriod(tencentCode, period, count);
    return buildDetail(code, plainCode, fallbackName, quote, period, kline);
  }
  if (period === "m120" || period === "m60" || period === "m30" || period === "m15" || period === "m5") {
    const { quote, kline } = await fetchMklinePeriod(tencentCode, period, 240);
    return buildDetail(code, plainCode, fallbackName, quote, period, kline);
  }
  throw new Error("unsupported period");
}
