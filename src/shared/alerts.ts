// -----------------------------------------------------------
// Alert configuration types and evaluation logic
// -----------------------------------------------------------

export type AlertScope = 'all' | 'special' | 'holding';

export type AlertRuleType = 'price_up' | 'price_down' | 'change_pct' | 'volatility';

export type AlertRule = {
  id: string;
  type: AlertRuleType;
  enabled: boolean;
  // price_up / price_down
  targetPrice?: number;
  // change_pct — threshold in percentage (e.g. 5 means 5%)
  changeThreshold?: number;
  // volatility — lookback days + threshold
  volatilityDays?: number;
  volatilityThreshold?: number;
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

// -----------------------------------------------------------
// Persistence
// -----------------------------------------------------------

export async function loadAlertConfig(): Promise<AlertConfig> {
  try {
    const result = await chrome.storage.sync.get(ALERT_STORAGE_KEY);
    const raw = result[ALERT_STORAGE_KEY] as AlertConfig | undefined;
    if (!raw) return DEFAULT_ALERT_CONFIG;
    return {
      ...DEFAULT_ALERT_CONFIG,
      ...raw,
      stocks: raw.stocks ?? [],
      firedHistory: raw.firedHistory ?? [],
    };
  } catch {
    return DEFAULT_ALERT_CONFIG;
  }
}

export async function saveAlertConfig(config: AlertConfig): Promise<void> {
  await chrome.storage.sync.set({ [ALERT_STORAGE_KEY]: config });
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
      const absChange = Math.abs(snapshot.changePct);
      if (Number.isFinite(absChange) && absChange >= threshold) {
        const direction = snapshot.changePct >= 0 ? '上涨' : '下跌';
        return {
          triggered: true,
          message: `${snapshot.name}(${snapshot.code}) 今日${direction} ${snapshot.changePct.toFixed(2)}%，波动超过阈值 ${threshold}%`,
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
  firedHistory: AlertFiredRecord[]
): Array<{ code: string; name: string; message: string }> {
  if (!config.globalEnabled) return [];

  const results: Array<{ code: string; name: string; message: string }> = [];
  const newFired: AlertFiredRecord[] = [];

  for (const stockConfig of config.stocks) {
    const snapshot = snapshots.find((s) => s.code === stockConfig.code);
    if (!snapshot) continue;

    for (const rule of stockConfig.rules) {
      const result = evaluateRule(rule, snapshot, [...firedHistory, ...newFired]);
      if (result?.triggered) {
        results.push({
          code: snapshot.code,
          name: snapshot.name,
          message: result.message,
        });
        newFired.push({
          code: snapshot.code,
          ruleId: rule.id,
          firedAt: Date.now(),
        });
      }
    }
  }

  return results;
}

// -----------------------------------------------------------
// Helpers
// -----------------------------------------------------------

export function genRuleId(): string {
  return `r_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// Clean old fired records (older than 24 hours)
export function pruneFiredHistory(history: AlertFiredRecord[]): AlertFiredRecord[] {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  return history.filter((r) => r.firedAt >= cutoff);
}
