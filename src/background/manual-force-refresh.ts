export type ManualForceRefreshDeps = {
  refreshStocks: (force?: boolean) => Promise<void>;
  refreshFunds: () => Promise<void>;
  refreshIndexes: (force?: boolean) => Promise<void>;
  refreshGolds: (force?: boolean) => Promise<void>;
  refreshMarketStats: (force?: boolean) => Promise<void>;
  clearDerivedCaches: () => Promise<void>;
  afterRefresh?: () => void;
};

export async function runManualForceRefresh(deps: ManualForceRefreshDeps): Promise<void> {
  await deps.refreshStocks(true);
  await deps.refreshFunds();
  await deps.refreshIndexes(true);
  await deps.refreshGolds(true);
  await deps.refreshMarketStats(true);
  await deps.clearDerivedCaches();
  deps.afterRefresh?.();
}
