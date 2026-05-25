import { useEffect, useState, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import { loadCachedStopSuggestions, trendMeta, type StopSuggest } from '../../shared/stop-suggest';
import { type StockPosition, type StockHoldingConfig } from '../../shared/fetch';
import { loadAlertConfig, saveAlertConfig, genRuleId, type AlertRule } from '../../shared/alerts';

type StopSuggestRow = StopSuggest & { changePct?: number };

function toneClass(value: number | undefined): string {
  if (value == null || !Number.isFinite(value)) return '';
  return value >= 0 ? 'up' : 'down';
}

async function enrichRows(suggestions: StopSuggest[]): Promise<StopSuggestRow[]> {
  const rows: StopSuggestRow[] = suggestions.map((s) => ({ ...s }));
  if (rows.length === 0) return rows;
  try {
    const [posResult, holdResult] = await Promise.all([
      chrome.storage.local.get(['stockPositions']),
      chrome.storage.sync.get(['stockHoldings']),
    ]);
    const positions = (posResult.stockPositions ?? []) as StockPosition[];
    const holdings = (holdResult.stockHoldings ?? []) as StockHoldingConfig[];

    const posByCode = new Map(positions.map((p) => [p.code, p]));
    const nameByCode = new Map<string, string>();
    for (const p of positions) if (p.name) nameByCode.set(p.code, p.name);
    for (const h of holdings) if (h.name && !nameByCode.has(h.code)) nameByCode.set(h.code, h.name);

    for (const row of rows) {
      const pos = posByCode.get(row.code);
      if (pos) {
        if (!row.name || row.name === row.code) {
          const realName = nameByCode.get(row.code);
          if (realName) row.name = realName;
        }
        if (Number.isFinite(pos.dailyChangePct)) row.changePct = pos.dailyChangePct;
      }
    }
  } catch {
    // best effort
  }
  return rows;
}

export default function StopSuggestPanel() {
  const [suggestions, setSuggestions] = useState<StopSuggestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{ row: StopSuggestRow; x: number; y: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const s = await loadCachedStopSuggestions();
    const enriched = await enrichRows(s);
    setSuggestions(enriched);
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadData().then(() => { if (cancelled) return; });
    return () => { cancelled = true; };
  }, [loadData]);

  const forceRefresh = useCallback(async () => {
    setRefreshing(true);
    chrome.runtime.sendMessage({ type: 'force-refresh' });
    setTimeout(async () => {
      await loadData();
      setRefreshing(false);
    }, 3000);
  }, [loadData]);

  const addStopAlerts = useCallback(async (row: StopSuggestRow) => {
    const config = await loadAlertConfig();
    if (!config.globalEnabled) config.globalEnabled = true;
    let stockCfg = config.stocks.find((s) => s.code === row.code);
    if (!stockCfg) {
      stockCfg = { code: row.code, scope: 'holding', rules: [] };
      config.stocks.push(stockCfg);
    }
    const newRules: AlertRule[] = [
      { id: genRuleId(), type: 'price_down', targetPrice: row.stopLoss, enabled: true, cooldownSeconds: 300 },
      { id: genRuleId(), type: 'price_up', targetPrice: row.takeProfit, enabled: true, cooldownSeconds: 300 },
    ];
    stockCfg.rules = [...stockCfg.rules.filter((r) => r.type !== 'price_up' && r.type !== 'price_down'), ...newRules];
    await saveAlertConfig(config);
    setCtxMenu(null);
    setToast(`${row.name} 止盈止损已添加到告警规则`);
    setTimeout(() => setToast(null), 2500);
  }, []);

  const handleRowContext = useCallback((e: React.MouseEvent, row: StopSuggestRow) => {
    e.preventDefault();
    setCtxMenu({ row, x: e.clientX, y: e.clientY });
  }, []);

  // 点击其他地方关闭右键菜单
  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [ctxMenu]);

  if (loading) return <div className="panel-message">加载中...</div>;
  if (suggestions.length === 0) return (
    <div className="panel-message">
      <p>暂无建议</p>
      <p className="panel-sub">点击下方按钮立即计算建议</p>
      <button type="button" className="style-refresh-btn" style={{ margin: '12px auto 0', display: 'flex' }} onClick={forceRefresh} disabled={refreshing} title="立即计算">
        <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
      </button>
    </div>
  );

  const lastTime = suggestions.length > 0
    ? new Date(suggestions[0].calculatedAt).toLocaleString('zh-CN')
    : null;

  return (
    <div className="stop-suggest-page">
      <div className="stop-page-header">
        <div className="stop-page-title-row">
          <span className="stop-page-title">⚠️ 风控建议</span>
          <button type="button" className="style-refresh-btn" onClick={forceRefresh} disabled={refreshing} title="强制刷新">
            <RefreshCw size={12} className={refreshing ? 'spin' : ''} />
          </button>
        </div>
        <p className="stop-page-intro">
          根据 ATR(14) 真实波幅 + MA20 趋势强度，为每只持仓智能计算动态止损止盈价位。
          止损 = 现价 − ATR × 倍数 × 趋势因子，止盈同理。趋势越强，止损越宽。
          {lastTime ? <span className="stop-page-time"> · 更新于 {lastTime}</span> : null}
        </p>
      </div>
      <table className="data-table stop-table">
        <colgroup>
          <col style={{ width: '24%' }} />
          <col style={{ width: '16%' }} />
          <col style={{ width: '16%' }} />
          <col style={{ width: '16%' }} />
          <col style={{ width: '16%' }} />
          <col style={{ width: '12%' }} />
        </colgroup>
        <thead>
          <tr>
            <th className="text-left">股票</th>
            <th>现价</th>
            <th>止损</th>
            <th>止盈</th>
            <th title="ATR(14)：14日平均真实波幅，衡量价格波动幅度。值越大表示近期波动越剧烈，止损/止盈距离也会相应拉宽。">ATR</th>
            <th className="text-left">趋势</th>
          </tr>
        </thead>
        <tbody>
          {suggestions.map((s) => {
            const meta = trendMeta(s.trendDirection);
            return (
              <tr key={s.code} onContextMenu={(e) => handleRowContext(e, s)}>
                <td className="text-left">
                  <span className="stop-cell-name">{s.name}</span>
                  <span className="stop-cell-code">{s.code}</span>
                </td>
                <td className={toneClass(s.changePct)}>{s.currentPrice.toFixed(2)}</td>
                <td className="down">{s.stopLoss.toFixed(2)}</td>
                <td className="up">{s.takeProfit.toFixed(2)}</td>
                <td>{s.atr.toFixed(2)}<span className="stop-atr-pct">({s.atrPct}%)</span></td>
                <td className="text-left">
                  <span className={`trend-tag trend-${meta.dir}`}>{meta.icon} {meta.label}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="stop-page-footer">
        以上数据基于历史 K 线自动计算，仅供参考，不构成投资建议
      </div>
      {ctxMenu ? (
        <div className="stop-ctx-menu"
          style={{
            position: 'fixed',
            left: Math.min(ctxMenu.x, window.innerWidth - 150),
            top: Math.min(ctxMenu.y, window.innerHeight - 44),
            zIndex: 200,
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="stop-ctx-title">{ctxMenu.row.name} <span className="stop-ctx-code">{ctxMenu.row.code}</span></div>
          <button type="button" onClick={() => addStopAlerts(ctxMenu.row)}>
            添加到告警规则
          </button>
        </div>
      ) : null}
      {toast ? <div className="stop-toast">{toast}</div> : null}
    </div>
  );
}
