import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Plus } from 'lucide-react';
import { fetchSectorStocks, type SectorStock } from '../../shared/sector';

type Props = {
  sectorCode: string;
  sectorName: string;
  stockCodes: string[];
  onAddStock: (stock: { code: string; name: string }) => void;
  onBack: () => void;
};

function toNumber(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : Number.NaN;
}

export default function SectorDetailView({ sectorCode, sectorName, stockCodes, onAddStock, onBack }: Props) {
  const [stocks, setStocks] = useState<SectorStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

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

  const holdingSet = new Set(stockCodes);

  return (
    <div className="sector-detail-panel">
      <header className="sector-detail-header">
        <button type="button" className="sector-detail-back" onClick={onBack}>
          <ArrowLeft size={14} />
          <span>返回</span>
        </button>
        <h3 className="sector-detail-title">{sectorName}</h3>
        {!loading && !error && (
          <span className="sector-detail-count">{`${stocks.length} 只成分股`}</span>
        )}
      </header>

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
    </div>
  );
}
