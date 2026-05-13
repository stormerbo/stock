import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Loader2, Plus, RefreshCw } from 'lucide-react';
import { fetchSectorStocks, type SectorStock } from '../../shared/sector';
import KlineChart from '../components/KlineChart';
import { fetchSectorKline, isSectorSupportedPeriod } from '../sectorKline';
import { isTradingHours, type StockDetailData, type StockPeriod } from '../stockDetail';

type Props = {
  sectorCode: string;
  sectorName: string;
  stockCodes: string[];
  onAddStock: (stock: { code: string; name: string }) => void;
  onBack: () => void;
};

type TabKey = 'stocks' | StockPeriod;

function toNumber(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : Number.NaN;
}

function formatNumber(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return '-';
  return value.toLocaleString('zh-CN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function toneClass(value: number): string {
  if (!Number.isFinite(value)) return '';
  return value >= 0 ? 'up' : 'down';
}

const KLINE_TABS: Array<{ label: string; value: StockPeriod }> = [
  { label: '日K', value: 'day' },
  { label: '周K', value: 'week' },
  { label: '月K', value: 'month' },
  { label: '年K', value: 'year' },
];

export default function SectorDetailView({ sectorCode, sectorName, stockCodes, onAddStock, onBack }: Props) {
  const [stocks, setStocks] = useState<SectorStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<TabKey>('stocks');
  const [period, setPeriod] = useState<StockPeriod>('day');
  const [detail, setDetail] = useState<StockDetailData | null>(null);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartError, setChartError] = useState('');
  const [refreshAt, setRefreshAt] = useState(0);
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  // Load constituent stocks
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const list = await fetchSectorStocks(sectorCode);
        if (cancelled) return;
        setStocks(list);
        setError('');
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : '成分股加载失败');
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
  }, [sectorCode]);

  // Fetch K-line data when on K-line tab
  useEffect(() => {
    if (activeTab === 'stocks' || !isSectorSupportedPeriod(period)) return;
    let cancelled = false;

    const load = async () => {
      setChartLoading(true);
      try {
        const result = await fetchSectorKline(sectorCode, period);
        if (cancelled) return;
        setDetail(result);
        setChartError('');
      } catch (err) {
        if (cancelled) return;
        setChartError(err instanceof Error ? err.message : 'K线数据加载失败');
      } finally {
        if (!cancelled) setChartLoading(false);
      }
    };

    void load();
    const timer = window.setInterval(() => {
      if (isTradingHours()) void load();
    }, 40_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [sectorCode, period, activeTab, refreshAt]);

  const holdingSet = new Set(stockCodes);

  return (
    <div className="sector-detail-panel">
      <header className="sector-detail-header">
        <button type="button" className="sector-detail-back" onClick={onBack}>
          <ArrowLeft size={14} />
          <span>返回</span>
        </button>
        <h3 className="sector-detail-title">{sectorName}</h3>
        {!loading && !error && activeTab === 'stocks' && (
          <span className="sector-detail-count">{`${stocks.length} 只成分股`}</span>
        )}
        {activeTab !== 'stocks' ? (
          <button type="button" className="sector-detail-refresh" onClick={() => setRefreshAt((prev) => prev + 1)} disabled={chartLoading}>
            {chartLoading ? <Loader2 size={12} className="spinning" /> : <RefreshCw size={12} />}
          </button>
        ) : null}
      </header>

      {/* ─── Tab Bar ─── */}
      <div className="sector-detail-tabs">
        <button
          type="button"
          className={`sector-detail-tab ${activeTab === 'stocks' ? 'active' : ''}`}
          onClick={() => setActiveTab('stocks')}
        >
          成分股
        </button>
        {KLINE_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            className={`sector-detail-tab ${activeTab === tab.value ? 'active' : ''}`}
            onClick={() => { setActiveTab(tab.value); setPeriod(tab.value); }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ─── Content ─── */}
      {activeTab === 'stocks' ? (
        <div className="sector-detail-body">
          {loading ? (
            <div className="sector-detail-loading">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="sector-detail-skeleton" />
              ))}
            </div>
          ) : error ? (
            <div className="sector-detail-error">
              <p>{error}</p>
              <button
                type="button"
                className="sector-detail-retry"
                onClick={() => {
                  setError('');
                  setLoading(true);
                  fetchSectorStocks(sectorCode)
                    .then(setStocks)
                    .finally(() => setLoading(false));
                }}
              >
                重试
              </button>
            </div>
          ) : stocks.length === 0 ? (
            <div className="sector-detail-empty">暂无成分股数据</div>
          ) : (
            <div className="sector-detail-table-wrap">
              <table className="sector-detail-table">
                <thead>
                  <tr>
                    <th>代码</th>
                    <th>名称</th>
                    <th>最新价</th>
                    <th>涨跌幅</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {stocks.map((stock) => {
                    const changePct = toNumber(stock.changePct);
                    const isHolding = holdingSet.has(stock.code);
                    const added = isHolding;

                    return (
                      <tr key={stock.code}>
                        <td className="sector-detail-code">
                          {isHolding && <span className="sector-detail-holding-dot" />}
                          {stock.code}
                        </td>
                        <td className="sector-detail-name">{stock.name}</td>
                        <td>{Number.isFinite(toNumber(stock.price)) ? toNumber(stock.price).toFixed(2) : '-'}</td>
                        <td className={changePct >= 0 ? 'up' : 'down'}>
                          {Number.isFinite(changePct)
                            ? `${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%`
                            : '-'}
                        </td>
                        <td>
                          <button
                            type="button"
                            className={`sector-detail-add-btn ${added ? 'disabled' : ''}`}
                            disabled={added}
                            onClick={() => {
                              if (!added) onAddStock({ code: stock.code, name: stock.name });
                            }}
                          >
                            <Plus size={10} />
                            <span>{added ? '已添加' : '加自选'}</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="sector-detail-body">
          {chartLoading && !detail ? (
            <div className="sector-detail-loading">K线加载中...</div>
          ) : chartError && !detail ? (
            <div className="sector-detail-error">
              <p>{chartError}</p>
              <button
                type="button"
                className="sector-detail-retry"
                onClick={() => setRefreshAt((prev) => prev + 1)}
              >
                重试
              </button>
            </div>
          ) : detail && detail.kline.length > 0 ? (
            <>
              {/* ─── Quote Header ─── */}
              <div className="detail-quote-header" style={{ margin: '6px 10px' }}>
                <div className="quote-title-row">
                  <div className="quote-title-left">
                    <strong>{detail.name || sectorName}</strong>
                    <span className="quote-code">{sectorCode}</span>
                  </div>
                  <div className="quote-price-block">
                    <div className={`quote-price ${toneClass(detail.changePct)}`}>
                      {formatNumber(detail.price, 2)}
                    </div>
                    <div className={`quote-change ${toneClass(detail.changePct)}`}>
                      {formatPercent(detail.changePct)}
                    </div>
                  </div>
                </div>
                <div className="quick-stats">
                  <div className="stat-cell"><span className="stat-label">今开</span><b className={toneClass(detail.open - detail.prevClose)}>{formatNumber(detail.open, 2)}</b></div>
                  <div className="stat-cell"><span className="stat-label">昨收</span><b>{formatNumber(detail.prevClose, 2)}</b></div>
                  <div className="stat-cell"><span className="stat-label">最高</span><b className={toneClass(detail.high - detail.prevClose)}>{formatNumber(detail.high, 2)}</b></div>
                  <div className="stat-cell"><span className="stat-label">最低</span><b className={toneClass(detail.low - detail.prevClose)}>{formatNumber(detail.low, 2)}</b></div>
                  <div className="stat-cell"><span className="stat-label">成交量</span><b>{formatNumber(detail.volumeHands / 10000, 2)}万手</b></div>
                  <div className="stat-cell"><span className="stat-label">成交额</span><b>{formatNumber(detail.amountWanYuan / 10000, 2)}亿</b></div>
                </div>
              </div>

              {/* ─── K-line Chart ─── */}
              <KlineChart detail={detail} />
            </>
          ) : (
            <div className="sector-detail-empty">暂无K线数据</div>
          )}
        </div>
      )}
    </div>
  );
}
