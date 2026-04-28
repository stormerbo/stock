// -----------------------------------------------------------
// Alert configuration types and evaluation logic
// -----------------------------------------------------------

export type AlertScope = 'all' | 'special' | 'holding';
export type AlertDirection = 'up' | 'down' | 'both';

export type AlertRuleType = 'price_up' | 'price_down' | 'change_pct' | 'volatility' | 'spike' | 'drawdown' | 'trailing_stop' | 'batch_buy' | 'grid_trading';

export type AlertRule = {
  id: string;
  type: AlertRuleType;
  enabled: boolean;
  // optional label for display
  name?: string;
  // price_up / price_down
  targetPrice?: number;
  // change_pct — threshold in percentage (e.g. 5 means 5%)
  changeThreshold?: number;
  // change_pct / spike direction control
  direction?: AlertDirection;
  // volatility — lookback days + threshold
  volatilityDays?: number;
  volatilityThreshold?: number;
  // spike — rapid price movement detection
  spikePctThreshold?: number;   // percentage threshold, default 2
  spikeWindowMinutes?: number; // lookback window in minutes, default 5
  // drawdown — max drawdown threshold
  drawdownThreshold?: number;   // percentage threshold, default 20
  // trailing_stop — trailing stop loss
  trailingStopPct?: number;     // percentage drop from peak to trigger, default 5
  // batch_buy — batch buy price levels (range mode)
  batchBuyStartPrice?: number;
  batchBuyEndPrice?: number;
  batchBuyCount?: number;       // number of tiers, default 3
  // grid_trading — grid trading signal
  gridUpperPrice?: number;
  gridLowerPrice?: number;
  gridCount?: number;           // number of grid lines, default 5
  // cooldown in seconds (default 300 = 5 min)
  cooldownSeconds?: number;
};

export type StockAlertConfig = {
  code: string;
  scope: AlertScope;
  rules: AlertRule[];
};

export type AlertFiredRecord = {
  code: string;
  ruleId: string;
  firedAt: number; // timestamp ms
  firedPrice?: number; // stock price when fired, for dedup
  firedChangePct?: number; // changePct when fired, for dedup
};

// 内存级迟滞跟踪器：记录哪些 code+ruleId 在当前"阈值持续满足"周期内已触发告警。
// 一旦涨跌幅回到阈值以内，自动清除，下次再超出时可重新触发。
const hysteresisTriggered = new Map<string, boolean>();

export type SpikePriceEntry = {
  price: number;
  timestamp: number; // ms
};

export type SpikePriceHistory = Record<string, SpikePriceEntry[]>;

// Stateful rule tracking (persisted in chrome.storage.local)
export type TrailingStopState = Record<string, { peakPrice: number }>;
export type BatchBuyState = Record<string, { triggeredLevels: number[] }>;
export type GridState = Record<string, { lastGridIndex: number | null }>;

export const TRAILING_STOP_STATE_KEY = 'trailingStopState';
export const BATCH_BUY_STATE_KEY = 'batchBuyState';
export const GRID_STATE_KEY = 'gridState';

export type SpikeGlobalConfig = {
  enabled: boolean;
  pctThreshold: number;    // default 2
  windowMinutes: number;   // default 5
  direction: AlertDirection; // default 'both'
  cooldownSeconds: number; // default 60
};

export const DEFAULT_SPIKE_CONFIG: SpikeGlobalConfig = {
  enabled: true,
  pctThreshold: 2,
  windowMinutes: 5,
  direction: 'both',
  cooldownSeconds: 60,
};

export type AlertConfig = {
  globalEnabled: boolean;
  scope: AlertScope;
  stocks: StockAlertConfig[];
  firedHistory: AlertFiredRecord[];
  spikeConfig?: SpikeGlobalConfig;
};

export const DEFAULT_ALERT_CONFIG: AlertConfig = {
  globalEnabled: false,
  scope: 'holding',
  stocks: [],
  firedHistory: [],
};

const ALERT_STORAGE_KEY = 'alertConfig';
export const FIRED_HISTORY_LOCAL_KEY = 'alertFiredHistory';

