import {
  fetchEastmoneyIntraday,
  fetchEastmoneyKline,
  fetchTencentIntraday,
  fetchTencentKline,
  type StockChartIntradayPeriod,
  type StockChartKlinePeriod,
  type StockChartKlinePoint,
  type StockChartSource,
} from './stock-chart-sources.ts';

export type StockChartFetcherSet = Record<StockChartSource, {
  fetchIntraday: (tencentCode: string, period: StockChartIntradayPeriod) => Promise<StockChartKlinePoint[]>;
  fetchKline: (tencentCode: string, period: StockChartKlinePeriod, count: number) => Promise<StockChartKlinePoint[]>;
}>;

type SourceHealth = {
  failures: number;
  openUntil: number;
};

type FailoverOptions = {
  circuitOpenMs?: number;
  failureThreshold?: number;
  enableTencentFallback?: boolean;
  now?: () => number;
};

const DEFAULT_FETCHERS: StockChartFetcherSet = {
  eastmoney: {
    fetchIntraday: fetchEastmoneyIntraday,
    fetchKline: fetchEastmoneyKline,
  },
  tencent: {
    fetchIntraday: fetchTencentIntraday,
    fetchKline: fetchTencentKline,
  },
};

function hasUsableData(data: StockChartKlinePoint[]): boolean {
  return Array.isArray(data) && data.length > 0;
}

function isHardTencentFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return message.includes('HTTP 501') || message.includes('waf.tencent.com/501page.html');
}

export function createStockChartFailover(
  fetchers: StockChartFetcherSet = DEFAULT_FETCHERS,
  options: FailoverOptions = {},
) {
  const now = options.now ?? (() => Date.now());
  const circuitOpenMs = options.circuitOpenMs ?? 5 * 60 * 1000;
  const failureThreshold = options.failureThreshold ?? 3;
  const enableTencentFallback = options.enableTencentFallback ?? false;
  const health: Record<StockChartSource, SourceHealth> = {
    eastmoney: { failures: 0, openUntil: 0 },
    tencent: { failures: 0, openUntil: 0 },
  };

  async function runWithFallback(
    primary: StockChartSource,
    secondary: StockChartSource,
    runner: (source: StockChartSource) => Promise<StockChartKlinePoint[]>,
  ): Promise<{ source: StockChartSource; data: StockChartKlinePoint[] }> {
    const attemptOrder: StockChartSource[] = [];
    const sourceAvailable = (source: StockChartSource) => health[source].openUntil <= now();
    if (health[primary].openUntil > now()) {
      if ((secondary !== 'tencent' || enableTencentFallback) && sourceAvailable(secondary)) {
        attemptOrder.push(secondary);
      }
    } else {
      if (sourceAvailable(primary)) attemptOrder.push(primary);
      if ((secondary !== 'tencent' || enableTencentFallback) && sourceAvailable(secondary)) {
        attemptOrder.push(secondary);
      }
    }

    let lastError: unknown = null;
    for (const source of attemptOrder) {
      try {
        const data = await runner(source);
        if (!hasUsableData(data)) {
          throw new Error(`${source} returned empty chart data`);
        }
        health[source].failures = 0;
        health[source].openUntil = 0;
        return { source, data };
      } catch (error) {
        lastError = error;
        const hardTencentFailure = source === 'tencent' && isHardTencentFailure(error);
        health[source].failures += 1;
        if (hardTencentFailure || health[source].failures >= failureThreshold) {
          health[source].openUntil = now() + circuitOpenMs;
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error('all stock chart sources failed');
  }

  return {
    fetchIntraday(tencentCode: string, period: StockChartIntradayPeriod) {
      return runWithFallback('eastmoney', 'tencent', (source) => fetchers[source].fetchIntraday(tencentCode, period));
    },
    fetchKline(tencentCode: string, period: StockChartKlinePeriod, count = 240) {
      return runWithFallback('eastmoney', 'tencent', (source) => fetchers[source].fetchKline(tencentCode, period, count));
    },
  };
}

 const defaultFailover = createStockChartFailover(undefined, { enableTencentFallback: true });

export function fetchStockIntradayWithFallback(tencentCode: string, period: StockChartIntradayPeriod) {
  return defaultFailover.fetchIntraday(tencentCode, period);
}

export function fetchStockKlineWithFallback(tencentCode: string, period: StockChartKlinePeriod, count = 240) {
  return defaultFailover.fetchKline(tencentCode, period, count);
}
