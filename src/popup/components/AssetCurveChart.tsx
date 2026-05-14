import { useMemo, useState } from 'react';
import { getShanghaiToday } from '../../shared/fetch';
import type { DailyAssetSnapshot } from '../../shared/fetch';
import { toneClass } from '../utils/format';

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

const LINE_CONFIG = [
  { key: 'totalPnl' as const, label: '汇总', className: 'asset-curve-line-total' },
  { key: 'stockPnl' as const, label: '股票', className: 'asset-curve-line-stock' },
  { key: 'fundPnl' as const, label: '基金', className: 'asset-curve-line-fund' },
];

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
  return d.slice(5);
}

function formatDateFull(d: string): string {
  return d;
}

export default function AssetCurveChart({ snapshots }: Props) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const entries = useMemo(() => {
    const today = getShanghaiToday();
    const sorted = Object.values(snapshots)
      .filter((s) => Number.isFinite(s.totalPnl) && s.date < today)
      .sort((a, b) => a.date.localeCompare(b.date));
    return sorted;
  }, [snapshots]);

  if (entries.length < 2) {
    return (
      <div className="asset-curve-card">
        <div className="asset-curve-header">
          <span className="account-section-label">累计收益</span>
        </div>
        <div className="asset-curve-empty">
          暂无历史数据，持续运行后将自动生成
        </div>
      </div>
    );
  }

  const latest = entries[entries.length - 1];

  // 找到三条线的全局最大最小值
  let minVal = Infinity;
  let maxVal = -Infinity;
  for (const e of entries) {
    for (const cfg of LINE_CONFIG) {
      const v = e[cfg.key];
      if (Number.isFinite(v)) {
        minVal = Math.min(minVal, v);
        maxVal = Math.max(maxVal, v);
      }
    }
  }
  const range = maxVal - minVal || 1;
  const pad = range * 0.08;
  const yMin = minVal - pad;
  const yMax = maxVal + pad;
  const yRange = yMax - yMin || 1;

  const toX = (i: number) => PAD_L + (i / (entries.length - 1)) * INNER_W;
  const toY = (v: number) => PAD_T + INNER_H - ((v - yMin) / yRange) * INNER_H;
  const zeroY = toY(0);

  const buildPath = (key: 'totalPnl' | 'stockPnl' | 'fundPnl') =>
    entries.map((e, i) => {
      const v = e[key];
      if (!Number.isFinite(v)) return '';
      return `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(v).toFixed(1)}`;
    }).filter(Boolean).join('');

  // Y axis ticks
  const yTicks = 5;
  const yStep = yRange / yTicks;

  // X axis labels
  const xLabelCount = Math.min(entries.length, 6);
  const xStep = Math.max(1, Math.floor((entries.length - 1) / (xLabelCount - 1)));

  const hoverEntry = hoverIdx !== null ? entries[hoverIdx] : null;
  const hoverKey = hoverEntry ? ('totalPnl' as const) : null;

  return (
    <div className="asset-curve-card">
      <div className="asset-curve-header">
        <span className="account-section-label">累计收益</span>
        <span className="asset-curve-legend">
          {LINE_CONFIG.map((cfg) => (
            <span key={cfg.key} className="asset-curve-legend-item">
              <span className={`asset-curve-legend-dot ${cfg.className}`} />
              {cfg.label}
            </span>
          ))}
          <span className="asset-curve-summary">
            汇总 <strong className={toneClass(latest.totalPnl)}>{formatNum(latest.totalPnl)}</strong>
          </span>
        </span>
      </div>
      <div className="asset-curve-chart-wrap">
        <svg
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          className="asset-curve-svg"
          preserveAspectRatio="none"
          onMouseMove={(e) => {
            const r=e.currentTarget.getBoundingClientRect();
            const x=(e.clientX-r.left)/r.width*SVG_W;
            if(x<PAD_L||x>PAD_L+INNER_W){setHoverIdx(null);return;}
            const idx=Math.round(((x-PAD_L)/INNER_W)*(entries.length-1));
            setHoverIdx(Math.max(0,Math.min(idx,entries.length-1)));
          }}
          onMouseLeave={() => setHoverIdx(null)}
        >
          {/* Zero line */}
          {yMin < 0 && yMax > 0 && (
            <line x1={PAD_L} y1={zeroY} x2={SVG_W - PAD_R} y2={zeroY} className="asset-curve-baseline" />
          )}

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

          {/* Area fill behind total line */}
          <defs>
            <linearGradient id="asset-curve-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.15" />
              <stop offset="100%" stopColor="var(--brand)" stopOpacity="0.01" />
            </linearGradient>
          </defs>
          {(() => {
            const p = buildPath('totalPnl');
            if (!p) return null;
            const area = `${p}L${toX(entries.length - 1).toFixed(1)},${SVG_H - PAD_B}L${toX(0).toFixed(1)},${SVG_H - PAD_B}Z`;
            return <path d={area} fill="url(#asset-curve-gradient)" />;
          })()}

          {/* Lines */}
          {LINE_CONFIG.map((cfg) => {
            const p = buildPath(cfg.key);
            if (!p) return null;
            return <path key={cfg.key} d={p} fill="none" className={cfg.className} />;
          })}

          {/* Hover data points for all lines */}
          {hoverIdx !== null && LINE_CONFIG.map((cfg) => {
            const v = entries[hoverIdx][cfg.key];
            if (!Number.isFinite(v)) return null;
            return (
              <circle
                key={cfg.key}
                cx={toX(hoverIdx)}
                cy={toY(v)}
                r={3}
                className={`asset-curve-dot ${cfg.className}`}
              />
            );
          })}

          {/* Tooltip */}
          {hoverIdx !== null && entries[hoverIdx] && (() => {
            const d = entries[hoverIdx];
            const cx = toX(hoverIdx);
            const cy = toY(d.totalPnl);
            const tooltipW = 160;
            const tooltipH = 72 + LINE_CONFIG.length * 14;
            let tx = cx + 10;
            let ty = cy - tooltipH - 8;
            if (tx + tooltipW > SVG_W - PAD_R) tx = cx - tooltipW - 10;
            if (ty < 0) ty = cy + 10;
            return (
              <g>
                <rect x={tx} y={ty} width={tooltipW} height={tooltipH} rx={4} className="asset-curve-tooltip-bg" />
                <text x={tx + 8} y={ty + 14} className="asset-curve-tooltip-date">{formatDateFull(d.date)}</text>
                {LINE_CONFIG.map((cfg, i) => {
                  const v = d[cfg.key];
                  if (!Number.isFinite(v)) return null;
                  return (
                    <text key={cfg.key} x={tx + 8} y={ty + 30 + i * 14} className={`asset-curve-tooltip-val ${toneClass(v)}`}>
                      {cfg.label}：{formatNum(v)}
                    </text>
                  );
                })}
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
