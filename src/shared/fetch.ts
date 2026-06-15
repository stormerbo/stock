// -----------------------------------------------------------
// Shared fetch utilities for background + popup
// -----------------------------------------------------------

import {
  GOLD_INSTRUMENTS,
  getGoldInstrumentByCode,
  getGoldInstrumentBySecid,
  type GoldChartPeriod,
  type GoldInstrumentId,
  type GoldMarket,
} from './gold-config.ts';

export type StockHoldingConfig = {
  code: string;
  name?: string;
  shares: number;
  cost: number;
  pinned?: boolean;
  special?: boolean;
  tags?: string[];
  // hidden metadata for watchlist performance since added
  addedAt?: string;
  addedPrice?: number;
  // 首次建仓时间（shares 从 0 变为 > 0 时记录），用于判断是否需要修正当日盈亏
  positionOpenedAt?: string;
};

export type FundHoldingConfig = {
  code: string;
  units: number;
  cost: number;
  name?: string;
  pinned?: boolean;
  special?: boolean;
  tags?: string[];
  // hidden metadata for watchlist performance since added
  addedAt?: string;
  addedNav?: number;
};

export type StockPosition = {
  code: string;
  name: string;
  shares: number;
  cost: number;
  price: number;
  prevClose: number;
  floatingPnl: number;
  dailyPnl: number;
  dailyChangePct: number;
  intraday?: { data: Array<{ time: string; price: number }>; prevClose: number };
  updatedAt: string;
};

export type FundPosition = {
  code: string;
  name: string;
  units: number;
  cost: number;
  latestNav: number;
  prevDayNav: number;
  navDate: string;
  navDisclosedToday: boolean;
  estimatedNav: number;
  holdingAmount: number;
  holdingProfit: number;
  holdingProfitRate: number;
  changePct: number;
  estimatedProfit: number;
  updatedAt: string;
};

export type DailyAssetSnapshot = {
  date: string;
  totalPnl: number;      // 累计收益（股票+基金）
  floatingPnl: number;   // 当前浮动盈亏
  realizedPnl: number;   // 已实现盈亏
  stockPnl: number;      // 股票累计收益
  fundPnl: number;       // 基金累计收益
};

export type MarketIndexQuote = {
  code: string;
  label: string;
  price: number;
  change: number;
  changePct: number;
};

export type GoldQuote = {
  code: GoldInstrumentId;
  symbol: string;
  label: string;
  market: GoldMarket;
  price: number;
  change: number;
  changePct: number;
  unit: string;
  updatedAt: string;
};

export type GoldIntradayPoint = {
  time: string;
  price: number;
};

export type GoldIntradayData = {
  data: GoldIntradayPoint[];
  kline: GoldDetailKlinePoint[];
  prevClose: number;
};

export type GoldDetailKlinePoint = {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
};

export const MARKET_INDEXES: Array<{ code: string; label: string }> = [
  { code: 'sh000001', label: '上证指数' },
  { code: 'sz399300', label: '沪深300' },
  { code: 'sz399001', label: '深证成指' },
  { code: 'sz399006', label: '创业板指' },
];

export const TRADING_MINUTES = 240;
const MORNING_START = 9 * 60 + 30;
const MORNING_END = 11 * 60 + 30;
const AFTERNOON_START = 13 * 60;
const AFTERNOON_END = 15 * 60;

// -----------------------------------------------------------
// Utility functions
// -----------------------------------------------------------

export function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : Number.NaN;
}

export function normalizeStockCode(code: string): string {
  const raw = code.trim().toLowerCase();
  const plain = raw.replace(/^(sh|sz)/, '');
  return /^\d{6}$/.test(plain) ? plain : '';
}

export function toTencentStockCode(code: string): string {
  const plain = normalizeStockCode(code);
  if (!plain) return '';
  return /^[689]/.test(plain) ? `sh${plain}` : `sz${plain}`;
}

function toEastmoneyStockSecid(code: string): string {
  const plain = normalizeStockCode(code);
  if (!plain) return '';
  const market = /^[569]/.test(plain) ? 1 : 0;
  return `${market}.${plain}`;
}

function toEastmoneyIndexSecid(code: string): string {
  const normalized = code.trim().toLowerCase();
  if (normalized === 'sz399300') {
    // 沪深300 在东财接口中使用 1.000300
    return '1.000300';
  }
  const matched = normalized.match(/^(sh|sz)(\d{6})$/);
  if (!matched) return '';
  const market = matched[1] === 'sh' ? 1 : 0;
  return `${market}.${matched[2]}`;
}

