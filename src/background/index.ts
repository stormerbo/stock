import {
  fetchBatchStockQuotes,
  fetchStockIntraday,
  fetchTencentMarketIndexes,
  fetchTiantianFundPosition,
  getShanghaiToday,
  isTradingHours,
  normalizeStockCode,
  type FundHoldingConfig,
  type FundPosition,
  type MarketIndexQuote,
  type StockHoldingConfig,
  type StockPosition,
} from '../shared/fetch';
import {
  DAILY_PROFIT_DETAILS_KEY,
  buildDailyProfitDetailRecord,
  normalizeDailyProfitDetailHistory,
  upsertDailyProfitDetailHistory,
} from '../shared/profit-details';
import {
  loadAlertConfig,
  saveAlertConfig,
  checkAlerts,
  pruneFiredHistory,
  evaluateSpikeRule,
  pruneNotificationHistory,
  NOTIFICATION_HISTORY_KEY,
  type NotificationRecord,
  type StockAlertConfig,
  type StockSnapshot,
  type SpikePriceEntry,
  type SpikePriceHistory,
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
const SPIKE_HISTORY_KEY = 'spikeHistory';
const WORK_MODE_KEY = 'workModeConfig';
const NOTIFICATION_KEEP_HOURS = 24;

const ALARM_STOCK = 'refresh-stocks';
const ALARM_FUND = 'refresh-funds';
const ALARM_INDEX = 'refresh-indexes';
const STOCK_INTRADAY_DATE_KEY = 'stockIntradayDate';

const DEFAULT_BADGE_CONFIG: BadgeConfig = {
  enabled: true,
  mode: 'stockCount',
};

export type WorkModeConfig = {
  enabled: boolean;
  startTime: string;   // "09:00"
  endTime: string;     // "18:00"
  panelOpacity: number; // 0.5-1.0
};

const DEFAULT_WORK_MODE: WorkModeConfig = {
  enabled: false,
  startTime: '09:00',
  endTime: '18:00',
  panelOpacity: 1.0,
};

const BADGE_UP_COLOR: [number, number, number, number] = [255, 0, 0, 255];
const BADGE_DOWN_COLOR: [number, number, number, number] = [18, 128, 72, 255];
const BADGE_CLOSED_COLOR: [number, number, number, number] = [94, 106, 128, 255];

// -----------------------------------------------------------
// 工作模式
// -----------------------------------------------------------

function isWorkModeHours(config: WorkModeConfig): boolean {
  if (!config.enabled) return false;
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const [startH, startM] = config.startTime.split(':').map(Number);
  const [endH, endM] = config.endTime.split(':').map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  if (startMinutes <= endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  } else {
    // 跨午夜，如 22:00-06:00
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }
}

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
  const [stockResult, fundResult, indexResult, notifResult, displayResult] = await Promise.all([
    chrome.storage.local.get(['stockPositions']),
    chrome.storage.local.get(['fundPositions']),
    chrome.storage.local.get(['indexPositions']),
    chrome.storage.local.get([NOTIFICATION_HISTORY_KEY]),
    chrome.storage.sync.get(['displayConfig']),
  ]);

  const stockPositions = (Array.isArray(stockResult.stockPositions) ? stockResult.stockPositions : []) as StockPosition[];
  const fundPositions = (Array.isArray(fundResult.fundPositions) ? fundResult.fundPositions : []) as FundPosition[];
  const indexPositions = (Array.isArray(indexResult.indexPositions) ? indexResult.indexPositions : []) as MarketIndexQuote[];
  const holdingsResult = await chrome.storage.sync.get(['stockHoldings', 'fundHoldings']);
  const stockHoldings = (Array.isArray(holdingsResult.stockHoldings) ? holdingsResult.stockHoldings : []) as StockHoldingConfig[];
  const fundHoldings = (Array.isArray(holdingsResult.fundHoldings) ? holdingsResult.fundHoldings : []) as FundHoldingConfig[];

  const metrics = computeMetrics(stockPositions, fundPositions, stockHoldings, fundHoldings);

  // Count unread notifications
  const notifHistory = (notifResult[NOTIFICATION_HISTORY_KEY] as NotificationRecord[]) || [];
  const unreadCount = notifHistory.filter((n) => !n.read).length;

  const colorScheme = ((displayResult.displayConfig as { colorScheme?: string } | undefined)?.colorScheme ?? 'cn') as 'cn' | 'us';

  updateHoverTitle(indexPositions, metrics, unreadCount, colorScheme);
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
    const existing = await chrome.storage.local.get(['stockPositions', STOCK_INTRADAY_DATE_KEY]);
    const existingPositions = (Array.isArray(existing.stockPositions) ? existing.stockPositions : []) as StockPosition[];
    const existingMap = new Map(existingPositions.map((p) => [p.code, p]));
    const intradayDate = typeof existing[STOCK_INTRADAY_DATE_KEY] === 'string'
      ? (existing[STOCK_INTRADAY_DATE_KEY] as string)
      : '';
    const today = getShanghaiToday();
    const shouldRefreshAllIntraday = intradayDate !== today;

    const merged = positions.map((p) => ({
      ...p,
      intraday: existingMap.get(p.code)?.intraday ?? { data: [], prevClose: Number.NaN },
    }));

    const codesToRefresh = shouldRefreshAllIntraday
      ? stocks.map((h) => normalizeStockCode(h.code)).filter(Boolean)
      : stocks.map((h) => normalizeStockCode(h.code)).filter(Boolean)
        .filter((code) => {
          const pos = merged.find((p) => p.code === code);
          return pos && pos.intraday.data.length === 0;
        });

    if (codesToRefresh.length > 0) {
      const intradayResults = await Promise.all(
        codesToRefresh.map(async (code) => {
          try {
            return { code, data: await fetchStockIntraday(code) };
          } catch {
            return { code, data: { data: [], prevClose: Number.NaN } };
          }
        })
      );
      const intradayMap = new Map(intradayResults.map((r) => [r.code, r.data]));
      const final = merged.map((p) =>
        intradayMap.has(p.code) ? { ...p, intraday: intradayMap.get(p.code)! } : p
      );
      await chrome.storage.local.set({
        stockPositions: final,
        stockUpdatedAt: new Date().toISOString(),
        [STOCK_INTRADAY_DATE_KEY]: today,
      });
      void recordDailyProfitDetail();
      // 检查告警
      void checkAndNotifyAlerts(final);
      // 更新悬浮提示
      void updateHoverTitleFromStorage();
    } else {
      await chrome.storage.local.set({
        stockPositions: merged,
        stockUpdatedAt: new Date().toISOString(),
        [STOCK_INTRADAY_DATE_KEY]: intradayDate || today,
      });
      void recordDailyProfitDetail();
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
  const [config, spikeResult, notifResult, workModeResult] = await Promise.all([
    loadAlertConfig(),
    chrome.storage.local.get([SPIKE_HISTORY_KEY]),
    chrome.storage.local.get([NOTIFICATION_HISTORY_KEY]),
    chrome.storage.sync.get([WORK_MODE_KEY]),
  ]);
  if (!config.globalEnabled || config.stocks.length === 0) return;

  const workModeConfig = (workModeResult[WORK_MODE_KEY] as WorkModeConfig | undefined) || DEFAULT_WORK_MODE;
  const inWorkMode = isWorkModeHours(workModeConfig);

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
  const spikeHistory = (spikeResult[SPIKE_HISTORY_KEY] as SpikePriceHistory) || {};
  const existingNotifHistory = (notifResult[NOTIFICATION_HISTORY_KEY] as NotificationRecord[]) || [];

  // Build ruleId → ruleType map for notification records
  const ruleTypeMap = new Map<string, { type: string; config: StockAlertConfig }>();
  for (const sc of config.stocks) {
    for (const rule of sc.rules) {
      ruleTypeMap.set(rule.id, { type: rule.type, config: sc });
    }
  }

  // Evaluate regular rules
  const { triggered, spikeHistory: updatedSpikeHistory } = checkAlerts(
    config, snapshots, firedHistory, spikeHistory
  );

  // Evaluate spike rules
  const spikeTriggered: Array<{ code: string; name: string; message: string; ruleId: string }> = [];
  const finalSpikeHistory: SpikePriceHistory = { ...updatedSpikeHistory };

  for (const stockConfig of config.stocks) {
    const snapshot = snapshots.find((s) => s.code === stockConfig.code);
    if (!snapshot) continue;

    const spikeRules = stockConfig.rules.filter((r) => r.type === 'spike' && r.enabled);
    if (spikeRules.length === 0) continue;

    const baseCodeHistory = spikeHistory[stockConfig.code] || [];
    let rollingHistory = baseCodeHistory;

    for (const spikeRule of spikeRules) {
      const result = evaluateSpikeRule(
        spikeRule,
        stockConfig.code,
        snapshot.name,
        snapshot.price,
        rollingHistory,
        firedHistory
      );

      if (result?.triggered) {
        spikeTriggered.push({
          code: stockConfig.code,
          name: snapshot.name,
          message: result.message,
          ruleId: spikeRule.id,
        });
      }

      const now = Date.now();
      const windowMs = (spikeRule.spikeWindowMinutes ?? 5) * 60 * 1000 * 2; // 2x window for safety
      rollingHistory = [
        ...rollingHistory.filter((e) => now - e.timestamp < windowMs),
        { price: snapshot.price, timestamp: now },
      ];
    }

    finalSpikeHistory[stockConfig.code] = rollingHistory;
  }

  const allTriggered = [...triggered, ...spikeTriggered];

  // Write to notification history
  const newRecords: NotificationRecord[] = allTriggered.map((a) => {
    const ruleInfo = ruleTypeMap.get(a.ruleId);
    const snapshot = snapshots.find((s) => s.code === a.code);
    return {
      id: `n_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      code: a.code,
      name: a.name,
      message: a.message,
      ruleType: (ruleInfo?.type ?? 'change_pct') as NotificationRecord['ruleType'],
      price: snapshot?.price ?? 0,
      changePct: snapshot?.changePct ?? 0,
      firedAt: Date.now(),
      read: false,
    };
  });

  const updatedHistory = pruneNotificationHistory(
    [...existingNotifHistory, ...newRecords],
    NOTIFICATION_KEEP_HOURS
  );

  if (allTriggered.length === 0) {
    await chrome.storage.local.set({
      [SPIKE_HISTORY_KEY]: finalSpikeHistory,
      [NOTIFICATION_HISTORY_KEY]: updatedHistory,
    });
    return;
  }

  // 工作模式内：不弹系统通知，只写入通知历史
  if (inWorkMode) {
    const newFired = allTriggered.map((a) => ({
      code: a.code,
      ruleId: a.ruleId,
      firedAt: Date.now(),
    }));
    config.firedHistory = [...firedHistory, ...newFired];
    await Promise.all([
      saveAlertConfig(config),
      chrome.storage.local.set({ [SPIKE_HISTORY_KEY]: finalSpikeHistory, [NOTIFICATION_HISTORY_KEY]: updatedHistory }),
    ]);
    return;
  }

  // 非工作模式：发送系统通知
  for (const alert of allTriggered) {
    chrome.notifications.create(`alert_${alert.code}_${alert.ruleId}_${Date.now()}`, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('public/icon48.png'),
      title: `🔔 股价告警 — ${alert.name}`,
      message: alert.message,
      priority: 2,
    });
  }

  // 更新 fired history 和通知历史
  const newFired = allTriggered.map((a) => ({
    code: a.code,
    ruleId: a.ruleId,
    firedAt: Date.now(),
  }));

  config.firedHistory = [...firedHistory, ...newFired];
  await Promise.all([
    saveAlertConfig(config),
    chrome.storage.local.set({
      [SPIKE_HISTORY_KEY]: finalSpikeHistory,
      [NOTIFICATION_HISTORY_KEY]: updatedHistory,
    }),
  ]);
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
    void recordDailyProfitDetail();
    void updateHoverTitleFromStorage();
  } catch (e) {
    console.warn('[Portfolio Pulse] fund refresh failed:', e);
  }
}

async function recordDailyProfitDetail() {
  try {
    const [localResult, syncResult] = await Promise.all([
      chrome.storage.local.get(['stockPositions', 'fundPositions', DAILY_PROFIT_DETAILS_KEY]),
      chrome.storage.sync.get(['stockHoldings', 'fundHoldings']),
    ]);

    const stockPositions = (Array.isArray(localResult.stockPositions) ? localResult.stockPositions : []) as StockPosition[];
    const fundPositions = (Array.isArray(localResult.fundPositions) ? localResult.fundPositions : []) as FundPosition[];
    const stockHoldings = (Array.isArray(syncResult.stockHoldings) ? syncResult.stockHoldings : []) as StockHoldingConfig[];
    const fundHoldings = (Array.isArray(syncResult.fundHoldings) ? syncResult.fundHoldings : []) as FundHoldingConfig[];
    const history = normalizeDailyProfitDetailHistory(localResult[DAILY_PROFIT_DETAILS_KEY]);

    const hasHeldStock = stockHoldings.some((item) => Number(item.shares) > 0);
    const hasHeldFund = fundHoldings.some((item) => Number(item.units) > 0);
    if (!hasHeldStock && !hasHeldFund) {
      return;
    }

    const record = buildDailyProfitDetailRecord(
      getShanghaiToday(),
      stockPositions,
      fundPositions,
      stockHoldings,
      fundHoldings,
      new Date().toISOString(),
    );
    const nextHistory = upsertDailyProfitDetailHistory(history, record);
    await chrome.storage.local.set({ [DAILY_PROFIT_DETAILS_KEY]: nextHistory });
  } catch (error) {
    console.warn('[Portfolio Pulse] record daily profit detail failed:', error);
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
  const isClosed = !isTradingHours();

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
      color = isClosed ? BADGE_CLOSED_COLOR : (v >= 0 ? BADGE_UP_COLOR : BADGE_DOWN_COLOR);
      break;
    }
    case 'stockDailyPnl': {
      const v = metrics.stockDailyPnl || 0;
      text = formatBadgeNumber(v);
      color = isClosed ? BADGE_CLOSED_COLOR : (v >= 0 ? BADGE_UP_COLOR : BADGE_DOWN_COLOR);
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
      color = isClosed ? BADGE_CLOSED_COLOR : (v >= 0 ? BADGE_UP_COLOR : BADGE_DOWN_COLOR);
      break;
    }
    case 'fundEstimatedProfit': {
      const v = metrics.fundEstimatedProfit || 0;
      text = formatBadgeNumber(v);
      color = isClosed ? BADGE_CLOSED_COLOR : (v >= 0 ? BADGE_UP_COLOR : BADGE_DOWN_COLOR);
      break;
    }
  }

  if (isClosed) {
    color = BADGE_CLOSED_COLOR;
  }

  // Chrome badge supports up to ~6 characters, no need to truncate
  // formatBadgeNumber already ensures reasonable length

  void chrome.action.setBadgeText({ text });
  void chrome.action.setBadgeBackgroundColor({ color });
}

// -----------------------------------------------------------
// 悬浮提示（替代扩展名称）
// -----------------------------------------------------------

function updateHoverTitle(indexPositions: MarketIndexQuote[], metrics: Record<string, number>, unreadNotifCount = 0, colorScheme: 'cn' | 'us' = 'cn') {
  const lines: string[] = [];
  const isClosed = !isTradingHours();

  if (isClosed) {
    lines.push('🕒 当前休市');
    lines.push('');
  }

  // 指数行情
  for (const idx of indexPositions) {
    if (Number.isFinite(idx.price)) {
      const pctText = `${idx.changePct.toFixed(2)}%`;
      const arrow = idx.changePct > 0 ? ' ▲' : '';
      lines.push(`${idx.label}： ${idx.price.toFixed(2)} (${pctText})${arrow}`);
    }
  }

  if (indexPositions.length > 0) lines.push('');

  // 持仓当日盈亏
  const dailyPnl = metrics.stockDailyPnl;
  if (Number.isFinite(dailyPnl) && dailyPnl !== 0) {
    const sign = dailyPnl > 0 ? '+' : '-';
    const arrow = dailyPnl > 0 ? ' ▲' : '';
    lines.push(`股票当日盈亏： ${sign}${formatPnlNumber(Math.abs(dailyPnl))}${arrow}`);
  }

  // 基金预估收益
  const fundEst = metrics.fundEstimatedProfit;
  if (Number.isFinite(fundEst) && fundEst !== 0) {
    const sign = fundEst > 0 ? '+' : '-';
    const arrow = fundEst > 0 ? ' ▲' : '';
    lines.push(`基金预估收益： ${sign}${formatPnlNumber(Math.abs(fundEst))}${arrow}`);
  }

  // 未读通知数
  if (unreadNotifCount > 0) {
    if (lines.length > 0) lines.push('');
    lines.push(`未读通知： ${unreadNotifCount} 条`);
  }

  void chrome.action.setTitle({ title: lines.join('\n') || 'Stock Tracker' });
}

function formatPnlNumber(value: number): string {
  const abs = Math.abs(value);
  // 直接展示真实数据，不缩略
  if (abs >= 10000) {
    return `${(abs / 10000).toFixed(2)}万`;
  }
  if (abs >= 1000) {
    return `${abs.toFixed(2)}`;
  }
  return abs.toFixed(2);
}

function formatBadgeNumber(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  // Ensure output fits within Chrome badge width (~6 chars)
  if (abs >= 1000_0000) {
    return `${sign}${(abs / 10000).toFixed(0)}w`;     // e.g. 1200万 → "1200w"
  }
  if (abs >= 100_0000) {
    return `${sign}${(abs / 10000).toFixed(1)}w`;     // e.g. 123万 → "123.0w"
  }
  if (abs >= 10_0000) {
    return `${sign}${(abs / 10000).toFixed(1)}w`;     // e.g. 12万 → "12.0w"
  }
  if (abs >= 1000) {
    return `${sign}${(abs / 1000).toFixed(1)}k`;      // e.g. 1200 → "1.2k"
  }
  return `${sign}${Math.round(abs)}`;                  // e.g. 999 → "999"
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

// Keep Service Worker alive during long fetch operations
// Uses a port connection from the popup to prevent the SW from going idle
let keepAlivePorts: chrome.runtime.Port[] = [];

function keepAlive() {
  // Keep the Service Worker alive by maintaining port connections
  // The popup should connect before sending fetch-text messages
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'fetch-proxy') {
    keepAlivePorts.push(port);
    port.onDisconnect.addListener(() => {
      keepAlivePorts = keepAlivePorts.filter((p) => p !== port);
    });
  }
});

// 消息监听
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const request = message as { type?: string; url?: string; badge?: BadgeConfig; metrics?: Record<string, number> };

  if (request.type === 'fetch-text' && typeof request.url === 'string') {
    const url = request.url;
    console.log('[fetch-text] proxying:', url);
    keepAlive();
    void (async () => {
      try {
        console.log('[fetch-text] fetching:', url);
        const response = await fetch(url);
        // Tencent finance uses GB18030 encoding
        const isGb18030 = url.includes('qt.gtimg.cn');
        let text: string;
        if (isGb18030) {
          const buffer = await response.arrayBuffer();
          text = new TextDecoder('GB18030').decode(buffer);
        } else {
          text = await response.text();
        }
        console.log('[fetch-text] response status:', response.status, 'length:', text.length);
        sendResponse({ ok: response.ok, status: response.status, text });
      } catch (error) {
        console.error('[fetch-text] error:', error);
        sendResponse({ ok: false, status: 0, error: error instanceof Error ? error.message : 'unknown error' });
      }
    })();
    return true;
  }

  if (request.type === 'get-work-mode') {
    void (async () => {
      const result = await chrome.storage.sync.get([WORK_MODE_KEY]);
      const config = (result[WORK_MODE_KEY] as WorkModeConfig | undefined) || DEFAULT_WORK_MODE;
      sendResponse({ config, isWorkMode: isWorkModeHours(config) });
    })();
    return true;
  }

  if (request.type === 'test-notification') {
    void (async () => {
      const d = (message as { data?: { code: string; name: string; message: string; ruleType: string; price: number; changePct: number } }).data;
      if (!d) return;

      const workModeResult = await chrome.storage.sync.get([WORK_MODE_KEY]);
      const workModeConfig = (workModeResult[WORK_MODE_KEY] as WorkModeConfig | undefined) || DEFAULT_WORK_MODE;
      const inWorkMode = isWorkModeHours(workModeConfig);

      const record: NotificationRecord = {
        id: `n_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        code: d.code,
        name: d.name,
        message: d.message,
        ruleType: (d.ruleType ?? 'spike') as NotificationRecord['ruleType'],
        price: d.price,
        changePct: d.changePct,
        firedAt: Date.now(),
        read: false,
      };

      // Write to notification history
      const notifResult = await chrome.storage.local.get([NOTIFICATION_HISTORY_KEY]);
      const existingHistory = (notifResult[NOTIFICATION_HISTORY_KEY] as NotificationRecord[]) || [];
      const updatedHistory = pruneNotificationHistory([...existingHistory, record], NOTIFICATION_KEEP_HOURS);
      await chrome.storage.local.set({ [NOTIFICATION_HISTORY_KEY]: updatedHistory });

      // If not in work mode, also show system notification
      if (!inWorkMode) {
        chrome.notifications.create(`test_${Date.now()}`, {
          type: 'basic',
          iconUrl: chrome.runtime.getURL('public/icon48.png'),
          title: `🔔 告警测试通知 — ${d.name}`,
          message: d.message,
          priority: 2,
        });
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
