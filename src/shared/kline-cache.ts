// -----------------------------------------------------------
// K-line data cache — avoids re-fetching historical prices
// every time snapshots are recalculated.
// -----------------------------------------------------------

import { fetchDayFqKline } from './technical-analysis';
import type { KlinePoint } from './technical-analysis';

export type KlineCacheEntry = {
  data: Array<{ date: string; close: number }>;
  fetchedAt: number; // epoch ms
};

const KLINE_CACHE_KEY = 'stockKlineCache';
const KLINE_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function klineToCacheData(
  kline: KlinePoint[],
): Array<{ date: string; close: number }> {
  return kline.map((k) => ({ date: k.date, close: k.close }));
}

/** Read from cache if fresh, otherwise null */
export async function getCachedKlineMap(
  code: string,
): Promise<Map<string, number> | null> {
  try {
    const result = await chrome.storage.local.get(KLINE_CACHE_KEY);
    const cache = (result[KLINE_CACHE_KEY] ??
      {}) as Record<string, KlineCacheEntry>;
    const entry = cache[code];
    if (!entry) return null;
    if (Date.now() - entry.fetchedAt > KLINE_CACHE_TTL_MS) return null;
    const map = new Map<string, number>();
    for (const d of entry.data) {
      map.set(d.date, d.close);
    }
    return map;
  } catch {
    return null;
  }
}

/** Fetch K-line data from API and store in cache */
export async function fetchAndCacheKlineMap(
  code: string,
  count = 240,
): Promise<Map<string, number>> {
  const kline = await fetchDayFqKline(code, count);
  const data = klineToCacheData(kline);

  try {
    const result = await chrome.storage.local.get(KLINE_CACHE_KEY);
    const cache = (result[KLINE_CACHE_KEY] ??
      {}) as Record<string, KlineCacheEntry>;
    cache[code] = { data, fetchedAt: Date.now() };
    await chrome.storage.local.set({ [KLINE_CACHE_KEY]: cache });
  } catch {
    // best effort
  }

  const map = new Map<string, number>();
  for (const d of data) {
    map.set(d.date, d.close);
  }
  return map;
}

/** Get K-line close price map (cache-first) */
export async function getKlineMap(
  code: string,
  count = 240,
): Promise<Map<string, number>> {
  const cached = await getCachedKlineMap(code);
  if (cached) return cached;
  return fetchAndCacheKlineMap(code, count);
}
