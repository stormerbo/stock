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

export type MacdResult = {
  dif: Array<number | null>;
  dea: Array<number | null>;
  macd: Array<number | null>;
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

function toNumber(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : Number.NaN;
}

function normalizeStockCode(code: string): string {
  const raw = code.trim().toLowerCase();
  const plain = raw.replace(/^(sh|sz)/, "");
  return /^\d{6}$/.test(plain) ? plain : "";
}

function toTencentStockCode(code: string): string {
  const plain = normalizeStockCode(code);
  if (!plain) return "";
  return /^[689]/.test(plain) ? `sh${plain}` : `sz${plain}`;
}

export function formatQuoteTime(raw: string): string {
  if (!/^\d{14}$/.test(raw)) return "-";
  return `${raw.slice(8, 10)}:${raw.slice(10, 12)}:${raw.slice(12, 14)}`;
}

export function calcMA(values: number[], period: number): Array<number | null> {
  const result: Array<number | null> = [];
  let rolling = 0;
  for (let i = 0; i < values.length; i += 1) {
    rolling += values[i];
    if (i >= period) {
      rolling -= values[i - period];
    }
    if (i < period - 1) {
      result.push(null);
      continue;
    }
    result.push(rolling / period);
  }
  return result;
}

function calcEMA(values: number[], period: number): Array<number | null> {
  const alpha = 2 / (period + 1);
  const result: Array<number | null> = [];
  let prev: number | null = null;

  values.forEach((value) => {
    if (!Number.isFinite(value)) {
      result.push(null);
      return;
    }
    if (prev === null) {
      prev = value;
      result.push(value);
      return;
    }
    prev = prev + alpha * (value - prev);
    result.push(prev);
  });
  return result;
}

export function calcMACD(values: number[]): MacdResult {
  const ema12 = calcEMA(values, 12);
  const ema26 = calcEMA(values, 26);
  const dif: Array<number | null> = ema12.map((item, index) => {
    const slow = ema26[index];
    if (item === null || slow === null) return null;
    return item - slow;
  });

  const dea: Array<number | null> = [];
  const alpha = 2 / (9 + 1);
  let prevDea: number | null = null;
  dif.forEach((item) => {
    if (item === null) {
      dea.push(null);
      return;
    }
    if (prevDea === null) {
      prevDea = item;
      dea.push(item);
      return;
    }
    prevDea = prevDea + alpha * (item - prevDea);
    dea.push(prevDea);
  });

  const macd = dif.map((item, index) => {
    const signal = dea[index];
    if (item === null || signal === null) return null;
    return (item - signal) * 2;
  });

  return { dif, dea, macd };
}

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

  return lines
    .map((line) => {
      const [timeRaw, priceRaw, volumeRaw] = String(line).split(" ");
      const price = toNumber(priceRaw);
      const volume = toNumber(volumeRaw);
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
    const count = period === "day" ? 320 : 240;
    const { quote, kline } = await fetchFqPeriod(tencentCode, period, count);
    return buildDetail(code, plainCode, fallbackName, quote, period, kline);
  }
  if (period === "m120" || period === "m60" || period === "m30" || period === "m15" || period === "m5") {
    const { quote, kline } = await fetchMklinePeriod(tencentCode, period, 240);
    return buildDetail(code, plainCode, fallbackName, quote, period, kline);
  }
  throw new Error("unsupported period");
}