const VALID_RULE_TYPES: AlertRuleType[] = ['price_up', 'price_down', 'change_pct', 'volatility', 'spike', 'trailing_stop', 'batch_buy', 'grid_trading'];

function normalizeNumber(value: unknown, fallback: number, min?: number, max?: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  let next = n;
  if (typeof min === 'number') next = Math.max(min, next);
  if (typeof max === 'number') next = Math.min(max, next);
  return next;
}

function normalizeDirection(raw: unknown): AlertDirection {
  return raw === 'up' || raw === 'down' || raw === 'both' ? raw : 'both';
}

function normalizeRule(rule: Partial<AlertRule> | undefined): AlertRule {
  const type = VALID_RULE_TYPES.includes(rule?.type as AlertRuleType)
    ? (rule!.type as AlertRuleType)
    : 'change_pct';

  const normalized: AlertRule = {
    id: String(rule?.id || genRuleId()),
    type,
    enabled: rule?.enabled !== false,
    cooldownSeconds: normalizeNumber(rule?.cooldownSeconds, 300, 60, 3600),
  };

  const trimmedName = String(rule?.name ?? '').trim();
  if (trimmedName) normalized.name = trimmedName;

  if (type === 'price_up' || type === 'price_down') {
    normalized.targetPrice = normalizeNumber(rule?.targetPrice, 0, 0);
  }

  if (type === 'change_pct') {
    normalized.changeThreshold = normalizeNumber(rule?.changeThreshold, 5, 0);
    normalized.direction = normalizeDirection(rule?.direction);
  }

  if (type === 'volatility') {
    normalized.volatilityDays = normalizeNumber(rule?.volatilityDays, 5, 1, 60);
    normalized.volatilityThreshold = normalizeNumber(rule?.volatilityThreshold, 10, 0);
  }

  if (type === 'spike') {
    normalized.spikePctThreshold = normalizeNumber(rule?.spikePctThreshold, 2, 0.1);
    normalized.spikeWindowMinutes = normalizeNumber(rule?.spikeWindowMinutes, 5, 1, 120);
    normalized.direction = normalizeDirection(rule?.direction);
  }

  if (type === 'trailing_stop') {
    normalized.trailingStopPct = normalizeNumber(rule?.trailingStopPct, 5, 0.5, 50);
  }

  if (type === 'batch_buy') {
    normalized.batchBuyStartPrice = normalizeNumber(rule?.batchBuyStartPrice, 0, 0);
    normalized.batchBuyEndPrice = normalizeNumber(rule?.batchBuyEndPrice, 0, 0);
    normalized.batchBuyCount = normalizeNumber(rule?.batchBuyCount, 3, 2, 20);
  }

  if (type === 'grid_trading') {
    normalized.gridUpperPrice = normalizeNumber(rule?.gridUpperPrice, 0, 0);
    normalized.gridLowerPrice = normalizeNumber(rule?.gridLowerPrice, 0, 0);
    normalized.gridCount = normalizeNumber(rule?.gridCount, 5, 2, 50);
  }

  return normalized;
}

function normalizeStockConfig(config: Partial<StockAlertConfig> | undefined, fallbackScope: AlertScope): StockAlertConfig | null {
  const code = String(config?.code ?? '').trim();
  if (!code) return null;

  const scope = config?.scope === 'all' || config?.scope === 'special' || config?.scope === 'holding'
    ? config.scope
    : fallbackScope;

  const sourceRules = Array.isArray(config?.rules) ? config!.rules : [];
  const normalizedRules = sourceRules.map((rule) => normalizeRule(rule));

  return {
    code,
    scope,
    rules: normalizedRules,
  };
}

