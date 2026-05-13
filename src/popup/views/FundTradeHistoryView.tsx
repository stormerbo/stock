import { useState, useEffect, useMemo, useCallback } from 'react';
import { ChevronLeft, Plus, Trash2 } from 'lucide-react';
import {
  type FundTradeRecord,
  type FundTradeType,
  totalFundFees,
  computeFundPositionFromTrades,
  getFundTradesForCode,
  addFundTrade,
  deleteFundTrade,
} from '../../shared/fund-trade-history';
import { loadFeeConfig, DEFAULT_FEE_CONFIG, type FeeConfig } from '../../shared/fee-config';

type Props = {
  code: string;
  name: string;
  onBack: () => void;
  onUpdate: () => void;
};

type FormState = {
  date: string;
  type: FundTradeType;
  units: string;
  amount: string;
  nav: string;
  subscriptionFee: string;
  redemptionFee: string;
  note: string;
};

const INITIAL_FORM: FormState = {
  date: new Date().toISOString().slice(0, 10),
  type: 'subscribe',
  units: '',
  amount: '',
  nav: '',
  subscriptionFee: '',
  redemptionFee: '',
  note: '',
};

function formatNum(v: number, digits = 2): string {
  if (!Number.isFinite(v)) return '-';
  return v.toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

const formatCost = (v: number) => formatNum(v, 4);

const typeLabel: Record<FundTradeType, string> = {
  subscribe: '申购',
  redeem: '赎回',
  dividend: '分红',
};

const typeColor: Record<FundTradeType, string> = {
  subscribe: '#ef4444',
  redeem: '#10b981',
  dividend: '#f59e0b',
};

export default function FundTradeHistoryView({ code, name, onBack, onUpdate }: Props) {
  const [trades, setTrades] = useState<FundTradeRecord[]>([]);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    void loadTrades();
  }, [code]);

  async function loadTrades() {
    setLoading(true);
    const records = await getFundTradesForCode(code);
    setTrades(records);
    setLoading(false);
    onUpdate();
  }

  const computed = useMemo(() => computeFundPositionFromTrades(trades), [trades]);

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
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return { subscriptionFee: 0, redemptionFee: 0, total: 0 };
    }
    const subscriptionFee = form.type === 'subscribe'
      ? Math.round(amount * feeCfg.fundSubscriptionRate * 100) / 100 : 0;
    const redemptionFee = form.type === 'redeem'
      ? Math.round(amount * feeCfg.fundRedemptionRate * 100) / 100 : 0;
    return { subscriptionFee, redemptionFee, total: subscriptionFee + redemptionFee };
  }, [form.amount, form.type, feeCfg]);

  const fillDefaultFees = () => {
    const fees = calcDefaultFees();
    setForm((prev) => ({
      ...prev,
      subscriptionFee: fees.subscriptionFee > 0 ? String(fees.subscriptionFee) : prev.subscriptionFee,
      redemptionFee: fees.redemptionFee > 0 ? String(fees.redemptionFee) : prev.redemptionFee,
    }));
  };

  const validate = useCallback((): string | null => {
    if (form.type !== 'dividend') {
      const units = Number(form.units);
      if (!Number.isFinite(units) || units <= 0) return '请输入有效的份额（必须大于 0）';
      const nav = Number(form.nav);
      if (!Number.isFinite(nav) || nav <= 0) return '请输入有效的净值（必须大于 0）';
      const amount = Number(form.amount);
      if (!Number.isFinite(amount) || amount <= 0) return '请输入有效的金额（必须大于 0）';
    } else {
      const amount = Number(form.amount);
      if (!Number.isFinite(amount) || amount <= 0) return '请输入有效的金额（必须大于 0）';
    }
    if (form.date && !/^\d{4}-\d{2}-\d{2}$/.test(form.date)) return '请输入有效的日期格式 (YYYY-MM-DD)';
    for (const f of ['subscriptionFee', 'redemptionFee'] as const) {
      if (form[f] && (!Number.isFinite(Number(form[f])) || Number(form[f]) < 0)) {
        return `${f === 'subscriptionFee' ? '申购费' : '赎回费'}不能为负数`;
      }
    }
    if (form.type === 'redeem') {
      const redeemUnits = Number(form.units);
      if (Number.isFinite(redeemUnits) && redeemUnits > computed.units) {
        return `赎回份额不能超过当前持仓 ${computed.units.toFixed(4)} 份`;
      }
    }
    return null;
  }, [form, computed.units]);

  const handleAddTrade = async () => {
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    setError('');

    const units = form.type !== 'dividend' ? Number(form.units) : 0;
    const amount = Number(form.amount);
    const nav = form.type !== 'dividend' ? Number(form.nav) : 0;
    const subscriptionFee = form.subscriptionFee ? Number(form.subscriptionFee) : undefined;
    const redemptionFee = form.redemptionFee ? Number(form.redemptionFee) : undefined;

    await addFundTrade({
      fundCode: code,
      date: form.date || new Date().toISOString().slice(0, 10),
      type: form.type,
      units,
      amount,
      nav,
      subscriptionFee,
      redemptionFee,
      note: form.note || undefined,
    });

    setForm(INITIAL_FORM);
    await loadTrades();
  };

  const handleDelete = async (tradeId: string) => {
    await deleteFundTrade(code, tradeId);
    setDeleteConfirm(null);
    await loadTrades();
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

  return (
    <section className="detail-view">
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

      <div className="tag-editor-body" style={{ padding: '8px 0 0' }}>
        <div style={{ display: 'flex', gap: 12, marginBottom: 12, padding: '8px 10px', background: 'var(--bg-2)', borderRadius: 6 }}>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'var(--text-1)', marginBottom: 2 }}>持仓份额</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-0)' }}>{formatCost(computed.units)} 份</div>
          </div>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'var(--text-1)', marginBottom: 2 }}>成本净值</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-0)' }}>¥{formatCost(computed.avgCost)}</div>
          </div>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'var(--text-1)', marginBottom: 2 }}>成本金额</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-0)' }}>¥{formatNum(computed.totalCost)}</div>
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
                    <th style={{ textAlign: 'right', padding: '2px 4px' }}>份额</th>
                    <th style={{ textAlign: 'right', padding: '2px 4px' }}>净值</th>
                    <th style={{ textAlign: 'right', padding: '2px 4px' }}>金额</th>
                    <th style={{ textAlign: 'right', padding: '2px 4px' }}>申购费</th>
                    <th style={{ textAlign: 'right', padding: '2px 4px' }}>赎回费</th>
                    <th style={{ textAlign: 'center', padding: '2px 4px' }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedTrades.map((t) => {
                    const fees = totalFundFees(t);
                    return (
                      <tr key={t.id} style={{ borderTop: '1px solid var(--line)' }}>
                        <td style={{ padding: '3px 4px', color: 'var(--text-1)' }}>{t.date}</td>
                        <td style={{ padding: '3px 4px', textAlign: 'center', color: typeColor[t.type], fontWeight: 600 }}>
                          {typeLabel[t.type]}
                        </td>
                        <td style={{ padding: '3px 4px', textAlign: 'right', color: 'var(--text-0)' }}>
                          {t.type !== 'dividend' ? t.units.toFixed(4) : '-'}
                        </td>
                        <td style={{ padding: '3px 4px', textAlign: 'right', color: 'var(--text-0)' }}>
                          {t.type !== 'dividend' ? `¥${t.nav.toFixed(4)}` : '-'}
                        </td>
                        <td style={{ padding: '3px 4px', textAlign: 'right', color: 'var(--text-0)' }}>
                          ¥{t.amount.toFixed(2)}
                        </td>
                        <td style={{ padding: '3px 4px', textAlign: 'right', color: 'var(--text-1)' }}>
                          {t.subscriptionFee != null ? `¥${t.subscriptionFee.toFixed(2)}` : (t.type === 'subscribe' && fees > 0 ? '¥' + fees.toFixed(2) : '-')}
                        </td>
                        <td style={{ padding: '3px 4px', textAlign: 'right', color: 'var(--text-1)' }}>
                          {t.redemptionFee != null ? `¥${t.redemptionFee.toFixed(2)}` : '-'}
                        </td>
                        <td style={{ padding: '3px 4px', textAlign: 'center' }}>
                          {deleteConfirm === t.id ? (
                            <span style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                              <button type="button" className="tag-editor-confirm-btn" style={{ fontSize: 10, padding: '1px 6px' }} onClick={() => handleDelete(t.id)}>确认</button>
                              <button type="button" className="tag-editor-btn-cancel" style={{ fontSize: 10, padding: '1px 6px', border: 'none', borderRadius: 3, cursor: 'pointer' }} onClick={() => setDeleteConfirm(null)}>取消</button>
                            </span>
                          ) : (
                            <button type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 2 }} onClick={() => setDeleteConfirm(t.id)} title="删除">
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

        <div className="tag-editor-section">
          <span className="tag-editor-label">添加交易记录</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                type="date"
                className="tag-editor-new-input"
                style={{ flex: 1 }}
                value={form.date}
                onChange={(e) => handleFormChange('date', e.target.value)}
              />
              <select
                className="tag-editor-new-input"
                style={{ flex: 1, cursor: 'pointer' }}
                value={form.type}
                onChange={(e) => handleFormChange('type', e.target.value as FundTradeType)}
              >
                <option value="subscribe">申购</option>
                <option value="redeem">赎回</option>
                <option value="dividend">分红</option>
              </select>
            </div>
            {form.type !== 'dividend' && (
              <>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    className="tag-editor-new-input"
                    style={{ flex: 1 }}
                    type="number"
                    step="0.0001"
                    min="0"
                    placeholder="份额"
                    value={form.units}
                    onChange={(e) => handleFormChange('units', e.target.value)}
                  />
                  <input
                    className="tag-editor-new-input"
                    style={{ flex: 1 }}
                    type="number"
                    step="0.0001"
                    min="0"
                    placeholder="净值（支持4位小数）"
                    value={form.nav}
                    onChange={(e) => handleFormChange('nav', e.target.value)}
                  />
                </div>
              </>
            )}
            {/* Row: auto-calculate fees */}
            {form.type !== 'dividend' && (() => {
              const est = calcDefaultFees();
              if (est.total <= 0) return null;
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, color: 'var(--text-1)', padding: '2px 4px', background: 'var(--brand-soft)', borderRadius: 4 }}>
                  <span>预估费用：{est.subscriptionFee > 0 ? `申购费 ¥${est.subscriptionFee.toFixed(2)}` : ''}{est.redemptionFee > 0 ? ` 赎回费 ¥${est.redemptionFee.toFixed(2)}` : ''} = <b style={{ color: 'var(--text-0)' }}>¥{est.total.toFixed(2)}</b></span>
                  <button type="button" style={{ marginLeft: 'auto', padding: '1px 8px', fontSize: 10, borderRadius: 3, border: '1px solid var(--brand)', background: 'var(--brand-soft)', color: 'var(--brand)', cursor: 'pointer', fontWeight: 600 }} onClick={fillDefaultFees}>填入</button>
                </div>
              );
            })()}
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                className="tag-editor-new-input"
                style={{ flex: 1 }}
                type="number"
                step="0.01"
                min="0"
                placeholder={form.type === 'dividend' ? '分红金额（必填）' : '交易金额（必填）'}
                value={form.amount}
                onChange={(e) => handleFormChange('amount', e.target.value)}
              />
              {form.type === 'subscribe' || form.type === 'dividend' ? (
                <input
                  style={{ ...inputStyle, width: 0, flex: 1 }}
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="申购费（0.15%）"
                  value={form.subscriptionFee}
                  onChange={(e) => handleFormChange('subscriptionFee', e.target.value)}
                />
              ) : null}
              {form.type === 'redeem' || form.type === 'dividend' ? (
                <input
                  style={{ ...inputStyle, width: 0, flex: 1 }}
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="赎回费（0.5%）"
                  value={form.redemptionFee}
                  onChange={(e) => handleFormChange('redemptionFee', e.target.value)}
                />
              ) : null}
              {(form.subscriptionFee || form.redemptionFee) ? (
                <div style={{ ...inputStyle, width: 0, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.6, fontSize: 10, borderColor: 'transparent', background: 'transparent' }}>
                  费用合计: ¥{(Number(form.subscriptionFee || 0) + Number(form.redemptionFee || 0)).toFixed(2)}
                </div>
              ) : null}
            </div>
            <input
              className="tag-editor-new-input"
              placeholder="备注（选填）"
              value={form.note}
              onChange={(e) => handleFormChange('note', e.target.value)}
            />
            {error && (
              <div style={{ fontSize: 11, color: '#ef4444' }}>{error}</div>
            )}
            <button type="button" className="tag-editor-btn tag-editor-btn-save" style={{ alignSelf: 'flex-end' }} onClick={handleAddTrade}>
              <Plus size={12} style={{ marginRight: 4 }} /> 添加记录
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
