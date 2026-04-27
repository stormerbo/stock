import { useState, useEffect, useMemo, useCallback } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import {
  type StockTradeRecord,
  type TradeComputedPosition,
  type TradeType,
  computePositionFromTrades,
  getTradesForStock,
  addTrade,
  deleteTrade,
} from '../shared/trade-history';

type Props = {
  code: string;
  name: string;
  onClose: () => void;
  onUpdate: () => void;
};

type FormState = {
  date: string;
  type: TradeType;
  shares: string;
  price: string;
  total: string;
  fees: string;
  note: string;
};

const INITIAL_FORM: FormState = {
  date: new Date().toISOString().slice(0, 10),
  type: 'buy',
  shares: '',
  price: '',
  total: '',
  fees: '',
  note: '',
};

function formatNum(v: number): string {
  if (!Number.isFinite(v)) return '-';
  return v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function TradeHistoryModal({ code, name, onClose, onUpdate }: Props) {
  const [trades, setTrades] = useState<StockTradeRecord[]>([]);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    void loadTrades();
  }, [code]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

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

  const validate = useCallback((): string | null => {
    if (form.type !== 'dividend') {
      const shares = Number(form.shares);
      if (!Number.isFinite(shares) || shares <= 0) return '请输入有效的股数（必须大于 0）';
      const price = Number(form.price);
      if (!Number.isFinite(price) || price <= 0) return '请输入有效的价格（必须大于 0）';
    }
    if (form.date && !/^\d{4}-\d{2}-\d{2}$/.test(form.date)) return '请输入有效的日期格式 (YYYY-MM-DD)';
    const fees = form.fees ? Number(form.fees) : 0;
    if (form.fees && (!Number.isFinite(fees) || fees < 0)) return '费用不能为负数';

    // Check sell exceeds position
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
    const fees = form.fees ? Number(form.fees) : undefined;

    await addTrade({
      stockCode: code,
      date: form.date || new Date().toISOString().slice(0, 10),
      type: form.type,
      shares,
      price,
      total,
      fees,
      note: form.note || undefined,
    });

    setForm(INITIAL_FORM);
    await loadTrades();
  };

  const handleDelete = async (tradeId: string) => {
    await deleteTrade(code, tradeId);
    setDeleteConfirm(null);
    await loadTrades();
  };

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

  const toneClass = (v: number) => (v >= 0 ? 'up' : 'down');

  return (
    <div className="tag-editor-overlay" style={{ zIndex: 1100 }}>
      <div
        className="tag-editor-modal"
        style={{ minWidth: 420, maxWidth: 520 }}
        ref={(ref) => {
          if (ref) {
            const handleClickOutside = (e: MouseEvent) => {
              if (!ref.contains(e.target as Node)) onClose();
            };
            setTimeout(() => document.addEventListener('mousedown', handleClickOutside), 0);
          }
        }}
      >
        {/* Header */}
        <div className="tag-editor-header">
          <span className="tag-editor-title">{name} ({code}) — 交易记录</span>
          <button type="button" className="tag-editor-close" onClick={onClose}>
            <X size={14} />
          </button>
        </div>

        <div className="tag-editor-body">
          {/* Summary Card */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 12, padding: '8px 10px', background: 'var(--bg-2)', borderRadius: 6 }}>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: 'var(--text-1)', marginBottom: 2 }}>持仓</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-0)' }}>{computed.shares} 股</div>
            </div>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: 'var(--text-1)', marginBottom: 2 }}>均价</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-0)' }}>¥{formatNum(computed.avgCost)}</div>
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
              <div style={{ maxHeight: 200, overflowY: 'auto', fontSize: 11 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ color: 'var(--text-1)', fontSize: 10 }}>
                      <th style={{ textAlign: 'left', padding: '2px 4px' }}>日期</th>
                      <th style={{ textAlign: 'center', padding: '2px 4px' }}>类型</th>
                      <th style={{ textAlign: 'right', padding: '2px 4px' }}>股数</th>
                      <th style={{ textAlign: 'right', padding: '2px 4px' }}>价格</th>
                      <th style={{ textAlign: 'right', padding: '2px 4px' }}>总额</th>
                      <th style={{ textAlign: 'center', padding: '2px 4px' }}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedTrades.map((t) => (
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
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Add Trade Form */}
          <div className="tag-editor-section">
            <span className="tag-editor-label">添加交易记录</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
              {/* Row 1: date + type */}
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
                  onChange={(e) => handleFormChange('type', e.target.value as TradeType)}
                >
                  <option value="buy">买入</option>
                  <option value="sell">卖出</option>
                  <option value="dividend">分红</option>
                </select>
              </div>
              {/* Row 2: shares + price */}
              {form.type !== 'dividend' && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    className="tag-editor-new-input"
                    style={{ flex: 1 }}
                    type="number"
                    step="1"
                    min="1"
                    placeholder="股数"
                    value={form.shares}
                    onChange={(e) => handleFormChange('shares', e.target.value)}
                  />
                  <input
                    className="tag-editor-new-input"
                    style={{ flex: 1 }}
                    type="number"
                    step="0.001"
                    min="0"
                    placeholder="价格"
                    value={form.price}
                    onChange={(e) => handleFormChange('price', e.target.value)}
                  />
                </div>
              )}
              {/* Row 3: total + fees */}
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  className="tag-editor-new-input"
                  style={{ flex: 1 }}
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder={form.type === 'dividend' ? '金额（必填）' : '总金额（选填）'}
                  value={form.total}
                  onChange={(e) => handleFormChange('total', e.target.value)}
                />
                <input
                  className="tag-editor-new-input"
                  style={{ flex: 1 }}
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="费用（选填）"
                  value={form.fees}
                  onChange={(e) => handleFormChange('fees', e.target.value)}
                />
              </div>
              {/* Row 4: note */}
              <input
                className="tag-editor-new-input"
                placeholder="备注（选填）"
                value={form.note}
                onChange={(e) => handleFormChange('note', e.target.value)}
              />
              {/* Error + submit */}
              {error && (
                <div style={{ fontSize: 11, color: '#ef4444' }}>{error}</div>
              )}
              <button type="button" className="tag-editor-btn tag-editor-btn-save" style={{ alignSelf: 'flex-end' }} onClick={handleAddTrade}>
                <Plus size={12} style={{ marginRight: 4 }} /> 添加记录
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