function normalizeAlertConfig(raw: Partial<AlertConfig> | undefined): AlertConfig {
  const scope = raw?.scope === 'all' || raw?.scope === 'special' || raw?.scope === 'holding'
    ? raw.scope
    : DEFAULT_ALERT_CONFIG.scope;

  const stocks = Array.isArray(raw?.stocks)
    ? raw.stocks
      .map((stock) => normalizeStockConfig(stock, scope))
      .filter((item): item is StockAlertConfig => item !== null)
    : [];

  const firedHistory = Array.isArray(raw?.firedHistory)
    ? raw.firedHistory
      .map((item) => {
        const rawPrice = (item as any)?.firedPrice;
        const rawChangePct = (item as any)?.firedChangePct;
        return {
          code: String(item?.code ?? '').trim(),
          ruleId: String(item?.ruleId ?? '').trim(),
          firedAt: normalizeNumber(item?.firedAt, 0, 0),
          firedPrice: Number.isFinite(rawPrice) && (rawPrice as number) >= 0 ? Number(rawPrice) : undefined,
          firedChangePct: Number.isFinite(rawChangePct) ? Number(rawChangePct) : undefined,
        };
      })
      .filter((item) => Boolean(item.code && item.ruleId && item.firedAt > 0))
    : [];

  return {
    globalEnabled: raw?.globalEnabled === true,
    scope,
    stocks,
    firedHistory,
  };
}

// -----------------------------------------------------------
// Persistence
// -----------------------------------------------------------

export async function loadAlertConfig(): Promise<AlertConfig> {
  try {
    const result = await chrome.storage.sync.get(ALERT_STORAGE_KEY);
    const raw = result[ALERT_STORAGE_KEY] as Partial<AlertConfig> | undefined;
    if (!raw) return DEFAULT_ALERT_CONFIG;
    return normalizeAlertConfig(raw);
  } catch {
    return DEFAULT_ALERT_CONFIG;
  }
}

export async function saveAlertConfig(config: AlertConfig): Promise<void> {
  // Strip firedHistory before saving to sync to avoid quota issues
  const normalized = normalizeAlertConfig(config);
  await chrome.storage.sync.set({ [ALERT_STORAGE_KEY]: { ...normalized, firedHistory: [] } });
}

// loadedHistory 存储在 local storage 而非 sync storage 以免超出配额
export async function loadFiredHistory(): Promise<AlertFiredRecord[]> {
  try {
    const result = await chrome.storage.local.get(FIRED_HISTORY_LOCAL_KEY);
    const raw = result[FIRED_HISTORY_LOCAL_KEY];
    if (!Array.isArray(raw)) return [];
    const now = Date.now();
    return raw
      .map((item: unknown) => {
        const i = item as any;
        const rawPrice = i?.firedPrice;
        const rawChangePct = i?.firedChangePct;
        return {
          code: String(i?.code ?? '').trim(),
          ruleId: String(i?.ruleId ?? '').trim(),
          firedAt: normalizeNumber(i?.firedAt, 0, 0),
          firedPrice: Number.isFinite(rawPrice) && (rawPrice as number) >= 0 ? Number(rawPrice) : undefined,
          firedChangePct: Number.isFinite(rawChangePct) ? Number(rawChangePct) : undefined,
        };
      })
      .filter((item) => Boolean(item.code && item.ruleId && item.firedAt > 0 && item.firedAt <= now));
  } catch {
    return [];
  }
}

export async function saveFiredHistory(history: AlertFiredRecord[]): Promise<void> {
  await chrome.storage.local.set({ [FIRED_HISTORY_LOCAL_KEY]: history });
}

// Migration: move firedHistory from sync to local storage (one-time)
export async function migrateFiredHistory(config: AlertConfig): Promise<AlertConfig> {
  const localHistory = await loadFiredHistory();
  // If there's firedHistory in sync but not in local, merge and save to local
  if (config.firedHistory.length > 0 && localHistory.length === 0) {
    await saveFiredHistory(config.firedHistory);
  }
  return { ...config, firedHistory: [] };
}

// -----------------------------------------------------------
// Rule matching
// -----------------------------------------------------------

export type StockSnapshot = {
  code: string;
  name: string;
  price: number;
  prevClose: number;
  changePct: number;
};

export function isInCooldown(firedHistory: AlertFiredRecord[], code: string, ruleId: string, cooldownSec: number): boolean {
  const cutoff = Date.now() - cooldownSec * 1000;
  return firedHistory.some(
    (r) => r.code === code && r.ruleId === ruleId && r.firedAt >= cutoff
  );
}

