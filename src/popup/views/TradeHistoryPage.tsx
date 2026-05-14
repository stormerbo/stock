import { Fragment, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, ChevronLeft, X, Search } from 'lucide-react';
import {
  loadTradeHistory, addTrade, deleteTrade, computePositionFromTrades,
  type StockTradeRecord, type TradeType,
} from '../../shared/trade-history';
import { loadFeeConfig, DEFAULT_FEE_CONFIG, type FeeConfig } from '../../shared/fee-config';
import { formatNumber, formatPercent, toneClass } from '../utils/format';
import type { DailyAssetSnapshot } from '../../shared/fetch';
import AssetCurveChart from '../components/AssetCurveChart';

type Props = {
  stockNames: Record<string, string>;
  allStockCodes: string[];
  onStockTradesChanged?: (code: string) => void;
};

type ModalState = {
  code: string;
  date: string;
  type: TradeType;
  shares: string;
  price: string;
  total: string;
  commission: string;
  stampTax: string;
  transferFee: string;
  note: string;
  error: string;
  submitting: boolean;
};

const emptyModal = (stockCodes: string[]): ModalState => ({
  code: stockCodes[0] || '',
  date: new Date().toISOString().slice(0, 10),
  type: 'buy',
  shares: '', price: '', total: '',
  commission: '', stampTax: '', transferFee: '',
  note: '', error: '', submitting: false,
});

const btnStyle = (variant: 'brand' | 'danger' | 'ghost' = 'ghost'): React.CSSProperties => {
  const base: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '5px 12px', borderRadius: 6, border: 'none',
    fontSize: 12, fontWeight: 600, cursor: 'pointer',
    whiteSpace: 'nowrap',
  };
  if (variant === 'brand') return { ...base, background: 'var(--brand)', color: '#fff' };
  if (variant === 'danger') return { ...base, color: '#e74c3c' };
  return { ...base, background: 'transparent', color: 'var(--text-1)' };
};

const inputCls = (w = 1): React.CSSProperties => ({
  flex: w, padding: '7px 10px', fontSize: 12,
  border: '1px solid var(--line)', borderRadius: 6,
  background: 'var(--bg-0)', color: 'var(--text-0)',
  outline: 'none', minWidth: 0,
});

