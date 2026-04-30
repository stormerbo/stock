import {
  fetchBatchStockQuotes,
  fetchStockIntraday,
  fetchTencentMarketIndexes,
  fetchTiantianFundPosition,
  getShanghaiToday,
  isTradingHours,
  normalizeStockCode,
  pMap,
  type FundHoldingConfig,
  type FundPosition,
  type MarketIndexQuote,
  type StockHoldingConfig,
  type StockPosition,
} from '../shared/fetch';
import {
  loadAlertConfig,
  saveAlertConfig,
  loadFiredHistory,
  saveFiredHistory,
  migrateFiredHistory,
  checkAlerts,
  pruneFiredHistory,
  evaluateSpikeRule,
  evaluateTrailingStopRule,
  evaluateBatchBuyRule,
  evaluateGridRule,
  pruneNotificationHistory,
  isInCooldown,
  NOTIFICATION_HISTORY_KEY,
  TRAILING_STOP_STATE_KEY,
  BATCH_BUY_STATE_KEY,
  GRID_STATE_KEY,
  FIRED_HISTORY_LOCAL_KEY,
  migrateSpikeConfig,
  DEFAULT_SPIKE_CONFIG,
  type AlertConfig,
  type AlertFiredRecord,
  type AlertRule,
  type NotificationRecord,
  type StockAlertConfig,
  type StockSnapshot,
  type SpikePriceEntry,
  type SpikePriceHistory,
  type TrailingStopState,
  type BatchBuyState,
  type GridState,
  type SpikeGlobalConfig,
} from '../shared/alerts';
import { calcMaxDrawdown } from '../shared/risk-metrics';
import { TRADE_HISTORY_KEY } from '../shared/trade-history';
import { detectAllSignals, fetchDayFqKline } from '../shared/technical-analysis';

export type BadgeMode =
  | 'off'
  | 'stockCount'
  | 'fundCount'
  | 'stockMarket'
  | 'stockFloatingPnl'
  | 'stockDailyPnl'
  | 'fundAmount'
  | 'fundHoldingProfit'
  | 'fundEstimatedProfit'
  | 'combinedPnl';

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
const TECH_REPORT_STORAGE_KEY = 'technicalReportConfig';
const TECH_REPORT_DATE_KEY = '_lastTechnicalReportDate';
const TECH_REPORT_SIGNAL_KEY = '_lastTechnicalSignals';
const TECH_REPORT_SIGNAL_STOCKS_KEY = 'techReportSignalStocks';
const TECH_REPORT_STATUS_KEY = 'technicalReportStatus';
const SPIKE_HISTORY_KEY = 'spikeHistory';
const WORK_MODE_KEY = 'workModeConfig';
const DRAWDOWN_EVAL_DATE_KEY = '_lastDrawdownEvalDate';
const NOTIFICATION_KEEP_HOURS = 24;

const ALARM_STOCK = 'refresh-stocks';
const ALARM_FUND = 'refresh-funds';
const ALARM_INDEX = 'refresh-indexes';
const ALARM_TECH_REPORT = 'daily-technical-report';
const ALARM_UPDATE_CHECK = 'check-update';
const UPDATE_INFO_KEY = 'extensionUpdateInfo';
const UPDATE_COOLDOWN_KEY = 'updateCooldown';
const STOCK_INTRADAY_DATE_KEY = 'stockIntradayDate';
const API_ERROR_KEY = '_apiErrorState';
const API_ERROR_COOLDOWN_MS = 30 * 60 * 1000; // 30 分钟
let refreshStocksInFlight = false;

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

type TechnicalReportConfig = {
  enabled: boolean;
};

const DEFAULT_TECH_REPORT: TechnicalReportConfig = {
  enabled: false,
};

type TechReportStatus = {
  enabled: boolean;
  lastRunDate: string;
  lastRunTime: number;
  nextRunTime: number;
  status: 'pending' | 'success' | 'no_signal' | 'error' | 'disabled';
  stockCount: number;
  signalCount: number;
  details: string;
  errorMessage: string;
};

async function loadTechReportConfig(): Promise<TechnicalReportConfig> {
  try {
    const result = await chrome.storage.sync.get(TECH_REPORT_STORAGE_KEY);
    const config = result[TECH_REPORT_STORAGE_KEY] as TechnicalReportConfig | undefined;
    return config || DEFAULT_TECH_REPORT;
  } catch {
    return DEFAULT_TECH_REPORT;
  }
}

function getDefaultTechReportStatus(): TechReportStatus {
  return {
    enabled: false, lastRunDate: '', lastRunTime: 0, nextRunTime: 0,
    status: 'disabled', stockCount: 0, signalCount: 0,
    details: '', errorMessage: '',
  };
}

