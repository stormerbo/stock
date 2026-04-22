// -----------------------------------------------------------
// Alert configuration types and evaluation logic
// -----------------------------------------------------------

export type AlertScope = 'all' | 'special' | 'holding';
export type AlertDirection = 'up' | 'down' | 'both';

export type AlertRuleType = 'price_up' | 'price_down' | 'change_pct' | 'volatility' | 'spike';

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
};

export type SpikePriceEntry = {
  price: number;
  timestamp: number; // ms
};

export type SpikePriceHistory = Record<string, SpikePriceEntry[]>;

export type AlertConfig = {
  globalEnabled: boolean;
  scope: AlertScope;
  stocks: StockAlertConfig[];
  firedHistory: AlertFiredRecord[];
};

export const DEFAULT_ALERT_CONFIG: AlertConfig = {
  globalEnabled: false,
  scope: 'holding',
  stocks: [],
  firedHistory: [],
};

const ALERT_STORAGE_KEY = 'alertConfig';

const VALID_RULE_TYPES: AlertRuleType[] = ['price_up', 'price_down', 'change_pct', 'volatility', 'spike'];

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
      .map((item) => ({
        code: String(item?.code ?? '').trim(),
        ruleId: String(item?.ruleId ?? '').trim(),
        firedAt: normalizeNumber(item?.firedAt, 0, 0),
      }))
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
  await chrome.storage.sync.set({ [ALERT_STORAGE_KEY]: normalizeAlertConfig(config) });
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

function isInCooldown(firedHistory: AlertFiredRecord[], code: string, ruleId: string, cooldownSec: number): boolean {
  const cutoff = Date.now() - cooldownSec * 1000;
  return firedHistory.some(
    (r) => r.code === code && r.ruleId === ruleId && r.firedAt >= cutoff
  );
}

function evaluateRule(
  rule: AlertRule,
  snapshot: StockSnapshot,
  firedHistory: AlertFiredRecord[]
): { triggered: boolean; message: string } | null {
  if (!rule.enabled) return null;

  const cooldown = rule.cooldownSeconds ?? 300;
  if (isInCooldown(firedHistory, snapshot.code, rule.id, cooldown)) return null;

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

      if (Number.isFinite(snapshot.changePct) && triggered) {
        const direction = snapshot.changePct >= 0 ? '上涨' : '下跌';
        const ruleHint = (rule.direction ?? 'both') === 'both'
          ? `波动超过阈值 ${threshold}%`
          : `${(rule.direction ?? 'both') === 'up' ? '涨幅' : '跌幅'}超过阈值 ${threshold}%`;
        return {
          triggered: true,
          message: `${snapshot.name}(${snapshot.code}) 今日${direction} ${snapshot.changePct.toFixed(2)}%，${ruleHint}`,
        };
      }
      break;
    }

    case 'volatility': {
      const days = rule.volatilityDays ?? 5;
      const threshold = rule.volatilityThreshold ?? 10;
      // Volatility is evaluated externally with historical data
      // This rule type requires a separate evaluation path
      return null;
    }
  }

  return null;
}

// Evaluate volatility rule — needs intraday or multi-day price range
export function evaluateVolatilityRule(
  rule: AlertRule,
  code: string,
  name: string,
  highPrices: number[],
  lowPrices: number[],
  firedHistory: AlertFiredRecord[]
): { triggered: boolean; message: string } | null {
  if (!rule.enabled || rule.type !== 'volatility') return null;

  const cooldown = rule.cooldownSeconds ?? 600;
  if (isInCooldown(firedHistory, code, rule.id, cooldown)) return null;

  const days = rule.volatilityDays ?? 5;
  const threshold = rule.volatilityThreshold ?? 10;

  if (highPrices.length < 2 || lowPrices.length < 2) return null;

  // Calculate max daily amplitude over the lookback window
  const amplitudes: number[] = [];
  for (let i = 0; i < Math.min(days, highPrices.length); i++) {
    const h = highPrices[i];
    const l = lowPrices[i];
    if (Number.isFinite(h) && Number.isFinite(l) && l > 0) {
      amplitudes.push(((h - l) / l) * 100);
    }
  }

  if (amplitudes.length === 0) return null;

  const maxAmplitude = Math.max(...amplitudes);
  if (maxAmplitude >= threshold) {
    return {
      triggered: true,
      message: `${name}(${code}) 近${days}日最大振幅 ${maxAmplitude.toFixed(2)}%，超过阈值 ${threshold}%，注意风险`,
    };
  }

  return null;
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
): { triggered: boolean; message: string; direction: 'up' | 'down' } | null {
  if (!rule.enabled || rule.type !== 'spike') return null;

  const cooldown = rule.cooldownSeconds ?? 300;
  if (isInCooldown(firedHistory, code, rule.id, cooldown)) return null;

  const windowMs = (rule.spikeWindowMinutes ?? 5) * 60 * 1000;
  const threshold = rule.spikePctThreshold ?? 2;
  const now = Date.now();
  const expectedDirection = rule.direction ?? 'both';

  // Add current price point
  const newHistory = [...history.filter((e) => now - e.timestamp < windowMs * 2), { price, timestamp: now }];

  // Find baseline: earliest price within the window
  const windowEntries = newHistory.filter((e) => now - e.timestamp <= windowMs);
  if (windowEntries.length < 2) return { triggered: false, message: '', direction: 'up' };

  const baseline = windowEntries[0];
  const changePct = ((price - baseline.price) / baseline.price) * 100;

  if (Math.abs(changePct) >= threshold) {
    const direction = changePct >= 0 ? 'up' : 'down';
    if (expectedDirection !== 'both' && direction !== expectedDirection) {
      return null;
    }
    const arrow = direction === 'up' ? '🚀' : '📉';
    const label = direction === 'up' ? '急速拉升' : '急速打压';
    return {
      triggered: true,
      message: `${name}(${code}) ${label}\n近${rule.spikeWindowMinutes ?? 5}分钟内${direction === 'up' ? '上涨' : '下跌'} ${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%，现价 ¥${price.toFixed(2)}`,
      direction,
    };
  }

  return null;
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
