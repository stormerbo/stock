import { useCallback, useEffect, useState } from 'react';
import type { BadgeConfig, BadgeMode } from '../background';
import {
  loadAlertConfig,
  saveAlertConfig,
  createAlertRule,
  DEFAULT_ALERT_CONFIG,
  type AlertConfig,
  type AlertRule,
  type StockAlertConfig,
  type AlertRuleType,
  type AlertDirection,
  type AlertScope,
} from '../shared/alerts';

const BADGE_STORAGE_KEY = 'badgeConfig';
const DISPLAY_STORAGE_KEY = 'displayConfig';
const REFRESH_STORAGE_KEY = 'refreshConfig';
const WORK_MODE_STORAGE_KEY = 'workModeConfig';

type WorkModeConfig = {
  enabled: boolean;
  startTime: string;
  endTime: string;
};

const DEFAULT_WORK_MODE: WorkModeConfig = {
  enabled: false,
  startTime: '09:00',
  endTime: '18:00',
};

const BADGE_LABELS: Record<BadgeMode, string> = {
  stockCount: '持仓股数',
  stockMarket: '股票市值',
  stockFloatingPnl: '浮动盈亏',
  stockDailyPnl: '当日盈亏',
  fundCount: '持仓基金数',
  fundAmount: '持有总额',
  fundHoldingProfit: '持有收益',
  fundEstimatedProfit: '估算收益',
  off: '关闭角标',
};

type ColorScheme = 'cn' | 'us';

type DisplayConfig = {
  colorScheme: ColorScheme;
  decimalPlaces: number;
};

type RefreshConfig = {
  stockRefreshSeconds: number;
  fundRefreshSeconds: number;
  indexRefreshSeconds: number;
  marketStatsRefreshSeconds: number;
};

const DEFAULT_DISPLAY: DisplayConfig = { colorScheme: 'cn', decimalPlaces: 2 };
const DEFAULT_REFRESH: RefreshConfig = { stockRefreshSeconds: 15, fundRefreshSeconds: 60, indexRefreshSeconds: 30, marketStatsRefreshSeconds: 30 };

const RULE_TYPE_LABELS: Record<AlertRuleType, string> = {
  price_up: '涨破目标价',
  price_down: '跌破目标价',
  change_pct: '涨跌幅波动',
  volatility: '振幅波动',
  spike: '急速异动',
};

const ALERT_DIRECTION_OPTIONS: Array<{ value: AlertDirection; label: string }> = [
  { value: 'both', label: '双向' },
  { value: 'up', label: '仅上涨' },
  { value: 'down', label: '仅下跌' },
];

const COLOR_SCHEME_OPTIONS: Array<{ value: ColorScheme; label: string }> = [
  { value: 'cn', label: '红涨绿跌（A 股）' },
  { value: 'us', label: '绿涨红跌（美股）' },
];

// -----------------------------------------------------------
// Stock Alert Editor Sub-component
// -----------------------------------------------------------

type StockAlertEditorProps = {
  config: StockAlertConfig;
  stockName: string;
  onUpdate: (updated: StockAlertConfig) => void;
  onRemove: () => void;
};

