import type { RefreshConfig } from '../shared/refresh-config.ts';

export const ALARM_STOCK = 'refresh-stocks';
export const ALARM_FUND = 'refresh-funds';
export const ALARM_INDEX = 'refresh-indexes';
export const ALARM_GOLD = 'refresh-gold';
export const ALARM_MARKET_STATS = 'refresh-market-stats';

export function buildRefreshAlarmPeriods(config: RefreshConfig): Record<string, number> {
  const minSec = 2;
  return {
    [ALARM_STOCK]: Math.max(minSec, config.stockRefreshSeconds) / 60,
    [ALARM_FUND]: Math.max(minSec, config.fundRefreshSeconds) / 60,
    [ALARM_INDEX]: Math.max(minSec, config.indexRefreshSeconds) / 60,
    [ALARM_GOLD]: Math.max(minSec, config.goldRefreshSeconds) / 60,
    [ALARM_MARKET_STATS]: 1,
  };
}
