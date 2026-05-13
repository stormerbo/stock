import { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, Trash2, ChevronRight } from 'lucide-react';
import {
  type StockTradeRecord,
  type TradeType,
  totalFees,
  computePositionFromTrades,
  loadTradeHistory,
  addTrade,
  deleteTrade,
} from '../../shared/trade-history';
import {
  type FundTradeRecord,
  type FundTradeType,
  totalFundFees,
  computeFundPositionFromTrades,
  loadFundTradeHistory,
  addFundTrade,
  deleteFundTrade,
} from '../../shared/fund-trade-history';

import { loadFeeConfig, DEFAULT_FEE_CONFIG, type FeeConfig } from '../../shared/fee-config';

// ─── Stock Trade Form ───
function StockTradeForm({ code, onAdded, onChanged }: { code: string; onAdded: () => void; onChanged?: (code: string) => void }) {
  const [feeCfg, setFeeCfg] = useState<FeeConfig>(DEFAULT_FEE_CONFIG);
  useEffect(() => { loadFeeConfig().then(setFeeCfg); }, []);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [type, setType] = useState<TradeType>('buy');
  const [shares, setShares] = useState('');
  const [price, setPrice] = useState('');
  const [total, setTotal] = useState('');
  const [commission, setCommission] = useState('');
  const [stampTax, setStampTax] = useState('');
  const [transferFee, setTransferFee] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const estFees = useMemo(() => {
    const s = Number(shares);
    const p = Number(price);
    if (!Number.isFinite(s) || s <= 0 || !Number.isFinite(p) || p <= 0) return null;
    const amount = s * p;
    const c = Math.max(Math.round(amount * feeCfg.stockCommissionRate * 100) / 100, feeCfg.stockCommissionMin);
    const st = type === 'sell' ? Math.round(amount * feeCfg.stockStampTaxRate * 100) / 100 : 0;
    const tf = Math.round(amount * feeCfg.stockTransferFeeRate * 100) / 100;
    return { amount, commission: c, stampTax: st, transferFee: tf, feeTotal: c + st + tf };
  }, [shares, price, type]);

  const fillFees = () => {
    if (!estFees) return;
    setTotal(String(Math.round(estFees.amount * 100) / 100));
    setCommission(String(estFees.commission));
    setStampTax(String(estFees.stampTax));
    setTransferFee(String(estFees.transferFee));
  };

  const handleSubmit = async () => {
    const s = Math.round(Number(shares));
    const p = Number(price);
    if (!Number.isFinite(s) || s <= 0) { setError('请输入有效股数'); return; }
    if (!Number.isFinite(p) || p <= 0) { setError('请输入有效价格'); return; }
    setError('');
    await addTrade({
      stockCode: code, date: date || new Date().toISOString().slice(0, 10), type,
      shares: s, price: p,
      total: total ? Number(total) : undefined,
      commission: commission ? Number(commission) : undefined,
      stampTax: stampTax ? Number(stampTax) : undefined,
      transferFee: transferFee ? Number(transferFee) : undefined,
      note: note || undefined,
    });
    setShares(''); setPrice(''); setTotal(''); setCommission(''); setStampTax(''); setTransferFee(''); setNote('');
    onAdded();
    onChanged?.(code);
  };

  const inputCls = (w?: number) => ({ flex: w || 1, padding: '8px 10px', fontSize: 12, border: '1px solid var(--line)', borderRadius: 6, background: 'var(--bg-0)', color: 'var(--text-0)', outline: 'none', minWidth: 0 }) as React.CSSProperties;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input type="date" style={inputCls()} value={date} onChange={e => setDate(e.target.value)} />
        <select style={inputCls()} value={type} onChange={e => setType(e.target.value as TradeType)}>
          <option value="buy">买入</option>
          <option value="sell">卖出</option>
          <option value="dividend">分红</option>
        </select>
      </div>
      {type !== 'dividend' && (
        <div style={{ display: 'flex', gap: 8 }}>
          <input type="number" step="1" min="1" style={inputCls()} placeholder="股数" value={shares} onChange={e => setShares(e.target.value)} />
          <input type="number" step="0.001" min="0" style={inputCls()} placeholder="成交价" value={price} onChange={e => setPrice(e.target.value)} />
        </div>
      )}
      {estFees && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 6, background: 'var(--glass-bg)', fontSize: 11, color: 'var(--text-1)' }}>
          <span>总金额 <b style={{ color: 'var(--text-0)' }}>¥{estFees.amount.toFixed(2)}</b> · 佣金 <b style={{ color: 'var(--text-0)' }}>¥{estFees.commission.toFixed(2)}</b>{type === 'sell' ? <> · 印花税 <b style={{ color: 'var(--text-0)' }}>¥{estFees.stampTax.toFixed(2)}</b></> : ''} · 过户费 <b style={{ color: 'var(--text-0)' }}>¥{estFees.transferFee.toFixed(2)}</b></span>
          <button type="button" onClick={fillFees} style={{ marginLeft: 'auto', padding: '3px 10px', fontSize: 11, borderRadius: 4, border: '1px solid var(--brand)', background: 'var(--brand-soft)', color: 'var(--brand)', cursor: 'pointer', fontWeight: 600 }}>填入</button>
        </div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <input type="number" step="0.01" min="0" style={inputCls()} placeholder={type === 'dividend' ? '金额' : '总金额（选填）'} value={total} onChange={e => setTotal(e.target.value)} />
        <input type="number" step="0.01" min="0" style={inputCls()} placeholder="佣金" value={commission} onChange={e => setCommission(e.target.value)} />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input type="number" step="0.01" min="0" style={inputCls()} placeholder={type === 'sell' ? '印花税（卖出万5）' : '印花税（仅卖出）'} value={stampTax} onChange={e => setStampTax(e.target.value)} />
        <input type="number" step="0.01" min="0" style={inputCls()} placeholder="过户费" value={transferFee} onChange={e => setTransferFee(e.target.value)} />
      </div>
      <input type="text" style={inputCls()} placeholder="备注（选填）" value={note} onChange={e => setNote(e.target.value)} />
      {error && <div style={{ fontSize: 11, color: '#ef4444' }}>{error}</div>}
      <button type="button" onClick={handleSubmit} style={{ alignSelf: 'flex-end', padding: '6px 16px', borderRadius: 6, border: 'none', background: 'var(--brand)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
        <Plus size={14} /> 添加记录
      </button>
    </div>
  );
}