async function saveTechReportStatus(update: Partial<TechReportStatus>) {
  try {
    const existing = await chrome.storage.local.get(TECH_REPORT_STATUS_KEY);
    const current = (existing[TECH_REPORT_STATUS_KEY] as TechReportStatus | undefined) || getDefaultTechReportStatus();
    await chrome.storage.local.set({ [TECH_REPORT_STATUS_KEY]: { ...current, ...update } });
  } catch {
    // silently fail
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
  const minSec = 2;
  const stockSec = Math.max(minSec, config.stockRefreshSeconds);
  const fundSec = Math.max(minSec, config.fundRefreshSeconds);
  const indexSec = Math.max(minSec, config.indexRefreshSeconds);
  chrome.alarms.create(ALARM_STOCK, { periodInMinutes: stockSec / 60 });
  chrome.alarms.create(ALARM_FUND, { periodInMinutes: fundSec / 60 });
  chrome.alarms.create(ALARM_INDEX, { periodInMinutes: indexSec / 60 });
}

/** 设置盘后技术报告告警（15:30 上海时间） */
function setupTechnicalReportAlarm() {
  chrome.alarms.clear(ALARM_TECH_REPORT);
  const now = new Date();
  const target = new Date(now);
  // 设置为上海时区的 15:30
  const shanghaiParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const shHour = Number(shanghaiParts.find((p) => p.type === 'hour')?.value ?? '15');
  const shMinute = Number(shanghaiParts.find((p) => p.type === 'minute')?.value ?? '30');

  // 计算下一次 15:30 上海时间对应的本地时间
  const localTarget = new Date();
  const utcHours = (Number(shHour) - 8 + 24) % 24; // Shanghai = UTC+8
  localTarget.setUTCHours(utcHours, shMinute >= 30 ? shMinute : 30, 0, 0);
  if (localTarget <= now) localTarget.setDate(localTarget.getDate() + 1);

  chrome.alarms.create(ALARM_TECH_REPORT, {
    when: localTarget.getTime(),
    periodInMinutes: 24 * 60,
  });
}

function clearAlarms() {
  chrome.alarms.clear(ALARM_STOCK);
  chrome.alarms.clear(ALARM_FUND);
  chrome.alarms.clear(ALARM_INDEX);
  chrome.alarms.clear(ALARM_TECH_REPORT);
}

async function handleAlarm(name: string) {
  if (name === ALARM_STOCK) await refreshStocks();
  else if (name === ALARM_FUND) await refreshFunds();
  else if (name === ALARM_INDEX) await refreshIndexes();
  else if (name === ALARM_TECH_REPORT) await generateDailyTechnicalReport();
}

// -----------------------------------------------------------
// GitHub Release 版本检查 — 热更新提醒
// -----------------------------------------------------------

const GITHUB_REPO = 'stormerbo/stock';

function parseVersion(v: string): number[] {
  return v.replace(/^v/i, '').split('.').map(Number);
}

function isNewerVersion(latest: string, current: string): boolean {
  const l = parseVersion(latest);
  const c = parseVersion(current);
  for (let i = 0; i < Math.max(l.length, c.length); i++) {
    const a = l[i] ?? 0;
    const b = c[i] ?? 0;
    if (a > b) return true;
    if (a < b) return false;
  }
  return false;
}

type UpdateInfo = {
  version: string;
  url: string;
  notified: boolean;
};

async function checkForUpdate(): Promise<{ found: boolean }> {
  try {
    const resp = await fetch('https://api.github.com/repos/' + GITHUB_REPO + '/releases/latest');
    if (!resp.ok) return { found: false };
    const data = await resp.json() as { tag_name: string; html_url: string };
    const latestVer = data.tag_name.replace(/^v/i, '');
    const currentVer = chrome.runtime.getManifest().version;

    if (isNewerVersion(latestVer, currentVer)) {
      const info: UpdateInfo = { version: latestVer, url: data.html_url, notified: true };
      await chrome.storage.local.set({ [UPDATE_INFO_KEY]: info });
      await chrome.storage.local.set({ [UPDATE_COOLDOWN_KEY]: Date.now() });

      await chrome.notifications.create('update_available', {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('public/icon128.png'),
        title: '有新版本可用',
        message: `赚钱助手 v${latestVer} 已发布，点击查看详情`,
        requireInteraction: true,
      });
      return { found: true };
    }
    return { found: false };
  } catch {
    return { found: false };
  }
}

// 通知点击 → 打开 Releases 页
chrome.notifications.onClicked.addListener((notifId) => {
  if (notifId === 'update_available') {
    chrome.tabs.create({ url: 'https://github.com/' + GITHUB_REPO + '/releases/latest' });
  }
});

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
  void loadTechReportConfig().then((config) => {
    if (config.enabled) {
      setupTechnicalReportAlarm();
      // Save enabled status + compute next run time for the popup status UI
      const now = new Date();
      const shParts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false,
      }).formatToParts(new Date());
      const shHour = Number(shParts.find((p) => p.type === 'hour')?.value ?? '15');
      const shMinute = Number(shParts.find((p) => p.type === 'minute')?.value ?? '30');
      const localTarget = new Date();
      localTarget.setUTCHours((shHour - 8 + 24) % 24, shMinute >= 30 ? shMinute : 30, 0, 0);
      if (localTarget <= now) localTarget.setDate(localTarget.getDate() + 1);
      void saveTechReportStatus({ enabled: true, status: 'pending', nextRunTime: localTarget.getTime() });
    } else {
      void saveTechReportStatus({ enabled: false, status: 'disabled' });
    }
  });
}

// -----------------------------------------------------------
// 数据刷新
// -----------------------------------------------------------

type ApiErrorState = {
  stockQuoteErrorAt: number;   // 0 = 无错误
  stockIntradayErrorAt: number;
  fundErrorAt: number;
};

async function getApiErrorState(): Promise<ApiErrorState> {
  const r = await chrome.storage.local.get([API_ERROR_KEY]);
  return (r[API_ERROR_KEY] as ApiErrorState) || { stockQuoteErrorAt: 0, stockIntradayErrorAt: 0, fundErrorAt: 0 };
}

async function saveApiErrorState(s: ApiErrorState): Promise<void> {
  await chrome.storage.local.set({ [API_ERROR_KEY]: s });
}

/**
 * 当 API 接口连续失败时弹出系统通知，30 分钟内不重复。
 */
async function notifyApiError(label: string, errorAtKey: 'stockQuoteErrorAt' | 'stockIntradayErrorAt' | 'fundErrorAt') {
  const state = await getApiErrorState();
  const now = Date.now();
  const lastError = state[errorAtKey];
  if (now - lastError < API_ERROR_COOLDOWN_MS) return; // 冷却中
  state[errorAtKey] = now;
  await saveApiErrorState(state);

  chrome.notifications.create(`api_error_${errorAtKey}_${now}`, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('public/icon48.png'),
    title: '⚠️ 行情接口异常',
    message: `${label} 获取失败，请检查网络或稍后重试。`,
    priority: 1,
  });
}

