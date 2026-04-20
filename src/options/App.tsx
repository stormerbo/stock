import { useCallback, useEffect, useState } from 'react';
import type { BadgeConfig, BadgeMode } from '../background';
import {
  loadAlertConfig,
  saveAlertConfig,
  genRuleId,
  DEFAULT_ALERT_CONFIG,
  type AlertConfig,
  type AlertRule,
  type StockAlertConfig,
  type AlertRuleType,
  type AlertScope,
} from '../shared/alerts';

const BADGE_STORAGE_KEY = 'badgeConfig';
const DISPLAY_STORAGE_KEY = 'displayConfig';
const REFRESH_STORAGE_KEY = 'refreshConfig';

const BADGE_OPTIONS: Array<{ value: BadgeMode; label: string }> = [
  { value: 'stockCount', label: '持仓股数' },
  { value: 'stockMarket', label: '股票市值' },
  { value: 'stockFloatingPnl', label: '股票浮动盈亏' },
  { value: 'stockDailyPnl', label: '股票当日盈亏' },
  { value: 'fundCount', label: '持仓基金数' },
  { value: 'fundAmount', label: '基金持有总额' },
  { value: 'fundHoldingProfit', label: '基金持有收益' },
  { value: 'fundEstimatedProfit', label: '基金估算收益' },
  { value: 'off', label: '关闭角标' },
];

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
};

const DEFAULT_DISPLAY: DisplayConfig = { colorScheme: 'cn', decimalPlaces: 2 };
const DEFAULT_REFRESH: RefreshConfig = { stockRefreshSeconds: 15, fundRefreshSeconds: 60, indexRefreshSeconds: 30 };

// -----------------------------------------------------------
// Stock Alert Editor Sub-component
// -----------------------------------------------------------

type StockAlertEditorProps = {
  config: StockAlertConfig;
  index: number;
  onUpdate: (updated: StockAlertConfig) => void;
  onRemove: () => void;
  stockHoldings: Array<{ code: string; name: string }>;
};

const RULE_TYPE_LABELS: Record<AlertRuleType, string> = {
  price_up: '涨破目标价',
  price_down: '跌破目标价',
  change_pct: '涨跌幅波动',
  volatility: '振幅波动',
};

