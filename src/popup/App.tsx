import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, GripVertical, Moon, PieChart, Pin, Search, Settings, Star, Sun, WalletCards, X } from 'lucide-react';
import StockDetailView from './StockDetailView';
import IndexDetailModal from './IndexDetailModal';
import FundDetailView from './FundDetailView';
import {
  fetchStockIntraday,
  toTencentStockCode,
  normalizeStockCode,
  normalizeFundCode,
  formatQuoteTime,
  toNumber,
  type StockHoldingConfig,
  type FundHoldingConfig,
  type StockPosition,
  type FundPosition,
  type MarketIndexQuote,
  MARKET_INDEXES,
} from '../shared/fetch';

const BADGE_STORAGE_KEY = 'badgeConfig';

type PageTab = 'stocks' | 'funds' | 'account';
type ThemeMode = 'dark' | 'light';

type IndexDetailTarget = {
  code: string;
  label: string;
};

type SearchStock = {
  code: string;
  name: string;
};

type FundSearchEntry = SearchStock & {
  jp: string;
  category: string;
  fullNamePinyin: string;
  haystack: string;
};

type RowContextMenuState =
  | { kind: 'stock'; code: string; x: number; y: number }
  | { kind: 'fund'; code: string; x: number; y: number };

type SortingMode = 'stocks' | 'funds' | null;

type StockDetailTarget = {
  code: string;
  name: string;
};

type FundDetailTarget = {
  code: string;
  name: string;
};

type PortfolioConfig = {
  stockHoldings: StockHoldingConfig[];
  fundHoldings: FundHoldingConfig[];
};

const EMPTY_PORTFOLIO: PortfolioConfig = {
  stockHoldings: [],
  fundHoldings: [],
};

const TRADING_MINUTES = 240;
const MORNING_START = 9 * 60 + 30;
const MORNING_END = 11 * 60 + 30;
const AFTERNOON_START = 13 * 60;
const AFTERNOON_END = 15 * 60;

const STORAGE_KEYS = {
  stockHoldings: 'stockHoldings',
  fundHoldings: 'fundHoldings',
};

let fundSearchIndexPromise: Promise<FundSearchEntry[]> | null = null;

type IntradayDataPoint = {
  time: string;
  price: number;
  minuteIndex: number;
};

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

function formatNumber(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return '-';
  return value.toLocaleString('zh-CN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatLooseNumber(value: number, maximumFractionDigits = 4): string {
  if (!Number.isFinite(value)) return '-';
  return value.toLocaleString('zh-CN', {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  });
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function formatRatioPercent(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return `${value.toFixed(2)}%`;
}

function toneClass(value: number): string {
  if (!Number.isFinite(value)) return '';
  return value >= 0 ? 'up' : 'down';
}

function getStockBadge(code: string): { label: string; tone: 'growth' | 'tech' | 'beijing' } | null {
  const plain = normalizeStockCode(code);
  if (!plain) return null;
  if (/^(300|301)/.test(plain)) return { label: '创', tone: 'growth' };
  if (/^(688|689)/.test(plain)) return { label: '科', tone: 'tech' };
  if (/^(430|440|830|831|832|833|835|836|837|838|839|870|871|872|873|874|875|876|877|878|879|880|881|882|883|884|885|886|887|888|889)/.test(plain)) {
    return { label: '北', tone: 'beijing' };
  }
  return null;
}

function applyPinnedOrder<T extends { code: string; pinned?: boolean }>(items: T[], code: string): T[] {
  const target = items.find((item) => item.code === code);
  if (!target) return items;

  if (target.pinned) {
    return items.map((item) => (item.code === code ? { ...item, pinned: false } : { ...item, pinned: false }));
  }

  const currentPinned = items.find((item) => item.pinned && item.code !== code);
  const remaining = items
    .filter((item) => item.code !== code && item.code !== currentPinned?.code)
    .map((item) => ({ ...item, pinned: false }));

  const next: T[] = [{ ...target, pinned: true }];
  if (currentPinned) {
    next.push({ ...currentPinned, pinned: false });
  }
  return [...next, ...remaining];
}

function insertAfterPinned<T extends { pinned?: boolean }>(items: T[], nextItem: T): T[] {
  const pinnedIndex = items.findIndex((item) => item.pinned);
  if (pinnedIndex === -1) {
    return [nextItem, ...items];
  }
  return [
    ...items.slice(0, pinnedIndex + 1),
    nextItem,
    ...items.slice(pinnedIndex + 1),
  ];
}

function reorderCodes(codes: string[], draggedCode: string, targetCode: string, lockedCode?: string): string[] {
  if (draggedCode === targetCode) return codes;

  const movable = lockedCode ? codes.filter((code) => code !== lockedCode) : [...codes];
  const fromIndex = movable.indexOf(draggedCode);
  const targetIndex = movable.indexOf(targetCode);
  if (fromIndex < 0 || targetIndex < 0) return codes;

  const next = [...movable];
  const [dragged] = next.splice(fromIndex, 1);
  next.splice(targetIndex, 0, dragged);

  return lockedCode ? [lockedCode, ...next] : next;
}

function moveCodeAfterPinned(codes: string[], draggedCode: string, lockedCode?: string): string[] {
  const movable = lockedCode ? codes.filter((code) => code !== lockedCode) : [...codes];
  const fromIndex = movable.indexOf(draggedCode);
  if (fromIndex < 0) return codes;

  const next = [...movable];
  const [dragged] = next.splice(fromIndex, 1);
  next.unshift(dragged);

  return lockedCode ? [lockedCode, ...next] : next;
}

function sortRowsByCodes<T extends { code: string }>(rows: T[], codes: string[]): T[] {
  const rowMap = new Map(rows.map((row) => [row.code, row]));
  const ordered = codes
    .map((code) => rowMap.get(code))
    .filter((row): row is T => row !== undefined);
  const used = new Set(ordered.map((row) => row.code));
  const rest = rows.filter((row) => !used.has(row.code));
  return [...ordered, ...rest];
}

function parseStockHoldings(input: unknown): StockHoldingConfig[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => {
      const code = normalizeStockCode(String((item as StockHoldingConfig)?.code ?? ''));
      const shares = Math.max(0, toNumber((item as StockHoldingConfig)?.shares));
      const cost = Math.max(0, toNumber((item as StockHoldingConfig)?.cost));
      if (!code) return null;
      const parsed: StockHoldingConfig = {
        code,
        shares: Number.isFinite(shares) ? shares : 0,
        cost: Number.isFinite(cost) ? cost : 0,
        pinned: Boolean((item as StockHoldingConfig)?.pinned),
        special: Boolean((item as StockHoldingConfig)?.special),
      };
      return parsed;
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}

function parseFundHoldings(input: unknown): FundHoldingConfig[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => {
      const code = normalizeFundCode(String((item as FundHoldingConfig)?.code ?? ''));
      const units = Math.max(0, toNumber((item as FundHoldingConfig)?.units));
      const cost = Math.max(0, toNumber((item as FundHoldingConfig)?.cost));
      const name = String((item as FundHoldingConfig)?.name ?? '').trim();
      if (!code) return null;
      const parsed: FundHoldingConfig = {
        code,
        units: Number.isFinite(units) ? units : 0,
        cost: Number.isFinite(cost) ? cost : 0,
        pinned: Boolean((item as FundHoldingConfig)?.pinned),
        special: Boolean((item as FundHoldingConfig)?.special),
      };
      if (name) parsed.name = name;
      return parsed;
    })
    .filter((item): item is FundHoldingConfig => item !== null);
}

async function loadPortfolioConfig(): Promise<PortfolioConfig> {
  if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
    const result = await chrome.storage.sync.get([STORAGE_KEYS.stockHoldings, STORAGE_KEYS.fundHoldings]);
    return {
      stockHoldings: parseStockHoldings(result[STORAGE_KEYS.stockHoldings]),
      fundHoldings: parseFundHoldings(result[STORAGE_KEYS.fundHoldings]),
    };
  }

  try {
    const raw = window.localStorage.getItem('portfolio-config-v1');
    if (!raw) return EMPTY_PORTFOLIO;
    const parsed = JSON.parse(raw) as Partial<PortfolioConfig>;
    return {
      stockHoldings: parseStockHoldings(parsed.stockHoldings),
      fundHoldings: parseFundHoldings(parsed.fundHoldings),
    };
  } catch {
    return EMPTY_PORTFOLIO;
  }
}

async function savePortfolioConfig(config: PortfolioConfig): Promise<void> {
  if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
    await chrome.storage.sync.set({
      [STORAGE_KEYS.stockHoldings]: config.stockHoldings,
      [STORAGE_KEYS.fundHoldings]: config.fundHoldings,
    });
    return;
  }

  window.localStorage.setItem('portfolio-config-v1', JSON.stringify(config));
}

async function fetchTencentStockSuggestions(keyword: string): Promise<SearchStock[]> {
  const q = keyword.trim();
  if (!q) return [];

  const response = await fetch(`https://smartbox.gtimg.cn/s3/?t=all&c=1&q=${encodeURIComponent(q)}`);
  const text = await response.text();
  const matched = text.match(/v_hint="([\s\S]*?)";?/);
  if (!matched || matched[1] === 'N') return [];

  const decoded = matched[1].replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) => (
    String.fromCharCode(parseInt(hex, 16))
  ));

  const dedup = new Set<string>();
  const suggestions: SearchStock[] = [];

  decoded.split('^').forEach((segment) => {
    const parts = segment.split('~');
    if (parts.length < 5) return;

    const market = parts[0];
    const code = parts[1];
    const name = parts[2];
    const productType = parts[4] ?? '';

    if (!(market === 'sh' || market === 'sz')) return;
    if (!/^\d{6}$/.test(code)) return;
    if (!productType.includes('GP')) return;
    if (dedup.has(code)) return;

    dedup.add(code);
    suggestions.push({ code, name });
  });

  return suggestions.slice(0, 16);
}