/** 查找同一 code+ruleId 最近一次触发时的股价，用于判断股价是否有变化 */
function getLastFiredPrice(firedHistory: AlertFiredRecord[], code: string, ruleId: string): number | undefined {
  let last: AlertFiredRecord | undefined;
  for (const r of firedHistory) {
    if (r.code === code && r.ruleId === ruleId && (!last || r.firedAt > last.firedAt)) {
      last = r;
    }
  }
  return last?.firedPrice;
}

function evaluateRule(
  rule: AlertRule,
  snapshot: StockSnapshot,
  firedHistory: AlertFiredRecord[]
): { triggered: boolean; message: string } | null {
  if (!rule.enabled) return null;

  const cooldown = rule.cooldownSeconds ?? 300;
  if (isInCooldown(firedHistory, snapshot.code, rule.id, cooldown)) return null;

  // 对于 price_up / price_down：如果股价跟上一次触发时一样，跳过
  if (rule.type === 'price_up' || rule.type === 'price_down') {
    const lastPrice = getLastFiredPrice(firedHistory, snapshot.code, rule.id);
    if (lastPrice !== undefined && snapshot.price === lastPrice) {
      return null;
    }
  }

  switch (rule.type) {
    case 'price_up':
      if (Number.isFinite(rule.targetPrice) && snapshot.price >= (rule.targetPrice as number)) {
        return {
          triggered: true,
          message: `${snapshot.name}(${snapshot.code}) 股价上涨至 ¥${snapshot.price.toFixed(2)}，已达到目标价 ¥${rule.targetPrice!.toFixed(2)}`,
        };
      }
      break;

    case 'price_down':
      if (Number.isFinite(rule.targetPrice) && snapshot.price <= (rule.targetPrice as number)) {
        return {
          triggered: true,
          message: `${snapshot.name}(${snapshot.code}) 股价下跌至 ¥${snapshot.price.toFixed(2)}，已跌破目标价 ¥${rule.targetPrice!.toFixed(2)}`,
        };
      }
      break;

    case 'change_pct': {
      const threshold = rule.changeThreshold ?? 5;
      const direction = rule.direction ?? 'both';

      const triggered = direction === 'up'
        ? snapshot.changePct >= threshold
        : direction === 'down'
          ? snapshot.changePct <= -threshold
          : Math.abs(snapshot.changePct) >= threshold;

      const hystKey = `change_pct::${snapshot.code}::${rule.id}`;
      const alreadyTriggered = hysteresisTriggered.get(hystKey);

      if (Number.isFinite(snapshot.changePct)) {
        if (triggered) {
          // 阈值被满足
          if (alreadyTriggered) {
            // 本周期内已触发过 → 不再重复告警（迟滞）
            return null;
          }
          // 内存中无记录，再检查持久化的 firedHistory：
          // 如果上次触发的 changePct 与当前一样，说明是 Service Worker 重启后的重复 → 跳过
          let lastRecord: AlertFiredRecord | undefined;
          for (const r of firedHistory) {
            if (r.code === snapshot.code && r.ruleId === rule.id && (!lastRecord || r.firedAt > lastRecord.firedAt)) {
              lastRecord = r;
            }
          }
          if (lastRecord?.firedChangePct !== undefined && Math.abs(lastRecord.firedChangePct - snapshot.changePct) < 0.001) {
            hysteresisTriggered.set(hystKey, true); // 同步到内存，避免次次查存储
            return null;
          }
          // 首次触发 → 记录迟滞状态
          hysteresisTriggered.set(hystKey, true);
          const dirLabel = snapshot.changePct >= 0 ? '上涨' : '下跌';
          const ruleHint = (rule.direction ?? 'both') === 'both'
            ? `波动超过阈值 ${threshold}%`
            : `${(rule.direction ?? 'both') === 'up' ? '涨幅' : '跌幅'}超过阈值 ${threshold}%`;
          return {
            triggered: true,
            message: `${snapshot.name}(${snapshot.code}) 今日${dirLabel} ${snapshot.changePct.toFixed(2)}%，${ruleHint}`,
          };
        } else {
          // 阈值不再满足 → 清除迟滞状态，下次可重新触发
          if (alreadyTriggered) {
            hysteresisTriggered.delete(hystKey);
          }
        }
      }
      break;
    }

    case 'volatility':
    case 'drawdown':
      // Evaluated externally (volatility via intraday data, drawdown via K-line)
      return null;
  }

  return null;
}