function StockAlertEditor({ config, index, onUpdate, onRemove, stockHoldings }: StockAlertEditorProps) {
  // Look up stock name from holdings
  const stockInfo = stockHoldings.find((h) => h.code === config.code);
  const displayName = stockInfo ? `${stockInfo.name} (${config.code})` : config.code;

  return (
    <div className="alert-stock-card">
      <div className="alert-stock-header">
        <span className="alert-stock-name">{displayName}</span>
        <button type="button" className="btn-small danger" onClick={onRemove}>
          删除
        </button>
      </div>

      <div className="alert-rules-list">
        {config.rules.map((rule, ri) => (
          <div key={rule.id} className="alert-rule-row">
            <label className="alert-rule-toggle">
              <input
                type="checkbox"
                checked={rule.enabled}
                onChange={(e) => {
                  const rules = [...config.rules];
                  rules[ri] = { ...rule, enabled: e.target.checked };
                  onUpdate({ ...config, rules });
                }}
              />
              <span>{RULE_TYPE_LABELS[rule.type]}</span>
            </label>

            {rule.type === 'price_up' || rule.type === 'price_down' ? (
              <div className="alert-rule-inputs">
                <input
                  type="number"
                  className="number-input small"
                  value={rule.targetPrice ?? ''}
                  placeholder="目标价"
                  onChange={(e) => {
                    const rules = [...config.rules];
                    rules[ri] = { ...rule, targetPrice: Number(e.target.value) || 0 };
                    onUpdate({ ...config, rules });
                  }}
                />
                <span>元</span>
              </div>
            ) : rule.type === 'change_pct' ? (
              <div className="alert-rule-inputs">
                <input
                  type="number"
                  className="number-input small"
                  value={rule.changeThreshold ?? ''}
                  placeholder="阈值"
                  min={0}
                  max={100}
                  onChange={(e) => {
                    const rules = [...config.rules];
                    rules[ri] = { ...rule, changeThreshold: Number(e.target.value) || 0 };
                    onUpdate({ ...config, rules });
                  }}
                />
                <span>%</span>
              </div>
            ) : null}

            <div className="alert-rule-cooldown">
              <span>冷却</span>
              <input
                type="number"
                className="number-input tiny"
                value={rule.cooldownSeconds ?? 300}
                min={60}
                max={3600}
                onChange={(e) => {
                  const rules = [...config.rules];
                  rules[ri] = { ...rule, cooldownSeconds: Number(e.target.value) || 300 };
                  onUpdate({ ...config, rules });
                }}
              />
              <span>秒</span>
            </div>
          </div>
        ))}

        {/* Add rule button */}
        <div className="alert-add-rule">
          {(['price_up', 'price_down', 'change_pct', 'volatility'] as AlertRuleType[]).map((type) => {
            const exists = config.rules.some((r) => r.type === type);
            if (exists) return null;
            return (
              <button
                key={type}
                type="button"
                className="btn-tiny"
                onClick={() => {
                  const newRule: AlertRule = {
                    id: genRuleId(),
                    type,
                    enabled: true,
                    targetPrice: type.startsWith('price') ? 0 : undefined,
                    changeThreshold: type === 'change_pct' ? 5 : undefined,
                    volatilityDays: type === 'volatility' ? 5 : undefined,
                    volatilityThreshold: type === 'volatility' ? 10 : undefined,
                    cooldownSeconds: 300,
                  };
                  onUpdate({ ...config, rules: [...config.rules, newRule] });
                }}
              >
                + {RULE_TYPE_LABELS[type]}
              </button>
            );
          })}
        </div>
      </div>
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

  // ---- Save ----
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await Promise.all([
        saveStorageItem(DISPLAY_STORAGE_KEY, displayDraft),
        saveStorageItem(REFRESH_STORAGE_KEY, refreshDraft),
      ]);
      setDisplayConfig(displayDraft);
      setRefreshConfig(refreshDraft);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }, [displayDraft, refreshDraft]);

  const handleReset = useCallback(() => {
    setDisplayDraft(displayConfig);
    setRefreshDraft(refreshConfig);
  }, [displayConfig, refreshConfig]);

  const displayDirty = JSON.stringify(displayDraft) !== JSON.stringify(displayConfig);
  const refreshDirty = JSON.stringify(refreshDraft) !== JSON.stringify(refreshConfig);

  // ---- Load stock holdings for alert picker ----
  const [stockHoldings, setStockHoldings] = useState<Array<{ code: string; name: string; shares: number; special: boolean }>>([]);

  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
      chrome.storage.sync.get(['stockHoldings'], (result: Record<string, unknown>) => {
        const holdings = (Array.isArray(result.stockHoldings) ? result.stockHoldings : []) as Array<{ code: string; name?: string; shares: number; special?: boolean }>;
        // Load positions for names
        chrome.storage.local.get(['stockPositions'], (posResult: Record<string, unknown>) => {
          const positions = (Array.isArray(posResult.stockPositions) ? posResult.stockPositions : []) as Array<{ code: string; name: string }>;
          const posMap = new Map(positions.map(p => [p.code, p.name]));
          setStockHoldings(holdings.map(h => ({
            code: h.code,
            name: posMap.get(h.code) || h.name || h.code,
            shares: h.shares || 0,
            special: h.special || false,
          })));
        });
      });
    }
  }, []);

  // ---- Alert helpers ----
  const addStockAlert = useCallback((code: string, name: string) => {
    setAlertDraft((prev) => {
      if (prev.stocks.some(s => s.code === code)) return prev;
      return {
        ...prev,
        stocks: [
          ...prev.stocks,
          {
            code,
            scope: prev.scope,
            rules: [
              { id: genRuleId(), type: 'price_up', enabled: true, targetPrice: 0, cooldownSeconds: 300 },
              { id: genRuleId(), type: 'price_down', enabled: true, targetPrice: 0, cooldownSeconds: 300 },
              { id: genRuleId(), type: 'change_pct', enabled: false, changeThreshold: 5, cooldownSeconds: 300 },
            ],
          },
        ],
      };
    });
  }, []);

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

  // ---- Alert Config ----
  const [alertConfig, setAlertConfig] = useState<AlertConfig>(DEFAULT_ALERT_CONFIG);
  const [alertDraft, setAlertDraft] = useState<AlertConfig>(DEFAULT_ALERT_CONFIG);

  useEffect(() => {
    loadAlertConfig().then((config) => {
      setAlertConfig(config);
      setAlertDraft(JSON.parse(JSON.stringify(config)));
    });
  }, []);

  const filteredHoldings = stockHoldings.filter((h) => {
    if (alertDraft.scope === 'special') return h.special;
    if (alertDraft.scope === 'holding') return h.shares > 0;
    return true;
  });

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
  const hasUnsaved = displayDirty || refreshDirty || alertDirty;

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
              <select
                value={displayDraft.colorScheme}
                onChange={(e) =>
                  setDisplayDraft((prev) => ({ ...prev, colorScheme: e.target.value as ColorScheme }))
                }
              >
                <option value="cn">红涨绿跌（A 股）</option>
                <option value="us">绿涨红跌（美股）</option>
              </select>
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
          </div>
        </section>

        {/* ---- 告警设置 ---- */}
        <section className="options-section">
          <h2>
            告警设置
            <span className={`dirty-tag ${alertDirty ? 'dirty' : ''}`}>{alertDirty ? '未保存' : '已保存'}</span>
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
          </div>

          {/* Per-stock rules */}
          <div className="alert-stocks-list">
            <div className="alert-stocks-header">
              <span>个股告警规则</span>
              {/* Stock picker dropdown */}
              <select
                className="alert-stock-select"
                value=""
                onChange={(e) => {
                  const code = e.target.value;
                  if (!code) return;
                  const stock = stockHoldings.find((s) => s.code === code);
                  if (stock) addStockAlert(stock.code, stock.name);
                }}
              >
                <option value="">+ 添加股票</option>
                {filteredHoldings
                  .filter((h) => !alertDraft.stocks.some((s) => s.code === h.code))
                  .map((h) => (
                    <option key={h.code} value={h.code}>
                      {h.name} ({h.code}){h.shares > 0 ? ` — 持仓${h.shares}股` : ''}{h.special ? ' ⭐' : ''}
                    </option>
                  ))}
              </select>
            </div>

            {alertDraft.stocks.length === 0 ? (
              <div className="alert-empty-hint">
                {filteredHoldings.length === 0
                  ? '当前范围下没有股票'
                  : '暂无个股告警规则，请从上方选择添加'}
              </div>
            ) : (
              alertDraft.stocks.map((stockCfg, idx) => (
                <StockAlertEditor
                  key={stockCfg.code}
                  config={stockCfg}
                  index={idx}
                  stockHoldings={stockHoldings}
                  onUpdate={(updated) =>
                    setAlertDraft((prev) => ({
                      ...prev,
                      stocks: prev.stocks.map((s, i) => (i === idx ? updated : s)),
                    }))
                  }
                  onRemove={() =>
                    setAlertDraft((prev) => ({
                      ...prev,
                      stocks: prev.stocks.filter((_, i) => i !== idx),
                    }))
                  }
                />
              ))
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
