import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, Loader2, RefreshCw } from 'lucide-react';
import { type FundPosition, type FundHoldingConfig } from '../shared/fetch';

// Proxy fetch through background to avoid CORS
async function proxyFetchText(url: string): Promise<string> {
  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    const result = await chrome.runtime.sendMessage<{ type: 'fetch-text'; url: string }, { ok: boolean; status: number; text?: string; error?: string }>({
      type: 'fetch-text',
      url,
    });
    if (result?.ok && typeof result.text === 'string') return result.text;
    throw new Error(result?.error || `request failed: ${result?.status ?? 0}`);
  }
  const response = await fetch(url);
  return response.text();
}

type Props = {
  code: string;
  fundPosition?: FundPosition;
  fundHolding?: FundHoldingConfig;
  onBack: () => void;
};

// -----------------------------------------------------------
// Types
// -----------------------------------------------------------

type FundDetailInfo = {
  name: string;
  code: string;
  type: string;
  manager: string;
  establishmentDate: string;
  latestNav: number;
  accumulatedNav: number;
  navDate: string;
  totalAssets: string;
};

type FundNavHistory = {
  date: string;
  nav: number;
  accumulatedNav: number;
  dailyReturn: number;
}[];

type FundHoldingStock = {
  code: string;
  name: string;
  weight: number;
};

type FundDetailData = {
  info: FundDetailInfo;
  navHistory: FundNavHistory;
  topHoldings: FundHoldingStock[];
  estimatedNav: number;
  estimatedChange: number;
  estimatedChangePct: number;
  syl1y: number;
  syl3y: number;
  syl6y: number;
  syl1n: number;
};

// -----------------------------------------------------------
// Utilities
// -----------------------------------------------------------

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

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : Number.NaN;
}

// Extract a simple JS variable assignment (string or number) from pingzhongdata
function extractJSString(text: string, varName: string): string {
  const regex = new RegExp(`var\\s+${varName}\\s*=\\s*["']([^"']*)["']`, 'm');
  const match = text.match(regex);
  return match ? match[1] : '';
}

// Extract a simple JS variable assignment (number stored as string or raw number) from pingzhongdata
function extractJSNumber(text: string, varName: string): number {
  // Match both quoted and unquoted numbers: var x = "12.34"; or var x = 12.34;
  const regex = new RegExp(`var\\s+${varName}\\s*=\\s*["']?(-?[\\d.]+)["']?`, 'm');
  const match = text.match(regex);
  return match ? toNumber(match[1]) : Number.NaN;
}

function extractJSArray(text: string, varName: string): unknown[] | undefined {
  const regex = new RegExp(`var\\s+${varName}\\s*=\\s*(\\[[\\s\\S]*?\\]);`, 'm');
  const match = text.match(regex);
  if (!match) return undefined;
  try {
    return JSON.parse(match[1]);
  } catch {
    return undefined;
  }
}

// -----------------------------------------------------------
// API fetch
// -----------------------------------------------------------

