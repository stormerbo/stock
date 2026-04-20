import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, Loader2, RefreshCw } from "lucide-react";
import {
  calcMA,
  calcMACD,
  fetchTencentStockDetail,
  isTradingHours,
  type StockDetailData,
  type StockPeriod,
} from "./stockDetail";

type Props = {
  code: string;
  fallbackName: string;
  onBack: () => void;
};

function formatNumber(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return "-";
  return value.toLocaleString("zh-CN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return "-";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function toneClass(value: number): string {
  if (!Number.isFinite(value)) return "";
  return value >= 0 ? "up" : "down";
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getVolumeDisplayUnit(maxVolume: number): { divisor: number; unit: string } {
  if (maxVolume >= 100000000) return { divisor: 100000000, unit: "亿手" };
  if (maxVolume >= 10000) return { divisor: 10000, unit: "万手" };
  return { divisor: 1, unit: "手" };
}

const PERIOD_TABS: Array<{ label: string; value: StockPeriod }> = [
  { label: "分时", value: "minute" },
  { label: "五日", value: "fiveDay" },
  { label: "日K", value: "day" },
  { label: "周K", value: "week" },
  { label: "月K", value: "month" },
  { label: "年K", value: "year" },
  { label: "120分", value: "m120" },
  { label: "60分", value: "m60" },
  { label: "30分", value: "m30" },
  { label: "15分", value: "m15" },
  { label: "5分", value: "m5" },
];

const WINDOW_OPTIONS = [
  { label: "近60", size: 60 },
  { label: "近120", size: 120 },
  { label: "近240", size: 240 },
  { label: "全部", size: 0 },
] as const;

function createLinePath(values: Array<number | null>, width: number, height: number, min: number, max: number): string {
  const validValues = values.filter((item): item is number => item !== null && Number.isFinite(item));
  if (validValues.length < 2 || max <= min) return "";

  const total = values.length - 1;
  const points: string[] = [];
  values.forEach((value, index) => {
    if (value === null || !Number.isFinite(value)) return;
    const x = total > 0 ? (index / total) * width : 0;
    const y = height - ((value - min) / (max - min)) * height;
    points.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  });
  return points.join(" ");
}

function createLinePathFromNumbers(values: number[], width: number, height: number, min: number, max: number): string {
  if (values.length < 2 || max <= min) return "";
  const total = values.length - 1;
  const points: string[] = [];
  values.forEach((value, index) => {
    const x = total > 0 ? (index / total) * width : 0;
    const y = height - ((value - min) / (max - min)) * height;
    points.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  });
  return points.join(" ");
}

function valueByIndex(values: Array<number | null>, index: number): number | null {
  if (index < 0 || index >= values.length) return null;
  const value = values[index];
  return value !== null && Number.isFinite(value) ? value : null;
}

function KlineChart({ detail }: { detail: StockDetailData }) {
  const isMinuteStyle = detail.period === "minute" || detail.period === "fiveDay";

  const [windowSize, setWindowSize] = useState<number>(isMinuteStyle ? 0 : 240);
  const [viewOffset, setViewOffset] = useState(0);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const dragRef = useRef<{ startX: number; startOffset: number } | null>(null);
  const rangeBarDragRef = useRef<{ startX: number; startOffset: number } | null>(null);
  const chartAreaRef = useRef<HTMLDivElement>(null);
  const rangeBarRef = useRef<HTMLDivElement>(null);
  const [chartAreaH, setChartAreaH] = useState(360);

  // Measure chart-interactive-area height dynamically
  useEffect(() => {
    const el = chartAreaRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height;
      if (h && h > 80) setChartAreaH(h);
    });
    ro.observe(el);
    if (el.offsetHeight > 80) setChartAreaH(el.offsetHeight);
    return () => ro.disconnect();
  }, []);

  // Reset state when period changes
  useEffect(() => {
    setViewOffset(0);
    setWindowSize(isMinuteStyle ? 0 : 240);
    setHoverIndex(null);
    dragRef.current = null;
    setIsDragging(false);
  }, [detail.period, isMinuteStyle]);

  // Release drag on global mouseup (covers both chart area and range bar)
  useEffect(() => {
    const release = () => {
      if (dragRef.current !== null) {
        dragRef.current = null;
        setIsDragging(false);
      }
      rangeBarDragRef.current = null;
    };
    window.addEventListener("mouseup", release);
    return () => window.removeEventListener("mouseup", release);
  }, []);

  const total = detail.kline.length;
  const effectiveSize = (windowSize <= 0 || isMinuteStyle) ? total : Math.min(windowSize, total);
  const maxOffset = Math.max(0, total - effectiveSize);
  const clampedOffset = Math.min(viewOffset, maxOffset);
  const canPan = !isMinuteStyle && maxOffset > 0;

  const visibleKline = useMemo(() => {
    if (isMinuteStyle || windowSize <= 0) return detail.kline;
    const endIdx = total - clampedOffset;
    const startIdx = Math.max(0, endIdx - effectiveSize);
    return detail.kline.slice(startIdx, endIdx);
  }, [detail.kline, windowSize, clampedOffset, effectiveSize, isMinuteStyle, total]);

  const closes = useMemo(() => visibleKline.map((item) => item.close), [visibleKline]);
  const highs = useMemo(() => visibleKline.map((item) => item.high), [visibleKline]);
  const lows = useMemo(() => visibleKline.map((item) => item.low), [visibleKline]);
  const volumes = useMemo(() => visibleKline.map((item) => item.volume), [visibleKline]);
  const ma5 = useMemo(() => calcMA(closes, 5), [closes]);
  const ma10 = useMemo(() => calcMA(closes, 10), [closes]);
  const ma30 = useMemo(() => calcMA(closes, 30), [closes]);
  const ma60 = useMemo(() => calcMA(closes, 60), [closes]);
  const macdData = useMemo(() => calcMACD(closes), [closes]);
  const avgLineData = useMemo(() => {
    let sum = 0;
    return closes.map((v, i) => { sum += v; return sum / (i + 1); });
  }, [closes]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!canPan) return;
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startOffset: clampedOffset };
    setIsDragging(true);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = chartAreaRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;

    if (dragRef.current !== null) {
      const dx = e.clientX - dragRef.current.startX;
      const barsPerPixel = visibleKline.length / rect.width;
      // drag left (dx<0) = see older data = increase offset
      const newOffset = clamp(
        dragRef.current.startOffset - Math.round(dx * barsPerPixel),
        0,
        maxOffset,
      );
      setViewOffset(newOffset);
      setHoverIndex(null);
    } else {
      const relX = clamp((e.clientX - rect.left) / rect.width, 0, 0.9999);
      setHoverIndex(clamp(Math.floor(relX * visibleKline.length), 0, visibleKline.length - 1));
    }
  };

  const handleMouseLeave = () => {
    if (dragRef.current !== null) return; // keep dragging even if mouse briefly exits
    setHoverIndex(null);
  };

  const handleMouseUp = () => {
    dragRef.current = null;
    setIsDragging(false);
  };

  // Range bar drag handlers (drag the visible window left/right to pan)
  const handleRangeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    rangeBarDragRef.current = { startX: e.clientX, startOffset: clampedOffset };
  };

  const handleRangeMouseMove = (e: React.MouseEvent) => {
    if (!rangeBarDragRef.current) return;
    const rect = rangeBarRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    const dx = e.clientX - rangeBarDragRef.current.startX;
    // 1 pixel in range bar = total/rect.width bars; drag right = view moves right = newer data = lower offset
    const barsPerPixel = total / rect.width;
    const newOffset = clamp(
      rangeBarDragRef.current.startOffset - Math.round(dx * barsPerPixel),
      0,
      maxOffset,
    );
    setViewOffset(newOffset);
  };

  const handleRangeMouseUp = () => {
    rangeBarDragRef.current = null;
  };

  if (visibleKline.length === 0) {
    return <div className="detail-empty">暂无 K 线数据</div>;
  }

  const last = visibleKline.length - 1;
  const SVG_W = 760;
  const volumeHeight = 80;
  const macdHeight = isMinuteStyle ? 0 : 90;
  // mainHeight tracks the actual rendered pixel height of the main SVG via ResizeObserver
  const mainHeight = Math.max(80, chartAreaH - volumeHeight - macdHeight);

  const low = Math.min(...lows);
  const high = Math.max(...highs);
  const pad = (high - low) * 0.08;
  const min = low - pad;
  const max = high + pad;
  const priceRange = Math.max(0.00001, max - min);

  // Minute chart: use prevClose as baseline for symmetric scale
  const baseline = isMinuteStyle ? detail.prevClose : (visibleKline[0]?.open ?? visibleKline[0]?.close ?? 0);
  const minuteSpan = Math.max(
    Math.max(...closes, baseline) - baseline,
    baseline - Math.min(...closes, baseline),
    0.0001,
  );
  const minuteMin = baseline - minuteSpan * 1.12;
  const minuteMax = baseline + minuteSpan * 1.12;
  const minuteColor = closes[last] >= baseline ? "#e45555" : "#2aa568";

  // Minute chart derived paths and geometry
  const minuteBaselineY = mainHeight - ((baseline - minuteMin) / (minuteMax - minuteMin)) * mainHeight;
  const minuteTicks = Array.from({ length: 7 }, (_, i) => {
    const r = i / 6;
    const price = minuteMax - r * (minuteMax - minuteMin);
    const pct = baseline > 0 ? ((price - baseline) / baseline) * 100 : 0;
    const y = mainHeight * r;
    return { price, pct, y };
  });
  const minutePricePath = closes.map((p, i) => {
    const x = closes.length > 1 ? (i / (closes.length - 1)) * SVG_W : 0;
    const y = mainHeight - ((p - minuteMin) / (minuteMax - minuteMin)) * mainHeight;
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
  const minuteAvgPath = avgLineData.map((p, i) => {
    const x = avgLineData.length > 1 ? (i / (avgLineData.length - 1)) * SVG_W : 0;
    const y = mainHeight - ((p - minuteMin) / (minuteMax - minuteMin)) * mainHeight;
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
  const minuteFillPath = (() => {
    const n = closes.length;
    if (n === 0) return '';
    const pts = closes.map((p, i) => {
      const x = n > 1 ? (i / (n - 1)) * SVG_W : 0;
      const y = mainHeight - ((p - minuteMin) / (minuteMax - minuteMin)) * mainHeight;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    });
    return `M 0.00,${minuteBaselineY.toFixed(2)} L ${pts.join(' L ')} L ${SVG_W}.00,${minuteBaselineY.toFixed(2)} Z`;
  })();
  // Position of 11:30/13:00 break on X axis
  const noonBreakX = (() => {
    const n = visibleKline.length;
    if (n <= 1) return -1;
    let lastMorningIdx = -1;
    for (let i = 0; i < n; i++) {
      const t = visibleKline[i].date.slice(-5);
      if (t <= '11:30') lastMorningIdx = i; else break;
    }
    if (lastMorningIdx <= 0 || lastMorningIdx >= n - 1) return -1;
    return (lastMorningIdx / (n - 1)) * SVG_W;
  })();

  const volumeMax = Math.max(...volumes, 1);
  const volumeUnit = getVolumeDisplayUnit(volumeMax);

  const macdValid = macdData.macd.filter((v): v is number => v !== null && Number.isFinite(v));
  const difValid  = macdData.dif.filter((v): v is number => v !== null && Number.isFinite(v));
  const deaValid  = macdData.dea.filter((v): v is number => v !== null && Number.isFinite(v));
  const macdAbs   = Math.max(Math.abs(Math.min(...macdValid, ...difValid, ...deaValid, -0.01)),
                             Math.abs(Math.max(...macdValid, ...difValid, ...deaValid, 0.01)));
  const macdMin = -macdAbs;
  const macdMax =  macdAbs;

  const lastMa5  = valueByIndex(ma5, last);
  const lastMa10 = valueByIndex(ma10, last);
  const lastMa30 = valueByIndex(ma30, last);
  const lastMa60 = valueByIndex(ma60, last);

  const step = SVG_W / visibleKline.length;
  const activeIndex = hoverIndex === null ? last : clamp(hoverIndex, 0, last);
  const activeBar   = visibleKline[activeIndex];
  // For minute chart, compare vs prev close (baseline); for K-line, compare vs previous bar
  const prevClose = isMinuteStyle ? baseline : (activeIndex > 0 ? visibleKline[activeIndex - 1].close : activeBar.open);
  const activeChangePct = prevClose > 0 ? ((activeBar.close - prevClose) / prevClose) * 100 : Number.NaN;
  const activeX = isMinuteStyle
    ? (closes.length > 1 ? (activeIndex / (closes.length - 1)) * SVG_W : 0)
    : activeIndex * step + step / 2;
  const activeCloseY = isMinuteStyle
    ? mainHeight - ((activeBar.close - minuteMin) / (minuteMax - minuteMin)) * mainHeight
    : mainHeight - ((activeBar.close - min) / priceRange) * mainHeight;

  // pan-progress thumb position/width
  const thumbLeft  = total > effectiveSize ? ((total - effectiveSize - clampedOffset) / (total - effectiveSize)) * (1 - effectiveSize / total) * 100 : 0;
  const thumbWidth = total > 0 ? (effectiveSize / total) * 100 : 100;

  const areaClass = [
    "chart-interactive-area",
    canPan ? "can-pan" : "",
    isDragging ? "is-dragging" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className="detail-chart-wrap">
      {/* Legend */}
      {!isMinuteStyle ? (
        <div className="legend-row">
          <span className="legend-item"><i style={{ background: "#f4b400" }} />MA5 {lastMa5 === null ? "-" : formatNumber(lastMa5, 2)}</span>
          <span className="legend-item"><i style={{ background: "#8e44ff" }} />MA10 {lastMa10 === null ? "-" : formatNumber(lastMa10, 2)}</span>
          <span className="legend-item"><i style={{ background: "#4a78ff" }} />MA30 {lastMa30 === null ? "-" : formatNumber(lastMa30, 2)}</span>
          <span className="legend-item"><i style={{ background: "#14263f" }} />MA60 {lastMa60 === null ? "-" : formatNumber(lastMa60, 2)}</span>
        </div>
      ) : (
        <div className="legend-row">
          <span className="legend-item"><i style={{ background: minuteColor }} />分时 {formatNumber(closes[last], 2)}</span>
          <span className="legend-item"><i style={{ background: "#c6ad58" }} />均价 {avgLineData.length > 0 ? formatNumber(avgLineData[avgLineData.length - 1], 2) : '-'}</span>
          <span className="legend-item"><i style={{ background: "#888" }} />昨收 {formatNumber(baseline, 2)}</span>
        </div>
      )}

      {/* OHLC info row (K-line only; minute uses floating tooltip) */}
      {!isMinuteStyle ? (
        <div className="ohlc-row">
          <span>{activeBar.date}</span>
          <span>开 {formatNumber(activeBar.open, 2)}</span>
          <span>高 {formatNumber(activeBar.high, 2)}</span>
          <span>低 {formatNumber(activeBar.low, 2)}</span>
          <span>收 <em className={toneClass(activeBar.close - prevClose)}>{formatNumber(activeBar.close, 2)}</em></span>
          <span>涨跌 <em className={toneClass(activeBar.close - prevClose)}>{formatPercent(activeChangePct)}</em></span>
          <span>量 {formatNumber(activeBar.volume / volumeUnit.divisor, 2)}{volumeUnit.unit}</span>
        </div>
      ) : null}


      {/* Interactive chart area — handles all mouse events */}
      <div
        ref={chartAreaRef}
        className={areaClass}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      >
        {/* Main price chart */}
        <svg className="kline-main" viewBox={`0 0 ${SVG_W} ${mainHeight}`}>
          {[0, 0.25, 0.5, 0.75, 1].map((r) => (
            <line key={r} x1="0" x2={SVG_W} y1={(mainHeight * r).toFixed(2)} y2={(mainHeight * r).toFixed(2)} className="chart-grid-line" />
          ))}
          {[0.25, 0.5, 0.75].map((r) => (
            <line key={`v${r}`} x1={(SVG_W * r).toFixed(2)} x2={(SVG_W * r).toFixed(2)} y1="0" y2={mainHeight} className="chart-grid-line" />
          ))}

          {!isMinuteStyle ? visibleKline.map((bar, i) => {
            const x = i * step + step / 2;
            const wickTop    = mainHeight - ((bar.high - min) / priceRange) * mainHeight;
            const wickBottom = mainHeight - ((bar.low  - min) / priceRange) * mainHeight;
            const openY      = mainHeight - ((bar.open  - min) / priceRange) * mainHeight;
            const closeY     = mainHeight - ((bar.close - min) / priceRange) * mainHeight;
            const up = bar.close >= bar.open;
            const bodyTop = Math.min(openY, closeY);
            const bodyH   = Math.max(1, Math.abs(openY - closeY));
            const bodyW   = Math.max(1, step * 0.66);
            return (
              <g key={`${bar.date}-${i}`}>
                <line x1={x} x2={x} y1={wickTop} y2={wickBottom} className={up ? "candle-wick-up" : "candle-wick-down"} />
                <rect x={x - bodyW / 2} y={bodyTop} width={bodyW} height={bodyH} className={up ? "candle-body-up" : "candle-body-down"} />
              </g>
            );
          }) : (
            <>
              <defs>
                <linearGradient id="min-fill-up" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={minuteColor} stopOpacity="0.38" />
                  <stop offset="100%" stopColor={minuteColor} stopOpacity="0.03" />
                </linearGradient>
                <linearGradient id="min-fill-dn" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={minuteColor} stopOpacity="0.03" />
                  <stop offset="100%" stopColor={minuteColor} stopOpacity="0.38" />
                </linearGradient>
                <clipPath id="min-clip-up">
                  <rect x="0" y="0" width={SVG_W} height={minuteBaselineY} />
                </clipPath>
                <clipPath id="min-clip-dn">
                  <rect x="0" y={minuteBaselineY} width={SVG_W} height={mainHeight - minuteBaselineY} />
                </clipPath>
              </defs>
              {/* Gradient fill above baseline */}
              <path d={minuteFillPath} fill="url(#min-fill-up)" clipPath="url(#min-clip-up)" />
              {/* Gradient fill below baseline */}
              <path d={minuteFillPath} fill="url(#min-fill-dn)" clipPath="url(#min-clip-dn)" />
              {/* Avg line */}
              <path d={minuteAvgPath} className="minute-avg-line" fill="none" />
              {/* Price line */}
              <path d={minutePricePath} fill="none" stroke={minuteColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              {/* Baseline (昨收) */}
              <line x1="0" x2={SVG_W} y1={minuteBaselineY.toFixed(2)} y2={minuteBaselineY.toFixed(2)} className="minute-baseline" />
              {/* 11:30/13:00 break vertical guide */}
              {noonBreakX > 0 ? (
                <line x1={noonBreakX.toFixed(2)} x2={noonBreakX.toFixed(2)} y1="0" y2={mainHeight} className="chart-grid-line" />
              ) : null}
              {/* Left axis: price labels */}
              {minuteTicks.map((tick, i) => (
                <text key={`ml${i}`} x={2} y={tick.y + (i === 0 ? 10 : i === 6 ? -3 : -3)} textAnchor="start" className="axis-label">
                  {formatNumber(tick.price, 2)}
                </text>
              ))}
              {/* Right axis: % change labels */}
              {minuteTicks.map((tick, i) => (
                <text
                  key={`mr${i}`}
                  x={SVG_W - 2}
                  y={tick.y + (i === 0 ? 10 : i === 6 ? -3 : -3)}
                  textAnchor="end"
                  className={`axis-label ${tick.pct > 0.001 ? 'up' : tick.pct < -0.001 ? 'down' : ''}`}
                >
                  {tick.pct >= 0 ? '+' : ''}{tick.pct.toFixed(2)}%
                </text>
              ))}
            </>
          )}

          {/* K-line price axis labels (left side) */}
          {!isMinuteStyle ? [0, 0.25, 0.5, 0.75, 1].map((r) => {
            const tickVal = max - (max - min) * r;
            return (
              <text key={`pt${r}`} x={2} y={mainHeight * r + (r === 0 ? 10 : -2)} textAnchor="start" className="axis-label">
                {formatNumber(tickVal, 2)}
              </text>
            );
          }) : null}

          {/* MA lines (K-line mode) */}
          {!isMinuteStyle ? (
            <>
              <polyline points={createLinePath(ma5,  SVG_W, mainHeight, min, max)} className="ma5-line" />
              <polyline points={createLinePath(ma10, SVG_W, mainHeight, min, max)} className="ma10-line" />
              <polyline points={createLinePath(ma30, SVG_W, mainHeight, min, max)} className="ma30-line" />
              <polyline points={createLinePath(ma60, SVG_W, mainHeight, min, max)} className="ma60-line" />
            </>
          ) : null}

          {/* Crosshair */}
          <line x1="0" x2={SVG_W} y1={activeCloseY.toFixed(2)} y2={activeCloseY.toFixed(2)} className="crosshair-line" />
          <line x1={activeX.toFixed(2)} x2={activeX.toFixed(2)} y1="0" y2={mainHeight} className="crosshair-line" />

          {/* Minute: dot marker at price point + time badge */}
          {isMinuteStyle ? (
            <>
              <circle
                cx={activeX.toFixed(2)}
                cy={activeCloseY.toFixed(2)}
                r="4"
                fill="white"
                stroke={minuteColor}
                strokeWidth="2"
              />
              {hoverIndex !== null ? (() => {
                const label = activeBar.date.slice(-5);
                const bw = label.length * 6.5 + 10;
                const bx = Math.max(bw / 2 + 2, Math.min(SVG_W - bw / 2 - 2, activeX));
                return (
                  <g>
                    <rect x={(bx - bw / 2).toFixed(1)} y={(mainHeight - 17).toFixed(1)} width={bw.toFixed(1)} height="15" rx="3" fill="rgba(24,26,38,0.88)" />
                    <text x={bx.toFixed(1)} y={(mainHeight - 6).toFixed(1)} textAnchor="middle" fontSize="10" fill="rgba(255,255,255,0.92)" fontFamily="monospace">
                      {label}
                    </text>
                  </g>
                );
              })() : null}
            </>
          ) : null}
        </svg>

        {/* Volume chart */}
        <svg className="kline-volume" viewBox={`0 0 ${SVG_W} ${volumeHeight}`}>
          {volumes.map((vol, i) => {
            const x = isMinuteStyle
              ? (volumes.length > 1 ? (i / (volumes.length - 1)) * SVG_W : 0)
              : (i / volumes.length) * SVG_W;
            const w = isMinuteStyle
              ? Math.max(1, SVG_W / volumes.length - 0.5)
              : SVG_W / volumes.length;
            const h = (vol / volumeMax) * (volumeHeight - 2);
            const y = volumeHeight - h;
            const up = closes[i] >= (i > 0 ? closes[i - 1] : closes[i]);
            return (
              <rect
                key={`${visibleKline[i].date}-v${i}`}
                x={x.toFixed(2)} y={y.toFixed(2)}
                width={w.toFixed(2)} height={h.toFixed(2)}
                className={up ? "volume-up" : "volume-down"}
              />
            );
          })}
          {/* Volume axis labels */}
          {isMinuteStyle ? (
            <>
              <text x={2} y={10} textAnchor="start" className="axis-label">{formatNumber(volumeMax / volumeUnit.divisor, 2)}</text>
              <text x={2} y={volumeHeight - 2} textAnchor="start" className="axis-label">({volumeUnit.unit})</text>
              {noonBreakX > 0 ? (
                <line x1={noonBreakX.toFixed(2)} x2={noonBreakX.toFixed(2)} y1="0" y2={volumeHeight} className="chart-grid-line" />
              ) : null}
            </>
          ) : (
            <text x={2} y={10} textAnchor="start" className="axis-label">VOL {volumeUnit.unit}</text>
          )}
          <line x1={activeX.toFixed(2)} x2={activeX.toFixed(2)} y1="0" y2={volumeHeight} className="crosshair-line" />

          {/* Minute: amount badge at bottom of volume chart */}
          {isMinuteStyle && hoverIndex !== null ? (() => {
            const amountWan = activeBar.close * activeBar.volume * 100 / 10000;
            const label = `${formatNumber(amountWan, 2)}万`;
            const bw = label.length * 6.5 + 10;
            const bx = Math.max(bw / 2 + 2, Math.min(SVG_W - bw / 2 - 2, activeX));
            return (
              <g>
                <rect x={(bx - bw / 2).toFixed(1)} y={(volumeHeight - 17).toFixed(1)} width={bw.toFixed(1)} height="15" rx="3" fill="rgba(24,26,38,0.88)" />
                <text x={bx.toFixed(1)} y={(volumeHeight - 6).toFixed(1)} textAnchor="middle" fontSize="10" fill="rgba(255,255,255,0.92)" fontFamily="monospace">
                  {label}
                </text>
              </g>
            );
          })() : null}
        </svg>

        {/* Floating tooltip for minute chart */}
        {isMinuteStyle && hoverIndex !== null ? (() => {
          const pct = activeX / SVG_W;
          const isRight = pct > 0.58;
          const avgPrice = avgLineData[activeIndex] ?? 0;
          const amountWan = activeBar.close * activeBar.volume * 100 / 10000;
          const style: React.CSSProperties = {
            top: '8px',
            ...(isRight
              ? { right: `${((1 - pct) * 100).toFixed(1)}%` }
              : { left: `calc(${(pct * 100).toFixed(1)}% + 10px)` }),
          };
          return (
            <div className="minute-tooltip" style={style}>
              <div className="mt-row"><span className="mt-label">时间</span><span className="mt-val">{activeBar.date.slice(-5)}</span></div>
              <div className="mt-row"><span className="mt-label">价格</span><span className={`mt-val ${toneClass(activeBar.close - baseline)}`}>{formatNumber(activeBar.close, 2)}</span></div>
              <div className="mt-row"><span className="mt-label">涨跌幅</span><span className={`mt-val ${toneClass(activeBar.close - baseline)}`}>{activeChangePct >= 0 ? '+' : ''}{activeChangePct.toFixed(2)}%</span></div>
              <div className="mt-row"><span className="mt-label">均价</span><span className="mt-val">{formatNumber(avgPrice, 2)}</span></div>
              <div className="mt-row"><span className="mt-label">成交量</span><span className="mt-val">{formatNumber(activeBar.volume, 0)}手</span></div>
              <div className="mt-row"><span className="mt-label">金额</span><span className="mt-val">{formatNumber(amountWan, 2)}万</span></div>
            </div>
          );
        })() : null}

        {/* MACD chart (K-line mode only) */}
        {!isMinuteStyle ? (
          <svg className="kline-macd" viewBox={`0 0 ${SVG_W} ${macdHeight}`}>
            <line x1="0" x2={SVG_W} y1={(macdHeight / 2).toFixed(2)} y2={(macdHeight / 2).toFixed(2)} className="chart-grid-line" />
            {macdData.macd.map((item, i) => {
              if (item === null || !Number.isFinite(item)) return null;
              const x = (i / macdData.macd.length) * SVG_W;
              const zeroY = macdHeight - ((0 - macdMin) / (macdMax - macdMin)) * macdHeight;
              const y     = macdHeight - ((item - macdMin) / (macdMax - macdMin)) * macdHeight;
              const bh    = Math.abs(y - zeroY);
              return (
                <rect key={`macd-${i}`} x={x.toFixed(2)} y={Math.min(y, zeroY).toFixed(2)}
                  width={(SVG_W / macdData.macd.length).toFixed(2)} height={bh.toFixed(2)}
                  className={item >= 0 ? "volume-up" : "volume-down"} />
              );
            })}
            <polyline points={createLinePath(macdData.dif, SVG_W, macdHeight, macdMin, macdMax)} className="dif-line" />
            <polyline points={createLinePath(macdData.dea, SVG_W, macdHeight, macdMin, macdMax)} className="dea-line" />
            <line x1={activeX.toFixed(2)} x2={activeX.toFixed(2)} y1="0" y2={macdHeight} className="crosshair-line" />
          </svg>
        ) : null}
      </div>

      {/* MACD legend */}
      {!isMinuteStyle ? (
        <div className="legend-row compact">
          <span className="legend-item"><i style={{ background: "#24a5d6" }} />MACD</span>
          <span className="legend-item"><i style={{ background: "#f6c545" }} />DIF</span>
          <span className="legend-item"><i style={{ background: "#58cbf8" }} />DEA</span>
        </div>
      ) : null}

      {/* Date axis */}
      <div className="kline-date-row">
        {isMinuteStyle ? (
          <>
            <span>{visibleKline[0].date.slice(-5)}</span>
            {noonBreakX > 0 ? <span>11:30/13:00</span> : <span />}
            <span>{visibleKline[last].date.slice(-5)}</span>
          </>
        ) : (
          <>
            <span>{visibleKline[0].date}</span>
            <span>{visibleKline[Math.floor(visibleKline.length / 2)].date}</span>
            <span>{visibleKline[last].date}</span>
          </>
        )}
      </div>

      {/* Time range selector (K-line only) */}
      {!isMinuteStyle ? (
        <div className="chart-range-row">
          {/* Window size presets */}
          <div className="chart-range-presets">
            {WINDOW_OPTIONS.map((option) => (
              <button
                key={option.label}
                type="button"
                className={`range-preset-btn ${windowSize === option.size ? "active" : ""}`}
                onClick={() => { setWindowSize(option.size); setViewOffset(0); }}
              >
                {option.label}
              </button>
            ))}
          </div>

          {/* Draggable range bar */}
          <div
            ref={rangeBarRef}
            className={`chart-range-bar${rangeBarDragRef.current ? ' dragging' : ''}`}
            onMouseDown={handleRangeMouseDown}
            onMouseMove={handleRangeMouseMove}
            onMouseUp={handleRangeMouseUp}
          >
            {/* Full data range = full width of bar */}
            <div className="range-bar-track">
              {/* Visible window highlight */}
              <div
                className="range-bar-window"
                style={{ left: `${thumbLeft.toFixed(2)}%`, width: `${thumbWidth.toFixed(2)}%` }}
              >
                <span className="range-date-label">{visibleKline[0].date.slice(0, 10)}</span>
                <span className="range-date-label">{visibleKline[last].date.slice(0, 10)}</span>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function StockDetailView({ code, fallbackName, onBack }: Props) {
  const [detail, setDetail] = useState<StockDetailData | null>(null);
  const [period, setPeriod] = useState<StockPeriod>("day");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshAt, setRefreshAt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const result = await fetchTencentStockDetail(code, fallbackName, period);
        if (cancelled) return;
        setDetail(result);
        setError("");
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "详情获取失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    const timer = window.setInterval(() => {
      if (isTradingHours()) void load();
    }, period === "minute" || period === "fiveDay" ? 20_000 : 40_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [code, fallbackName, period, refreshAt]);

  return (
    <section className="stock-detail-panel">
      <header className="detail-header">
        <button type="button" className="detail-back-btn" onClick={onBack}>
          <ChevronLeft size={14} />
          返回
        </button>
        <button type="button" className="detail-refresh-btn" onClick={() => setRefreshAt((prev) => prev + 1)} disabled={loading}>
          {loading ? <Loader2 size={13} className="spinning" /> : <RefreshCw size={13} />}
          刷新
        </button>
      </header>

      {loading && !detail ? (
        <div className="detail-loading">详情加载中...</div>
      ) : null}

      {error && !detail ? (
        <div className="detail-error">详情获取失败：{error}</div>
      ) : null}

      {detail ? (
        <div className="detail-body">
          <div className="detail-title-row">
            <div className="title-left">
              <strong>{detail.name}</strong>
              <span>{detail.code}</span>
            </div>
            <div className={`title-price ${toneClass(detail.changePct)}`}>
              {formatNumber(detail.price, 2)} / {formatPercent(detail.changePct)}
            </div>
          </div>

          <div className="detail-stats-grid">
            <div><span>今开</span><b className={toneClass(detail.open - detail.prevClose)}>{formatNumber(detail.open, 2)}</b></div>
            <div><span>昨收</span><b>{formatNumber(detail.prevClose, 2)}</b></div>
            <div><span>最高</span><b className={toneClass(detail.high - detail.prevClose)}>{formatNumber(detail.high, 2)}</b></div>
            <div><span>最低</span><b className={toneClass(detail.low - detail.prevClose)}>{formatNumber(detail.low, 2)}</b></div>
            <div><span>成交量</span><b>{formatNumber(detail.volumeHands / 10000, 2)}万手</b></div>
            <div><span>成交额</span><b>{formatNumber(detail.amountWanYuan / 10000, 2)}亿</b></div>
            <div><span>换手率</span><b>{formatPercent(detail.turnoverRate)}</b></div>
            <div><span>市盈率(TTM)</span><b>{formatNumber(detail.peTtm, 2)}</b></div>
            <div><span>总市值</span><b>{formatNumber(detail.totalMarketCapYi, 2)}亿</b></div>
            <div><span>更新时间</span><b>{detail.updatedAt}</b></div>
          </div>

          <KlineChart detail={detail} />
          <div className="period-tabs">
            {PERIOD_TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                className={`period-tab ${period === tab.value ? "active" : ""}`}
                onClick={() => setPeriod(tab.value)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
