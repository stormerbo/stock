import { useEffect, useMemo, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { isTradingHours } from './stockDetail';

type Props = {
  code: string;
  fallbackLabel: string;
  onClose: () => void;
};

type IndexMinutePoint = {
  time: string;
  price: number;
  cumulativeVolume: number;
  volume: number;
};

type IndexMinuteDetail = {
  code: string;
  name: string;
  price: number;
  change: number;
  changePct: number;
  prevClose: number;
  updatedAt: string;
  points: IndexMinutePoint[];
};

const TRADING_MINUTES = 240;
const MORNING_START = 9 * 60 + 30;
const MORNING_END = 11 * 60 + 30;
const AFTERNOON_START = 13 * 60;
const AFTERNOON_END = 15 * 60;

function toNumber(value: unknown): number {
  const n = Number(value);
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

function formatQuoteTime(raw: string): string {
  if (!/^\d{14}$/.test(raw)) return '-';
  return `${raw.slice(8, 10)}:${raw.slice(10, 12)}:${raw.slice(12, 14)}`;
}

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

function formatVolume(volume: number): string {
  if (!Number.isFinite(volume)) return '-';
  if (volume >= 100000000) return `${formatNumber(volume / 100000000, 2)}亿`;
  if (volume >= 10000) return `${formatNumber(volume / 10000, 2)}万`;
  return formatNumber(volume, 0);
}

async function fetchIndexMinuteDetail(code: string, fallbackLabel: string): Promise<IndexMinuteDetail> {
  const response = await fetch(`https://web.ifzq.gtimg.cn/appstock/app/minute/query?code=${code}`);
  const json = await response.json() as {
    data?: Record<string, {
      data?: { data?: string[] };
      qt?: Record<string, string[]>;
    }>;
  };

  const payload = json.data?.[code];
  const quote = payload?.qt?.[code];
  if (!payload || !quote) {
    throw new Error('指数分时数据缺失');
  }

  let previousCumulative = 0;
  const points: IndexMinutePoint[] = (payload.data?.data ?? [])
    .map((line) => {
      const parts = String(line).split(' ');
      if (parts.length < 3) return null;
      const rawTime = parts[0];
      const time = /^\d{4}$/.test(rawTime)
        ? `${rawTime.slice(0, 2)}:${rawTime.slice(2, 4)}`
        : rawTime;
      const price = toNumber(parts[1]);
      const cumulativeVolume = toNumber(parts[2]);
      if (!Number.isFinite(price) || !Number.isFinite(cumulativeVolume)) return null;

      const volume = Math.max(0, cumulativeVolume - previousCumulative);
      previousCumulative = cumulativeVolume;

      return {
        time,
        price,
        cumulativeVolume,
        volume,
      };
    })
    .filter((item): item is IndexMinutePoint => item !== null);

  return {
    code,
    name: quote[1] || fallbackLabel || code,
    price: toNumber(quote[3]),
    change: toNumber(quote[31]),
    changePct: toNumber(quote[32]),
    prevClose: toNumber(quote[4]),
    updatedAt: formatQuoteTime(quote[30] || ''),
    points,
  };
}

export default function IndexDetailModal({ code, fallbackLabel, onClose }: Props) {
  const [detail, setDetail] = useState<IndexMinuteDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const next = await fetchIndexMinuteDetail(code, fallbackLabel);
        if (cancelled) return;
        setDetail(next);
        setError('');
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : '指数分时获取失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    const timer = window.setInterval(() => {
      if (isTradingHours()) void load();
    }, 20_000);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [code, fallbackLabel, onClose]);

  const chartModel = useMemo(() => {
    if (!detail || detail.points.length === 0 || !Number.isFinite(detail.prevClose)) return null;

    const points = detail.points
      .map((item) => {
        const minuteIndex = getMinuteIndex(item.time);
        if (minuteIndex === null) return null;
        return { ...item, minuteIndex };
      })
      .filter((item): item is IndexMinutePoint & { minuteIndex: number } => item !== null);

    if (points.length === 0) return null;

    const prices = points.map((item) => item.price);
    const highest = Math.max(...prices, detail.prevClose);
    const lowest = Math.min(...prices, detail.prevClose);
    const diff = Math.max(highest - detail.prevClose, detail.prevClose - lowest, 0.01);
    const minPrice = detail.prevClose - diff * 1.08;
    const maxPrice = detail.prevClose + diff * 1.08;
    const priceRange = Math.max(0.0001, maxPrice - minPrice);
    const maxVolume = Math.max(...points.map((item) => item.volume), 1);

    return {
      points,
      minPrice,
      maxPrice,
      priceRange,
      maxVolume,
    };
  }, [detail]);

  const activeIndex = detail && chartModel
    ? (hoverIndex === null ? null : Math.max(0, Math.min(hoverIndex, chartModel.points.length - 1)))
    : null;

  const activePoint = activeIndex !== null && chartModel ? chartModel.points[activeIndex] : null;
  const activePct = activePoint && detail && Number.isFinite(detail.prevClose)
    ? ((activePoint.price - detail.prevClose) / detail.prevClose) * 100
    : Number.NaN;

  const mainWidth = 620;
  const mainHeight = 240;
  const volumeHeight = 92;
  const shellPaddingLeft = 68;
  const shellPaddingTop = 14;
  const tooltipWidth = 184;
  const tooltipHeight = 112;
  const tooltipGap = 14;

  const toX = (minuteIndex: number) => (minuteIndex / (TRADING_MINUTES - 1)) * mainWidth;
  const toY = (price: number) => {
    if (!chartModel) return 0;
    return mainHeight - ((price - chartModel.minPrice) / chartModel.priceRange) * mainHeight;
  };

  const linePoints = chartModel
    ? chartModel.points.map((item) => `${toX(item.minuteIndex).toFixed(2)},${toY(item.price).toFixed(2)}`).join(' ')
    : '';

  const tooltipLayout = activePoint
    ? (() => {
        const anchorX = shellPaddingLeft + toX(activePoint.minuteIndex);
        const anchorY = shellPaddingTop + toY(activePoint.price);
        const preferLeft = anchorX > mainWidth * 0.62;
        const left = preferLeft
          ? Math.max(12, anchorX - tooltipWidth - tooltipGap)
          : Math.min(shellPaddingLeft + mainWidth - tooltipWidth - 8, anchorX + tooltipGap);

        const preferLower = anchorY < shellPaddingTop + mainHeight * 0.28;
        const top = preferLower
          ? Math.min(shellPaddingTop + mainHeight - tooltipHeight - 10, anchorY + 10)
          : Math.max(12, anchorY - tooltipHeight / 2);

        return {
          left,
          top,
          side: preferLeft ? 'left' : 'right',
        } as const;
      })()
    : null;

  return (
    <div className="index-modal-overlay" onClick={onClose}>
      <section className="index-modal-panel" onClick={(event) => event.stopPropagation()}>
        <header className="index-modal-header">
          <div className="index-modal-title">
            <strong>{detail?.name || fallbackLabel}</strong>
            <span>{code}</span>
          </div>
          <button type="button" className="index-modal-close" onClick={onClose} aria-label="关闭指数详情">
            <X size={14} />
          </button>
        </header>

        {loading && !detail ? <div className="index-modal-state">指数分时加载中...</div> : null}
        {error && !detail ? <div className="index-modal-state">加载失败：{error}</div> : null}

        {detail && chartModel ? (
          <div className="index-modal-body">
            <div className="index-modal-summary">
              <strong className={toneClass(detail.changePct)}>{formatNumber(detail.price, 2)}</strong>
              <span className={toneClass(detail.change)}>{formatNumber(detail.change, 2)}</span>
              <span className={toneClass(detail.changePct)}>{formatPercent(detail.changePct)}</span>
              <span>{detail.updatedAt}</span>
            </div>

            <div className="index-chart-shell">
              <svg
                className="index-main-chart"
                viewBox={`0 0 ${mainWidth} ${mainHeight}`}
                onMouseMove={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  if (rect.width <= 0 || !chartModel) return;
                  const relativeX = Math.max(0, Math.min((event.clientX - rect.left) / rect.width, 0.999999));
                  const targetMinute = Math.round(relativeX * (TRADING_MINUTES - 1));
                  let nearestIndex = 0;
                  let nearestDistance = Number.POSITIVE_INFINITY;
                  chartModel.points.forEach((item, index) => {
                    const distance = Math.abs(item.minuteIndex - targetMinute);
                    if (distance < nearestDistance) {
                      nearestDistance = distance;
                      nearestIndex = index;
                    }
                  });
                  setHoverIndex(nearestIndex);
                }}
                onMouseLeave={() => setHoverIndex(null)}
              >
                {[0, 0.2, 0.4, 0.6, 0.8, 1].map((ratio) => (
                  <line
                    key={`h-${ratio}`}
                    x1="0"
                    x2={mainWidth}
                    y1={(mainHeight * ratio).toFixed(2)}
                    y2={(mainHeight * ratio).toFixed(2)}
                    className="index-grid-line"
                  />
                ))}
                {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
                  <line
                    key={`v-${ratio}`}
                    x1={(mainWidth * ratio).toFixed(2)}
                    x2={(mainWidth * ratio).toFixed(2)}
                    y1="0"
                    y2={mainHeight}
                    className="index-grid-line"
                  />
                ))}

                <polyline points={linePoints} className="index-minute-line" />
                <line
                  x1="0"
                  x2={mainWidth}
                  y1={toY(detail.prevClose).toFixed(2)}
                  y2={toY(detail.prevClose).toFixed(2)}
                  className="index-baseline"
                />

                {[0, 0.2, 0.4, 0.6, 0.8, 1].map((ratio) => {
                  const priceTick = chartModel.maxPrice - (chartModel.maxPrice - chartModel.minPrice) * ratio;
                  const pct = detail.prevClose > 0 ? ((priceTick - detail.prevClose) / detail.prevClose) * 100 : Number.NaN;
                  const y = mainHeight * ratio;
                  return (
                    <g key={`tick-${ratio}`}>
                      <text x="-12" y={(y + 5).toFixed(2)} textAnchor="end" className={`index-axis-label ${toneClass(priceTick - detail.prevClose)}`}>
                        {formatNumber(priceTick, 2)}
                      </text>
                      <text x={(mainWidth + 12).toFixed(2)} y={(y + 5).toFixed(2)} textAnchor="start" className={`index-axis-label ${toneClass(pct)}`}>
                        {formatPercent(pct)}
                      </text>
                    </g>
                  );
                })}

                {activePoint ? (
                  <>
                    <line
                      x1={toX(activePoint.minuteIndex).toFixed(2)}
                      x2={toX(activePoint.minuteIndex).toFixed(2)}
                      y1="0"
                      y2={mainHeight}
                      className="index-crosshair-line"
                    />
                    <line
                      x1="0"
                      x2={mainWidth}
                      y1={toY(activePoint.price).toFixed(2)}
                      y2={toY(activePoint.price).toFixed(2)}
                      className="index-crosshair-line"
                    />
                    <circle
                      cx={toX(activePoint.minuteIndex).toFixed(2)}
                      cy={toY(activePoint.price).toFixed(2)}
                      r="3"
                      className="index-active-dot"
                    />
                  </>
                ) : null}
              </svg>

              <svg className="index-volume-chart" viewBox={`0 0 ${mainWidth} ${volumeHeight}`}>
                {[0, 0.5, 1].map((ratio) => (
                  <line
                    key={`vol-${ratio}`}
                    x1="0"
                    x2={mainWidth}
                    y1={(volumeHeight * ratio).toFixed(2)}
                    y2={(volumeHeight * ratio).toFixed(2)}
                    className="index-grid-line"
                  />
                ))}
                {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
                  <line
                    key={`vol-v-${ratio}`}
                    x1={(mainWidth * ratio).toFixed(2)}
                    x2={(mainWidth * ratio).toFixed(2)}
                    y1="0"
                    y2={volumeHeight}
                    className="index-grid-line"
                  />
                ))}
                {chartModel.points.map((item, index) => {
                  const prevPrice = index > 0 ? chartModel.points[index - 1].price : detail.prevClose;
                  const x = toX(item.minuteIndex);
                  const barWidth = Math.max(1.4, mainWidth / TRADING_MINUTES * 0.78);
                  const barHeight = (item.volume / chartModel.maxVolume) * (volumeHeight - 2);
                  const y = volumeHeight - barHeight;
                  return (
                    <rect
                      key={`${item.time}-${item.minuteIndex}`}
                      x={(x - barWidth / 2).toFixed(2)}
                      y={y.toFixed(2)}
                      width={barWidth.toFixed(2)}
                      height={barHeight.toFixed(2)}
                      className={item.price >= prevPrice ? 'index-volume-up' : 'index-volume-down'}
                    />
                  );
                })}
                {activePoint ? (
                  <line
                    x1={toX(activePoint.minuteIndex).toFixed(2)}
                    x2={toX(activePoint.minuteIndex).toFixed(2)}
                    y1="0"
                    y2={volumeHeight}
                    className="index-crosshair-line"
                  />
                ) : null}
              </svg>

              <div className="index-time-row">
                <span>09:30</span>
                <span>10:30</span>
                <span>11:30/13:00</span>
                <span>14:00</span>
                <span>15:00</span>
              </div>

              {activePoint ? (
                <div
                  className={`index-tooltip ${tooltipLayout?.side === 'left' ? 'tooltip-left' : 'tooltip-right'}`}
                  style={{
                    left: `${tooltipLayout?.left ?? 12}px`,
                    top: `${tooltipLayout?.top ?? 12}px`,
                  }}
                >
                  <div>时间：{activePoint.time}</div>
                  <div>价格：{formatNumber(activePoint.price, 2)}</div>
                  <div>涨幅：{formatPercent(activePct)}</div>
                  <div>成交量：{formatVolume(activePoint.cumulativeVolume)}</div>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