async function fetchFundSuggestions(keyword: string): Promise<SearchStock[]> {
  const q = keyword.trim();
  if (!q) return [];

  try {
    if (!fundSearchIndexPromise) {
      fundSearchIndexPromise = fetch('https://fund.eastmoney.com/js/fundcode_search.js')
        .then((r) => r.text())
        .then((text) => {
          const matched = text.match(/var\s+r\s*=\s*(\[[\s\S]*\]);?/);
          if (!matched) return [];

          const parsed = JSON.parse(matched[1]) as Array<[string, string, string, string, string]>;
          return parsed
            .map((item) => {
              const code = String(item[0] ?? '').trim();
              const jp = String(item[1] ?? '').trim();
              const name = String(item[2] ?? '').trim();
              const category = String(item[3] ?? '').trim();
              const fullNamePinyin = String(item[4] ?? '').trim();
              if (!/^\d{6}$/.test(code) || !name) return null;

              return {
                code,
                name,
                jp,
                category,
                fullNamePinyin,
                haystack: [code, name, jp, category, fullNamePinyin].join('|').toLowerCase(),
              };
            })
            .filter((item): item is FundSearchEntry => item !== null);
        })
        .catch(() => {
          fundSearchIndexPromise = null;
          return [];
        });
    }

    const entries = await fundSearchIndexPromise;
    if (!entries) return [];
    const query = q.toLowerCase();
    return entries
      .filter((item) => item.haystack.includes(query))
      .slice(0, 16)
      .map(({ code, name }) => ({ code, name }));
  } catch {
    return [];
  }
}