async function fetchFundDetail(code: string, holding?: FundHoldingConfig): Promise<FundDetailData> {
  const [pingzhongRes, gzRes] = await Promise.allSettled([
    proxyFetchText(`https://fund.eastmoney.com/pingzhongdata/${code}.js`),
    proxyFetchText(`https://fundgz.1234567.com.cn/js/${code}.js?rt=${Date.now()}`),
  ]);

  // Parse gz data for real-time estimate
  let estimatedNav = Number.NaN;
  let estimatedChange = Number.NaN;
  let estimatedChangePct = Number.NaN;

  if (gzRes.status === 'fulfilled') {
    const gzMatch = gzRes.value.match(/jsonpgz\((.*)\);?/);
    if (gzMatch) {
      try {
        const gzData = JSON.parse(gzMatch[1]);
        estimatedNav = toNumber(gzData.gsz);
        estimatedChangePct = toNumber(gzData.gszzl);
        if (Number.isFinite(estimatedChangePct) && estimatedChangePct !== 0) {
          const dwjz = toNumber(gzData.dwjz);
          if (Number.isFinite(dwjz) && dwjz > 0) {
            estimatedChange = (estimatedChangePct / 100) * dwjz;
          }
        }
      } catch { /* ignore */ }
    }
  }

  // Parse pingzhongdata
  let info: FundDetailInfo = {
    name: holding?.name || code,
    code,
    type: '-',
    manager: '-',
    establishmentDate: '-',
    latestNav: Number.NaN,
    accumulatedNav: Number.NaN,
    navDate: '-',
    totalAssets: '-',
  };

  let navHistory: FundNavHistory = [];
  let topHoldings: FundHoldingStock[] = [];
  let syl1y = Number.NaN;
  let syl3y = Number.NaN;
  let syl6y = Number.NaN;
  let syl1n = Number.NaN;

  if (pingzhongRes.status === 'fulfilled') {
    const text = pingzhongRes.value;

    // Basic string info
    const name = extractJSString(text, 'fS_name');
    const type = extractJSString(text, 'fS_type');
    const establishmentDate = extractJSString(text, 'Data_establishDate');

    info = {
      name: name || info.name,
      code,
      type: type || '-',
      manager: '-',
      establishmentDate: establishmentDate || '-',
      latestNav: Number.NaN,
      accumulatedNav: Number.NaN,
      navDate: '-',
      totalAssets: '-',
    };

    // Performance rates
    syl1y = extractJSNumber(text, 'syl_1y');
    syl3y = extractJSNumber(text, 'syl_3y');
    syl6y = extractJSNumber(text, 'syl_6y');
    syl1n = extractJSNumber(text, 'syl_1n');

    // NAV history
    const netWorthTrend = extractJSArray(text, 'Data_netWorthTrend') as Array<{
      x: number;
      y: number;
      unitMoney?: number;
    }> | undefined;

    if (netWorthTrend && Array.isArray(netWorthTrend) && netWorthTrend.length > 0) {
      const lastItem = netWorthTrend[netWorthTrend.length - 1];
      if (lastItem) {
        info.latestNav = toNumber(lastItem.y);
        info.accumulatedNav = toNumber(lastItem.unitMoney ?? lastItem.y);
        const dateObj = new Date(lastItem.x);
        info.navDate = dateObj.toISOString().slice(0, 10);
      }

      // Take last 3 years of data for chart (covers all ranges up to 3y)
      navHistory = netWorthTrend.slice(-1095).map((item) => {
        const date = new Date(item.x).toISOString().slice(0, 10);
        const nav = toNumber(item.y);
        const accNav = toNumber(item.unitMoney ?? item.y);
        return { date, nav, accumulatedNav: accNav, dailyReturn: Number.NaN };
      });

      // Calculate daily returns
      for (let i = 1; i < navHistory.length; i++) {
        const prev = navHistory[i - 1].nav;
        if (Number.isFinite(prev) && prev > 0 && Number.isFinite(navHistory[i].nav)) {
          navHistory[i].dailyReturn = ((navHistory[i].nav - prev) / prev) * 100;
        }
      }
    }
  }

  // Top holdings from fundf10 (via proxy)
  try {
    const html = await proxyFetchText(`https://fundf10.eastmoney.com/jjcc_${code}.html`);
    if (html) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const rows = doc.querySelectorAll('table tbody tr');

      rows.forEach((row) => {
        if (topHoldings.length >= 10) return;
        const cells = row.querySelectorAll('td');
        if (cells.length >= 6) {
          const stockName = cells[1]?.textContent?.trim() || '';
          const stockCode = cells[2]?.textContent?.trim() || '';
          const weightText = cells[5]?.textContent?.trim() || '';
          if (stockName && stockCode && /^\d{6}$/.test(stockCode)) {
            topHoldings.push({
              code: stockCode,
              name: stockName,
              weight: toNumber(weightText.replace('%', '')),
            });
          }
        }
      });
    }
  } catch { /* ignore */ }

  return {
    info,
    navHistory,
    topHoldings,
    estimatedNav,
    estimatedChange,
    estimatedChangePct,
    syl1y,
    syl3y,
    syl6y,
    syl1n,
  };
}

type FundChartRange = '1m' | '3m' | '6m' | '1y' | '3y' | 'all';

const CHART_RANGE_LABELS: Array<{ label: string; value: FundChartRange; days: number }> = [
  { label: '近1月', value: '1m', days: 30 },
  { label: '近3月', value: '3m', days: 90 },
  { label: '近6月', value: '6m', days: 180 },
  { label: '近1年', value: '1y', days: 365 },
  { label: '近3年', value: '3y', days: 365 * 3 },
  { label: '全部', value: 'all', days: 999999 },
];

// -----------------------------------------------------------
// NAV Trend Chart
// -----------------------------------------------------------