function formatEastmoneyTime(raw: unknown): string {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return '-';
  const date = new Date(n * 1000);
  if (!Number.isFinite(date.getTime())) return '-';
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`;
}

export function normalizeFundCode(code: string): string {
  const raw = code.trim();
  return /^\d{6}$/.test(raw) ? raw : '';
}

export function isEtfFundName(name?: string): boolean {
  const text = (name ?? '').trim();
  if (!text) return false;
  return /ETF(?!联接)/i.test(text) || /交易型开放式指数基金/.test(text);
}

export function formatQuoteTime(raw: string): string {
  if (!/^\d{14}$/.test(raw)) return '-';
  return `${raw.slice(8, 10)}:${raw.slice(10, 12)}:${raw.slice(12, 14)}`;
}

export function getShanghaiToday(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const year = parts.find((item) => item.type === 'year')?.value ?? '0000';
  const month = parts.find((item) => item.type === 'month')?.value ?? '00';
  const day = parts.find((item) => item.type === 'day')?.value ?? '00';
  return `${year}-${month}-${day}`;
}

/** 获取上海时区的昨天日期 YYYY-MM-DD */
export function getShanghaiYesterday(): string {
  const now = new Date();
  // 用上海时区的当前时间构造日期，减一天
  const shanghaiStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const y = shanghaiStr.find((p) => p.type === 'year')?.value ?? '0000';
  const m = shanghaiStr.find((p) => p.type === 'month')?.value ?? '00';
  const d = shanghaiStr.find((p) => p.type === 'day')?.value ?? '00';
  const shanghaiDate = new Date(`${y}-${m}-${d}T00:00:00+08:00`);
  shanghaiDate.setDate(shanghaiDate.getDate() - 1);
  return shanghaiDate.toISOString().slice(0, 10);
}

/** 获取最近一个交易日（周末回退到周五） */
export function getLastTradingDay(): string {
  const dayOfWeek = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    weekday: 'short',
  }).format(new Date());
  const today = getShanghaiToday();
  const [y, m, d] = today.split('-').map(Number);
  const offset = dayOfWeek === 'Sun' ? 2 : dayOfWeek === 'Sat' ? 1 : 0;
  if (offset === 0) return today;
  const date = new Date(Date.UTC(y, m - 1, d) - offset * 86400000);
  return date.toISOString().slice(0, 10);
}

/**
 * 判断当前时间是否在 A 股交易时段内（上海时区 09:00 - 15:00）。
 */
export function isTradingHours(): boolean {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());

  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  const totalMinutes = hour * 60 + minute;

    const graceEnd = AFTERNOON_END + 30;
  return totalMinutes >= MORNING_START && totalMinutes <= graceEnd;
}

/**
 * 判断当前时间是否在 A 股交易日的数据可用时段（上海时区 09:00 - 15:00，含午休）。
 * 用于控制侧边栏市场统计面板的显示——午休时数据仍有效，应继续显示。
 */
export function isMarketDataAvailable(): boolean {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());

  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  const totalMinutes = hour * 60 + minute;

  // 09:00 - 15:00（含午休 11:30-13:00）
  return totalMinutes >= 9 * 60 && totalMinutes <= AFTERNOON_END;
}

// -----------------------------------------------------------
// Fetch helpers
// -----------------------------------------------------------

export async function fetchTextViaExtension(url: string): Promise<string> {
  const directFetch = async () => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Direct fetch failed: ${response.status}`);
    }
    if (url.includes('qt.gtimg.cn')) {
      const buffer = await response.arrayBuffer();
      return new TextDecoder('gb18030').decode(buffer);
    }
    return response.text();
  };

  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    try {
      const result = await chrome.runtime.sendMessage<
        { type: 'fetch-text'; url: string },
        { ok: boolean; status: number; text?: string; error?: string }
      >({
        type: 'fetch-text',
        url,
      });

      if (result?.ok && typeof result.text === 'string') {
        return result.text;
      }
    } catch {
      // Fall through to direct fetch when the service worker channel is unavailable.
    }

    return directFetch();
  }

  return directFetch();
}
export async function fetchTextWithEncoding(url: string, encoding: string): Promise<string> {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  return new TextDecoder(encoding).decode(buffer);
}

// -----------------------------------------------------------
// Market data fetch functions
// -----------------------------------------------------------

export async function fetchBatchStockQuotes(holdings: StockHoldingConfig[]): Promise<StockPosition[]> {
  const valid = holdings
    .map((h) => ({ ...h, code: normalizeStockCode(h.code) }))
    .filter((h) => h.code);

  if (valid.length === 0) return [];

  const eastmoneyRows = await fetchBatchStockQuotesFromEastmoney(valid);
  if (eastmoneyRows.length > 0) return eastmoneyRows;
  return fetchBatchStockQuotesFromTencent(valid);
}

export async function fetchStockIntraday(code: string): Promise<{ data: Array<{ time: string; price: number }>; prevClose: number }> {
  try {
    const tencentCode = toTencentStockCode(normalizeStockCode(code));
    const secid = toEastmoneySecidFromTencent(tencentCode);
    if (!secid) throw new Error('invalid secid');
    const text = await fetchTextViaExtension(
      'https://push2his.eastmoney.com/api/qt/stock/trends2/get?secid=' + encodeURIComponent(secid) + '&fields1=f1,f2,f3,f4,f5,f6,f7&fields2=f51,f52,f53,f54,f55,f56,f57,f58&iscr=0&ndays=1&lmt=240&_=' + Date.now(),
    );
    const json = JSON.parse(text) as { data?: { trends?: string[] } };
    const trends = json.data?.trends ?? [];
    const data: Array<{ time: string; price: number }> = [];
    for (const line of trends) {
      const parts = String(line).split(',');
      if (parts.length < 6) continue;
      const time = String(parts[0]).slice(-5);
      const price = toNumber(parts[2]);
      if (!/^\d{2}:\d{2}$/.test(time) || !Number.isFinite(price)) continue;
      data.push({ time, price });
    }
    return { data, prevClose: Number.NaN };
  } catch (err) {
    console.warn('[fetchStockIntraday] failed:', code, err);
    return { data: [], prevClose: Number.NaN };
  }
}

export async function fetchTencentMarketIndexes(): Promise<MarketIndexQuote[]> {
  const eastmoneyRows = await fetchMarketIndexesFromEastmoney();
  if (eastmoneyRows.length > 0) return eastmoneyRows;
  return fetchMarketIndexesFromTencent();
}

type EastmoneyUlistRow = {
  f2?: number | string;   // latest price
  f3?: number | string;   // pct change
  f4?: number | string;   // absolute change
  f6?: number | string;   // turnover amount
  f12?: string;           // code
  f13?: number | string;  // market
  f14?: string;           // name
  f18?: number | string;  // prev close
  f124?: number | string; // timestamp
};

type EastmoneyStockGetRow = {
  f43?: number | string;  // latest price * 100
  f57?: string;           // code
  f58?: string;           // name
  f60?: number | string;  // prev close * 100
  f86?: number | string;  // timestamp
  f169?: number | string; // absolute change * 100
  f170?: number | string; // pct change * 100
};

type RawGoldQuoteInput = {
  source: 'eastmoney-ulist' | 'eastmoney-stock-get';
  secid: string;
  code: string;
  label: GoldQuote['label'];
  market: GoldQuote['market'];
  unit: string;
  row: EastmoneyUlistRow | EastmoneyStockGetRow;
};

