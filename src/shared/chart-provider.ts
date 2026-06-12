import {
  fetchTextViaExtension,
  normalizeStockCode,
  toEastmoneySecidFromTencent,
  toNumber,
  toTencentStockCode,
} from './fetch.ts';
import {
  fetchEastmoneyIntraday,
  fetchTencentQuoteMeta,
  parseEastmoneyKlineRows,
  type StockChartIntradayPeriod,
  type StockChartKlinePeriod,
  type StockChartKlinePoint,
  type StockChartSource,
  type StockQuoteMeta,
} from './stock-chart-sources.ts';
import {
  fetchStockIntradayWithFallback,
  fetchStockKlineWithFallback,
} from './stock-chart-failover.ts';
import type { StockDetailData, StockPeriod } from '../popup/stockDetail.ts';

export type ChartInstrumentType = 'stock' | 'index';

export type ChartProviderDeps = {
  fetchStockIntraday: (tencentCode: string, period: StockChartIntradayPeriod) => Promise<{ source: StockChartSource; data: StockChartKlinePoint[] }>;
  fetchStockKline: (tencentCode: string, period: StockChartKlinePeriod, count: number) => Promise<{ source: StockChartSource; data: StockChartKlinePoint[] }>;
  fetchIndexIntraday: (tencentCode: string, period: StockChartIntradayPeriod) => Promise<{ source: StockChartSource; data: StockChartKlinePoint[] }>;
  fetchIndexKline: (tencentCode: string, period: Extract<StockChartKlinePeriod, 'day' | 'week' | 'month'>, count: number) => Promise<{ source: StockChartSource; data: StockChartKlinePoint[] }>;
  fetchQuoteMeta: (tencentCode: string, fallbackName?: string) => Promise<StockQuoteMeta>;
};

type IntradayInput = {
  instrumentType: ChartInstrumentType;
  code: string;
  period: StockChartIntradayPeriod;
};

type KlineInput = {
  instrumentType: ChartInstrumentType;
  code: string;
  period: StockChartKlinePeriod;
  count?: number;
};

type DetailInput = {
  instrumentType: ChartInstrumentType;
  code: string;
  fallbackName?: string;
  period: StockPeriod;
};

function normalizeInstrumentCode(instrumentType: ChartInstrumentType, code: string): string {
  const raw = code.trim().toLowerCase();
  if (instrumentType === 'index') return raw;
  if (/^(sh|sz)\d{6}$/.test(raw)) return raw;
  const plain = normalizeStockCode(raw);
  return toTencentStockCode(plain);
}

function buildDetail(
  code: string,
  instrumentType: ChartInstrumentType,
  fallbackName: string,
  meta: StockQuoteMeta,
  period: StockPeriod,
  kline: StockChartKlinePoint[],
): StockDetailData {
  const normalizedCode = instrumentType === 'stock' ? normalizeStockCode(code) || code : code;
  return {
    code: normalizedCode,
    name: meta.name || fallbackName || normalizedCode,
    price: meta.price,
    change: meta.change,
    changePct: meta.changePct,
    open: meta.open,
    prevClose: meta.prevClose,
    high: meta.high,
    low: meta.low,
    volumeHands: meta.volumeHands,
    amountWanYuan: meta.amountWanYuan,
    turnoverRate: meta.turnoverRate,
    peTtm: meta.peTtm,
    totalMarketCapYi: meta.totalMarketCapYi,
    updatedAt: meta.updatedAt,
    period,
    kline,
  };
}

async function fetchIndexKlineFromEastmoney(
  tencentCode: string,
  period: Extract<StockChartKlinePeriod, 'day' | 'week' | 'month'>,
  count: number,
): Promise<{ source: StockChartSource; data: StockChartKlinePoint[] }> {
  const secid = toEastmoneySecidFromTencent(tencentCode);
  if (!secid) throw new Error('invalid index code');
  const klt = period === 'day' ? 101 : period === 'week' ? 102 : 103;
  const text = await fetchTextViaExtension(
    `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${encodeURIComponent(secid)}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=${klt}&fqt=0&beg=20000101&end=20500101&lmt=${count}`,
  );
  const json = JSON.parse(text) as { data?: { klines?: string[] } };
  return {
    source: 'eastmoney',
    data: parseEastmoneyKlineRows(json.data?.klines ?? []),
  };
}

const DEFAULT_DEPS: ChartProviderDeps = {
  fetchStockIntraday: fetchStockIntradayWithFallback,
  fetchStockKline: fetchStockKlineWithFallback,
  fetchIndexIntraday: async (tencentCode, period) => ({
    source: 'eastmoney',
    data: await fetchEastmoneyIntraday(tencentCode, period),
  }),
  fetchIndexKline: fetchIndexKlineFromEastmoney,
  fetchQuoteMeta: fetchTencentQuoteMeta,
};

export function createChartProvider(deps: ChartProviderDeps = DEFAULT_DEPS) {
  return {
    async fetchInstrumentIntraday(input: IntradayInput) {
      const normalizedCode = normalizeInstrumentCode(input.instrumentType, input.code);
      if (!normalizedCode) throw new Error('invalid instrument code');
      if (input.instrumentType === 'stock') {
        return deps.fetchStockIntraday(normalizedCode, input.period);
      }
      return deps.fetchIndexIntraday(normalizedCode, input.period);
    },

    async fetchInstrumentKline(input: KlineInput) {
      const normalizedCode = normalizeInstrumentCode(input.instrumentType, input.code);
      if (!normalizedCode) throw new Error('invalid instrument code');
      const count = input.count ?? 240;
      if (input.instrumentType === 'stock') {
        return deps.fetchStockKline(normalizedCode, input.period, count);
      }
      if (input.period !== 'day' && input.period !== 'week' && input.period !== 'month') {
        throw new Error('unsupported index period');
      }
      return deps.fetchIndexKline(normalizedCode, input.period, count);
    },

    async fetchInstrumentDetail(input: DetailInput): Promise<StockDetailData> {
      const normalizedCode = normalizeInstrumentCode(input.instrumentType, input.code);
      if (!normalizedCode) throw new Error('invalid instrument code');
      const meta = await deps.fetchQuoteMeta(normalizedCode, input.fallbackName || input.code);

      const chart = (input.period === 'minute' || input.period === 'fiveDay')
        ? await this.fetchInstrumentIntraday({
          instrumentType: input.instrumentType,
          code: normalizedCode,
          period: input.period,
        })
        : await this.fetchInstrumentKline({
          instrumentType: input.instrumentType,
          code: normalizedCode,
          period: input.period,
          count: input.period === 'day' ? 800 : 240,
        });

      return buildDetail(
        normalizedCode,
        input.instrumentType,
        input.fallbackName || input.code,
        meta,
        input.period,
        chart.data,
      );
    },
  };
}

const defaultChartProvider = createChartProvider();

export const fetchInstrumentIntraday = defaultChartProvider.fetchInstrumentIntraday.bind(defaultChartProvider);
export const fetchInstrumentKline = defaultChartProvider.fetchInstrumentKline.bind(defaultChartProvider);
export const fetchInstrumentDetail = defaultChartProvider.fetchInstrumentDetail.bind(defaultChartProvider);

export function toIntradayMiniChart(input: StockChartKlinePoint[]): Array<{ time: string; price: number }> {
  return input
    .map((item) => {
      const time = String(item.date).slice(-5);
      const price = toNumber(item.close);
      if (!/^\d{2}:\d{2}$/.test(time) || !Number.isFinite(price)) return null;
      return { time, price };
    })
    .filter((item): item is { time: string; price: number } => item !== null);
}
