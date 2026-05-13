import { useMemo } from 'react';
import { ChevronRight } from 'lucide-react';
import {
  type StockTradeRecord,
  computePositionFromTrades,
} from '../../shared/trade-history';

type Props = {
  tradeHistory: Record<string, StockTradeRecord[]>;
  stockNameMap?: Record<string, string>;
  onSelectStock: (code: string, name: string) => void;
};

function formatNum(v: number, digits = 2): string {
  if (!Number.isFinite(v)) return '-';
  return v.toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

const formatCost = (v: number) => formatNum(v, 3);

export default function TradeHistoryList({ tradeHistory, stockNameMap = {}, onSelectStock }: Props) {
  const stocks = useMemo(() => {
    const getName = (code: string): string => stockNameMap[code] || code;
    return Object.entries(tradeHistory)
      .map(([code, trades]) => {
        const computed = computePositionFromTrades(trades);
        return { code, name: getName(code), trades, ...computed };
      })
      .sort((a, b) => b.tradeCount - a.tradeCount);
  }, [tradeHistory, stockNameMap]);

  const totalTradeCount = useMemo(
    () => stocks.reduce((sum, s) => sum + s.tradeCount, 0),
    [stocks],
  );

  if (stocks.length === 0) {
    return (
      <div className="tag-editor-body" style={{ padding: '8px 0' }}>
        <div className="tag-editor-empty" style={{ marginTop: 20, textAlign: 'center' }}>
          暂无交易记录<br />
          <span style={{ fontSize: 11, color: 'var(--text-1)' }}>
            在股票列表中右键点击股票 → 交易记录 即可添加
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="tag-editor-body" style={{ padding: '8px 0' }}>
      <div style={{ fontSize: 11, color: 'var(--text-1)', marginBottom: 8, padding: '0 4px' }}>
        共 {stocks.length} 只股票，{totalTradeCount} 笔交易
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {stocks.map((s) => (
          <button
            key={s.code}
            type="button"
            onClick={() => onSelectStock(s.code, s.name)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 10px',
              background: 'var(--bg-2)',
              border: '1px solid var(--line)',
              borderRadius: 8,
              cursor: 'pointer',
              color: 'var(--text-0)',
              fontSize: 12,
              textAlign: 'left',
              width: '100%',
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-3)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'var(--bg-2)'}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, marginBottom: 2 }}>
                {s.name}
                <span style={{ marginLeft: 6, fontWeight: 400, fontSize: 11, color: 'var(--text-1)' }}>{s.code}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexShrink: 0 }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 10, color: 'var(--text-1)' }}>持仓</div>
                <div style={{ fontWeight: 600 }}>{s.shares} 股</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 10, color: 'var(--text-1)' }}>均价</div>
                <div style={{ fontWeight: 600 }}>¥{formatCost(s.avgCost)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 10, color: 'var(--text-1)' }}>已实现盈亏</div>
                <div style={{ fontWeight: 600, color: s.realizedPnl >= 0 ? '#10b981' : '#ef4444' }}>
                  {s.realizedPnl >= 0 ? '+' : ''}{formatNum(s.realizedPnl)}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 10, color: 'var(--text-1)' }}>笔数</div>
                <div style={{ fontWeight: 600 }}>{s.tradeCount}</div>
              </div>
              <ChevronRight size={14} style={{ color: 'var(--text-1)', flexShrink: 0 }} />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