async function refreshStocks() {
  if (!isTradingHours()) return;
  if (refreshStocksInFlight) return;
  refreshStocksInFlight = true;
  try {
    const result = await chrome.storage.sync.get('stockHoldings');
    const stocks = (Array.isArray(result.stockHoldings) ? result.stockHoldings : []) as StockHoldingConfig[];
    if (stocks.length === 0) return;

    const positions = await fetchBatchStockQuotes(stocks);
    const quoteOk = positions.length > 0 && positions.some((p) => Number.isFinite(p.price));

    // 行情报价大面积失败时告警
    if (!quoteOk) {
      void notifyApiError('股票实时行情', 'stockQuoteErrorAt');
    }

    const existing = await chrome.storage.local.get([
      'stockPositions',
      STOCK_INTRADAY_DATE_KEY,
    ]);
    const existingPositions = (Array.isArray(existing.stockPositions) ? existing.stockPositions : []) as StockPosition[];
    const existingMap = new Map(existingPositions.map((p) => [p.code, p]));
    const intradayDate = typeof existing[STOCK_INTRADAY_DATE_KEY] === 'string'
      ? (existing[STOCK_INTRADAY_DATE_KEY] as string)
      : '';
    const today = getShanghaiToday();
    // 交易时段内每次刷新都重新拉取分时数据，确保分时图实时更新
    const isOpen = isTradingHours();
    const shouldRefreshAllIntraday = isOpen || intradayDate !== today;

    const merged = positions.map((p) => ({
      ...p,
      intraday: existingMap.get(p.code)?.intraday ?? { data: [], prevClose: Number.NaN },
    }));

    const allCodes = stocks.map((h) => normalizeStockCode(h.code)).filter(Boolean);
    const codesToRefresh = shouldRefreshAllIntraday
      ? allCodes
      : allCodes.filter((code) => {
        const pos = merged.find((p) => p.code === code);
        return pos && pos.intraday.data.length === 0;
      });

    let intradayFailedCount = 0;
    if (codesToRefresh.length > 0) {
      const intradayResults = await pMap(
        codesToRefresh,
        async (code) => {
          try {
            const d = await fetchStockIntraday(code);
            if (d.data.length === 0) intradayFailedCount++;
            return { code, data: d };
          } catch {
            intradayFailedCount++;
            return { code, data: { data: [], prevClose: Number.NaN } };
          }
        },
        3,
      );

      // 分时数据大量失败时告警
      if (intradayFailedCount >= codesToRefresh.length) {
        void notifyApiError('股票分时数据', 'stockIntradayErrorAt');
      }

      const intradayMap = new Map(intradayResults.map((r) => [r.code, r.data]));
      const final = merged.map((p) =>
        intradayMap.has(p.code) ? { ...p, intraday: intradayMap.get(p.code)! } : p
      );
      await chrome.storage.local.set({
        stockPositions: final,
        stockUpdatedAt: new Date().toISOString(),
        [STOCK_INTRADAY_DATE_KEY]: today,
      });
      // 检查告警
      void checkAndNotifyAlerts(final);
      // 回撤告警（每日首次）
      void evaluateDrawdownRules(final);
      // 更新悬浮提示
      void updateHoverTitleFromStorage();
    } else {
      await chrome.storage.local.set({
        stockPositions: merged,
        stockUpdatedAt: new Date().toISOString(),
        [STOCK_INTRADAY_DATE_KEY]: intradayDate || today,
      });
      // 检查告警
      void checkAndNotifyAlerts(merged);
      // 回撤告警（每日首次）
      void evaluateDrawdownRules(merged);
      // 更新悬浮提示
      void updateHoverTitleFromStorage();
    }

    // 全部成功则清除错误时间戳
    if (quoteOk && intradayFailedCount === 0) {
      const state = await getApiErrorState();
      if (state.stockQuoteErrorAt !== 0 || state.stockIntradayErrorAt !== 0) {
        await saveApiErrorState({ stockQuoteErrorAt: 0, stockIntradayErrorAt: 0, fundErrorAt: state.fundErrorAt });
      }
    }
  } catch (e) {
    console.warn('[Portfolio Pulse] stock refresh failed:', e);
    void notifyApiError('股票行情', 'stockQuoteErrorAt');
  } finally {
    refreshStocksInFlight = false;
  }
}

// -----------------------------------------------------------
// 告警检查与通知
// -----------------------------------------------------------