function parseEastmoneyUlistPayload(text: string): EastmoneyUlistRow[] {
  const raw = text.trim();
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start < 0 || end <= start) return [];
    try {
      parsed = JSON.parse(raw.slice(start, end + 1));
    } catch {
      return [];
    }
  }

  const json = parsed as {
    data?: {
      diff?: EastmoneyUlistRow[];
    };
  };

  const diff = json.data?.diff;
  return Array.isArray(diff) ? diff : [];
}

async function fetchEastmoneyUlistRows(secids: string[]): Promise<EastmoneyUlistRow[]> {
  if (secids.length === 0) return [];
  const query = encodeURIComponent(secids.join(','));
  const text = await fetchTextViaExtension(
    `https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&fields=f2,f3,f12,f13,f14,f18,f6,f124&secids=${query}`
  );
  return parseEastmoneyUlistPayload(text);
}

function parseEastmoneyStockGetPayload(text: string): EastmoneyStockGetRow | null {
  const raw = text.trim();
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      parsed = JSON.parse(raw.slice(start, end + 1));
    } catch {
      return null;
    }
  }

  const json = parsed as { data?: EastmoneyStockGetRow | null };
  return json.data && typeof json.data === 'object' ? json.data : null;
}

async function fetchEastmoneyStockGetRow(secid: string): Promise<EastmoneyStockGetRow | null> {
  const text = await fetchTextViaExtension(
    `https://push2.eastmoney.com/api/qt/stock/get?secid=${encodeURIComponent(secid)}&fields=f43,f57,f58,f60,f86,f169,f170`
  );
  return parseEastmoneyStockGetPayload(text);
}

function scaledEastmoneyNumber(value: unknown): number {
  if (value === null || value === undefined || value === '') return Number.NaN;
  const parsed = toNumber(value);
  return Number.isFinite(parsed) ? parsed / 100 : Number.NaN;
}

function strictToNumber(value: unknown): number {
  if (value === null || value === undefined || value === '') return Number.NaN;
  return toNumber(value);
}

export function parseGoldQuoteRows(rows: RawGoldQuoteInput[]): GoldQuote[] {
  const mapped = new Map<GoldQuote['code'], GoldQuote>();

  for (const item of rows) {
    const instrument = getGoldInstrumentBySecid(item.secid);
    if (!instrument) continue;

    const row = item.row;
    const price = item.source === 'eastmoney-stock-get'
      ? scaledEastmoneyNumber((row as EastmoneyStockGetRow).f43)
      : strictToNumber((row as EastmoneyUlistRow).f2);
    const change = item.source === 'eastmoney-stock-get'
      ? scaledEastmoneyNumber((row as EastmoneyStockGetRow).f169)
      : strictToNumber((row as EastmoneyUlistRow).f4);
    const changePct = item.source === 'eastmoney-stock-get'
      ? scaledEastmoneyNumber((row as EastmoneyStockGetRow).f170)
      : strictToNumber((row as EastmoneyUlistRow).f3);
    const updatedAt = item.source === 'eastmoney-stock-get'
      ? formatEastmoneyTime((row as EastmoneyStockGetRow).f86)
      : formatEastmoneyTime((row as EastmoneyUlistRow).f124);

    mapped.set(instrument.id, {
      code: instrument.id,
      symbol: instrument.code,
      label: instrument.label,
      market: instrument.market,
      price,
      change,
      changePct,
      unit: instrument.unit,
      updatedAt,
    });
  }

  return GOLD_INSTRUMENTS
    .map((item) => mapped.get(item.id))
    .filter((item): item is GoldQuote => Boolean(item));
}