function StockAlertEditor({ config, stockName, onUpdate, onRemove }: StockAlertEditorProps) {
  const [expanded, setExpanded] = useState(true);

  const updateRule = (ri: number, updater: (rule: AlertRule) => AlertRule) => {
    const rules = [...config.rules];
    const current = rules[ri];
    if (!current) return;
    rules[ri] = updater(current);
    onUpdate({ ...config, rules });
  };

  const removeRule = (ri: number) => {
    const nextRules = config.rules.filter((_, index) => index !== ri);
    onUpdate({ ...config, rules: nextRules });
  };

  return (
    <div className="alert-stock-card">
      <div className="alert-stock-header">
        <button
          type="button"
          className="alert-stock-name-btn"
          onClick={() => setExpanded(!expanded)}
        >
          <span className={`alert-expand-arrow ${expanded ? 'open' : ''}`}>▸</span>
          <span className="alert-stock-name">{stockName}</span>
          <span className="alert-stock-code">{config.code}</span>
        </button>
        <div className="alert-header-actions">
          <span className={`alert-badge ${config.rules.some(r => r.enabled) ? 'active' : ''}`}>
            {config.rules.filter(r => r.enabled).length} 条规则
          </span>
          <button type="button" className="btn-small danger" onClick={onRemove}>
            移除
          </button>
        </div>
      </div>

      {expanded && (
        <div className="alert-rules-list">
          {config.rules.map((rule, ri) => (
            <div key={rule.id} className="alert-rule-row">
              <label className="alert-rule-toggle">
                <input
                  type="checkbox"
                  checked={rule.enabled}
                  onChange={(e) => updateRule(ri, (prev) => ({ ...prev, enabled: e.target.checked }))}
                />
                <span>{RULE_TYPE_LABELS[rule.type]}</span>
              </label>

              {(rule.type === 'price_up' || rule.type === 'price_down') && (
                <div className="alert-rule-inputs">
                  <input
                    type="number"
                    className="number-input small"
                    value={rule.targetPrice ?? ''}
                    placeholder="目标价"
                    onChange={(e) => updateRule(ri, (prev) => ({ ...prev, targetPrice: Number(e.target.value) || 0 }))}
                  />
                  <span>元</span>
                </div>
              )}

              {rule.type === 'change_pct' && (
                <div className="alert-rule-inputs">
                  <input
                    type="number"
                    className="number-input small"
                    value={rule.changeThreshold ?? ''}
                    placeholder="阈值"
                    min={0}
                    max={100}
                    onChange={(e) => updateRule(ri, (prev) => ({ ...prev, changeThreshold: Number(e.target.value) || 0 }))}
                  />
                  <span>%</span>
                  <select
                    className="number-input small"
                    value={rule.direction ?? 'both'}
                    onChange={(e) => updateRule(ri, (prev) => ({ ...prev, direction: e.target.value as AlertDirection }))}
                  >
                    {ALERT_DIRECTION_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
              )}

              {rule.type === 'spike' && (
                <div className="alert-rule-inputs">
                  <input
                    type="number"
                    className="number-input small"
                    value={rule.spikePctThreshold ?? ''}
                    placeholder="幅度"
                    min={0.5}
                    max={10}
                    step={0.5}
                    onChange={(e) => updateRule(ri, (prev) => ({ ...prev, spikePctThreshold: Number(e.target.value) || 0 }))}
                  />
                  <span>%</span>
                  <span style={{ color: 'var(--text-1)', margin: '0 4px' }}>·</span>
                  <input
                    type="number"
                    className="number-input small"
                    value={rule.spikeWindowMinutes ?? ''}
                    placeholder="窗口"
                    min={1}
                    max={30}
                    onChange={(e) => updateRule(ri, (prev) => ({ ...prev, spikeWindowMinutes: Number(e.target.value) || 1 }))}
                  />
                  <span>分钟</span>
                  <select
                    className="number-input small"
                    value={rule.direction ?? 'both'}
                    onChange={(e) => updateRule(ri, (prev) => ({ ...prev, direction: e.target.value as AlertDirection }))}
                  >
                    {ALERT_DIRECTION_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
              )}

              {rule.type === 'volatility' && (
                <div className="alert-rule-inputs">
                  <input
                    type="number"
                    className="number-input small"
                    value={rule.volatilityDays ?? ''}
                    placeholder="天数"
                    min={1}
                    max={60}
                    onChange={(e) => updateRule(ri, (prev) => ({ ...prev, volatilityDays: Number(e.target.value) || 1 }))}
                  />
                  <span>天</span>
                  <span style={{ color: 'var(--text-1)', margin: '0 4px' }}>·</span>
                  <input
                    type="number"
                    className="number-input small"
                    value={rule.volatilityThreshold ?? ''}
                    placeholder="阈值"
                    min={0.1}
                    max={40}
                    step={0.1}
                    onChange={(e) => updateRule(ri, (prev) => ({ ...prev, volatilityThreshold: Number(e.target.value) || 0 }))}
                  />
                  <span>%</span>
                </div>
              )}

              <div className="alert-rule-cooldown">
                <span>冷却</span>
                <input
                  type="number"
                  className="number-input tiny"
                  value={rule.cooldownSeconds ?? 300}
                  min={60}
                  max={3600}
                  onChange={(e) => updateRule(ri, (prev) => ({ ...prev, cooldownSeconds: Number(e.target.value) || 300 }))}
                />
                <span>秒</span>
              </div>

              <button type="button" className="btn-tiny danger" onClick={() => removeRule(ri)}>
                删除规则
              </button>
            </div>
          ))}

          {/* Add rule button */}
          <div className="alert-add-rule">
            {(['price_up', 'price_down', 'change_pct', 'spike', 'volatility'] as AlertRuleType[]).map((type) => (
              <button
                key={type}
                type="button"
                className="btn-tiny"
                onClick={() => {
                  onUpdate({ ...config, rules: [...config.rules, createAlertRule(type)] });
                }}
              >
                + {RULE_TYPE_LABELS[type]}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function saveStorageItem<T>(key: string, value: T): Promise<void> {
  if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
    return chrome.storage.sync.set({ [key]: value }).then();
  }
  localStorage.setItem(key, JSON.stringify(value));
  return Promise.resolve();
}

// -----------------------------------------------------------
// Test notification
// -----------------------------------------------------------

function sendTestNotification() {
  if (typeof chrome?.runtime?.sendMessage !== 'function') return;
  chrome.runtime.sendMessage({
    type: 'test-notification',
    data: {
      code: '600519',
      name: '贵州茅台',
      message: '贵州茅台(600519) 急速拉升\n近5分钟内上涨 +2.50%，现价 ¥1750.00',
      ruleType: 'spike',
      price: 1750.00,
      changePct: 2.5,
    },
  });
}

// -----------------------------------------------------------
// Main App
// -----------------------------------------------------------

export default function App() {
  // ---- Badge (click-to-apply, auto-save) ----
  const [badgeConfig, setBadgeConfig] = useState<BadgeConfig>({ enabled: true, mode: 'stockCount' });

  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
      chrome.storage.sync.get(BADGE_STORAGE_KEY, (result: Record<string, unknown>) => {
        const config = result[BADGE_STORAGE_KEY] as BadgeConfig | undefined;
        setBadgeConfig(config || { enabled: true, mode: 'stockCount' });
      });
    } else {
      try {
        const raw = localStorage.getItem(BADGE_STORAGE_KEY);
        setBadgeConfig(raw ? JSON.parse(raw) : { enabled: true, mode: 'stockCount' });
      } catch {
        setBadgeConfig({ enabled: true, mode: 'stockCount' });
      }
    }
  }, []);

  const updateBadge = useCallback((mode: BadgeMode) => {
    const next: BadgeConfig = { enabled: mode !== 'off', mode };
    setBadgeConfig(next);
    void saveStorageItem(BADGE_STORAGE_KEY, next);
  }, []);

  // ---- Display (manual save) ----
  const [displayConfig, setDisplayConfig] = useState<DisplayConfig>(DEFAULT_DISPLAY);
  const [displayDraft, setDisplayDraft] = useState<DisplayConfig>(DEFAULT_DISPLAY);

  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
      chrome.storage.sync.get(DISPLAY_STORAGE_KEY, (result: Record<string, unknown>) => {
        const config = result[DISPLAY_STORAGE_KEY] as DisplayConfig | undefined;
        const resolved = config || DEFAULT_DISPLAY;
        setDisplayConfig(resolved);
        setDisplayDraft(resolved);
      });
    } else {
      try {
        const raw = localStorage.getItem(DISPLAY_STORAGE_KEY);
        const resolved = raw ? JSON.parse(raw) : DEFAULT_DISPLAY;
        setDisplayConfig(resolved);
        setDisplayDraft(resolved);
      } catch {
        setDisplayConfig(DEFAULT_DISPLAY);
        setDisplayDraft(DEFAULT_DISPLAY);
      }
    }
  }, []);

  // ---- Refresh (manual save) ----
  const [refreshConfig, setRefreshConfig] = useState<RefreshConfig>(DEFAULT_REFRESH);
  const [refreshDraft, setRefreshDraft] = useState<RefreshConfig>(DEFAULT_REFRESH);

  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
      chrome.storage.sync.get(REFRESH_STORAGE_KEY, (result: Record<string, unknown>) => {
        const config = result[REFRESH_STORAGE_KEY] as RefreshConfig | undefined;
        const resolved = config || DEFAULT_REFRESH;
        setRefreshConfig(resolved);
        setRefreshDraft(resolved);
      });
    } else {
      try {
        const raw = localStorage.getItem(REFRESH_STORAGE_KEY);
        const resolved = raw ? JSON.parse(raw) : DEFAULT_REFRESH;
        setRefreshConfig(resolved);
        setRefreshDraft(resolved);
      } catch {
        setRefreshConfig(DEFAULT_REFRESH);
        setRefreshDraft(DEFAULT_REFRESH);
      }
    }
  }, []);

  const displayDirty = JSON.stringify(displayDraft) !== JSON.stringify(displayConfig);
  const refreshDirty = JSON.stringify(refreshDraft) !== JSON.stringify(refreshConfig);

  // ---- Save ----
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // ---- Theme ----
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('popup-theme');
    return saved === 'light' || saved === 'dark' ? saved : 'dark';
  });

  useEffect(() => {
    document.body.classList.toggle('theme-light', theme === 'light');
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem('popup-theme', next);
      document.body.classList.toggle('theme-light', next === 'light');
      return next;
    });
  }, []);

  // ---- Work Mode Config ----
  const [workModeConfig, setWorkModeConfig] = useState<WorkModeConfig>(DEFAULT_WORK_MODE);
  const [workModeDraft, setWorkModeDraft] = useState<WorkModeConfig>(DEFAULT_WORK_MODE);

  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
      chrome.storage.sync.get(WORK_MODE_STORAGE_KEY, (result: Record<string, unknown>) => {
        const config = result[WORK_MODE_STORAGE_KEY] as WorkModeConfig | undefined;
        const resolved = config || DEFAULT_WORK_MODE;
        setWorkModeConfig(resolved);
        setWorkModeDraft(resolved);
      });
    } else {
      try {
        const raw = localStorage.getItem(WORK_MODE_STORAGE_KEY);
        const resolved = raw ? JSON.parse(raw) : DEFAULT_WORK_MODE;
        setWorkModeConfig(resolved);
        setWorkModeDraft(resolved);
      } catch {
        setWorkModeConfig(DEFAULT_WORK_MODE);
        setWorkModeDraft(DEFAULT_WORK_MODE);
      }
    }
  }, []);

  const workModeDirty = JSON.stringify(workModeDraft) !== JSON.stringify(workModeConfig);

  // ---- Save ----
  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await Promise.all([
        saveStorageItem(DISPLAY_STORAGE_KEY, displayDraft),
        saveStorageItem(REFRESH_STORAGE_KEY, refreshDraft),
        saveStorageItem(WORK_MODE_STORAGE_KEY, workModeDraft),
      ]);
      setDisplayConfig(displayDraft);
      setRefreshConfig(refreshDraft);
      setWorkModeConfig(workModeDraft);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }, [displayDraft, refreshDraft, workModeDraft]);

  const handleReset = useCallback(() => {
    setDisplayDraft(displayConfig);
    setRefreshDraft(refreshConfig);
    setWorkModeDraft(workModeConfig);
  }, [displayConfig, refreshConfig, workModeConfig]);

  // ---- Load stock holdings (all stocks, with name resolution) ----
  const [allStocks, setAllStocks] = useState<Array<{ code: string; name: string; shares: number; special: boolean }>>([]);

  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
      chrome.storage.sync.get(['stockHoldings'], (result: Record<string, unknown>) => {
        const holdings = (Array.isArray(result.stockHoldings) ? result.stockHoldings : []) as Array<{ code: string; name?: string; shares: number; special?: boolean }>;
        chrome.storage.local.get(['stockPositions'], (posResult: Record<string, unknown>) => {
          const positions = (Array.isArray(posResult.stockPositions) ? posResult.stockPositions : []) as Array<{ code: string; name: string }>;
          const posMap = new Map(positions.map(p => [p.code, p.name]));
          setAllStocks(holdings.map(h => ({
            code: h.code,
            name: posMap.get(h.code) || h.name || h.code,
            shares: h.shares || 0,
            special: h.special || false,
          })));
        });
      });
    }
  }, []);

  // ---- Alert Config ----
  const [alertConfig, setAlertConfig] = useState<AlertConfig>(DEFAULT_ALERT_CONFIG);
  const [alertDraft, setAlertDraft] = useState<AlertConfig>(DEFAULT_ALERT_CONFIG);

  useEffect(() => {
    loadAlertConfig().then((config) => {
      setAlertConfig(config);
      setAlertDraft(JSON.parse(JSON.stringify(config)));
    });
  }, []);

  const filteredStocks = allStocks.filter((h) => {
    if (alertDraft.scope === 'special') return h.special;
    if (alertDraft.scope === 'holding') return h.shares > 0;
    return true;
  });

  // Manually added stocks (in alertDraft but not in allStocks)
  const manualStocks = alertDraft.stocks
    .filter((s) => !allStocks.some((h) => h.code === s.code))
    .map((s) => ({ code: s.code, name: s.code, shares: 0, special: false }));

  const [newStockCode, setNewStockCode] = useState('');

  const createDefaultStockAlertConfig = useCallback((code: string, scope: AlertScope): StockAlertConfig => ({
    code,
    scope,
    rules: [
      createAlertRule('price_up'),
      createAlertRule('price_down'),
      createAlertRule('change_pct'),
    ],
  }), []);

  const handleAddStockCode = () => {
    const code = newStockCode.trim().replace(/^((sh|sz))/i, '');
    if (!/^\d{6}$/.test(code)) {
      setNewStockCode('');
      return;
    }
    const exists = filteredStocks.some((s) => s.code === code) || manualStocks.some((s) => s.code === code);
    if (exists) {
      setNewStockCode('');
      return;
    }
    const newConfig = createDefaultStockAlertConfig(code, alertDraft.scope);
    setAlertDraft((prev) => ({ ...prev, stocks: [...prev.stocks, newConfig] }));
    setNewStockCode('');
  };

  const handleSaveAlerts = useCallback(async () => {
    setSaving(true);
    try {
      await saveAlertConfig(alertDraft);
      setAlertConfig(alertDraft);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }, [alertDraft]);

  const alertDirty = JSON.stringify(alertDraft) !== JSON.stringify(alertConfig);
  const hasUnsaved = displayDirty || refreshDirty || alertDirty || workModeDirty;

  return (
    <div className="options-root">
      <div className="options-container">
        <header className="options-header">
          <h1>配置中心</h1>
          <p className="desc">角标设置即时生效，其余配置需手动保存</p>
          <button type="button" className="theme-btn" onClick={toggleTheme}>
            {theme === 'dark' ? '🌞 浅色' : '🌙 深色'}
          </button>
        </header>

        {/* ---- 角标设置 ---- */}
        <section className="options-section">
          <h2>角标设置 <span className="badge-tag">即时生效</span></h2>
          <div className="config-card">
            <div className="badge-compact-group">
              <span className="badge-group-title">股票</span>
              <div className="badge-compact-row">
                {(['stockCount', 'stockMarket', 'stockFloatingPnl', 'stockDailyPnl'] as const).map((mode) => (
                  <label key={mode} className={`badge-compact-item ${badgeConfig.mode === mode ? 'active' : ''}`}>
                    <input
                      type="radio"
                      name="badge-mode"
                      value={mode}
                      checked={badgeConfig.mode === mode}
                      onChange={() => updateBadge(mode)}
                    />
                    <span>{BADGE_LABELS[mode]}</span>
                  </label>
                ))}
              </div>
              <span className="badge-group-title">基金</span>
              <div className="badge-compact-row">
                {(['fundCount', 'fundAmount', 'fundHoldingProfit', 'fundEstimatedProfit'] as const).map((mode) => (
                  <label key={mode} className={`badge-compact-item ${badgeConfig.mode === mode ? 'active' : ''}`}>
                    <input
                      type="radio"
                      name="badge-mode"
                      value={mode}
                      checked={badgeConfig.mode === mode}
                      onChange={() => updateBadge(mode)}
                    />
                    <span>{BADGE_LABELS[mode]}</span>
                  </label>
                ))}
              </div>
              <span className="badge-group-title">其他</span>
              <div className="badge-compact-row">
                <label className={`badge-compact-item ${badgeConfig.mode === 'off' ? 'active' : ''}`}>
                  <input
                    type="radio"
                    name="badge-mode"
                    value="off"
                    checked={badgeConfig.mode === 'off'}
                    onChange={() => updateBadge('off')}
                  />
                  <span>关闭角标</span>
                </label>
              </div>
            </div>
          </div>
        </section>

        {/* ---- 显示偏好 ---- */}
        <section className="options-section">
          <h2>
            显示偏好
            <span className={`dirty-tag ${displayDirty ? 'dirty' : ''}`}>{displayDirty ? '未保存' : '已保存'}</span>
          </h2>
          <div className="config-card">
            <div className="config-row">
              <div>
                <span className="config-label">涨跌色模式</span>
              </div>
              <div className="color-scheme-options">
                {COLOR_SCHEME_OPTIONS.map((opt) => (
                  <label key={opt.value} className={`color-scheme-item ${displayDraft.colorScheme === opt.value ? 'active' : ''}`}>
                    <input
                      type="radio"
                      name="color-scheme"
                      value={opt.value}
                      checked={displayDraft.colorScheme === opt.value}
                      onChange={() => setDisplayDraft(prev => ({ ...prev, colorScheme: opt.value }))}
                    />
                    <span>{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="config-row">
              <div>
                <span className="config-label">价格小数位</span>
                <span className="config-hint">价格显示保留的小数位数</span>
              </div>
              <input
                type="number"
                value={displayDraft.decimalPlaces}
                onChange={(e) =>
                  setDisplayDraft((prev) => ({
                    ...prev,
                    decimalPlaces: Math.min(4, Math.max(0, Number(e.target.value) || 0)),
                  }))
                }
                min={0}
                max={4}
                className="number-input"
              />
            </div>
          </div>
        </section>

        {/* ---- 刷新策略 ---- */}
        <section className="options-section">
          <h2>
            刷新策略
            <span className={`dirty-tag ${refreshDirty ? 'dirty' : ''}`}>{refreshDirty ? '未保存' : '已保存'}</span>
          </h2>
          <div className="config-card">
            <div className="config-row">
              <div>
                <span className="config-label">行情刷新间隔</span>
                <span className="config-hint">股票行情自动刷新的时间间隔</span>
              </div>
              <div className="number-with-unit">
                <input
                  type="number"
                  value={refreshDraft.stockRefreshSeconds}
                  onChange={(e) =>
                    setRefreshDraft((prev) => ({
                      ...prev,
                      stockRefreshSeconds: Math.min(60, Math.max(1, Number(e.target.value) || 1)),
                    }))
                  }
                  min={1}
                  max={60}
                  className="number-input"
                />
                <span>秒</span>
              </div>
            </div>

            <div className="config-row">
              <div>
                <span className="config-label">基金刷新间隔</span>
                <span className="config-hint">基金净值估算刷新的时间间隔</span>
              </div>
              <div className="number-with-unit">
                <input
                  type="number"
                  value={refreshDraft.fundRefreshSeconds}
                  onChange={(e) =>
                    setRefreshDraft((prev) => ({
                      ...prev,
                      fundRefreshSeconds: Math.min(300, Math.max(1, Number(e.target.value) || 1)),
                    }))
                  }
                  min={1}
                  max={300}
                  className="number-input"
                />
                <span>秒</span>
              </div>
            </div>

            <div className="config-row">
              <div>
                <span className="config-label">指数刷新间隔</span>
                <span className="config-hint">市场指数刷新的时间间隔</span>
              </div>
              <div className="number-with-unit">
                <input
                  type="number"
                  value={refreshDraft.indexRefreshSeconds}
                  onChange={(e) =>
                    setRefreshDraft((prev) => ({
                      ...prev,
                      indexRefreshSeconds: Math.min(120, Math.max(1, Number(e.target.value) || 1)),
                    }))
                  }
                  min={1}
                  max={120}
                  className="number-input"
                />
                <span>秒</span>
              </div>
            </div>

            <div className="config-row">
              <div>
                <span className="config-label">市场统计刷新间隔</span>
                <span className="config-hint">A 股市场统计数据刷新的时间间隔</span>
              </div>
              <div className="number-with-unit">
                <input
                  type="number"
                  value={refreshDraft.marketStatsRefreshSeconds}
                  onChange={(e) =>
                    setRefreshDraft((prev) => ({
                      ...prev,
                      marketStatsRefreshSeconds: Math.min(300, Math.max(5, Number(e.target.value) || 5)),
                    }))
                  }
                  min={5}
                  max={300}
                  className="number-input"
                />
                <span>秒</span>
              </div>
            </div>
          </div>
        </section>

        {/* ---- 告警设置 ---- */}
        <section className="options-section">
          <h2>
            告警设置
            <span className={`dirty-tag ${alertDirty ? 'dirty' : ''}`}>{alertDirty ? '未保存' : '已保存'}</span>
            <button type="button" className="btn-tiny" style={{ marginLeft: 'auto' }} onClick={sendTestNotification}>
              🔔 发送测试通知
            </button>
          </h2>
          <div className="config-card">
            <div className="config-row">
              <div>
                <span className="config-label">启用告警</span>
                <span className="config-hint">开启后在股票刷新时检查告警条件</span>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={alertDraft.globalEnabled}
                  onChange={(e) => setAlertDraft((prev) => ({ ...prev, globalEnabled: e.target.checked }))}
                />
                <span className="toggle-slider" />
              </label>
            </div>

            <div className="config-row">
              <div>
                <span className="config-label">告警范围</span>
              </div>
              <div className="scope-tab-row">
                {[
                  { value: 'all' as AlertScope, label: '全部自选' },
                  { value: 'special' as AlertScope, label: '特别关注' },
                  { value: 'holding' as AlertScope, label: '仅持仓' },
                ].map((tab) => (
                  <button
                    key={tab.value}
                    type="button"
                    className={`scope-tab-btn ${alertDraft.scope === tab.value ? 'active' : ''}`}
                    onClick={() => setAlertDraft((prev) => ({ ...prev, scope: tab.value }))}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* ---- 工作模式 ---- */}
            <div className="work-mode-section">
              <div className="config-row">
                <div>
                  <span className="config-label">工作模式</span>
                  <span className="config-hint">工作时段内静默系统通知，告警记录到通知面板</span>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={workModeDraft.enabled}
                    onChange={(e) => setWorkModeDraft((prev) => ({ ...prev, enabled: e.target.checked }))}
                  />
                  <span className="toggle-slider" />
                </label>
              </div>

              {workModeDraft.enabled && (
                <div className="work-mode-details">
                  <div className="work-mode-row">
                    <span className="work-mode-label">时段</span>
                    <input
                      type="time"
                      className="time-input"
                      value={workModeDraft.startTime}
                      onChange={(e) => setWorkModeDraft((prev) => ({ ...prev, startTime: e.target.value }))}
                    />
                    <span className="work-mode-sep">—</span>
                    <input
                      type="time"
                      className="time-input"
                      value={workModeDraft.endTime}
                      onChange={(e) => setWorkModeDraft((prev) => ({ ...prev, endTime: e.target.value }))}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Per-stock rules — auto-list + manual add */}
          <div className="alert-stocks-list">
            <div className="alert-stocks-header">
              <span>个股告警规则</span>
              <span className="alert-count-hint">
                {(filteredStocks.length + manualStocks.length) === 0 ? '当前没有股票' : `${filteredStocks.length + manualStocks.length} 只股票`}
              </span>
            </div>

            {/* Manual add input */}
            <div className="alert-add-stock-row">
              <input
                type="text"
                className="alert-stock-code-input"
                placeholder="输入股票代码，如 600519"
                value={newStockCode}
                onChange={(e) => setNewStockCode(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddStockCode(); }}
              />
              <button type="button" className="btn-small" onClick={handleAddStockCode}>
                + 添加
              </button>
            </div>

            {filteredStocks.length + manualStocks.length === 0 ? (
              <div className="alert-empty-hint">当前范围下没有股票</div>
            ) : (
              [...filteredStocks, ...manualStocks].map((stock) => {
                const existingConfig = alertDraft.stocks.find((s) => s.code === stock.code);
                const defaultConfig = createDefaultStockAlertConfig(stock.code, alertDraft.scope);
                const config = existingConfig || defaultConfig;

                return (
                  <StockAlertEditor
                    key={stock.code}
                    config={config}
                    stockName={stock.name}
                    onUpdate={(updated) => {
                      setAlertDraft((prev) => ({
                        ...prev,
                        stocks: prev.stocks.some((s) => s.code === updated.code)
                          ? prev.stocks.map((s) => (s.code === updated.code ? updated : s))
                          : [...prev.stocks, updated],
                      }));
                    }}
                    onRemove={() => {
                      setAlertDraft((prev) => ({
                        ...prev,
                        stocks: prev.stocks.filter((s) => s.code !== stock.code),
                      }));
                    }}
                  />
                );
              })
            )}
          </div>
        </section>

        {/* ---- Actions ---- */}
        <div className={`actions-bar ${hasUnsaved ? 'visible' : ''}`}>
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              void handleSave();
              void handleSaveAlerts();
            }}
            disabled={saving || !hasUnsaved}
          >
            {saving ? '保存中...' : saved ? '已保存 ✓' : '保存设置'}
          </button>
          <button type="button" className="btn-secondary" onClick={handleReset}>
            恢复
          </button>
        </div>
      </div>
    </div>
  );
}
