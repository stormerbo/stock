import { useMemo, useState } from 'react';
import { calcDiagnostics, type DiagnosticResult } from '../../shared/diagnostics';
import type { StockPosition, FundPosition } from '../../shared/fetch';
import { toneClass } from '../utils/format';

// Color palette for sector bars
const SECTOR_COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#6366f1',
  '#84cc16', '#d946ef', '#0ea5e9', '#eab308', '#a855f7',
];

type Props = {
  stockPositions: StockPosition[];
  fundPositions: FundPosition[];
};

function formatNum(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return '-';
  return value.toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function formatPct(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return '-';
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}%`;
}

export default function DiagnosticPanel({ stockPositions, fundPositions }: Props) {
  const diagnostic = useMemo(
    () => calcDiagnostics(stockPositions, fundPositions),
    [stockPositions, fundPositions]
  );

  const hasStock = stockPositions.some(s => s.shares > 0);
  const hasFund = fundPositions.some(f => f.units > 0);

  if (!hasStock && !hasFund) return null;

  return (
    <div className="diagnostic-section">
      <div className="diagnostic-header-row">
        <span className="account-section-label">持仓诊断</span>
        <RiskScoreBadge score={diagnostic.riskScore.overall} />
      </div>

      <CollapsibleCard title="集中度风险" defaultOpen>
        <ConcentrationView diagnostic={diagnostic} />
      </CollapsibleCard>

      {hasStock ? (
        <CollapsibleCard title="行业分布">
          <SectorView diagnostic={diagnostic} />
        </CollapsibleCard>
      ) : null}

      <CollapsibleCard title="盈亏归因">
        <PnlView diagnostic={diagnostic} />
      </CollapsibleCard>
    </div>
  );
}

/* ─── Risk Score ─── */
function RiskScoreBadge({ score }: { score: number }) {
  const level = score <= 30 ? 'low' : score <= 60 ? 'medium' : 'high';
  const label = score <= 30 ? '低风险' : score <= 60 ? '中风险' : '高风险';
  return (
    <span className={`diagnostic-score-badge ${level}`}>
      {score.toFixed(0)}
      <span style={{ fontSize: 11, fontWeight: 400, opacity: 0.8 }}>{label}</span>
    </span>
  );
}

/* ─── Collapsible ─── */
function CollapsibleCard({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="diagnostic-card">
      <div className="diagnostic-card-header" onClick={() => setOpen(!open)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(!open); } }}>
        <span className={`diagnostic-card-arrow ${open ? 'open' : ''}`}>▸</span>
        {title}
      </div>
      {open && <div className="diagnostic-card-body">{children}</div>}
    </div>
  );
}

/* ─── Concentration ─── */
function ConcentrationView({ diagnostic }: { diagnostic: DiagnosticResult }) {
  const { concentration } = diagnostic;

  return (
    <div>
      {concentration.warnings.map((w, i) => (
        <div key={i} className="diagnostic-warning">⚠️ {w}</div>
      ))}
      {concentration.warnings.length === 0 && (
        <div className="diagnostic-detail-text">持仓分布较为分散，未发现明显集中风险。</div>
      )}

      {concentration.topHoldings.length > 0 ? (
        <>
          <div className="diagnostic-stat-row" style={{ marginTop: 6 }}>
            <span className="diagnostic-stat-label">前 3 大持仓占比</span>
            <span className="diagnostic-stat-value">{formatNum(concentration.top3Ratio, 1)}%</span>
          </div>
          <ul className="diagnostic-list-compact">
            {concentration.topHoldings.slice(0, 5).map((h) => (
              <li key={h.code}>
                <span className="name">{h.name}</span>
                <span className="value">{formatNum(h.ratio, 1)}%</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="diagnostic-empty">暂无持仓数据</div>
      )}
    </div>
  );
}

/* ─── Sector ─── */
function SectorView({ diagnostic }: { diagnostic: DiagnosticResult }) {
  const { sectorAllocation } = diagnostic;

  if (sectorAllocation.sectors.length === 0) {
    return <div className="diagnostic-empty">暂无股票持仓数据</div>;
  }

  return (
    <div>
      {sectorAllocation.sectors.map((s, i) => (
        <div key={s.name} className="sector-bar-row">
          <span className="sector-bar-label" title={s.name}>{s.name}</span>
          <div className="sector-bar-track">
            <div
              className="sector-bar-fill"
              style={{
                width: `${Math.max(s.ratio, 1)}%`,
                backgroundColor: SECTOR_COLORS[i % SECTOR_COLORS.length],
              }}
            />
          </div>
          <span className="sector-bar-pct">{formatNum(s.ratio, 1)}%</span>
        </div>
      ))}
      {sectorAllocation.unknownCount > 0 ? (
        <div className="diagnostic-detail-text">
          {sectorAllocation.unknownCount} 只股票未匹配到具体行业，按板块归类
        </div>
      ) : null}
    </div>
  );
}

/* ─── P&L Attribution ─── */
function PnlView({ diagnostic }: { diagnostic: DiagnosticResult }) {
  const { pnlAttribution } = diagnostic;

  const hasGainers = pnlAttribution.topGainers.length > 0;
  const hasLosers = pnlAttribution.topLosers.length > 0;
  const hasDaily = pnlAttribution.largestDailyImpact.length > 0;

  if (!hasGainers && !hasLosers) {
    return <div className="diagnostic-empty">暂无盈亏数据</div>;
  }

  return (
    <div>
      {hasGainers ? (
        <div style={{ marginBottom: 6 }}>
          <div className="diagnostic-stat-label" style={{ marginBottom: 2 }}>持仓盈利 TOP</div>
          <ul className="diagnostic-list-compact">
            {pnlAttribution.topGainers.slice(0, 3).map((g) => (
              <li key={g.code}>
                <span className="name">{g.name}</span>
                <span className={`value ${toneClass(g.pnl)}`}>+{formatNum(g.pnl, 1)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {hasLosers ? (
        <div style={{ marginBottom: 6 }}>
          <div className="diagnostic-stat-label" style={{ marginBottom: 2 }}>持仓亏损 TOP</div>
          <ul className="diagnostic-list-compact">
            {pnlAttribution.topLosers.slice(0, 3).map((l) => (
              <li key={l.code}>
                <span className="name">{l.name}</span>
                <span className={`value ${toneClass(l.pnl)}`}>{formatNum(l.pnl, 1)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {hasDaily ? (
        <div>
          <div className="diagnostic-stat-label" style={{ marginBottom: 2 }}>今日影响最大</div>
          <ul className="diagnostic-list-compact">
            {pnlAttribution.largestDailyImpact.slice(0, 3).map((d) => (
              <li key={d.code}>
                <span className="name">{d.name}</span>
                <span className={`value ${toneClass(d.dailyPnl)}`}>
                  {formatNum(d.dailyPnl, 1)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
