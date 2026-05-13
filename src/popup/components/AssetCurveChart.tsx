import { useMemo, useState } from 'react';
import type { DailyAssetSnapshot } from '../../shared/fetch';

type Props = {
  snapshots: Record<string, DailyAssetSnapshot>;
};

const SVG_W = 760;
const SVG_H = 200;
const PAD_L = 60;
const PAD_R = 16;
const PAD_T = 16;
const PAD_B = 36;
const INNER_W = SVG_W - PAD_L - PAD_R;
const INNER_H = SVG_H - PAD_T - PAD_B;

function formatNum(v: number): string {
  if (!Number.isFinite(v)) return '-';
  if (Math.abs(v) >= 10000) return (v / 10000).toFixed(2) + '万';
  return v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatAxis(v: number): string {
  if (!Number.isFinite(v)) return '-';
  if (Math.abs(v) >= 100000000) return (v / 100000000).toFixed(1) + '亿';
  if (Math.abs(v) >= 10000) return (v / 10000).toFixed(0) + '万';
  return v.toFixed(0);
}

function formatDateLabel(d: string): string {
  return d.slice(5); // "MM-DD"
}

function formatDateFull(d: string): string {
  return d; // "YYYY-MM-DD"
}

export default function AssetCurveChart({ snapshots }: Props) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const entries = useMemo(() => {
    const sorted = Object.values(snapshots)
      .filter((s) => Number.isFinite(s.totalAssets))
      .sort((a, b) => a.date.localeCompare(b.date));
    return sorted;
  }, [snapshots]);

  if (entries.length < 2) {
    return (
      <div className="asset-curve-card">
        <div className="asset-curve-header">
          <span className="account-section-label">资产走势</span>
        </div>
        <div className="asset-curve-empty">
          暂无历史数据，持续运行后将自动生成
        </div>
      </div>
    );
  }

  const minVal = entries.reduce((m, e) => Math.min(m, e.totalAssets), Infinity);
  const maxVal = entries.reduce((m, e) => Math.max(m, e.totalAssets), -Infinity);
  const range = maxVal - minVal || 1;
  const pad = range * 0.08;
  const yMin = minVal - pad;
  const yMax = maxVal + pad;
  const yRange = yMax - yMin || 1;

  const toX = (i: number) => PAD_L + (i / (entries.length - 1)) * INNER_W;
  const toY = (v: number) => PAD_T + INNER_H - ((v - yMin) / yRange) * INNER_H;

  const linePath = entries.map((e, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(e.totalAssets).toFixed(1)}`).join('');

  const areaPath = `${linePath}L${toX(entries.length - 1).toFixed(1)},${SVG_H - PAD_B}L${toX(0).toFixed(1)},${SVG_H - PAD_B}Z`;

  // Y axis ticks
  const yTicks = 5;
  const yStep = yRange / yTicks;

  // X axis labels
  const xLabelCount = Math.min(entries.length, 6);
  const xStep = Math.max(1, Math.floor((entries.length - 1) / (xLabelCount - 1)));

  return (
    <div className="asset-curve-card">
      <div className="asset-curve-header">
        <span className="account-section-label">资产走势</span>
        <span className="asset-curve-summary">
          最新：<strong>{formatNum(entries[entries.length - 1].totalAssets)}</strong>
        </span>
      </div>
      <div className="asset-curve-chart-wrap">
        <svg
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          className="asset-curve-svg"
          preserveAspectRatio="none"
          onMouseLeave={() => setHoverIdx(null)}
        >
          {/* Grid lines */}
          {Array.from({ length: yTicks + 1 }).map((_, i) => {
            const y = PAD_T + (i / yTicks) * INNER_H;
            return (
              <g key={`grid-${i}`}>
                <line x1={PAD_L} y1={y} x2={SVG_W - PAD_R} y2={y} className="asset-curve-gridline" />
                <text x={PAD_L - 6} y={y + 3} className="asset-curve-y-label" textAnchor="end">
                  {formatAxis(yMax - yStep * i)}
                </text>
              </g>
            );
          })}

          {/* X axis labels */}
          {Array.from({ length: xLabelCount }).map((_, i) => {
            const idx = Math.min(i * xStep, entries.length - 1);
            const x = toX(idx);
            return (
              <text key={`x-${i}`} x={x} y={SVG_H - 6} className="asset-curve-x-label" textAnchor="middle">
                {formatDateLabel(entries[idx].date)}
              </text>
            );
          })}

          {/* Area fill */}
          <defs>
            <linearGradient id="asset-curve-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.3" />
              <stop offset="100%" stopColor="var(--brand)" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          <path d={areaPath} fill="url(#asset-curve-gradient)" />

          {/* Line */}
          <path d={linePath} fill="none" className="asset-curve-line" />

          {/* Data points */}
          {entries.map((e, i) => (
            <circle
              key={e.date}
              cx={toX(i)}
              cy={toY(e.totalAssets)}
              r={hoverIdx === i ? 4 : 2}
              className={`asset-curve-dot ${hoverIdx === i ? 'active' : ''}`}
              onMouseEnter={() => setHoverIdx(i)}
              onMouseMove={() => setHoverIdx(i)}
            />
          ))}

          {/* Tooltip */}
          {hoverIdx !== null && entries[hoverIdx] && (() => {
            const d = entries[hoverIdx];
            const cx = toX(hoverIdx);
            const cy = toY(d.totalAssets);
            const tooltipW = 140;
            const tooltipH = 56;
            let tx = cx + 10;
            let ty = cy - tooltipH - 8;
            if (tx + tooltipW > SVG_W - PAD_R) tx = cx - tooltipW - 10;
            if (ty < 0) ty = cy + 10;
            return (
              <g>
                <rect x={tx} y={ty} width={tooltipW} height={tooltipH} rx={4} className="asset-curve-tooltip-bg" />
                <text x={tx + 8} y={ty + 14} className="asset-curve-tooltip-date">{formatDateFull(d.date)}</text>
                <text x={tx + 8} y={ty + 30} className="asset-curve-tooltip-val">
                  总资产：{formatNum(d.totalAssets)}
                </text>
                <text x={tx + 8} y={ty + 44} className="asset-curve-tooltip-detail">
                  股票 {formatNum(d.stockMarketValue)} / 基金 {formatNum(d.fundHoldingAmount)}
                </text>
                {/* Crosshair */}
                <line x1={PAD_L} y1={cy} x2={SVG_W - PAD_R} y2={cy} className="asset-curve-crosshair" />
                <line x1={cx} y1={PAD_T} x2={cx} y2={SVG_H - PAD_B} className="asset-curve-crosshair" />
              </g>
            );
          })()}
        </svg>
      </div>
    </div>
  );
}