function IntradayChart({ 
  data
}: { 
  data: Array<{ time: string; price: number }>;
}) {
  if (!data || data.length === 0) {
    return (
      <div className="intraday-chart-empty">
        暂无分时数据
      </div>
    );
  }

  const width = 280;
  const height = 50;
  const padding = { top: 4, right: 4, bottom: 4, left: 4 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const dataPoints: IntradayDataPoint[] = [];
  data.forEach((item) => {
    const index = getMinuteIndex(item.time);
    if (index !== null && Number.isFinite(item.price)) {
      dataPoints.push({
        time: item.time,
        price: item.price,
        minuteIndex: index,
      });
    }
  });

  if (dataPoints.length === 0) {
    return (
      <div className="intraday-chart-empty">
        暂无有效分时数据
      </div>
    );
  }

  const prices = dataPoints.map(d => d.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);

  const rawRange = Math.max(maxPrice - minPrice, Math.max(maxPrice * 0.0002, 0.01));
  const step = rawRange / 10;
  const edgePadding = step;
  const displayMin = minPrice - edgePadding;
  const displayMax = maxPrice + edgePadding;
  const displayRange = Math.max(displayMax - displayMin, rawRange);
  const sortedPoints = [...dataPoints].sort((a, b) => a.minuteIndex - b.minuteIndex);

  const toX = (minuteIndex: number) => {
    return padding.left + (minuteIndex / TRADING_MINUTES) * chartWidth;
  };

  const toY = (price: number) => {
    const normalized = (price - displayMin) / displayRange;
    return padding.top + (1 - normalized) * chartHeight;
  };

  const buildPathSegments = () => {
    if (dataPoints.length === 0) return [];

    const sorted = sortedPoints;

    const segments: IntradayDataPoint[][] = [];
    let currentSegment: IntradayDataPoint[] = [sorted[0]];
    
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      
      if (curr.minuteIndex - prev.minuteIndex > 1) {
        segments.push(currentSegment);
        currentSegment = [curr];
      } else {
        currentSegment.push(curr);
      }
    }
    segments.push(currentSegment);
    
    return segments;
  };

  const pathSegments = buildPathSegments();

  const generateLinePath = (segment: IntradayDataPoint[]) => {
    if (segment.length < 2) return '';
    
    return segment.map((point, idx) => {
      const x = toX(point.minuteIndex);
      const y = toY(point.price);
      return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    }).join(' ');
  };

  const lastPrice = dataPoints[dataPoints.length - 1]?.price ?? 0;
  const firstPrice = dataPoints[0]?.price ?? 0;
  const isUp = lastPrice >= firstPrice;
  const lineColor = isUp ? '#ff5e57' : '#1fc66d';
  const openLineY = toY(firstPrice);

  return (
    <svg 
      className="intraday-chart" 
      viewBox={`0 0 ${width} ${height}`} 
      preserveAspectRatio="none"
    >
      <line
        x1={padding.left}
        x2={width - padding.right}
        y1={openLineY.toFixed(2)}
        y2={openLineY.toFixed(2)}
        className="intraday-open-line"
      />
      {pathSegments.map((segment, idx) => {
        const path = generateLinePath(segment);
        if (!path) return null;
        return (
          <path
            key={`line-${idx}`}
            d={path}
            fill="none"
            stroke={lineColor}
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      })}
    </svg>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<PageTab>('stocks');
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const saved = window.localStorage.getItem('popup-theme');
    return saved === 'light' || saved === 'dark' ? saved : 'dark';
  });

  const [popupOpacity, setPopupOpacity] = useState<number>(() => {
    const saved = window.localStorage.getItem('popup-opacity');
    return saved !== null ? Math.min(100, Math.max(0, Number(saved) || 95)) : 95;
  });

  const [badgeConfig, setBadgeConfig] = useState<{ enabled: boolean; mode: string } | null>(null);

  const [stockHoldings, setStockHoldings] = useState<StockHoldingConfig[]>([]);
  const [fundHoldings, setFundHoldings] = useState<FundHoldingConfig[]>([]);
  const [portfolioReady, setPortfolioReady] = useState(false);

  const [stockPositions, setStockPositions] = useState<StockPosition[]>([]);
  const [fundPositions, setFundPositions] = useState<FundPosition[]>([]);
  const [marketIndexes, setMarketIndexes] = useState<MarketIndexQuote[]>(() => (
    MARKET_INDEXES.map((item) => ({
      code: item.code,
      label: item.label,
      price: Number.NaN,
      change: Number.NaN,
      changePct: Number.NaN,
    }))
  ));
  const [stocksLoading, setStocksLoading] = useState(false);
  const [fundsLoading, setFundsLoading] = useState(false);
  const [stocksError, setStocksError] = useState('');
  const [fundsError, setFundsError] = useState('');
  const [indexesError, setIndexesError] = useState('');
  const [indexDetailTarget, setIndexDetailTarget] = useState<IndexDetailTarget | null>(null);

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [suggestions, setSuggestions] = useState<SearchStock[]>([]);
  const [stockDetailTarget, setStockDetailTarget] = useState<StockDetailTarget | null>(null);
  const [fundDetailTarget, setFundDetailTarget] = useState<FundDetailTarget | null>(null);
  const [rowContextMenu, setRowContextMenu] = useState<RowContextMenuState | null>(null);
  const [sortingMode, setSortingMode] = useState<SortingMode>(null);
  const [stockSortDraft, setStockSortDraft] = useState<string[] | null>(null);
  const [fundSortDraft, setFundSortDraft] = useState<string[] | null>(null);
  const [draggingCode, setDraggingCode] = useState<string | null>(null);

  // 内联编辑状态
  const [editingCell, setEditingCell] = useState<{
    kind: 'stock' | 'fund';
    code: string;
    field: 'cost' | 'shares' | 'units';
    value: string;
  } | null>(null);

  const popupRootRef = useRef<HTMLDivElement | null>(null);
  const searchWrapRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const stockMetrics = useMemo(() => {
    const totalMarketValue = stockPositions.reduce((sum, item) => {
      if (!Number.isFinite(item.price) || item.shares <= 0) return sum;
      return sum + item.price * item.shares;
    }, 0);

    const floating = stockPositions.reduce((sum, item) => {
      if (!Number.isFinite(item.floatingPnl)) return sum;
      return sum + item.floatingPnl;
    }, 0);

    const daily = stockPositions.reduce((sum, item) => {
      if (!Number.isFinite(item.dailyPnl)) return sum;
      return sum + item.dailyPnl;
    }, 0);

    return [
      { label: '总市值', value: formatNumber(totalMarketValue, 2), tone: 'neutral' },
      { label: '浮动盈亏', value: formatNumber(floating, 1), tone: toneClass(floating) },
      { label: '当日盈亏', value: formatNumber(daily, 1), tone: toneClass(daily) },
    ] as const;
  }, [stockPositions]);

  const fundMetrics = useMemo(() => {
    const holdingAmount = fundPositions.reduce((sum, item) => {
      if (!Number.isFinite(item.holdingAmount)) return sum;
      return sum + item.holdingAmount;
    }, 0);

    const holdingProfit = fundPositions.reduce((sum, item) => {
      if (!Number.isFinite(item.holdingProfit)) return sum;
      return sum + item.holdingProfit;
    }, 0);

    const estimated = fundPositions.reduce((sum, item) => {
      if (!Number.isFinite(item.estimatedProfit)) return sum;
      return sum + item.estimatedProfit;
    }, 0);

    return [
      { label: '持有总额', value: formatNumber(holdingAmount, 2), tone: 'neutral' },
      { label: '持有收益', value: formatNumber(holdingProfit, 2), tone: toneClass(holdingProfit) },
      { label: '估算收益', value: formatNumber(estimated, 2), tone: toneClass(estimated) },
    ] as const;
  }, [fundPositions]);

  const accountMetrics = useMemo(() => {
    const stockMarketValue = stockPositions.reduce((sum, item) => {
      if (!Number.isFinite(item.price) || item.shares <= 0) return sum;
      return sum + item.price * item.shares;
    }, 0);

    const stockFloating = stockPositions.reduce((sum, item) => {
      if (!Number.isFinite(item.floatingPnl)) return sum;
      return sum + item.floatingPnl;
    }, 0);

    const stockDaily = stockPositions.reduce((sum, item) => {
      if (!Number.isFinite(item.dailyPnl)) return sum;
      return sum + item.dailyPnl;
    }, 0);

    const fundHoldingAmount = fundPositions.reduce((sum, item) => {
      if (!Number.isFinite(item.holdingAmount)) return sum;
      return sum + item.holdingAmount;
    }, 0);

    const fundHoldingProfit = fundPositions.reduce((sum, item) => {
      if (!Number.isFinite(item.holdingProfit)) return sum;
      return sum + item.holdingProfit;
    }, 0);

    const fundEstimated = fundPositions.reduce((sum, item) => {
      if (!Number.isFinite(item.estimatedProfit)) return sum;
      return sum + item.estimatedProfit;
    }, 0);

    const totalAssets = stockMarketValue + fundHoldingAmount;
    const totalHoldingProfit = stockFloating + fundHoldingProfit;
    const previewProfit = stockDaily + fundEstimated;

    return [
      { label: '综合持仓收益', value: formatNumber(totalHoldingProfit, 2), tone: toneClass(totalHoldingProfit) },
      { label: '综合预估收益', value: formatNumber(previewProfit, 2), tone: toneClass(previewProfit) },
      { label: '股票当日盈亏', value: formatNumber(stockDaily, 2), tone: toneClass(stockDaily) },
    ] as const;
  }, [fundPositions, stockPositions]);

  const metrics = activeTab === 'stocks'
    ? stockMetrics
    : activeTab === 'funds'
      ? fundMetrics
      : accountMetrics;

  const accountSnapshot = useMemo(() => {
    const heldStockCount = stockHoldings.filter((item) => item.shares > 0).length;
    const watchStockCount = stockHoldings.filter((item) => item.shares <= 0).length;
    const heldFundCount = fundHoldings.filter((item) => item.units > 0).length;
    const watchFundCount = fundHoldings.filter((item) => item.units <= 0).length;

    const stockMarketValue = stockPositions.reduce((sum, item) => (
      Number.isFinite(item.price) && item.shares > 0 ? sum + item.price * item.shares : sum
    ), 0);
    const stockFloating = stockPositions.reduce((sum, item) => (
      Number.isFinite(item.floatingPnl) ? sum + item.floatingPnl : sum
    ), 0);
    const stockDaily = stockPositions.reduce((sum, item) => (
      Number.isFinite(item.dailyPnl) ? sum + item.dailyPnl : sum
    ), 0);

    const fundHoldingAmount = fundPositions.reduce((sum, item) => (
      Number.isFinite(item.holdingAmount) ? sum + item.holdingAmount : sum
    ), 0);
    const fundHoldingProfit = fundPositions.reduce((sum, item) => (
      Number.isFinite(item.holdingProfit) ? sum + item.holdingProfit : sum
    ), 0);
    const fundEstimated = fundPositions.reduce((sum, item) => (
      Number.isFinite(item.estimatedProfit) ? sum + item.estimatedProfit : sum
    ), 0);

    const totalAssets = stockMarketValue + fundHoldingAmount;
    const disclosedFundCount = fundPositions.filter((item) => item.units > 0 && item.navDisclosedToday).length;
    const stockRatio = totalAssets > 0 ? (stockMarketValue / totalAssets) * 100 : 0;
    const fundRatio = totalAssets > 0 ? (fundHoldingAmount / totalAssets) * 100 : 0;

    return {
      totalAssets,
      stockMarketValue,
      stockFloating,
      stockDaily,
      heldStockCount,
      watchStockCount,
      fundHoldingAmount,
      fundHoldingProfit,
      fundEstimated,
      heldFundCount,
      watchFundCount,
      disclosedFundCount,
      stockRatio,
      fundRatio,
    };
  }, [fundHoldings, fundPositions, stockHoldings, stockPositions]);
  const stockPinnedCode = stockHoldings.find((item) => item.pinned)?.code ?? null;
  const fundPinnedCode = fundHoldings.find((item) => item.pinned)?.code ?? null;
  const stockRows = useMemo(() => {
    const positionMap = new Map(stockPositions.map((item) => [item.code, item]));
    return stockHoldings
      .map((holding) => {
        const row = positionMap.get(holding.code);
        if (!row) return null;
        return {
          ...row,
          pinned: Boolean(holding.pinned),
          special: Boolean(holding.special),
        };
      })
      .filter((item): item is StockPosition & { pinned: boolean; special: boolean } => item !== null);
  }, [stockHoldings, stockPositions]);

  const fundRows = useMemo(() => {
    const positionMap = new Map(fundPositions.map((item) => [item.code, item]));
    return fundHoldings
      .map((holding) => {
        const row = positionMap.get(holding.code);
        if (!row) return null;
        return {
          ...row,
          pinned: Boolean(holding.pinned),
          special: Boolean(holding.special),
        };
      })
      .filter((item): item is FundPosition & { pinned: boolean; special: boolean } => item !== null);
  }, [fundHoldings, fundPositions]);

  const stockDisplayRows = useMemo(() => (
    sortingMode === 'stocks' && stockSortDraft
      ? sortRowsByCodes(stockRows, stockSortDraft)
      : stockRows
  ), [sortingMode, stockRows, stockSortDraft]);

  const fundDisplayRows = useMemo(() => (
    sortingMode === 'funds' && fundSortDraft
      ? sortRowsByCodes(fundRows, fundSortDraft)
      : fundRows
  ), [fundRows, fundSortDraft, sortingMode]);

  const stockTotalHoldingAmount = useMemo(() => (
    stockDisplayRows.reduce((sum, item) => {
      if (!Number.isFinite(item.price) || item.shares <= 0) return sum;
      return sum + item.price * item.shares;
    }, 0)
  ), [stockDisplayRows]);

  useEffect(() => {
    // 初始化面板透明度
    document.documentElement.style.setProperty('--panel-opacity', String(popupOpacity / 100));
  }, []);

  useEffect(() => {
    let mounted = true;
    loadPortfolioConfig().then((config) => {
      if (!mounted) return;
      setStockHoldings(config.stockHoldings);
      setFundHoldings(config.fundHoldings);
      setPortfolioReady(true);
    });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!portfolioReady) return;
    void savePortfolioConfig({ stockHoldings, fundHoldings });
  }, [portfolioReady, stockHoldings, fundHoldings]);

  useEffect(() => {
    document.body.classList.toggle('theme-light', theme === 'light');
    window.localStorage.setItem('popup-theme', theme);
  }, [theme]);

  useEffect(() => {
    window.localStorage.setItem('popup-opacity', String(popupOpacity));
    document.documentElement.style.setProperty('--panel-opacity', String(popupOpacity / 100));
  }, [popupOpacity]);

  // 监听 options 页发来的透明度更新
  useEffect(() => {
    if (typeof chrome.runtime?.onMessage?.addListener === 'function') {
      const handler = (
        message: unknown,
        _sender: unknown,
        sendResponse: (response?: unknown) => void
      ) => {
        const msg = message as { type?: string; opacity?: number };
        if (msg.type === 'set-opacity' && typeof msg.opacity === 'number') {
          setPopupOpacity(msg.opacity);
          sendResponse({ ok: true });
        }
      };
      chrome.runtime.onMessage.addListener(handler as (message: unknown, sender: unknown, sendResponse: (response?: unknown) => void) => boolean | void);
      return () => chrome.runtime.onMessage.removeListener(handler as (message: unknown, sender: unknown, sendResponse: (response?: unknown) => void) => void);
    }
  }, []);

  // 加载角标配置
  useEffect(() => {
    const loadConfig = () => {
      if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
        chrome.storage.sync.get(BADGE_STORAGE_KEY, (result: Record<string, unknown>) => {
          const config = result[BADGE_STORAGE_KEY] as { enabled: boolean; mode: string } | undefined;
          setBadgeConfig(config || { enabled: true, mode: 'stockCount' });
        });
      }
    };
    loadConfig();

    // 监听其他页面（如 options）修改角标配置
    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
      const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
        if (area === 'sync' && changes[BADGE_STORAGE_KEY]) {
          setBadgeConfig(changes[BADGE_STORAGE_KEY].newValue as { enabled: boolean; mode: string } | null);
        }
      };
      chrome.storage.onChanged.addListener(listener);
      return () => chrome.storage.onChanged.removeListener(listener);
    }
  }, []);

  // 更新角标数据
  useEffect(() => {
    if (!portfolioReady || !badgeConfig?.enabled) return;

    const stockMarketValue = stockPositions.reduce((sum, item) => {
      if (!Number.isFinite(item.price) || item.shares <= 0) return sum;
      return sum + item.price * item.shares;
    }, 0);

    const stockFloating = stockPositions.reduce((sum, item) => {
      if (!Number.isFinite(item.floatingPnl)) return sum;
      return sum + item.floatingPnl;
    }, 0);

    const stockDaily = stockPositions.reduce((sum, item) => {
      if (!Number.isFinite(item.dailyPnl)) return sum;
      return sum + item.dailyPnl;
    }, 0);

    const fundHoldingAmount = fundPositions.reduce((sum, item) => {
      if (!Number.isFinite(item.holdingAmount)) return sum;
      return sum + item.holdingAmount;
    }, 0);

    const fundHoldingProfit = fundPositions.reduce((sum, item) => {
      if (!Number.isFinite(item.holdingProfit)) return sum;
      return sum + item.holdingProfit;
    }, 0);

    const fundEstimatedProfit = fundPositions.reduce((sum, item) => {
      if (!Number.isFinite(item.estimatedProfit)) return sum;
      return sum + item.estimatedProfit;
    }, 0);

    if (typeof chrome.runtime?.sendMessage === 'function') {
      void chrome.runtime.sendMessage({
        type: 'update-badge',
        badge: badgeConfig,
        metrics: {
          stockCount: stockHoldings.length,
          fundCount: fundHoldings.length,
          stockMarket: stockMarketValue,
          stockFloatingPnl: stockFloating,
          stockDailyPnl: stockDaily,
          fundAmount: fundHoldingAmount,
          fundHoldingProfit,
          fundEstimatedProfit,
        },
      });
    }
  }, [portfolioReady, badgeConfig, stockPositions, fundPositions, stockHoldings, fundHoldings]);

  // 打开设置页
  const openSettings = () => {
    chrome.runtime.openOptionsPage();
  };

  // ---- 从 storage.local 读取后台缓存数据 ----
  useEffect(() => {
    // 初始加载
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get(['stockPositions', 'fundPositions', 'indexPositions'], (result: Record<string, unknown>) => {
        if (Array.isArray(result.stockPositions)) setStockPositions(result.stockPositions as StockPosition[]);
        if (Array.isArray(result.fundPositions)) setFundPositions(result.fundPositions as FundPosition[]);
        if (Array.isArray(result.indexPositions)) {
          const cached = result.indexPositions as MarketIndexQuote[];
          setMarketIndexes(MARKET_INDEXES.map((item) => {
            const found = cached.find((c) => c.code === item.code);
            return found || { code: item.code, label: item.label, price: Number.NaN, change: Number.NaN, changePct: Number.NaN };
          }));
        }
      });
    }

    // 监听后台刷新写入
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'local') return;
      if (changes.stockPositions?.newValue) setStockPositions(changes.stockPositions.newValue as StockPosition[]);
      if (changes.fundPositions?.newValue) setFundPositions(changes.fundPositions.newValue as FundPosition[]);
      if (changes.indexPositions?.newValue) {
        const cached = changes.indexPositions.newValue as MarketIndexQuote[];
        setMarketIndexes(MARKET_INDEXES.map((item) => {
          const found = cached.find((c) => c.code === item.code);
          return found || { code: item.code, label: item.label, price: Number.NaN, change: Number.NaN, changePct: Number.NaN };
        }));
      }
    };
    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
      chrome.storage.onChanged.addListener(listener);
      return () => chrome.storage.onChanged.removeListener(listener);
    }
  }, []);

  // ---- Keepalive port 防止 service worker 被回收 ----
  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.connect) {
      const port = chrome.runtime.connect({ name: 'keepalive' });
      return () => port.disconnect();
    }
  }, []);

  // 首次加载时如果后台没有缓存，手动请求一次
  useEffect(() => {
    if (!portfolioReady) return;
    if (stockHoldings.length === 0) {
      setStockPositions([]);
      setStocksError('');
      setStocksLoading(false);
      return;
    }
    // 检查是否已有缓存数据
    if (stockPositions.length > 0) {
      setStocksLoading(false);
      return;
    }

    let cancelled = false;
    const loadStocks = async () => {
      setStocksLoading(true);
      try {
        const { fetchBatchStockQuotes, fetchStockIntraday } = await import('../shared/fetch');
        const rows = await fetchBatchStockQuotes(stockHoldings);
        if (!cancelled) {
          setStockPositions(rows);
          setStocksError('');
          // 并行拉分时图
          const codes = stockHoldings
            .map((h) => normalizeStockCode(h.code))
            .filter(Boolean);
          codes.forEach(async (code) => {
            try {
              const intraday = await fetchStockIntraday(code);
              if (!cancelled) {
                setStockPositions((prev) =>
                  prev.map((p) => (p.code === code ? { ...p, intraday } : p)),
                );
                // 写回 storage.local 让后台刷新能保留 intraday
                if (typeof chrome !== 'undefined' && chrome.storage?.local) {
                  const result = await chrome.storage.local.get('stockPositions');
                  const existing = (Array.isArray(result.stockPositions) ? result.stockPositions : []) as StockPosition[];
                  const updated = existing.map((p) => (p.code === code ? { ...p, intraday } : p));
                  await chrome.storage.local.set({ stockPositions: updated });
                }
              }
            } catch { /* ignore */ }
          });
        }
      } catch {
        if (!cancelled) setStocksError('股票行情获取失败');
      } finally {
        if (!cancelled) setStocksLoading(false);
      }
    };

    void loadStocks();
    return () => { cancelled = true; };
  }, [portfolioReady, stockHoldings]);

  useEffect(() => {
    if (!portfolioReady) return;
    if (fundHoldings.length === 0) {
      setFundPositions([]);
      setFundsError('');
      setFundsLoading(false);
      return;
    }
    if (fundPositions.length > 0) {
      setFundsLoading(false);
      return;
    }

    let cancelled = false;
    const loadFunds = async () => {
      setFundsLoading(true);
      try {
        const { fetchTiantianFundPosition } = await import('../shared/fetch');
        const rows = await Promise.all(fundHoldings.map((holding) => fetchTiantianFundPosition(holding)));
        if (!cancelled) {
          setFundPositions(rows);
          setFundsError('');
        }
      } catch {
        if (!cancelled) setFundsError('基金行情获取失败');
      } finally {
        if (!cancelled) setFundsLoading(false);
      }
    };

    void loadFunds();
    return () => { cancelled = true; };
  }, [portfolioReady, fundHoldings]);

  useEffect(() => {
    if (isSearchOpen) {
      searchInputRef.current?.focus();
    }
  }, [isSearchOpen]);

  useEffect(() => {
    if (!isSearchOpen) return;

    const onMouseDown = (event: MouseEvent) => {
      if (!searchWrapRef.current) return;
      if (!searchWrapRef.current.contains(event.target as Node)) {
        setIsSearchOpen(false);
        setKeyword('');
      }
    };

    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [isSearchOpen]);

  useEffect(() => {
    if (!isSearchOpen) return;

    const query = keyword.trim();

    if (!query) {
      setSuggestions([]);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const result = activeTab === 'funds'
          ? await fetchFundSuggestions(query)
          : await fetchTencentStockSuggestions(query);
        if (!cancelled) {
          setSuggestions(result.slice(0, 8));
        }
      } catch {
        if (!cancelled) {
          setSuggestions([]);
        }
      }
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [keyword, isSearchOpen, activeTab]);

  const openSearch = () => setIsSearchOpen(true);
  const closeSearch = () => {
    setIsSearchOpen(false);
    setKeyword('');
  };

  const toggleTheme = () => setTheme((current) => (current === 'dark' ? 'light' : 'dark'));

  useEffect(() => {
    if (activeTab !== 'stocks' && stockDetailTarget) {
      setStockDetailTarget(null);
    }
    if (activeTab !== 'funds' && fundDetailTarget) {
      setFundDetailTarget(null);
    }
  }, [activeTab, stockDetailTarget]);

  useEffect(() => {
    if (
      (sortingMode === 'stocks' && activeTab !== 'stocks') ||
      (sortingMode === 'funds' && activeTab !== 'funds')
    ) {
      setSortingMode(null);
    }
    setIsSearchOpen(false);
    setKeyword('');
    setSuggestions([]);
  }, [activeTab, sortingMode]);

  useEffect(() => {
    if (!rowContextMenu) return;

    const close = () => setRowContextMenu(null);
    document.addEventListener('mousedown', close);
    window.addEventListener('blur', close);
    window.addEventListener('scroll', close, true);

    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('blur', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [rowContextMenu]);

  useEffect(() => {
    setRowContextMenu(null);
  }, [activeTab, stockDetailTarget]);

  useEffect(() => {
    if (sortingMode === 'stocks') {
      setStockSortDraft((prev) => prev ?? stockHoldings.map((item) => item.code));
    } else if (sortingMode === 'funds') {
      setFundSortDraft((prev) => prev ?? fundHoldings.map((item) => item.code));
    } else {
      setStockSortDraft(null);
      setFundSortDraft(null);
      setDraggingCode(null);
    }
  }, [sortingMode, stockHoldings, fundHoldings]);

  const addStockToPortfolio = useCallback((stock: SearchStock) => {
    const normalizedCode = normalizeStockCode(stock.code);
    if (!normalizedCode) return;

    setStockHoldings((prev) => {
      if (prev.some((item) => item.code === normalizedCode)) return prev;
      return insertAfterPinned(
        prev,
        { code: normalizedCode, shares: 0, cost: 0, pinned: false, special: false }
      );
    });
  }, []);

  const addFundToPortfolio = useCallback((fund: SearchStock) => {
    const code = normalizeFundCode(fund.code);
    if (!code) return;

    setFundHoldings((prev) => {
      if (prev.some((item) => item.code === code)) return prev;
      return insertAfterPinned(
        prev,
        { code, units: 0, cost: 0, name: fund.name, pinned: false, special: false }
      );
    });
  }, []);

  const openRowContextMenu = (event: React.MouseEvent, kind: 'stock' | 'fund', code: string) => {
    if (sortingMode) return;
    event.preventDefault();
    event.stopPropagation();
    const rootRect = popupRootRef.current?.getBoundingClientRect();
    const menuWidth = 132;
    const menuHeight = 148;
    const x = rootRect ? event.clientX - rootRect.left : event.clientX;
    const y = rootRect ? event.clientY - rootRect.top : event.clientY;
    const maxX = (rootRect?.width ?? 800) - menuWidth - 8;
    const maxY = (rootRect?.height ?? 600) - menuHeight - 8;

    setRowContextMenu({
      kind,
      code,
      x: Math.max(8, Math.min(x, maxX)),
      y: Math.max(8, Math.min(y, maxY)),
    });
  };

  const toggleStockPinned = (code: string) => {
    setStockHoldings((prev) => applyPinnedOrder(prev, code));
    setRowContextMenu(null);
  };

  const toggleFundPinned = (code: string) => {
    setFundHoldings((prev) => applyPinnedOrder(prev, code));
    setRowContextMenu(null);
  };

  const toggleStockSpecial = (code: string) => {
    setStockHoldings((prev) => prev.map((item) => (
      item.code === code ? { ...item, special: !item.special } : item
    )));
    setRowContextMenu(null);
  };

  const toggleFundSpecial = (code: string) => {
    setFundHoldings((prev) => prev.map((item) => (
      item.code === code ? { ...item, special: !item.special } : item
    )));
    setRowContextMenu(null);
  };

  const removeStockFromPortfolio = (code: string) => {
    setStockHoldings((prev) => prev.filter((item) => item.code !== code));
    setStockPositions((prev) => prev.filter((item) => item.code !== code));
    setRowContextMenu(null);
  };

  const removeFundFromPortfolio = (code: string) => {
    setFundHoldings((prev) => prev.filter((item) => item.code !== code));
    setFundPositions((prev) => prev.filter((item) => item.code !== code));
    setRowContextMenu(null);
  };

  const beginSorting = (mode: Exclude<SortingMode, null>) => {
    setSortingMode(mode);
    setRowContextMenu(null);
  };

  const cancelSorting = () => {
    setSortingMode(null);
  };

  const completeSorting = () => {
    if (sortingMode === 'stocks' && stockSortDraft) {
      const map = new Map(stockHoldings.map((item) => [item.code, item]));
      setStockHoldings(stockSortDraft.map((code) => map.get(code)).filter((item): item is StockHoldingConfig => Boolean(item)));
    } else if (sortingMode === 'funds' && fundSortDraft) {
      const map = new Map(fundHoldings.map((item) => [item.code, item]));
      setFundHoldings(fundSortDraft.map((code) => map.get(code)).filter((item): item is FundHoldingConfig => Boolean(item)));
    }
    setSortingMode(null);
  };

  const handleDragStart = (code: string) => {
    setDraggingCode(code);
  };

  const handleDragEnd = () => {
    setDraggingCode(null);
  };

  const handleStockDrop = (targetCode: string) => {
    if (!draggingCode || !stockSortDraft) return;
    setStockSortDraft(reorderCodes(stockSortDraft, draggingCode, targetCode, stockPinnedCode ?? undefined));
    setDraggingCode(null);
  };

  const handleFundDrop = (targetCode: string) => {
    if (!draggingCode || !fundSortDraft) return;
    setFundSortDraft(reorderCodes(fundSortDraft, draggingCode, targetCode, fundPinnedCode ?? undefined));
    setDraggingCode(null);
  };

  const handleStockDropAfterPinned = () => {
    if (!draggingCode || !stockSortDraft || !stockPinnedCode) return;
    setStockSortDraft(moveCodeAfterPinned(stockSortDraft, draggingCode, stockPinnedCode));
    setDraggingCode(null);
  };

  const handleFundDropAfterPinned = () => {
    if (!draggingCode || !fundSortDraft || !fundPinnedCode) return;
    setFundSortDraft(moveCodeAfterPinned(fundSortDraft, draggingCode, fundPinnedCode));
    setDraggingCode(null);
  };

  const onSelectSuggestion = (item: SearchStock) => {
    if (activeTab === 'funds') {
      addFundToPortfolio(item);
    } else {
      addStockToPortfolio(item);
    }
    setKeyword('');
    setIsSearchOpen(false);
  };

  const openStockDetail = (item: StockPosition) => {
    const code = normalizeStockCode(item.code);
    if (!code) return;
    setStockDetailTarget({
      code,
      name: item.name || code,
    });
  };

  const closeStockDetail = () => {
    setStockDetailTarget(null);
  };

  const openFundDetail = (item: FundPosition) => {
    setFundDetailTarget({
      code: item.code,
      name: item.name || item.code,
    });
  };

  const closeFundDetail = () => {
    setFundDetailTarget(null);
  };

  // 开始内联编辑
  const startEditing = (kind: 'stock' | 'fund', code: string, field: 'cost' | 'shares' | 'units') => {
    const holding = kind === 'stock'
      ? stockHoldings.find((h) => h.code === code)
      : fundHoldings.find((h) => h.code === code);
    if (!holding) return;
    const currentValue = field === 'cost'
      ? (holding.cost > 0 ? String(holding.cost) : '')
      : ('shares' in holding
        ? (holding.shares > 0 ? String(holding.shares) : '')
        : (holding.units > 0 ? String(holding.units) : ''));
    setEditingCell({ kind, code, field, value: currentValue });
  };

  // 完成内联编辑
  const finishEditing = () => {
    if (!editingCell) return;
    const { kind, code, field, value } = editingCell;
    if (kind === 'stock') {
      if (field === 'cost') {
        const trimmed = value.trim();
        const nextCost = trimmed === '' ? 0 : parseFloat(trimmed);
        if (!Number.isNaN(nextCost) && nextCost >= 0) {
          const normalizedCost = Math.round(nextCost * 1000) / 1000;
          setStockHoldings((prev) =>
            prev.map((h) => (h.code === code ? { ...h, cost: normalizedCost } : h))
          );
          setStockPositions((prev) =>
            prev.map((item) => {
              if (item.code !== code) return item;
              const floatingPnl = item.shares > 0 && Number.isFinite(item.price) && normalizedCost > 0
                ? (item.price - normalizedCost) * item.shares
                : Number.NaN;
              return {
                ...item,
                cost: normalizedCost,
                floatingPnl,
              };
            })
          );
        }
      } else if (field === 'shares') {
        const trimmed = value.trim();
        const num = trimmed === '' ? 0 : parseInt(trimmed, 10);
        if (!Number.isNaN(num) && num >= 0 && num % 100 === 0) {
          setStockHoldings((prev) =>
            prev.map((h) => (h.code === code ? { ...h, shares: num } : h))
          );
          setStockPositions((prev) =>
            prev.map((item) => {
              if (item.code !== code) return item;
              const floatingPnl = item.cost > 0 && Number.isFinite(item.price)
                ? (item.price - item.cost) * num
                : Number.NaN;
              const dailyPnl = Number.isFinite(item.prevClose) && Number.isFinite(item.price)
                ? (item.price - item.prevClose) * num
                : Number.NaN;
              return {
                ...item,
                shares: num,
                floatingPnl,
                dailyPnl,
              };
            })
          );
        }
      }
    } else {
      const recalcFundPosition = (item: FundPosition, nextUnits: number, nextCost: number) => {
        const holdingAmount = nextUnits > 0 && Number.isFinite(item.estimatedNav)
          ? nextUnits * item.estimatedNav
          : Number.NaN;
        const holdingProfit = nextUnits > 0 && nextCost > 0 && Number.isFinite(item.latestNav)
          ? (item.latestNav - nextCost) * nextUnits
          : Number.NaN;
        const holdingProfitRate = nextCost > 0 && Number.isFinite(item.latestNav)
          ? ((item.latestNav - nextCost) / nextCost) * 100
          : Number.NaN;
        const estimatedProfit = item.navDisclosedToday
          ? 0
          : (nextUnits > 0 && Number.isFinite(item.estimatedNav) && Number.isFinite(item.latestNav)
            ? (item.estimatedNav - item.latestNav) * nextUnits
            : Number.NaN);

        return {
          ...item,
          units: nextUnits,
          cost: nextCost,
          holdingAmount,
          holdingProfit,
          holdingProfitRate,
          estimatedProfit,
        };
      };

      if (field === 'cost') {
        const trimmed = value.trim();
        const nextCost = trimmed === '' ? 0 : parseFloat(trimmed);
        if (!Number.isNaN(nextCost) && nextCost >= 0) {
          setFundHoldings((prev) =>
            prev.map((h) => (h.code === code ? { ...h, cost: nextCost } : h))
          );
          setFundPositions((prev) =>
            prev.map((item) => (item.code === code ? recalcFundPosition(item, item.units, nextCost) : item))
          );
        }
      } else if (field === 'units') {
        const trimmed = value.trim();
        const nextUnits = trimmed === '' ? 0 : parseFloat(trimmed);
        if (!Number.isNaN(nextUnits) && nextUnits >= 0) {
          setFundHoldings((prev) =>
            prev.map((h) => (h.code === code ? { ...h, units: nextUnits } : h))
          );
          setFundPositions((prev) =>
            prev.map((item) => (item.code === code ? recalcFundPosition(item, nextUnits, item.cost) : item))
          );
        }
      }
    }
    setEditingCell(null);
  };

  // 取消内联编辑
  const cancelEditing = () => {
    setEditingCell(null);
  };

  // 更新编辑值
  const updateEditingValue = (newValue: string) => {
    if (!editingCell) return;
    if (editingCell.kind === 'stock' && editingCell.field === 'cost') {
      // 成本：只允许数字和小数点，最多3位小数
      const cleaned = newValue.replace(/[^0-9.]/g, '');
      const parts = cleaned.split('.');
      if (parts.length > 2) return;
      if (parts[1] && parts[1].length > 3) return;
      setEditingCell((prev) => (prev ? { ...prev, value: cleaned } : null));
    } else if (editingCell.kind === 'stock' && editingCell.field === 'shares') {
      // 股数：只允许数字
      const cleaned = newValue.replace(/[^0-9]/g, '');
      setEditingCell((prev) => (prev ? { ...prev, value: cleaned } : null));
    } else {
      const cleaned = newValue.replace(/[^0-9.]/g, '');
      const parts = cleaned.split('.');
      if (parts.length > 2) return;
      setEditingCell((prev) => (prev ? { ...prev, value: cleaned } : null));
    }
  };

  return (
    <div className="popup-root" ref={popupRootRef}>
      <div className="grid-overlay" />
      <div className="app-shell">
        <aside className="side-nav">
          <button
            type="button"
            className={`nav-btn ${activeTab === 'stocks' ? 'active' : ''}`}
            onClick={() => setActiveTab('stocks')}
          >
            <BarChart3 size={11} />
            <span>股票</span>
          </button>
          <button
            type="button"
            className={`nav-btn ${activeTab === 'funds' ? 'active' : ''}`}
            onClick={() => setActiveTab('funds')}
          >
            <WalletCards size={11} />
            <span>基金</span>
          </button>
          <button
            type="button"
            className={`nav-btn ${activeTab === 'account' ? 'active' : ''}`}
            onClick={() => setActiveTab('account')}
          >
            <PieChart size={11} />
            <span>账户</span>
          </button>

          <div className="nav-spacer" />

          <button
            type="button"
            className="nav-btn theme-toggle-btn"
            onClick={openSettings}
            aria-label="打开设置"
          >
            <Settings size={11} />
            <span>设置</span>
          </button>

          <button
            type="button"
            className="nav-btn theme-toggle-btn"
            onClick={toggleTheme}
            aria-label="切换主题"
          >
            {theme === 'dark' ? <Sun size={11} /> : <Moon size={11} />}
            <span>{theme === 'dark' ? '浅色' : '深色'}</span>
          </button>
        </aside>

        <main className={`main-area ${stockDetailTarget ? 'detail-layout' : ''}`}>
          {!stockDetailTarget ? (
          <section className="index-strip">
            <div className="index-grid">
              {marketIndexes.map((item) => (
                <button
                  type="button"
                  className="index-card"
                  key={item.code}
                  onClick={() => setIndexDetailTarget({ code: item.code, label: item.label })}
                >
                  <p>{item.label}</p>
                  <strong className={toneClass(item.change)}>{formatNumber(item.price, 2)}</strong>
                  <div className={`index-meta ${toneClass(item.change)}`}>
                    <span>{formatNumber(item.change, 2)}</span>
                    <span>{formatPercent(item.changePct)}</span>
                  </div>
                </button>
              ))}
            </div>
            {indexesError ? <span className="index-error">{indexesError}</span> : null}
          </section>
          ) : null}

          {!stockDetailTarget ? (
            <header className={`page-header ${activeTab === 'account' ? 'account-page-header' : ''}`}>
              <section className={`metrics inline ${activeTab === 'account' ? 'account' : ''}`}>
                {metrics.map((item) => (
                  <article className="metric-card compact" key={item.label}>
                    <p>{item.label}</p>
                    <strong className={item.tone === 'neutral' ? '' : item.tone}>{item.value}</strong>
                  </article>
                ))}
              </section>

              <div className="hero-top">
                {activeTab === 'account' ? (
                  <div className="account-header-copy">
                    <span className="account-header-eyebrow">账户总览</span>
                    <div className="account-header-pills">
                      <span>{`股票持仓 ${accountSnapshot.heldStockCount} 只`}</span>
                      <span>{`基金持仓 ${accountSnapshot.heldFundCount} 只`}</span>
                      <span>{`仅自选 ${accountSnapshot.watchStockCount + accountSnapshot.watchFundCount} 只`}</span>
                      <span>{`已披露净值 ${accountSnapshot.disclosedFundCount} 只`}</span>
                    </div>
                  </div>
                ) : (
                  <div className={`search-shell ${isSearchOpen ? 'open' : ''}`} ref={searchWrapRef}>
                    {!isSearchOpen ? (
                      <button className="search-icon-btn" type="button" onClick={openSearch} aria-label="搜索股票">
                        <Search size={9} />
                      </button>
                    ) : (
                      <div className="search-box">
                        <Search size={13} className="search-leading-icon" />
                        <input
                          ref={searchInputRef}
                          value={keyword}
                          onChange={(e) => setKeyword(e.target.value)}
                          placeholder={activeTab === 'funds' ? '搜索基金代码或名称' : '搜索股票代码或名称'}
                          className="search-input"
                          autoComplete="off"
                          autoCorrect="off"
                          autoCapitalize="off"
                          spellCheck={false}
                          name="portfolio-search"
                        />
                        <button className="search-close-btn" type="button" onClick={closeSearch} aria-label="关闭搜索">
                          <X size={13} />
                        </button>
                      </div>
                    )}

                    {isSearchOpen && keyword.trim() ? (
                      <div className="search-suggestions">
                        {suggestions.length > 0 ? (
                          suggestions.map((item) => (
                            <button
                              key={item.code}
                              type="button"
                              className="suggestion-item"
                              onClick={() => onSelectSuggestion(item)}
                            >
                              <span>{item.name}</span>
                              <span>{item.code}</span>
                            </button>
                          ))
                        ) : (
                          <div className="suggestion-empty">未找到匹配{activeTab === 'funds' ? '基金' : '股票'}</div>
                        )}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </header>
          ) : null}

          <section className={`content-scroll ${activeTab === 'stocks' && stockDetailTarget ? 'detail-mode' : ''} ${activeTab === 'funds' && fundDetailTarget ? 'detail-mode' : ''}`}>
            {activeTab === 'stocks' && stockDetailTarget ? (
              <StockDetailView
                code={stockDetailTarget.code}
                fallbackName={stockDetailTarget.name}
                onBack={closeStockDetail}
              />
            ) : null}

            {activeTab === 'funds' && fundDetailTarget ? (
              <FundDetailView
                code={fundDetailTarget.code}
                fundPosition={fundPositions.find((p) => p.code === fundDetailTarget.code)}
                fundHolding={fundHoldings.find((h) => h.code === fundDetailTarget.code)}
                onBack={closeFundDetail}
              />
            ) : null}

            {activeTab === 'account' && !stockDetailTarget ? (
              <div className="account-dashboard">
                <section className="account-hero-card">
                  <div className="account-hero-main">
                    <span className="account-section-label">总投资资产</span>
                    <strong>{formatNumber(accountSnapshot.totalAssets, 2)}</strong>
                    <p>当前账户由股票市值与基金持有金额共同构成，下面是两类资产的实时占比。</p>
                  </div>
                  <div className="account-allocation">
                    <div className="allocation-row">
                      <div className="allocation-meta">
                        <span>股票资产</span>
                        <strong>{formatNumber(accountSnapshot.stockMarketValue, 2)}</strong>
                      </div>
                      <span className="allocation-ratio">{`${accountSnapshot.stockRatio.toFixed(1)}%`}</span>
                    </div>
                    <div className="allocation-bar">
                      <span className="stock" style={{ width: `${Math.max(accountSnapshot.stockRatio, 0)}%` }} />
                    </div>
                    <div className="allocation-row">
                      <div className="allocation-meta">
                        <span>基金资产</span>
                        <strong>{formatNumber(accountSnapshot.fundHoldingAmount, 2)}</strong>
                      </div>
                      <span className="allocation-ratio">{`${accountSnapshot.fundRatio.toFixed(1)}%`}</span>
                    </div>
                    <div className="allocation-bar">
                      <span className="fund" style={{ width: `${Math.max(accountSnapshot.fundRatio, 0)}%` }} />
                    </div>
                  </div>
                </section>

                <div className="account-grid">
                  <article className="account-card">
                    <span className="account-section-label">收益快照</span>
                    <div className="account-stat-list">
                      <div className="account-stat-row">
                        <span>综合持仓收益</span>
                        <strong className={toneClass(accountSnapshot.stockFloating + accountSnapshot.fundHoldingProfit)}>
                          {formatNumber(accountSnapshot.stockFloating + accountSnapshot.fundHoldingProfit, 2)}
                        </strong>
                      </div>
                      <div className="account-stat-row">
                        <span>综合预估收益</span>
                        <strong className={toneClass(accountSnapshot.stockDaily + accountSnapshot.fundEstimated)}>
                          {formatNumber(accountSnapshot.stockDaily + accountSnapshot.fundEstimated, 2)}
                        </strong>
                      </div>
                      <div className="account-stat-row">
                        <span>股票当日盈亏</span>
                        <strong className={toneClass(accountSnapshot.stockDaily)}>
                          {formatNumber(accountSnapshot.stockDaily, 2)}
                        </strong>
                      </div>
                    </div>
                  </article>

                  <article className="account-card">
                    <span className="account-section-label">披露状态</span>
                    <div className="account-stat-list">
                      <div className="account-stat-row">
                        <span>基金持仓数</span>
                        <strong>{formatNumber(accountSnapshot.heldFundCount, 0)}</strong>
                      </div>
                      <div className="account-stat-row">
                        <span>已披露净值</span>
                        <strong>{formatNumber(accountSnapshot.disclosedFundCount, 0)}</strong>
                      </div>
                      <div className="account-stat-row">
                        <span>待估算净值</span>
                        <strong>{formatNumber(accountSnapshot.heldFundCount - accountSnapshot.disclosedFundCount, 0)}</strong>
                      </div>
                    </div>
                  </article>

                  <article className="account-card account-detail-card">
                    <span className="account-section-label">股票概览</span>
                    <div className="account-detail-list">
                      <div className="account-detail-item">
                        <span>持仓只数</span>
                        <strong>{formatNumber(accountSnapshot.heldStockCount, 0)}</strong>
                      </div>
                      <div className="account-detail-item">
                        <span>仅自选</span>
                        <strong>{formatNumber(accountSnapshot.watchStockCount, 0)}</strong>
                      </div>
                      <div className="account-detail-item">
                        <span>股票市值</span>
                        <strong>{formatNumber(accountSnapshot.stockMarketValue, 2)}</strong>
                      </div>
                      <div className="account-detail-item">
                        <span>持仓收益</span>
                        <strong className={toneClass(accountSnapshot.stockFloating)}>{formatNumber(accountSnapshot.stockFloating, 2)}</strong>
                      </div>
                      <div className="account-detail-item">
                        <span>当日盈亏</span>
                        <strong className={toneClass(accountSnapshot.stockDaily)}>{formatNumber(accountSnapshot.stockDaily, 2)}</strong>
                      </div>
                    </div>
                  </article>

                  <article className="account-card account-detail-card">
                    <span className="account-section-label">基金概览</span>
                    <div className="account-detail-list">
                      <div className="account-detail-item">
                        <span>持仓只数</span>
                        <strong>{formatNumber(accountSnapshot.heldFundCount, 0)}</strong>
                      </div>
                      <div className="account-detail-item">
                        <span>仅自选</span>
                        <strong>{formatNumber(accountSnapshot.watchFundCount, 0)}</strong>
                      </div>
                      <div className="account-detail-item">
                        <span>持有金额</span>
                        <strong>{formatNumber(accountSnapshot.fundHoldingAmount, 2)}</strong>
                      </div>
                      <div className="account-detail-item">
                        <span>持有收益</span>
                        <strong className={toneClass(accountSnapshot.fundHoldingProfit)}>{formatNumber(accountSnapshot.fundHoldingProfit, 2)}</strong>
                      </div>
                      <div className="account-detail-item">
                        <span>估算收益</span>
                        <strong className={toneClass(accountSnapshot.fundEstimated)}>{formatNumber(accountSnapshot.fundEstimated, 2)}</strong>
                      </div>
                    </div>
                  </article>
                </div>
              </div>
            ) : null}

            {sortingMode ? (
              <div className="sort-mode-bar">
                <span>正在排序，拖拽条目调整顺序</span>
                <div className="sort-mode-actions">
                  <button type="button" onClick={cancelSorting}>取消</button>
                  <button type="button" className="primary" onClick={completeSorting}>完成排序</button>
                </div>
              </div>
            ) : null}

            {activeTab === 'stocks' && !stockDetailTarget ? (
              <div className="table-panel">
                <table className="data-table stock-table">
                  <thead>
                    <tr>
                      <th>股票/市值</th>
                      <th>分时图</th>
                      <th>盈亏</th>
                      <th>当日盈亏</th>
                      <th>成本/现价</th>
                      <th>持仓股数</th>
                      <th>仓位比</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stockDisplayRows.map((item) => {
                      const hasShares = item.shares > 0;
                      const hasCost = item.cost > 0;
                      const hasPosition = hasShares && hasCost;
                      const badge = getStockBadge(item.code);
                      const isLockedPinned = sortingMode === 'stocks' && item.code === stockPinnedCode;
                      const holdingAmount = hasPosition && Number.isFinite(item.price)
                        ? item.price * item.shares
                        : Number.NaN;
                      const holdingRate = hasPosition && Number.isFinite(item.price)
                        ? ((item.price - item.cost) / item.cost) * 100
                        : Number.NaN;
                      const positionRatio = stockTotalHoldingAmount > 0 && Number.isFinite(holdingAmount)
                        ? (holdingAmount / stockTotalHoldingAmount) * 100
                        : Number.NaN;

                      return (
                        <Fragment key={item.code}>
                        <tr
                          className={[
                            editingCell?.code === item.code ? 'editing-row' : '',
                            sortingMode === 'stocks' ? 'sorting-row' : '',
                            draggingCode === item.code ? 'dragging-row' : '',
                            isLockedPinned ? 'locked-row' : '',
                          ].filter(Boolean).join(' ')}
                          onContextMenu={(event) => openRowContextMenu(event, 'stock', item.code)}
                          draggable={sortingMode === 'stocks' && !isLockedPinned}
                          onDragStart={() => handleDragStart(item.code)}
                          onDragEnd={handleDragEnd}
                          onDragOver={(event) => {
                            if (sortingMode === 'stocks') event.preventDefault();
                          }}
                          onDrop={() => handleStockDrop(item.code)}
                        >
                          <td
                            className={`name-col stock-detail-trigger ${item.special ? 'special-row' : ''}`}
                            onClick={() => {
                              if (sortingMode === 'stocks') return;
                              openStockDetail(item);
                            }}
                            role="button"
                            tabIndex={sortingMode === 'stocks' ? -1 : 0}
                            onKeyDown={(e) => {
                              if (sortingMode === 'stocks') return;
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                openStockDetail(item);
                              }
                            }}
                          >
                            <span className="primary">
                              <span className="name-inline">
                                {sortingMode === 'stocks' ? (
                                  <span className={`drag-handle ${isLockedPinned ? 'disabled' : ''}`}>
                                    <GripVertical size={12} />
                                  </span>
                                ) : null}
                                {item.special ? <Star size={10} className="special-star-icon" aria-hidden="true" /> : null}
                                <span className="name-text">{item.name || item.code}</span>
                                {badge ? (
                                  <span className={`stock-badge ${badge.tone}`}>{badge.label}</span>
                                ) : null}
                                {item.pinned ? <Pin size={10} className="pinned-flag" /> : null}
                              </span>
                            </span>
                            <span className="secondary">{item.code}</span>
                          </td>
                          <td
                            className="stock-detail-trigger stock-detail-chart"
                            onClick={() => {
                              if (sortingMode === 'stocks') return;
                              openStockDetail(item);
                            }}
                            role="button"
                            tabIndex={sortingMode === 'stocks' ? -1 : 0}
                            onKeyDown={(e) => {
                              if (sortingMode === 'stocks') return;
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                openStockDetail(item);
                              }
                            }}
                          >
                            <IntradayChart 
                              data={item.intraday} 
                            />
                          </td>
                          <td className="dual-value">
                            <span className={toneClass(item.floatingPnl)}>{formatNumber(item.floatingPnl, 1)}</span>
                            <span className={toneClass(holdingRate)}>{formatPercent(holdingRate)}</span>
                          </td>
                          <td className="dual-value">
                            <span className={toneClass(item.dailyPnl)}>{formatNumber(item.dailyPnl, 0)}</span>
                            <span className={toneClass(item.dailyChangePct)}>{formatPercent(item.dailyChangePct)}</span>
                          </td>
                          <td className="dual-value price-cell">
                            {editingCell?.kind === 'stock' && editingCell.code === item.code && editingCell.field === 'cost' ? (
                              <input
                                className="inline-edit-input inline-edit-compact"
                                value={editingCell.value}
                                placeholder="输入成本价"
                                onChange={(e) => updateEditingValue(e.target.value)}
                                onBlur={finishEditing}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    finishEditing();
                                  } else if (e.key === 'Escape') {
                                    cancelEditing();
                                  }
                                }}
                                autoFocus
                              />
                            ) : (
                              <span
                                className={hasCost ? 'cost-line editable-trigger' : 'editable-trigger placeholder-hint'}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  startEditing('stock', item.code, 'cost');
                                }}
                              >
                                {hasCost ? formatNumber(item.cost, 3) : '输入成本价'}
                              </span>
                            )}
                            <span className="price-line">{formatNumber(item.price, 2)}</span>
                          </td>
                          <td>
                            {editingCell?.kind === 'stock' && editingCell.code === item.code && editingCell.field === 'shares' ? (
                              <input
                                className="inline-edit-input inline-edit-compact"
                                value={editingCell.value}
                                placeholder="输入股数"
                                onChange={(e) => updateEditingValue(e.target.value)}
                                onBlur={finishEditing}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    finishEditing();
                                  } else if (e.key === 'Escape') {
                                    cancelEditing();
                                  }
                                }}
                                autoFocus
                              />
                            ) : (
                              <span
                                className={hasShares ? 'editable-trigger' : 'editable-trigger placeholder-hint'}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  startEditing('stock', item.code, 'shares');
                                }}
                              >
                                {hasShares ? formatNumber(item.shares, 0) : '输入股数'}
                              </span>
                            )}
                          </td>
                          <td>{formatRatioPercent(positionRatio)}</td>
                        </tr>
                        {sortingMode === 'stocks' && isLockedPinned ? (
                          <tr
                            className={`sort-insert-row ${draggingCode ? 'active' : ''}`}
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={handleStockDropAfterPinned}
                          >
                            <td colSpan={7}>拖到这里可排到置顶后</td>
                          </tr>
                        ) : null}
                        </Fragment>
                      );
                    })}

                    {stockDisplayRows.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="table-empty-cell">
                          {stocksLoading
                            ? '股票数据加载中...'
                            : stocksError || '暂无股票持仓，点击右上角搜索添加股票'}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            ) : null}

            {activeTab === 'funds' ? (
              <div className="table-panel">
                <table className="data-table fund-table">
                  <thead>
                    <tr>
                      <th>基金名称</th>
                      <th>
                        <span className="stacked-th">
                          <span>持仓净值</span>
                          <span>估算净值</span>
                        </span>
                      </th>
                      <th>持有额</th>
                      <th>持有收益</th>
                      <th>持有收益率</th>
                      <th>涨跌幅</th>
                      <th>估算收益</th>
                      <th>更新时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fundDisplayRows.map((item) => {
                      const isLockedPinned = sortingMode === 'funds' && item.code === fundPinnedCode;
                      const hasFundCost = item.cost > 0;
                      const hasFundUnits = item.units > 0;
                      return (
                      <Fragment key={item.code}>
                      <tr
                        onContextMenu={(event) => openRowContextMenu(event, 'fund', item.code)}
                        className={[
                          sortingMode === 'funds' ? 'sorting-row' : '',
                          draggingCode === item.code ? 'dragging-row' : '',
                          isLockedPinned ? 'locked-row' : '',
                        ].filter(Boolean).join(' ')}
                        draggable={sortingMode === 'funds' && !isLockedPinned}
                        onDragStart={() => handleDragStart(item.code)}
                        onDragEnd={handleDragEnd}
                        onDragOver={(event) => {
                          if (sortingMode === 'funds') event.preventDefault();
                        }}
                        onDrop={() => handleFundDrop(item.code)}
                      >
                        <td className={`name-col fund-detail-trigger ${item.special ? 'special-row' : ''}`}>
                          <span
                            className="primary"
                            title={item.name}
                            onClick={() => {
                              if (sortingMode === 'funds') return;
                              openFundDetail(item);
                            }}
                            role="button"
                            tabIndex={sortingMode === 'funds' ? -1 : 0}
                            onKeyDown={(e) => {
                              if (sortingMode === 'funds') return;
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                openFundDetail(item);
                              }
                            }}
                          >
                            <span className="name-inline">
                              {sortingMode === 'funds' ? (
                                <span className={`drag-handle ${isLockedPinned ? 'disabled' : ''}`}>
                                  <GripVertical size={12} />
                                </span>
                              ) : null}
                              {item.navDisclosedToday ? (
                                <span
                                  className="fund-disclosed-check"
                                  aria-label="当日净值已披露"
                                  title={`当日净值已披露${item.navDate ? `：${item.navDate}` : ''}`}
                                >
                                  ✓
                                </span>
                              ) : null}
                              {item.special ? <Star size={10} className="special-star-icon" aria-hidden="true" /> : null}
                              <span className="name-text">{item.name}</span>
                              {item.pinned ? <Pin size={10} className="pinned-flag" /> : null}
                            </span>
                          </span>
                          <span className="secondary">{item.code}</span>
                        </td>
                        <td className="dual-value price-cell">
                          {editingCell?.kind === 'fund' && editingCell.code === item.code && editingCell.field === 'cost' ? (
                            <input
                              className="inline-edit-input inline-edit-compact"
                              value={editingCell.value}
                              placeholder="输入持仓净值"
                              onChange={(e) => updateEditingValue(e.target.value)}
                              onBlur={finishEditing}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  finishEditing();
                                } else if (e.key === 'Escape') {
                                  cancelEditing();
                                }
                              }}
                              autoFocus
                            />
                          ) : (
                            <span
                              className={hasFundCost ? 'cost-line editable-trigger' : 'editable-trigger placeholder-hint'}
                              onClick={(e) => {
                                e.stopPropagation();
                                startEditing('fund', item.code, 'cost');
                              }}
                            >
                              {hasFundCost ? formatLooseNumber(item.cost, 4) : '输入持仓净值'}
                            </span>
                          )}
                          <span className="price-line">
                            {Number.isFinite(item.estimatedNav) ? item.estimatedNav.toFixed(4) : '-'}
                          </span>
                        </td>
                        <td>
                          {editingCell?.kind === 'fund' && editingCell.code === item.code && editingCell.field === 'units' ? (
                            <input
                              className="inline-edit-input inline-edit-compact"
                              value={editingCell.value}
                              placeholder="输入持有额"
                              onChange={(e) => updateEditingValue(e.target.value)}
                              onBlur={finishEditing}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  finishEditing();
                                } else if (e.key === 'Escape') {
                                  cancelEditing();
                                }
                              }}
                              autoFocus
                            />
                          ) : (
                            <span
                              className={hasFundUnits ? 'editable-trigger' : 'editable-trigger placeholder-hint'}
                              onClick={(e) => {
                                e.stopPropagation();
                                startEditing('fund', item.code, 'units');
                              }}
                            >
                              {hasFundUnits ? formatLooseNumber(item.units, 4) : '输入持有额'}
                            </span>
                          )}
                        </td>
                        <td className={toneClass(item.holdingProfit)}>{formatNumber(item.holdingProfit, 2)}</td>
                        <td className={toneClass(item.holdingProfitRate)}>{formatPercent(item.holdingProfitRate)}</td>
                        <td className={toneClass(item.changePct)}>{formatPercent(item.changePct)}</td>
                        <td className={toneClass(item.estimatedProfit)}>{formatNumber(item.estimatedProfit, 2)}</td>
                        <td>{item.updatedAt}</td>
                      </tr>
                      {sortingMode === 'funds' && isLockedPinned ? (
                        <tr
                          className={`sort-insert-row ${draggingCode ? 'active' : ''}`}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={handleFundDropAfterPinned}
                        >
                          <td colSpan={8}>拖到这里可排到置顶后</td>
                        </tr>
                      ) : null}
                      </Fragment>
                    )})}

                    {fundsLoading && fundPositions.length === 0 ? (
                      <>
                        <tr className="skeleton-row">
                          <td className="skeleton-cell"><div className="skeleton-bar medium" /></td>
                          <td className="skeleton-cell"><div className="skeleton-bar short" /></td>
                          <td className="skeleton-cell"><div className="skeleton-bar" /></td>
                          <td className="skeleton-cell"><div className="skeleton-bar short" /></td>
                          <td className="skeleton-cell"><div className="skeleton-bar short" /></td>
                          <td className="skeleton-cell"><div className="skeleton-bar short" /></td>
                          <td className="skeleton-cell"><div className="skeleton-bar short" /></td>
                          <td className="skeleton-cell"><div className="skeleton-bar short" /></td>
                        </tr>
                        <tr className="skeleton-row">
                          <td className="skeleton-cell"><div className="skeleton-bar medium" /></td>
                          <td className="skeleton-cell"><div className="skeleton-bar short" /></td>
                          <td className="skeleton-cell"><div className="skeleton-bar" /></td>
                          <td className="skeleton-cell"><div className="skeleton-bar short" /></td>
                          <td className="skeleton-cell"><div className="skeleton-bar short" /></td>
                          <td className="skeleton-cell"><div className="skeleton-bar short" /></td>
                          <td className="skeleton-cell"><div className="skeleton-bar short" /></td>
                          <td className="skeleton-cell"><div className="skeleton-bar short" /></td>
                        </tr>
                      </>
                    ) : fundDisplayRows.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="table-empty-cell">
                          {fundsError || '暂无基金持仓，点击右上角搜索添加基金'}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>
        </main>

        {indexDetailTarget ? (
          <IndexDetailModal
            code={indexDetailTarget.code}
            fallbackLabel={indexDetailTarget.label}
            onClose={() => setIndexDetailTarget(null)}
          />
        ) : null}

        {rowContextMenu ? (
          <div
            className="row-context-menu"
            style={{ left: rowContextMenu.x, top: rowContextMenu.y }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            {rowContextMenu.kind === 'stock' ? (
              <>
                <button type="button" onClick={() => toggleStockPinned(rowContextMenu.code)}>
                  {stockHoldings.find((item) => item.code === rowContextMenu.code)?.pinned ? '取消置顶' : '钉住置顶'}
                </button>
                <button type="button" onClick={() => toggleStockSpecial(rowContextMenu.code)}>
                  {stockHoldings.find((item) => item.code === rowContextMenu.code)?.special ? '取消特别关注' : '特别关注'}
                </button>
                <button type="button" onClick={() => beginSorting('stocks')}>
                  指定排序
                </button>
                <button type="button" className="danger" onClick={() => removeStockFromPortfolio(rowContextMenu.code)}>
                  移出自选
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => toggleFundPinned(rowContextMenu.code)}>
                  {fundHoldings.find((item) => item.code === rowContextMenu.code)?.pinned ? '取消置顶' : '钉住置顶'}
                </button>
                <button type="button" onClick={() => toggleFundSpecial(rowContextMenu.code)}>
                  {fundHoldings.find((item) => item.code === rowContextMenu.code)?.special ? '取消特别关注' : '特别关注'}
                </button>
                <button type="button" onClick={() => beginSorting('funds')}>
                  指定排序
                </button>
                <button type="button" className="danger" onClick={() => removeFundFromPortfolio(rowContextMenu.code)}>
                  移出自选
                </button>
              </>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