export async function fetchGoldQuotes(): Promise<GoldQuote[]> {
  // 1) Try batch ulist API (supports all markets, returns correct prices for international products)
  try {
    const secids = GOLD_INSTRUMENTS.map((i) => i.secid);
    const text = await fetchTextViaExtension(
      `https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&secids=${encodeURIComponent(secids.join(','))}&fields=f2,f3,f4,f12,f13,f14,f124`,
    );
    const ulistRows = parseEastmoneyUlistPayload(text);
    if (ulistRows.length >= GOLD_INSTRUMENTS.length * 0.5) {
      const mapped = ulistRows
        .map((row) => {
          const secid = String(Math.trunc(Number(row.f13))) + '.' + String(row.f12 ?? '').trim();
          const instrument = getGoldInstrumentBySecid(secid);
          if (!instrument) return null;
          return {
            source: 'eastmoney-ulist' as const,
            secid,
            code: String(row.f12 ?? ''),
            label: instrument.label,
            market: instrument.market,
            unit: instrument.unit,
            row,
          };
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item));
      const parsed = parseGoldQuoteRows(mapped);
      if (parsed.length >= GOLD_INSTRUMENTS.length * 0.5) return parsed;
    }
  } catch { /* fall through */ }


  const results = await pMap(GOLD_INSTRUMENTS, async (instrument) => {
    // 1) Try stock/get API
    try {
      const row = await fetchEastmoneyStockGetRow(instrument.secid);
      if (row) {
        const stockPrice = scaledEastmoneyNumber(row.f43);
        // stock/get can return f43=0 for products with no activity (e.g. NYAuTN12);
        // reject zero prices so fallbacks (trends2/kline) get a chance
        if (Number.isFinite(stockPrice) && stockPrice > 0) {
          return {
            code: instrument.id,
            symbol: instrument.code,
            label: instrument.label,
            market: instrument.market,
            price: stockPrice,
            change: scaledEastmoneyNumber(row.f169),
            changePct: scaledEastmoneyNumber(row.f170),
            unit: instrument.unit,
            updatedAt: formatEastmoneyTime(row.f86),
          } satisfies GoldQuote;
        }
      }
    } catch { /* fall through */ }

    // 2) Fallback: extract quote from trends2 API
    try {
      const text = await fetchTextViaExtension(
        `https://push2.eastmoney.com/api/qt/stock/trends2/get?secid=${encodeURIComponent(instrument.secid)}&fields1=f1,f2,f3,f4,f5,f6,f7&fields2=f51,f52,f53,f54,f55,f56,f57,f58&iscr=0&ndays=1`,
      );
      const json = JSON.parse(text) as {
        data?: { trends?: string[]; preSettlement?: number };
      };
      const trends = json.data?.trends;
      if (trends && trends.length > 0) {
        const last = trends[trends.length - 1].split(',');
        const close = toNumber(last[2]);
        if (Number.isFinite(close)) {
          const prevSettle = toNumber(json.data?.preSettlement);
          const prevClose = Number.isFinite(prevSettle) ? prevSettle : Number.NaN;
          const change = Number.isFinite(prevClose) ? close - prevClose : Number.NaN;
          const changePct = Number.isFinite(prevClose) && prevClose > 0
            ? (change / prevClose) * 100
            : Number.NaN;
          const ts = String(last[0] ?? '');
          const timePart = ts.length >= 16 ? ts.slice(-8, -3) : ts.slice(-5);
          const updatedAt = /^\d{2}:\d{2}$/.test(timePart) ? `${timePart}:00` : '-';
          return {
            code: instrument.id,
            symbol: instrument.code,
            label: instrument.label,
            market: instrument.market,
            price: close,
            change,
            changePct,
            unit: instrument.unit,
            updatedAt,
          } satisfies GoldQuote;
        }
      }
        } catch { /* ignore */ }

    // 3) Third fallback: extract latest price from kline API
    try {
      const text = await fetchTextViaExtension(
        `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${encodeURIComponent(instrument.secid)}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=101&fqt=0&beg=20260601&end=20500101&lmt=5`,
      );
      const json = JSON.parse(text) as {
        data?: { klines?: string[]; preKPrice?: number };
      };
      const klines = json.data?.klines;
      if (klines && klines.length > 0) {
        const last = klines[klines.length - 1].split(',');
        const close = toNumber(last[2]);
        if (Number.isFinite(close)) {
          let prevClose = toNumber(json.data?.preKPrice);
          if (!Number.isFinite(prevClose) && klines.length >= 2) {
            const prev = klines[klines.length - 2].split(',');
            prevClose = toNumber(prev[2]);
          }
          const change = Number.isFinite(prevClose) ? close - prevClose : Number.NaN;
          const changePct = Number.isFinite(prevClose) && prevClose > 0
            ? (change / prevClose) * 100
            : Number.NaN;
          return {
            code: instrument.id,
            symbol: instrument.code,
            label: instrument.label,
            market: instrument.market,
            price: close,
            change,
            changePct,
            unit: instrument.unit,
            updatedAt: String(last[0] ?? '').slice(-5) + ':00',
          } satisfies GoldQuote;
        }
      }
    } catch { /* ignore */ }
    return null;
  }, 4);const quoteMap = new Map<GoldQuote['code'], GoldQuote>();
  for (const q of results) {
    if (q) quoteMap.set(q.code, q);
  }
  return GOLD_INSTRUMENTS
    .map((item) => quoteMap.get(item.id))
    .filter((item): item is GoldQuote => Boolean(item));
}
export function parseGoldIntradayRows(trends: string[], fallbackPrevClose: number): GoldIntradayData {
  const data: GoldIntradayPoint[] = [];
  const kline: GoldDetailKlinePoint[] = [];
  for (const line of trends) {
    const parts = String(line).split(',');
    if (parts.length < 6) continue;
    const timestamp = String(parts[0] ?? '');
    const open = toNumber(parts[1]);
    const close = toNumber(parts[2]);
    const high = toNumber(parts[3]);
    const low = toNumber(parts[4]);
    const volume = toNumber(parts[5]);
    const price = close;
    if (!Number.isFinite(price)) continue;
    const time = timestamp.slice(-5);
    if (!/^\d{2}:\d{2}$/.test(time)) continue;
    data.push({ time, price });
    kline.push({
      date: timestamp,
      open: Number.isFinite(open) ? open : price,
      close: price,
      high: Number.isFinite(high) ? high : price,
      low: Number.isFinite(low) ? low : price,
      volume: Number.isFinite(volume) ? volume : 0,
    });
  }
  return {
    data,
    kline,
    prevClose: Number.isFinite(fallbackPrevClose) ? fallbackPrevClose : Number.NaN,
  };
}

export function parseGoldKlineRows(rows: string[]): GoldDetailKlinePoint[] {
  const result: GoldDetailKlinePoint[] = [];
  for (const line of rows) {
    const parts = String(line).split(',');
    if (parts.length < 6) continue;
    const [date, open, close, high, low, volume] = parts;
    const item = {
      date: String(date),
      open: toNumber(open),
      close: toNumber(close),
      high: toNumber(high),
      low: toNumber(low),
      volume: toNumber(volume),
    };
    if (
      Number.isFinite(item.open)
      && Number.isFinite(item.close)
      && Number.isFinite(item.high)
      && Number.isFinite(item.low)
      && Number.isFinite(item.volume)
    ) {
      result.push(item);
    }
  }
  return result;
}

function getGoldKlineType(period: Exclude<GoldChartPeriod, 'minute'>): 101 | 102 | 103 {
  if (period === 'week') return 102;
  if (period === 'month') return 103;
  return 101;
}

export async function fetchGoldIntraday(code: string): Promise<GoldIntradayData> {
  const instrument = getGoldInstrumentByCode(code);
  if (!instrument) throw new Error('invalid gold code');

  const text = await fetchTextViaExtension(
    `https://push2.eastmoney.com/api/qt/stock/trends2/get?secid=${encodeURIComponent(instrument.secid)}&fields1=f1,f2,f3,f4,f5,f6,f7&fields2=f51,f52,f53,f54,f55,f56,f57,f58&iscr=0&ndays=1`,
  );
  const json = JSON.parse(text) as {
    data?: { trends?: string[]; preSettlement?: number };
  };
  const rawTrends = json.data?.trends ?? [];
  // Filter out night session (20:00-02:30) data — keep only day session (09:00-15:30)
  // Gold night session data has zero volume and flat prices, making the chart mostly unreadable
  const dayTrends = rawTrends.filter((t: string) => {
    const parts = t.split(',');
    if (parts.length < 6) return false;
    const ts = String(parts[0] ?? '');
    if (!ts.includes(' ')) return false;
    const hour = parseInt(ts.split(' ')[1]?.slice(0, 2), 10);
    return hour >= 9 && hour <= 15;
  });
  // If no day session data (e.g. before 09:00), fall back to raw data
  if (dayTrends.length < 5 && rawTrends.length > 0) {
    return parseGoldIntradayRows(rawTrends, toNumber(json.data?.preSettlement));
  }
  return parseGoldIntradayRows(dayTrends, toNumber(json.data?.preSettlement));
}

