import {
  fetchBatchStockQuotes,
  fetchStockIntraday,
  fetchTencentMarketIndexes,
  fetchTiantianFundPosition,
  isTradingHours,
  normalizeStockCode,
  type FundHoldingConfig,
  type FundPosition,
  type MarketIndexQuote,
  type StockHoldingConfig,
  type StockPosition,
} from '../shared/fetch';
import {
  loadAlertConfig,
  saveAlertConfig,
  checkAlerts,
  pruneFiredHistory,
  type StockSnapshot,
} from '../shared/alerts';

export type BadgeMode =
  | 'off'
  | 'stockCount'
  | 'fundCount'
  | 'stockMarket'
  | 'stockFloatingPnl'
  | 'stockDailyPnl'
  | 'fundAmount'
  | 'fundHoldingProfit'
  | 'fundEstimatedProfit';

export type BadgeConfig = {
  enabled: boolean;
  mode: BadgeMode;
};

type RefreshConfig = {
  stockRefreshSeconds: number;
  fundRefreshSeconds: number;
  indexRefreshSeconds: number;
};

const BADGE_STORAGE_KEY = 'badgeConfig';
const REFRESH_STORAGE_KEY = 'refreshConfig';

const ALARM_STOCK = 'refresh-stocks';
const ALARM_FUND = 'refresh-funds';
const ALARM_INDEX = 'refresh-indexes';

const DEFAULT_BADGE_CONFIG: BadgeConfig = {
  enabled: true,
  mode: 'stockCount',
};

const DEFAULT_REFRESH: RefreshConfig = {
  stockRefreshSeconds: 15,
  fundRefreshSeconds: 60,
  indexRefreshSeconds: 30,
};

// -----------------------------------------------------------
// 角标更新
// -----------------------------------------------------------

let badgeUpdateTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleBadgeUpdate() {
  if (badgeUpdateTimer) return;
  badgeUpdateTimer = setTimeout(() => {
    badgeUpdateTimer = null;
    void updateBadgeFromCache();
  }, 300);
}

async function updateBadgeFromCache() {
  const config = await loadBadgeConfig();

  // Always update hover title regardless of badge config
  void updateHoverTitleFromStorage();

  if (!config.enabled || config.mode === 'off') {
    void chrome.action.setBadgeText({ text: '' });
    return;
  }

  const [stockResult, fundResult, indexResult] = await Promise.all([
    chrome.storage.local.get(['stockPositions']),
    chrome.storage.local.get(['fundPositions']),
    chrome.storage.local.get(['indexPositions']),
  ]);

  const stockPositions = (Array.isArray(stockResult.stockPositions) ? stockResult.stockPositions : []) as StockPosition[];
  const fundPositions = (Array.isArray(fundResult.fundPositions) ? fundResult.fundPositions : []) as FundPosition[];
  const indexPositions = (Array.isArray(indexResult.indexPositions) ? indexResult.indexPositions : []) as MarketIndexQuote[];
  const holdingsResult = await chrome.storage.sync.get(['stockHoldings', 'fundHoldings']);
  const stockHoldings = (Array.isArray(holdingsResult.stockHoldings) ? holdingsResult.stockHoldings : []) as StockHoldingConfig[];
  const fundHoldings = (Array.isArray(holdingsResult.fundHoldings) ? holdingsResult.fundHoldings : []) as FundHoldingConfig[];

  const metrics = computeMetrics(stockPositions, fundPositions, stockHoldings, fundHoldings);
  applyBadgeText(config, metrics);
}

