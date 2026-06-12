type RunManualRefreshInput = {
  clearStockIntraday: () => Promise<void>;
  forceRefresh: () => Promise<void>;
  refreshFundsDirect: () => Promise<void>;
  afterRefresh: () => void;
};

export async function runManualRefresh(input: RunManualRefreshInput): Promise<void> {
  await input.clearStockIntraday();
  await input.forceRefresh();
  await input.refreshFundsDirect();
  input.afterRefresh();
}
