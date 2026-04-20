// -----------------------------------------------------------
// Shared fetch utilities for background + popup
// -----------------------------------------------------------

export type StockHoldingConfig = {
  code: string;
  shares: number;
  cost: number;
  pinned?: boolean;
  special?: boolean;
};

export type FundHoldingConfig = {
  code: string;
  units: number;
  cost: number;
  name?: string;
  pinned?: boolean;
  special?: boolean;
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
  intraday: Array<{ time: string; price: number }>;
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

// -----------------------------------------------------------
// Fetch helpers
// -----------------------------------------------------------

export async function fetchTextViaExtension(url: string): Promise<string> {
  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    const result = await chrome.runtime.sendMessage<
      { type: 'fetch-text'; url: string },
      { ok: boolean; status: number; text?: string; error?: string }
    >({
      type: 'fetch-text',
      url,
    });

    if (!result?.ok || typeof result.text !== 'string') {
      throw new Error(result?.error || `request failed: ${result?.status ?? 0}`);
    }

    return result.text;
  }

  const response = await fetch(url);
  return response.text();
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

  const tencentCodes = valid.map((h) => toTencentStockCode(h.code));
  const text = await fetchTextWithEncoding(
    `https://qt.gtimg.cn/q=${tencentCodes.join(',')}`,
    'gb18030',
  );

  return valid.map((holding) => {
    const tencentCode = toTencentStockCode(holding.code);
    const matched = text.match(new RegExp(`v_${tencentCode}="([^"]*)"`));
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
      intraday: [],
      updatedAt: formatQuoteTime(parts[30] || ''),
    };
  });
}

export async function fetchStockIntraday(code: string): Promise<Array<{ time: string; price: number }>> {
  const tencentCode = toTencentStockCode(code);
  if (!tencentCode) return [];

  const response = await fetch(`https://web.ifzq.gtimg.cn/appstock/app/minute/query?code=${tencentCode}`);
  const json = await response.json() as {
    data?: Record<string, {
      data?: { data?: string[] };
    }>;
  };

  const intradayRaw = json.data?.[tencentCode]?.data?.data ?? [];
  return intradayRaw
    .map((line) => {
      const parts = String(line).split(' ');
      if (parts.length < 2) return null;
      const time = parts[0];
      const price = toNumber(parts[1]);
      if (!Number.isFinite(price)) return null;
      const formattedTime = /^\d{4}$/.test(time)
        ? `${time.slice(0, 2)}:${time.slice(2, 4)}`
        : time;
      return { time: formattedTime, price };
    })
    .filter((item): item is { time: string; price: number } => item !== null);
}

export async function fetchTencentMarketIndexes(): Promise<MarketIndexQuote[]> {
  const query = MARKET_INDEXES.map((item) => `s_${item.code}`).join(',');
  const text = await fetchTextWithEncoding(`https://qt.gtimg.cn/q=${query}`, 'gb18030');

  return MARKET_INDEXES.map((item) => {
    const matched = text.match(new RegExp(`v_s_${item.code}="([^"]*)";?`));
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
        `https://fundmobapi.eastmoney.com/FundMNewApi/FundMNFInfo?pageIndex=1&pageSize=1&plat=Android&appType=ttjj&product=EFund&Version=1&deviceid=stock-tracker-ext&Fcodes=${code}`
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

    const yesterdayNav = Number.isFinite(actualNav) ? actualNav : toNumber(gzData?.dwjz);
    const estimatedProfit = navDisclosedToday
      ? 0
      : (units > 0 && Number.isFinite(estNav) && Number.isFinite(yesterdayNav)
        ? (estNav - yesterdayNav) * units
        : Number.NaN);

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
