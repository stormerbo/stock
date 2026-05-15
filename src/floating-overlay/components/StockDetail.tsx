import { useMemo } from 'react';
import IntradayChart from '../../popup/components/IntradayChart';

type Props = {
  name: string;
  code: string;
  price: number;
  prevClose: number;
  changePct: number;
  high?: number;
  low?: number;
  open?: number;
  intradayData: Array<{ time: string; price: number }>;
  intradayPrevClose?: number;
  onBack: () => void;
};

function formatPrice(v: number): string {
  return Number.isFinite(v) ? v.toFixed(2) : '--';
}

function formatChangePct(v: number): string {
  if (!Number.isFinite(v)) return '--';
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toFixed(2)}%`;
}

function tone(value: number): string {
  if (value > 0) return 'up';
  if (value < 0) return 'down';
  return '';
}

export default function StockDetail({
  name, code, price, prevClose, changePct, high, low, open,
  intradayData, intradayPrevClose, onBack,
}: Props) {
  const t = tone(changePct);

  // Compute chart grid labels
  const chartLabels = useMemo(() => {
    if (!Number.isFinite(prevClose)) return { top: '', mid: '', bot: '', pct: '' };
    const p = prevClose;
    const h = Number.isFinite(high) ? high! : p * 1.02;
    const l = Number.isFinite(low) ? low! : p * 0.98;
    const range = Math.max(h - l, p * 0.005);
    const topPrice = p + range * 0.6;
    const botPrice = p - range * 0.6;
    const topPct = ((topPrice - p) / p) * 100;
    const botPct = ((botPrice - p) / p) * 100;
    return {
      top: formatPrice(topPrice),
      mid: formatPrice(p),
      bot: formatPrice(botPrice),
      topPct: `${topPct >= 0 ? '+' : ''}${topPct.toFixed(1)}%`,
      botPct: `${botPct >= 0 ? '+' : ''}${botPct.toFixed(1)}%`,
    };
  }, [prevClose, high, low]);

  return (
    <div className="stock-detail">
      {/* Header */}
      <div className="stock-detail-header">
        <button className="float-btn stock-detail-back" onClick={onBack} type="button">←</button>
        <div className="stock-detail-title">
          <span className="stock-detail-name">{name}</span>
          <span className="stock-detail-code">{code}</span>
        </div>
        <div className={`stock-detail-price-section ${t ? `color-${t}` : ''}`}>
          <span className="stock-detail-price">{formatPrice(price)}</span>
          <span className="stock-detail-change">{formatChangePct(changePct)}</span>
        </div>
      </div>

      {/* Chart area */}
      <div className="stock-detail-chart-area">
        {/* Y-axis labels */}
        <div className="stock-detail-yaxis">
          <span className={`stock-detail-ylabel ${tone(prevClose ? (parseFloat(chartLabels.top) - prevClose) : 0)}`}>
            {chartLabels.top}
          </span>
          <span className="stock-detail-ylabel">{chartLabels.mid}</span>
          <span className={`stock-detail-ylabel ${tone(prevClose ? (parseFloat(chartLabels.bot) - prevClose) : 0)}`}>
            {chartLabels.bot}
          </span>
        </div>

        {/* Chart + grid */}
        <div className="stock-detail-chart-wrap">
          {/* Grid lines */}
          <div className="stock-detail-grid">
            <div className="stock-detail-grid-line" />
            <div className="stock-detail-grid-line stock-detail-grid-mid" />
            <div className="stock-detail-grid-line" />
          </div>

          {/* Price line */}
          <IntradayChart
            data={intradayData}
            prevClose={prevClose}
            intradayPrevClose={intradayPrevClose}
            changePct={changePct}
            width={248}
            height={96}
          />
        </div>
      </div>

      {/* Quick stats */}
      <div className="stock-detail-stats">
        <div className="stock-detail-stat">
          <span className="stock-detail-stat-label">昨收</span>
          <span className="stock-detail-stat-value">{formatPrice(prevClose)}</span>
        </div>
        {Number.isFinite(open) && (
          <div className="stock-detail-stat">
            <span className="stock-detail-stat-label">今开</span>
            <span className={`stock-detail-stat-value ${tone(open! - prevClose)}`}>{formatPrice(open!)}</span>
          </div>
        )}
        {Number.isFinite(high) && (
          <div className="stock-detail-stat">
            <span className="stock-detail-stat-label">最高</span>
            <span className={`stock-detail-stat-value color-up`}>{formatPrice(high!)}</span>
          </div>
        )}
        {Number.isFinite(low) && (
          <div className="stock-detail-stat">
            <span className="stock-detail-stat-label">最低</span>
            <span className={`stock-detail-stat-value color-down`}>{formatPrice(low!)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