async function checkAndNotifyAlerts(positions: StockPosition[]) {
  const [config, spikeResult, notifResult, workModeResult, trailingResult, batchResult, gridResult] = await Promise.all([
    loadAlertConfig(),
    chrome.storage.local.get([SPIKE_HISTORY_KEY]),
    chrome.storage.local.get([NOTIFICATION_HISTORY_KEY]),
    chrome.storage.sync.get([WORK_MODE_KEY]),
    chrome.storage.local.get([TRAILING_STOP_STATE_KEY]),
    chrome.storage.local.get([BATCH_BUY_STATE_KEY]),
    chrome.storage.local.get([GRID_STATE_KEY]),
  ]);
  const trailingStopState: TrailingStopState = (trailingResult[TRAILING_STOP_STATE_KEY] || {}) as TrailingStopState;
  const batchBuyState: BatchBuyState = (batchResult[BATCH_BUY_STATE_KEY] || {}) as BatchBuyState;
  const gridState: GridState = (gridResult[GRID_STATE_KEY] || {}) as GridState;
  let effectiveConfig = migrateSpikeConfig(config);
  if (!effectiveConfig.globalEnabled) {
    return;
  }

  // 将 firedHistory 从 sync 迁移到 local storage（首次运行时）
  effectiveConfig = await migrateFiredHistory(effectiveConfig);

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

  if (snapshots.length === 0) {
    return;
  }

  // firedHistory 存储在 local storage 而非 sync storage，避免配额问题导致冷却记录丢失
  const firedHistory = pruneFiredHistory(await loadFiredHistory());
  const spikeHistory = (spikeResult[SPIKE_HISTORY_KEY] as SpikePriceHistory) || {};
  const existingNotifHistory = (notifResult[NOTIFICATION_HISTORY_KEY] as NotificationRecord[]) || [];

  // Build ruleId → ruleType map for notification records
  const ruleTypeMap = new Map<string, { type: string; config: StockAlertConfig }>();
  for (const sc of effectiveConfig.stocks) {
    for (const rule of sc.rules) {
      ruleTypeMap.set(rule.id, { type: rule.type, config: sc });
    }
  }
  // Global spike rule (used when no per-stock spike rules exist)
  ruleTypeMap.set('global_spike', { type: 'spike', config: { code: '', scope: 'all', rules: [] } });

  // Evaluate regular rules
  const { triggered, spikeHistory: updatedSpikeHistory } = checkAlerts(
    effectiveConfig, snapshots, firedHistory, spikeHistory
  );

  // Evaluate spike rules (global config)
  const spikeTriggered: Array<{ code: string; name: string; message: string; ruleId: string }> = [];
  const finalSpikeHistory: SpikePriceHistory = { ...updatedSpikeHistory };
  const spikeFiredInRun: Array<{ code: string; ruleId: string; firedAt: number; firedPrice?: number; firedChangePct?: number }> = [];
  const spikeConfig: SpikeGlobalConfig = effectiveConfig.spikeConfig || DEFAULT_SPIKE_CONFIG;
  const now = Date.now();

  if (spikeConfig.enabled) {
    const spikeRule: AlertRule = {
      id: 'global_spike',
      type: 'spike',
      enabled: true,
      spikePctThreshold: spikeConfig.pctThreshold,
      spikeWindowMinutes: spikeConfig.windowMinutes,
      direction: spikeConfig.direction,
      cooldownSeconds: spikeConfig.cooldownSeconds,
    };
    const maxWindowMs = spikeConfig.windowMinutes * 60 * 1000;

    for (const snapshot of snapshots) {
      const baseCodeHistory = spikeHistory[snapshot.code] || [];
      const rollingHistory = baseCodeHistory.filter((entry) => now - entry.timestamp < maxWindowMs * 2);

      const result = evaluateSpikeRule(
        spikeRule,
        snapshot.code,
        snapshot.name,
        snapshot.price,
        rollingHistory,
        [...firedHistory, ...spikeFiredInRun]
      );

      if (result?.triggered) {
        spikeTriggered.push({
          code: snapshot.code,
          name: snapshot.name,
          message: result.message,
          ruleId: result.ruleId || spikeRule.id,
        });
        spikeFiredInRun.push({
          code: snapshot.code,
          ruleId: result.ruleId || spikeRule.id,
          firedAt: now,
          firedPrice: snapshot.price,
          firedChangePct: snapshot.changePct,
        });
      }

      finalSpikeHistory[snapshot.code] = [...rollingHistory, { price: snapshot.price, timestamp: now }];
    }
  }

  // Evaluate stateful rules (trailing_stop, batch_buy, grid_trading)
  const statefulTriggered: Array<{ code: string; name: string; message: string; ruleId: string }> = [];
  const statefulFired: Array<{ code: string; ruleId: string; firedAt: number; firedPrice?: number; firedChangePct?: number }> = [];
  let finalTrailingStopState = { ...trailingStopState };
  let finalBatchBuyState = { ...batchBuyState };
  let finalGridState = { ...gridState };

  for (const stockConfig of effectiveConfig.stocks) {
    const snapshot = snapshots.find((s) => s.code === stockConfig.code);
    if (!snapshot) continue;

    for (const rule of stockConfig.rules) {
      if (!rule.enabled) continue;

      if (rule.type === 'trailing_stop') {
        const result = evaluateTrailingStopRule(
          rule, snapshot, finalTrailingStopState,
          [...firedHistory, ...spikeFiredInRun, ...statefulFired]
        );
        if (result) {
          finalTrailingStopState = result.newState;
          if (result.triggered) {
            statefulTriggered.push({ code: stockConfig.code, name: snapshot.name, message: result.message, ruleId: rule.id });
            statefulFired.push({ code: stockConfig.code, ruleId: rule.id, firedAt: Date.now(), firedPrice: snapshot.price, firedChangePct: snapshot.changePct });
          }
        }
      }

      if (rule.type === 'batch_buy') {
        const result = evaluateBatchBuyRule(
          rule, snapshot, finalBatchBuyState,
          [...firedHistory, ...spikeFiredInRun, ...statefulFired]
        );
        if (result) {
          finalBatchBuyState = result.newState;
          if (result.triggered) {
            statefulTriggered.push({ code: stockConfig.code, name: snapshot.name, message: result.message, ruleId: rule.id });
            statefulFired.push({ code: stockConfig.code, ruleId: rule.id, firedAt: Date.now(), firedPrice: snapshot.price, firedChangePct: snapshot.changePct });
          }
        }
      }

      if (rule.type === 'grid_trading') {
        const result = evaluateGridRule(
          rule, snapshot, finalGridState,
          [...firedHistory, ...spikeFiredInRun, ...statefulFired]
        );
        if (result) {
          finalGridState = result.newState;
          if (result.triggered) {
            statefulTriggered.push({ code: stockConfig.code, name: snapshot.name, message: result.message, ruleId: rule.id });
            statefulFired.push({ code: stockConfig.code, ruleId: rule.id, firedAt: Date.now(), firedPrice: snapshot.price, firedChangePct: snapshot.changePct });
          }
        }
      }
    }
  }

  const allTriggered = [...triggered, ...spikeTriggered, ...statefulTriggered];

  // Write to notification history
  const newRecords: NotificationRecord[] = allTriggered.map((a) => {
    const directInfo = ruleTypeMap.get(a.ruleId);
    const rulePrefix = a.ruleId.split('::')[0];
    const prefixedInfo = directInfo ?? ruleTypeMap.get(rulePrefix);
    const ruleInfo = prefixedInfo;
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
    await Promise.all([
      chrome.storage.local.set({
        [SPIKE_HISTORY_KEY]: finalSpikeHistory,
        [NOTIFICATION_HISTORY_KEY]: updatedHistory,
        [TRAILING_STOP_STATE_KEY]: finalTrailingStopState,
        [BATCH_BUY_STATE_KEY]: finalBatchBuyState,
        [GRID_STATE_KEY]: finalGridState,
      }),
    ]);
    return;
  }

  // 工作模式内：不弹系统通知，只写入通知历史
  if (inWorkMode) {
    const newFired = allTriggered.map((a) => {
      const snap = snapshots.find((s) => s.code === a.code);
      return {
        code: a.code,
        ruleId: a.ruleId,
        firedAt: Date.now(),
        firedPrice: snap?.price,
        firedChangePct: snap?.changePct,
      };
    });
    await Promise.all([
      saveAlertConfig(effectiveConfig),
      saveFiredHistory(pruneFiredHistory([...firedHistory, ...newFired])),
      chrome.storage.local.set({
        [SPIKE_HISTORY_KEY]: finalSpikeHistory,
        [NOTIFICATION_HISTORY_KEY]: updatedHistory,
        [TRAILING_STOP_STATE_KEY]: finalTrailingStopState,
        [BATCH_BUY_STATE_KEY]: finalBatchBuyState,
        [GRID_STATE_KEY]: finalGridState,
      }),
    ]);
    return;
  }

  // 非工作模式：发送系统通知（分行展示关键数据）
  for (const alert of allTriggered) {
    const snap = snapshots.find((s) => s.code === alert.code);
    const notifLines: string[] = [];

    const ruleIdPrefix = alert.ruleId.split('::')[0];
    const ruleInfo = ruleTypeMap.get(ruleIdPrefix);
    const isSpike = ruleInfo?.type === 'spike';

    // 提取 spike 方向
    let spikeDirection: 'up' | 'down' | null = null;
    const parts = alert.ruleId.split('::');
    if (parts.length >= 2) {
      if (parts[1] === 'up') spikeDirection = 'up';
      else if (parts[1] === 'down') spikeDirection = 'down';
    }

    // 标题：股票名称(代码) + spike 类型描述
    const spikeLabel = spikeDirection === 'up' ? '🔥 急速拉升' : spikeDirection === 'down' ? '🆘 急速打压' : '';
    const titleSuffix = spikeLabel ? ` ${spikeLabel}` : '';
    const notifTitle = `🔔 ${alert.name}(${alert.code})${titleSuffix}`;

    if (isSpike) {
      // 第一行：近X分钟 上涨/下跌 X.XX% + 箭头
      const msgLines = alert.message.split('\n');
      const intradayLine = msgLines.find((l) => l.includes('分钟内'));
      if (intradayLine) {
        const cleaned = intradayLine.replace(/^.*?[钟内]/, '').trim();
        // 提取涨跌幅数值
        const match = cleaned.match(/([+-]?\d+\.\d+)%/);
        const pctStr = match ? match[1] : '';
        const pctNum = parseFloat(pctStr);
        const arrow = pctNum >= 0 ? '↑' : '↓';
        const spikeWindow = ruleInfo?.config.rules.find((r) => r.id === ruleIdPrefix)?.spikeWindowMinutes ?? 5;
        const directionLabel = pctNum >= 0 ? '上涨' : '下跌';
        notifLines.push(`近${spikeWindow}分钟${directionLabel} ${pctStr}% ${arrow}`);
      }

      // 第二行：现价 + 涨跌幅
      const pricePart = snap && Number.isFinite(snap.price) ? `现价: ¥${snap.price.toFixed(2)}` : '';
      const changePart = snap && Number.isFinite(snap.changePct)
        ? `涨跌幅: ${snap.changePct >= 0 ? '+' : ''}${snap.changePct.toFixed(2)}%`
        : '';
      const secondLine = [pricePart, changePart].filter(Boolean).join(', ');
      if (secondLine) notifLines.push(secondLine);
    } else {
      // 其他告警类型：从消息中提取简洁的触发原因
      const shortReason = alert.message.replace(/^[^()]*\([^)]*\)\s*/, '').trim();
      notifLines.push(`告警: ${shortReason}`);

      // 现价 + 涨跌幅
      const pricePart = snap && Number.isFinite(snap.price) ? `现价: ¥${snap.price.toFixed(2)}` : '';
      const changePart = snap && Number.isFinite(snap.changePct)
        ? `涨跌幅: ${snap.changePct >= 0 ? '+' : ''}${snap.changePct.toFixed(2)}%`
        : '';
      const secondLine = [pricePart, changePart].filter(Boolean).join(', ');
      if (secondLine) notifLines.push(secondLine);
    }

    chrome.notifications.create(`alert_${alert.code}_${alert.ruleId}_${Date.now()}`, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('public/icon48.png'),
      title: notifTitle,
      message: notifLines.join('\n'),
      priority: 2,
    });
  }

  // 更新 fired history 和通知历史
  const newFired = allTriggered.map((a) => {
    const snap = snapshots.find((s) => s.code === a.code);
    return {
      code: a.code,
      ruleId: a.ruleId,
      firedAt: Date.now(),
      firedPrice: snap?.price,
      firedChangePct: snap?.changePct,
    };
  });

  await Promise.all([
    saveAlertConfig(effectiveConfig),
    saveFiredHistory(pruneFiredHistory([...firedHistory, ...newFired])),
    chrome.storage.local.set({
      [SPIKE_HISTORY_KEY]: finalSpikeHistory,
      [NOTIFICATION_HISTORY_KEY]: updatedHistory,
      [TRAILING_STOP_STATE_KEY]: finalTrailingStopState,
      [BATCH_BUY_STATE_KEY]: finalBatchBuyState,
      [GRID_STATE_KEY]: finalGridState,
    }),
  ]);
}