/**
 * Migrate per-stock spike rules to global spikeConfig.
 * Scans stocks[].rules for spike rules, extracts parameters from the first one found,
 * removes all spike rules from per-stock rules, and sets spikeConfig.
 * If spikeConfig already exists, only cleans up any lingering per-stock spike rules.
 */
export function migrateSpikeConfig(config: AlertConfig): AlertConfig {
  let spikeConfig = config.spikeConfig ? { ...config.spikeConfig } : null;

  let changed = false;
  const nextStocks = config.stocks.map((stock) => {
    const spikeRules = stock.rules.filter((r) => r.type === 'spike');
    if (spikeRules.length === 0) return stock;

    changed = true;

    // Use first spike rule to seed global config if not set
    if (!spikeConfig) {
      const first = spikeRules[0];
      spikeConfig = {
        enabled: first.enabled !== false,
        pctThreshold: first.spikePctThreshold ?? 2,
        windowMinutes: first.spikeWindowMinutes ?? 5,
        direction: first.direction ?? 'both',
        cooldownSeconds: first.cooldownSeconds ?? 60,
      };
    }

    // Remove all spike rules from this stock
    return { ...stock, rules: stock.rules.filter((r) => r.type !== 'spike') };
  });

  if (!changed && config.spikeConfig) return config;
  if (!spikeConfig) spikeConfig = { ...DEFAULT_SPIKE_CONFIG };

  return {
    ...config,
    spikeConfig,
    stocks: nextStocks,
  };
}

export function checkAlerts(
  config: AlertConfig,
  snapshots: StockSnapshot[],
  firedHistory: AlertFiredRecord[],
  spikeHistory: SpikePriceHistory = {}
): {
  triggered: Array<{ code: string; name: string; message: string; ruleId: string }>;
  spikeHistory: SpikePriceHistory;
} {
  if (!config.globalEnabled) return { triggered: [], spikeHistory };

  const results: Array<{ code: string; name: string; message: string; ruleId: string }> = [];
  const newFired: AlertFiredRecord[] = [];
  const updatedHistory = { ...spikeHistory };

  for (const stockConfig of config.stocks) {
    const snapshot = snapshots.find((s) => s.code === stockConfig.code);
    if (!snapshot) continue;

    for (const rule of stockConfig.rules) {
      if (rule.type === 'spike' && rule.enabled) {
        // Spike evaluation happens in background (needs price history tracking)
        continue;
      }
      if ((rule.type === 'trailing_stop' || rule.type === 'batch_buy' || rule.type === 'grid_trading') && rule.enabled) {
        // Stateful rule evaluation happens in background
        continue;
      }

      const result = evaluateRule(rule, snapshot, [...firedHistory, ...newFired]);
      if (result?.triggered) {
        results.push({
          code: snapshot.code,
          name: snapshot.name,
          message: result.message,
          ruleId: rule.id,
        });
        newFired.push({
          code: snapshot.code,
          ruleId: rule.id,
          firedAt: Date.now(),
          firedPrice: snapshot.price,
          firedChangePct: snapshot.changePct,
        });
      }
    }
  }

  return { triggered: results, spikeHistory: updatedHistory };
}

// -----------------------------------------------------------
// Spike detection — evaluates rapid price movement
// -----------------------------------------------------------

