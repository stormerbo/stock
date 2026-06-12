export const STOCK_INTRADAY_CACHE_VERSION = 3;
export const STOCK_INTRADAY_VERSION_KEY = 'stockIntradayVersion';

type IntradayPoint = {
  time?: unknown;
  price?: unknown;
};

type IntradayPayload = {
  data?: unknown;
  prevClose?: unknown;
};

export function hasUsableStockIntradayData(intraday: unknown): boolean {
  if (!intraday || typeof intraday !== 'object') return false;
  const payload = intraday as IntradayPayload;
  if (!Array.isArray(payload.data) || payload.data.length === 0) return false;

  return payload.data.some((item) => {
    if (!item || typeof item !== 'object') return false;
    const point = item as IntradayPoint;
    return /^\d{2}:\d{2}$/.test(String(point.time ?? ''))
      && Number.isFinite(Number(point.price));
  });
}

export function shouldRefreshStockIntraday(input: {
  today: string;
  intradayDate: string | null | undefined;
  intradayVersion: unknown;
  isTradingHours: boolean;
  intraday: unknown;
}): boolean {
  const {
    today,
    intradayDate,
    intradayVersion,
    isTradingHours,
    intraday,
  } = input;

  if (isTradingHours) return true;
  if (intradayDate !== today) return true;
  if (Number(intradayVersion) !== STOCK_INTRADAY_CACHE_VERSION) return true;
  return !hasUsableStockIntradayData(intraday);
}