async function updateHoverTitleFromStorage() {
  const [stockResult, fundResult, indexResult] = await Promise.all([
    chrome.storage.local.get(['stockPositions']),
    chrome.storage.local.get(['fundPositions']),
    chrome.storage.local.get(['indexPositions']),
  ]);

  const stockPositions = (Array.isArray(stockResult.stockPositions) ? stockResult.stockPositions : []) as StockPosition[];
  const fundPositions = (Array.isArray(fundResult.fundPositions) ? fundResult.fundPositions : []) as FundPosition[];
  const indexPositions = (Array.isArray(indexResult.indexPositions) ? indexResult.indexPositions : []) as MarketIndexQuote[];
  const holdingsResult = await chrome.storage.sync.get(['stockHoldings', 'fundHoldings']);
  const stockHoldings = (Array.isArray(holdingsResult.stockHoldings) ? holdingsResult.stockHoldings : []) as StockHoldingConfig[];
  const fundHoldings = (Array.isArray(holdingsResult.fundHoldings) ? holdingsResult.fundHoldings : []) as FundHoldingConfig[];

  const metrics = computeMetrics(stockPositions, fundPositions, stockHoldings, fundHoldings);
  updateHoverTitle(indexPositions, metrics);
}

// -----------------------------------------------------------
// 配置读取
// -----------------------------------------------------------

async function loadRefreshConfig(): Promise<RefreshConfig> {
  try {
    const result = await chrome.storage.sync.get(REFRESH_STORAGE_KEY);
    const config = result[REFRESH_STORAGE_KEY] as RefreshConfig | undefined;
    return config || DEFAULT_REFRESH;
  } catch {
    return DEFAULT_REFRESH;
  }
}

async function loadBadgeConfig(): Promise<BadgeConfig> {
  try {
    const result = await chrome.storage.sync.get(BADGE_STORAGE_KEY);
    const config = result[BADGE_STORAGE_KEY] as BadgeConfig | undefined;
    return config || DEFAULT_BADGE_CONFIG;
  } catch {
    return DEFAULT_BADGE_CONFIG;
  }
}

// -----------------------------------------------------------
// Alarm 调度器（替代 setInterval，能在 service worker 重启后存活）
// -----------------------------------------------------------

function setupAlarms(config: RefreshConfig) {
  chrome.alarms.create(ALARM_STOCK, { periodInMinutes: config.stockRefreshSeconds / 60 });
  chrome.alarms.create(ALARM_FUND, { periodInMinutes: config.fundRefreshSeconds / 60 });
  chrome.alarms.create(ALARM_INDEX, { periodInMinutes: config.indexRefreshSeconds / 60 });
}

function clearAlarms() {
  chrome.alarms.clear(ALARM_STOCK);
  chrome.alarms.clear(ALARM_FUND);
  chrome.alarms.clear(ALARM_INDEX);
}

async function handleAlarm(name: string) {
  if (name === ALARM_STOCK) await refreshStocks();
  else if (name === ALARM_FUND) await refreshFunds();
  else if (name === ALARM_INDEX) await refreshIndexes();
}

chrome.alarms.onAlarm.addListener((alarm) => {
  void handleAlarm(alarm.name);
});

function startRefreshLoop() {
  clearAlarms();
  void loadRefreshConfig().then((config) => {
    setupAlarms(config);
    // 立即刷新一次
    void refreshStocks();
    void refreshFunds();
    void refreshIndexes();
  });
}

// -----------------------------------------------------------
// 数据刷新
// -----------------------------------------------------------