export async function fetchGoldKline(code: string, period: Exclude<GoldChartPeriod, 'minute'>): Promise<GoldDetailKlinePoint[]> {
  const instrument = getGoldInstrumentByCode(code);
  if (!instrument) throw new Error('invalid gold code');

  const text = await fetchTextViaExtension(
    `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${encodeURIComponent(instrument.secid)}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=${getGoldKlineType(period)}&fqt=0&beg=20000101&end=20500101&lmt=240`,
  );
  const json = JSON.parse(text) as {
    data?: { klines?: string[] };
  };
  return parseGoldKlineRows(json.data?.klines ?? []);
}

function toEastmoneySecidFromRow(row: EastmoneyUlistRow): string {
  const market = Number(row.f13);
  const code = String(row.f12 ?? '').trim();
  if (!Number.isFinite(market) || !code) return '';
  return `${Math.trunc(market)}.${code}`;
}

/** Convert Tencent-style code (sh000001) to Eastmoney secid format (1.000001). */
export function toEastmoneySecidFromTencent(tencentCode: string): string {
  const str = tencentCode.trim().toLowerCase();
  // sz399300 (沪深300) is listed on Shanghai
  if (str === 'sz399300') return '1.000300';
  const m = str.match(/^(sh|sz)(\d{6})$/);
  if (!m) return '';
  return m[1] === 'sh' ? `1.${m[2]}` : `0.${m[2]}`;
}

async function fetchBatchStockQuotesFromEastmoney(holdings: Array<StockHoldingConfig & { code: string }>): Promise<StockPosition[]> {
  try {
    const secids = holdings.map((holding) => toEastmoneyStockSecid(holding.code)).filter(Boolean);
    if (secids.length === 0) return [];
    const rows = await fetchEastmoneyUlistRows(secids);
    if (rows.length === 0) return [];

    const rowMap = new Map<string, EastmoneyUlistRow>();
    for (const row of rows) {
      const secid = toEastmoneySecidFromRow(row);
      if (secid) rowMap.set(secid, row);
    }

    return holdings.map((holding) => {
      const secid = toEastmoneyStockSecid(holding.code);
      const row = rowMap.get(secid);

      const shares = Math.max(0, holding.shares);
      const cost = Math.max(0, holding.cost);
      const price = toNumber(row?.f2);
      const prevClose = toNumber(row?.f18);
      const change = Number.isFinite(price) && Number.isFinite(prevClose) ? price - prevClose : Number.NaN;
      const changePct = toNumber(row?.f3);
      const floatingPnl = shares > 0 && cost > 0 && Number.isFinite(price)
        ? (price - cost) * shares
        : Number.NaN;
      const dailyPnl = shares > 0 && Number.isFinite(change)
        ? change * shares
        : Number.NaN;

      return {
        code: holding.code,
        name: String(row?.f14 ?? '').trim() || holding.code,
        shares,
       cost,
       price,
       prevClose,
       floatingPnl,
       dailyPnl,
       dailyChangePct: changePct,
       updatedAt: formatEastmoneyTime(row?.f124),
     };
   });
 } catch {
    return [];
  }
}

async function fetchBatchStockQuotesFromTencent(holdings: Array<StockHoldingConfig & { code: string }>): Promise<StockPosition[]> {
  const tencentCodes = holdings.map((h) => toTencentStockCode(h.code));
  const text = await fetchTextWithEncoding(
    `https://qt.gtimg.cn/q=${tencentCodes.join(',')}`,
    'gb18030',
  );

  return holdings.map((holding) => {
    const tencentCode = toTencentStockCode(holding.code);
    const matched = text.match(new RegExp(`v_${tencentCode}=\"([^\"]*)\"`));
    const parts = matched?.[1]?.split('~') ?? [];

    const shares = Math.max(0, holding.shares);
    const cost = Math.max(0, holding.cost);
    const price = toNumber(parts[3]);
    const prevClose = toNumber(parts[4]);
    const change = toNumber(parts[31]);
    const changePct = toNumber(parts[32]);
    const floatingPnl = shares > 0 && cost > 0 && Number.isFinite(price)
      ? (price - cost) * shares
      : Number.NaN;
    const dailyPnl = shares > 0 && Number.isFinite(change)
      ? change * shares
      : Number.NaN;

    return {
      code: holding.code,
      name: parts[1] || holding.code,
      shares,
      cost,
      price,
      prevClose,
      floatingPnl,
      dailyPnl,
      dailyChangePct: changePct,
      updatedAt: formatQuoteTime(parts[30] || ''),
    };
  });
}

async function fetchMarketIndexesFromEastmoney(): Promise<MarketIndexQuote[]> {
  try {
    const secids = MARKET_INDEXES.map((item) => toEastmoneyIndexSecid(item.code)).filter(Boolean);
    if (secids.length === 0) return [];
    const rows = await fetchEastmoneyUlistRows(secids);
    if (rows.length === 0) return [];

    const rowMap = new Map<string, EastmoneyUlistRow>();
    for (const row of rows) {
      const secid = toEastmoneySecidFromRow(row);
      if (secid) rowMap.set(secid, row);
    }

    return MARKET_INDEXES.map((item) => {
      const secid = toEastmoneyIndexSecid(item.code);
      const row = rowMap.get(secid);
      const price = toNumber(row?.f2);
      const prevClose = toNumber(row?.f18);
      const change = Number.isFinite(price) && Number.isFinite(prevClose) ? price - prevClose : Number.NaN;

      return {
        code: item.code,
        label: String(row?.f14 ?? '').trim() || item.label,
        price,
        change,
        changePct: toNumber(row?.f3),
      };
    });
  } catch {
    return [];
  }
}

