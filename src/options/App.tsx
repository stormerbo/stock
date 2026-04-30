import { useCallback, useEffect, useRef, useState } from 'react';
import type { BadgeConfig, BadgeMode } from '../background';
import {
  loadAlertConfig,
  saveAlertConfig,
  createAlertRule,
  DEFAULT_ALERT_CONFIG,
  DEFAULT_SPIKE_CONFIG,
  type AlertConfig,
  type AlertRule,
  type StockAlertConfig,
  type AlertRuleType,
  type AlertDirection,
  type AlertScope,
  type SpikeGlobalConfig,
} from '../shared/alerts';
import {
  loadTagConfig,
  saveTagConfig,
  MAX_TAG_NAME_LENGTH,
  MAX_GLOBAL_TAGS,
  type TagConfig,
  type TagDefinition,
} from '../shared/tags';

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
  combinedPnl: '总盈亏',
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
const BACKUP_SCHEMA_VERSION = 1;

type BackupPayload = {
  schemaVersion: number;
  exportedAt: string;
  app: string;
  sync: Record<string, unknown>;
  local: Record<string, unknown>;
};

const RULE_TYPE_LABELS: Record<AlertRuleType, string> = {
  price_up: '涨破目标价',
  price_down: '跌破目标价',
  change_pct: '涨跌幅波动',
  volatility: '振幅波动',
  spike: '急速异动',  // kept for legacy, no longer shown in add-rule UI
  drawdown: '最大回撤',
  trailing_stop: '移动止盈',
  batch_buy: '分批买入',
  grid_trading: '网格交易',
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

              {rule.type === 'drawdown' && (
                <div className="alert-rule-inputs">
                  <input
                    type="number"
                    className="number-input small"
                    value={rule.drawdownThreshold ?? ''}
                    placeholder="阈值"
                    min={5}
                    max={100}
                    onChange={(e) => updateRule(ri, (prev) => ({ ...prev, drawdownThreshold: Number(e.target.value) || 0 }))}
                  />
                  <span>%</span>
                  <span className="alert-rule-hint">每日收盘后检测</span>
                </div>
              )}

              {rule.type === 'trailing_stop' && (
                <div className="alert-rule-inputs">
                  <input
                    type="number"
                    className="number-input small"
                    value={rule.trailingStopPct ?? ''}
                    placeholder="回落 %"
                    min={0.5}
                    max={50}
                    step={0.5}
                    onChange={(e) => updateRule(ri, (prev) => ({ ...prev, trailingStopPct: Number(e.target.value) || 5 }))}
                  />
                  <span>%</span>
                  <span className="alert-rule-hint">从峰值回落触发</span>
                </div>
              )}

              {rule.type === 'batch_buy' && (
                <div className="alert-rule-inputs">
                  <input
                    type="number"
                    className="number-input small"
                    value={rule.batchBuyStartPrice ?? ''}
                    placeholder="起始价"
                    min={0}
                    onChange={(e) => updateRule(ri, (prev) => ({ ...prev, batchBuyStartPrice: Number(e.target.value) || 0 }))}
                  />
                  <span>~</span>
                  <input
                    type="number"
                    className="number-input small"
                    value={rule.batchBuyEndPrice ?? ''}
                    placeholder="终止价"
                    min={0}
                    onChange={(e) => updateRule(ri, (prev) => ({ ...prev, batchBuyEndPrice: Number(e.target.value) || 0 }))}
                  />
                  <input
                    type="number"
                    className="number-input small"
                    value={rule.batchBuyCount ?? ''}
                    placeholder="档位"
                    min={2}
                    max={20}
                    onChange={(e) => updateRule(ri, (prev) => ({ ...prev, batchBuyCount: Number(e.target.value) || 3 }))}
                  />
                  <span>档</span>
                  <span className="alert-rule-hint">价格触及买入信号</span>
                </div>
              )}

              {rule.type === 'grid_trading' && (
                <div className="alert-rule-inputs">
                  <input
                    type="number"
                    className="number-input small"
                    value={rule.gridLowerPrice ?? ''}
                    placeholder="下轨"
                    min={0}
                    onChange={(e) => updateRule(ri, (prev) => ({ ...prev, gridLowerPrice: Number(e.target.value) || 0 }))}
                  />
                  <span>~</span>
                  <input
                    type="number"
                    className="number-input small"
                    value={rule.gridUpperPrice ?? ''}
                    placeholder="上轨"
                    min={0}
                    onChange={(e) => updateRule(ri, (prev) => ({ ...prev, gridUpperPrice: Number(e.target.value) || 0 }))}
                  />
                  <input
                    type="number"
                    className="number-input small"
                    value={rule.gridCount ?? ''}
                    placeholder="格数"
                    min={2}
                    max={50}
                    onChange={(e) => updateRule(ri, (prev) => ({ ...prev, gridCount: Number(e.target.value) || 5 }))}
                  />
                  <span>格</span>
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
            {(['price_up', 'price_down', 'change_pct', 'volatility', 'drawdown', 'trailing_stop', 'batch_buy', 'grid_trading'] as AlertRuleType[]).map((type) => (
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

function ensureRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

// -----------------------------------------------------------
// Test notification — demo: spike up + spike down
// -----------------------------------------------------------

function sendTestNotification() {
  if (typeof chrome?.runtime?.sendMessage !== 'function') return;

  const now = Date.now();
  const payloads = [
    {
      // 急速拉升 demo
      code: '600519',
      name: '贵州茅台',
      message: '贵州茅台(600519) 急速拉升\n近5分钟内上涨 +3.25%，触发第1档(2.00%)，现价 ¥1820.50',
      ruleType: 'spike',
      price: 1820.50,
      changePct: 3.25,
      _ruleId: `spike_demo_up::up::L1`,
    },
    {
      // 急速打压 demo
      code: '000001',
      name: '平安银行',
      message: '平安银行(000001) 急速打压\n近5分钟内下跌 -2.80%，触发第1档(2.00%)，现价 ¥11.35',
      ruleType: 'spike',
      price: 11.35,
      changePct: -2.80,
      _ruleId: `spike_demo_down::down::L1`,
    },
  ];

  for (const p of payloads) {
    void chrome.runtime.sendMessage({
      type: 'test-notification',
      data: p,
    }).catch(() => undefined);
  }
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

  // ---- Donate ----
  const [showDonate, setShowDonate] = useState(false);

  // ---- Settings Tabs ----
  const [settingsTab, setSettingsTab] = useState<'basic' | 'alerts' | 'tech-report' | 'other'>('basic');

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

  // ---- Technical Report Config ----
  const TECH_REPORT_STORAGE_KEY = 'technicalReportConfig';

  type TechReportConfig = {
    enabled: boolean;
  };

  const DEFAULT_TECH_REPORT: TechReportConfig = {
    enabled: false,
  };

  const [techReportConfig, setTechReportConfig] = useState<TechReportConfig>(DEFAULT_TECH_REPORT);
  const [techReportDraft, setTechReportDraft] = useState<TechReportConfig>(DEFAULT_TECH_REPORT);

  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
      chrome.storage.sync.get(TECH_REPORT_STORAGE_KEY, (result: Record<string, unknown>) => {
        const config = result[TECH_REPORT_STORAGE_KEY] as TechReportConfig | undefined;
        const resolved = config || DEFAULT_TECH_REPORT;
        setTechReportConfig(resolved);
        setTechReportDraft(resolved);
      });
    }
  }, []);

  const techReportDirty = JSON.stringify(techReportDraft) !== JSON.stringify(techReportConfig);

  // ---- Tag Config ----
  const [tagConfig, setTagConfig] = useState<TagConfig>({ tags: [] });

  useEffect(() => {
    loadTagConfig().then(setTagConfig);
  }, []);

  const handleCreateTag = (name: string) => {
    const trimmed = name.trim().slice(0, MAX_TAG_NAME_LENGTH);
    if (!trimmed || tagConfig.tags.length >= MAX_GLOBAL_TAGS) return;
    if (tagConfig.tags.some(t => t.name === trimmed)) return;
    const newDef: TagDefinition = { name: trimmed, createdAt: Date.now() };
    const next = { ...tagConfig, tags: [...tagConfig.tags, newDef] };
    setTagConfig(next);
    void saveTagConfig(next);
  };

  const handleRenameTag = (oldName: string, newName: string) => {
    const trimmed = newName.trim().slice(0, MAX_TAG_NAME_LENGTH);
    if (!trimmed || oldName === trimmed) return;
    if (tagConfig.tags.some(t => t.name === trimmed)) return;
    const next = {
      ...tagConfig,
      tags: tagConfig.tags.map(t => t.name === oldName ? { ...t, name: trimmed } : t),
    };
    setTagConfig(next);
    void saveTagConfig(next);
  };

  const handleDeleteTag = async (name: string) => {
    // Remove from global registry
    const nextConfig = {
      ...tagConfig,
      tags: tagConfig.tags.filter(t => t.name !== name),
    };
    setTagConfig(nextConfig);
    void saveTagConfig(nextConfig);

    // Remove from all holdings
    if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
      const result = await chrome.storage.sync.get(['stockHoldings', 'fundHoldings']);
      const stockHoldings: Array<Record<string, unknown>> = Array.isArray(result.stockHoldings) ? result.stockHoldings : [];
      const fundHoldings: Array<Record<string, unknown>> = Array.isArray(result.fundHoldings) ? result.fundHoldings : [];
      const updatedStocks = stockHoldings.map((h: Record<string, unknown>) => {
        const tags = Array.isArray(h.tags) ? (h.tags as string[]).filter(t => t !== name) : [];
        return tags.length !== (Array.isArray(h.tags) ? (h.tags as string[]).length : 0)
          ? { ...h, tags }
          : h;
      });
      const updatedFunds = fundHoldings.map((h: Record<string, unknown>) => {
        const tags = Array.isArray(h.tags) ? (h.tags as string[]).filter(t => t !== name) : [];
        return tags.length !== (Array.isArray(h.tags) ? (h.tags as string[]).length : 0)
          ? { ...h, tags }
          : h;
      });
      await chrome.storage.sync.set({ stockHoldings: updatedStocks, fundHoldings: updatedFunds });
    }
  };

  // ---- Save ----
  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await Promise.all([
        saveStorageItem(DISPLAY_STORAGE_KEY, displayDraft),
        saveStorageItem(REFRESH_STORAGE_KEY, refreshDraft),
        saveStorageItem(WORK_MODE_STORAGE_KEY, workModeDraft),
        saveStorageItem(TECH_REPORT_STORAGE_KEY, techReportDraft),
      ]);
      setDisplayConfig(displayDraft);
      setRefreshConfig(refreshDraft);
      setWorkModeConfig(workModeDraft);
      setTechReportConfig(techReportDraft);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }, [displayDraft, refreshDraft, workModeDraft, techReportDraft]);

  const handleReset = useCallback(() => {
    setDisplayDraft(displayConfig);
    setRefreshDraft(refreshConfig);
    setWorkModeDraft(workModeConfig);
    setTechReportDraft(techReportConfig);
  }, [displayConfig, refreshConfig, workModeConfig, techReportConfig]);

  // ---- Load stock holdings (all stocks, with name + position data) ----
  const [allStocks, setAllStocks] = useState<Array<{ code: string; name: string; shares: number; special: boolean }>>([]);
  const [stockPositions, setStockPositions] = useState<Map<string, { price: number; dailyChangePct: number; name: string }>>(new Map());

  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
      chrome.storage.sync.get(['stockHoldings'], (result: Record<string, unknown>) => {
        const holdings = (Array.isArray(result.stockHoldings) ? result.stockHoldings : []) as Array<{ code: string; name?: string; shares: number; special?: boolean }>;
        chrome.storage.local.get(['stockPositions'], (posResult: Record<string, unknown>) => {
          const positions = (Array.isArray(posResult.stockPositions) ? posResult.stockPositions : []) as Array<{ code: string; name: string; price: number; dailyChangePct: number }>;
          const posMap = new Map<string, { price: number; dailyChangePct: number; name: string }>();
          for (const p of positions) {
            if (Number.isFinite(p.price)) {
              posMap.set(p.code, { price: p.price, dailyChangePct: p.dailyChangePct ?? 0, name: p.name });
            }
          }
          setStockPositions(posMap);
          setAllStocks(holdings.map(h => {
            const pos = posMap.get(h.code);
            return {
              code: h.code,
              name: pos?.name || h.name || h.code,
              shares: h.shares || 0,
              special: h.special || false,
            };
          }));
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

  // Fetch names for stocks that have no valid name (code shown as name)
  const [fetchedAlertStockNames, setFetchedAlertStockNames] = useState<Map<string, string>>(new Map());
  const fetchedNameCodesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const codesToFetch = [
      // alert-only stocks not in position data
      ...alertDraft.stocks
        .filter((s) => !allStocks.some((h) => h.code === s.code))
        .filter((s) => !stockPositions.has(s.code))
        .map((s) => s.code),
      // stocks in allStocks whose name is just the code (no valid name found)
      ...allStocks
        .filter((s) => !s.name || s.name === s.code)
        .map((s) => s.code),
    ].filter((code) => !fetchedNameCodesRef.current.has(code));

    if (codesToFetch.length === 0) return;

    let cancelled = false;
    const fetch = async () => {
      const { fetchBatchStockQuotes } = await import('../shared/fetch');
      const results = await fetchBatchStockQuotes(
        codesToFetch.map((code) => ({ code, shares: 0, cost: 0 }))
      );
      if (cancelled) return;
      setFetchedAlertStockNames((prev) => {
        const next = new Map(prev);
        for (const r of results) {
          if (r.name && r.name !== r.code) {
            next.set(r.code, r.name);
            fetchedNameCodesRef.current.add(r.code);
          }
        }
        return next;
      });
    };
    void fetch();
    return () => { cancelled = true; };
  }, [alertDraft.stocks, allStocks, stockPositions]);

  // Manually added stocks (in alertDraft but not in allStocks)
  const manualStocks = alertDraft.stocks
    .filter((s) => !allStocks.some((h) => h.code === s.code))
    .map((s) => ({ code: s.code, name: stockPositions.get(s.code)?.name || fetchedAlertStockNames.get(s.code) || s.code, shares: 0, special: false }));

  const createDefaultStockAlertConfig = useCallback((code: string, scope: AlertScope): StockAlertConfig => ({
    code,
    scope,
    rules: [
      createAlertRule('price_up'),
      createAlertRule('price_down'),
      createAlertRule('change_pct'),
    ],
  }), []);

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
  const hasUnsaved = displayDirty || refreshDirty || alertDirty || workModeDirty || techReportDirty;
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [backupBusy, setBackupBusy] = useState(false);
  const [updateStatus, setUpdateStatus] = useState('');
  const [backupMessage, setBackupMessage] = useState('');
  const [backupError, setBackupError] = useState('');

  const exportAllData = useCallback(async () => {
    setBackupBusy(true);
    setBackupError('');
    setBackupMessage('');
    try {
      let syncData: Record<string, unknown> = {};
      let localData: Record<string, unknown> = {};

      if (typeof chrome !== 'undefined' && chrome.storage?.sync && chrome.storage?.local) {
        const [syncResult, localResult] = await Promise.all([
          chrome.storage.sync.get(null),
          chrome.storage.local.get(null),
        ]);
        syncData = ensureRecord(syncResult);
        localData = ensureRecord(localResult);
      } else {
        const localFallback: Record<string, unknown> = {};
        for (let i = 0; i < localStorage.length; i += 1) {
          const key = localStorage.key(i);
          if (!key) continue;
          const raw = localStorage.getItem(key);
          try {
            localFallback[key] = raw ? JSON.parse(raw) : raw;
          } catch {
            localFallback[key] = raw;
          }
        }
        localData = localFallback;
      }

      const payload: BackupPayload = {
        schemaVersion: BACKUP_SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
        app: 'money-helper',
        sync: syncData,
        local: localData,
      };

      const stamp = new Date()
        .toISOString()
        .replace(/[-:]/g, '')
        .replace(/\..+$/, '')
        .replace('T', '-');
      const fileName = `money-helper-backup-${stamp}.json`;
      const text = JSON.stringify(payload, null, 2);
      const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      setBackupMessage(`已导出：sync ${Object.keys(syncData).length} 项，local ${Object.keys(localData).length} 项`);
    } catch (error) {
      setBackupError(error instanceof Error ? error.message : '导出失败');
    } finally {
      setBackupBusy(false);
    }
  }, []);

  const triggerImport = useCallback(() => {
    importInputRef.current?.click();
  }, []);

  const importAllData = useCallback(async (file: File) => {
    setBackupBusy(true);
    setBackupError('');
    setBackupMessage('');
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Partial<BackupPayload>;
      const syncData = ensureRecord(parsed.sync);
      const localData = ensureRecord(parsed.local);

      if (typeof chrome !== 'undefined' && chrome.storage?.sync && chrome.storage?.local) {
        await Promise.all([
          chrome.storage.sync.clear(),
          chrome.storage.local.clear(),
        ]);
        if (Object.keys(syncData).length > 0) {
          await chrome.storage.sync.set(syncData);
        }
        if (Object.keys(localData).length > 0) {
          await chrome.storage.local.set(localData);
        }
      } else {
        localStorage.clear();
        Object.entries(localData).forEach(([key, value]) => {
          localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
        });
      }

      setBackupMessage('导入成功，正在刷新页面应用新数据...');
      window.setTimeout(() => {
        window.location.reload();
      }, 450);
    } catch (error) {
      setBackupError(error instanceof Error ? error.message : '导入失败');
    } finally {
      setBackupBusy(false);
    }
  }, []);

  return (
    <div className="options-root">
      <div className="options-container">
        <header className="options-header">
          <h1>配置中心</h1>
          <p className="desc">角标设置即时生效，其余配置需手动保存</p>
          <div className="header-actions">
            <button type="button" className="theme-btn" onClick={toggleTheme}>
              {theme === 'dark' ? '🌞 浅色' : '🌙 深色'}
            </button>
            <button type="button" className="donate-btn" onClick={() => setShowDonate(true)}>
              ☕ 打赏
            </button>
          </div>
        </header>

        {/* ---- 设置标签页切换 ---- */}
        <div className="settings-tabs">
          <button type="button" className={`settings-tab ${settingsTab === 'basic' ? 'active' : ''}`} onClick={() => setSettingsTab('basic')}>基本</button>
          <button type="button" className={`settings-tab ${settingsTab === 'alerts' ? 'active' : ''}`} onClick={() => setSettingsTab('alerts')}>告警</button>
          <button type="button" className={`settings-tab ${settingsTab === 'tech-report' ? 'active' : ''}`} onClick={() => setSettingsTab('tech-report')}>技术报告</button>
          <button type="button" className={`settings-tab ${settingsTab === 'other' ? 'active' : ''}`} onClick={() => setSettingsTab('other')}>其他</button>
        </div>

        {/* ---- 基本: 角标设置 ---- */}
        {settingsTab === 'basic' && (
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
                {(['combinedPnl', 'off'] as const).map((mode) => (
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
            </div>
          </div>
        </section>)}

        {/* ---- 显示偏好 ---- */}
        {settingsTab === 'basic' && (<section className="options-section">
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
        </section>)}

        {/* ---- 刷新策略 ---- */}
        {settingsTab === 'basic' && (<section className="options-section">
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
                      stockRefreshSeconds: Math.min(60, Math.max(2, Number(e.target.value) || 2)),
                    }))
                  }
                  min={2}
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
                      fundRefreshSeconds: Math.min(300, Math.max(2, Number(e.target.value) || 2)),
                    }))
                  }
                  min={2}
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
                      indexRefreshSeconds: Math.min(120, Math.max(2, Number(e.target.value) || 2)),
                    }))
                  }
                  min={2}
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
        </section>)}

        {/* ---- 标签管理 ---- */}
        {settingsTab === 'basic' && (<section className="options-section">
          <h2>标签管理</h2>
          <div className="config-card">
            <div className="config-row">
              <div>
                <span className="config-label">已建标签</span>
                <span className="config-hint">{tagConfig.tags.length}/{MAX_GLOBAL_TAGS}，点击标签可重命名</span>
              </div>
            </div>
            <div className="tag-management-list">
              {tagConfig.tags.length === 0 ? (
                <div className="tag-empty-hint">暂无标签，在弹出页的右键菜单中创建</div>
              ) : (
                tagConfig.tags.map((tag) => (
                  <TagRow
                    key={tag.name}
                    tag={tag}
                    onRename={handleRenameTag}
                    onDelete={handleDeleteTag}
                  />
                ))
              )}
            </div>
          </div>
        </section>)}

        {/* ---- 告警设置 ---- */}
        {settingsTab === 'alerts' && (<section className="options-section">
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

            {/* ---- 急速异动（全局） ---- */}
            <div className="work-mode-section">
              <div className="config-row">
                <div>
                  <span className="config-label">急速异动</span>
                  <span className="config-hint">所有自选股统一使用此参数检测急速拉升/打压</span>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={alertDraft.spikeConfig?.enabled ?? DEFAULT_SPIKE_CONFIG.enabled}
                    onChange={(e) => setAlertDraft((prev) => ({
                      ...prev,
                      spikeConfig: { ...(prev.spikeConfig || DEFAULT_SPIKE_CONFIG), enabled: e.target.checked },
                    }))}
                  />
                  <span className="toggle-slider" />
                </label>
              </div>

              {(alertDraft.spikeConfig?.enabled ?? DEFAULT_SPIKE_CONFIG.enabled) && (
                <div className="work-mode-details">
                  <div className="work-mode-row">
                    <span className="work-mode-label">幅度</span>
                    <input
                      type="number"
                      className="number-input small"
                      value={alertDraft.spikeConfig?.pctThreshold ?? DEFAULT_SPIKE_CONFIG.pctThreshold}
                      min={0.5}
                      max={10}
                      step={0.5}
                      onChange={(e) => setAlertDraft((prev) => ({
                        ...prev,
                        spikeConfig: { ...(prev.spikeConfig || DEFAULT_SPIKE_CONFIG), pctThreshold: Number(e.target.value) || 2 },
                      }))}
                    />
                    <span style={{ marginLeft: 4 }}>%</span>
                  </div>
                  <div className="work-mode-row">
                    <span className="work-mode-label">窗口</span>
                    <input
                      type="number"
                      className="number-input small"
                      value={alertDraft.spikeConfig?.windowMinutes ?? DEFAULT_SPIKE_CONFIG.windowMinutes}
                      min={1}
                      max={30}
                      onChange={(e) => setAlertDraft((prev) => ({
                        ...prev,
                        spikeConfig: { ...(prev.spikeConfig || DEFAULT_SPIKE_CONFIG), windowMinutes: Number(e.target.value) || 5 },
                      }))}
                    />
                    <span style={{ marginLeft: 4 }}>分钟</span>
                  </div>
                  <div className="work-mode-row">
                    <span className="work-mode-label">方向</span>
                    <select
                      className="number-input small"
                      value={alertDraft.spikeConfig?.direction ?? DEFAULT_SPIKE_CONFIG.direction}
                      onChange={(e) => setAlertDraft((prev) => ({
                        ...prev,
                        spikeConfig: { ...(prev.spikeConfig || DEFAULT_SPIKE_CONFIG), direction: e.target.value as AlertDirection },
                      }))}
                    >
                      {ALERT_DIRECTION_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
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
              <span className="alert-count-hint">设置各股票的价格/涨跌幅/波动等告警</span>
            </div>

            {allStocks.length === 0 ? (
              <div className="alert-empty-hint">当前没有自选股</div>
            ) : (
              [...allStocks, ...manualStocks].map((stock) => {
                const existingConfig = alertDraft.stocks.find((s) => s.code === stock.code);
                const defaultConfig = createDefaultStockAlertConfig(stock.code, 'all');
                const config = existingConfig || defaultConfig;

                return (
                  <StockAlertEditor
                    key={stock.code}
                    config={config}
                    stockName={fetchedAlertStockNames.get(stock.code) || stock.name}
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
        </section>)}

        {/* ---- 盘后技术指标报告 ---- */}
        {settingsTab === 'tech-report' && (<section className="options-section">
          <h2>
            盘后技术指标报告
            <span className={`dirty-tag ${techReportDirty ? 'dirty' : ''}`}>{techReportDirty ? '未保存' : '已保存'}</span>
          </h2>
          <div className="config-card">
            <div className="config-row">
              <div>
                <span className="config-label">启用收盘后技术分析</span>
                <span className="config-hint">每日收盘后（15:30）自动计算持仓股票的技术指标</span>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={techReportDraft.enabled}
                  onChange={(e) => setTechReportDraft((prev) => ({ ...prev, enabled: e.target.checked }))}
                />
                <span className="toggle-slider" />
              </label>
            </div>

            {techReportDraft.enabled && (
              <div className="indicator-grid">
                <div className="indicator-card">
                  <span className="indicator-name">MACD</span>
                  <span className="indicator-desc">趋势跟踪指标，DIF/DEA 金叉死叉及柱状图翻红翻绿，判断趋势转折</span>
                </div>
                <div className="indicator-card">
                  <span className="indicator-name">RSI</span>
                  <span className="indicator-desc">相对强弱指标，超买(&gt;70)/超卖(&lt;30)提示价格反转</span>
                </div>
                <div className="indicator-card">
                  <span className="indicator-name">KDJ</span>
                  <span className="indicator-desc">随机指标，金叉死叉及超买超卖区域判断短期买卖时机</span>
                </div>
                <div className="indicator-card">
                  <span className="indicator-name">布林带</span>
                  <span className="indicator-desc">标准差通道，突破上下轨提示超涨超跌，收窄预示变盘</span>
                </div>
                <div className="indicator-card">
                  <span className="indicator-name">成交量</span>
                  <span className="indicator-desc">量能异动，成交量为5日均量的倍数时提示放量/缩量</span>
                </div>
                <div className="indicator-card">
                  <span className="indicator-name">均线交叉</span>
                  <span className="indicator-desc">MA5/10 金叉死叉，判断短期趋势强弱转换</span>
                </div>
                <div className="indicator-card">
                  <span className="indicator-name">乖离率(BIAS)</span>
                  <span className="indicator-desc">股价偏离5日均线百分比，偏离过大提示回归需求</span>
                </div>
                <div className="indicator-card">
                  <span className="indicator-name">威廉指标(WR)</span>
                  <span className="indicator-desc">超买超卖区间判断短期回调或反弹机会</span>
                </div>
              </div>
            )}
          </div>
        </section>)}

        {/* ---- 数据迁移 ---- */}
        {settingsTab === 'other' && (<section className="options-section">
          <h2>数据迁移</h2>
          <p className="section-desc">用于跨扩展 ID 迁移全部数据（自选、持仓、告警、通知、收益明细、显示设置等）。</p>
          <div className="config-card">
            <div className="backup-actions-row">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => void exportAllData()}
                disabled={backupBusy}
              >
                {backupBusy ? '处理中...' : '导出全部数据'}
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={triggerImport}
                disabled={backupBusy}
              >
                {backupBusy ? '处理中...' : '导入并覆盖数据'}
              </button>
              <input
                ref={importInputRef}
                type="file"
                accept="application/json,.json"
                className="backup-file-input"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    void importAllData(file);
                  }
                  e.currentTarget.value = '';
                }}
              />
            </div>
            <div className="backup-hint-text">导入会先清空当前扩展数据，再按备份恢复；建议先导出一份当前数据。</div>
            {backupMessage ? <div className="backup-status success">{backupMessage}</div> : null}
            {backupError ? <div className="backup-status error">{backupError}</div> : null}
          </div>

          <h2 style={{ marginTop: 24 }}>版本</h2>
          <div className="config-card">
            <div className="config-row">
              <div>
                <span className="config-label">当前版本</span>
                <span className="config-hint">v{chrome.runtime?.getManifest?.().version ?? '-'}</span>
              </div>
              <span className="update-status-text">{updateStatus}</span>
              <button
                type="button"
                className="btn-secondary"
                disabled={updateStatus === '检查中...'}
                onClick={async () => {
                  if (typeof chrome?.runtime?.sendMessage !== 'function') return;
                  setUpdateStatus('检查中...');
                  try {
                    const res = await chrome.runtime.sendMessage({ type: 'check-update' }) as { ok: boolean; found?: boolean } | undefined;
                    if (res?.found) {
                      setUpdateStatus('发现新版本，请在系统通知中查看');
                    } else {
                      setUpdateStatus('已是最新版本');
                    }
                    setTimeout(() => setUpdateStatus(''), 3000);
                  } catch {
                    setUpdateStatus('检查失败');
                    setTimeout(() => setUpdateStatus(''), 3000);
                  }
                }}
              >
                {updateStatus || '检查更新'}
              </button>
            </div>
          </div>
        </section>)}

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

        {/* ---- Donate Modal ---- */}
        {showDonate && (
          <div className="donate-overlay" onClick={() => setShowDonate(false)}>
            <div className="donate-modal" onClick={(e) => e.stopPropagation()}>
              <div className="donate-modal-header">
                <span>感谢支持 ☕</span>
                <button type="button" className="donate-close-btn" onClick={() => setShowDonate(false)}>✕</button>
              </div>
              <div className="donate-modal-body">
                <img src="/donate-qr.jpg" alt="微信支付二维码" className="donate-qr-image" />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Tag Row Component ----
type TagRowProps = {
  tag: TagDefinition;
  onRename: (oldName: string, newName: string) => void;
  onDelete: (name: string) => void;
};

function TagRow({ tag, onRename, onDelete }: TagRowProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(tag.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const handleSubmit = () => {
    if (value.trim() && value.trim() !== tag.name) {
      onRename(tag.name, value.trim());
    }
    setEditing(false);
    setValue(tag.name);
  };

  return (
    <div className="tag-manage-row">
      {editing ? (
        <input
          ref={inputRef}
          className="tag-rename-input"
          value={value}
          onChange={(e) => setValue(e.target.value.slice(0, MAX_TAG_NAME_LENGTH))}
          onBlur={handleSubmit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit();
            if (e.key === 'Escape') { setEditing(false); setValue(tag.name); }
          }}
          maxLength={MAX_TAG_NAME_LENGTH}
        />
      ) : (
        <span className="tag-manage-name" onClick={() => setEditing(true)} title="点击重命名">
          {tag.name}
        </span>
      )}
      <button type="button" className="btn-tiny danger" onClick={() => onDelete(tag.name)} title="删除标签">
        删除
      </button>
    </div>
  );
}