async function refreshStocks() {
  if (!isTradingHours()) return;
  try {
    const result = await chrome.storage.sync.get('stockHoldings');
    const stocks = (Array.isArray(result.stockHoldings) ? result.stockHoldings : []) as StockHoldingConfig[];
    if (stocks.length === 0) return;

    const positions = await fetchBatchStockQuotes(stocks);
    const existing = await chrome.storage.local.get('stockPositions');
    const existingPositions = (Array.isArray(existing.stockPositions) ? existing.stockPositions : []) as StockPosition[];
    const existingMap = new Map(existingPositions.map((p) => [p.code, p]));

    const merged = positions.map((p) => ({
      ...p,
      intraday: existingMap.get(p.code)?.intraday ?? [],
    }));

    // 对没有 intraday 的股票，并行拉取
    const missingCodes = stocks.map((h) => normalizeStockCode(h.code)).filter(Boolean)
      .filter((code) => {
        const pos = merged.find((p) => p.code === code);
        return pos && pos.intraday.length === 0;
      });

    if (missingCodes.length > 0) {
      const intradayResults = await Promise.all(
        missingCodes.map(async (code) => {
          try {
            return { code, data: await fetchStockIntraday(code) };
          } catch {
            return { code, data: [] };
          }
        })
      );
      const intradayMap = new Map(intradayResults.map((r) => [r.code, r.data]));
      const final = merged.map((p) =>
        intradayMap.has(p.code) ? { ...p, intraday: intradayMap.get(p.code)! } : p
      );
      await chrome.storage.local.set({ stockPositions: final, stockUpdatedAt: new Date().toISOString() });
      // 检查告警
      void checkAndNotifyAlerts(final);
      // 更新悬浮提示
      void updateHoverTitleFromStorage();
    } else {
      await chrome.storage.local.set({ stockPositions: merged, stockUpdatedAt: new Date().toISOString() });
      // 检查告警
      void checkAndNotifyAlerts(merged);
      // 更新悬浮提示
      void updateHoverTitleFromStorage();
    }
  } catch (e) {
    console.warn('[Portfolio Pulse] stock refresh failed:', e);
  }
}

// -----------------------------------------------------------
// 告警检查与通知
// -----------------------------------------------------------

async function checkAndNotifyAlerts(positions: StockPosition[]) {
  const config = await loadAlertConfig();
  if (!config.globalEnabled || config.stocks.length === 0) return;

  const snapshots: StockSnapshot[] = positions
    .filter((p) => Number.isFinite(p.price) && Number.isFinite(p.dailyChangePct))
    .map((p) => ({
      code: p.code,
      name: p.name,
      price: p.price,
      prevClose: p.prevClose,
      changePct: p.dailyChangePct,
    }));

  if (snapshots.length === 0) return;

  const firedHistory = pruneFiredHistory(config.firedHistory);
  const triggered = checkAlerts(config, snapshots, firedHistory);

  if (triggered.length === 0) return;

  // 发送通知
  for (const alert of triggered) {
    chrome.notifications.create(`alert_${alert.code}_${Date.now()}`, {
      type: 'basic',
      iconUrl: 'public/icon48.png',
      title: `股价告警 — ${alert.name}`,
      message: alert.message,
      priority: 2,
    });
  }

  // 更新 fired history
  const newFired = triggered.map((a) => ({
    code: a.code,
    ruleId: config.stocks.find((s) => s.code === a.code)?.rules.find(
      (r) => {
        if (r.type === 'price_up') return a.message.includes('上涨至');
        if (r.type === 'price_down') return a.message.includes('下跌至');
        if (r.type === 'change_pct') return a.message.includes('波动超过');
        return false;
      }
    )?.id ?? '',
    firedAt: Date.now(),
  })).filter((f) => f.ruleId);

  config.firedHistory = [...firedHistory, ...newFired];
  await saveAlertConfig(config);
}

async function refreshFunds() {
  if (!isTradingHours()) return;
  try {
    const result = await chrome.storage.sync.get('fundHoldings');
    const funds = (Array.isArray(result.fundHoldings) ? result.fundHoldings : []) as FundHoldingConfig[];
    if (funds.length === 0) return;

    const positions = await Promise.all(
      funds.map((h) => fetchTiantianFundPosition(h))
    );
    await chrome.storage.local.set({ fundPositions: positions, fundUpdatedAt: new Date().toISOString() });
    void updateHoverTitleFromStorage();
  } catch (e) {
    console.warn('[Portfolio Pulse] fund refresh failed:', e);
  }
}

async function refreshIndexes() {
  if (!isTradingHours()) return;
  try {
    const indexes = await fetchTencentMarketIndexes();
    await chrome.storage.local.set({ indexPositions: indexes, indexUpdatedAt: new Date().toISOString() });
    void updateHoverTitleFromStorage();
  } catch (e) {
    console.warn('[Portfolio Pulse] index refresh failed:', e);
  }
}

