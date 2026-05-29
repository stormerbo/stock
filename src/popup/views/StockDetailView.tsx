import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, Loader2, RefreshCw } from "lucide-react";
import {
  fetchTencentStockDetail,
  isTradingHours,
  type StockDetailData,
} from '../stockDetail';
import KlineChart from '../components/KlineChart';
import { fetchFundamentals, isFundamentalDataValid, type FundamentalData } from "../../shared/fundamentals";
import { TRADE_HISTORY_KEY, getTradesForStock, type StockTradeRecord } from "../../shared/trade-history";
import { fetchDayFqKline, detectAllSignals, type TechnicalSignal } from "../../shared/technical-analysis";
import TradeHistoryView from "./TradeHistoryView";
import AssessmentSummaryBlock from "../components/AssessmentSummaryBlock";
import { loadCachedStockAssessments, sanitizeStockAssessmentCache } from "../../shared/stock-assessment-cache.ts";
import type { StockAssessment } from "../../shared/stock-assessment.ts";
import { getStockLimitPct } from '../../shared/stock-limit';
import { getQuickStatsCollapsedSummary, getQuickStatsToggleState } from './stock-detail-panels';
import { getStockDetailTabs, type StockDetailTabValue } from './stock-detail-tabs';

type Props = {
  code: string;
  fallbackName: string;
  onBack: () => void;
  onStockTradesChanged?: (code: string) => void;
  onOpenAssessment?: (code: string) => void;
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

type TabValue = StockDetailTabValue;

// ─── Main Detail Panel ───

export default function StockDetailView({ code, fallbackName, onBack, onStockTradesChanged, onOpenAssessment, onSelectSector }: Props) {
  const [detail, setDetail] = useState<StockDetailData | null>(null);
  const [period, setPeriod] = useState<TabValue>("minute");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshAt, setRefreshAt] = useState(0);
  const [fundamentals, setFundamentals] = useState<FundamentalData | null>(null);
  const [fundamentalsLoading, setFundamentalsLoading] = useState(false);
  const [trades, setTrades] = useState<StockTradeRecord[]>([]);
  const [analysisSignals, setAnalysisSignals] = useState<TechnicalSignal[]>([]);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [assessment, setAssessment] = useState<StockAssessment | null>(null);
  const [quickStatsExpanded, setQuickStatsExpanded] = useState(false);

  const quickStatsSummary = getQuickStatsCollapsedSummary();
  const periodTabs = getStockDetailTabs(trades.length);

  useEffect(() => {
    loadCachedStockAssessments().then((items) => {
      setAssessment(items.find((item) => item.code === code) ?? null);
    });
  }, [code]);

  useEffect(() => {
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'local' || !changes.stockAssessments) return;
      const next = sanitizeStockAssessmentCache(changes.stockAssessments.newValue);
      setAssessment(next.find((item) => item.code === code) ?? null);
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, [code]);

  const loadTrades = useCallback(async () => {
    const records = await getTradesForStock(code);
    setTrades(records);
    onStockTradesChanged?.(code);
  }, [code, onStockTradesChanged]);

  // 加载交易记录
  useEffect(() => {
    void loadTrades();
  }, [loadTrades]);

  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.storage?.onChanged) return;
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'sync' || !changes[TRADE_HISTORY_KEY]) return;
      void loadTrades();
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, [loadTrades]);

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
      if (period === "analysis") {
        setAnalysisLoading(true);
        setAnalysisError("");
        try {
          const kline = await fetchDayFqKline(code, 120);
          if (cancelled) return;
          const signals = detectAllSignals(kline);
          setAnalysisSignals(signals);
        } catch (err) {
          if (cancelled) return;
          setAnalysisError(err instanceof Error ? err.message : "分析失败");
          setAnalysisSignals([]);
        } finally {
          if (!cancelled) setAnalysisLoading(false);
        }
        return;
      }

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

  const isTextContent = period === "fundamental" || period === "trades" || period === "analysis";
  const isKlineActive = detail && period !== "fundamental" && period !== "trades" && period !== "analysis";

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

      {/* ─── Content Body (scrollable for text tabs, flex for K-line) ─── */}
      <div className="detail-body" style={{ overflowY: isTextContent ? 'auto' : 'hidden' }}>
        {loading && !detail && period !== "fundamental" ? (
          <div className="detail-loading">详情加载中...</div>
        ) : null}

        {error && !detail && period !== "fundamental" && period !== "trades" && period !== "analysis" ? (
          <div className="detail-error">详情获取失败：{error}</div>
        ) : null}

        {period === "fundamental" ? (
          <FundamentalPanel data={fundamentals} loading={fundamentalsLoading} code={code} fallbackName={fallbackName} />
        ) : null}

        {period === "trades" ? (
          <>
            <div className="detail-quote-header">
              <div className="quote-title-row">
                <div className="quote-title-left">
                  <strong>{detail?.name || fallbackName}</strong>
                  <span className="quote-code">{code}</span>
                </div>
              </div>
            </div>
            <TradeHistoryView code={code} name={detail?.name || fallbackName}
              embedded
              onUpdate={loadTrades} />
          </>
        ) : null}

        {period === "analysis" ? (
          <>
            <div className="detail-quote-header">
              <div className="quote-title-row">
                <div className="quote-title-left">
                  <strong>{detail?.name || fallbackName}</strong>
                  <span className="quote-code">{code}</span>
                </div>
              </div>
            </div>
            <TechnicalAnalysisPanel signals={analysisSignals} loading={analysisLoading} error={analysisError} />
          </>
        ) : null}

        {isKlineActive ? (
          <>
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
              <div className="quick-stats-shell">
                <div className="quick-stats-summary">
                  {quickStatsSummary.map(({ key, label }) => {
                    const value = key === 'open' ? detail.open : key === 'high' ? detail.high : detail.low;
                    const toneValue = key === 'open' || key === 'high' || key === 'low'
                      ? value - detail.prevClose
                      : Number.NaN;

                    return (
                      <div key={key} className="summary-cell">
                        <span className="summary-label">{label}</span>
                        <b className={toneClass(toneValue)}>{formatNumber(value, 2)}</b>
                      </div>
                    );
                  })}
                </div>
                <button
                  type="button"
                  className="quick-stats-toggle"
                  onClick={() => setQuickStatsExpanded((prev) => !prev)}
                  aria-expanded={quickStatsExpanded}
                  aria-label={getQuickStatsToggleState(quickStatsExpanded).ariaLabel}
                >
                  <span className="quick-stats-toggle-icon">{quickStatsExpanded ? '▾' : '▸'}</span>
                  <span>{getQuickStatsToggleState(quickStatsExpanded).label}</span>
                </button>

                {quickStatsExpanded ? (() => {
                  const limitPct = getStockLimitPct(detail.code, detail.name);
                  const limitUp = Math.round(detail.prevClose * (1 + limitPct) * 100) / 100;
                  const limitDown = Math.round(detail.prevClose * (1 - limitPct) * 100) / 100;
                  return (
                    <div className="quick-stats">
                      <div className="stat-cell"><span className="stat-label">昨收</span><b>{formatNumber(detail.prevClose, 2)}</b></div>
                      <div className="stat-cell"><span className="stat-label">涨停价</span><b className="up">{formatNumber(limitUp, 2)}</b></div>
                      <div className="stat-cell"><span className="stat-label">跌停价</span><b className="down">{formatNumber(limitDown, 2)}</b></div>
                      <div className="stat-cell"><span className="stat-label">成交量</span><b>{formatNumber(detail.volumeHands / 10000, 2)}万手</b></div>
                      <div className="stat-cell"><span className="stat-label">成交额</span><b>{formatNumber(detail.amountWanYuan / 10000, 2)}亿</b></div>
                      <div className="stat-cell"><span className="stat-label">换手</span><b>{formatPercent(detail.turnoverRate)}</b></div>
                      <div className="stat-cell"><span className="stat-label">市盈率</span><b>{formatNumber(detail.peTtm, 2)}</b></div>
                      <div className="stat-cell"><span className="stat-label">总市值</span><b>{formatNumber(detail.totalMarketCapYi, 2)}亿</b></div>
                    </div>
                  );
                })() : null}
              </div>

              <AssessmentSummaryBlock
                assessment={assessment}
                onOpenAssessment={onOpenAssessment}
              />
            </div>

            {/* ─── Chart ─── */}
            <KlineChart detail={detail} />
          </>
        ) : null}
      </div>

      {/* ─── Fixed Bottom Tabs ─── */}
      <div className="period-tabs">
        {periodTabs.map((tab) => (
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

/* ─── Technical Analysis Panel ─── */
function TechnicalAnalysisPanel({ signals, loading, error }: { signals: TechnicalSignal[]; loading: boolean; error: string }) {
  if (loading) {
    return <div className="detail-loading">技术分析中...</div>;
  }

  if (error) {
    return <div className="detail-error">{error}</div>;
  }

  if (signals.length === 0) {
    return (
      <div className="detail-empty" style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-2)' }}>
        <div style={{ fontSize: 13, marginBottom: 4 }}>未检测到技术信号</div>
        <div style={{ fontSize: 11 }}>K 线数据不足（需至少 30 个交易日）或无显著信号</div>
      </div>
    );
  }

  const positive = signals.filter((s) => s.severity === 'positive');
  const negative = signals.filter((s) => s.severity === 'negative');
  const info = signals.filter((s) => s.severity === 'info');

  return (
    <div className="analysis-panel">
      {positive.length > 0 && (
        <div className="analysis-group">
          <div className="analysis-group-label positive">看多信号</div>
          {positive.map((s, i) => (
            <div key={i} className="analysis-signal positive">
              <span className="analysis-signal-label">{s.label}</span>
              <span className="analysis-signal-desc">{s.guidance}</span>
            </div>
          ))}
        </div>
      )}
      {negative.length > 0 && (
        <div className="analysis-group">
          <div className="analysis-group-label negative">看空信号</div>
          {negative.map((s, i) => (
            <div key={i} className="analysis-signal negative">
              <span className="analysis-signal-label">{s.label}</span>
              <span className="analysis-signal-desc">{s.guidance}</span>
            </div>
          ))}
        </div>
      )}
      {info.length > 0 && (
        <div className="analysis-group">
          <div className="analysis-group-label info">其他</div>
          {info.map((s, i) => (
            <div key={i} className="analysis-signal info">
              <span className="analysis-signal-label">{s.label}</span>
              <span className="analysis-signal-desc">{s.guidance}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
