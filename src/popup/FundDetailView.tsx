import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, Loader2, RefreshCw } from 'lucide-react';
import { type FundPosition, type FundHoldingConfig } from '../shared/fetch';

// Proxy fetch through background to avoid CORS
// Uses a long-lived port connection to keep the Service Worker alive during fetch
let _proxyPort: chrome.runtime.Port | null = null;

function getProxyPort(): chrome.runtime.Port {
  if (!_proxyPort) {
    _proxyPort = chrome.runtime.connect({ name: 'fetch-proxy' });
    _proxyPort.onDisconnect.addListener(() => {
      _proxyPort = null;
    });
  }
  return _proxyPort;
}

async function proxyFetchText(url: string): Promise<string> {
  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    // Ensure Service Worker is kept alive via port connection
    getProxyPort();
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
  company: string;
  establishmentDate: string;
  latestNav: number;
  accumulatedNav: number;
  navDate: string;
  fundSize: string;
  syl1y: number;
  syl3y: number;
  syl6y: number;
  syl1n: number;
  rank1y: string;
  rank3y: string;
  rank6y: string;
  rank1n: string;
  purchaseStatus: string;   // 申购状态
  redeemStatus: string;     // 赎回状态
  riskLevel: string;        // 风险等级
  minPurchase: string;      // 最低申购金额
  rate: string;             // 费率
};

type FundNavPoint = {
  date: string;
  nav: number;
  accumulatedNav: number;
  dailyReturn: number;
};

type FundYieldPoint = {
  date: string;
  yield: number;
  indexYield: number;
  benchmarkName: string;
};

type IntradayValPoint = {
  time: string;
  changePct: number;
};

type FundHoldingStock = {
  code: string;
  name: string;
  weight: number;
  change: number;    // real-time price change %
  price: number;     // real-time price
  prevChange: string; // compared to previous period (PCTNVCHG)
};

type FundDetailData = {
  info: FundDetailInfo;
  navHistory: FundNavPoint[];
  navHistory3m: FundNavPoint[];
  navHistory5y: FundNavPoint[];
  yieldHistory: FundYieldPoint[];
  intradayValuation: IntradayValPoint[];
  topHoldings: FundHoldingStock[];
  holdingReportDate: string;
  estimatedNav: number;
  estimatedChange: number;
  estimatedChangePct: number;
  prevDayNav: number;  // 前一日净值 (用于计算分时估值涨跌幅)
};

// -----------------------------------------------------------
// Utilities
// -----------------------------------------------------------

