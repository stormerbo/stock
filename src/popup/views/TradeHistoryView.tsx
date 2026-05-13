import { useState, useEffect, useMemo, useCallback } from 'react';
import { ChevronLeft, Plus, Trash2, X } from 'lucide-react';
import {
  type StockTradeRecord,
  type TradeType,
  totalFees,
  computePositionFromTrades,
  getTradesForStock,
  addTrade,
  deleteTrade,
} from '../../shared/trade-history';
import { loadFeeConfig, DEFAULT_FEE_CONFIG, type FeeConfig } from '../../shared/fee-config';

type Props = {
  code: string;
  name: string;
  onBack: () => void;
  onUpdate: () => void;
};

type FormState = {
  date: string;
  type: TradeType;
  shares: string;
  price: string;
  total: string;
  commission: string;
  stampTax: string;
  transferFee: string;
  note: string;
};

const INITIAL_FORM: FormState = {
  date: new Date().toISOString().slice(0, 10),
  type: 'buy',
  shares: '',
  price: '',
  total: '',
  commission: '',
  stampTax: '',
  transferFee: '',
  note: '',
};

function formatNum(v: number, digits = 2): string {
  if (!Number.isFinite(v)) return '-';
  return v.toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

const formatCost = (v: number) => formatNum(v, 3);

const typeLabel: Record<TradeType, string> = {
  buy: '买入',
  sell: '卖出',
  dividend: '分红',
};

const typeColor: Record<TradeType, string> = {
  buy: '#ef4444',
  sell: '#10b981',
  dividend: '#f59e0b',
};

export default function TradeHistoryView({ code, name, onBack, onUpdate }: Props) {
  const [trades, setTrades] = useState<StockTradeRecord[]>([]);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    void loadTrades();
  }, [code]);

  async function loadTrades() {
    setLoading(true);
    const records = await getTradesForStock(code);
    setTrades(records);
    setLoading(false);
    onUpdate();
  }

  const computed = useMemo(() => computePositionFromTrades(trades), [trades]);

  const sortedTrades = useMemo(
    () => [...trades].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
    [trades],
  );

  const handleFormChange = (field: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const [feeCfg, setFeeCfg] = useState<FeeConfig>(DEFAULT_FEE_CONFIG);
  useEffect(() => { loadFeeConfig().then(setFeeCfg); }, []);

  const calcDefaultFees = useCallback(() => {
    const shares = Number(form.shares);
    const price = Number(form.price);
    if (!Number.isFinite(shares) || shares <= 0 || !Number.isFinite(price) || price <= 0) {
      return { commission: 0, stampTax: 0, transferFee: 0, total: 0 };
    }
    const amount = shares * price;
    const commission = Math.max(Math.round(amount * feeCfg.stockCommissionRate * 100) / 100, feeCfg.stockCommissionMin);
    const stampTax = form.type === 'sell' ? Math.round(amount * feeCfg.stockStampTaxRate * 100) / 100 : 0;
    const transferFee = Math.round(amount * feeCfg.stockTransferFeeRate * 100) / 100;
    return { commission, stampTax, transferFee, total: commission + stampTax + transferFee };
  }, [form.shares, form.price, form.type, feeCfg]);

  const fillDefaultFees = () => {
    const fees = calcDefaultFees();
    setForm((prev) => ({
      ...prev,
      commission: fees.commission > 0 ? String(fees.commission) : prev.commission,
      stampTax: fees.stampTax > 0 ? String(fees.stampTax) : prev.stampTax,
      transferFee: fees.transferFee > 0 ? String(fees.transferFee) : prev.transferFee,
    }));
  };

  const validate = useCallback((): string | null => {
    if (form.type !== 'dividend') {
      const shares = Number(form.shares);
      if (!Number.isFinite(shares) || shares <= 0) return '请输入有效的股数（必须大于 0）';
      const price = Number(form.price);
      if (!Number.isFinite(price) || price <= 0) return '请输入有效的价格（必须大于 0）';
    }
    if (form.date && !/^\d{4}-\d{2}-\d{2}$/.test(form.date)) return '请输入有效的日期格式 (YYYY-MM-DD)';
    for (const f of ['commission', 'stampTax', 'transferFee'] as const) {
      if (form[f] && (!Number.isFinite(Number(form[f])) || Number(form[f]) < 0)) {
        return `${f === 'commission' ? '手续费' : f === 'stampTax' ? '印花税' : '过户费'}不能为负数`;
      }
    }

    if (form.type === 'sell') {
      const sellShares = Number(form.shares);
      if (Number.isFinite(sellShares) && sellShares > computed.shares) {
        return `卖出股数不能超过当前持仓 ${computed.shares} 股`;
      }
    }

    return null;
  }, [form, computed.shares]);

  const handleAddTrade = async () => {
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    setError('');

    const shares = form.type !== 'dividend' ? Math.round(Number(form.shares)) : 0;
    const price = form.type !== 'dividend' ? Number(form.price) : 0;
    const total = form.total ? Number(form.total) : undefined;
    const commission = form.commission ? Number(form.commission) : undefined;
    const stampTax = form.stampTax ? Number(form.stampTax) : undefined;
    const transferFee = form.transferFee ? Number(form.transferFee) : undefined;

    await addTrade({
      stockCode: code,
      date: form.date || new Date().toISOString().slice(0, 10),
      type: form.type,
      shares,
      price,
      total,
      commission,
      stampTax,
      transferFee,
      note: form.note || undefined,
    });

    setShowAddModal(false);
    setForm(INITIAL_FORM);
    await loadTrades();
  };

  const handleDelete = async (tradeId: string) => {
    await deleteTrade(code, tradeId);
    setDeleteConfirm(null);
    await loadTrades();
  };

  const totalFeeInput = (): number => {
    const c = Number(form.commission || 0);
    const s = Number(form.stampTax || 0);
    const t = Number(form.transferFee || 0);
    return c + s + t;
  };

  const inputStyle: React.CSSProperties = {
    flex: 1,
    padding: '4px 6px',
    fontSize: 11,
    border: '1px solid var(--line)',
    borderRadius: 4,
    background: 'var(--bg-0)',
    color: 'var(--text-0)',
    outline: 'none',
    minWidth: 0,
  };

  const inputNumberProps = (step: string, min = '0') => ({
    type: 'number' as const,
    step,
    min,
    style: { ...inputStyle, width: 0 },
  });

  return (
    <section className="detail-view">
      {/* Header */}
      <div className="detail-header">
        <button type="button" className="detail-back-btn" onClick={onBack}>
          <ChevronLeft size={16} />
        </button>
        <h2 className="detail-title">
          {name}
          <span className="detail-subtitle">{code}</span>
          <span className="detail-subtitle" style={{ marginLeft: 8, fontWeight: 400, fontSize: 12 }}>交易记录</span>
        </h2>
      </div>

      {/* Summary Card */}
      <div className="tag-editor-body" style={{ padding: '8px 0 0' }}>
        <div style={{ display: 'flex', gap: 12, marginBottom: 12, padding: '8px 10px', background: 'var(--bg-2)', borderRadius: 6 }}>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'var(--text-1)', marginBottom: 2 }}>持仓</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-0)' }}>{computed.shares} 股</div>
          </div>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'var(--text-1)', marginBottom: 2 }}>均价</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-0)' }}>¥{formatCost(computed.avgCost)}</div>
          </div>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'var(--text-1)', marginBottom: 2 }}>持仓成本</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-0)' }}>¥{formatCost(computed.totalCost)}</div>
          </div>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'var(--text-1)', marginBottom: 2 }}>已实现盈亏</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: computed.realizedPnl >= 0 ? '#10b981' : '#ef4444' }}>
              {computed.realizedPnl >= 0 ? '+' : ''}{formatNum(computed.realizedPnl)}
            </div>
          </div>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'var(--text-1)', marginBottom: 2 }}>笔数</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-0)' }}>{computed.tradeCount}</div>
          </div>
        </div>

        {/* Trade Table */}
        <div className="tag-editor-section">
          <span className="tag-editor-label">
            交易流水 {loading && <span style={{ color: 'var(--text-1)', opacity: 0.6 }}>(加载中...)</span>}
          </span>
          {sortedTrades.length === 0 ? (
            <div className="tag-editor-empty" style={{ marginTop: 4 }}>暂无交易记录，请添加第一笔交易</div>
          ) : (
            <div style={{ maxHeight: 260, overflowY: 'auto', fontSize: 11 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ color: 'var(--text-1)', fontSize: 10 }}>
                    <th style={{ textAlign: 'left', padding: '2px 4px' }}>日期</th>
                    <th style={{ textAlign: 'center', padding: '2px 4px' }}>类型</th>
                    <th style={{ textAlign: 'right', padding: '2px 4px' }}>股数</th>
                    <th style={{ textAlign: 'right', padding: '2px 4px' }}>价格</th>
                    <th style={{ textAlign: 'right', padding: '2px 4px' }}>总额</th>
                    <th style={{ textAlign: 'right', padding: '2px 4px' }}>手续费</th>
                    <th style={{ textAlign: 'right', padding: '2px 4px' }}>印花税</th>
                    <th style={{ textAlign: 'right', padding: '2px 4px' }}>过户费</th>
                    <th style={{ textAlign: 'center', padding: '2px 4px' }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedTrades.map((t) => {
                    const fees = totalFees(t);
                    return (
                      <tr key={t.id} style={{ borderTop: '1px solid var(--line)' }}>
                        <td style={{ padding: '3px 4px', color: 'var(--text-1)' }}>{t.date}</td>
                        <td style={{ padding: '3px 4px', textAlign: 'center', color: typeColor[t.type], fontWeight: 600 }}>
                          {typeLabel[t.type]}
                        </td>
                        <td style={{ padding: '3px 4px', textAlign: 'right', color: 'var(--text-0)' }}>
                          {t.type !== 'dividend' ? t.shares : '-'}
                        </td>
                        <td style={{ padding: '3px 4px', textAlign: 'right', color: 'var(--text-0)' }}>
                          {t.type !== 'dividend' ? `¥${t.price.toFixed(3)}` : '-'}
                        </td>
                        <td style={{ padding: '3px 4px', textAlign: 'right', color: 'var(--text-0)' }}>
                          ¥{(t.total ?? t.shares * t.price).toFixed(2)}
                        </td>
                        <td style={{ padding: '3px 4px', textAlign: 'right', color: 'var(--text-1)' }}>
                          {t.commission != null ? `¥${t.commission.toFixed(2)}` : (fees > 0 ? '¥' + fees.toFixed(2) : '-')}
                        </td>
                        <td style={{ padding: '3px 4px', textAlign: 'right', color: 'var(--text-1)' }}>
                          {t.stampTax != null ? `¥${t.stampTax.toFixed(2)}` : '-'}
                        </td>
                        <td style={{ padding: '3px 4px', textAlign: 'right', color: 'var(--text-1)' }}>
                          {t.transferFee != null ? `¥${t.transferFee.toFixed(2)}` : '-'}
                        </td>
                        <td style={{ padding: '3px 4px', textAlign: 'center' }}>
                          {deleteConfirm === t.id ? (
                            <span style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                              <button type="button" className="tag-editor-confirm-btn" style={{ fontSize: 10, padding: '1px 6px' }} onClick={() => handleDelete(t.id)}>确认</button>
                              <button type="button" className="tag-editor-btn-cancel" style={{ fontSize: 10, padding: '1px 6px', border: 'none', borderRadius: 3, cursor: 'pointer' }} onClick={() => setDeleteConfirm(null)}>取消</button>
                            </span>
                          ) : (
                            <button type="button" className="trade-delete-btn" onClick={() => setDeleteConfirm(t.id)} title="删除">
                              <Trash2 size={12} />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Add Trade Button */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <button type="button" className="tag-editor-btn tag-editor-btn-save" onClick={() => { setForm(INITIAL_FORM); setShowAddModal(true); }}>
            <Plus size={12} style={{ marginRight: 4 }} /> 新增交易
          </button>
        </div>
      </div>

      {/* ─── Add Trade Modal ─── */}
      {showAddModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 200,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.45)',
        }} onClick={() => setShowAddModal(false)}>
            <div style={{
              background: 'var(--bg-1)', borderRadius: 12, padding: 20,
              width: 420, maxHeight: '90vh', overflow: 'auto',
              display: 'flex', flexDirection: 'column', gap: 10,
              border: '1px solid var(--glass-border)', boxShadow: '0 12px 36px rgba(0,0,0,0.25)',
            }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>新增交易记录</span>
                <button type="button" onClick={() => setShowAddModal(false)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, border: 'none', background: 'transparent', color: 'var(--text-1)', cursor: 'pointer', borderRadius: 4 }}>
                  <X size={16} />
                </button>
              </div>

              {/* Row 1: date + type */}
              <div style={{ display: 'flex', gap: 6 }}>
                <input type="date" className="tag-editor-new-input" style={{ flex: 1 }}
                  value={form.date} onChange={(e) => handleFormChange('date', e.target.value)} />
                <select className="tag-editor-new-input" style={{ flex: 1, cursor: 'pointer' }}
                  value={form.type} onChange={(e) => handleFormChange('type', e.target.value as TradeType)}>
                  <option value="buy">买入</option>
                  <option value="sell">卖出</option>
                  <option value="dividend">分红</option>
                </select>
              </div>

              {/* Row 2: shares + price */}
              {form.type !== 'dividend' && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <input className="tag-editor-new-input" style={{ flex: 1 }} type="number" step="1" min="1" placeholder="股数"
                    value={form.shares} onChange={(e) => handleFormChange('shares', e.target.value)} />
                  <input className="tag-editor-new-input" style={{ flex: 1 }} type="number" step="0.001" min="0" placeholder="价格（支持3位小数）"
                    value={form.price} onChange={(e) => handleFormChange('price', e.target.value)} />
                </div>
              )}

              {/* Auto-calculate fees */}
              {form.type !== 'dividend' && (() => {
                const est = calcDefaultFees();
                if (est.total <= 0) return null;
                return (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, color: 'var(--text-1)', padding: '6px 8px', background: 'var(--brand-soft)', borderRadius: 4 }}>
                    <span>预估：¥{est.commission.toFixed(2)} 佣金 {form.type === 'sell' ? `+ ¥${est.stampTax.toFixed(2)} 印花税` : ''} + ¥{est.transferFee.toFixed(2)} 过户费 = <b>¥{est.total.toFixed(2)}</b></span>
                    <button type="button" style={{ marginLeft: 'auto', padding: '2px 10px', fontSize: 10, borderRadius: 4, border: '1px solid var(--brand)', background: 'var(--brand-soft)', color: 'var(--brand)', cursor: 'pointer', fontWeight: 600 }} onClick={fillDefaultFees}>填入</button>
                  </div>
                );
              })()}

              {/* Fee inputs */}
              <div style={{ display: 'flex', gap: 6 }}>
                <input style={{ ...inputStyle, flex: 1 }} type="number" step="0.01" min="0"
                  placeholder={form.type === 'dividend' ? '金额（必填）' : '总金额（选填）'}
                  value={form.total} onChange={(e) => handleFormChange('total', e.target.value)} />
                <input style={{ ...inputStyle, flex: 1 }} type="number" step="0.01" min="0" placeholder="佣金"
                  value={form.commission} onChange={(e) => handleFormChange('commission', e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input style={{ ...inputStyle, flex: 1 }} type="number" step="0.01" min="0"
                  placeholder={form.type === 'sell' ? '印花税（卖出万5）' : '印花税（仅卖出）'}
                  value={form.stampTax} onChange={(e) => handleFormChange('stampTax', e.target.value)} />
                <input style={{ ...inputStyle, flex: 1 }} type="number" step="0.01" min="0" placeholder="过户费"
                  value={form.transferFee} onChange={(e) => handleFormChange('transferFee', e.target.value)} />
              </div>

              <input className="tag-editor-new-input" placeholder="备注（选填）"
                value={form.note} onChange={(e) => handleFormChange('note', e.target.value)} />

              {error && <div style={{ fontSize: 11, color: '#ef4444' }}>{error}</div>}

              <button type="button" className="tag-editor-btn tag-editor-btn-save" style={{ alignSelf: 'flex-end' }} onClick={handleAddTrade}>
                <Plus size={12} style={{ marginRight: 4 }} /> 确认添加
              </button>
            </div>
          </div>
      )}
    </section>
  );
}