function NavTrendChart({ data, daysLimit }: { data: FundNavHistory; daysLimit?: number }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const width = 580;
  const height = 120;
  const padding = { top: 8, right: 10, bottom: 20, left: 10 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Animation: reset instantly (no shrink), then expand with transition
  const [dashOffset, setDashOffset] = useState(2000);
  const [animTransition, setAnimTransition] = useState(true);

  useEffect(() => {
    // Instantly reset to hidden — no transition so user doesn't see shrink
    setAnimTransition(false);
    setDashOffset(2000);
    // Next frame: enable transition and start drawing
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setAnimTransition(true);
        setDashOffset(0);
      });
    });
  }, [daysLimit]);

  // Filter data by days limit
  const filteredData = useMemo(() => {
    if (!daysLimit || daysLimit >= 999999) return data;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysLimit);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    return data.filter((d) => d.date >= cutoffStr);
  }, [data, daysLimit]);

  const validData = filteredData.filter((d) => Number.isFinite(d.nav));
  if (validData.length < 2) {
    return <div className="fund-chart-empty">暂无净值走势数据</div>;
  }

  const navs = validData.map((d) => d.nav);
  const minNav = Math.min(...navs);
  const maxNav = Math.max(...navs);
  const range = Math.max(maxNav - minNav, minNav * 0.001, 0.01);
  const pad = range * 0.08;
  const displayMin = minNav - pad;
  const displayMax = maxNav + pad;
  const displayRange = displayMax - displayMin;

  const toX = (i: number) => padding.left + (i / (validData.length - 1)) * chartWidth;
  const toY = (nav: number) => padding.top + (1 - (nav - displayMin) / displayRange) * chartHeight;

  const linePath = validData.map((d, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(2)} ${toY(d.nav).toFixed(2)}`).join(' ');

  const areaPath = linePath + ` L ${toX(validData.length - 1).toFixed(2)} ${(height - padding.bottom).toFixed(2)} L ${toX(0).toFixed(2)} ${(height - padding.bottom).toFixed(2)} Z`;

  const lastNav = navs[navs.length - 1];
  const firstNav = navs[0];
  const isUp = lastNav >= firstNav;
  const lineColor = isUp ? '#ff5e57' : '#1fc66d';

  const activeIndex = hoverIndex === null ? validData.length - 1 : Math.max(0, Math.min(hoverIndex, validData.length - 1));
  const activeItem = validData[activeIndex];

  // Y-axis labels
  const yTicks = 4;
  const yLabels = Array.from({ length: yTicks + 1 }, (_, i) => {
    const ratio = i / yTicks;
    const price = displayMax - ratio * displayRange;
    const y = padding.top + ratio * chartHeight;
    return { price, y };
  });

  return (
    <div className="fund-nav-chart"
      onMouseMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        if (rect.width <= 0) return;
        const relX = Math.max(0, Math.min((event.clientX - rect.left) / rect.width, 0.9999));
        setHoverIndex(Math.round(relX * (validData.length - 1)));
      }}
      onMouseLeave={() => setHoverIndex(null)}
    >
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="nav-fill-up" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity="0.25" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {yLabels.map((tick, i) => (
          <line key={i} x1={padding.left} x2={width - padding.right} y1={tick.y.toFixed(2)} y2={tick.y.toFixed(2)} className="fund-chart-grid" />
        ))}

        {/* Area fill — fades in as line draws */}
        <path
          d={areaPath}
          fill="url(#nav-fill-up)"
          style={animTransition ? { opacity: 1, transition: 'opacity 0.8s ease 0.2s' } : { opacity: 0 }}
        />

        {/* Price line — draws left to right via stroke-dashoffset animation */}
        <path
          d={linePath}
          fill="none"
          stroke={lineColor}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="2000"
          strokeDashoffset={dashOffset}
          style={animTransition ? { transition: 'stroke-dashoffset 0.8s ease' } : { transition: 'none' }}
        />

        {/* Y-axis labels */}
        {yLabels.map((tick, i) => (
          <text key={i} x={2} y={tick.y + 4} textAnchor="start" className="fund-axis-label" fontSize="9">
            {tick.price.toFixed(4)}
          </text>
        ))}

        {/* X-axis date labels */}
        {[0, Math.floor(validData.length / 2), validData.length - 1].map((i) => (
          <text key={i} x={toX(i).toFixed(2)} y={height - 2} textAnchor="middle" className="fund-axis-label" fontSize="9">
            {validData[i]?.date?.slice(5) || ''}
          </text>
        ))}

        {/* Crosshair */}
        <line x1={toX(activeIndex).toFixed(2)} x2={toX(activeIndex).toFixed(2)} y1={padding.top} y2={height - padding.bottom} className="fund-crosshair" />
        <circle cx={toX(activeIndex).toFixed(2)} cy={toY(activeItem.nav).toFixed(2)} r="3.5" fill="white" stroke={lineColor} strokeWidth="2" />
      </svg>

      {/* Hover tooltip */}
      <div className="fund-nav-tooltip">
        <span className="fund-nav-tooltip-date">{activeItem.date}</span>
        <span className="fund-nav-tooltip-nav">{formatNumber(activeItem.nav, 4)}</span>
        <span className={toneClass(activeItem.dailyReturn)}>{formatPercent(activeItem.dailyReturn)}</span>
      </div>
    </div>
  );
}

type FundDetailTab = 'holding' | 'chart' | 'holdings' | 'info';

const FUND_DETAIL_TABS: Array<{ label: string; value: FundDetailTab }> = [
  { label: '持仓', value: 'holding' },
  { label: '走势', value: 'chart' },
  { label: '重仓', value: 'holdings' },
  { label: '信息', value: 'info' },
];

// -----------------------------------------------------------
// Main Component
// -----------------------------------------------------------

export default function FundDetailView({ code, fundPosition, fundHolding, onBack }: Props) {
  const [detail, setDetail] = useState<FundDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshAt, setRefreshAt] = useState(0);
  const [activeTab, setActiveTab] = useState<FundDetailTab>('chart');
  const [chartRange, setChartRange] = useState<FundChartRange>('3m');

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const result = await fetchFundDetail(code, fundHolding);
        if (cancelled) return;
        setDetail(result);
        setError('');
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : '基金详情获取失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 30_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [code, fundHolding, refreshAt]);

  // Derived display values
  const displayNav = detail?.estimatedNav && Number.isFinite(detail.estimatedNav)
    ? detail.estimatedNav
    : (detail?.info.latestNav || Number.NaN);

  const displayChangePct = detail?.estimatedChangePct && Number.isFinite(detail.estimatedChangePct)
    ? detail.estimatedChangePct
    : Number.NaN;

  const hasHolding = fundPosition && fundHolding && fundPosition.units > 0;

  // Auto-select first available tab
  useEffect(() => {
    if (detail) {
      if (hasHolding) setActiveTab('holding');
      else if (detail.navHistory.length >= 2) setActiveTab('chart');
      else if (detail.topHoldings.length > 0) setActiveTab('holdings');
      else setActiveTab('info');
    }
  }, [detail?.info.code]);

  return (
    <section className="fund-detail-panel">
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
        <div className="detail-loading">基金详情加载中...</div>
      ) : null}

      {error && !detail ? (
        <div className="detail-error">加载失败：{error}</div>
      ) : null}

      {detail ? (
        <>
          {/* ---- Title Row ---- */}
          <div className="fund-detail-title-row">
            <div className="title-left">
              <strong>{detail.info.name}</strong>
              <span>{code}</span>
            </div>
            <div className={`title-price ${toneClass(displayChangePct)}`}>
              {Number.isFinite(displayNav) ? displayNav.toFixed(4) : '-'}
              {Number.isFinite(displayChangePct) ? ` / ${formatPercent(displayChangePct)}` : ''}
            </div>
          </div>

          {/* ---- Tab Bar ---- */}
          <div className="fund-detail-tabs">
            {FUND_DETAIL_TABS.map((tab) => {
              if (tab.value === 'holding' && !hasHolding) return null;
              if (tab.value === 'chart' && detail.navHistory.length < 2) return null;
              if (tab.value === 'holdings' && detail.topHoldings.length === 0) return null;
              return (
                <button
                  key={tab.value}
                  type="button"
                  className={`fund-tab ${activeTab === tab.value ? 'active' : ''}`}
                  onClick={() => setActiveTab(tab.value)}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* ---- Tab Content ---- */}
          <div className="fund-detail-content">
            {/* 持仓 tab */}
            {activeTab === 'holding' && hasHolding ? (
              <div className="fund-holding-card">
                <div className="fund-holding-card-title">我的持仓</div>
                <div className="fund-holding-stats">
                  <div>
                    <span>持有金额</span>
                    <strong>{formatNumber(fundPosition.holdingAmount, 2)}</strong>
                  </div>
                  <div>
                    <span>持有收益</span>
                    <strong className={toneClass(fundPosition.holdingProfit)}>
                      {formatNumber(fundPosition.holdingProfit, 2)}
                    </strong>
                  </div>
                  <div>
                    <span>持有收益率</span>
                    <strong className={toneClass(fundPosition.holdingProfitRate)}>
                      {formatPercent(fundPosition.holdingProfitRate)}
                    </strong>
                  </div>
                  <div>
                    <span>持有份额</span>
                    <strong>{formatNumber(fundPosition.units, 2)}</strong>
                  </div>
                  <div>
                    <span>持仓成本</span>
                    <strong>{fundPosition.cost > 0 ? fundPosition.cost.toFixed(4) : '-'}</strong>
                  </div>
                  <div>
                    <span>最新净值</span>
                    <strong>{Number.isFinite(fundPosition.latestNav) ? fundPosition.latestNav.toFixed(4) : '-'}</strong>
                  </div>
                </div>
              </div>
            ) : null}

            {/* 走势 tab — 包含走势 + 业绩 */}
            {activeTab === 'chart' && detail.navHistory.length >= 2 ? (
              <div className="fund-chart-section">
                <div className="fund-chart-range-row">
                  {CHART_RANGE_LABELS.map((r) => (
                    <button
                      key={r.value}
                      type="button"
                      className={`fund-range-btn ${chartRange === r.value ? 'active' : ''}`}
                      onClick={() => setChartRange(r.value)}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
                <NavTrendChart
                  data={detail.navHistory}
                  daysLimit={CHART_RANGE_LABELS.find((r) => r.value === chartRange)?.days ?? 90}
                />
                <h3 className="fund-section-title" style={{ marginTop: 16 }}>阶段涨幅</h3>
                <div className="fund-performance-grid">
                  {[
                    { label: '近1月', value: detail.syl1y },
                    { label: '近3月', value: detail.syl3y },
                    { label: '近6月', value: detail.syl6y },
                    { label: '近1年', value: detail.syl1n },
                  ].map((item) => (
                    <div key={item.label} className="fund-perf-item">
                      <span className="fund-perf-label">{item.label}</span>
                      <span className={`fund-perf-value ${toneClass(item.value)}`}>
                        {Number.isFinite(item.value) ? `${item.value >= 0 ? '+' : ''}${item.value.toFixed(2)}%` : '-'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* 重仓 tab */}
            {activeTab === 'holdings' && detail.topHoldings.length > 0 ? (
              <div className="fund-holdings-section">
                <h3 className="fund-section-title">十大重仓股</h3>
                <div className="fund-holdings-list">
                  {detail.topHoldings.map((stock, i) => (
                    <div key={stock.code} className="fund-holding-stock-row">
                      <span className="fund-holding-stock-rank">{i + 1}</span>
                      <span className="fund-holding-stock-name">{stock.name}</span>
                      <span className="fund-holding-stock-code">{stock.code}</span>
                      <span className="fund-holding-stock-weight">{formatPercent(stock.weight)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* 信息 tab */}
            {activeTab === 'info' ? (
              <div className="fund-info-section">
                <h3 className="fund-section-title">基本信息</h3>
                <div className="fund-info-grid">
                  <div className="fund-info-item">
                    <span className="fund-info-label">基金类型</span>
                    <span className="fund-info-value">{detail.info.type}</span>
                  </div>
                  <div className="fund-info-item">
                    <span className="fund-info-label">成立日期</span>
                    <span className="fund-info-value">{detail.info.establishmentDate}</span>
                  </div>
                  <div className="fund-info-item">
                    <span className="fund-info-label">最新净值</span>
                    <span className="fund-info-value">
                      {Number.isFinite(detail.info.latestNav) ? detail.info.latestNav.toFixed(4) : '-'}
                    </span>
                  </div>
                  <div className="fund-info-item">
                    <span className="fund-info-label">净值日期</span>
                    <span className="fund-info-value">{detail.info.navDate}</span>
                  </div>
                  <div className="fund-info-item">
                    <span className="fund-info-label">累计净值</span>
                    <span className="fund-info-value">
                      {Number.isFinite(detail.info.accumulatedNav) ? detail.info.accumulatedNav.toFixed(4) : '-'}
                    </span>
                  </div>
                  <div className="fund-info-item">
                    <span className="fund-info-label">估算净值</span>
                    <span className="fund-info-value">
                      {Number.isFinite(detail.estimatedNav) ? detail.estimatedNav.toFixed(4) : '-'}
                    </span>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  );
}