export default function TradeHistoryPage({ stockNames, allStockCodes, onStockTradesChanged }: Props) {
  const [stockHistory, setStockHistory] = useState<Record<string, StockTradeRecord[]>>({});
  const [showModal, setShowModal] = useState(false);
  const [modal, setModal] = useState<ModalState>(() => emptyModal(allStockCodes));
  const [feeCfg, setFeeCfg] = useState<FeeConfig>(DEFAULT_FEE_CONFIG);
  const [stockSearch, setStockSearch] = useState('');
  const [assetSnapshots, setAssetSnapshots] = useState<Record<string, DailyAssetSnapshot>>({});

  useEffect(() => { loadFeeConfig().then(setFeeCfg); }, []);

  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get('dailyAssetSnapshots', (result: Record<string, unknown>) => {
        setAssetSnapshots((result.dailyAssetSnapshots ?? {}) as Record<string, DailyAssetSnapshot>);
      });
    }
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes.dailyAssetSnapshots) {
        setAssetSnapshots(changes.dailyAssetSnapshots.newValue as Record<string, DailyAssetSnapshot>);
      }
    };
    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
      chrome.storage.onChanged.addListener(listener);
      return () => chrome.storage.onChanged.removeListener(listener);
    }
  }, []);

  const loadAll = async () => {
    const h = await loadTradeHistory();
    setStockHistory(h);
  };

  useEffect(() => { void loadAll(); }, []);

  // 刷新单只股票的交易记录
  const refreshStock = async (code: string) => {
    const h = await loadTradeHistory();
    setStockHistory((prev) => {
      if (!h[code]) { const n = { ...prev }; delete n[code]; return n; }
      return { ...prev, [code]: h[code] };
    });
  };

  // ─── 派生数据 ───

  const flatTrades = useMemo(() => {
    const all: Array<{ code: string; trade: StockTradeRecord }> = [];
    for (const [code, trades] of Object.entries(stockHistory)) {
      for (const t of trades) {
        all.push({ code, trade: t });
      }
    }
    return all.sort((a, b) =>
      b.trade.date.localeCompare(a.trade.date) ||
      b.trade.createdAt.localeCompare(a.trade.createdAt)
    );
  }, [stockHistory]);

  const summary = useMemo(() => {
    let totalStocks = 0, totalTrades = 0, totalRealizedPnl = 0;
    for (const [, trades] of Object.entries(stockHistory)) {
      const pos = computePositionFromTrades(trades);
      totalStocks++;
      totalTrades += pos.tradeCount;
      totalRealizedPnl += pos.realizedPnl;
    }
    return { totalStocks, totalTrades, totalRealizedPnl };
  }, [stockHistory]);

  // ─── 模态框费用估算 ───

  const estFees = useMemo(() => {
    const s = Math.round(Number(modal.shares));
    const p = Number(modal.price);
    if (modal.type === 'dividend' || !Number.isFinite(s) || s <= 0 || !Number.isFinite(p) || p <= 0) return null;
    const amount = s * p;
    const c = Math.max(Math.round(amount * feeCfg.stockCommissionRate * 100) / 100, feeCfg.stockCommissionMin);
    const st = modal.type === 'sell' ? Math.round(amount * feeCfg.stockStampTaxRate * 100) / 100 : 0;
    const tf = Math.round(amount * feeCfg.stockTransferFeeRate * 100) / 100;
    return { amount, commission: c, stampTax: st, transferFee: tf, feeTotal: c + st + tf };
  }, [modal.shares, modal.price, modal.type, feeCfg]);

  const fillFees = () => {
    if (!estFees) return;
    setModal((m) => ({
      ...m,
      total: String(Math.round(estFees.amount * 100) / 100),
      commission: String(estFees.commission),
      stampTax: String(estFees.stampTax),
      transferFee: String(estFees.transferFee),
    }));
  };

  // ─── 添加交易 ───

  const handleAddTrade = async () => {
    const s = Math.round(Number(modal.shares));
    const p = Number(modal.price);
    if (!modal.code) { setModal((m) => ({ ...m, error: '请选择股票' })); return; }
    if (modal.type !== 'dividend' && (!Number.isFinite(s) || s <= 0)) { setModal((m) => ({ ...m, error: '请输入有效股数' })); return; }
    if (modal.type !== 'dividend' && (!Number.isFinite(p) || p <= 0)) { setModal((m) => ({ ...m, error: '请输入有效价格' })); return; }
    setModal((m) => ({ ...m, error: '', submitting: true }));

    await addTrade({
      stockCode: modal.code, date: modal.date || new Date().toISOString().slice(0, 10),
      type: modal.type,
      shares: modal.type === 'dividend' ? 0 : s,
      price: modal.type === 'dividend' ? 0 : p,
      total: modal.total ? Number(modal.total) : undefined,
      commission: modal.commission ? Number(modal.commission) : undefined,
      stampTax: modal.stampTax ? Number(modal.stampTax) : undefined,
      transferFee: modal.transferFee ? Number(modal.transferFee) : undefined,
      note: modal.note || undefined,
    });

    await refreshStock(modal.code);
    onStockTradesChanged?.(modal.code);
    setShowModal(false);
    setModal(emptyModal(allStockCodes));
  };

  // ─── 删除交易 ───

  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const handleDelete = async (code: string, tradeId: string) => {
    await deleteTrade(code, tradeId);
    await refreshStock(code);
    onStockTradesChanged?.(code);
    setDeleteConfirm(null);
  };

  // ─── 模态框内选择股票 ───

  const filteredStockCodes = stockSearch
    ? allStockCodes.filter((c) => c.includes(stockSearch) || (stockNames[c] || '').includes(stockSearch))
    : allStockCodes;

  // ─── 渲染 ───

  return (
    <div className="table-panel" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <AssetCurveChart snapshots={assetSnapshots} />
      {/* 概况栏 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '10px 12px', fontSize: 12, color: 'var(--text-1)' }}>
        <span>股票 <b style={{ color: 'var(--text-0)' }}>{summary.totalStocks}</b> 只</span>
        <span>共 <b style={{ color: 'var(--text-0)' }}>{summary.totalTrades}</b> 笔</span>
        <span>合计已实现盈亏 <b className={toneClass(summary.totalRealizedPnl)}>{formatNumber(summary.totalRealizedPnl, 2)}</b></span>
        <button type="button" style={{ ...btnStyle('brand'), marginLeft: 'auto' }} onClick={() => { setModal(emptyModal(allStockCodes)); setShowModal(true); }}>
          <Plus size={13} /> 新增交易
        </button>
      </div>

      {/* 交易表格 */}
      <div style={{ overflow: 'auto', flex: 1, border: '1px solid var(--line)', borderRadius: 6 }}>
        <table className="data-table" style={{ width: '100%', tableLayout: 'auto', fontSize: 11 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '6px 8px' }}>股票</th>
              <th style={{ padding: '6px 8px' }}>日期</th>
              <th style={{ padding: '6px 8px' }}>类型</th>
              <th style={{ textAlign: 'right', padding: '6px 8px' }}>股数</th>
              <th style={{ textAlign: 'right', padding: '6px 8px' }}>价格</th>
              <th style={{ textAlign: 'right', padding: '6px 8px' }}>总额</th>
              <th style={{ textAlign: 'right', padding: '6px 8px' }}>佣金</th>
              <th style={{ padding: '6px 8px', textAlign: 'left' }}>备注</th>
              <th style={{ padding: '6px 8px', width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {flatTrades.length === 0 ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40, color: 'var(--text-2)' }}>暂无交易记录，点击右上角"新增交易"添加</td></tr>
            ) : flatTrades.map(({ code, trade }) => (
              <tr key={trade.id} style={{ borderTop: '1px solid var(--line)' }}>
                <td style={{ padding: '6px 8px', fontWeight: 600, whiteSpace: 'nowrap', textAlign: 'left' }}>
                  <span>{stockNames[code] || code}</span>
                  <span style={{ color: 'var(--text-2)', marginLeft: 4, fontWeight: 400 }}>{code}</span>
                </td>
                <td style={{ padding: '6px 8px', textAlign: 'center', color: 'var(--text-1)' }}>{trade.date}</td>
                <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                  <span className={trade.type === 'buy' ? 'up' : trade.type === 'sell' ? 'down' : ''}>
                    {trade.type === 'buy' ? '买入' : trade.type === 'sell' ? '卖出' : '分红'}
                  </span>
                </td>
                <td style={{ padding: '6px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{trade.type !== 'dividend' ? formatNumber(trade.shares, 0) : '-'}</td>
                <td style={{ padding: '6px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{trade.type !== 'dividend' ? formatNumber(trade.price, 3) : '-'}</td>
                <td style={{ padding: '6px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{trade.total ? `¥${trade.total.toFixed(2)}` : '-'}</td>
                <td style={{ padding: '6px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text-1)' }}>
                  {trade.commission != null ? `¥${trade.commission.toFixed(2)}` : '-'}
                </td>
                <td style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--text-2)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {trade.note || ''}
                </td>
                <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                  {deleteConfirm === trade.id ? (
                    <span style={{ display: 'inline-flex', gap: 4 }}>
                      <button type="button" style={{ color: '#e74c3c', fontSize: 11, border: 'none', background: 'none', cursor: 'pointer' }} onClick={() => handleDelete(code, trade.id)}>确认</button>
                      <button type="button" style={{ color: 'var(--text-2)', fontSize: 11, border: 'none', background: 'none', cursor: 'pointer' }} onClick={() => setDeleteConfirm(null)}>取消</button>
                    </span>
                  ) : (
                    <button type="button" style={{ ...btnStyle('danger'), padding: '2px 6px' }} onClick={() => setDeleteConfirm(trade.id)}><Trash2 size={12} /></button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ─── 新增交易弹窗 ─── */}
      {showModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 200,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.45)',
        }} onClick={() => setShowModal(false)}>
          <div style={{
            background: 'var(--bg-1)', borderRadius: 12, padding: 20,
            width: 440, maxHeight: '90vh', overflow: 'auto',
            display: 'flex', flexDirection: 'column', gap: 10,
            border: '1px solid var(--glass-border)', boxShadow: '0 12px 36px rgba(0,0,0,0.25)',
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>新增交易记录</span>
              <button type="button" style={{ ...btnStyle(), padding: 4 }} onClick={() => setShowModal(false)}><X size={16} /></button>
            </div>

            {/* 股票选择 */}
            <div style={{ position: 'relative' }}>
              <input type="text" style={{ ...inputCls(), width: '100%' }} placeholder="搜索股票代码或名称..."
                value={stockSearch} onChange={(e) => setStockSearch(e.target.value)} />
              {stockSearch && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
                  maxHeight: 160, overflow: 'auto',
                  background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 6, marginTop: 2,
                }}>
                  {filteredStockCodes.map((c) => (
                    <button key={c} type="button" style={{
                      display: 'block', width: '100%', padding: '6px 10px', border: 'none', background: modal.code === c ? 'var(--brand-soft)' : 'transparent',
                      color: 'var(--text-0)', fontSize: 12, cursor: 'pointer', textAlign: 'left',
                    }} onClick={() => { setModal((m) => ({ ...m, code: c })); setStockSearch(''); }}>
                      {stockNames[c] || c} <span style={{ color: 'var(--text-2)' }}>{c}</span>
                    </button>
                  ))}
                </div>
              )}
              {!stockSearch && (
                <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4 }}>
                  已选: <b style={{ color: 'var(--text-0)' }}>{modal.code ? `${stockNames[modal.code] || modal.code} (${modal.code})` : '未选择'}</b>
                </div>
              )}
            </div>

            {/* 日期 + 类型 */}
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="date" style={inputCls()} value={modal.date}
                onChange={(e) => setModal((m) => ({ ...m, date: e.target.value }))} />
              <select style={inputCls()} value={modal.type}
                onChange={(e) => setModal((m) => ({ ...m, type: e.target.value as TradeType }))}>
                <option value="buy">买入</option>
                <option value="sell">卖出</option>
                <option value="dividend">分红</option>
              </select>
            </div>

            {/* 股数 + 价格 */}
            {modal.type !== 'dividend' && (
              <div style={{ display: 'flex', gap: 8 }}>
                <input type="number" step="1" min="1" style={inputCls()} placeholder="股数"
                  value={modal.shares} onChange={(e) => setModal((m) => ({ ...m, shares: e.target.value }))} />
                <input type="number" step="0.001" min="0" style={inputCls()} placeholder="成交价"
                  value={modal.price} onChange={(e) => setModal((m) => ({ ...m, price: e.target.value }))} />
              </div>
            )}

            {/* 费用预览 */}
            {estFees && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 6, background: 'var(--glass-bg)', fontSize: 11, color: 'var(--text-1)' }}>
                <span>总金额 <b style={{ color: 'var(--text-0)' }}>¥{estFees.amount.toFixed(2)}</b> · 佣金 <b style={{ color: 'var(--text-0)' }}>¥{estFees.commission.toFixed(2)}</b>
                  {modal.type === 'sell' ? <> · 印花税 <b style={{ color: 'var(--text-0)' }}>¥{estFees.stampTax.toFixed(2)}</b></> : ''}
                  · 过户费 <b style={{ color: 'var(--text-0)' }}>¥{estFees.transferFee.toFixed(2)}</b></span>
                <button type="button" onClick={fillFees} style={{
                  marginLeft: 'auto', padding: '3px 10px', fontSize: 11, borderRadius: 4,
                  border: '1px solid var(--brand)', background: 'var(--brand-soft)', color: 'var(--brand)',
                  cursor: 'pointer', fontWeight: 600,
                }}>填入</button>
              </div>
            )}

            {/* 金额输入 */}
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="number" step="0.01" min="0" style={inputCls()} placeholder={modal.type === 'dividend' ? '金额' : '总金额（选填）'}
                value={modal.total} onChange={(e) => setModal((m) => ({ ...m, total: e.target.value }))} />
              <input type="number" step="0.01" min="0" style={inputCls()} placeholder="佣金"
                value={modal.commission} onChange={(e) => setModal((m) => ({ ...m, commission: e.target.value }))} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="number" step="0.01" min="0" style={inputCls()} placeholder={modal.type === 'sell' ? '印花税（卖出万5）' : '印花税（仅卖出）'}
                value={modal.stampTax} onChange={(e) => setModal((m) => ({ ...m, stampTax: e.target.value }))} />
              <input type="number" step="0.01" min="0" style={inputCls()} placeholder="过户费"
                value={modal.transferFee} onChange={(e) => setModal((m) => ({ ...m, transferFee: e.target.value }))} />
            </div>
            <input type="text" style={inputCls()} placeholder="备注（选填）"
              value={modal.note} onChange={(e) => setModal((m) => ({ ...m, note: e.target.value }))} />

            {modal.error && <div style={{ fontSize: 11, color: '#ef4444' }}>{modal.error}</div>}

            <button type="button" onClick={handleAddTrade} disabled={modal.submitting} style={{
              ...btnStyle('brand'), alignSelf: 'flex-end', padding: '7px 20px', opacity: modal.submitting ? 0.6 : 1,
            }}>
              <Plus size={14} /> 确认添加
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
