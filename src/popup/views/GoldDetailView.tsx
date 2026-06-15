import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, Loader2, RefreshCw } from 'lucide-react';
import KlineChart from '../components/KlineChart';

// Gold day-session only (after filtering out night session data):
// Morning: 09:00 - 11:30 (150 min) | Afternoon: 13:30 - 15:30 (120 min)
const GOLD_DAY_TOTAL = 270;

function goldDayTimeToFraction(timeStr: string): number {
  const m = timeStr.match(/(\d{1,2}):(\d{2})/);
  if (!m) return 0;
  const minutes = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);

  const MORNING_START = 9 * 60;         // 540
  const MORNING_END = 11 * 60 + 30;     // 690
  const AFTERNOON_START = 13 * 60 + 30; // 810
  const AFTERNOON_END = 15 * 60 + 30;   // 930

  if (minutes >= MORNING_START && minutes <= MORNING_END) {
    // Morning session: 09:00 - 11:30
    return (minutes - MORNING_START) / GOLD_DAY_TOTAL;
  }
  if (minutes >= AFTERNOON_START && minutes <= AFTERNOON_END) {
    // Afternoon session: 13:30 - 15:30
    return (150 + minutes - AFTERNOON_START) / GOLD_DAY_TOTAL;
  }
  return 0;
}

import { Button } from '../components/ui';
import {
  fetchGoldIntraday,
  fetchGoldKline,
  type GoldDetailKlinePoint,
  type GoldQuote,
} from '../../shared/fetch';
import type { StockDetailData, StockPeriod } from '../stockDetail';

type GoldDetailPeriod = 'minute' | 'day' | 'week' | 'month';

type Props = {
  quote: GoldQuote;
  onBack: () => void;
};

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

function toChartDetail(quote: GoldQuote, period: GoldDetailPeriod, kline: GoldDetailKlinePoint[], prevClose: number): StockDetailData {
  return {
    code: quote.symbol || quote.code,
    name: quote.label,
    price: kline.length > 0 ? kline[kline.length - 1].close : quote.price,
    change: Number.isFinite(prevClose) ? kline.length > 0 ? kline[kline.length - 1].close - prevClose : quote.price - prevClose : quote.change,
    changePct: Number.isFinite(prevClose) && prevClose > 0 ? ((kline.length > 0 ? kline[kline.length - 1].close : quote.price) - prevClose) / prevClose * 100 : quote.changePct,
    open: kline[0]?.open ?? prevClose,
    prevClose,
    high: kline.reduce((max, item) => Number.isFinite(item.high) ? Math.max(max, item.high) : max, Number.isFinite(kline[0]?.high) ? kline[0].high : prevClose),
    low: kline.reduce((min, item) => Number.isFinite(item.low) ? Math.min(min, item.low) : min, Number.isFinite(kline[0]?.low) ? kline[0].low : prevClose),
    volumeHands: 0,
    amountWanYuan: 0,
    turnoverRate: 0,
    peTtm: 0,
    totalMarketCapYi: 0,
    updatedAt: quote.updatedAt,
    period: period as StockPeriod,
    kline,
  };
}

const PERIOD_TABS: Array<{ value: GoldDetailPeriod; label: string }> = [
  { value: 'minute', label: '分时' },
  { value: 'day', label: '日K' },
  { value: 'week', label: '周K' },
  { value: 'month', label: '月K' },
];

export default function GoldDetailView({ quote, onBack }: Props) {
  const [period, setPeriod] = useState<GoldDetailPeriod>('minute');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [kline, setKline] = useState<GoldDetailKlinePoint[]>([]);
  const [prevClose, setPrevClose] = useState<number>(Number.NaN);
  const [refreshAt, setRefreshAt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        if (period === 'minute') {
          const intraday = await fetchGoldIntraday(quote.code);
          if (cancelled) return;
          setKline(intraday.kline);
          setPrevClose(intraday.prevClose);
        } else {
          const nextKline = await fetchGoldKline(quote.code, period);
          if (cancelled) return;
          setKline(nextKline);
          setPrevClose(nextKline[0]?.open ?? quote.price - quote.change);
        }
        setError('');
      } catch (err) {
        if (cancelled) return;
        setKline([]);
        setError(err instanceof Error ? err.message : '图表加载失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    const timer = window.setInterval(() => {
      void load();
    }, period === 'minute' ? 20_000 : 40_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [period, quote.code, quote.change, quote.price, refreshAt]);

  const detail = useMemo(
    () => toChartDetail(quote, period, kline, Number.isFinite(prevClose) ? prevClose : quote.price - quote.change),
    [kline, period, prevClose, quote],
  );

  return (
    <section className="stock-detail-panel">
      <header className="detail-header">
        <Button type="button" variant="secondary" size="sm" onClick={onBack}>
          <ChevronLeft size={14} />
          返回
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => setRefreshAt((value) => value + 1)} disabled={loading}>
          {loading ? <Loader2 size={13} className="spinning" /> : <RefreshCw size={13} />}
          刷新
        </Button>
      </header>

      <div className="detail-body" style={{ overflowY: 'hidden' }}>
        <div className="detail-quote-header">
          <div className="quote-title-row">
            <div className="quote-title-left">
              <strong>{quote.label}</strong>
              <span className="quote-code">{quote.symbol || quote.code}</span>
            </div>
            <div className="quote-price-block">
              <div className={`quote-price ${toneClass(detail.changePct)}`}>
                {formatNumber(detail.price, 2)}
              </div>
              <div className={`quote-change ${toneClass(detail.changePct)}`}>
                {formatPercent(detail.changePct)}
              </div>
            </div>
          </div>

          <div className="quick-stats">
            <div className="stat-cell"><span className="stat-label">涨跌额</span><b className={toneClass(quote.change)}>{formatNumber(quote.change, 2)}</b></div>
            <div className="stat-cell"><span className="stat-label">单位</span><b>{quote.unit}</b></div>
            <div className="stat-cell"><span className="stat-label">更新时间</span><b>{quote.updatedAt}</b></div>
          </div>
        </div>

        {loading && kline.length === 0 ? (
          <div className="detail-loading">图表加载中...</div>
        ) : null}

        {error && kline.length === 0 ? (
          <div className="detail-error">图表加载失败：{error}</div>
        ) : null}

        {kline.length > 0 ? <KlineChart detail={detail} timeFractionFn={goldDayTimeToFraction} breakFraction={150 / 270} axisLabels={['09:00', '11:30/13:30', '15:30']} /> : null}
      </div>

      <div className="period-tabs">
        {PERIOD_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            className={`period-tab ${period === tab.value ? 'active' : ''}`}
            onClick={() => setPeriod(tab.value)}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </section>
  );
}
