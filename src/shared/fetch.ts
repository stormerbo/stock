// -----------------------------------------------------------
// Shared fetch utilities for background + popup
// -----------------------------------------------------------

export type StockHoldingConfig = {
  code: string;
  name?: string;
  shares: number;
  cost: number;
  pinned?: boolean;
  special?: boolean;
  // hidden metadata for watchlist performance since added
  addedAt?: string;
  addedPrice?: number;
};

export type FundHoldingConfig = {
  code: string;
  units: number;
  cost: number;
  name?: string;
  pinned?: boolean;
  special?: boolean;
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
  intraday: { data: Array<{ time: string; price: number }>; prevClose: number };
  updatedAt: string;
};

export type FundPosition = {
  code: string;
  name: string;
  units: number;
  cost: number;
  latestNav: number;
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

export type MarketIndexQuote = {
  code: string;
  label: string;
  price: number;
  change: number;
  changePct: number;
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

  return totalMinutes >= MORNING_START && totalMinutes <= AFTERNOON_END;
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
  const plain = normalizeStockCode(code);
  const tencentCode = toTencentStockCode(plain);
  if (!tencentCode) return { data: [], prevClose: Number.NaN };

  // 先走腾讯分时，失败或空数据再兜底东财分时
  try {
    const response = await fetch(
      `https://web.ifzq.gtimg.cn/appstock/app/minute/query?code=${tencentCode}`
    );
    if (!response.ok) throw new Error(`Tencent minute fetch failed: ${response.status}`);
    const json = await response.json() as {
      data?: Record<string, {
        qt?: Record<string, string[]>;
        data?: { data?: string[] };
      }>;
    };

    const payload = json.data?.[tencentCode];
    const intradayRaw = payload?.data?.data ?? [];
    const quote = payload?.qt?.[tencentCode];
    const prevClose = quote ? toNumber(quote[4]) : Number.NaN;

    const data = intradayRaw
      .map((line) => {
        const parts = String(line).split(' ');
        if (parts.length < 2) return null;
        const time = parts[0];
        const price = toNumber(parts[1]);
        if (!Number.isFinite(price)) return null;
        const formattedTime = /^\d{4}$/.test(time)
          ? `${time.slice(0, 2)}:${time.slice(2, 4)}`
          : time;
        if (!/^\d{2}:\d{2}$/.test(formattedTime) || formattedTime > '15:00') return null;
        return { time: formattedTime, price };
      })
      .filter((item): item is { time: string; price: number } => item !== null);

    if (data.length > 0) {
      return { data, prevClose };
    }
  } catch {
    // ignore and fallback
  }

  try {
    const secid = toEastmoneyStockSecid(plain);
    if (!secid) return { data: [], prevClose: Number.NaN };
    const text = await fetchTextViaExtension(
      `https://push2his.eastmoney.com/api/qt/stock/trends2/get?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6,f7,f8&fields2=f51,f53,f56,f58&ut=fa5fd1943c7b386f172d6893dbfba10b&iscr=0&iscca=0&ndays=1`
    );
    const json = JSON.parse(text) as {
      data?: {
        preClose?: number | string;
        trends?: string[];
      };
    };

    const prevClose = toNumber(json.data?.preClose);
    const trends = Array.isArray(json.data?.trends) ? json.data?.trends : [];
    const data = trends
      .map((line) => {
        // format: YYYY-MM-DD HH:MM,price,volume,avg
        const parts = String(line).split(',');
        if (parts.length < 2) return null;
        const dateTime = parts[0].trim();
        const time = dateTime.slice(-5);
        const price = toNumber(parts[1]);
        if (!/^\d{2}:\d{2}$/.test(time) || !Number.isFinite(price)) return null;
        return { time, price };
      })
      .filter((item): item is { time: string; price: number } => item !== null);

    return { data, prevClose };
  } catch {
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
  f6?: number | string;   // turnover amount
  f12?: string;           // code
  f13?: number | string;  // market
  f14?: string;           // name
  f18?: number | string;  // prev close
  f124?: number | string; // timestamp
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

function toEastmoneySecidFromRow(row: EastmoneyUlistRow): string {
  const market = Number(row.f13);
  const code = String(row.f12 ?? '').trim();
  if (!Number.isFinite(market) || !code) return '';
  return `${Math.trunc(market)}.${code}`;
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
        intraday: { data: [], prevClose: Number.NaN },
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
      intraday: { data: [], prevClose: Number.NaN },
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
const MARKET_SNAPSHOT_INDEXES = ['sh000001', 'sz399001'] as const;

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
  const secids = ['1.000001', '0.399001'];
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
        `${MARKET_STATS_HOST}/api/qt/clist/get?pn=${page}&pz=${PAGE_SIZE}&np=1&fltt=2&invt=2&fid=f3&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23&fields=f3,f6`
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
    const navDisclosedToday = actualNavDate === getShanghaiToday();

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
      } else if (Number.isFinite(actualNavChange) && actualNavChange !== 0) {
        // dwjz 缺失时，用 changePct 反推：profit ≈ latestNav * units * changePct / (100 + changePct)
        estimatedProfit = (latestNav * units * actualNavChange) / (100 + actualNavChange);
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
      navDate,
      navDisclosedToday,
      estimatedNav,
      holdingAmount,
      holdingProfit,
      holdingProfitRate,
      changePct,
      estimatedProfit,
      updatedAt: gzData?.gztime
        ? formatFundTime(gzData.gztime || '')
        : (navDate || '-'),
    };
  } catch {
    return {
      code,
      name: holding.name || code,
      units: holding.units,
      cost: holding.cost,
      latestNav: Number.NaN,
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

/**
 * 带重试的并发受限分时数据拉取。
 */
export async function fetchStockIntradayWithRetry(
  code: string,
): Promise<{ data: Array<{ time: string; price: number }>; prevClose: number }> {
  return retry(() => fetchStockIntraday(code), { maxRetries: 2, baseDelay: 500 });
}
