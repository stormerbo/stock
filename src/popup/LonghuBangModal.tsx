import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowUpDown } from 'lucide-react';
import { fetchLonghuBang, type LonghuBangStock } from '../shared/longhubang';

type Props = {
  stockCodes: string[];
  onBack: () => void;
};

function toNumber(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : Number.NaN;
}

function formatMoney(amount: number): string {
  if (!Number.isFinite(amount)) return '-';
  const yi = amount / 100000000;
  return `${yi >= 0 ? '+' : ''}${yi.toFixed(2)}亿`;
}

function formatPct(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

type SortMode = 'netBuy' | 'changeRate';

export default function LonghuBangModal({ stockCodes, onBack }: Props) {
  const [stocks, setStocks] = useState<LonghuBangStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('netBuy');
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const list = await fetchLonghuBang();
        if (cancelled) return;
        setStocks(list);
        setError('');
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : '龙虎榜数据加载失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onBackRef.current();
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      cancelled = true;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const sorted = useMemo(() => {
    const arr = [...stocks];
    if (sortMode === 'netBuy') {
      arr.sort((a, b) => toNumber(b.netBuyAmt) - toNumber(a.netBuyAmt));
    } else {
      arr.sort((a, b) => toNumber(b.changeRate) - toNumber(a.changeRate));
    }
    return arr;
  }, [stocks, sortMode]);

  const holdingSet = useMemo(() => new Set(stockCodes), [stockCodes]);

  const summary = useMemo(() => {
    let totalNetBuy = 0;
    let upCount = 0;
    let downCount = 0;
    for (const s of stocks) {
      totalNetBuy += toNumber(s.netBuyAmt);
      if (toNumber(s.changeRate) > 0) upCount += 1;
      else if (toNumber(s.changeRate) < 0) downCount += 1;
    }
    return { totalNetBuy, upCount, downCount };
  }, [stocks]);

  const latestDate = useMemo(() => {
    if (stocks.length === 0) return '';
    return stocks[0].date.slice(0, 10);
  }, [stocks]);

  return (
    <div className="lhb-panel">
      {/* Header */}
      <header className="lhb-header">
        <div className="lhb-title-row">
          <button type="button" className="lhb-back-btn" onClick={onBack}>
            <ArrowLeft size={14} />
            <span>返回</span>
          </button>
          <h2 className="lhb-title">龙虎榜</h2>
          {latestDate && <span className="lhb-date">{latestDate}</span>}
        </div>
      </header>

      {/* Summary bar */}
      {!loading && !error && stocks.length > 0 && (
        <div className="lhb-summary">
          <span>{`共 ${stocks.length} 只上榜`}</span>
          <span className="up">{`上涨 ${summary.upCount}`}</span>
          <span className="down">{`下跌 ${summary.downCount}`}</span>
          <span className={summary.totalNetBuy >= 0 ? 'up' : 'down'}>
            {`合计净买入 ${formatMoney(summary.totalNetBuy)}`}
          </span>
        </div>
      )}

      {/* Sort tabs */}
      {!loading && !error && stocks.length > 0 && (
        <div className="lhb-sort-tabs">
          <button
            type="button"
            className={`lhb-sort-btn ${sortMode === 'netBuy' ? 'active' : ''}`}
            onClick={() => setSortMode('netBuy')}
          >
            <ArrowUpDown size={10} />
            <span>按净买入</span>
          </button>
          <button
            type="button"
            className={`lhb-sort-btn ${sortMode === 'changeRate' ? 'active' : ''}`}
            onClick={() => setSortMode('changeRate')}
          >
            <ArrowUpDown size={10} />
            <span>按涨跌幅</span>
          </button>
        </div>
      )}

      {/* Content */}
      <div className="lhb-body">
        {loading ? (
          <div className="lhb-loading">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="lhb-skeleton-row" />
            ))}
          </div>
        ) : error ? (
          <div className="lhb-error">
            <p>{error}</p>
            <button
              type="button"
              className="lhb-retry-btn"
              onClick={() => {
                setError('');
                setLoading(true);
                fetchLonghuBang().then(setStocks).finally(() => setLoading(false));
              }}
            >
              重试
            </button>
          </div>
        ) : sorted.length === 0 ? (
          <div className="lhb-empty">
            <p>今日暂无龙虎榜数据</p>
            <p className="lhb-empty-hint">非交易日或数据尚未公布</p>
          </div>
        ) : (
          <div className="lhb-table-wrap">
            <table className="lhb-table">
              <thead>
                <tr>
                  <th>代码</th>
                  <th>名称</th>
                  <th>涨幅</th>
                  <th>净买入</th>
                  <th>买入额</th>
                  <th>卖出额</th>
                  <th>换手率</th>
                  <th>上榜原因</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((stock) => {
                  const isHolding = holdingSet.has(stock.code);
                  const netBuy = toNumber(stock.netBuyAmt);
                  const changeRate = toNumber(stock.changeRate);

                  return (
                    <tr key={stock.code} className={`lhb-row ${isHolding ? 'holding' : ''}`}>
                      <td className="lhb-code">
                        {isHolding && <span className="lhb-holding-dot" title="持仓" />}
                        {stock.code}
                      </td>
                      <td className="lhb-name">{stock.name}</td>
                      <td className={changeRate >= 0 ? 'up' : 'down'}>
                        {formatPct(changeRate)}
                      </td>
                      <td className={netBuy >= 0 ? 'up' : 'down'}>
                        {formatMoney(netBuy)}
                      </td>
                      <td className="up">{formatMoney(toNumber(stock.buyAmt))}</td>
                      <td className="down">{formatMoney(toNumber(stock.sellAmt))}</td>
                      <td className="lhb-turnover">
                        {Number.isFinite(toNumber(stock.turnoverRate))
                          ? `${toNumber(stock.turnoverRate).toFixed(2)}%`
                          : '-'}
                      </td>
                      <td className="lhb-explanation" title={stock.explanation}>
                        {stock.explanation}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