// ─── Fund Trade Form ───
function FundTradeForm({ code, onAdded, onChanged }: { code: string; onAdded: () => void; onChanged?: (code: string) => void }) {
  const [feeCfg, setFeeCfg] = useState<FeeConfig>(DEFAULT_FEE_CONFIG);
  useEffect(() => { loadFeeConfig().then(setFeeCfg); }, []);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [type, setType] = useState<FundTradeType>('subscribe');
  const [units, setUnits] = useState('');
  const [nav, setNav] = useState('');
  const [amount, setAmount] = useState('');
  const [subscriptionFee, setSubscriptionFee] = useState('');
  const [redemptionFee, setRedemptionFee] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const estAmount = useMemo(() => {
    if (type === 'dividend') return Number(amount);
    const u = Number(units);
    const n = Number(nav);
    if (!Number.isFinite(u) || u <= 0 || !Number.isFinite(n) || n <= 0) return Number.NaN;
    return Math.round(u * n * 100) / 100;
  }, [units, nav, amount, type]);

  const estFees = useMemo(() => {
    const a = Number.isFinite(estAmount) ? estAmount : Number(amount);
    if (!Number.isFinite(a) || a <= 0) return null;
    const sf = type === 'subscribe' ? Math.round(a * feeCfg.fundSubscriptionRate * 100) / 100 : 0;
    const rf = type === 'redeem' ? Math.round(a * feeCfg.fundRedemptionRate * 100) / 100 : 0;
    return { amount: a, subscriptionFee: sf, redemptionFee: rf, feeTotal: sf + rf };
  }, [estAmount, amount, type]);

  const fillFees = () => {
    if (!estFees) return;
    if (Number.isFinite(estAmount)) setAmount(String(estAmount));
    setSubscriptionFee(estFees.subscriptionFee > 0 ? String(estFees.subscriptionFee) : '');
    setRedemptionFee(estFees.redemptionFee > 0 ? String(estFees.redemptionFee) : '');
  };

  const handleSubmit = async () => {
    const u = Number(units);
    const n = Number(nav);
    const a = Number(amount);
    if (type !== 'dividend') {
      if (!Number.isFinite(u) || u <= 0) { setError('请输入有效份额'); return; }
      if (!Number.isFinite(n) || n <= 0) { setError('请输入有效净值'); return; }
    }
    if (!Number.isFinite(a) || a <= 0) { setError('请输入有效金额'); return; }
    setError('');
    await addFundTrade({
      fundCode: code, date, type,
      units: type !== 'dividend' ? u : 0,
      nav: type !== 'dividend' ? n : 0,
      amount: a,
      subscriptionFee: subscriptionFee ? Number(subscriptionFee) : undefined,
      redemptionFee: redemptionFee ? Number(redemptionFee) : undefined,
      note: note || undefined,
    });
    setUnits(''); setNav(''); setAmount(''); setSubscriptionFee(''); setRedemptionFee(''); setNote('');
    onAdded();
    onChanged?.(code);
  };

  const inputCls = (w?: number) => ({ flex: w || 1, padding: '8px 10px', fontSize: 12, border: '1px solid var(--line)', borderRadius: 6, background: 'var(--bg-0)', color: 'var(--text-0)', outline: 'none', minWidth: 0 }) as React.CSSProperties;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input type="date" style={inputCls()} value={date} onChange={e => setDate(e.target.value)} />
        <select style={inputCls()} value={type} onChange={e => setType(e.target.value as FundTradeType)}>
          <option value="subscribe">申购</option>
          <option value="redeem">赎回</option>
          <option value="dividend">分红</option>
        </select>
      </div>
      {type !== 'dividend' && (
        <div style={{ display: 'flex', gap: 8 }}>
          <input type="number" step="0.0001" min="0" style={inputCls()} placeholder="份额" value={units} onChange={e => setUnits(e.target.value)} />
          <input type="number" step="0.0001" min="0" style={inputCls()} placeholder="净值" value={nav} onChange={e => setNav(e.target.value)} />
        </div>
      )}
      {estFees && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 6, background: 'var(--glass-bg)', fontSize: 11, color: 'var(--text-1)' }}>
          <span>总金额 <b style={{ color: 'var(--text-0)' }}>¥{estFees.amount.toFixed(2)}</b>{estFees.subscriptionFee > 0 ? <> · 申购费 <b style={{ color: 'var(--text-0)' }}>¥{estFees.subscriptionFee.toFixed(2)}</b></> : null}{estFees.redemptionFee > 0 ? <> · 赎回费 <b style={{ color: 'var(--text-0)' }}>¥{estFees.redemptionFee.toFixed(2)}</b></> : null}</span>
          <button type="button" onClick={fillFees} style={{ marginLeft: 'auto', padding: '3px 10px', fontSize: 11, borderRadius: 4, border: '1px solid var(--brand)', background: 'var(--brand-soft)', color: 'var(--brand)', cursor: 'pointer', fontWeight: 600 }}>填入</button>
        </div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <input type="number" step="0.01" min="0" style={inputCls()} placeholder={type === 'dividend' ? '分红金额' : '交易金额'} value={amount} onChange={e => setAmount(e.target.value)} />
        {type === 'subscribe' || type === 'dividend' ? <input type="number" step="0.01" min="0" style={inputCls()} placeholder="申购费（0.15%）" value={subscriptionFee} onChange={e => setSubscriptionFee(e.target.value)} /> : null}
        {type === 'redeem' || type === 'dividend' ? <input type="number" step="0.01" min="0" style={inputCls()} placeholder="赎回费（0.5%）" value={redemptionFee} onChange={e => setRedemptionFee(e.target.value)} /> : null}
      </div>
      <input type="text" style={inputCls()} placeholder="备注（选填）" value={note} onChange={e => setNote(e.target.value)} />
      {error && <div style={{ fontSize: 11, color: '#ef4444' }}>{error}</div>}
      <button type="button" onClick={handleSubmit} style={{ alignSelf: 'flex-end', padding: '6px 16px', borderRadius: 6, border: 'none', background: 'var(--brand)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
        <Plus size={14} /> 添加记录
      </button>
    </div>
  );
}