async function fetchMarketIndexesFromTencent(): Promise<MarketIndexQuote[]> {
  const query = MARKET_INDEXES.map((item) => `s_${item.code}`).join(',');
  const text = await fetchTextWithEncoding(`https://qt.gtimg.cn/q=${query}`, 'gb18030');

  return MARKET_INDEXES.map((item) => {
    const matched = text.match(new RegExp(`v_s_${item.code}=\"([^\"]*)\";?`));
    const parts = matched?.[1]?.split('~') ?? [];
    return {
      code: item.code,
      label: parts[1] || item.label,
      price: toNumber(parts[3]),
      change: toNumber(parts[4]),
      changePct: toNumber(parts[5]),
    };
  });
}

export type MarketStats = {
  upCount: number;      // 上涨家数
  flatCount: number;    // 平盘家数
  downCount: number;    // 下跌家数
  turnover: number;     // 成交额（亿）
  prevTurnover: number; // 昨成交（亿）
  volumeChange: number; // 缩量/放量（亿）
};

const MARKET_STATS_HOST = 'https://40.push2.eastmoney.com';
const SINA_MARKET_HOST = 'https://vip.stock.finance.sina.com.cn';
const MARKET_SNAPSHOT_INDEXES = ['sh000001', 'sz399001', 'bj899050'] as const;

type MarketBreadthSnapshot = {
  upCount: number;
  flatCount: number;
  downCount: number;
  turnover: number; // 亿
};

type MarketTurnoverSnapshot = {
  turnover: number; // 亿
  prevTurnover: number; // 亿
};

function roundTo2(value: number): number {
  return Math.round(value * 100) / 100;
}

function parseSinaCountText(text: string): number {
  const parsed = JSON.parse(text) as unknown;
  const n = Number(parsed);
  return Number.isFinite(n) ? Math.floor(n) : 0;
}

async function fetchSinaBreadthSnapshot(): Promise<MarketBreadthSnapshot> {
  const countText = await fetchTextViaExtension(
    `${SINA_MARKET_HOST}/quotes_service/api/json_v2.php/Market_Center.getHQNodeStockCountSimple?node=hs_a`
  );
  const totalCount = parseSinaCountText(countText);
  if (totalCount <= 0) {
    throw new Error('invalid sina market count');
  }

  const PAGE_SIZE = 3000;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  let upCount = 0;
  let flatCount = 0;
  let downCount = 0;
  let totalTurnover = 0;

  for (let page = 1; page <= totalPages; page++) {
    const text = await fetchTextViaExtension(
      `${SINA_MARKET_HOST}/quotes_service/api/json_v2.php/Market_Center.getHQNodeDataSimple?node=hs_a&num=${PAGE_SIZE}&page=${page}&sort=changepercent&asc=0`
    );
    const rows = JSON.parse(text) as Array<Record<string, unknown>>;
    if (!Array.isArray(rows) || rows.length === 0) {
      continue;
    }

    for (const item of rows) {
      const change = toNumber(item.changepercent ?? item.pricechange);
      const amount = toNumber(item.amount);

      if (Number.isFinite(change)) {
        if (change > 0.001) upCount++;
        else if (change < -0.001) downCount++;
        else flatCount++;
      }

      if (Number.isFinite(amount)) {
        totalTurnover += amount;
      }
    }
  }

  return {
    upCount,
    flatCount,
    downCount,
    turnover: roundTo2(totalTurnover / 1e8),
  };
}

function parseTencentSimpleAmountWan(text: string, code: string): number {
  const matched = text.match(new RegExp(`v_s_${code}=\"([^\"]*)\";?`));
  const parts = matched?.[1]?.split('~') ?? [];
  // s_ quote layout: ... ~ volume ~ amount(万元) ~ ...
  return toNumber(parts[7]);
}

function pickPrevKlineAmountWan(rows: unknown, today: string): number {
  if (!Array.isArray(rows) || rows.length === 0) return Number.NaN;
  const normalized = rows
    .filter((row): row is Array<string | number> => Array.isArray(row))
    .map((row) => ({
      date: String(row[0] ?? ''),
      amountWan: toNumber(row[8]),
    }))
    .filter((row) => row.date && Number.isFinite(row.amountWan));

  if (normalized.length === 0) return Number.NaN;
  const todayIdx = normalized.findIndex((row) => row.date === today);
  if (todayIdx > 0) {
    return normalized[todayIdx - 1].amountWan;
  }
  return normalized[normalized.length - 1].amountWan;
}

async function fetchTencentTurnoverSnapshot(): Promise<MarketTurnoverSnapshot> {
  const quoteQuery = MARKET_SNAPSHOT_INDEXES.map((code) => `s_${code}`).join(',');
  // Route through extension background fetch proxy to avoid popup-side CORS/encoding issues.
  const quoteText = await fetchTextViaExtension(`https://qt.gtimg.cn/q=${quoteQuery}`);

  let todayAmountWan = 0;
  for (const code of MARKET_SNAPSHOT_INDEXES) {
    const amountWan = parseTencentSimpleAmountWan(quoteText, code);
    if (Number.isFinite(amountWan)) {
      todayAmountWan += amountWan;
    }
  }
  const turnover = todayAmountWan > 0 ? roundTo2(todayAmountWan / 10000) : Number.NaN;

  const today = getShanghaiToday();
  const klineResults = await Promise.all(
    MARKET_SNAPSHOT_INDEXES.map(async (code) => {
      const text = await fetchTextViaExtension(
        `https://web.ifzq.gtimg.cn/appstock/app/newfqkline/get?param=${code},day,,,8,qfq`
      );
      const json = JSON.parse(text) as {
        data?: Record<string, { day?: unknown }>;
      };
      return pickPrevKlineAmountWan(json.data?.[code]?.day, today);
    })
  );

  const prevAmountWan = klineResults.reduce((sum, item) => {
    if (!Number.isFinite(item)) return sum;
    return sum + item;
  }, 0);
  const prevTurnover = prevAmountWan > 0 ? roundTo2(prevAmountWan / 10000) : Number.NaN;

  return { turnover, prevTurnover };
}