// -----------------------------------------------------------
// 回撤告警评估 — 每日首次刷新时检查
// -----------------------------------------------------------

/** 转为腾讯 API 格式（sh/sz 前缀） */
function toTencentStockCode(code: string): string {
  const plain = normalizeStockCode(code);
  if (!plain) return '';
  return /^[689]/.test(plain) ? `sh${plain}` : `sz${plain}`;
}

/** 获取日 K-line 的收盘价和日期数组 */
async function fetchDayKlineClosePrices(code: string): Promise<{ closePrices: number[]; dates: string[] } | null> {
  const tencentCode = toTencentStockCode(code);
  if (!tencentCode) return null;
  try {
    const response = await fetch(`https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${tencentCode},day,,,800,qfq`);
    const json = await response.json() as Record<string, unknown>;
    const data = (json as { data?: Record<string, { qfqday?: string[][] }> }).data;
    const payload = data?.[tencentCode];
    const rows = payload?.qfqday;
    if (!rows || !Array.isArray(rows)) return null;

    const closePrices: number[] = [];
    const dates: string[] = [];

    for (const row of rows) {
      if (!Array.isArray(row) || row.length < 4) continue;
      const date = String(row[0]);
      const close = Number(row[2]);
      if (Number.isFinite(close)) {
        closePrices.push(close);
        dates.push(date);
      }
    }

    if (closePrices.length < 10) return null;
    return { closePrices, dates };
  } catch {
    return null;
  }
}

