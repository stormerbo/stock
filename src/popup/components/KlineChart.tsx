import { useEffect, useMemo, useRef, useState } from 'react';
import {
  calcMA,
  calcMACD,
  type StockDetailData,
} from '../stockDetail';

const UP_COLOR = '#e45555';
const DN_COLOR = '#2aa568';

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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getVolumeDisplayUnit(maxVolume: number): { divisor: number; unit: string } {
  if (maxVolume >= 100000000) return { divisor: 100000000, unit: '亿手' };
  if (maxVolume >= 10000) return { divisor: 10000, unit: '万手' };
  return { divisor: 1, unit: '手' };
}

// Time-based X positioning for minute chart
const MORNING_START = 9 * 60 + 30;
const MORNING_END   = 11 * 60 + 30;
const AFTERNOON_START = 13 * 60;
const AFTERNOON_END = 15 * 60;
const TOTAL_TRADING_MINUTES = 240;

function parseTimeToMinutes(timeStr: string): number {
  const m = timeStr.match(/(\d{1,2}):(\d{2})/);
  if (!m) return -1;
  return parseInt(m[1]) * 60 + parseInt(m[2]);
}

function timeToFraction(timeStr: string): number {
  const minutes = parseTimeToMinutes(timeStr);
  if (minutes < 0) return 0;
  if (minutes <= MORNING_END) {
    return (minutes - MORNING_START) / TOTAL_TRADING_MINUTES;
  }
  if (minutes <= AFTERNOON_START) {
    return 120 / TOTAL_TRADING_MINUTES;
  }
  if (minutes <= AFTERNOON_END) {
    return (120 + (minutes - AFTERNOON_START)) / TOTAL_TRADING_MINUTES;
  }
  return 1;
}

function fractionToX(frac: number, svgWidth: number): number {
  return clamp(frac, 0, 1) * svgWidth;
}

function createLinePath(values: Array<number | null>, width: number, height: number, min: number, max: number): string {
  const validValues = values.filter((item): item is number => item !== null && Number.isFinite(item));
  if (validValues.length < 2 || max <= min) return '';

  const total = values.length - 1;
  const points: string[] = [];
  values.forEach((value, index) => {
    if (value === null || !Number.isFinite(value)) return;
    const x = total > 0 ? (index / total) * width : 0;
    const y = height - ((value - min) / (max - min)) * height;
    points.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  });
  return points.join(' ');
}

function valueByIndex(values: Array<number | null>, index: number): number | null {
  if (index < 0 || index >= values.length) return null;
  const value = values[index];
  return value !== null && Number.isFinite(value) ? value : null;
}

// ─── Indicator Toggle Button ───

type IndicatorToggleProps = {
  label: string;
  value?: string;
  color: string;
  active: boolean;
  onClick: () => void;
};

function IndicatorToggle({ label, value, color, active, onClick }: IndicatorToggleProps) {
  return (
    <button
      type="button"
      className={`indicator-toggle ${active ? 'active' : 'inactive'}`}
      onClick={onClick}
    >
      <span className="indicator-dot" style={{ background: active ? color : 'rgba(255,255,255,0.2)' }} />
      <span className="indicator-label">{label}</span>
      {value && <span className="indicator-value">{value}</span>}
    </button>
  );
}

// ─── Kline Chart Component ───