export function evaluateSpikeRule(
  rule: AlertRule,
  code: string,
  name: string,
  price: number,
  history: SpikePriceEntry[],
  firedHistory: AlertFiredRecord[]
): { triggered: boolean; message: string; direction: 'up' | 'down'; ruleId: string } | null {
  if (!rule.enabled || rule.type !== 'spike') return null;
  if (!Number.isFinite(price) || price <= 0) return null;

  const windowMs = (rule.spikeWindowMinutes ?? 5) * 60 * 1000;
  const threshold = rule.spikePctThreshold ?? 2;
  const now = Date.now();
  const expectedDirection = rule.direction ?? 'both';

  // Add current price point
  const newHistory = [...history.filter((e) => now - e.timestamp < windowMs * 2), { price, timestamp: now }];

  // Keep only points in the evaluation window
  const windowEntries = newHistory.filter((e) => now - e.timestamp <= windowMs);
  if (windowEntries.length < 2) return null;

  // 使用窗口极值做基线，减少“同一档位轻微抖动”反复提示
  let minPrice = Number.POSITIVE_INFINITY;
  let maxPrice = Number.NEGATIVE_INFINITY;
  for (const entry of windowEntries) {
    if (!Number.isFinite(entry.price) || entry.price <= 0) continue;
    if (entry.price < minPrice) minPrice = entry.price;
    if (entry.price > maxPrice) maxPrice = entry.price;
  }

  if (!Number.isFinite(minPrice) || !Number.isFinite(maxPrice) || minPrice <= 0 || maxPrice <= 0) {
    return null;
  }

  const upChangePct = ((price - minPrice) / minPrice) * 100;
  const downChangePct = ((price - maxPrice) / maxPrice) * 100;

  const candidates: Array<{ direction: 'up' | 'down'; changePct: number }> = [];
  if (expectedDirection !== 'down' && upChangePct >= threshold) {
    candidates.push({ direction: 'up', changePct: upChangePct });
  }
  if (expectedDirection !== 'up' && Math.abs(downChangePct) >= threshold) {
    candidates.push({ direction: 'down', changePct: downChangePct });
  }

  if (candidates.length === 0) return null;

  const best = candidates.reduce((prev, curr) => (
    Math.abs(curr.changePct) > Math.abs(prev.changePct) ? curr : prev
  ));

  const level = Math.floor(Math.abs(best.changePct) / threshold);
  if (level < 1) return null;

  // 使用 level + direction 作为 ruleId 后缀，让每一档都可独立判定
  const effectiveRuleId = `${rule.id}::${best.direction}::L${level}`;
  const levelSuffix = `::${best.direction}::L${level}`;
  const sameLevelInWindow = firedHistory.some(
    (record) => record.code === code && record.ruleId.endsWith(levelSuffix) && now - record.firedAt <= windowMs
  );
  if (sameLevelInWindow) return null;

  const cooldown = rule.cooldownSeconds ?? 300;
  const sameLevelInCooldown = firedHistory.some(
    (record) => record.code === code && record.ruleId.endsWith(levelSuffix) && now - record.firedAt <= cooldown * 1000
  );
  if (sameLevelInCooldown) return null;

  const label = best.direction === 'up' ? '急速拉升' : '急速打压';
  return {
    triggered: true,
    message: `${name}(${code}) ${label}\n近${rule.spikeWindowMinutes ?? 5}分钟内${best.direction === 'up' ? '上涨' : '下跌'} ${best.changePct >= 0 ? '+' : ''}${best.changePct.toFixed(2)}%，触发第${level}档(${(threshold * level).toFixed(2)}%)，现价 ¥${price.toFixed(2)}`,
    direction: best.direction,
    ruleId: effectiveRuleId,
  };
}

// -----------------------------------------------------------
// Trailing stop rule evaluation
// -----------------------------------------------------------