/** 评估所有已开启回撤告警规则的股票 */
async function evaluateDrawdownRules(positions: StockPosition[]) {
  if (positions.length === 0) return;

  const [alertConfig, evalDateResult, notifResult, workModeResult] = await Promise.all([
    loadAlertConfig(),
    chrome.storage.local.get([DRAWDOWN_EVAL_DATE_KEY]),
    chrome.storage.local.get([NOTIFICATION_HISTORY_KEY]),
    chrome.storage.sync.get([WORK_MODE_KEY]),
  ]);

  if (!alertConfig.globalEnabled) return;

  const today = getShanghaiToday();
  const lastEvalDates = (evalDateResult[DRAWDOWN_EVAL_DATE_KEY] as Record<string, string>) || {};
  const workModeConfig = (workModeResult[WORK_MODE_KEY] as WorkModeConfig | undefined) || DEFAULT_WORK_MODE;
  const inWorkMode = isWorkModeHours(workModeConfig);

  // 找出有回撤规则且今日尚未评估的股票
  const stocksToEval: Array<{ code: string; rules: AlertRule[]; name: string }> = [];

  for (const stockConfig of alertConfig.stocks) {
    const drawdownRules = stockConfig.rules.filter((r) => r.type === 'drawdown' && r.enabled);
    if (drawdownRules.length === 0) continue;
    if (lastEvalDates[stockConfig.code] === today) continue;

    const pos = positions.find((p) => p.code === stockConfig.code);
    if (!pos) continue;

    stocksToEval.push({ code: stockConfig.code, rules: drawdownRules, name: pos.name });
  }

  if (stocksToEval.length === 0) return;

  const firedHistory = pruneFiredHistory(await loadFiredHistory());
  const existingNotifHistory = (notifResult[NOTIFICATION_HISTORY_KEY] as NotificationRecord[]) || [];
  const newRecords: NotificationRecord[] = [];
  const newFired: AlertFiredRecord[] = [];

  for (const item of stocksToEval) {
    const klineData = await fetchDayKlineClosePrices(item.code);
    if (!klineData) continue;

    const ddResult = calcMaxDrawdown(klineData.closePrices, klineData.dates);
    if (!ddResult) continue;

    const ddPct = Math.abs(ddResult.maxDrawdown) * 100;

    for (const rule of item.rules) {
      const threshold = rule.drawdownThreshold ?? 20;

      // 检查冷却期（drawdown 默认 24h）
      const inCooldown = isInCooldown(firedHistory, item.code, rule.id, rule.cooldownSeconds ?? 86400);
      if (inCooldown) continue;

      if (ddPct >= threshold) {
        const message = `${item.name}(${item.code}) 最大回撤已达 ${ddPct.toFixed(2)}%（阈值 ${threshold}%），峰值 ${ddResult.peakDate}，谷值 ${ddResult.troughDate}`;
        const pos = positions.find((p) => p.code === item.code);

        newRecords.push({
          id: `n_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          code: item.code,
          name: item.name,
          message,
          ruleType: 'drawdown',
          price: pos?.price ?? 0,
          changePct: pos?.dailyChangePct ?? 0,
          firedAt: Date.now(),
          read: false,
        });

        newFired.push({
          code: item.code,
          ruleId: rule.id,
          firedAt: Date.now(),
          firedPrice: pos?.price,
          firedChangePct: pos?.dailyChangePct,
        });

        // 非工作模式弹系统通知
        if (!inWorkMode) {
          chrome.notifications.create(`drawdown_${item.code}_${Date.now()}`, {
            type: 'basic',
            iconUrl: chrome.runtime.getURL('public/icon48.png'),
            title: `🔔 ${item.name}(${item.code}) 最大回撤告警`,
            message: `最大回撤 ${ddPct.toFixed(2)}%，峰值 ${ddResult.peakDate} → 谷值 ${ddResult.troughDate}`,
            priority: 2,
          });
        }
      }
    }
  }

  // 更新评估日期标记（即使未触发也要标记，避免重复拉取 K-line）
  const nextEvalDates = { ...lastEvalDates };
  for (const item of stocksToEval) {
    nextEvalDates[item.code] = today;
  }

  if (newRecords.length === 0 && newFired.length === 0) {
    await chrome.storage.local.set({ [DRAWDOWN_EVAL_DATE_KEY]: nextEvalDates });
    return;
  }

  const updatedHistory = pruneNotificationHistory(
    [...existingNotifHistory, ...newRecords],
    NOTIFICATION_KEEP_HOURS
  );

  await Promise.all([
    saveFiredHistory(pruneFiredHistory([...firedHistory, ...newFired])),
    chrome.storage.local.set({
      [NOTIFICATION_HISTORY_KEY]: updatedHistory,
      [DRAWDOWN_EVAL_DATE_KEY]: nextEvalDates,
    }),
  ]);
}

// -----------------------------------------------------------
// 盘后技术指标报告 — 每日 15:30 计算多指标信号
// -----------------------------------------------------------

async function generateDailyTechnicalReport() {
  const config = await loadTechReportConfig();
  if (!config.enabled) return;

  // 检查重复
  const local = await chrome.storage.local.get([TECH_REPORT_DATE_KEY, TECH_REPORT_SIGNAL_KEY, NOTIFICATION_HISTORY_KEY, TECH_REPORT_STATUS_KEY]);
  const today = getShanghaiToday();
  if (local[TECH_REPORT_DATE_KEY] === today) return;

  // Save pending status
  await saveTechReportStatus({ status: 'pending', lastRunDate: today });

  try {
    // 加载持仓股票
    const syncResult = await chrome.storage.sync.get(['stockHoldings']);
    const holdings = (syncResult.stockHoldings || []) as StockHoldingConfig[];
    const heldStocks = holdings.filter((h) => Number(h.shares) > 0);
    if (heldStocks.length === 0) {
      await saveTechReportStatus({ status: 'no_signal', stockCount: 0, signalCount: 0, lastRunTime: Date.now(), details: '无持仓股票' });
      await chrome.storage.local.set({ [TECH_REPORT_DATE_KEY]: today });
      return;
    }

    // 从实时行情数据补全股票名称（持仓配置可能没存 name）
    const localData = await chrome.storage.local.get(['stockPositions']);
    const stockPositions = (localData.stockPositions || []) as Array<{ code: string; name: string }>;
    const nameByCode: Record<string, string> = {};
    for (const sp of stockPositions) {
      if (sp.name) nameByCode[sp.code] = sp.name;
    }

    // 获取每只持仓股票的 K 线数据
    const klineResults = await pMap(
      heldStocks,
      async (holding) => {
        const stockName = holding.name || nameByCode[holding.code] || holding.code;
        try {
          const kline = await fetchDayFqKline(holding.code, 60);
          return { code: holding.code, name: stockName, kline };
        } catch {
          return { code: holding.code, name: stockName, kline: [] };
        }
      },
      4,
    );

    // 检测所有信号，按配置过滤，与上次状态比较去重
    const lastSignals = (local[TECH_REPORT_SIGNAL_KEY] as Record<string, string>) || {};
    const newSignalsByStock: Record<string, Array<{ code: string; name: string; signal: import('../shared/technical-analysis').TechnicalSignal }>> = {};
    const currentSignals: Record<string, string> = {};
    let totalNewSignals = 0;

    for (const result of klineResults) {
      if (result.kline.length < 30) {
        currentSignals[result.code] = 'insufficient_data';
        continue;
      }

      // 检测全部信号
      const signals = detectAllSignals(result.kline);

      // 与上次状态比较去重
      const prevList = (lastSignals[result.code] || '').split(';').filter(Boolean);
      const prevSet = new Set(prevList);
      const newForStock = signals.filter((s) => !prevSet.has(s.type));

      if (newForStock.length > 0) {
        newSignalsByStock[result.code] = newForStock.map((s) => ({
          code: result.code,
          name: result.name,
          signal: s,
        }));
        totalNewSignals += newForStock.length;
      }

      // 更新当前状态（所有的 type 列表）
      const allTypes = signals.map((s) => s.type);
      currentSignals[result.code] = allTypes.join(';');
    }

    // 生成通知
    if (totalNewSignals > 0) {
    const stockCodes = Object.keys(newSignalsByStock);
    const stockCount = stockCodes.length;

    // 构建详细消息（按股票分组，带指导意义）
    const detailLines: string[] = [`📊 技术信号 (${today})`, ''];
    for (const code of stockCodes) {
      const entries = newSignalsByStock[code];
      if (entries.length === 0) continue;
      const first = entries[0];
      detailLines.push(`${first.name}(${code}):`);
      for (const entry of entries) {
        detailLines.push(`  • ${entry.signal.label} — ${entry.signal.guidance}`);
      }
      detailLines.push('');
    }
    const detailMessage = detailLines.join('\n').trim();

    // 系统通知（简短）
    const summaryLine = stockCount === 1
      ? `${stockCodes[0]} 出现 ${totalNewSignals} 个技术信号`
      : `${stockCount} 只股票出现 ${totalNewSignals} 个技术信号`;

    // 写入通知历史
    const existingNotifHistory = (local[NOTIFICATION_HISTORY_KEY] as NotificationRecord[]) || [];
    const record: NotificationRecord = {
      id: `tech_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      code: '',
      name: '盘后技术报告',
      message: detailMessage,
      ruleType: 'change_pct',
      price: 0,
      changePct: 0,
      firedAt: Date.now(),
      read: false,
    };
    const updatedHistory = pruneNotificationHistory([...existingNotifHistory, record], NOTIFICATION_KEEP_HOURS);
    await chrome.storage.local.set({ [NOTIFICATION_HISTORY_KEY]: updatedHistory });

    // 弹系统通知
    chrome.notifications.create(`tech_report_${Date.now()}`, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('public/icon48.png'),
      title: '📊 盘后技术信号',
      message: summaryLine,
      priority: 2,
    });
  }

  // 保存报告日期和信号状态
  await chrome.storage.local.set({
    [TECH_REPORT_DATE_KEY]: today,
    [TECH_REPORT_SIGNAL_KEY]: currentSignals,
  });

  // 保存有信号的股票列表（用于 popup 列表打标）
  const signalStocks: Record<string, { name: string; signalCount: number }> = {};
  for (const result of klineResults) {
    const types = currentSignals[result.code];
    if (types && types !== 'insufficient_data' && types.length > 0) {
      const count = types.split(';').length;
      signalStocks[result.code] = { name: result.name, signalCount: count };
    }
  }
  await chrome.storage.local.set({
    [TECH_REPORT_SIGNAL_STOCKS_KEY]: { date: today, stocks: signalStocks },
  });

  // Save success status
  const stockSignalCount = Object.keys(newSignalsByStock).length;
  await saveTechReportStatus({
    status: totalNewSignals > 0 ? 'success' : 'no_signal',
    lastRunTime: Date.now(),
    stockCount: heldStocks.length,
    signalCount: totalNewSignals,
    details: totalNewSignals > 0
      ? `${stockSignalCount}只股票出现${totalNewSignals}个技术信号`
      : '已检测，无新信号',
    errorMessage: '',
  });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[TechReport] error:', msg);
    await saveTechReportStatus({ status: 'error', errorMessage: msg, lastRunTime: Date.now() });
    await chrome.storage.local.set({ [TECH_REPORT_DATE_KEY]: today });
  }
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
    const fundOk = positions.length > 0 && positions.some((p) => Number.isFinite(p.estimatedNav));
    if (!fundOk) {
      void notifyApiError('基金净值', 'fundErrorAt');
    } else {
      const state = await getApiErrorState();
      if (state.fundErrorAt !== 0) {
        await saveApiErrorState({ ...state, fundErrorAt: 0 });
      }
    }
    await chrome.storage.local.set({ fundPositions: positions, fundUpdatedAt: new Date().toISOString() });
    void updateHoverTitleFromStorage();
  } catch (e) {
    console.warn('[Portfolio Pulse] fund refresh failed:', e);
    void notifyApiError('基金净值', 'fundErrorAt');
  }
}