// -----------------------------------------------------------
// 角标渲染
// -----------------------------------------------------------

function computeMetrics(
  stockPositions: StockPosition[],
  fundPositions: FundPosition[],
  stockHoldings: StockHoldingConfig[],
  fundHoldings: FundHoldingConfig[],
): Record<string, number> {
  const stockMarketValue = stockPositions.reduce((sum, item) => {
    if (!Number.isFinite(item.price) || item.shares <= 0) return sum;
    return sum + item.price * item.shares;
  }, 0);

  const floating = stockPositions.reduce((sum, item) => {
    if (!Number.isFinite(item.floatingPnl)) return sum;
    return sum + item.floatingPnl;
  }, 0);

  const daily = stockPositions.reduce((sum, item) => {
    if (!Number.isFinite(item.dailyPnl)) return sum;
    return sum + item.dailyPnl;
  }, 0);

  const fundHoldingAmount = fundPositions.reduce((sum, item) => {
    if (!Number.isFinite(item.holdingAmount)) return sum;
    return sum + item.holdingAmount;
  }, 0);

  const fundHoldingProfit = fundPositions.reduce((sum, item) => {
    if (!Number.isFinite(item.holdingProfit)) return sum;
    return sum + item.holdingProfit;
  }, 0);

  const fundEstimatedProfit = fundPositions.reduce((sum, item) => {
    if (!Number.isFinite(item.estimatedProfit)) return sum;
    return sum + item.estimatedProfit;
  }, 0);

  return {
    stockCount: stockHoldings.length,
    fundCount: fundHoldings.length,
    stockMarket: stockMarketValue,
    stockFloatingPnl: floating,
    stockDailyPnl: daily,
    fundAmount: fundHoldingAmount,
    fundHoldingProfit,
    fundEstimatedProfit,
  };
}

function applyBadgeText(config: BadgeConfig, metrics: Record<string, number>) {
  if (!config.enabled || config.mode === 'off') {
    void chrome.action.setBadgeText({ text: '' });
    return;
  }

  let text = '';
  let color: [number, number, number, number] = [99, 102, 241, 255];

  switch (config.mode) {
    case 'stockCount':
      text = `股${metrics.stockCount || 0}`;
      color = [59, 130, 246, 255];
      break;
    case 'stockMarket': {
      const v = metrics.stockMarket || 0;
      text = formatBadgeNumber(v);
      color = [99, 102, 241, 255];
      break;
    }
    case 'stockFloatingPnl': {
      const v = metrics.stockFloatingPnl || 0;
      text = formatBadgeNumber(v);
      color = v >= 0 ? [255, 0, 0, 255] : [0, 255, 0, 255];
      break;
    }
    case 'stockDailyPnl': {
      const v = metrics.stockDailyPnl || 0;
      text = formatBadgeNumber(v);
      color = v >= 0 ? [255, 0, 0, 255] : [0, 255, 0, 255];
      break;
    }
    case 'fundCount':
      text = `基${metrics.fundCount || 0}`;
      color = [245, 158, 11, 255];
      break;
    case 'fundAmount': {
      const v = metrics.fundAmount || 0;
      text = formatBadgeNumber(v);
      color = [245, 158, 11, 255];
      break;
    }
    case 'fundHoldingProfit': {
      const v = metrics.fundHoldingProfit || 0;
      text = formatBadgeNumber(v);
      color = v >= 0 ? [255, 0, 0, 255] : [0, 255, 0, 255];
      break;
    }
    case 'fundEstimatedProfit': {
      const v = metrics.fundEstimatedProfit || 0;
      text = formatBadgeNumber(v);
      color = v >= 0 ? [255, 0, 0, 255] : [0, 255, 0, 255];
      break;
    }
  }

  if (text.length > 4) text = text.slice(0, 4);

  void chrome.action.setBadgeText({ text });
  void chrome.action.setBadgeBackgroundColor({ color });
}