async function fetchEastmoneyTurnoverSnapshot(): Promise<number> {
  const secids = ['1.000001', '0.399001', '0.899050'];
  const values = await Promise.all(
    secids.map(async (secid) => {
      const text = await fetchTextViaExtension(
        `${MARKET_STATS_HOST}/api/qt/stock/get?secid=${secid}&fields=f48`
      );
      const json = JSON.parse(text) as { data?: { f48?: number | string } };
      return toNumber(json.data?.f48);
    })
  );

  const sum = values.reduce((acc, value) => (Number.isFinite(value) ? acc + value : acc), 0);
  return sum > 0 ? roundTo2(sum / 1e8) : Number.NaN;
}

async function fetchEastmoneyBreadthFallback(): Promise<MarketBreadthSnapshot | null> {
  try {
    const PAGE_SIZE = 100;
    const MAX_PAGES = 60;
    let upCount = 0;
    let flatCount = 0;
    let downCount = 0;
    let totalTurnover = 0;

    for (let page = 1; page <= MAX_PAGES; page++) {
      const text = await fetchTextViaExtension(
        `${MARKET_STATS_HOST}/api/qt/clist/get?pn=${page}&pz=${PAGE_SIZE}&np=1&fltt=2&invt=2&fid=f3&fs=m:0+t:6,m:0+t:80,m:0+t:30,m:1+t:2,m:1+t:23&fields=f3,f6`
      );
      const json = JSON.parse(text) as {
        data?: {
          diff?: Array<{
            f3?: string | number;
            f6?: string | number;
          }>;
        };
      };

      const diffs = json.data?.diff;
      if (!Array.isArray(diffs) || diffs.length === 0) break;

      for (const item of diffs) {
        const change = toNumber(item.f3);
        const turnover = toNumber(item.f6);

        if (Number.isFinite(change)) {
          if (change > 0.001) upCount++;
          else if (change < -0.001) downCount++;
          else flatCount++;
        }

        if (Number.isFinite(turnover)) {
          totalTurnover += turnover;
        }
      }
    }

    return {
      upCount,
      flatCount,
      downCount,
      turnover: roundTo2(totalTurnover / 1e8),
    };
  } catch (error) {
    console.warn('[fetchMarketStats] eastmoney breadth fallback failed:', error);
    return null;
  }
}

/**
 * 多源聚合市场统计：
 * 1) 新浪：上涨/平盘/下跌家数（及成交额兜底）
 * 2) 腾讯：成交额 + 昨成交（通过指数实时+日K）
 * 3) 东财：成交额兜底（stock/get），并保留 breadth 兜底
 */
export async function fetchMarketStats(): Promise<MarketStats | null> {
  // 过了交易时间不再拉取（数据不变）
  if (!isTradingHours()) return null;
  const [sinaResult, tencentResult, eastmoneyTurnoverResult] = await Promise.allSettled([
    fetchSinaBreadthSnapshot(),
    fetchTencentTurnoverSnapshot(),
    fetchEastmoneyTurnoverSnapshot(),
  ]);

  const sina = sinaResult.status === 'fulfilled' ? sinaResult.value : null;
  const tencent = tencentResult.status === 'fulfilled' ? tencentResult.value : null;
  const eastmoneyTurnover = eastmoneyTurnoverResult.status === 'fulfilled'
    ? eastmoneyTurnoverResult.value
    : Number.NaN;

  if (!sina) {
    const eastmoneyBreadth = await fetchEastmoneyBreadthFallback();
    if (!eastmoneyBreadth) return null;
    const turnover = Number.isFinite(eastmoneyTurnover) ? eastmoneyTurnover : eastmoneyBreadth.turnover;
    return {
      upCount: eastmoneyBreadth.upCount,
      flatCount: eastmoneyBreadth.flatCount,
      downCount: eastmoneyBreadth.downCount,
      turnover: roundTo2(turnover),
      prevTurnover: Number.NaN,
      volumeChange: Number.NaN,
    };
  }

  const tencentTurnover = tencent?.turnover ?? Number.NaN;
  const tencentPrevTurnover = tencent?.prevTurnover ?? Number.NaN;

  const turnover = Number.isFinite(tencentTurnover) ? tencentTurnover
    : Number.isFinite(eastmoneyTurnover) ? eastmoneyTurnover
      : sina.turnover;
  const prevTurnover = Number.isFinite(tencentPrevTurnover) ? tencentPrevTurnover : Number.NaN;
  const volumeChange = Number.isFinite(turnover) && Number.isFinite(prevTurnover)
    ? turnover - prevTurnover
    : Number.NaN;

  return {
    upCount: sina.upCount,
    flatCount: sina.flatCount,
    downCount: sina.downCount,
    turnover: roundTo2(turnover),
    prevTurnover: roundTo2(prevTurnover),
    volumeChange: roundTo2(volumeChange),
  };
}

