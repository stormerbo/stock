import { useEffect, useMemo, useState } from 'react';
import { Flame, Search, X } from 'lucide-react';
import { fetchSectorList, type SectorData } from '../shared/sector';

function toNumber(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : Number.NaN;
}

type Props = {
  onOpenLonghuBang?: () => void;
  onSelectSector?: (sector: SectorData) => void;
};

export default function SectorHeatMap({ onOpenLonghuBang, onSelectSector }: Props) {
  const [sectors, setSectors] = useState<SectorData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterText, setFilterText] = useState('');

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const list = await fetchSectorList();
        if (cancelled) return;
        setSectors(list);
        setError('');
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : '板块数据加载失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  // Filter and sort
  const filtered = useMemo(() => {
    let result = sectors;
    if (filterText.trim()) {
      const kw = filterText.trim().toLowerCase();
      result = result.filter((s) => s.name.toLowerCase().includes(kw) || s.code.toLowerCase().includes(kw));
    }
    return [...result].sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));
  }, [sectors, filterText]);

  // Stats
  const stats = useMemo(() => {
    let up = 0;
    let down = 0;
    let flat = 0;
    for (const s of sectors) {
      const pct = toNumber(s.changePct);
      if (pct > 0) up += 1;
      else if (pct < 0) down += 1;
      else flat += 1;
    }
    return { up, down, flat, total: sectors.length };
  }, [sectors]);

  if (loading) {
    return (
      <div className="sector-tab">
        <div className="sector-tab-header">
          <h3 className="sector-tab-title">板块热力图</h3>
        </div>
        <div className="sector-heatmap-grid">
          {Array.from({ length: 30 }).map((_, i) => (
            <div key={i} className="sector-tile skeleton" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="sector-tab">
        <div className="sector-tab-header">
          <h3 className="sector-tab-title">板块热力图</h3>
        </div>
        <div className="sector-error">{error}</div>
      </div>
    );
  }

  // Find max absolute changePct for color scaling
  const maxAbs = Math.max(...filtered.map((s) => Math.abs(toNumber(s.changePct))), 0.01);

  return (
    <div className="sector-tab">
      <div className="sector-tab-header">
        <h3 className="sector-tab-title">板块热力图</h3>
        <div className="sector-tab-stats">
          <span className="up">{`涨 ${stats.up}`}</span>
          <span className="down">{`跌 ${stats.down}`}</span>
          {stats.flat > 0 && <span>{`平 ${stats.flat}`}</span>}
          <span className="sector-tab-count">{`共 ${stats.total} 个板块`}</span>
        </div>
        <div className="sector-filter-wrap">
          <Search size={11} className="sector-filter-icon" />
          <input
            className="sector-filter-input"
            placeholder="筛选板块名称..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          {filterText && (
            <button className="sector-filter-clear" onClick={() => setFilterText('')}>
              <X size={10} />
            </button>
          )}
        </div>
        {onOpenLonghuBang && (
          <button className="lhb-entry-btn" type="button" onClick={onOpenLonghuBang}>
            <Flame size={10} /> 龙虎榜
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="sector-empty">无匹配板块</div>
      ) : (
        <div className="sector-heatmap-grid">
          {filtered.map((sector) => {
            const pct = toNumber(sector.changePct);
            const intensity = Math.min(Math.abs(pct) / maxAbs, 1);
            const isUp = pct > 0;
            const isFlat = pct === 0;

            const bgColor = isFlat
              ? 'rgba(128,128,128,0.10)'
              : isUp
                ? `rgba(228,85,85,${(0.10 + intensity * 0.30).toFixed(2)})`
                : `rgba(42,165,104,${(0.10 + intensity * 0.30).toFixed(2)})`;

            const textColor = isFlat
              ? 'var(--text-1)'
              : isUp
                ? '#e45555'
                : '#2aa568';

            return (
              <div
                key={sector.code}
                className="sector-tile"
                style={{ background: bgColor, cursor: onSelectSector ? 'pointer' : 'default' }}
                onClick={() => onSelectSector?.(sector)}
                title={`${sector.name}\n涨幅: ${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%\n领涨: ${sector.leadingStockName}${sector.leadingStockCode ? ` (${sector.leadingStockCode})` : ''}\n点击查看成分股`}
              >
                <span className="sector-tile-name">{sector.name}</span>
                <span className="sector-tile-change" style={{ color: textColor }}>
                  {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
