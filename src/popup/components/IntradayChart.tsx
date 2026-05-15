import { memo, useMemo } from 'react';

const TRADING_MINUTES = 240;
const MORNING_START = 9 * 60 + 30;
const MORNING_END = 11 * 60 + 30;
const AFTERNOON_START = 13 * 60;
const AFTERNOON_END = 15 * 60;

function getMinuteIndex(timeStr: string): number | null {
  const [h, m] = timeStr.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  const minutesFromMidnight = h * 60 + m;

  if (minutesFromMidnight >= MORNING_START && minutesFromMidnight <= MORNING_END) {
    return minutesFromMidnight - MORNING_START;
  }
  if (minutesFromMidnight >= AFTERNOON_START && minutesFromMidnight <= AFTERNOON_END) {
    return (MORNING_END - MORNING_START) + (minutesFromMidnight - AFTERNOON_START);
  }
  return null;
}

type IntradayDataPoint = {
  time: string;
  price: number;
  minuteIndex: number;
};

type Props = {
  data: Array<{ time: string; price: number }>;
  prevClose?: number;
  intradayPrevClose?: number;
  changePct?: number;
  width?: number;
  height?: number;
};

const IntradayChart = memo(function IntradayChart({
  data, prevClose, intradayPrevClose, changePct,
  width = 280, height = 50,
}: Props) {
  const pad = { top: 4, right: 4, bottom: 4, left: 4 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const pathInfo = useMemo(() => {
    if (!data || data.length === 0) return null;

    const dataPoints: IntradayDataPoint[] = [];
    for (const item of data) {
      const index = getMinuteIndex(item.time);
      if (index !== null && Number.isFinite(item.price)) {
        dataPoints.push({ time: item.time, price: item.price, minuteIndex: index });
      }
    }
    if (dataPoints.length === 0) return null;

    const maybeIntradayPrevClose: number = intradayPrevClose ?? Number.NaN;
    const effectivePrevClose: number = Number.isFinite(maybeIntradayPrevClose)
      ? maybeIntradayPrevClose
      : (prevClose !== undefined && Number.isFinite(prevClose) ? prevClose : Number.NaN);
    const hasPrevClose = Number.isFinite(effectivePrevClose);

    const prices = dataPoints.map((d) => d.price);
    let minPrice = Math.min(...prices);
    let maxPrice = Math.max(...prices);
    if (hasPrevClose) {
      minPrice = Math.min(minPrice, effectivePrevClose);
      maxPrice = Math.max(maxPrice, effectivePrevClose);
    }

    const rawRange = Math.max(maxPrice - minPrice, Math.max(maxPrice * 0.0002, 0.01));
    const step = rawRange / 10;
    const edgePadding = step;
    const displayMin = minPrice - edgePadding;
    const displayMax = maxPrice + edgePadding;
    const displayRange = Math.max(displayMax - displayMin, rawRange);

    const sorted = [...dataPoints].sort((a, b) => a.minuteIndex - b.minuteIndex);

    const toX = (mi: number) => pad.left + (mi / TRADING_MINUTES) * innerW;
    const toY = (price: number) => {
      const normalized = (price - displayMin) / displayRange;
      return pad.top + (1 - normalized) * innerH;
    };

    const segments: IntradayDataPoint[][] = [];
    let cur: IntradayDataPoint[] = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].minuteIndex - sorted[i - 1].minuteIndex > 1) {
        segments.push(cur);
        cur = [sorted[i]];
      } else {
        cur.push(sorted[i]);
      }
    }
    segments.push(cur);

    const baselinePrice = hasPrevClose ? effectivePrevClose : (dataPoints[0]?.price ?? 0);
    const baselineY = toY(baselinePrice);

    const subSegments: { path: string; color: string; key: string }[] = [];
    for (let si = 0; si < segments.length; si++) {
      const seg = segments[si];
      for (let i = 0; i < seg.length - 1; i++) {
        const p = `${toX(seg[i].minuteIndex).toFixed(2)} ${toY(seg[i].price).toFixed(2)} ${toX(seg[i + 1].minuteIndex).toFixed(2)} ${toY(seg[i + 1].price).toFixed(2)}`;
        const mid = (seg[i].price + seg[i + 1].price) / 2;
        subSegments.push({
          path: p,
          color: mid >= baselinePrice ? '#ff5e57' : '#1fc66d',
          key: `s${si}-${i}`,
        });
      }
    }

    return { baselineY, subSegments, };
  }, [data, prevClose, intradayPrevClose, width, height]);

  if (!pathInfo) {
    if (Number.isFinite(changePct)) {
      const w = Math.min(Math.abs(changePct!) / 10, 1) * 36;
      const fill = changePct! >= 0 ? '#ff5e57' : '#1fc66d';
      return (
        <svg className="intraday-chart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
          <rect x={width / 2 - w / 2} y={height / 2 - 4} width={Math.max(w, 4)} height={8} rx={2} fill={fill} opacity={0.6} />
        </svg>
      );
    }
    return <div className="intraday-chart-empty" style={{ fontSize: 9, color: 'var(--text-2)', opacity: 0.5 }}>-</div>;
  }

  return (
    <svg
      className="intraday-chart"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
    >
      <line
        x1={pad.left}
        x2={width - pad.right}
        y1={pathInfo.baselineY.toFixed(2)}
        y2={pathInfo.baselineY.toFixed(2)}
        className="intraday-open-line"
      />
      {pathInfo.subSegments.map(({ path, color, key }) => (
        <path
          key={key}
          d={`M ${path}`}
          fill="none"
          stroke={color}
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
});

export default IntradayChart;