export async function fetchTiantianFundPosition(holding: FundHoldingConfig): Promise<FundPosition> {
  const code = normalizeFundCode(holding.code);

  if (!code) {
    return {
      code: holding.code,
      name: holding.name || holding.code,
      units: holding.units,
      cost: holding.cost,
      latestNav: Number.NaN,
      prevDayNav: Number.NaN,
      navDate: '',
      navDisclosedToday: false,
      estimatedNav: Number.NaN,
      holdingAmount: Number.NaN,
      holdingProfit: Number.NaN,
      holdingProfitRate: Number.NaN,
      changePct: Number.NaN,
      estimatedProfit: Number.NaN,
      updatedAt: '-',
    };
  }

  try {
    const [mobRes, gzRes] = await Promise.allSettled([
      fetch(
        `https://fundmobapi.eastmoney.com/FundMNewApi/FundMNFInfo?pageIndex=1&pageSize=1&plat=Android&appType=ttjj&product=EFund&Version=1&deviceid=money-helper-ext&Fcodes=${code}`
      ).then(r => r.json()) as Promise<{
        Datas?: Array<{
          FCODE?: string;
          SHORTNAME?: string;
          PDATE?: string;
          NAV?: string;
          ACCNAV?: string;
          NAVCHGRT?: string;
          GSZ?: string;
          GSZZL?: string;
          GZTIME?: string;
        }>;
      }>,
      fetch(`https://fundgz.1234567.com.cn/js/${code}.js?rt=${Date.now()}`)
        .then(r => r.text())
        .then(text => {
          const m = text.match(/jsonpgz\((.*)\);?/);
          if (!m) throw new Error('fundgz parse failed');
          return JSON.parse(m[1]) as {
            name?: string;
            jzrq?: string;
            dwjz?: string;
            gsz?: string;
            gszzl?: string;
            gztime?: string;
          };
        }),
    ]);

    const mobData = mobRes.status === 'fulfilled' ? mobRes.value.Datas?.[0] : null;
    const actualNav = mobData ? toNumber(mobData.NAV) : Number.NaN;
    const actualNavDate = mobData ? String(mobData.PDATE ?? '').trim() : '';
    const actualNavChange = mobData && mobData.NAVCHGRT ? toNumber(mobData.NAVCHGRT) : Number.NaN;
    const navDisclosedToday = actualNavDate === getLastTradingDay();

    const gzData = gzRes.status === 'fulfilled' ? gzRes.value : null;
    const estNav = toNumber(gzData?.gsz);
    const estChange = toNumber(gzData?.gszzl);

    const latestNav = Number.isFinite(actualNav) ? actualNav : Number.NaN;
    const navDate = actualNavDate || String(gzData?.jzrq ?? '').trim();

    const changePct = navDisclosedToday && Number.isFinite(actualNavChange)
      ? actualNavChange
      : (Number.isFinite(estChange) ? estChange : actualNavChange);

    const estimatedNav = navDisclosedToday && Number.isFinite(latestNav)
      ? latestNav
      : (Number.isFinite(estNav) ? estNav : latestNav);

    const units = Math.max(0, holding.units);
    const cost = Math.max(0, holding.cost);

    const holdingAmount = units > 0 && Number.isFinite(latestNav)
      ? units * latestNav
      : Number.NaN;
    const holdingProfit = units > 0 && cost > 0 && Number.isFinite(latestNav)
      ? (latestNav - cost) * units
      : Number.NaN;
    const holdingProfitRate = cost > 0 && Number.isFinite(latestNav)
      ? ((latestNav - cost) / cost) * 100
      : Number.NaN;

    // 估算收益：始终用 (今日净值 - 昨日净值) * units
    // navDisclosedToday 时：今日 = actualNav，昨日 = dwjz
    // 未公布时：今日 = estNav，昨日 = latestNav（上一个交易日净值）
    const prevNav = toNumber(gzData?.dwjz);
    let estimatedProfit: number;
    if (navDisclosedToday && Number.isFinite(latestNav)) {
      // 已公布：用 actualNav - prevNav
      if (Number.isFinite(prevNav)) {
        estimatedProfit = (latestNav - prevNav) * units;
      } else if (Number.isFinite(changePct) && changePct !== 0) {
        // dwjz 缺失时（如周末 fundgz 无数据），用 changePct 反推
        estimatedProfit = (latestNav * units * changePct) / (100 + changePct);
      } else if (Number.isFinite(changePct) && changePct === 0) {
        estimatedProfit = 0;
      } else {
        estimatedProfit = Number.NaN;
      }
    } else {
      // 未公布：今日 = estNav，昨日 = latestNav
      estimatedProfit = Number.isFinite(estNav) && Number.isFinite(latestNav)
        ? (estNav - latestNav) * units
        : Number.NaN;
    }

    return {
      code,
      name: mobData?.SHORTNAME || gzData?.name || holding.name || code,
      units,
      cost,
      latestNav,
      prevDayNav: prevNav,
      navDate,
      navDisclosedToday,
      estimatedNav,
      holdingAmount,
      holdingProfit,
      holdingProfitRate,
      changePct,
      estimatedProfit,
      updatedAt: navDisclosedToday && navDate
        ? navDate.slice(5)  // 显示实际净值日期（如 "05-22"）
        : (gzData?.gztime ? formatFundTime(gzData.gztime || '') : (navDate ? navDate.slice(5) : '-')),
    };
  } catch {
    return {
      code,
      name: holding.name || code,
      units: holding.units,
      cost: holding.cost,
      latestNav: Number.NaN,
      prevDayNav: Number.NaN,
      navDate: '',
      navDisclosedToday: false,
      estimatedNav: Number.NaN,
      holdingAmount: Number.NaN,
      holdingProfit: Number.NaN,
      holdingProfitRate: Number.NaN,
      changePct: Number.NaN,
      estimatedProfit: Number.NaN,
      updatedAt: '-',
    };
  }
}

function formatFundTime(raw: string): string {
  const parts = raw.split(' ');
  if (parts.length < 2) return '-';
  const time = parts[1];
  if (/^\d{2}:\d{2}:\d{2}$/.test(time)) return time;
  if (/^\d{2}:\d{2}$/.test(time)) return `${time}:00`;
  return '-';
}

/**
 * 并发受限的 map 函数。同时最多有 concurrency 个任务在执行。
 */
export async function pMap<T, R>(
  items: T[],
  mapper: (item: T, index: number) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = [];
  const executing = new Set<Promise<void>>();
  let idx = 0;

  for (const item of items) {
    const p = (async () => {
      const i = idx++;
      results[i] = await mapper(item, i);
    })();
    executing.add(p);
    p.finally(() => executing.delete(p));
    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }

  await Promise.allSettled(executing);
  return results;
}

/**
 * 带指数退避的重试包装。默认最多重试 2 次（共尝试 3 次），初始延迟 500ms。
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: { maxRetries?: number; baseDelay?: number } = {},
): Promise<T> {
  const { maxRetries = 2, baseDelay = 500 } = options;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, baseDelay * 2 ** attempt));
      }
    }
  }

  throw lastError;
}