export default function KlineChart({ detail }: { detail: StockDetailData }) {
  const isMinuteStyle = detail.period === 'minute' || detail.period === 'fiveDay';
  const isSingleMinute = detail.period === 'minute';
  const showRangeControls = detail.period !== 'minute';
  const MIN_WINDOW_SIZE = 24;

  const [windowSize, setWindowSize] = useState<number>(detail.period === 'minute' ? 0 : 60);
  const [viewOffset, setViewOffset] = useState(0);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [hoverSvgX, setHoverSvgX] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const [showMa5, setShowMa5] = useState(true);
  const [showMa10, setShowMa10] = useState(true);
  const [showMa20, setShowMa20] = useState(true);
  const [showMa30, setShowMa30] = useState(true);
  const [showMa60, setShowMa60] = useState(true);
  const [showAvgLine, setShowAvgLine] = useState(true);
  const [showMacdBar, setShowMacdBar] = useState(true);
  const [showDif, setShowDif] = useState(true);
  const [showDea, setShowDea] = useState(true);

  const dragRef = useRef<{ startX: number; startOffset: number } | null>(null);
  const rangeBarDragRef = useRef<{
    startX: number;
    startOffset: number;
    startSize: number;
    mode: 'move' | 'resize-left' | 'resize-right';
  } | null>(null);
  const chartAreaRef = useRef<HTMLDivElement>(null);
  const rangeBarRef = useRef<HTMLDivElement>(null);
  const [chartAreaH, setChartAreaH] = useState(360);

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

  useEffect(() => {
    setViewOffset(0);
    setWindowSize(detail.period === 'minute' ? 0 : 60);
    setHoverIndex(null);
    setHoverSvgX(null);
    dragRef.current = null;
    setIsDragging(false);
  }, [detail.period, isMinuteStyle]);

  useEffect(() => {
    const release = () => {
      if (dragRef.current !== null) {
        dragRef.current = null;
        setIsDragging(false);
      }
      rangeBarDragRef.current = null;
    };
    window.addEventListener('mouseup', release);
    return () => window.removeEventListener('mouseup', release);
  }, []);

  const total = detail.kline.length;
  const effectiveSize = (windowSize <= 0 || detail.period === 'minute') ? total : Math.min(windowSize, total);
  const maxOffset = Math.max(0, total - effectiveSize);
  const clampedOffset = Math.min(viewOffset, maxOffset);
  const canPan = showRangeControls && maxOffset > 0;

  const visibleKline = useMemo(() => {
    if (detail.period === 'minute' || windowSize <= 0) return detail.kline;
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
  const ma20 = useMemo(() => calcMA(closes, 20), [closes]);
  const ma30 = useMemo(() => calcMA(closes, 30), [closes]);
  const ma60 = useMemo(() => calcMA(closes, 60), [closes]);
  const macdData = useMemo(() => calcMACD(closes), [closes]);

  const avgLineData = useMemo(() => {
    let sumAmount = 0;
    let sumVol = 0;
    return visibleKline.map((v) => {
      sumAmount += v.close * v.volume;
      sumVol += v.volume;
      return sumVol > 0 ? sumAmount / sumVol : v.close;
    });
  }, [visibleKline]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!canPan) return;
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startOffset: clampedOffset };
    setIsDragging(true);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = chartAreaRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    if (visibleKline.length === 0) return;

    if (dragRef.current !== null) {
      const dx = e.clientX - dragRef.current.startX;
      const barsPerPixel = visibleKline.length / rect.width;
      const newOffset = clamp(
        dragRef.current.startOffset - Math.round(dx * barsPerPixel),
        0,
        maxOffset,
      );
      setViewOffset(newOffset);
      setHoverIndex(null);
      setHoverSvgX(null);
    } else {
      const relX = clamp((e.clientX - rect.left) / rect.width, 0, 0.9999);
      const currentHoverX = relX * SVG_W;
      setHoverSvgX(currentHoverX);

      if (isMinuteStyle && isSingleMinute) {
        let nearestIdx = 0;
        let nearestDist = Number.POSITIVE_INFINITY;
        for (let i = 0; i < minuteXs.length; i += 1) {
          const dist = Math.abs(minuteXs[i] - currentHoverX);
          if (dist < nearestDist) {
            nearestDist = dist;
            nearestIdx = i;
          }
        }
        setHoverIndex(nearestIdx);
      } else if (isMinuteStyle) {
        setHoverIndex(clamp(Math.floor(relX * visibleKline.length), 0, visibleKline.length - 1));
      } else {
        const candleStep = SVG_W / visibleKline.length;
        const nearestIdx = clamp(Math.round((currentHoverX - candleStep / 2) / candleStep), 0, visibleKline.length - 1);
        setHoverIndex(nearestIdx);
      }
    }
  };

  const handleMouseLeave = () => {
    if (dragRef.current !== null) return;
    setHoverIndex(null);
    setHoverSvgX(null);
  };

  const handleMouseUp = () => {
    dragRef.current = null;
    setIsDragging(false);
  };

  const handleRangeMouseDown = (e: React.MouseEvent) => {
    if (!showRangeControls) return;
    e.preventDefault();
    rangeBarDragRef.current = {
      startX: e.clientX,
      startOffset: clampedOffset,
      startSize: effectiveSize,
      mode: 'move',
    };
  };

  const handleRangeLeftHandleMouseDown = (e: React.MouseEvent) => {
    if (!showRangeControls) return;
    e.preventDefault();
    e.stopPropagation();
    rangeBarDragRef.current = {
      startX: e.clientX,
      startOffset: clampedOffset,
      startSize: effectiveSize,
      mode: 'resize-left',
    };
  };

  const handleRangeRightHandleMouseDown = (e: React.MouseEvent) => {
    if (!showRangeControls) return;
    e.preventDefault();
    e.stopPropagation();
    rangeBarDragRef.current = {
      startX: e.clientX,
      startOffset: clampedOffset,
      startSize: effectiveSize,
      mode: 'resize-right',
    };
  };

  const handleRangeMouseMove = (e: React.MouseEvent) => {
    if (!rangeBarDragRef.current) return;
    const rect = rangeBarRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;

    const start = rangeBarDragRef.current;
    const dx = e.clientX - rangeBarDragRef.current.startX;
    const barsPerPixel = total > 0 ? total / rect.width : 1;
    const deltaBars = Math.round(dx * barsPerPixel);

    if (start.mode === 'move') {
      const newOffset = clamp(start.startOffset - deltaBars, 0, maxOffset);
      setViewOffset(newOffset);
      return;
    }

    const startRight = total - start.startOffset;
    const startLeft = startRight - start.startSize;

    if (start.mode === 'resize-left') {
      const nextLeft = clamp(startLeft + deltaBars, 0, Math.max(0, startRight - MIN_WINDOW_SIZE));
      const nextSize = clamp(startRight - nextLeft, MIN_WINDOW_SIZE, total);
      const nextOffset = clamp(total - startRight, 0, Math.max(0, total - nextSize));
      setWindowSize(nextSize);
      setViewOffset(nextOffset);
      return;
    }

    const nextRight = clamp(startRight + deltaBars, Math.min(total, startLeft + MIN_WINDOW_SIZE), total);
    const nextSize = clamp(nextRight - startLeft, MIN_WINDOW_SIZE, total);
    const nextOffset = clamp(total - nextRight, 0, Math.max(0, total - nextSize));
    setWindowSize(nextSize);
    setViewOffset(nextOffset);
  };

  const handleRangeMouseUp = () => {
    rangeBarDragRef.current = null;
  };

  const handleChartWheel = (e: React.WheelEvent) => {
    if (!showRangeControls || total <= MIN_WINDOW_SIZE) return;
    e.preventDefault();

    const rect = chartAreaRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;

    const relX = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    const currentRight = total - clampedOffset;
    const currentLeft = currentRight - effectiveSize;
    const anchor = clamp(
      Math.round(currentLeft + relX * Math.max(effectiveSize - 1, 0)),
      0,
      Math.max(0, total - 1),
    );

    const scale = e.deltaY < 0 ? 0.86 : 1.16;
    const nextSize = clamp(
      Math.round(effectiveSize * scale),
      MIN_WINDOW_SIZE,
      total,
    );
    const nextLeft = clamp(
      Math.round(anchor - relX * Math.max(nextSize - 1, 0)),
      0,
      Math.max(0, total - nextSize),
    );
    const nextRight = nextLeft + nextSize;
    const nextOffset = clamp(total - nextRight, 0, Math.max(0, total - nextSize));

    setWindowSize(nextSize);
    setViewOffset(nextOffset);
  };

  if (visibleKline.length === 0) {
    return <div className="detail-empty">暂无 K 线数据</div>;
  }

  const last = visibleKline.length - 1;
  const SVG_W = 760;
  const volumeHeight = 80;
  const macdHeight = isMinuteStyle ? 0 : 90;
  const mainHeight = Math.max(80, chartAreaH - volumeHeight - macdHeight);

  const low = Math.min(...lows);
  const high = Math.max(...highs);
  const pad = (high - low) * 0.08;
  const min = low - pad;
  const max = high + pad;
  const priceRange = Math.max(0.00001, max - min);

  const baseline = isMinuteStyle ? detail.prevClose : (visibleKline[0]?.open ?? visibleKline[0]?.close ?? 0);
  const minuteSpan = Math.max(
    Math.max(...closes, baseline) - baseline,
    baseline - Math.min(...closes, baseline),
    0.0001,
  );
  const minuteMin = baseline - minuteSpan * 1.12;
  const minuteMax = baseline + minuteSpan * 1.12;
  const minuteColor = closes[last] >= baseline ? '#e45555' : '#2aa568';

  const minuteBaselineY = mainHeight - ((baseline - minuteMin) / (minuteMax - minuteMin)) * mainHeight;
  const minuteTicks = Array.from({ length: 7 }, (_, i) => {
    const r = i / 6;
    const price = minuteMax - r * (minuteMax - minuteMin);
    const pct = baseline > 0 ? ((price - baseline) / baseline) * 100 : 0;
    const y = mainHeight * r;
    return { price, pct, y };
  });

  const minuteXs = useMemo(() => {
    if (!isSingleMinute) return visibleKline.map((_, i) => (visibleKline.length > 1 ? (i / (visibleKline.length - 1)) * SVG_W : 0));
    return visibleKline.map((bar) => {
      const timeStr = bar.date.slice(-5);
      return fractionToX(timeToFraction(timeStr), SVG_W);
    });
  }, [visibleKline, isSingleMinute, SVG_W]);

  const minutePricePath = closes.map((p, i) => {
    const x = minuteXs[i];
    const y = mainHeight - ((p - minuteMin) / (minuteMax - minuteMin)) * mainHeight;
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
  const minuteAvgPath = avgLineData.map((p, i) => {
    const x = minuteXs[i];
    const y = mainHeight - ((p - minuteMin) / (minuteMax - minuteMin)) * mainHeight;
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
  const minuteFillPath = (() => {
    const n = closes.length;
    if (n === 0) return '';
    const lastX = minuteXs[n - 1];
    const pts = closes.map((p, i) => `${minuteXs[i].toFixed(2)},${(mainHeight - ((p - minuteMin) / (minuteMax - minuteMin)) * mainHeight).toFixed(2)}`);
    return `M 0.00,${minuteBaselineY.toFixed(2)} L ${pts.join(' L ')} L ${lastX.toFixed(2)},${minuteBaselineY.toFixed(2)} Z`;
  })();

  const minutePriceSegments = useMemo(() => {
    if (closes.length < 2) return { up: '', dn: '' };
    const ys: number[] = [];
    for (let i = 0; i < closes.length; i += 1) {
      ys.push(mainHeight - ((closes[i] - minuteMin) / (minuteMax - minuteMin)) * mainHeight);
    }
    const up: string[] = [];
    const dn: string[] = [];
    for (let i = 0; i < ys.length - 1; i += 1) {
      const midY = (ys[i] + ys[i + 1]) / 2;
      const seg = `${minuteXs[i].toFixed(2)},${ys[i].toFixed(2)} ${minuteXs[i + 1].toFixed(2)},${ys[i + 1].toFixed(2)}`;
      (midY <= minuteBaselineY ? up : dn).push(seg);
    }
    const toPath = (pts: string[]) =>
      pts.map((p) => `M ${p}`).join(' ');
    return {
      up: toPath(up),
      dn: toPath(dn),
    };
  }, [closes, minuteXs, mainHeight, minuteMin, minuteMax, minuteBaselineY]);

  const noonBreakX = isSingleMinute ? SVG_W * 0.5 : -1;
  const minuteVolumeBarWidth = useMemo(() => {
    if (!isMinuteStyle) {
      return visibleKline.length > 0 ? SVG_W / visibleKline.length : 1;
    }
    if (minuteXs.length < 2) return 2;

    let minGap = Number.POSITIVE_INFINITY;
    for (let i = 1; i < minuteXs.length; i += 1) {
      const gap = minuteXs[i] - minuteXs[i - 1];
      if (gap > 0 && gap < minGap) {
        minGap = gap;
      }
    }

    if (!Number.isFinite(minGap)) return 2;
    return clamp(minGap * 0.78, 1.2, 6);
  }, [SVG_W, isMinuteStyle, minuteXs, visibleKline.length]);

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
  const lastMa20 = valueByIndex(ma20, last);
  const lastMa30 = valueByIndex(ma30, last);
  const lastMa60 = valueByIndex(ma60, last);

  const step = SVG_W / visibleKline.length;
  const activeIndex = hoverIndex === null ? last : clamp(hoverIndex, 0, last);
  const activeBar   = visibleKline[activeIndex];
  const prevClose = isMinuteStyle ? baseline : (activeIndex > 0 ? visibleKline[activeIndex - 1].close : activeBar.open);
  const activeChangePct = prevClose > 0 ? ((activeBar.close - prevClose) / prevClose) * 100 : Number.NaN;
  const activePointX = isMinuteStyle
    ? minuteXs[activeIndex]
    : activeIndex * step + step / 2;
  const activeX = hoverSvgX === null ? activePointX : clamp(hoverSvgX, 0, SVG_W);
  const activeCloseY = isMinuteStyle
    ? mainHeight - ((activeBar.close - minuteMin) / (minuteMax - minuteMin)) * mainHeight
    : mainHeight - ((activeBar.close - min) / priceRange) * mainHeight;

  const thumbLeft  = total > effectiveSize ? ((total - effectiveSize - clampedOffset) / (total - effectiveSize)) * (1 - effectiveSize / total) * 100 : 0;
  const thumbWidth = total > 0 ? (effectiveSize / total) * 100 : 100;

  const areaClass = [
    'chart-interactive-area',
    canPan ? 'can-pan' : '',
    isDragging ? 'is-dragging' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className="detail-chart-wrap">
      {/* ─── Indicator Toggles ─── */}
      {!isMinuteStyle ? (
        <div className="indicator-bar">
          <IndicatorToggle label="MA5" color="#e8ecf4" value={lastMa5 === null ? '-' : formatNumber(lastMa5, 2)} active={showMa5} onClick={() => setShowMa5((v) => !v)} />
          <IndicatorToggle label="MA10" color="#f4c542" value={lastMa10 === null ? '-' : formatNumber(lastMa10, 2)} active={showMa10} onClick={() => setShowMa10((v) => !v)} />
          <IndicatorToggle label="MA20" color="#00a86b" value={lastMa20 === null ? '-' : formatNumber(lastMa20, 2)} active={showMa20} onClick={() => setShowMa20((v) => !v)} />
          <IndicatorToggle label="MA30" color="#d94ee0" value={lastMa30 === null ? '-' : formatNumber(lastMa30, 2)} active={showMa30} onClick={() => setShowMa30((v) => !v)} />
          <IndicatorToggle label="MA60" color="#33cc66" value={lastMa60 === null ? '-' : formatNumber(lastMa60, 2)} active={showMa60} onClick={() => setShowMa60((v) => !v)} />
          <span className="indicator-sep" />
          <IndicatorToggle label="MACD" color="#24a5d6" active={showMacdBar} onClick={() => setShowMacdBar((v) => !v)} />
          <IndicatorToggle label="DIF" color="#f6c545" active={showDif} onClick={() => setShowDif((v) => !v)} />
          <IndicatorToggle label="DEA" color="#58cbf8" active={showDea} onClick={() => setShowDea((v) => !v)} />
        </div>
      ) : (
        <div className="indicator-bar">
          <IndicatorToggle label="分时" color={minuteColor} value={formatNumber(closes[last], 2)} active={true} onClick={() => {}} />
          <IndicatorToggle label="均价" color="#c6ad58" value={avgLineData.length > 0 ? formatNumber(avgLineData[avgLineData.length - 1], 2) : '-'} active={showAvgLine} onClick={() => setShowAvgLine((v) => !v)} />
          <IndicatorToggle label="当前价" color="#e45555" value={formatNumber(closes[last], 2)} active={true} onClick={() => {}} />
        </div>
      )}

      {/* ─── Interactive chart area ─── */}
      <div
        ref={chartAreaRef}
        className={areaClass}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onWheel={handleChartWheel}
      >
        {/* ─── K-line OHLC floating tooltip ─── */}
        {!isMinuteStyle && hoverIndex !== null ? (() => {
          const pct = activeX / SVG_W;
          const isRight = pct > 0.65;
          const tooltipTop = 2;
          const style: React.CSSProperties = {
            position: 'absolute',
            top: `${tooltipTop}px`,
            zIndex: 25,
            pointerEvents: 'none',
            ...(isRight
              ? { right: `${((1 - pct) * 100).toFixed(1)}%` }
              : { left: `calc(${(pct * 100).toFixed(1)}% + 10px)` }),
          };
          return (
            <div className="chart-tooltip" style={style}>
              <div className="chart-tooltip-row"><span className="chart-tooltip-label">日期</span><span className="chart-tooltip-value">{activeBar.date}</span></div>
              <div className="chart-tooltip-row"><span className="chart-tooltip-label">开</span><span className="chart-tooltip-value">{formatNumber(activeBar.open, 2)}</span></div>
              <div className="chart-tooltip-row"><span className="chart-tooltip-label">高</span><span className="chart-tooltip-value">{formatNumber(activeBar.high, 2)}</span></div>
              <div className="chart-tooltip-row"><span className="chart-tooltip-label">低</span><span className="chart-tooltip-value">{formatNumber(activeBar.low, 2)}</span></div>
              <div className="chart-tooltip-row"><span className="chart-tooltip-label">收</span><span className={`chart-tooltip-value ${toneClass(activeBar.close - prevClose)}`}>{formatNumber(activeBar.close, 2)}</span></div>
              <div className="chart-tooltip-row"><span className="chart-tooltip-label">涨跌</span><span className={`chart-tooltip-value ${toneClass(activeBar.close - prevClose)}`}>{formatPercent(activeChangePct)}</span></div>
              <div className="chart-tooltip-row"><span className="chart-tooltip-label">量</span><span className="chart-tooltip-value">{formatNumber(activeBar.volume / volumeUnit.divisor, 2)}{volumeUnit.unit}</span></div>
            </div>
          );
        })() : null}
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
                <line x1={x} x2={x} y1={wickTop} y2={wickBottom} className={up ? 'candle-wick-up' : 'candle-wick-down'} />
                <rect x={x - bodyW / 2} y={bodyTop} width={bodyW} height={bodyH} className={up ? 'candle-body-up' : 'candle-body-down'} />
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
              <path d={minuteFillPath} fill="url(#min-fill-up)" clipPath="url(#min-clip-up)" />
              <path d={minuteFillPath} fill="url(#min-fill-dn)" clipPath="url(#min-clip-dn)" />
              {closes.length >= 2 ? (
                <>
                  <path d={minutePriceSegments.up} fill="none" stroke={UP_COLOR} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  <path d={minutePriceSegments.dn} fill="none" stroke={DN_COLOR} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </>
              ) : (
                <path d={minutePricePath} fill="none" stroke={minuteColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              )}
              {showAvgLine && <path d={minuteAvgPath} className="minute-avg-line" fill="none" />}
              <line x1="0" x2={SVG_W} y1={minuteBaselineY.toFixed(2)} y2={minuteBaselineY.toFixed(2)} className="minute-baseline" />
              {noonBreakX > 0 ? (
                <line x1={noonBreakX.toFixed(2)} x2={noonBreakX.toFixed(2)} y1="0" y2={mainHeight} className="chart-grid-line" />
              ) : null}
              {minuteTicks.map((tick, i) => (
                <text key={`ml${i}`} x={2} y={tick.y + (i === 0 ? 10 : i === 6 ? -3 : -3)} textAnchor="start" className="axis-label">
                  {formatNumber(tick.price, 2)}
                </text>
              ))}
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

          {/* K-line price axis labels */}
          {!isMinuteStyle ? [0, 0.25, 0.5, 0.75, 1].map((r) => {
            const tickVal = max - (max - min) * r;
            return (
              <text key={`pt${r}`} x={2} y={mainHeight * r + (r === 0 ? 10 : -2)} textAnchor="start" className="axis-label">
                {formatNumber(tickVal, 2)}
              </text>
            );
          }) : null}

          {/* MA lines */}
          {!isMinuteStyle ? (
            <>
              {showMa5 && <polyline points={createLinePath(ma5,  SVG_W, mainHeight, min, max)} className="ma5-line" />}
              {showMa10 && <polyline points={createLinePath(ma10, SVG_W, mainHeight, min, max)} className="ma10-line" />}
              {showMa20 && <polyline points={createLinePath(ma20, SVG_W, mainHeight, min, max)} className="ma20-line" />}
              {showMa30 && <polyline points={createLinePath(ma30, SVG_W, mainHeight, min, max)} className="ma30-line" />}
              {showMa60 && <polyline points={createLinePath(ma60, SVG_W, mainHeight, min, max)} className="ma60-line" />}
            </>
          ) : null}

          {/* Crosshair */}
          <line x1="0" x2={SVG_W} y1={activeCloseY.toFixed(2)} y2={activeCloseY.toFixed(2)} className="crosshair-line" />
          <line x1={activeX.toFixed(2)} x2={activeX.toFixed(2)} y1="0" y2={mainHeight} className="crosshair-line" />

          {/* Minute: dot marker + time badge */}
          {isMinuteStyle ? (
            <>
              <circle
                cx={activePointX.toFixed(2)}
                cy={activeCloseY.toFixed(2)}
                r="4"
                fill="white"
                stroke={minuteColor}
                strokeWidth="2"
              />
              {hoverIndex !== null ? (() => {
                const label = activeBar.date.slice(-5);
                const bw = label.length * 6.5 + 10;
                const bx = Math.max(bw / 2 + 2, Math.min(SVG_W - bw / 2 - 2, activePointX));
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
            const w = isMinuteStyle ? minuteVolumeBarWidth : SVG_W / volumes.length;
            const x = isMinuteStyle
              ? minuteXs[i] - w / 2
              : (i / volumes.length) * SVG_W;
            const h = (vol / volumeMax) * (volumeHeight - 2);
            const y = volumeHeight - h;
            const up = closes[i] >= (i > 0 ? closes[i - 1] : closes[i]);
            return (
              <rect
                key={`${visibleKline[i].date}-v${i}`}
                x={x.toFixed(2)} y={y.toFixed(2)}
                width={w.toFixed(2)} height={h.toFixed(2)}
                className={up ? 'volume-up' : 'volume-down'}
              />
            );
          })}
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

          {isMinuteStyle && hoverIndex !== null ? (() => {
            const amountWan = activeBar.close * activeBar.volume * 100 / 10000;
            const label = `${formatNumber(amountWan, 2)}万`;
            const bw = label.length * 6.5 + 10;
            const bx = Math.max(bw / 2 + 2, Math.min(SVG_W - bw / 2 - 2, activePointX));
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
            <div className="chart-tooltip" style={style}>
              <div className="chart-tooltip-row"><span className="chart-tooltip-label">时间</span><span className="chart-tooltip-value">{activeBar.date.slice(-5)}</span></div>
              <div className="chart-tooltip-row"><span className="chart-tooltip-label">价格</span><span className={`chart-tooltip-value ${toneClass(activeBar.close - baseline)}`}>{formatNumber(activeBar.close, 2)}</span></div>
              <div className="chart-tooltip-row"><span className="chart-tooltip-label">涨跌幅</span><span className={`chart-tooltip-value ${toneClass(activeBar.close - baseline)}`}>{activeChangePct >= 0 ? '+' : ''}{activeChangePct.toFixed(2)}%</span></div>
              <div className="chart-tooltip-row"><span className="chart-tooltip-label">均价</span><span className="chart-tooltip-value">{formatNumber(avgPrice, 2)}</span></div>
              <div className="chart-tooltip-row"><span className="chart-tooltip-label">金额</span><span className="chart-tooltip-value">{formatNumber(amountWan, 2)}万</span></div>
            </div>
          );
        })() : null}

        {/* MACD chart */}
        {!isMinuteStyle && (showMacdBar || showDif || showDea) ? (
          <svg className="kline-macd" viewBox={`0 0 ${SVG_W} ${macdHeight}`}>
            <line x1="0" x2={SVG_W} y1={(macdHeight / 2).toFixed(2)} y2={(macdHeight / 2).toFixed(2)} className="chart-grid-line" />
            {showMacdBar && macdData.macd.map((item, i) => {
              if (item === null || !Number.isFinite(item)) return null;
              const x = (i / macdData.macd.length) * SVG_W;
              const zeroY = macdHeight - ((0 - macdMin) / (macdMax - macdMin)) * macdHeight;
              const y     = macdHeight - ((item - macdMin) / (macdMax - macdMin)) * macdHeight;
              const bh    = Math.abs(y - zeroY);
              return (
                <rect key={`macd-${i}`} x={x.toFixed(2)} y={Math.min(y, zeroY).toFixed(2)}
                  width={(SVG_W / macdData.macd.length).toFixed(2)} height={bh.toFixed(2)}
                  className={item >= 0 ? 'volume-up' : 'volume-down'} />
              );
            })}
            {showDif && <polyline points={createLinePath(macdData.dif, SVG_W, macdHeight, macdMin, macdMax)} className="dif-line" />}
            {showDea && <polyline points={createLinePath(macdData.dea, SVG_W, macdHeight, macdMin, macdMax)} className="dea-line" />}
            <line x1={activeX.toFixed(2)} x2={activeX.toFixed(2)} y1="0" y2={macdHeight} className="crosshair-line" />
          </svg>
        ) : null}
      </div>

      {/* Date axis */}
      <div className="kline-date-row">
        {isMinuteStyle ? (
          <>
            <span>09:30</span>
            <span>11:30/13:00</span>
            <span>15:00</span>
          </>
        ) : (
          <>
            <span>{visibleKline[0].date}</span>
            <span>{visibleKline[Math.floor(visibleKline.length / 2)].date}</span>
            <span>{visibleKline[last].date}</span>
          </>
        )}
      </div>

      {/* Time range selector */}
      {showRangeControls ? (
        <div className="chart-range-row">
          <div
            ref={rangeBarRef}
            className={`chart-range-bar${rangeBarDragRef.current ? ' dragging' : ''}`}
            onMouseMove={handleRangeMouseMove}
            onMouseUp={handleRangeMouseUp}
          >
            <div className="range-bar-track">
              <div
                className="range-bar-window"
                style={{ left: `${thumbLeft.toFixed(2)}%`, width: `${thumbWidth.toFixed(2)}%` }}
                onMouseDown={handleRangeMouseDown}
              >
                <span
                  className="range-resize-handle left"
                  onMouseDown={handleRangeLeftHandleMouseDown}
                  title="拖拽缩小/放大左边界"
                />
                <span className="range-date-label">{visibleKline[0].date.slice(0, 10)}</span>
                <span className="range-date-label">{visibleKline[last].date.slice(0, 10)}</span>
                <span
                  className="range-resize-handle right"
                  onMouseDown={handleRangeRightHandleMouseDown}
                  title="拖拽缩小/放大右边界"
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