// -----------------------------------------------------------
// 悬浮提示（替代扩展名称）
// -----------------------------------------------------------

function updateHoverTitle(indexPositions: MarketIndexQuote[], metrics: Record<string, number>) {
  const lines: string[] = [];

  // 指数行情
  for (const idx of indexPositions) {
    if (Number.isFinite(idx.price)) {
      const sign = idx.changePct >= 0 ? '+' : '';
      lines.push(`${idx.label} ${idx.price.toFixed(2)} ${sign}${idx.changePct.toFixed(2)}%`);
    }
  }

  // 持仓当日盈亏
  const dailyPnl = metrics.stockDailyPnl;
  if (Number.isFinite(dailyPnl) && dailyPnl !== 0) {
    lines.push(`股票当日盈亏 ${dailyPnl >= 0 ? '+' : ''}${formatPnlNumber(dailyPnl)}`);
  }

  // 基金预估收益
  const fundEst = metrics.fundEstimatedProfit;
  if (Number.isFinite(fundEst) && fundEst !== 0) {
    lines.push(`基金预估 ${fundEst >= 0 ? '+' : ''}${formatPnlNumber(fundEst)}`);
  }

  void chrome.action.setTitle({ title: lines.join('\n') || 'Stock Tracker' });
}

function formatPnlNumber(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_0000) return `${(value / 1_0000).toFixed(2)}万`;
  if (abs >= 1000) return `${(value / 1000).toFixed(2)}k`;
  return value.toFixed(2);
}

function formatBadgeNumber(value: number): string {
  if (value >= 1_0000) {
    return `${(value / 1_0000).toFixed(1)}w`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}k`;
  }
  return String(Math.round(Math.abs(value)));
}

// -----------------------------------------------------------
// Event listeners
// -----------------------------------------------------------

chrome.runtime.onInstalled.addListener(async () => {
  console.log('[Portfolio Pulse] extension initialized');
  const existing = await chrome.storage.sync.get(BADGE_STORAGE_KEY);
  if (!existing[BADGE_STORAGE_KEY]) {
    await chrome.storage.sync.set({ [BADGE_STORAGE_KEY]: DEFAULT_BADGE_CONFIG });
  }
  startRefreshLoop();
  // 等数据刷新后更新悬浮标题
  setTimeout(() => void updateHoverTitleFromStorage(), 3000);
});

// Service worker 重启后重新注册 alarms
startRefreshLoop();
// Service worker 重启后也更新标题
setTimeout(() => void updateHoverTitleFromStorage(), 2000);

// 监听配置变化
chrome.storage.onChanged.addListener((changes, area) => {
  // 刷新策略变化 → 重新注册 alarms
  if (area === 'sync' && changes[REFRESH_STORAGE_KEY]) {
    startRefreshLoop();
  }
  // holdings 变化 → 立即刷新
  if (area === 'sync' && (changes.stockHoldings || changes.fundHoldings)) {
    void refreshStocks();
    void refreshFunds();
  }
  // 角标配置变化 → 更新角标
  if (area === 'sync' && changes[BADGE_STORAGE_KEY]) {
    scheduleBadgeUpdate();
  }
});

// 数据刷新后更新角标
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.stockPositions || changes.fundPositions)) {
    scheduleBadgeUpdate();
  }
});

// 消息监听
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const request = message as { type?: string; url?: string; badge?: BadgeConfig; metrics?: Record<string, number> };

  if (request.type === 'fetch-text' && typeof request.url === 'string') {
    const url = request.url;
    void (async () => {
      try {
        const response = await fetch(url);
        const text = await response.text();
        sendResponse({ ok: response.ok, status: response.status, text });
      } catch (error) {
        sendResponse({ ok: false, status: 0, error: error instanceof Error ? error.message : 'unknown error' });
      }
    })();
    return true;
  }

  if (request.type === 'update-badge' && request.badge && request.metrics) {
    applyBadgeText(request.badge, request.metrics);
    return;
  }

  return undefined;
});
