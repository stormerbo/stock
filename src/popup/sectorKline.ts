import { toNumber } from '../shared/fetch';
import { type StockDetailData, type StockPeriod, type StockDetailKlinePoint } from './stockDetail';

// EastMoney BK sector market: secid = "90.{bkCode}"
function bkSecid(bkCode: string): string {
  const plain = bkCode.replace(/^BK/i, '').toUpperCase();
  if (!plain || !/^\d{4}$/.test(plain)) return '';
  return `90.BK${plain}`;
}

/** klt param for each StockPeriod */
function periodKlt(period: StockPeriod): number {
  switch (period) {
    case 'day': return 101;
    case 'week': return 102;
    case 'month': return 103;
    case 'year': return 104;
    default: return 101;
  }
}

/** Get sector current quote + prevClose from EastMoney ulist API */
async function fetchBkQuote(bkCode: string): Promise<{
  price: number;
  change: number;
  changePct: number;
  prevClose: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  amount: number;
  name: string;
}> {
  const secid = bkSecid(bkCode);
  if (!secid) throw new Error(`Invalid BK code: ${bkCode}`);

  const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=f43,f44,f45,f46,f47,f48,f50,f57,f58,f169,f170,f171`;
  const text = await fetch(url, { headers: { 'Referer': 'https://quote.eastmoney.com/' } }).then((r) => r.text());
  const json = JSON.parse(text) as { data?: Record<string, unknown> };
  const d = json.data ?? {};

  const price = toNumber(d.f43);
  const prevClose = toNumber(d.f44); // 昨收
  const open = toNumber(d.f46);      // 今开
  const high = toNumber(d.f45);      // 最高
  const low = toNumber(d.f47);       // 最低
  const change = toNumber(d.f169) || price - prevClose;  // 涨跌额
  const changePct = toNumber(d.f170) || ((prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0)); // 涨跌幅
  const volume = toNumber(d.f48);    // 成交量（股）
  const amount = toNumber(d.f50);    // 成交额（元）
  const name = String(d.f57 ?? '');

  return { price, change, changePct, prevClose, open, high, low, volume, amount, name };
}

/** Parse kline rows from EastMoney response */
function parseKlineRows(klines: string[] | undefined): StockDetailKlinePoint[] {
  if (!Array.isArray(klines)) return [];
  return klines
    .map((line) => {
      const parts = line.split(',');
      if (parts.length < 6) return null;
      // f51=date, f52=open, f53=close, f54=high, f55=low, f56=volume(hand)
      const [date, open, close, high, low, volume] = parts;
      return {
        date: String(date).trim(),
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
}

const SUPPORTED_PERIODS: StockPeriod[] = ['day', 'week', 'month', 'year'];

export function isSectorSupportedPeriod(period: StockPeriod): boolean {
  return SUPPORTED_PERIODS.includes(period);
}

/**
 * Fetch sector (BK) K-line data from EastMoney.
 * Only supports: day, week, month, year.
 */
export async function fetchSectorKline(
  bkCode: string,
  period: StockPeriod = 'day',
): Promise<StockDetailData> {
  if (!isSectorSupportedPeriod(period)) {
    throw new Error(`Sector K-line does not support period "${period}"`);
  }

  const secid = bkSecid(bkCode);
  if (!secid) throw new Error(`Invalid BK code: ${bkCode}`);

  // Fetch quote and kline in parallel
  const [quote, klineResult] = await Promise.all([
    fetchBkQuote(bkCode).catch(() => null),
    (async () => {
      const klt = periodKlt(period);
      const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57&klt=${klt}&fqt=0&beg=20000101&end=20500101&lmt=1000`;
      const text = await fetch(url, { headers: { 'Referer': 'https://quote.eastmoney.com/' } }).then((r) => r.text());
      const json = JSON.parse(text) as { data?: { klines?: string[] } };
      return parseKlineRows(json.data?.klines);
    })(),
  ]);

  const kline = klineResult;
  const prevClose = quote?.prevClose ?? (kline.length > 1 ? kline[kline.length - 2].close : (kline.length > 0 ? kline[kline.length - 1].close : 0));

  return {
    code: bkCode,
    name: quote?.name || bkCode,
    price: quote?.price ?? (kline.length > 0 ? kline[kline.length - 1].close : 0),
    change: quote?.change ?? 0,
    changePct: quote?.changePct ?? 0,
    open: quote?.open ?? (kline.length > 0 ? kline[kline.length - 1].open : 0),
    prevClose,
    high: quote?.high ?? (kline.length > 0 ? kline[kline.length - 1].high : 0),
    low: quote?.low ?? (kline.length > 0 ? kline[kline.length - 1].low : 0),
    volumeHands: quote?.volume ? Math.round(quote.volume / 100) : 0,
    amountWanYuan: quote?.amount ? Math.round(quote.amount / 10000) : 0,
    turnoverRate: 0,
    peTtm: Number.NaN,
    totalMarketCapYi: Number.NaN,
    updatedAt: '',
    period,
    kline,
  };
}