function formatNumber(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return '-';
  const abs = Math.abs(value);
  if (abs >= 1e8) {
    return (value / 1e8).toFixed(2) + '亿';
  }
  if (abs >= 1e6) {
    return (value / 1e4).toFixed(1) + 'w';
  }
  if (abs >= 1e5) {
    return (value / 1e3).toFixed(1) + 'k';
  }
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

// Common API params
const API_COMMON = {
  deviceid: 'Wap',
  plat: 'Wap',
  product: 'EFund',
  version: '2.0.0',
};

// -----------------------------------------------------------
// API fetch functions
// -----------------------------------------------------------

/** 1. 基金实时估值 (fundgz) */
async function fetchGzEstimate(code: string): Promise<{
  estimatedNav: number;
  estimatedChange: number;
  estimatedChangePct: number;
  prevDayNav: number;
}> {
  try {
    const text = await proxyFetchText(`https://fundgz.1234567.com.cn/js/${code}.js?rt=${Date.now()}`);
    const match = text.match(/jsonpgz\((.*)\);?/);
    if (!match) return { estimatedNav: Number.NaN, estimatedChange: Number.NaN, estimatedChangePct: Number.NaN, prevDayNav: Number.NaN };
    const data = JSON.parse(match[1]);
    const gszzl = toNumber(data.gszzl);
    const dwjz = toNumber(data.dwjz);
    const gsz = toNumber(data.gsz);
    let estimatedChange = Number.NaN;
    if (Number.isFinite(gszzl) && gszzl !== 0 && Number.isFinite(dwjz) && dwjz > 0) {
      estimatedChange = (gszzl / 100) * dwjz;
    }
    return {
      estimatedNav: gsz,
      estimatedChange,
      estimatedChangePct: gszzl,
      prevDayNav: dwjz,
    };
  } catch {
    return { estimatedNav: Number.NaN, estimatedChange: Number.NaN, estimatedChangePct: Number.NaN, prevDayNav: Number.NaN };
  }
}

/** 2. 基金基本情况 */
async function fetchFundBaseInfo(code: string): Promise<Partial<FundDetailInfo>> {
  try {
    const params = new URLSearchParams({
      FCODE: code,
      ...API_COMMON,
      Uid: '',
      _: String(Date.now()),
    });
    const url = `https://fundmobapi.eastmoney.com/FundMApi/FundBaseTypeInformation.ashx?${params}`;
    const text = await proxyFetchText(url);
    const data = JSON.parse(text) as { Datas?: Record<string, unknown> };
    const d = data.Datas;
    if (!d) return {};

    const fundSizeRaw = toNumber(d.ENDNAV);
    let fundSize = '-';
    if (Number.isFinite(fundSizeRaw) && fundSizeRaw > 0) {
      fundSize = fundSizeRaw >= 1e8
        ? (fundSizeRaw / 1e8).toFixed(2) + '亿'
        : fundSizeRaw >= 1e4
          ? (fundSizeRaw / 1e4).toFixed(2) + '万'
          : fundSizeRaw.toFixed(2);
    }

    return {
      name: String(d.SHORTNAME || '-'),
      type: String(d.FTYPE || '-'),
      manager: String(d.JJJL || '-'),
      company: String(d.JJGS || '-'),
      establishmentDate: String(d.ISSBCFMDATA ?? d.ISSEDATE ?? '-').split(' ')[0] || '-',
      latestNav: toNumber(d.DWJZ),
      accumulatedNav: toNumber(d.LJJZ),
      navDate: String(d.FSRQ || '-'),
      fundSize,
      syl1y: toNumber(d.SYL_Y),
      syl3y: toNumber(d.SYL_3Y),
      syl6y: toNumber(d.SYL_6Y),
      syl1n: toNumber(d.SYL_1N),
      rank1y: String(d.RANKM ?? '-'),
      rank3y: String(d.RANKQ ?? '-'),
      rank6y: String(d.RANKHY ?? '-'),
      rank1n: String(d.RANKY ?? '-'),
      purchaseStatus: String(d.SGZT || '-'),
      redeemStatus: String(d.SHZT || '-'),
      riskLevel: String(d.RISKLEVEL || '-'),
      minPurchase: String(d.MINSG || '-'),
      rate: String(d.RATE || '-'),
    };
  } catch {
    return {};
  }
}

/** 3. 净值走势图 (FundNetDiagram.ashx) */
async function fetchNavDiagram(code: string, range: string): Promise<FundNavPoint[]> {
  try {
    const params = new URLSearchParams({
      FCODE: code,
      RANGE: range,
      ...API_COMMON,
      _: String(Date.now()),
    });
    const url = `https://fundmobapi.eastmoney.com/FundMApi/FundNetDiagram.ashx?${params}`;
    const text = await proxyFetchText(url);
    const data = JSON.parse(text) as { Datas?: Array<{ FSRQ: string; DWJZ: string; LJJZ: string; JZZZL: string }> };
    const items = data.Datas ?? [];
    const points: FundNavPoint[] = items.map((item) => ({
      date: item.FSRQ || '',
      nav: toNumber(item.DWJZ),
      accumulatedNav: toNumber(item.LJJZ),
      dailyReturn: toNumber(item.JZZZL),
    }));
    // Sort by date ascending
    points.sort((a, b) => a.date.localeCompare(b.date));
    return points;
  } catch {
    return [];
  }
}

/** 4. 累计收益率走势图 (FundYieldDiagramNew.ashx) */
async function fetchYieldDiagram(code: string): Promise<{ points: FundYieldPoint[]; benchmarkName: string }> {
  try {
    // Fetch 1-year yield data by default
    const params = new URLSearchParams({
      FCODE: code,
      RANGE: 'n',
      ...API_COMMON,
      _: String(Date.now()),
    });
    const url = `https://fundmobapi.eastmoney.com/FundMApi/FundYieldDiagramNew.ashx?${params}`;
    const text = await proxyFetchText(url);
    const data = JSON.parse(text) as {
      Datas?: Array<{ PDATE: string; YIELD: string; INDEXYIED: string }>;
      Expansion?: { INDEXNAME?: string };
    };
    const items = data.Datas ?? [];
    const benchmarkName = data.Expansion?.INDEXNAME || '';
    const points: FundYieldPoint[] = items.map((item) => ({
      date: item.PDATE || '',
      yield: toNumber(item.YIELD),
      indexYield: toNumber(item.INDEXYIED),
      benchmarkName,
    }));
    points.sort((a, b) => a.date.localeCompare(b.date));
    return { points, benchmarkName };
  } catch {
    return { points: [], benchmarkName: '' };
  }
}

/** 5. 分时估值明细 (FundVarietieValuationDetail.ashx) */
async function fetchIntradayValuation(code: string): Promise<IntradayValPoint[]> {
  try {
    const params = new URLSearchParams({
      FCODE: code,
      ...API_COMMON,
      _: String(Date.now()),
    });
    const url = `https://fundmobapi.eastmoney.com/FundMApi/FundVarietieValuationDetail.ashx?${params}`;
    const text = await proxyFetchText(url);
    const data = JSON.parse(text) as { Datas?: string[] };
    const items = data.Datas ?? [];
    // Each item: "09:30,,0.01" -> [time, ?, changePct]
    return items
      .map((item) => {
        const parts = item.split(',');
        if (parts.length < 3) return null;
        const time = parts[0];
        const changePct = toNumber(parts[2]);
        if (!Number.isFinite(changePct)) return null;
        return { time, changePct };
      })
      .filter((p): p is IntradayValPoint => p !== null);
  } catch {
    return [];
  }
}

/** 6. 十大重仓股 + 实时股价 */
async function fetchTopHoldings(code: string): Promise<{ holdings: FundHoldingStock[]; reportDate: string }> {
  try {
    const params = new URLSearchParams({
      FCODE: code,
      ...API_COMMON,
      Uid: '',
      _: String(Date.now()),
    });
    const posUrl = `https://fundmobapi.eastmoney.com/FundMNewApi/FundMNInverstPosition?${params}`;
    const posText = await proxyFetchText(posUrl);
    if (!posText) return { holdings: [], reportDate: '' };

    const posData = JSON.parse(posText) as {
      Datas?: { fundStocks?: Array<{ GPJC: string; GPDM: string; JZBL: string; PCTNVCHG?: string; NEWTEXCH?: string }> };
      Expansion?: string;
    };
    const stocks = posData.Datas?.fundStocks;
    const reportDate = posData.Expansion || '';
    if (!stocks || stocks.length === 0) return { holdings: [], reportDate };

    // Build secids for real-time price query, tracking which indices are valid
    const validIndices: number[] = [];
    const secidsArr: string[] = [];
    for (let i = 0; i < stocks.length && i < 10; i++) {
      const s = stocks[i];
      const market = s.NEWTEXCH ?? '';
      const code = s.GPDM ?? '';
      if (market && code && /^\d{6}$/.test(code)) {
        validIndices.push(i);
        secidsArr.push(`${market}.${code}`);
      }
    }
    const secids = secidsArr.join(',');

    console.log('[FundDetail] secids:', secids);

    // Price results indexed by position in secids list
    let priceResults: { f2: number; f3: number }[] = [];
    if (secids) {
      try {
        const priceUrl = `https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&fields=f2,f3&secids=${secids}&deviceid=Wap&plat=Wap&product=EFund&version=2.0.0`;
        const priceText = await proxyFetchText(priceUrl);
        console.log('[FundDetail] price response:', priceText.slice(0, 500));
        if (priceText) {
          const priceData = JSON.parse(priceText) as { data?: { diff?: Array<{ f2: number; f3: number }> } };
          priceResults = priceData.data?.diff ?? [];
          console.log('[FundDetail] price results count:', priceResults.length);
        }
      } catch (e) {
        console.error('[FundDetail] price fetch error:', e);
      }
    }

    // Map stock index -> price result
    const stockIndexToPrice = new Map<number, { f2: number; f3: number }>();
    for (let i = 0; i < validIndices.length; i++) {
      if (i < priceResults.length) {
        stockIndexToPrice.set(validIndices[i], priceResults[i]);
      }
    }

    const holdings: FundHoldingStock[] = [];
    for (let i = 0; i < stocks.length && i < 10; i++) {
      const stock = stocks[i];
      const stockCode = stock.GPDM || '';
      const stockName = stock.GPJC || '';
      const weight = toNumber(stock.JZBL);
      const prevChange = stock.PCTNVCHG || '';
      if (stockCode && stockName && /^\d{6}$/.test(stockCode)) {
        const priceInfo = stockIndexToPrice.get(i);
        holdings.push({
          code: stockCode,
          name: stockName,
          weight,
          price: priceInfo?.f2 ?? Number.NaN,
          change: priceInfo?.f3 ?? Number.NaN,
          prevChange,
        });
      }
    }
    return { holdings, reportDate };
  } catch {
    return { holdings: [], reportDate: '' };
  }
}

// -----------------------------------------------------------
// Main fetch orchestration
// -----------------------------------------------------------

async function fetchFundDetail(code: string, holding?: FundHoldingConfig): Promise<FundDetailData> {
  // Parallel fetch: estimate, base info, nav diagrams (1m + 3m + 5y), yield diagram, intraday valuation, holdings
  const [
    gzResult,
    baseResult,
    nav1mResult,
    nav3mResult,
    nav5yResult,
    yieldResult,
    intradayResult,
    holdingsResult,
  ] = await Promise.allSettled([
    fetchGzEstimate(code),
    fetchFundBaseInfo(code),
    fetchNavDiagram(code, 'y'),     // 近1月
    fetchNavDiagram(code, '3y'),     // 近3月
    fetchNavDiagram(code, '5n'),     // 近5年
    fetchYieldDiagram(code),
    fetchIntradayValuation(code),
    fetchTopHoldings(code),
  ]);

  // Estimate
  const estimate = gzResult.status === 'fulfilled' ? gzResult.value : {
    estimatedNav: Number.NaN, estimatedChange: Number.NaN, estimatedChangePct: Number.NaN, prevDayNav: Number.NaN,
  };

  // Base info
  const baseInfo = baseResult.status === 'fulfilled' ? baseResult.value : {};

  const info: FundDetailInfo = {
    name: holding?.name || baseInfo.name || code,
    code,
    type: baseInfo.type || '-',
    manager: baseInfo.manager || '-',
    company: baseInfo.company || '-',
    establishmentDate: baseInfo.establishmentDate || '-',
    latestNav: Number.isFinite(baseInfo.latestNav) ? baseInfo.latestNav! : Number.NaN,
    accumulatedNav: Number.isFinite(baseInfo.accumulatedNav) ? baseInfo.accumulatedNav! : Number.NaN,
    navDate: baseInfo.navDate || '-',
    fundSize: baseInfo.fundSize || '-',
    syl1y: baseInfo.syl1y ?? Number.NaN,
    syl3y: baseInfo.syl3y ?? Number.NaN,
    syl6y: baseInfo.syl6y ?? Number.NaN,
    syl1n: baseInfo.syl1n ?? Number.NaN,
    rank1y: baseInfo.rank1y || '-',
    rank3y: baseInfo.rank3y || '-',
    rank6y: baseInfo.rank6y || '-',
    rank1n: baseInfo.rank1n || '-',
    purchaseStatus: baseInfo.purchaseStatus || '-',
    redeemStatus: baseInfo.redeemStatus || '-',
    riskLevel: baseInfo.riskLevel || '-',
    minPurchase: baseInfo.minPurchase || '-',
    rate: baseInfo.rate || '-',
  };

  const navHistory = nav1mResult.status === 'fulfilled' ? nav1mResult.value : [];
  const navHistory3m = nav3mResult.status === 'fulfilled' ? nav3mResult.value : [];
  const navHistory5y = nav5yResult.status === 'fulfilled' ? nav5yResult.value : [];
  const { points: yieldHistory, benchmarkName: _bn } = yieldResult.status === 'fulfilled' ? yieldResult.value : { points: [], benchmarkName: '' };
  const intradayValuation = intradayResult.status === 'fulfilled' ? intradayResult.value : [];
  const { holdings: topHoldings, reportDate: holdingReportDate } = holdingsResult.status === 'fulfilled' ? holdingsResult.value : { holdings: [], reportDate: '' };

  // 缓存分时估值数据，非交易时段可回退使用
  let effectiveIntraday = intradayValuation;
  let effectivePrevDayNav = estimate.prevDayNav;
  if (intradayValuation.length > 0 && Number.isFinite(estimate.prevDayNav)) {
    try {
      await chrome.storage.local.set({
        [`fundIntradayCache_${code}`]: {
          points: intradayValuation,
          prevDayNav: estimate.prevDayNav,
          updatedAt: Date.now(),
        },
      });
    } catch { /* ignore */ }
  } else if (intradayValuation.length === 0) {
    try {
      const cached: Record<string, unknown> = await chrome.storage.local.get(`fundIntradayCache_${code}`);
      const cacheData = cached[`fundIntradayCache_${code}`] as { points?: IntradayValPoint[]; prevDayNav?: number } | undefined;
      if (cacheData?.points && cacheData.points.length > 0) {
        effectiveIntraday = cacheData.points;
        const cachedNav = cacheData.prevDayNav;
        if (typeof cachedNav === 'number' && Number.isFinite(cachedNav)) {
          effectivePrevDayNav = cachedNav;
        }
      }
    } catch { /* ignore */ }
  }

  return {
    info,
    navHistory,
    navHistory3m,
    navHistory5y,
    yieldHistory,
    intradayValuation: effectiveIntraday,
    topHoldings,
    holdingReportDate,
    ...estimate,
    prevDayNav: effectivePrevDayNav,
  };
}

// -----------------------------------------------------------
// Chart range constants
// -----------------------------------------------------------

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

function NavTrendChart({ data, daysLimit }: { data: FundNavPoint[]; daysLimit?: number }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [hoverSvgX, setHoverSvgX] = useState<number | null>(null);
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
  const activeX = hoverSvgX === null ? toX(activeIndex) : Math.max(toX(0), Math.min(toX(validData.length - 1), hoverSvgX));

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
        setHoverSvgX(relX * width);
      }}
      onMouseLeave={() => {
        setHoverIndex(null);
        setHoverSvgX(null);
      }}
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

        {/* Area fill */}
        <path
          d={areaPath}
          fill="url(#nav-fill-up)"
          style={animTransition ? { opacity: 1, transition: 'opacity 0.8s ease 0.2s' } : { opacity: 0 }}
        />

        {/* Price line */}
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

      {/* Floating tooltip popup（类似股票K线图弹窗） */}
      {hoverIndex !== null ? (() => {
        const pct = activeX / width;
        const isRight = pct > 0.6;
        const style: React.CSSProperties = {
          position: 'absolute',
          top: '4px',
          zIndex: 25,
          pointerEvents: 'none',
          ...(isRight
            ? { right: `${((1 - pct) * 100).toFixed(1)}%` }
            : { left: `calc(${(pct * 100).toFixed(1)}% + 10px)` }),
        };
        return (
          <div className="chart-tooltip" style={style}>
            <div className="chart-tooltip-row">
              <span className="chart-tooltip-label">日期</span>
              <span className="chart-tooltip-value">{activeItem.date}</span>
            </div>
            <div className="chart-tooltip-row">
              <span className="chart-tooltip-label">单位净值</span>
              <span className="chart-tooltip-value">{formatNumber(activeItem.nav, 4)}</span>
            </div>
            <div className="chart-tooltip-row">
              <span className="chart-tooltip-label">累计净值</span>
              <span className="chart-tooltip-value">{formatNumber(activeItem.accumulatedNav, 4)}</span>
            </div>
            <div className="chart-tooltip-row">
              <span className="chart-tooltip-label">日涨跌幅</span>
              <span className={`chart-tooltip-value ${toneClass(activeItem.dailyReturn)}`}>{formatPercent(activeItem.dailyReturn)}</span>
            </div>
          </div>
        );
      })() : null}
    </div>
  );
}