// ─── Helpers ───
const STOCK_TYPE_LABEL: Record<TradeType, string> = { buy: '买入', sell: '卖出', dividend: '分红' };
const STOCK_TYPE_COLOR: Record<TradeType, string> = { buy: '#ef4444', sell: '#10b981', dividend: '#f59e0b' };
const FUND_TYPE_LABEL: Record<FundTradeType, string> = { subscribe: '申购', redeem: '赎回', dividend: '分红' };
const FUND_TYPE_COLOR: Record<FundTradeType, string> = { subscribe: '#ef4444', redeem: '#10b981', dividend: '#f59e0b' };

function fmt(v: number, d = 2) { return Number.isFinite(v) ? v.toLocaleString('zh-CN', { minimumFractionDigits: d, maximumFractionDigits: d }) : '-'; }

// ─── Stock Trade List ───
function StockTradeList({ code, trades, onDelete, onChanged }: { code: string; trades: StockTradeRecord[]; onDelete: () => void; onChanged?: (code: string) => void }) {
  const pos = useMemo(() => computePositionFromTrades(trades), [trades]);
  const sorted = useMemo(() => [...trades].sort((a, b) => b.date.localeCompare(a.date)), [trades]);
  const [delId, setDelId] = useState<string | null>(null);

  if (trades.length === 0) return <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-1)', fontSize: 12 }}>暂无交易记录</div>;

  return (
    <div>
      <div style={{ display: 'flex', gap: 16, marginBottom: 12, padding: 12, borderRadius: 8, background: 'var(--glass-bg)', border: '1px solid var(--line)' }}>
        {[
          ['持仓', `${pos.shares} 股`],
          ['均价', `¥${fmt(pos.avgCost, 3)}`],
          ['持仓成本', `¥${fmt(pos.totalCost)}`],
          ['已实现盈亏', `${pos.realizedPnl >= 0 ? '+' : ''}${fmt(pos.realizedPnl)}`],
        ].map(([label, value]) => (
          <div key={label as string} style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'var(--text-1)', marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: (label as string) === '已实现盈亏' ? (pos.realizedPnl >= 0 ? '#10b981' : '#ef4444') : 'var(--text-0)' }}>{value}</div>
          </div>
        ))}
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr style={{ color: 'var(--text-1)', fontSize: 10, borderBottom: '1px solid var(--line)' }}>
            <th style={{ textAlign: 'left', padding: '6px 8px' }}>日期</th>
            <th style={{ textAlign: 'center', padding: '6px 8px' }}>类型</th>
            <th style={{ textAlign: 'right', padding: '6px 8px' }}>股数</th>
            <th style={{ textAlign: 'right', padding: '6px 8px' }}>价格</th>
            <th style={{ textAlign: 'right', padding: '6px 8px' }}>总额</th>
            <th style={{ textAlign: 'right', padding: '6px 8px' }}>佣金</th>
            <th style={{ textAlign: 'right', padding: '6px 8px' }}>印花税</th>
            <th style={{ textAlign: 'right', padding: '6px 8px' }}>过户费</th>
            <th style={{ textAlign: 'center', padding: '6px 8px', width: 40 }} />
          </tr>
        </thead>
        <tbody>
          {sorted.map(t => (
            <tr key={t.id} style={{ borderTop: '1px solid var(--line)' }}>
              <td style={{ padding: '5px 8px', color: 'var(--text-1)' }}>{t.date}</td>
              <td style={{ padding: '5px 8px', textAlign: 'center', color: STOCK_TYPE_COLOR[t.type], fontWeight: 600 }}>{STOCK_TYPE_LABEL[t.type]}</td>
              <td style={{ padding: '5px 8px', textAlign: 'right' }}>{t.type !== 'dividend' ? t.shares : '-'}</td>
              <td style={{ padding: '5px 8px', textAlign: 'right' }}>{t.type !== 'dividend' ? `¥${t.price.toFixed(3)}` : '-'}</td>
              <td style={{ padding: '5px 8px', textAlign: 'right' }}>¥{(t.total ?? t.shares * t.price).toFixed(2)}</td>
              <td style={{ padding: '5px 8px', textAlign: 'right', color: 'var(--text-1)' }}>{t.commission != null ? `¥${t.commission.toFixed(2)}` : '-'}</td>
              <td style={{ padding: '5px 8px', textAlign: 'right', color: 'var(--text-1)' }}>{t.stampTax != null ? `¥${t.stampTax.toFixed(2)}` : '-'}</td>
              <td style={{ padding: '5px 8px', textAlign: 'right', color: 'var(--text-1)' }}>{t.transferFee != null ? `¥${t.transferFee.toFixed(2)}` : '-'}</td>
              <td style={{ padding: '5px 8px', textAlign: 'center' }}>
                {delId === t.id ? (
                  <span style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                    <button type="button" onClick={async () => { await deleteTrade(code, t.id); onDelete(); onChanged?.(code); setDelId(null); }} style={{ padding: '1px 6px', fontSize: 10, borderRadius: 3, border: 'none', background: '#ef4444', color: '#fff', cursor: 'pointer' }}>确认</button>
                    <button type="button" onClick={() => setDelId(null)} style={{ padding: '1px 6px', fontSize: 10, borderRadius: 3, border: '1px solid var(--line)', background: 'transparent', color: 'var(--text-1)', cursor: 'pointer' }}>取消</button>
                  </span>
                ) : (
                  <button type="button" onClick={() => setDelId(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 2 }}><Trash2 size={12} /></button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Fund Trade List ───
function FundTradeList({ code, trades, onDelete, onChanged }: { code: string; trades: FundTradeRecord[]; onDelete: () => void; onChanged?: (code: string) => void }) {
  const pos = useMemo(() => computeFundPositionFromTrades(trades), [trades]);
  const sorted = useMemo(() => [...trades].sort((a, b) => b.date.localeCompare(a.date)), [trades]);
  const [delId, setDelId] = useState<string | null>(null);

  if (trades.length === 0) return <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-1)', fontSize: 12 }}>暂无交易记录</div>;

  return (
    <div>
      <div style={{ display: 'flex', gap: 16, marginBottom: 12, padding: 12, borderRadius: 8, background: 'var(--glass-bg)', border: '1px solid var(--line)' }}>
        {[
          ['持仓份额', `${fmt(pos.units, 4)} 份`],
          ['成本净值', `¥${fmt(pos.avgCost, 4)}`],
          ['成本金额', `¥${fmt(pos.totalCost)}`],
          ['已实现盈亏', `${pos.realizedPnl >= 0 ? '+' : ''}${fmt(pos.realizedPnl)}`],
        ].map(([label, value]) => (
          <div key={label as string} style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'var(--text-1)', marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: (label as string) === '已实现盈亏' ? (pos.realizedPnl >= 0 ? '#10b981' : '#ef4444') : 'var(--text-0)' }}>{value}</div>
          </div>
        ))}
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr style={{ color: 'var(--text-1)', fontSize: 10, borderBottom: '1px solid var(--line)' }}>
            <th style={{ textAlign: 'left', padding: '6px 8px' }}>日期</th>
            <th style={{ textAlign: 'center', padding: '6px 8px' }}>类型</th>
            <th style={{ textAlign: 'right', padding: '6px 8px' }}>份额</th>
            <th style={{ textAlign: 'right', padding: '6px 8px' }}>净值</th>
            <th style={{ textAlign: 'right', padding: '6px 8px' }}>金额</th>
            <th style={{ textAlign: 'right', padding: '6px 8px' }}>申购费</th>
            <th style={{ textAlign: 'right', padding: '6px 8px' }}>赎回费</th>
            <th style={{ textAlign: 'center', padding: '6px 8px', width: 40 }} />
          </tr>
        </thead>
        <tbody>
          {sorted.map(t => (
            <tr key={t.id} style={{ borderTop: '1px solid var(--line)' }}>
              <td style={{ padding: '5px 8px', color: 'var(--text-1)' }}>{t.date}</td>
              <td style={{ padding: '5px 8px', textAlign: 'center', color: FUND_TYPE_COLOR[t.type], fontWeight: 600 }}>{FUND_TYPE_LABEL[t.type]}</td>
              <td style={{ padding: '5px 8px', textAlign: 'right' }}>{t.type !== 'dividend' ? t.units.toFixed(4) : '-'}</td>
              <td style={{ padding: '5px 8px', textAlign: 'right' }}>{t.type !== 'dividend' ? `¥${t.nav.toFixed(4)}` : '-'}</td>
              <td style={{ padding: '5px 8px', textAlign: 'right' }}>¥{t.amount.toFixed(2)}</td>
              <td style={{ padding: '5px 8px', textAlign: 'right', color: 'var(--text-1)' }}>{t.subscriptionFee != null ? `¥${t.subscriptionFee.toFixed(2)}` : '-'}</td>
              <td style={{ padding: '5px 8px', textAlign: 'right', color: 'var(--text-1)' }}>{t.redemptionFee != null ? `¥${t.redemptionFee.toFixed(2)}` : '-'}</td>
              <td style={{ padding: '5px 8px', textAlign: 'center' }}>
                {delId === t.id ? (
                  <span style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                    <button type="button" onClick={async () => { await deleteFundTrade(code, t.id); onDelete(); onChanged?.(code); setDelId(null); }} style={{ padding: '1px 6px', fontSize: 10, borderRadius: 3, border: 'none', background: '#ef4444', color: '#fff', cursor: 'pointer' }}>确认</button>
                    <button type="button" onClick={() => setDelId(null)} style={{ padding: '1px 6px', fontSize: 10, borderRadius: 3, border: '1px solid var(--line)', background: 'transparent', color: 'var(--text-1)', cursor: 'pointer' }}>取消</button>
                  </span>
                ) : (
                  <button type="button" onClick={() => setDelId(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 2 }}><Trash2 size={12} /></button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main Page ───
export default function TradeHistoryPage({
  stockNames, fundNames, allStockCodes, allFundCodes,
  onStockTradesChanged,
  onFundTradesChanged,
}: {
  stockNames: Record<string, string>;
  fundNames: Record<string, string>;
  allStockCodes: string[];
  allFundCodes: string[];
  onStockTradesChanged?: (code: string) => void;
  onFundTradesChanged?: (code: string) => void;
}) {
  const [tab, setTab] = useState<'stocks' | 'funds'>('stocks');
  const [stockHistory, setStockHistory] = useState<Record<string, StockTradeRecord[]>>({});
  const [fundHistory, setFundHistory] = useState<Record<string, FundTradeRecord[]>>({});
  const [selectedStock, setSelectedStock] = useState<string | null>(null);
  const [selectedFund, setSelectedFund] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    const [s, f] = await Promise.all([loadTradeHistory(), loadFundTradeHistory()]);
    setStockHistory(s); setFundHistory(f);
  }, []);

  useEffect(() => { void loadAll(); }, [loadAll]);

  // 合并有交易记录的 + 持仓中无交易记录的
  const tradedStocks = useMemo(() => new Set(Object.keys(stockHistory)), [stockHistory]);
  const tradedFunds = useMemo(() => new Set(Object.keys(fundHistory)), [fundHistory]);
  const stockCodes = useMemo(() => {
    const all = new Set([...Object.keys(stockHistory), ...allStockCodes]);
    return [...all].sort();
  }, [stockHistory, allStockCodes]);
  const fundCodes = useMemo(() => {
    const all = new Set([...Object.keys(fundHistory), ...allFundCodes]);
    return [...all].sort();
  }, [fundHistory, allFundCodes]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '0 0 12px', borderBottom: '1px solid var(--line)', marginBottom: 12 }}>
        {(['stocks', 'funds'] as const).map(t => (
          <button key={t} type="button" onClick={() => { setTab(t); setSelectedStock(null); setSelectedFund(null); }}
            style={{ padding: '8px 18px', borderRadius: 8, border: t === tab ? '1px solid var(--brand)' : '1px solid transparent', background: t === tab ? 'var(--brand-soft)' : 'transparent', color: t === tab ? 'var(--brand)' : 'var(--text-1)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            {t === 'stocks' ? '股票交易' : '基金交易'}
            <span style={{ marginLeft: 6, opacity: 0.6, fontSize: 10 }}>{t === 'stocks' ? stockCodes.length : fundCodes.length}</span>
          </button>
        ))}
      </div>

      {tab === 'stocks' ? (
        <div style={{ display: 'flex', gap: 12, flex: 1, minHeight: 0 }}>
          {/* Left: stock list */}
          <div style={{ width: 160, flexShrink: 0, overflowY: 'auto', borderRight: '1px solid var(--line)', paddingRight: 8 }}>
            {stockCodes.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-1)', fontSize: 11 }}>暂无持仓，请先在股票列表添加</div>
            ) : stockCodes.map(code => {
              const trades = stockHistory[code] || [];
              const pos = computePositionFromTrades(trades);
              const hasTrades = tradedStocks.has(code);
              const name = stockNames[code] || code;
              return (
                <div key={code} onClick={() => { setSelectedStock(code); setSelectedFund(null); }}
                  style={{ padding: '10px 8px', borderRadius: 6, cursor: 'pointer', background: selectedStock === code ? 'var(--glass-bg-strong)' : 'transparent', marginBottom: 2, transition: 'background 0.1s', opacity: hasTrades ? 1 : 0.5 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-0)' }}>{name}</div>
                  <div style={{ fontSize: 9, color: 'var(--text-2)' }}>{code}</div>
                  {hasTrades ? (
                    <>
                      <div style={{ fontSize: 10, color: 'var(--text-1)', marginTop: 2 }}>{pos.shares} 股 · {pos.tradeCount} 笔</div>
                      <div style={{ fontSize: 10, color: pos.realizedPnl >= 0 ? '#10b981' : '#ef4444', fontWeight: 600 }}>{pos.realizedPnl >= 0 ? '+' : ''}{fmt(pos.realizedPnl)}</div>
                    </>
                  ) : (
                    <div style={{ fontSize: 10, color: 'var(--text-2)', marginTop: 2 }}>暂无交易</div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Right: detail */}
          <div style={{ flex: 1, overflowY: 'auto', minWidth: 0 }}>
            {selectedStock ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-0)' }}>{stockNames[selectedStock] || selectedStock} <span style={{ fontWeight: 400, fontSize: 11, color: 'var(--text-2)' }}>{selectedStock}</span></div>
                <StockTradeForm code={selectedStock} onAdded={loadAll} onChanged={onStockTradesChanged} />
                <StockTradeList code={selectedStock} trades={stockHistory[selectedStock] || []} onDelete={loadAll} onChanged={onStockTradesChanged} />
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-1)', fontSize: 12 }}>{stockCodes.length === 0 ? '请先在股票列表中添加持仓' : '← 选择股票开始记录交易'}</div>
            )}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 12, flex: 1, minHeight: 0 }}>
          <div style={{ width: 160, flexShrink: 0, overflowY: 'auto', borderRight: '1px solid var(--line)', paddingRight: 8 }}>
            {fundCodes.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-1)', fontSize: 11 }}>暂无持仓，请先在基金列表添加</div>
            ) : fundCodes.map(code => {
              const trades = fundHistory[code] || [];
              const pos = computeFundPositionFromTrades(trades);
              const hasTrades = tradedFunds.has(code);
              const name = fundNames[code] || code;
              return (
                <div key={code} onClick={() => { setSelectedFund(code); setSelectedStock(null); }}
                  style={{ padding: '10px 8px', borderRadius: 6, cursor: 'pointer', background: selectedFund === code ? 'var(--glass-bg-strong)' : 'transparent', marginBottom: 2, transition: 'background 0.1s', opacity: hasTrades ? 1 : 0.5 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-0)' }}>{name}</div>
                  <div style={{ fontSize: 9, color: 'var(--text-2)' }}>{code}</div>
                  {hasTrades ? (
                    <>
                      <div style={{ fontSize: 10, color: 'var(--text-1)', marginTop: 2 }}>{fmt(pos.units, 2)} 份 · {pos.tradeCount} 笔</div>
                      <div style={{ fontSize: 10, color: pos.realizedPnl >= 0 ? '#10b981' : '#ef4444', fontWeight: 600 }}>{pos.realizedPnl >= 0 ? '+' : ''}{fmt(pos.realizedPnl)}</div>
                    </>
                  ) : (
                    <div style={{ fontSize: 10, color: 'var(--text-2)', marginTop: 2 }}>暂无交易</div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', minWidth: 0 }}>
            {selectedFund ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-0)' }}>{fundNames[selectedFund] || selectedFund} <span style={{ fontWeight: 400, fontSize: 11, color: 'var(--text-2)' }}>{selectedFund}</span></div>
                <FundTradeForm code={selectedFund} onAdded={loadAll} onChanged={onFundTradesChanged} />
                <FundTradeList code={selectedFund} trades={fundHistory[selectedFund] || []} onDelete={loadAll} onChanged={onFundTradesChanged} />
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-1)', fontSize: 12 }}>{fundCodes.length === 0 ? '请先在基金列表中添加持仓' : '← 选择基金开始记录交易'}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
