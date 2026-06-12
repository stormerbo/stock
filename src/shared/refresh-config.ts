export type RefreshConfig = {
  stockRefreshSeconds: number;
  fundRefreshSeconds: number;
  indexRefreshSeconds: number;
  marketStatsRefreshSeconds: number;
  goldRefreshSeconds: number;
};

export const GOLD_REFRESH_OPTIONS = [30, 60, 300] as const;
export const DEFAULT_GOLD_REFRESH_SECONDS = 60;
export const MIN_NON_GOLD_REFRESH_SECONDS = 5;

export const DEFAULT_REFRESH_CONFIG: RefreshConfig = {
  stockRefreshSeconds: 15,
  fundRefreshSeconds: 60,
  indexRefreshSeconds: 30,
  marketStatsRefreshSeconds: 30,
  goldRefreshSeconds: DEFAULT_GOLD_REFRESH_SECONDS,
};

function normalizePositiveInt(value: unknown, fallback: number): number {
  const parsed = Math.round(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeNonGoldRefreshSeconds(value: unknown, fallback: number): number {
  return Math.max(MIN_NON_GOLD_REFRESH_SECONDS, normalizePositiveInt(value, fallback));
}

function normalizeGoldRefreshSeconds(value: unknown): number {
  const parsed = normalizePositiveInt(value, DEFAULT_GOLD_REFRESH_SECONDS);
  let closest: number = GOLD_REFRESH_OPTIONS[0];
  let distance = Math.abs(parsed - closest);
  for (const option of GOLD_REFRESH_OPTIONS.slice(1)) {
    const nextDistance = Math.abs(parsed - option);
    if (nextDistance < distance) {
      closest = option;
      distance = nextDistance;
    }
  }
  return closest;
}

export function normalizeRefreshConfig(value: unknown): RefreshConfig {
  const raw = (value && typeof value === 'object') ? value as Partial<RefreshConfig> : {};
  return {
    stockRefreshSeconds: normalizeNonGoldRefreshSeconds(raw.stockRefreshSeconds, DEFAULT_REFRESH_CONFIG.stockRefreshSeconds),
    fundRefreshSeconds: normalizeNonGoldRefreshSeconds(raw.fundRefreshSeconds, DEFAULT_REFRESH_CONFIG.fundRefreshSeconds),
    indexRefreshSeconds: normalizeNonGoldRefreshSeconds(raw.indexRefreshSeconds, DEFAULT_REFRESH_CONFIG.indexRefreshSeconds),
    marketStatsRefreshSeconds: normalizeNonGoldRefreshSeconds(raw.marketStatsRefreshSeconds, DEFAULT_REFRESH_CONFIG.marketStatsRefreshSeconds),
    goldRefreshSeconds: normalizeGoldRefreshSeconds(raw.goldRefreshSeconds),
  };
}
