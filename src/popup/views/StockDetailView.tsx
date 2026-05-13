import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, Loader2, RefreshCw } from "lucide-react";
import {
  fetchTencentStockDetail,
  isTradingHours,
  type StockDetailData,
  type StockPeriod,
} from '../stockDetail';
import KlineChart from '../components/KlineChart';
import { calcMaxDrawdownFromKline, calcVolatilityFromKline } from "../../shared/risk-metrics";
import { fetchFundamentals, isFundamentalDataValid, type FundamentalData } from "../../shared/fundamentals";
import { getTradesForStock, type StockTradeRecord } from "../../shared/trade-history";
import TradeHistoryView from "./TradeHistoryView";

type Props = {
  code: string;
  fallbackName: string;
  onBack: () => void;
  onSelectSector?: (sectorCode: string, sectorName: string) => void;
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

type TabValue = StockPeriod | "fundamental" | "trades";

const PERIOD_TABS: Array<{ label: string; value: TabValue }> = [
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
  { label: "基本面", value: "fundamental" },
];

// ─── Main Detail Panel ───

export default function StockDetailView({ code, fallbackName, onBack, onSelectSector }: Props) {
  const [detail, setDetail] = useState<StockDetailData | null>(null);
  const [period, setPeriod] = useState<TabValue>("minute");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshAt, setRefreshAt] = useState(0);
  const [fundamentals, setFundamentals] = useState<FundamentalData | null>(null);
  const [fundamentalsLoading, setFundamentalsLoading] = useState(false);
  const [trades, setTrades] = useState<StockTradeRecord[]>([]);

  const hasTrades = trades.length > 0;

  // 加载交易记录
  useEffect(() => {
    getTradesForStock(code).then(setTrades);
  }, [code]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (period === "fundamental") {
        setFundamentalsLoading(true);
        try {
          const result = await fetchFundamentals(code);
          if (cancelled) return;
          setFundamentals(result);
          setError("");
        } catch (err) {
          if (cancelled) return;
          setError(err instanceof Error ? err.message : "基本面获取失败");
        } finally {
          if (!cancelled) setFundamentalsLoading(false);
        }
        return;
      }
      if (period === "trades") return;

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
      {/* ─── Top Bar ─── */}
      <header className="detail-header">
        <button type="button" className="detail-back-btn" onClick={onBack}>
          <ChevronLeft size={14} />
          返回
        </button>
        <button type="button" className="detail-refresh-btn" onClick={() => setRefreshAt((prev) => prev + 1)} disabled={loading || fundamentalsLoading}>
          {(loading || fundamentalsLoading) ? <Loader2 size={13} className="spinning" /> : <RefreshCw size={13} />}
          刷新
        </button>
      </header>

      {loading && !detail && period !== "fundamental" ? (
        <div className="detail-loading">详情加载中...</div>
      ) : null}

      {error && !detail && period !== "fundamental" && period !== "trades" ? (
        <div className="detail-error">详情获取失败：{error}</div>
      ) : null}

      {period === "fundamental" ? (
        <div className="detail-body">
          <FundamentalPanel data={fundamentals} loading={fundamentalsLoading} code={code} fallbackName={fallbackName} />
          {/* ─── Period Tabs ─── */}
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

      {period === "trades" ? (
        <div className="detail-body">
          <TradeHistoryView code={code} name={detail?.name || fallbackName}
            onBack={() => setPeriod("minute")}
            onUpdate={() => getTradesForStock(code).then(setTrades)} />
        </div>
      ) : null}

      {detail && period !== "fundamental" && period !== "trades" ? (
        <div className="detail-body">
          {/* ─── Quote Header ─── */}
          <div className="detail-quote-header">
            <div className="quote-title-row">
              <div className="quote-title-left">
                <strong>{detail.name}</strong>
                <span className="quote-code">{detail.code}</span>
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

            {/* ─── Quick Stats Strip ─── */}
            <div className="quick-stats">
              <div className="stat-cell"><span className="stat-label">今开</span><b className={toneClass(detail.open - detail.prevClose)}>{formatNumber(detail.open, 2)}</b></div>
              <div className="stat-cell"><span className="stat-label">昨收</span><b>{formatNumber(detail.prevClose, 2)}</b></div>
              <div className="stat-cell"><span className="stat-label">最高</span><b className={toneClass(detail.high - detail.prevClose)}>{formatNumber(detail.high, 2)}</b></div>
              <div className="stat-cell"><span className="stat-label">最低</span><b className={toneClass(detail.low - detail.prevClose)}>{formatNumber(detail.low, 2)}</b></div>
              <div className="stat-cell"><span className="stat-label">成交量</span><b>{formatNumber(detail.volumeHands / 10000, 2)}万手</b></div>
              <div className="stat-cell"><span className="stat-label">成交额</span><b>{formatNumber(detail.amountWanYuan / 10000, 2)}亿</b></div>
              <div className="stat-cell"><span className="stat-label">换手</span><b>{formatPercent(detail.turnoverRate)}</b></div>
              <div className="stat-cell"><span className="stat-label">市盈率</span><b>{formatNumber(detail.peTtm, 2)}</b></div>
              <div className="stat-cell"><span className="stat-label">总市值</span><b>{formatNumber(detail.totalMarketCapYi, 2)}亿</b></div>
            </div>

            {/* ─── Risk Metrics Strip ─── */}
            {detail.period === "day" && detail.kline.length >= 10 ? (
              <RiskMetrics kline={detail.kline} />
            ) : null}
          </div>

          {/* ─── Chart ─── */}
          <KlineChart detail={detail} />

          {/* ─── Period Tabs ─── */}
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
            {hasTrades && (
              <button type="button"
                className={`period-tab ${period === ("trades" as TabValue) ? "active" : ""}`}
                onClick={() => setPeriod("trades")}
              >交易</button>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}

/* ─── Fundamental Panel ─── */
type FundamentalCategory = { label: string; items: Array<{ label: string; key: keyof FundamentalData; suffix?: string }> };

const FUNDAMENTAL_CATEGORIES: FundamentalCategory[] = [
  {
    label: "估值",
    items: [
      { label: "市盈率 (PE-TTM)", key: "peTtm", suffix: "" },
      { label: "市净率 (PB)", key: "pb", suffix: "" },
      { label: "总市值", key: "totalMarketCapYi", suffix: "亿" },
      { label: "流通市值", key: "circulatingMarketCapYi", suffix: "亿" },
    ],
  },
  {
    label: "盈利能力",
    items: [
      { label: "ROE", key: "roe", suffix: "%" },
      { label: "每股收益 (EPS)", key: "eps", suffix: "" },
      { label: "每股净资产", key: "bvps", suffix: "" },
      { label: "毛利率", key: "grossMargin", suffix: "%" },
    ],
  },
  {
    label: "成长能力",
    items: [
      { label: "营收增长率", key: "revenueGrowth", suffix: "%" },
      { label: "净利润增长率", key: "profitGrowth", suffix: "%" },
    ],
  },
  {
    label: "分红",
    items: [
      { label: "股息率", key: "dividendYield", suffix: "%" },
    ],
  },
];

function FundamentalPanel({ data, loading, code, fallbackName }: { data: FundamentalData | null; loading: boolean; code: string; fallbackName: string }) {
  if (loading) {
    return <div className="detail-loading">基本面加载中...</div>;
  }

  if (!data) {
    return <div className="detail-empty">暂无基本面数据</div>;
  }

  if (!isFundamentalDataValid(data)) {
    return <div className="detail-empty">暂无基本面数据</div>;
  }

  return (
    <div className="fundamental-panel">
      <div className="fundamental-title">
        {fallbackName}({code}) 基本面指标
      </div>
      {FUNDAMENTAL_CATEGORIES.map((cat) => (
        <div key={cat.label} className="fundamental-category">
          <div className="fundamental-category-label">{cat.label}</div>
          <div className="fundamental-grid">
            {cat.items.map((item) => {
              const val = data[item.key];
              const formatted = Number.isFinite(val) ? `${(val as number).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${item.suffix}` : "-";
              return (
                <div key={item.key} className="fundamental-cell">
                  <span className="fundamental-cell-label">{item.label}</span>
                  <span className="fundamental-cell-value">{formatted}</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Risk Metrics Sub-component ─── */
function RiskMetrics({ kline }: { kline: Array<{ date: string; close: number }> }) {
  const drawdown = useMemo(() => calcMaxDrawdownFromKline(kline), [kline]);
  const volatility = useMemo(() => calcVolatilityFromKline(kline), [kline]);

  return (
    <div className="risk-metrics-strip">
      {drawdown ? (
        <div className="risk-metric-cell">
          <span className="risk-metric-label">最大回撤</span>
          <span className="risk-metric-value" style={{ color: '#ef4444' }}>
            {formatNumber(drawdown.maxDrawdown * 100, 1)}%
          </span>
          <span className="risk-metric-sub">{drawdown.peakDate} → {drawdown.troughDate}</span>
        </div>
      ) : null}
      {volatility ? (
        <div className="risk-metric-cell">
          <span className="risk-metric-label">年化波动率</span>
          <span className="risk-metric-value">{formatNumber(volatility.annualizedVolatility * 100, 1)}%</span>
        </div>
      ) : null}
      {!drawdown && !volatility ? (
        <span className="risk-metric-label">数据不足，无法计算风险指标</span>
      ) : null}
    </div>
  );
}