export function evaluateTrailingStopRule(
  rule: AlertRule,
  snapshot: StockSnapshot,
  state: TrailingStopState,
  firedHistory: AlertFiredRecord[],
): { triggered: boolean; message: string; newState: TrailingStopState } | null {
  if (!rule.enabled || rule.type !== 'trailing_stop') return null;
  if (!Number.isFinite(snapshot.price) || snapshot.price <= 0) return null;

  const pct = rule.trailingStopPct ?? 5;
  const stateKey = `${snapshot.code}_${rule.id}`;
  const current = state[stateKey];
  const prevPeak = current?.peakPrice ?? snapshot.price;
  const newPeak = Math.max(prevPeak, snapshot.price);
  const newState: TrailingStopState = { ...state, [stateKey]: { peakPrice: newPeak } };

  // First observation — no trigger, just record peak
  if (!current) {
    return { triggered: false, message: '', newState };
  }

  const dropPct = newPeak > 0 ? ((newPeak - snapshot.price) / newPeak) * 100 : 0;
  if (dropPct >= pct) {
    return {
      triggered: true,
      message: `${snapshot.name}(${snapshot.code}) 移动止盈触发：峰值 ¥${newPeak.toFixed(2)}，现价 ¥${snapshot.price.toFixed(2)}，回落 ${dropPct.toFixed(2)}%（阈值 ${pct}%）`,
      newState,
    };
  }

  return { triggered: false, message: '', newState };
}

// -----------------------------------------------------------
// Batch buy rule evaluation
// -----------------------------------------------------------

export function evaluateBatchBuyRule(
  rule: AlertRule,
  snapshot: StockSnapshot,
  state: BatchBuyState,
  firedHistory: AlertFiredRecord[],
): { triggered: boolean; message: string; newState: BatchBuyState } | null {
  if (!rule.enabled || rule.type !== 'batch_buy') return null;
  if (!Number.isFinite(snapshot.price) || snapshot.price <= 0) return null;

  const stateKey = `${snapshot.code}_${rule.id}`;
  const existing = state[stateKey];
  const alreadyTriggered = new Set(existing?.triggeredLevels ?? []);

  // Compute price levels from range mode
  const start = rule.batchBuyStartPrice ?? 0;
  const end = rule.batchBuyEndPrice ?? 0;
  const count = rule.batchBuyCount ?? 3;
  if (start <= 0 || end <= 0 || count < 2 || end <= start) {
    return { triggered: false, message: '', newState: state };
  }
  const step = (end - start) / (count - 1);
  const targets = Array.from({ length: count }, (_, i) => start + step * i);

  const newTriggered = [...(existing?.triggeredLevels ?? [])];
  let triggeredThisRun = false;

  for (const level of targets) {
    if (alreadyTriggered.has(level)) continue;
    if (snapshot.price <= level) {
      newTriggered.push(level);
      triggeredThisRun = true;
      break; // one level per run
    }
  }

  if (triggeredThisRun) {
    return {
      triggered: true,
      message: `${snapshot.name}(${snapshot.code}) 分批买入信号：价格 ¥${snapshot.price.toFixed(2)} 触及买入位 ¥${targets[newTriggered.length - 1].toFixed(2)}（已触发 ${newTriggered.length}/${targets.length} 档）`,
      newState: { ...state, [stateKey]: { triggeredLevels: newTriggered } },
    };
  }

  return { triggered: false, message: '', newState: state };
}

// -----------------------------------------------------------
// Grid trading rule evaluation
// -----------------------------------------------------------