// -----------------------------------------------------------
// Yield Chart (fund vs benchmark)
// -----------------------------------------------------------

function YieldChart({ data }: { data: FundYieldPoint[] }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const width = 580;
  const height = 140;
  const padding = { top: 12, right: 10, bottom: 20, left: 10 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const validData = data.filter((d) => Number.isFinite(d.yield) && Number.isFinite(d.indexYield));
  if (validData.length < 2) {
    return <div className="fund-chart-empty">暂无收益对比数据</div>;
  }

  const yields = validData.map((d) => d.yield);
  const indexYields = validData.map((d) => d.indexYield);
  const allValues = [...yields, ...indexYields];
  const minVal = Math.min(...allValues);
  const maxVal = Math.max(...allValues);
  const range = Math.max(maxVal - minVal, 0.01);
  const pad = range * 0.08;
  const displayMin = minVal - pad;
  const displayMax = maxVal + pad;
  const displayRange = displayMax - displayMin;

  const toX = (i: number) => padding.left + (i / (validData.length - 1)) * chartWidth;
  const toY = (val: number) => padding.top + (1 - (val - displayMin) / displayRange) * chartHeight;

  const fundPath = validData.map((d, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(2)} ${toY(d.yield).toFixed(2)}`).join(' ');
  const indexPath = validData.map((d, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(2)} ${toY(d.indexYield).toFixed(2)}`).join(' ');

  const lastYield = yields[yields.length - 1];
  const lastIndexYield = indexYields[indexYields.length - 1];
  const fundColor = lastYield >= 0 ? '#ff5e57' : '#1fc66d';
  const indexColor = lastIndexYield >= 0 ? '#ff9f43' : '#5f7cff';

  const activeIndex = hoverIndex === null ? validData.length - 1 : Math.max(0, Math.min(hoverIndex, validData.length - 1));
  const activeItem = validData[activeIndex];

  const yTicks = 4;
  const yLabels = Array.from({ length: yTicks + 1 }, (_, i) => {
    const ratio = i / yTicks;
    const val = displayMax - ratio * displayRange;
    const y = padding.top + ratio * chartHeight;
    return { val, y };
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
        {/* Zero line */}
        {displayMin <= 0 && displayMax >= 0 && (
          <line x1={padding.left} x2={width - padding.right} y1={toY(0).toFixed(2)} y2={toY(0).toFixed(2)} className="fund-chart-grid" strokeDasharray="2,2" />
        )}

        {/* Grid */}
        {yLabels.map((tick, i) => (
          <line key={i} x1={padding.left} x2={width - padding.right} y1={tick.y.toFixed(2)} y2={tick.y.toFixed(2)} className="fund-chart-grid" />
        ))}

        {/* Index line */}
        <path d={indexPath} fill="none" stroke={indexColor} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4,3" />

        {/* Fund line */}
        <path d={fundPath} fill="none" stroke={fundColor} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />

        {/* Y-axis labels */}
        {yLabels.map((tick, i) => (
          <text key={i} x={2} y={tick.y + 4} textAnchor="start" className="fund-axis-label" fontSize="9">
            {tick.val >= 0 ? '+' : ''}{tick.val.toFixed(2)}%
          </text>
        ))}

        {/* X-axis labels */}
        {[0, Math.floor(validData.length / 2), validData.length - 1].map((i) => (
          <text key={i} x={toX(i).toFixed(2)} y={height - 2} textAnchor="middle" className="fund-axis-label" fontSize="9">
            {validData[i]?.date?.slice(5) || ''}
          </text>
        ))}

        {/* Crosshair + dots */}
        <line x1={toX(activeIndex).toFixed(2)} x2={toX(activeIndex).toFixed(2)} y1={padding.top} y2={height - padding.bottom} className="fund-crosshair" />
        <circle cx={toX(activeIndex).toFixed(2)} cy={toY(activeItem.yield).toFixed(2)} r="3.5" fill="white" stroke={fundColor} strokeWidth="2" />
        <circle cx={toX(activeIndex).toFixed(2)} cy={toY(activeItem.indexYield).toFixed(2)} r="2.5" fill="white" stroke={indexColor} strokeWidth="1.5" />
      </svg>

      {/* Legend */}
      <div className="fund-yield-legend">
        <span><span className="fund-legend-dot" style={{ background: fundColor }} />本基金 {formatPercent(activeItem.yield)}</span>
        <span><span className="fund-legend-dot" style={{ background: indexColor, opacity: 0.7 }} />{activeItem.benchmarkName || '基准指数'} {formatPercent(activeItem.indexYield)}</span>
      </div>

      {/* Tooltip */}
      <div className="fund-nav-tooltip">
        <span className="fund-nav-tooltip-date">{activeItem.date}</span>
        <span>本基金 <span className={toneClass(activeItem.yield)}>{formatPercent(activeItem.yield)}</span></span>
        <span>基准 <span className={toneClass(activeItem.indexYield)}>{formatPercent(activeItem.indexYield)}</span></span>
      </div>
    </div>
  );
}

// -----------------------------------------------------------
// Intraday Valuation Chart
// -----------------------------------------------------------

function IntradayValChart({ data, prevDayNav }: { data: IntradayValPoint[]; prevDayNav: number }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  // A股交易时段：09:30-11:30（120分钟）+ 13:00-15:00（120分钟）
  const MORNING_START = 9 * 60 + 30;
  const MORNING_END = 11 * 60 + 30;
  const AFTERNOON_START = 13 * 60;
  const AFTERNOON_END = 15 * 60;
  const TOTAL_MINUTES = 240;

  function parseTimeToMinutes(timeStr: string): number {
    const m = timeStr.match(/(\d{1,2}):(\d{2})/);
    if (!m) return -1;
    return parseInt(m[1]) * 60 + parseInt(m[2]);
  }

  function timeToFraction(timeStr: string): number {
    const minutes = parseTimeToMinutes(timeStr);
    if (minutes < 0) return 0;
    if (minutes <= MORNING_END) return (minutes - MORNING_START) / TOTAL_MINUTES;
    if (minutes <= AFTERNOON_START) return 120 / TOTAL_MINUTES;
    if (minutes <= AFTERNOON_END) return (120 + (minutes - AFTERNOON_START)) / TOTAL_MINUTES;
    return 1;
  }

  const width = 580;
  const height = 150;
  const padding = { top: 10, right: 48, bottom: 22, left: 56 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  if (data.length === 0) {
    return <div className="fund-chart-empty">暂无分时估值数据</div>;
  }

  const pcts = data.map((d) => d.changePct);
  const minPct = Math.min(...pcts);
  const maxPct = Math.max(...pcts);
  const range = Math.max(maxPct - minPct, 0.01);
  const padAmt = range * 0.12;
  const displayMin = minPct - padAmt;
  const displayMax = maxPct + padAmt;
  const displayRange = Math.max(displayMax - displayMin, 0.001);

  // X positions based on real trading time
  const xs = data.map((d) => padding.left + timeToFraction(d.time) * chartWidth);

  const toY = (pct: number) => padding.top + (1 - (pct - displayMin) / displayRange) * chartHeight;

  const linePath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xs[i].toFixed(2)} ${toY(d.changePct).toFixed(2)}`).join(' ');
  const areaPath = linePath + ` L ${xs[xs.length - 1].toFixed(2)} ${(height - padding.bottom).toFixed(2)} L ${xs[0].toFixed(2)} ${(height - padding.bottom).toFixed(2)} Z`;

  const lastPct = pcts[pcts.length - 1];
  const lineColor = lastPct >= 0 ? '#e45555' : '#2aa568';

  const activeIndex = hoverIndex === null ? data.length - 1 : Math.max(0, Math.min(hoverIndex, data.length - 1));
  const activeItem = data[activeIndex];
  const estNav = Number.isFinite(prevDayNav) && prevDayNav > 0
    ? prevDayNav * (1 + activeItem.changePct / 100)
    : Number.NaN;

  // Baseline Y (0%)
  const baselineY = toY(0);
  const hasBaseline = displayMin <= 0 && displayMax >= 0;

  // Y-axis ticks (change%)
  const yTicks = 4;
  const yLabels = Array.from({ length: yTicks + 1 }, (_, i) => {
    const ratio = i / yTicks;
    const pct = displayMax - ratio * displayRange;
    const y = padding.top + ratio * chartHeight;
    return { pct, y };
  });

  // NAV values for left axis
  const navLabels = yLabels.map((tick) => ({
    nav: Number.isFinite(prevDayNav) && prevDayNav > 0 ? prevDayNav * (1 + tick.pct / 100) : 0,
    y: tick.y,
  }));

  // Noon break X
  const noonBreakX = padding.left + (120 / TOTAL_MINUTES) * chartWidth;

  return (
    <div className="fund-nav-chart"
      onMouseMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        if (rect.width <= 0) return;
        const targetX = (event.clientX - rect.left) / rect.width * width;
        let nearest = 0;
        let nearestDist = Infinity;
        for (let i = 0; i < xs.length; i++) {
          const dist = Math.abs(xs[i] - targetX);
          if (dist < nearestDist) { nearestDist = dist; nearest = i; }
        }
        setHoverIndex(nearest);
      }}
      onMouseLeave={() => setHoverIndex(null)}
    >
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="intraday-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity="0.25" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {yLabels.map((tick, i) => (
          <line key={i} x1={padding.left} x2={width - padding.right} y1={tick.y.toFixed(2)} y2={tick.y.toFixed(2)} className="fund-chart-grid" />
        ))}
        {[0.25, 0.5, 0.75].map((r) => (
          <line key={`v${r}`} x1={(padding.left + r * chartWidth).toFixed(2)} x2={(padding.left + r * chartWidth).toFixed(2)} y1={padding.top} y2={height - padding.bottom} className="fund-chart-grid" />
        ))}

        {/* Baseline (0%) */}
        {hasBaseline && (
          <line x1={padding.left} x2={width - padding.right} y1={baselineY.toFixed(2)} y2={baselineY.toFixed(2)} stroke="rgba(255,255,255,0.25)" strokeWidth="1" strokeDasharray="3,3" />
        )}

        {/* Noon break line */}
        <line x1={noonBreakX.toFixed(2)} x2={noonBreakX.toFixed(2)} y1={padding.top} y2={height - padding.bottom} className="fund-chart-grid" />

        {/* Area fill */}
        <path d={areaPath} fill="url(#intraday-fill)" />

        {/* Price line */}
        <path d={linePath} fill="none" stroke={lineColor} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />

        {/* Left axis: estimated NAV */}
        {navLabels.map((tick, i) => (
          <text key={`nav-${i}`} x={2} y={tick.y + (i === 0 ? 10 : i === yTicks ? -2 : 3)} textAnchor="start" className="fund-axis-label" fontSize="9" fontFamily="monospace">
            {tick.nav.toFixed(4)}
          </text>
        ))}

        {/* Right axis: change % */}
        {yLabels.map((tick, i) => (
          <text key={`pct-${i}`} x={width - 2} y={tick.y + (i === 0 ? 10 : i === yTicks ? -2 : 3)} textAnchor="end" className={`fund-axis-label ${tick.pct > 0.001 ? 'up' : tick.pct < -0.001 ? 'down' : ''}`} fontSize="9" fontFamily="monospace">
            {tick.pct >= 0 ? '+' : ''}{tick.pct.toFixed(2)}%
          </text>
        ))}

        {/* X-axis time labels */}
        <text x={padding.left} y={height - 2} textAnchor="middle" className="fund-axis-label" fontSize="9">09:30</text>
        <text x={noonBreakX} y={height - 2} textAnchor="middle" className="fund-axis-label" fontSize="9">11:30/13:00</text>
        <text x={width - padding.right} y={height - 2} textAnchor="middle" className="fund-axis-label" fontSize="9">15:00</text>

        {/* Crosshair */}
        <line x1={xs[activeIndex].toFixed(2)} x2={xs[activeIndex].toFixed(2)} y1={padding.top} y2={height - padding.bottom} className="fund-crosshair" />
        <circle cx={xs[activeIndex].toFixed(2)} cy={toY(activeItem.changePct).toFixed(2)} r="3.5" fill="white" stroke={lineColor} strokeWidth="2" />
      </svg>

      {/* Tooltip */}
      <div className="fund-nav-tooltip">
        <span className="fund-nav-tooltip-date">{activeItem.time}</span>
        {Number.isFinite(estNav) && <span>估算净值 <strong className={toneClass(activeItem.changePct)}>{estNav.toFixed(4)}</strong></span>}
        <span className={toneClass(activeItem.changePct)}>{formatPercent(activeItem.changePct)}</span>
      </div>
    </div>
  );
}

// -----------------------------------------------------------
// Tab definitions
// -----------------------------------------------------------

type FundDetailTab = 'holding' | 'chart' | 'yield' | 'holdings' | 'info' | 'intraday';

const FUND_DETAIL_TABS: Array<{ label: string; value: FundDetailTab }> = [
  { label: '持仓', value: 'holding' },
  { label: '走势', value: 'chart' },
  { label: '估值', value: 'intraday' },
  { label: '收益', value: 'yield' },
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

    // Which NAV history dataset to use based on chartRange
  const activeNavHistory = useMemo(() => {
    if (!detail) return [];
    switch (chartRange) {
      case '1m':
        return detail.navHistory;
      case '3m':
        return detail.navHistory3m;
      case '6m':
      case '1y':
      case '3y':
      case 'all':
        return detail.navHistory5y;
      default:
        return detail.navHistory5y;
    }
  }, [detail, chartRange]);

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
      else if (detail.intradayValuation.length > 0) setActiveTab('intraday');
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
              if (tab.value === 'intraday' && detail.intradayValuation.length === 0) return null;
              if (tab.value === 'yield' && detail.yieldHistory.length < 2) return null;
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

            {/* 估值 tab — 实时估值分时图 */}
            {activeTab === 'intraday' ? (
              <div className="fund-chart-section">
                {detail.intradayValuation.length > 0 ? (
                  <IntradayValChart
                    data={detail.intradayValuation}
                    prevDayNav={detail.prevDayNav}
                  />
                ) : (
                  <div className="fund-chart-empty">非交易时段或无实时估值数据</div>
                )}
              </div>
            ) : null}

            {/* 走势 tab — 净值走势 + 阶段涨幅 */}
            {activeTab === 'chart' && detail.navHistory.length >= 2 ? (
              <div className="fund-chart-section">
                {/* 净值走势 */}
                <h3 className="fund-section-title">净值走势</h3>
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
                  data={activeNavHistory}
                  daysLimit={CHART_RANGE_LABELS.find((r) => r.value === chartRange)?.days ?? 90}
                />

                {/* 阶段涨幅 */}
                <h3 className="fund-section-title" style={{ marginTop: 16 }}>阶段涨幅</h3>
                <div className="fund-performance-grid">
                  {[
                    { label: '近1月', value: detail.info.syl1y },
                    { label: '近3月', value: detail.info.syl3y },
                    { label: '近6月', value: detail.info.syl6y },
                    { label: '近1年', value: detail.info.syl1n },
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

            {/* 收益 tab — 累计收益 vs 基准 */}
            {activeTab === 'yield' && detail.yieldHistory.length >= 2 ? (
              <div className="fund-chart-section">
                <h3 className="fund-section-title">累计收益对比</h3>
                <YieldChart data={detail.yieldHistory} />

                {/* 阶段涨幅 + 排名 */}
                <h3 className="fund-section-title" style={{ marginTop: 16 }}>阶段涨幅（排名）</h3>
                <div className="fund-performance-grid">
                  {[
                    { label: '近1月', value: detail.info.syl1y, rank: detail.info.rank1y },
                    { label: '近3月', value: detail.info.syl3y, rank: detail.info.rank3y },
                    { label: '近6月', value: detail.info.syl6y, rank: detail.info.rank6y },
                    { label: '近1年', value: detail.info.syl1n, rank: detail.info.rank1n },
                  ].map((item) => (
                    <div key={item.label} className="fund-perf-item">
                      <span className="fund-perf-label">{item.label}</span>
                      <span className={`fund-perf-value ${toneClass(item.value)}`}>
                        {Number.isFinite(item.value) ? `${item.value >= 0 ? '+' : ''}${item.value.toFixed(2)}%` : '-'}
                      </span>
                      <span className="fund-perf-rank">
                        {item.rank && item.rank !== '-' ? `（${item.rank}）` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* 重仓 tab */}
            {activeTab === 'holdings' && detail.topHoldings.length > 0 ? (
              <div className="fund-holdings-section">
                <h3 className="fund-section-title">
                  持仓明细
                  {detail.holdingReportDate && <span className="fund-report-date">（{detail.holdingReportDate}）</span>}
                </h3>
                <div className="fund-holdings-header">
                  <span style={{ width: 20 }} />
                  <span>股票名称（代码）</span>
                  <span>价格</span>
                  <span>涨跌幅</span>
                  <span>持仓占比</span>
                  <span>较上期</span>
                </div>
                <div className="fund-holdings-list">
                  {detail.topHoldings.map((stock, i) => (
                    <div key={stock.code} className="fund-holding-stock-row">
                      <span className="fund-holding-stock-rank">{i + 1}</span>
                      <span className="fund-holding-stock-name">
                        {stock.name}
                        <span className="fund-holding-stock-code">（{stock.code}）</span>
                      </span>
                      <span className={`fund-holding-stock-price ${toneClass(stock.change)}`}>
                        {Number.isFinite(stock.price) ? stock.price.toFixed(2) : '-'}
                      </span>
                      <span className={`fund-holding-stock-change ${toneClass(stock.change)}`}>
                        {Number.isFinite(stock.change) ? `${stock.change >= 0 ? '+' : ''}${stock.change.toFixed(2)}%` : '-'}
                      </span>
                      <span className="fund-holding-stock-weight">
                        {Number.isFinite(stock.weight) ? `${stock.weight.toFixed(2)}%` : '-'}
                      </span>
                      <span className="fund-holding-stock-prevchange">
                        {stock.prevChange === '新增' ? '新增' : stock.prevChange ? `${parseFloat(stock.prevChange) >= 0 ? '↑ ' : '↓ '}${Math.abs(parseFloat(stock.prevChange)).toFixed(2)}%` : '-'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* 概况 tab */}
            {activeTab === 'info' ? (
              <div className="fund-info-section">
                <h3 className="fund-section-title">基金概况</h3>
                <div className="fund-info-grid">
                  <div className="fund-info-item">
                    <span className="fund-info-label">基金类型</span>
                    <span className="fund-info-value">{detail.info.type}</span>
                  </div>
                  <div className="fund-info-item">
                    <span className="fund-info-label">基金公司</span>
                    <span className="fund-info-value">{detail.info.company}</span>
                  </div>
                  <div className="fund-info-item">
                    <span className="fund-info-label">基金经理</span>
                    <span className="fund-info-value">{detail.info.manager}</span>
                  </div>
                  <div className="fund-info-item">
                    <span className="fund-info-label">成立日期</span>
                    <span className="fund-info-value">{detail.info.establishmentDate}</span>
                  </div>
                  <div className="fund-info-item">
                    <span className="fund-info-label">基金规模</span>
                    <span className="fund-info-value">{detail.info.fundSize}</span>
                  </div>
                  <div className="fund-info-item">
                    <span className="fund-info-label">风险等级</span>
                    <span className="fund-info-value">{detail.info.riskLevel}</span>
                  </div>
                  <div className="fund-info-item">
                    <span className="fund-info-label">申购状态</span>
                    <span className="fund-info-value">{detail.info.purchaseStatus}</span>
                  </div>
                  <div className="fund-info-item">
                    <span className="fund-info-label">赎回状态</span>
                    <span className="fund-info-value">{detail.info.redeemStatus}</span>
                  </div>
                  <div className="fund-info-item">
                    <span className="fund-info-label">最低申购</span>
                    <span className="fund-info-value">{detail.info.minPurchase !== '-' ? `${detail.info.minPurchase}元` : '-'}</span>
                  </div>
                  <div className="fund-info-item">
                    <span className="fund-info-label">费率</span>
                    <span className="fund-info-value">{detail.info.rate}</span>
                  </div>
                  <div className="fund-info-item">
                    <span className="fund-info-label">单位净值</span>
                    <span className="fund-info-value">
                      {Number.isFinite(detail.info.latestNav) ? detail.info.latestNav.toFixed(4) : '-'}
                      {detail.info.navDate !== '-' ? `（${detail.info.navDate}）` : ''}
                    </span>
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

                {/* 阶段涨幅 + 排名 */}
                <h3 className="fund-section-title" style={{ marginTop: 16 }}>阶段涨幅（排名）</h3>
                <div className="fund-performance-grid">
                  {[
                    { label: '近1月', value: detail.info.syl1y, rank: detail.info.rank1y },
                    { label: '近3月', value: detail.info.syl3y, rank: detail.info.rank3y },
                    { label: '近6月', value: detail.info.syl6y, rank: detail.info.rank6y },
                    { label: '近1年', value: detail.info.syl1n, rank: detail.info.rank1n },
                  ].map((item) => (
                    <div key={item.label} className="fund-perf-item">
                      <span className="fund-perf-label">{item.label}</span>
                      <span className={`fund-perf-value ${toneClass(item.value)}`}>
                        {Number.isFinite(item.value) ? `${item.value >= 0 ? '+' : ''}${item.value.toFixed(2)}%` : '-'}
                      </span>
                      <span className="fund-perf-rank">
                        {item.rank && item.rank !== '-' ? `（${item.rank}）` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  );
}