/** 判断上海时区今天是否是周末（非交易日） */
function isWeekendInShanghai(): boolean {
  const dayOfWeek = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    weekday: 'short',
  }).format(new Date());
  return dayOfWeek === 'Sat' || dayOfWeek === 'Sun';
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
    combinedPnl: daily + fundEstimatedProfit,
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

  // Modes that should keep gain/loss colors even during non-trading hours
  const pnlModes = new Set(['stockFloatingPnl', 'stockDailyPnl', 'fundHoldingProfit', 'fundEstimatedProfit', 'combinedPnl']);

  // Sanitize all metrics to prevent NaN display
  // Fill in missing keys with 0 (e.g. combinedPnl from popup message)
  const defaults: Record<string, number> = {
    stockCount: 0,
    fundCount: 0,
    stockMarket: 0,
    stockFloatingPnl: 0,
    stockDailyPnl: 0,
    fundAmount: 0,
    fundHoldingProfit: 0,
    fundEstimatedProfit: 0,
    combinedPnl: 0,
  };
  const m: Record<string, number> = {};
  for (const key of Object.keys(defaults)) {
    m[key] = Number.isFinite(metrics[key]) ? metrics[key] : defaults[key];
  }

  switch (config.mode) {
    case 'stockCount':
      text = `股${m.stockCount || 0}`;
      color = [59, 130, 246, 255];
      break;
    case 'stockMarket': {
      text = formatBadgeNumber(m.stockMarket || 0);
      color = [99, 102, 241, 255];
      break;
    }
    case 'stockFloatingPnl': {
      text = formatBadgeNumber(m.stockFloatingPnl);
      color = m.stockFloatingPnl >= 0 ? BADGE_UP_COLOR : BADGE_DOWN_COLOR;
      break;
    }
    case 'stockDailyPnl': {
      text = formatBadgeNumber(m.stockDailyPnl);
      color = m.stockDailyPnl >= 0 ? BADGE_UP_COLOR : BADGE_DOWN_COLOR;
      break;
    }
    case 'fundCount':
      text = `基${m.fundCount || 0}`;
      color = [245, 158, 11, 255];
      break;
    case 'fundAmount': {
      text = formatBadgeNumber(m.fundAmount || 0);
      color = [245, 158, 11, 255];
      break;
    }
    case 'fundHoldingProfit': {
      text = formatBadgeNumber(m.fundHoldingProfit);
      color = m.fundHoldingProfit >= 0 ? BADGE_UP_COLOR : BADGE_DOWN_COLOR;
      break;
    }
    case 'fundEstimatedProfit': {
      text = formatBadgeNumber(m.fundEstimatedProfit);
      color = m.fundEstimatedProfit >= 0 ? BADGE_UP_COLOR : BADGE_DOWN_COLOR;
      break;
    }
    case 'combinedPnl': {
      text = formatBadgeNumber(m.combinedPnl);
      color = m.combinedPnl >= 0 ? BADGE_UP_COLOR : BADGE_DOWN_COLOR;
      break;
    }
  }

  if (isClosed && !pnlModes.has(config.mode)) {
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

  // 合并盈亏（股票当日 + 基金预估）
  const combined = metrics.combinedPnl;
  if (Number.isFinite(combined) && combined !== 0) {
    const sign = combined > 0 ? '+' : '-';
    const arrow = combined > 0 ? ' ▲' : '';
    lines.push(`总盈亏： ${sign}${formatPnlNumber(Math.abs(combined))}${arrow}`);
  }

  // 未读通知数
  if (unreadNotifCount > 0) {
    if (lines.length > 0) lines.push('');
    lines.push(`未读通知： ${unreadNotifCount} 条`);
  }

  void chrome.action.setTitle({ title: lines.join('\n') || '赚钱助手' });
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
    keepAlive();
    void (async () => {
      try {
        const response = await fetch(url, {
          headers: { 'Referer': 'https://quote.eastmoney.com/' },
        });
        // Tencent finance uses GB18030 encoding
        const isGb18030 = url.includes('qt.gtimg.cn');
        let text: string;
        if (isGb18030) {
          const buffer = await response.arrayBuffer();
          text = new TextDecoder('GB18030').decode(buffer);
        } else {
          text = await response.text();
        }
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

  if (request.type === 'check-update') {
    void (async () => {
      try {
        const result = await checkForUpdate();
        sendResponse({ ok: true, found: result.found });
      } catch {
        sendResponse({ ok: false, found: false });
      }
    })();
    return true;
  }

  if (request.type === 'test-notification') {
    void (async () => {
      try {
        const d = (message as { data?: { code: string; name: string; message: string; ruleType: string; price: number; changePct: number; _ruleId?: string } }).data;
        if (!d) {
          sendResponse({ ok: false, error: 'missing notification payload' });
          return;
        }

        const workModeResult = await chrome.storage.sync.get([WORK_MODE_KEY]);
        const workModeConfig = (workModeResult[WORK_MODE_KEY] as WorkModeConfig | undefined) || DEFAULT_WORK_MODE;
        const inWorkMode = isWorkModeHours(workModeConfig);

        // Parse spike direction from _ruleId (e.g. "spike_demo_up::up::L1")
        let spikeDirection: 'up' | 'down' | null = null;
        const isSpike = d.ruleType === 'spike';
        if (isSpike && d._ruleId) {
          const parts = d._ruleId.split('::');
          if (parts.length >= 2) {
            if (parts[1] === 'up') spikeDirection = 'up';
            else if (parts[1] === 'down') spikeDirection = 'down';
          }
        }

        const spikeLabel = spikeDirection === 'up' ? '🔥 急速拉升' : spikeDirection === 'down' ? '🆘 急速打压' : '';
        const titleSuffix = spikeLabel ? ` ${spikeLabel}` : '';
        const notifTitle = `🔔 ${d.name}(${d.code})${titleSuffix}`;

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
          chrome.notifications.create(`test_${d.code}_${Date.now()}`, {
            type: 'basic',
            iconUrl: chrome.runtime.getURL('public/icon48.png'),
            title: notifTitle,
            message: d.message,
            priority: 2,
          });
        }

        sendResponse({ ok: true });
      } catch (error) {
        sendResponse({ ok: false, error: error instanceof Error ? error.message : 'unknown error' });
      }
    })();
    return true;
  }

  if (request.type === 'update-badge' && request.badge && request.metrics) {
    applyBadgeText(request.badge, request.metrics);
    return;
  }

  if (request.type === 'get-tech-report-status') {
    void (async () => {
      try {
        const result = await chrome.storage.local.get(TECH_REPORT_STATUS_KEY);
        const status = (result[TECH_REPORT_STATUS_KEY] as TechReportStatus | undefined) || getDefaultTechReportStatus();

        // Compute next run time from alarm if enabled
        if (status.enabled) {
          const alarm = await chrome.alarms.get(ALARM_TECH_REPORT);
          if (alarm?.scheduledTime) {
            status.nextRunTime = alarm.scheduledTime;
          } else {
            // Alarm not yet set — calculate from config
            const now = new Date();
            const shParts = new Intl.DateTimeFormat('en-CA', {
              timeZone: 'Asia/Shanghai',
              year: 'numeric', month: '2-digit', day: '2-digit',
              hour: '2-digit', minute: '2-digit', hour12: false,
            }).formatToParts(new Date());
            const shHour = Number(shParts.find((p) => p.type === 'hour')?.value ?? '15');
            const shMinute = Number(shParts.find((p) => p.type === 'minute')?.value ?? '30');
            const localTarget = new Date();
            localTarget.setUTCHours((shHour - 8 + 24) % 24, shMinute >= 30 ? shMinute : 30, 0, 0);
            if (localTarget <= now) localTarget.setDate(localTarget.getDate() + 1);
            status.nextRunTime = localTarget.getTime();
          }
        }

        sendResponse({ status });
      } catch {
        sendResponse({ status: getDefaultTechReportStatus() });
      }
    })();
    return true;
  }

  if (request.type === 'trigger-tech-report') {
    void (async () => {
      try {
        // Clear date + signal keys so manual re-run detects all signals fresh
        await chrome.storage.local.remove([TECH_REPORT_DATE_KEY, TECH_REPORT_SIGNAL_KEY]);
        await generateDailyTechnicalReport();
        sendResponse({ ok: true });
      } catch (error) {
        sendResponse({ ok: false, error: error instanceof Error ? error.message : 'unknown error' });
      }
    })();
    return true;
  }

  return undefined;
});