export function evaluateGridRule(
  rule: AlertRule,
  snapshot: StockSnapshot,
  state: GridState,
  firedHistory: AlertFiredRecord[],
): { triggered: boolean; message: string; newState: GridState } | null {
  if (!rule.enabled || rule.type !== 'grid_trading') return null;
  if (!Number.isFinite(snapshot.price) || snapshot.price <= 0) return null;

  const upper = rule.gridUpperPrice ?? 0;
  const lower = rule.gridLowerPrice ?? 0;
  const count = rule.gridCount ?? 5;
  if (upper <= lower || count < 2) return null;

  // Compute grid lines
  const gridLines = Array.from({ length: count }, (_, i) => lower + (upper - lower) * (i / (count - 1)));

  // Determine current grid position: index of the highest grid line ≤ price, or -1 / count-1 for extremes
  let currentIndex = -1;
  for (let i = 0; i < gridLines.length; i++) {
    if (snapshot.price >= gridLines[i]) currentIndex = i;
  }

  const stateKey = `${snapshot.code}_${rule.id}`;
  const lastGridIndex = state[stateKey]?.lastGridIndex ?? null;

  if (lastGridIndex === null) {
    // First observation — initialize state only
    return {
      triggered: false,
      message: '',
      newState: { ...state, [stateKey]: { lastGridIndex: currentIndex } },
    };
  }

  if (currentIndex === lastGridIndex) {
    // No grid line crossed
    return {
      triggered: false,
      message: '',
      newState: { ...state, [stateKey]: { lastGridIndex: currentIndex } },
    };
  }

  // Grid line crossed — generate signal
  const direction = currentIndex > lastGridIndex ? 'up' : 'down';
  const signal = direction === 'up' ? '卖出' : '买入';
  const crossedLine = gridLines[Math.max(0, Math.min(currentIndex, lastGridIndex))];

  return {
    triggered: true,
    message: `${snapshot.name}(${snapshot.code}) 网格交易信号：价格 ${direction === 'up' ? '上涨突破' : '下跌跌破'} ${crossedLine.toFixed(2)}，现价 ¥${snapshot.price.toFixed(2)}，${signal}信号（网格 ${currentIndex + 1}/${count}）`,
    newState: { ...state, [stateKey]: { lastGridIndex: currentIndex } },
  };
}

// -----------------------------------------------------------
// Helpers
// -----------------------------------------------------------

export function genRuleId(): string {
  return `r_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createAlertRule(type: AlertRuleType): AlertRule {
  if (type === 'price_up' || type === 'price_down') {
    return {
      id: genRuleId(),
      type,
      enabled: true,
      targetPrice: 0,
      cooldownSeconds: 300,
    };
  }

  if (type === 'change_pct') {
    return {
      id: genRuleId(),
      type,
      enabled: true,
      changeThreshold: 5,
      direction: 'both',
      cooldownSeconds: 300,
    };
  }

  if (type === 'volatility') {
    return {
      id: genRuleId(),
      type,
      enabled: true,
      volatilityDays: 5,
      volatilityThreshold: 10,
      cooldownSeconds: 600,
    };
  }

  if (type === 'drawdown') {
    return {
      id: genRuleId(),
      type,
      enabled: true,
      drawdownThreshold: 20,
      cooldownSeconds: 86400, // 24 hours — evaluated once per day
    };
  }

  if (type === 'trailing_stop') {
    return {
      id: genRuleId(),
      type,
      enabled: true,
      trailingStopPct: 5,
      cooldownSeconds: 300,
    };
  }

  if (type === 'batch_buy') {
    return {
      id: genRuleId(),
      type,
      enabled: true,
      batchBuyStartPrice: 0,
      batchBuyEndPrice: 0,
      batchBuyCount: 3,
      cooldownSeconds: 86400, // once per level per day
    };
  }

  if (type === 'grid_trading') {
    return {
      id: genRuleId(),
      type,
      enabled: true,
      gridUpperPrice: 0,
      gridLowerPrice: 0,
      gridCount: 5,
      cooldownSeconds: 300,
    };
  }

  return {
    id: genRuleId(),
    type: 'spike',
    enabled: true,
    spikePctThreshold: 2,
    spikeWindowMinutes: 5,
    direction: 'both',
    cooldownSeconds: 300,
  };
}

// Clean old fired records (older than 24 hours)
export function pruneFiredHistory(history: AlertFiredRecord[]): AlertFiredRecord[] {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  return history.filter((r) => r.firedAt >= cutoff);
}

// -----------------------------------------------------------
// Notification history
// -----------------------------------------------------------

export const NOTIFICATION_HISTORY_KEY = 'notificationHistory';

export type NotificationRecord = {
  id: string;
  code: string;
  name: string;
  message: string;
  ruleType: AlertRuleType;
  price: number;
  changePct: number;
  firedAt: number;
  read: boolean;
};

export function pruneNotificationHistory(
  history: NotificationRecord[],
  keepHours = 24
): NotificationRecord[] {
  const cutoff = Date.now() - keepHours * 60 * 60 * 1000;
  return history.filter((r) => r.firedAt >= cutoff);
}
