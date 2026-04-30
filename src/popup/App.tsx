import { Component, Fragment, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, Bell, FileText, GripVertical, Moon, PieChart, Pin, RefreshCw, Search, Settings, Star, Sun, WalletCards, X } from 'lucide-react';
import StockDetailView from './StockDetailView';
import IndexDetailModal from './IndexDetailModal';
import FundDetailView from './FundDetailView';
import DiagnosticPanel from './DiagnosticPanel';
import TagBadge from './TagBadge';
import TagFilterBar from './TagFilterBar';
import TagEditor from './TagEditor';
import DemoGuide, { loadDemoFlag } from './DemoGuide';
import {
  loadTradeHistory,
  computePositionFromTrades,
  type StockTradeRecord,
} from '../shared/trade-history';
import {
  loadTagConfig,
  saveTagConfig,
  type TagConfig,
  type TagDefinition,
} from '../shared/tags';
import {
  fetchBatchStockQuotes,
  fetchStockIntraday,
  fetchTiantianFundPosition,
  normalizeStockCode,
  normalizeFundCode,
  getShanghaiToday,
  toNumber,
  fetchMarketStats,
  pMap,
  isTradingHours,
  type StockHoldingConfig,
  type FundHoldingConfig,
  type StockPosition,
  type FundPosition,
  type MarketIndexQuote,
  type MarketStats,
  MARKET_INDEXES,
} from '../shared/fetch';
const BADGE_STORAGE_KEY = 'badgeConfig';

type PageTab = 'stocks' | 'funds' | 'account' | 'notifications';
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

type StockRow = StockPosition & {
  pinned: boolean;
  special: boolean;
  tags: string[];
  addedPrice?: number;
  addedAt?: string;
  realizedPnl?: number;
  tradeDerived?: boolean;
};

type FundRow = FundPosition & {
  pinned: boolean;
  special: boolean;
  tags: string[];
  addedNav?: number;
  addedAt?: string;
};

type NotificationRecord = {
  id: string;
  code: string;
  name: string;
  message: string;
  ruleType: string;
  price: number;
  changePct: number;
  firedAt: number;
  read: boolean;
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
const MARKET_STATS_CACHE_KEY = 'marketStats';
const MARKET_STATS_UPDATED_AT_KEY = 'marketStatsUpdatedAt';
const MARKET_STATS_HISTORY_KEY = 'marketStatsHistory';
const STOCK_INTRADAY_DATE_KEY = 'stockIntradayDate';

function formatRelativeTime(timestampMs: number): string {
  const diffMs = Date.now() - timestampMs;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec} 秒前`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} 分钟前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} 小时前`;
  const d = new Date(timestampMs);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

// Render notification message with colored prices and change percentages
function renderNotificationMessage(message: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  // Match patterns: ¥123.45, +1.23%, -1.23%, 上涨至 ¥123.45, 上涨/下跌 1.23%
  const regex = /([¥¥]?\d+\.\d+|\+\d+\.\d+%|-\d+\.\d+%)/g;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(message)) !== null) {
    if (match.index > lastIndex) {
      parts.push(message.slice(lastIndex, match.index));
    }
    const text = match[0];
    // Determine color: negative numbers and percentages = down, positive = up
    if (text.startsWith('-')) {
      parts.push(<span key={match.index} className="down notif-value">{text}</span>);
    } else if (text.startsWith('+') || text.includes('%')) {
      parts.push(<span key={match.index} className="up notif-value">{text}</span>);
    } else {
      parts.push(<span key={match.index} className="notif-value">{text}</span>);
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < message.length) {
    parts.push(message.slice(lastIndex));
  }
  return parts.length > 0 ? parts : message;
}

function getShanghaiDateKey(timestampMs: number): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(timestampMs));

  const year = parts.find((item) => item.type === 'year')?.value ?? '0000';
  const month = parts.find((item) => item.type === 'month')?.value ?? '00';
  const day = parts.find((item) => item.type === 'day')?.value ?? '00';
  return `${year}-${month}-${day}`;
}

function resolvePrevTurnover(
  history: Record<string, number>,
  referenceDate: string,
): number {
  const dates = Object.keys(history)
    .filter((date) => date < referenceDate && Number.isFinite(history[date]))
    .sort();
  if (dates.length === 0) return Number.NaN;
  return history[dates[dates.length - 1]];
}

function deriveMarketStats(
  stats: MarketStats,
  history: Record<string, number>,
  referenceDate: string,
): MarketStats {
  const historyPrev = resolvePrevTurnover(history, referenceDate);
  const prevTurnover = Number.isFinite(stats.prevTurnover) ? stats.prevTurnover : historyPrev;
  const volumeChange = Number.isFinite(stats.volumeChange)
    ? stats.volumeChange
    : Number.isFinite(prevTurnover)
      ? stats.turnover - prevTurnover
    : Number.NaN;

  return {
    ...stats,
    prevTurnover: Number.isFinite(prevTurnover) ? Math.round(prevTurnover * 100) / 100 : Number.NaN,
    volumeChange: Number.isFinite(volumeChange) ? Math.round(volumeChange * 100) / 100 : Number.NaN,
  };
}

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

function formatMarketAmount(value: number): string {
  if (!Number.isFinite(value)) return '--';
  return value >= 10000
    ? `${(value / 10000).toFixed(2)}万亿`
    : `${formatLooseNumber(value, 0)}亿`;
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

// 可拖拽悬浮刷新按钮（相对父容器 .table-panel 定位）
function FloatingRefreshBtn({ onRefresh, spinning }: { onRefresh: () => void; spinning: boolean }) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const dragging = useRef(false);
  const dragOrigin = useRef({ x: 0, y: 0 });
  const posOrigin = useRef({ right: 12, bottom: 12 });
  const [pos, setPos] = useState<{ right: number; bottom: number }>({ right: 12, bottom: 12 });

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    dragOrigin.current = { x: e.clientX, y: e.clientY };
    posOrigin.current = pos;
    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const dx = ev.clientX - dragOrigin.current.x;
      const dy = ev.clientY - dragOrigin.current.y;
      setPos({
        right: Math.max(0, posOrigin.current.right - dx),
        bottom: Math.max(0, posOrigin.current.bottom - dy),
      });
    };
    const onUp = () => {
      dragging.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const handleClick = (e: React.MouseEvent) => {
    if (dragging.current) return;
    e.stopPropagation();
    onRefresh();
  };

  return (
    <button
      ref={btnRef}
      type="button"
      className="floating-refresh-btn"
      style={{ right: pos.right, bottom: pos.bottom }}
      onMouseDown={onMouseDown}
      onClick={handleClick}
      title="刷新数据"
    >
      <RefreshCw size={14} className={spinning ? 'spinning' : ''} />
    </button>
  );
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
      const addedPrice = toNumber((item as StockHoldingConfig)?.addedPrice);
      const addedAt = String((item as StockHoldingConfig)?.addedAt ?? '').trim();
      if (Number.isFinite(addedPrice) && addedPrice > 0) parsed.addedPrice = addedPrice;
      if (addedAt) parsed.addedAt = addedAt;
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
      const addedNav = toNumber((item as FundHoldingConfig)?.addedNav);
      const addedAt = String((item as FundHoldingConfig)?.addedAt ?? '').trim();
      if (Number.isFinite(addedNav) && addedNav > 0) parsed.addedNav = addedNav;
      if (addedAt) parsed.addedAt = addedAt;
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

class DetailErrorBoundary extends Component<{ children: React.ReactNode; onBack: () => void }, { hasError: boolean; errorMessage: string }> {
  constructor(props: { children: React.ReactNode; onBack: () => void }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, errorMessage: error?.message || String(error) };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[DetailErrorBoundary]', error?.message, error?.stack, info?.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, textAlign: 'center', color: '#999' }}>
          <p style={{ marginBottom: 8, fontSize: 14 }}>详情加载异常，请重试</p>
          <p style={{ marginBottom: 12, fontSize: 11, wordBreak: 'break-all', maxWidth: 320, margin: '0 auto 12px' }}>{this.state.errorMessage}</p>
          <button type="button" onClick={this.props.onBack} style={{ padding: '6px 16px', cursor: 'pointer' }}>
            返回列表
          </button>
          <button type="button" onClick={() => this.setState({ hasError: false, errorMessage: '' })} style={{ padding: '6px 16px', cursor: 'pointer', marginLeft: 8 }}>
            重试
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const CHART_WIDTH = 280;
const CHART_HEIGHT = 50;
const CHART_PAD_TOP = 4;
const CHART_PAD_RIGHT = 4;
const CHART_PAD_BOTTOM = 4;
const CHART_PAD_LEFT = 4;
const CHART_INNER_W = CHART_WIDTH - CHART_PAD_LEFT - CHART_PAD_RIGHT;
const CHART_INNER_H = CHART_HEIGHT - CHART_PAD_TOP - CHART_PAD_BOTTOM;

const IntradayChart = memo(function IntradayChart({
  data,
  prevClose,
  intradayPrevClose,
  changePct,
}: {
  data: Array<{ time: string; price: number }>;
  prevClose?: number;
  intradayPrevClose?: number;
  changePct?: number;
}) {
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

    const toX = (mi: number) => CHART_PAD_LEFT + (mi / TRADING_MINUTES) * CHART_INNER_W;
    const toY = (price: number) => {
      const normalized = (price - displayMin) / displayRange;
      return CHART_PAD_TOP + (1 - normalized) * CHART_INNER_H;
    };

    // Build continuous segments (split at lunch break gaps)
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

    // Pre-compute all SVG sub-segments
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

    return { baselineY, subSegments };
  }, [data, prevClose, intradayPrevClose]);

  if (!pathInfo) {
    // 无分时数据时，用涨跌幅画一个简易涨跌条
    if (Number.isFinite(changePct)) {
      const w = Math.min(Math.abs(changePct!) / 10, 1) * 36;
      const fill = changePct! >= 0 ? '#ff5e57' : '#1fc66d';
      return (
        <svg className="intraday-chart" viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} preserveAspectRatio="none">
          <rect x={CHART_WIDTH / 2 - w / 2} y={CHART_HEIGHT / 2 - 4} width={Math.max(w, 4)} height={8} rx={2} fill={fill} opacity={0.6} />
        </svg>
      );
    }
    return <div className="intraday-chart-empty" style={{ fontSize: 9, color: 'var(--text-2)', opacity: 0.5 }}>-</div>;
  }

  return (
    <svg
      className="intraday-chart"
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      preserveAspectRatio="none"
    >
      <line
        x1={CHART_PAD_LEFT}
        x2={CHART_WIDTH - CHART_PAD_RIGHT}
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

  // ---- Market Stats (trading hours only) ----
  const [marketStats, setMarketStats] = useState<MarketStats | null>(null);
  const marketStatsHistoryRef = useRef<Record<string, number>>({});

  // ---- Notification Panel ----
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [panelOpacity, setPanelOpacity] = useState(1.0);
  const [notifSubTab, setNotifSubTab] = useState<'tech-report' | 'alerts'>('alerts');
  const [techReportStatus, setTechReportStatus] = useState<{
    enabled: boolean; lastRunDate: string; lastRunTime: number; nextRunTime: number;
    status: string; stockCount: number; signalCount: number; details: string; errorMessage: string;
  } | 'loading'>('loading');
  const [techReportDetail, setTechReportDetail] = useState<{ name: string; message: string; firedAt: number } | null>(null);
  const [signalStocks, setSignalStocks] = useState<Record<string, { name: string; signalCount: number }> | null>(null);

  useEffect(() => {
    // Load notifications and work mode config
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get(['notificationHistory'], (result: Record<string, unknown>) => {
        const history = (Array.isArray(result.notificationHistory) ? result.notificationHistory : []) as NotificationRecord[];
        setNotifications(history.sort((a, b) => b.firedAt - a.firedAt));
      });
    }

    if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
      chrome.storage.sync.get(['workModeConfig'], (result: Record<string, unknown>) => {
        const wm = result['workModeConfig'] as { panelOpacity?: number } | undefined;
        if (wm?.panelOpacity != null) setPanelOpacity(wm.panelOpacity);
      });
    }

    // Listen for storage changes
    const listener = (changes: Record<string, { newValue?: unknown }>, area: string) => {
      if (area === 'local' && changes['notificationHistory']) {
        const history = (Array.isArray(changes['notificationHistory'].newValue) ? changes['notificationHistory'].newValue : []) as NotificationRecord[];
        setNotifications(history.sort((a, b) => b.firedAt - a.firedAt));
      }
    };
    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
      chrome.storage.onChanged.addListener(listener);
    }
    return () => {
      if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
        chrome.storage.onChanged.removeListener(listener);
      }
    };
  }, []);

  // ---- Tech Report Status ----
  useEffect(() => {
    const loadStatus = () => {
      if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
      // 直接从 storage 读取，不依赖 background 消息
      chrome.storage.local.get(['technicalReportStatus', 'techReportSignalStocks']).then((result) => {
        const s = result.technicalReportStatus as typeof techReportStatus;
        if (s && s !== 'loading') setTechReportStatus(s);
        const ss = result.techReportSignalStocks as { date: string; stocks: Record<string, { name: string; signalCount: number }> } | undefined;
        if (ss) {
          // 仅当日有效
          const todayStr = new Date().toLocaleDateString('en-CA');
          setSignalStocks(ss.date === todayStr ? ss.stocks : null);
        }
      }).catch(() => { /* ignore */ });
    };
    loadStatus();
    // 也监听 storage 变化
    const listener = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (changes.technicalReportStatus) {
        const s = changes.technicalReportStatus.newValue as typeof techReportStatus;
        if (s && s !== 'loading') setTechReportStatus(s);
      }
      if (changes.techReportSignalStocks) {
        const ss = changes.techReportSignalStocks.newValue as { date: string; stocks: Record<string, { name: string; signalCount: number }> } | undefined;
        if (ss) {
          const todayStr = new Date().toLocaleDateString('en-CA');
          setSignalStocks(ss.date === todayStr ? ss.stocks : null);
        }
      }
    };
    chrome.storage.onChanged.addListener(listener);
    const timer = window.setInterval(loadStatus, 30_000);
    return () => {
      window.clearInterval(timer);
      chrome.storage.onChanged.removeListener(listener);
    };
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAllRead = useCallback(() => {
    const updated = notifications.map((n) => ({ ...n, read: true }));
    setNotifications(updated);
    chrome.storage.local.set({ notificationHistory: updated });
  }, [notifications]);

  const markNotificationRead = useCallback((id: string) => {
    setNotifications((prev) => {
      const updated = prev.map((n) => n.id === id ? { ...n, read: true } : n);
      chrome.storage.local.set({ notificationHistory: updated });
      return updated;
    });
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
    chrome.storage.local.set({ notificationHistory: [] });
  }, []);

  const deleteNotification = useCallback((id: string) => {
    setNotifications((prev) => {
      const updated = prev.filter((n) => n.id !== id);
      chrome.storage.local.set({ notificationHistory: updated });
      return updated;
    });
  }, []);

  const [stockHoldings, setStockHoldings] = useState<StockHoldingConfig[]>([]);
  const [fundHoldings, setFundHoldings] = useState<FundHoldingConfig[]>([]);
  const [portfolioReady, setPortfolioReady] = useState(false);
  const [showDemo, setShowDemo] = useState(false);
  const [refreshSig, setRefreshSig] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

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

  // 标签系统
  const [tagConfig, setTagConfig] = useState<TagConfig>({ tags: [] });
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [tagEditorTarget, setTagEditorTarget] = useState<{ kind: 'stock' | 'fund'; code: string } | null>(null);
  const [stockTradeHistory, setStockTradeHistory] = useState<Record<string, StockTradeRecord[]>>({});

  const popupRootRef = useRef<HTMLDivElement | null>(null);
  const searchWrapRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const scrollPosRef = useRef(0);

  const stockMetrics = useMemo(() => {
    const totalMarketValue = stockPositions.reduce((sum, item) => {
      if (!Number.isFinite(item.price) || item.shares <= 0) return sum;
      return sum + item.price * item.shares;
    }, 0);

    // 合并浮动盈亏和已实现盈亏：有交易记录的用交易推导，否则用原始浮动盈亏
    let totalPnl = 0;
    for (const pos of stockPositions) {
      if (!Number.isFinite(pos.price)) continue;
      const trades = stockTradeHistory[pos.code];
      if (trades && trades.length > 0) {
        const computed = computePositionFromTrades(trades);
        if (computed.shares > 0) {
          totalPnl += (pos.price - computed.avgCost) * computed.shares;
        }
        totalPnl += computed.realizedPnl;
      } else if (Number.isFinite(pos.floatingPnl)) {
        totalPnl += pos.floatingPnl;
      }
    }

    const daily = stockPositions.reduce((sum, item) => {
      if (!Number.isFinite(item.dailyPnl)) return sum;
      return sum + item.dailyPnl;
    }, 0);

    return [
      { label: '总市值', value: formatNumber(totalMarketValue, 2), tone: 'neutral' },
      { label: '总盈亏', value: formatNumber(totalPnl, 1), tone: toneClass(totalPnl) },
      { label: '当日盈亏', value: formatNumber(daily, 1), tone: toneClass(daily) },
    ] as const;
  }, [stockPositions, stockTradeHistory]);

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

    // 股票总盈亏（含已实现）
    let stockTotalPnl = 0;
    for (const pos of stockPositions) {
      if (!Number.isFinite(pos.price)) continue;
      const trades = stockTradeHistory[pos.code];
      if (trades && trades.length > 0) {
        const computed = computePositionFromTrades(trades);
        if (computed.shares > 0) {
          stockTotalPnl += (pos.price - computed.avgCost) * computed.shares;
        }
        stockTotalPnl += computed.realizedPnl;
      } else if (Number.isFinite(pos.floatingPnl)) {
        stockTotalPnl += pos.floatingPnl;
      }
    }

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
    const totalHoldingProfit = stockTotalPnl + fundHoldingProfit;
    const previewProfit = stockDaily + fundEstimated;

    return [
      { label: '综合持仓收益', value: formatNumber(totalHoldingProfit, 2), tone: toneClass(totalHoldingProfit) },
      { label: '综合预估收益', value: formatNumber(previewProfit, 2), tone: toneClass(previewProfit) },
      { label: '股票当日盈亏', value: formatNumber(stockDaily, 2), tone: toneClass(stockDaily) },
    ] as const;
  }, [fundPositions, stockPositions, stockTradeHistory]);

  const metrics = activeTab === 'stocks'
    ? stockMetrics
    : activeTab === 'funds'
      ? fundMetrics
      : accountMetrics;

  const accountSnapshot = useMemo(() => {
    const average = (values: number[]): number => {
      if (values.length === 0) return Number.NaN;
      return values.reduce((sum, value) => sum + value, 0) / values.length;
    };

    const heldStockCount = stockHoldings.filter((item) => item.shares > 0).length;
    const watchStockCount = stockHoldings.filter((item) => item.shares <= 0).length;
    const heldFundCount = fundHoldings.filter((item) => item.units > 0).length;
    const watchFundCount = fundHoldings.filter((item) => item.units <= 0).length;

    const stockPositionMap = new Map(stockPositions.map((item) => [item.code, item]));
    const fundPositionMap = new Map(fundPositions.map((item) => [item.code, item]));

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

    const stockSinceAddedRates = stockHoldings
      .map((holding) => {
        const entryPrice = Number(holding.addedPrice);
        const currentPrice = Number(stockPositionMap.get(holding.code)?.price);
        if (!Number.isFinite(entryPrice) || entryPrice <= 0) return Number.NaN;
        if (!Number.isFinite(currentPrice)) return Number.NaN;
        return ((currentPrice - entryPrice) / entryPrice) * 100;
      })
      .filter((value) => Number.isFinite(value));

    const fundSinceAddedRates = fundHoldings
      .map((holding) => {
        const entryNav = Number(holding.addedNav);
        const position = fundPositionMap.get(holding.code);
        if (!position) return Number.NaN;
        if (!Number.isFinite(entryNav) || entryNav <= 0) return Number.NaN;
        const currentNav = position.navDisclosedToday && Number.isFinite(position.latestNav)
          ? position.latestNav
          : (Number.isFinite(position.estimatedNav) ? position.estimatedNav : position.latestNav);
        if (!Number.isFinite(currentNav)) return Number.NaN;
        return ((currentNav - entryNav) / entryNav) * 100;
      })
      .filter((value) => Number.isFinite(value));

    const stockSinceAddedRate = average(stockSinceAddedRates);
    const fundSinceAddedRate = average(fundSinceAddedRates);
    const totalSinceAddedRate = average([...stockSinceAddedRates, ...fundSinceAddedRates]);

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
      stockSinceAddedRate,
      fundSinceAddedRate,
      totalSinceAddedRate,
    };
  }, [fundHoldings, fundPositions, stockHoldings, stockPositions]);
  const stockPinnedCode = stockHoldings.find((item) => item.pinned)?.code ?? null;
  const fundPinnedCode = fundHoldings.find((item) => item.pinned)?.code ?? null;
  const stockRows = useMemo<StockRow[]>(() => {
    const positionMap = new Map(stockPositions.map((item) => [item.code, item]));
    const rows: StockRow[] = [];
    for (const holding of stockHoldings) {
      const row = positionMap.get(holding.code);
      if (!row) continue;
      const next: StockRow = {
        ...row,
        pinned: Boolean(holding.pinned),
        special: Boolean(holding.special),
        tags: Array.isArray(holding.tags) ? holding.tags.slice(0, 5) : [],
      };
      if (Number.isFinite(holding.addedPrice) && (holding.addedPrice as number) > 0) {
        next.addedPrice = holding.addedPrice;
      }
      if (holding.addedAt) {
        next.addedAt = holding.addedAt;
      }

      // If trade history exists, derive shares/cost from trades
      const trades = stockTradeHistory[holding.code];
      if (trades && trades.length > 0) {
        const computed = computePositionFromTrades(trades);
        const avgCost = computed.avgCost;
        const totalShares = computed.shares;
        next.shares = totalShares;
        next.cost = avgCost;
        next.floatingPnl = Number.isFinite(next.price) && totalShares > 0
          ? (next.price - avgCost) * totalShares
          : Number.NaN;
        next.realizedPnl = computed.realizedPnl;
        next.tradeDerived = true;
      }

      rows.push(next);
    }
    return rows;
  }, [stockHoldings, stockPositions, stockTradeHistory]);

  const fundRows = useMemo<FundRow[]>(() => {
    const positionMap = new Map(fundPositions.map((item) => [item.code, item]));
    const rows: FundRow[] = [];
    for (const holding of fundHoldings) {
      const row = positionMap.get(holding.code);
      if (!row) continue;
      const next: FundRow = {
        ...row,
        pinned: Boolean(holding.pinned),
        special: Boolean(holding.special),
        tags: Array.isArray(holding.tags) ? holding.tags.slice(0, 5) : [],
      };
      if (Number.isFinite(holding.addedNav) && (holding.addedNav as number) > 0) {
        next.addedNav = holding.addedNav;
      }
      if (holding.addedAt) {
        next.addedAt = holding.addedAt;
      }
      rows.push(next);
    }
    return rows;
  }, [fundHoldings, fundPositions]);

  // 统一的股票名称映射：优先用 stockPositions（API 返回的数据，name 字段必填），
  // 再用 stockHoldings 中的 name 作为补充，确保所有地方都能正确显示股票名称
  const stockNameMap = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const pos of stockPositions) {
      if (pos.name) map[pos.code] = pos.name;
    }
    for (const h of stockHoldings) {
      if (h.name) map[h.code] = h.name;
    }
    return map;
  }, [stockPositions, stockHoldings]);

  const stockDisplayRows = useMemo(() => {
    let rows = sortingMode === 'stocks' && stockSortDraft
      ? sortRowsByCodes(stockRows, stockSortDraft)
      : stockRows;
    if (tagFilter.length > 0) {
      rows = rows.filter(r => r.tags.some(t => tagFilter.includes(t)));
    }
    return rows;
  }, [sortingMode, stockRows, stockSortDraft, tagFilter]);


  const fundDisplayRows = useMemo(() => {
    let rows = sortingMode === 'funds' && fundSortDraft
      ? sortRowsByCodes(fundRows, fundSortDraft)
      : fundRows;
    if (tagFilter.length > 0) {
      rows = rows.filter(r => r.tags.some(t => tagFilter.includes(t)));
    }
    return rows;
  }, [fundRows, fundSortDraft, sortingMode, tagFilter]);

  const stockTotalHoldingAmount = useMemo(() => (
    stockDisplayRows.reduce((sum, item) => {
      if (!Number.isFinite(item.price) || item.shares <= 0) return sum;
      return sum + item.price * item.shares;
    }, 0)
  ), [stockDisplayRows]);

  // Backfill entry snapshot for existing watchlist items that were added before this feature.
  useEffect(() => {
    if (!portfolioReady || stockHoldings.length === 0 || stockPositions.length === 0) return;
    const priceMap = new Map(stockPositions.map((item) => [item.code, item.price]));
    const now = new Date().toISOString();
    let changed = false;

    const next = stockHoldings.map((holding) => {
      if (Number.isFinite(holding.addedPrice) && (holding.addedPrice as number) > 0) return holding;
      const price = Number(priceMap.get(holding.code));
      if (!Number.isFinite(price) || price <= 0) return holding;
      changed = true;
      return {
        ...holding,
        addedPrice: Math.round(price * 1000) / 1000,
        addedAt: holding.addedAt || now,
      };
    });

    if (changed) {
      setStockHoldings(next);
    }
  }, [portfolioReady, stockHoldings, stockPositions]);

  useEffect(() => {
    if (!portfolioReady || fundHoldings.length === 0 || fundPositions.length === 0) return;
    const fundMap = new Map(fundPositions.map((item) => [item.code, item]));
    const now = new Date().toISOString();
    let changed = false;

    const next = fundHoldings.map((holding) => {
      if (Number.isFinite(holding.addedNav) && (holding.addedNav as number) > 0) return holding;
      const position = fundMap.get(holding.code);
      if (!position) return holding;
      const currentNav = position.navDisclosedToday && Number.isFinite(position.latestNav)
        ? position.latestNav
        : (Number.isFinite(position.estimatedNav) ? position.estimatedNav : position.latestNav);
      if (!Number.isFinite(currentNav) || currentNav <= 0) return holding;
      changed = true;
      return {
        ...holding,
        addedNav: Math.round(currentNav * 10000) / 10000,
        addedAt: holding.addedAt || now,
      };
    });

    if (changed) {
      setFundHoldings(next);
    }
  }, [portfolioReady, fundHoldings, fundPositions]);

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

    loadTagConfig().then((cfg) => {
      if (!mounted) return;
      setTagConfig(cfg);
    });

    loadTradeHistory().then((history) => {
      if (!mounted) return;
      setStockTradeHistory(history);
    });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    loadDemoFlag().then((completed) => {
      if (mounted && !completed) {
        setShowDemo(true);
      }
    });
    return () => { mounted = false; };
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
          combinedPnl: stockDaily + fundEstimatedProfit,
        },
      });
    }
  }, [portfolioReady, badgeConfig, stockPositions, fundPositions, stockHoldings, fundHoldings]);

  // ---- Market Stats: always visible, refresh only during trading hours ----
  // 非交易时段保留最后一次获取的数据，不刷新
  useEffect(() => {
    let cancelled = false;
    const cacheKey = MARKET_STATS_CACHE_KEY;
    const historyKey = MARKET_STATS_HISTORY_KEY;
    const updatedAtKey = MARKET_STATS_UPDATED_AT_KEY;

    void (async () => {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        const result = await chrome.storage.local.get([cacheKey, historyKey, updatedAtKey]);
        const cached = result[cacheKey] as MarketStats | undefined;
        const history = (result[historyKey] as Record<string, number> | undefined) ?? {};
        const updatedAt = result[updatedAtKey];
        if (cached && Number.isFinite(cached.turnover) && typeof updatedAt === 'string' && updatedAt) {
          const updatedAtMs = Date.parse(updatedAt);
          if (Number.isFinite(updatedAtMs)) {
            history[getShanghaiDateKey(updatedAtMs)] = cached.turnover;
          }
        }
        marketStatsHistoryRef.current = history;
        if (!cancelled && cached && Number.isFinite(cached.turnover)) {
          setMarketStats(deriveMarketStats(cached, history, getShanghaiToday()));
        }
      }
    })();

    const fetchOnce = async () => {
      const stats = await fetchMarketStats();
      if (!cancelled && stats) {
        const today = getShanghaiToday();
        const history = marketStatsHistoryRef.current;
        const displayStats = deriveMarketStats(stats, history, today);
        history[today] = stats.turnover;
        marketStatsHistoryRef.current = history;
        setMarketStats(displayStats);
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
          void chrome.storage.local.set({
            [cacheKey]: stats,
            [historyKey]: history,
            [updatedAtKey]: new Date().toISOString(),
          });
        }
      }
    };

    // 首次加载：始终尝试获取一次，避免缓存缺失时直接空白
    const initialFetch = async () => {
      const stats = await fetchMarketStats();
      if (!cancelled && stats) {
        const today = getShanghaiToday();
        const history = marketStatsHistoryRef.current;
        const displayStats = deriveMarketStats(stats, history, today);
        history[today] = stats.turnover;
        marketStatsHistoryRef.current = history;
        setMarketStats(displayStats);
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
          void chrome.storage.local.set({
            [cacheKey]: stats,
            [historyKey]: history,
            [updatedAtKey]: new Date().toISOString(),
          });
        }
      }
    };
    void initialFetch();

    // 读取刷新间隔配置
    let refreshSeconds = 30;
    if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
      chrome.storage.sync.get('refreshConfig', (result: Record<string, unknown>) => {
        const config = result['refreshConfig'] as { marketStatsRefreshSeconds?: number } | undefined;
        if (config?.marketStatsRefreshSeconds) {
          refreshSeconds = config.marketStatsRefreshSeconds;
        }
      });
    }

    // 定时刷新
    const timer = setInterval(() => {
      void fetchOnce();
    }, refreshSeconds * 1000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  // 打开设置页
  const openSettings = () => {
    chrome.runtime.openOptionsPage();
  };

  // Normalize intraday data from old format (array) to new format ({ data, prevClose })
function normalizeIntraday(intraday: unknown): { data: Array<{ time: string; price: number }>; prevClose: number } {
  if (!intraday) return { data: [], prevClose: Number.NaN };
  // New format
  if (typeof intraday === 'object' && 'data' in intraday && 'prevClose' in intraday) {
    return intraday as { data: Array<{ time: string; price: number }>; prevClose: number };
  }
  // Old format (array)
  if (Array.isArray(intraday)) {
    return { data: intraday, prevClose: Number.NaN };
  }
  return { data: [], prevClose: Number.NaN };
}

function clearIntradayIfStale(
  rows: StockPosition[],
  intradayDate: string | null | undefined,
): StockPosition[] {
  const today = getShanghaiToday();
  if (intradayDate === today) return rows;
  return rows.map((row) => ({
    ...row,
    intraday: { data: [], prevClose: Number.NaN },
  }));
}

// ---- 从 storage.local 读取后台缓存数据 ----
  useEffect(() => {
    // 初始加载
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get(['stockPositions', 'fundPositions', 'indexPositions', STOCK_INTRADAY_DATE_KEY], (result: Record<string, unknown>) => {
        if (Array.isArray(result.stockPositions)) {
          const normalizedRows = (result.stockPositions as StockPosition[]).map((p) => ({
            ...p,
            intraday: normalizeIntraday((p as unknown as { intraday: unknown }).intraday),
          }));
          const intradayDate = typeof result[STOCK_INTRADAY_DATE_KEY] === 'string'
            ? (result[STOCK_INTRADAY_DATE_KEY] as string)
            : null;
          setStockPositions(clearIntradayIfStale(normalizedRows, intradayDate));
        }
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
      if (changes.stockPositions?.newValue) {
        const normalizedRows = (changes.stockPositions.newValue as StockPosition[]).map((p) => ({
          ...p,
          intraday: normalizeIntraday((p as unknown as { intraday: unknown }).intraday),
        }));
        const intradayDate = typeof changes[STOCK_INTRADAY_DATE_KEY]?.newValue === 'string'
          ? (changes[STOCK_INTRADAY_DATE_KEY].newValue as string)
          : getShanghaiToday();
        setStockPositions(clearIntradayIfStale(normalizedRows, intradayDate));
      }
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

  // ---- Keepalive port + 打开时检查版本更新 ----
  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.connect) {
      const port = chrome.runtime.connect({ name: 'keepalive' });
      if (chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({ type: 'check-update' }).catch(() => undefined);
      }
      return () => port.disconnect();
    }
  }, []);

  // 首次加载：先读 storage 缓存，缺失的才手动请求
  useEffect(() => {
    if (!portfolioReady) return;
    if (stockHoldings.length === 0) {
      setStockPositions([]);
      setStocksError('');
      setStocksLoading(false);
      return;
    }

    let cancelled = false;
    const init = async () => {
      setStocksLoading(true);
      try {
        // 先读 storage 缓存，避免重复请求后台已有的数据
        let cached: StockPosition[] = [];
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
          const stored = await new Promise<Record<string, unknown>>((resolve) =>
            chrome.storage.local.get(['stockPositions', STOCK_INTRADAY_DATE_KEY], resolve),
          );
          if (!cancelled && Array.isArray(stored.stockPositions)) {
            const intradayDate = typeof stored[STOCK_INTRADAY_DATE_KEY] === 'string'
              ? (stored[STOCK_INTRADAY_DATE_KEY] as string)
              : null;
            const normalized = (stored.stockPositions as StockPosition[]).map((p) => ({
              ...p,
              intraday: normalizeIntraday((p as unknown as { intraday: unknown }).intraday),
            }));
            cached = clearIntradayIfStale(normalized, intradayDate);
            setStockPositions(cached);
          }
        }

        if (cancelled) return;

        const normalizedHoldings = stockHoldings
          .map((holding) => normalizeStockCode(holding.code))
          .filter(Boolean);

        // 基于 storage 数据检查缺口
        const positionCodes = new Set(cached.map((p) => p.code));
        const missingHoldings = stockHoldings.filter((h) => !positionCodes.has(h.code));
        const intradayMissingCodes = normalizedHoldings.filter((code) => {
          const position = cached.find((row) => row.code === code);
          if (!position) return true;
          const intradayData = position.intraday?.data;
          return !Array.isArray(intradayData) || intradayData.length === 0;
        });

        if (missingHoldings.length === 0 && intradayMissingCodes.length === 0) {
          setStocksLoading(false);
          return;
        }

        const { fetchBatchStockQuotes, fetchStockIntraday, pMap } = await import('../shared/fetch');

        if (!cancelled && missingHoldings.length > 0) {
          const newRows = await fetchBatchStockQuotes(missingHoldings);
          if (!cancelled) {
            setStockPositions((prev) => {
              const existingCodes = new Set(prev.map((p) => p.code));
              const appended = [...prev];
              for (const row of newRows) {
                if (!existingCodes.has(row.code)) {
                  appended.push(row);
                }
              }
              return appended;
            });
          }
        }

        if (!cancelled && intradayMissingCodes.length > 0) {
          const intradayResults = await pMap(
            intradayMissingCodes,
            async (code) => {
              try {
                const result = await fetchStockIntraday(code);
                return { code, data: result.data, prevClose: result.prevClose };
              } catch {
                console.warn('[StockIntraday] fetch failed after retry:', code);
                return { code, data: [] as Array<{ time: string; price: number }>, prevClose: Number.NaN };
              }
            },
            3,
          );

          if (!cancelled) {
            const validResults = intradayResults.filter((r) => r.data.length > 0);
            if (validResults.length > 0) {
              setStockPositions((prev) =>
                prev.map((p) => {
                  const found = validResults.find((r) => r.code === p.code);
                  return found ? { ...p, intraday: { data: found.data, prevClose: found.prevClose } } : p;
                }),
              );

              if (typeof chrome !== 'undefined' && chrome.storage?.local) {
                try {
                  const stored = await chrome.storage.local.get('stockPositions');
                  const existing = (Array.isArray(stored.stockPositions) ? stored.stockPositions : []) as StockPosition[];
                  const updated = existing.map((p) => {
                    const found = validResults.find((r) => r.code === p.code);
                    return found ? { ...p, intraday: { data: found.data, prevClose: found.prevClose } } : p;
                  });
                  await chrome.storage.local.set({ stockPositions: updated });
                } catch {
                  // storage write failure is non-critical
                }
              }
            }
          }
        }

        if (!cancelled) setStocksError('');
      } catch {
        if (!cancelled) setStocksError('股票行情获取失败');
      } finally {
        if (!cancelled) setStocksLoading(false);
      }
    };

    void init();
    return () => { cancelled = true; };
  }, [portfolioReady, stockHoldings, refreshSig]);

  // 交易时段内定时刷新分时数据，确保分时图实时更新
  useEffect(() => {
    if (!portfolioReady || stockPositions.length === 0) return;

    const refreshIntraday = async () => {
      if (!isTradingHours()) return;
      const codes = stockPositions.map((p) => p.code);
      if (codes.length === 0) return;

      const { fetchStockIntraday, pMap } = await import('../shared/fetch');
      const results = await pMap(
        codes,
        async (code) => {
          try {
            const result = await fetchStockIntraday(code);
            return { code, data: result.data, prevClose: result.prevClose };
          } catch {
            return null;
          }
        },
        3,
      );

      if (!results) return;
      const valid = results.filter((r): r is NonNullable<typeof r> => r !== null && r.data.length > 0);
      if (valid.length === 0) return;

      setStockPositions((prev) =>
        prev.map((p) => {
          const found = valid.find((r) => r.code === p.code);
          return found ? { ...p, intraday: { data: found.data, prevClose: found.prevClose } } : p;
        }),
      );
    };

    const timer = setInterval(refreshIntraday, 60_000);
    return () => clearInterval(timer);
  }, [portfolioReady, stockPositions]);

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
  }, [portfolioReady, fundHoldings, refreshSig]);

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

  // ---- Tag handlers ----

  const handleTagToggle = (tagName: string) => {
    setTagFilter(prev =>
      prev.includes(tagName) ? prev.filter(t => t !== tagName) : [...prev, tagName]
    );
  };

  const handleTagClear = () => setTagFilter([]);

  const handleSaveTags = (kind: 'stock' | 'fund', code: string, newTags: string[]) => {
    if (kind === 'stock') {
      setStockHoldings(prev => prev.map(h => h.code === code ? { ...h, tags: newTags } : h));
    } else {
      setFundHoldings(prev => prev.map(h => h.code === code ? { ...h, tags: newTags } : h));
    }
    setTagEditorTarget(null);
  };

  const handleCreateTag = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (tagConfig.tags.some(t => t.name === trimmed)) return;
    const newDef: TagDefinition = { name: trimmed, createdAt: Date.now() };
    const next = { ...tagConfig, tags: [...tagConfig.tags, newDef] };
    setTagConfig(next);
    void saveTagConfig(next);
  };

  const handleOpenTagEditor = (kind: 'stock' | 'fund', code: string) => {
    setRowContextMenu(null);
    setTagEditorTarget({ kind, code });
  };

  const openSearch = () => setIsSearchOpen(true);
  const closeSearch = () => {
    setIsSearchOpen(false);
    setKeyword('');
  };

  const toggleTheme = () => setTheme((current) => (current === 'dark' ? 'light' : 'dark'));

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    setRefreshSig((prev) => prev + 1);
    setTimeout(() => setRefreshing(false), 2000);
  }, []);

  useEffect(() => {
    if (activeTab !== 'stocks' && stockDetailTarget) {
      setStockDetailTarget(null);
    }
    if (activeTab !== 'funds' && fundDetailTarget) {
      setFundDetailTarget(null);
    }
  }, [activeTab, stockDetailTarget]);

  useEffect(() => {
    if (!stockDetailTarget && !fundDetailTarget) {
      const el = document.querySelector('.content-scroll');
      if (el && scrollPosRef.current > 0) {
        requestAnimationFrame(() => {
          el.scrollTop = scrollPosRef.current;
        });
      }
    }
  }, [stockDetailTarget, fundDetailTarget]);

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

  const addStockToPortfolio = useCallback(async (stock: SearchStock) => {
    const normalizedCode = normalizeStockCode(stock.code);
    if (!normalizedCode) return;

    let addedPrice = stockPositions.find((item) => item.code === normalizedCode && Number.isFinite(item.price))?.price ?? Number.NaN;
    if (!Number.isFinite(addedPrice)) {
      try {
        const rows = await fetchBatchStockQuotes([{ code: normalizedCode, shares: 0, cost: 0 }]);
        addedPrice = rows.find((item) => item.code === normalizedCode)?.price ?? Number.NaN;
      } catch {
        addedPrice = Number.NaN;
      }
    }

    const addedAt = new Date().toISOString();
    setStockHoldings((prev) => {
      if (prev.some((item) => item.code === normalizedCode)) return prev;
      return insertAfterPinned(
        prev,
        {
          code: normalizedCode,
          name: stock.name,
          shares: 0,
          cost: 0,
          pinned: false,
          special: false,
          addedAt,
          addedPrice: Number.isFinite(addedPrice) && addedPrice > 0 ? Math.round(addedPrice * 1000) / 1000 : undefined,
        }
      );
    });
  }, [stockPositions]);

  const addFundToPortfolio = useCallback(async (fund: SearchStock) => {
    const code = normalizeFundCode(fund.code);
    if (!code) return;

    let addedNav = fundPositions.find((item) => item.code === code && Number.isFinite(item.estimatedNav))?.estimatedNav ?? Number.NaN;
    let fetchedRow: FundPosition | null = null;
    if (!Number.isFinite(addedNav)) {
      try {
        const row = await fetchTiantianFundPosition({ code, units: 0, cost: 0, name: fund.name });
        const candidate = row.navDisclosedToday && Number.isFinite(row.latestNav) ? row.latestNav : row.estimatedNav;
        addedNav = Number.isFinite(candidate) ? candidate : row.latestNav;
        fetchedRow = row;
      } catch {
        addedNav = Number.NaN;
      }
    }

    const addedAt = new Date().toISOString();
    setFundHoldings((prev) => {
      if (prev.some((item) => item.code === code)) return prev;
      return insertAfterPinned(
        prev,
        {
          code,
          units: 0,
          cost: 0,
          name: fund.name,
          pinned: false,
          special: false,
          addedAt,
          addedNav: Number.isFinite(addedNav) && addedNav > 0 ? Math.round(addedNav * 10000) / 10000 : undefined,
        }
      );
    });
    // 将已获取的行情数据同步写入 fundPositions，使列表即时刷新显示
    if (fetchedRow) {
      setFundPositions((prev) => {
        if (prev.some((p) => p.code === code)) return prev;
        return [...prev, fetchedRow!];
      });
    }
  }, [fundPositions]);

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
      void addFundToPortfolio(item);
    } else {
      void addStockToPortfolio(item);
    }
    setKeyword('');
    setIsSearchOpen(false);
  };

  const openStockDetail = (item: StockPosition) => {
    const code = normalizeStockCode(item.code);
    if (!code) return;
    const el = document.querySelector('.content-scroll');
    if (el) scrollPosRef.current = el.scrollTop;
    setStockDetailTarget({
      code,
      name: item.name || code,
    });
  };

  const closeStockDetail = () => {
    setStockDetailTarget(null);
  };

  const openFundDetail = (item: FundPosition) => {
    console.log('[openFundDetail] clicked:', item.code, item.name);
    const el = document.querySelector('.content-scroll');
    if (el) scrollPosRef.current = el.scrollTop;
    setFundDetailTarget({
      code: item.code,
      name: item.name || item.code,
    });
    console.log('[openFundDetail] fundDetailTarget set');
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
        if (!Number.isNaN(num) && num >= 0) {
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
        // estimatedProfit = 当日收益
        // 已公布净值：用 changePct 反推昨日净值
        // 未公布：今日 = estimatedNav，昨日 = latestNav
        let recalcEstimated: number;
        if (item.navDisclosedToday && Number.isFinite(item.latestNav)) {
          if (Number.isFinite(item.changePct) && item.changePct !== 0) {
            recalcEstimated = (item.latestNav * nextUnits * item.changePct) / (100 + item.changePct);
          } else {
            recalcEstimated = Number.NaN;
          }
        } else {
          recalcEstimated = nextUnits > 0 && Number.isFinite(item.estimatedNav) && Number.isFinite(item.latestNav)
            ? (item.estimatedNav - item.latestNav) * nextUnits
            : Number.NaN;
        }

        return {
          ...item,
          units: nextUnits,
          cost: nextCost,
          holdingAmount,
          holdingProfit,
          holdingProfitRate,
          recalcEstimated,
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
            <BarChart3 size={12} />
            <span>股票</span>
          </button>
          <button
            type="button"
            className={`nav-btn ${activeTab === 'funds' ? 'active' : ''}`}
            onClick={() => setActiveTab('funds')}
          >
            <WalletCards size={12} />
            <span>基金</span>
          </button>
          <button
            type="button"
            className={`nav-btn ${activeTab === 'account' ? 'active' : ''}`}
            onClick={() => setActiveTab('account')}
          >
            <PieChart size={12} />
            <span>账户</span>
          </button>
          <button
            type="button"
            className={`nav-btn ${activeTab === 'notifications' ? 'active' : ''}`}
            onClick={() => { setActiveTab('notifications'); setStockDetailTarget(null); setFundDetailTarget(null); }}
            style={{ position: 'relative' }}
          >
            <Bell size={12} />
            <span>通知</span>
            {unreadCount > 0 && <span className="nav-badge">{unreadCount}</span>}
          </button>

          <div className="nav-spacer" />

          <div className="side-nav-footer">
            <div className="market-stats-panel" aria-label="市场统计">
              <div className="market-stats-entry">
                <span className="market-stats-label">上涨</span>
                <span className="market-stats-value up">{marketStats ? formatNumber(marketStats.upCount, 0) : '--'}</span>
              </div>
              <div className="market-stats-entry">
                <span className="market-stats-label">平盘</span>
                <span className="market-stats-value flat">{marketStats ? formatNumber(marketStats.flatCount, 0) : '--'}</span>
              </div>
              <div className="market-stats-entry">
                <span className="market-stats-label">下跌</span>
                <span className="market-stats-value down">{marketStats ? formatNumber(marketStats.downCount, 0) : '--'}</span>
              </div>
              <div className="market-stats-entry">
                <span className="market-stats-label">成交额</span>
                <span className="market-stats-value">{marketStats ? formatMarketAmount(marketStats.turnover) : '--'}</span>
              </div>
              <div className="market-stats-entry">
                <span className="market-stats-label">
                  {marketStats && Number.isFinite(marketStats.volumeChange)
                    ? (marketStats.volumeChange >= 0 ? '放量' : '缩量')
                    : '缩量'}
                </span>
                <span className={`market-stats-value ${marketStats && Number.isFinite(marketStats.volumeChange) ? (marketStats.volumeChange >= 0 ? 'up' : 'down') : ''}`}>
                  {marketStats && Number.isFinite(marketStats.volumeChange)
                    ? formatMarketAmount(Math.abs(marketStats.volumeChange))
                    : '--'}
                </span>
              </div>
              <div className="market-stats-entry">
                <span className="market-stats-label">昨成交</span>
                <span className="market-stats-value">{marketStats ? formatMarketAmount(marketStats.prevTurnover) : '--'}</span>
              </div>
            </div>

            <button
              type="button"
              className="nav-btn theme-toggle-btn"
              onClick={openSettings}
              aria-label="打开设置"
            >
              <Settings size={12} />
              <span>设置</span>
            </button>

            <button
              type="button"
              className="nav-btn theme-toggle-btn"
              onClick={toggleTheme}
              aria-label="切换主题"
            >
              {theme === 'dark' ? <Sun size={12} /> : <Moon size={12} />}
              <span>{theme === 'dark' ? '浅色' : '深色'}</span>
            </button>
          </div>
        </aside>

        <main className={`main-area ${stockDetailTarget || fundDetailTarget ? 'detail-layout' : ''}`}>
          {!stockDetailTarget && !fundDetailTarget && activeTab !== 'notifications' ? (
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

          {!stockDetailTarget && !fundDetailTarget && activeTab !== 'notifications' ? (
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
              <DetailErrorBoundary onBack={closeFundDetail}>
                <FundDetailView
                  code={fundDetailTarget.code}
                  fundPosition={fundPositions.find((p) => p.code === fundDetailTarget.code)}
                  fundHolding={fundHoldings.find((h) => h.code === fundDetailTarget.code)}
                  onBack={closeFundDetail}
                />
              </DetailErrorBoundary>
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

                <DiagnosticPanel
                  stockPositions={stockPositions}
                  fundPositions={fundPositions}
                />

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

            {/* ---- Notification Panel ---- */}
            {activeTab === 'notifications' && !stockDetailTarget && !fundDetailTarget ? (
              <div className="notification-panel" style={{ opacity: panelOpacity }}>
                <div className="notification-header">
                  <span className="notification-title">消息通知</span>
                  <div className="notification-actions">
                    {unreadCount > 0 && (
                      <button type="button" className="notif-btn" onClick={markAllRead}>
                        全部已读
                      </button>
                    )}
                    {notifications.length > 0 && (
                      <button type="button" className="notif-btn danger" onClick={clearNotifications}>
                        清空
                      </button>
                    )}
                  </div>
                </div>

                {/* ---- 子标签切换 ---- */}
                <div className="notif-sub-tabs">
                  <button
                    type="button"
                    className={`notif-sub-tab ${notifSubTab === 'alerts' ? 'active' : ''}`}
                    onClick={() => setNotifSubTab('alerts')}
                  >
                    股票告警
                  </button>
                  <button
                    type="button"
                    className={`notif-sub-tab ${notifSubTab === 'tech-report' ? 'active' : ''}`}
                    onClick={() => setNotifSubTab('tech-report')}
                  >
                    技术报告
                  </button>
                </div>

                {notifSubTab === 'tech-report' && (
                  <>
                    {/* ---- 技术报告状态 ---- */}
                    <div className="tech-report-status">
                      {techReportStatus === 'loading' ? (
                        <div className="tech-report-loading">盘后技术报告加载中...</div>
                      ) : techReportStatus ? (
                        <>
                          <div className="tech-report-header">
                            <span className="tech-report-title">盘后技术报告</span>
                            <span className={`tech-report-enabled ${techReportStatus.enabled ? 'on' : 'off'}`}>
                              {techReportStatus.enabled ? '已启用' : '已禁用'}
                            </span>
                          </div>
                          <div className="tech-report-body">
                            {techReportStatus.enabled ? (
                              <>
                                <div className="tech-report-row">
                                  <span className="tech-report-label">上次运行</span>
                                  <span className="tech-report-value">
                                    {techReportStatus.lastRunDate
                                      ? `${techReportStatus.lastRunDate} ${techReportStatus.lastRunTime ? formatRelativeTime(techReportStatus.lastRunTime) : ''}`
                                      : '尚未运行'}
                                    {techReportStatus.lastRunDate && (
                                      <span className={`tech-report-badge ${techReportStatus.status === 'success' ? 'ok' : techReportStatus.status === 'error' ? 'err' : 'idle'}`}>
                                        {techReportStatus.status === 'success' ? `✓ ${techReportStatus.details}` : ''}
                                        {techReportStatus.status === 'no_signal' ? '○ 无新信号' : ''}
                                        {techReportStatus.status === 'error' ? '✗ 出错' : ''}
                                        {techReportStatus.status === 'pending' ? '⋯ 运行中' : ''}
                                      </span>
                                    )}
                                  </span>
                                </div>
                                {techReportStatus.errorMessage && (
                                  <div className="tech-report-row">
                                    <span className="tech-report-label">错误信息</span>
                                    <span className="tech-report-value error">{techReportStatus.errorMessage}</span>
                                  </div>
                                )}
                                <div className="tech-report-row">
                                  <span className="tech-report-label">下次运行</span>
                                  <span className="tech-report-value">
                                    {techReportStatus.nextRunTime > 0 ? (
                                      <>
                                        {new Date(techReportStatus.nextRunTime).toLocaleString('zh-CN', {
                                          month: '2-digit', day: '2-digit',
                                          hour: '2-digit', minute: '2-digit',
                                        })}
                                        <button type="button" className="tech-report-run-btn" onClick={() => {
                                          if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
                                            void chrome.runtime.sendMessage({ type: 'trigger-tech-report' }).then(() => {
                                              chrome.storage.local.get('technicalReportStatus').then((r) => {
                                                const s = r.technicalReportStatus as typeof techReportStatus;
                                                if (s) setTechReportStatus(s);
                                              });
                                            });
                                          }
                                        }}>
                                          {(() => {
                                            const todayStr = new Date().toLocaleDateString('en-CA');
                                            return techReportStatus.lastRunDate === todayStr ? '重新生成' : '立即运行';
                                          })()}
                                        </button>
                                      </>
                                    ) : '等待调度'}
                                  </span>
                                </div>
                              </>
                            ) : (
                              <div className="tech-report-row">
                                <span className="tech-report-value disabled">请在设置页面启用盘后技术指标报告</span>
                              </div>
                            )}
                          </div>
                        </>
                      ) : null}
                    </div>

                    {(() => {
                      const techNotifs = notifications.filter((n) => n.name === '盘后技术报告');
                      return techNotifs.length === 0 ? (
                        <div className="notification-empty">暂无技术报告</div>
                      ) : (
                        <div className="notification-list">
                          {techNotifs.map((item) => (
                            <div
                              key={item.id}
                              className={`notification-item ${item.read ? '' : 'unread'} clickable`}
                              onClick={() => {
                                markNotificationRead(item.id);
                                setTechReportDetail({ name: item.name, message: item.message, firedAt: item.firedAt });
                              }}
                            >
                              <span className={`notification-dot ${item.read ? '' : 'unread'}`} />
                              <div className="notification-text">
                                <span className="notification-stock">
                                  {(() => {
                                    const stockLines = item.message.split('\n').filter(l => /^\S+\(\d{6}\)/.test(l.trim()));
                                    const first = stockLines[0]?.trim().replace(/\(.*$/, '') || '';
                                    return <>{'📊 '}<span className="tech-report-title-inline">盘后技术报告</span>{first ? <span className="notification-code"> {first}{stockLines.length > 1 ? ` 等${stockLines.length}只` : ''}</span> : ''}</>;
                                  })()}
                                </span>
                                <span className="notification-message">{renderNotificationMessage(item.message)}</span>
                              </div>
                              <span className="notification-time">
                                <button type="button" className="notif-del-btn" title="删除" onClick={(e) => { e.stopPropagation(); deleteNotification(item.id); }}>
                                  <X size={10} />
                                </button>
                                {formatRelativeTime(item.firedAt)}
                              </span>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </>
                )}

                {notifSubTab === 'alerts' && (
                  <>
                    {(() => {
                      const alertNotifs = notifications.filter((n) => n.name !== '盘后技术报告');
                      return alertNotifs.length === 0 ? (
                        <div className="notification-empty">暂无股票告警</div>
                      ) : (
                        <div className="notification-list">
                          {alertNotifs.map((item) => {
                            const changeUp = Number.isFinite(item.changePct) && item.changePct >= 0;
                            const priceValid = Number.isFinite(item.price) && item.price > 0;
                            const handleAlertNotifClick = () => {
                              markNotificationRead(item.id);
                              if (item.code) {
                                const el = document.querySelector('.content-scroll');
                                if (el) scrollPosRef.current = el.scrollTop;
                                setActiveTab('stocks');
                              }
                            };
                            return (
                              <div
                                key={item.id}
                                className={`notification-item ${item.read ? '' : 'unread'} ${item.code ? 'clickable' : ''}`}
                                onClick={item.code ? handleAlertNotifClick : undefined}
                              >
                                <span className={`notification-dot ${item.read ? '' : 'unread'}`} />
                                <div className="notification-text">
                                  <span className="notification-stock">
                                    {item.name}
                                    {item.code && <span className="notification-code">({item.code})</span>}
                                  </span>
                                  {priceValid && (
                                    <span className="notification-price-row">
                                      <span className="notif-price-label">现价 </span>
                                      <span className="notif-price-value">¥{item.price.toFixed(2)}</span>
                                      <span className={`notif-change-value ${changeUp ? 'up' : 'down'}`}>
                                        {item.changePct >= 0 ? '+' : ''}{item.changePct.toFixed(2)}%
                                      </span>
                                    </span>
                                  )}
                                  <span className="notification-message">{renderNotificationMessage(item.message)}</span>
                                </div>
                                <span className="notification-time">
                                  <button type="button" className="notif-del-btn" title="删除" onClick={(e) => { e.stopPropagation(); deleteNotification(item.id); }}>
                                    <X size={10} />
                                  </button>
                                  {formatRelativeTime(item.firedAt)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </>
                )}
              </div>
            ) : null}

            {(activeTab === 'stocks' || activeTab === 'funds') && !stockDetailTarget && !fundDetailTarget ? (
              <TagFilterBar
                tags={tagConfig.tags}
                selected={tagFilter}
                onToggle={handleTagToggle}
                onClear={handleTagClear}
              />
            ) : null}

            {activeTab === 'stocks' && !stockDetailTarget ? (
              <div className="table-panel">
                <table className="data-table stock-table">
                  <thead>
                    <tr>
                      <th>股票</th>
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
                                <span className={`name-text ${toneClass(item.dailyChangePct)}`}>{item.name || item.code}</span>
                                {badge ? (
                                  <span className={`stock-badge ${badge.tone}`}>{badge.label}</span>
                                ) : null}
                                {signalStocks?.[item.code] ? (
                                  <span className="stock-badge signal" title={`${signalStocks[item.code].signalCount} 个技术信号`}>
                                    技
                                  </span>
                                ) : null}
                                {item.pinned ? <Pin size={10} className="pinned-flag" /> : null}
                              </span>
                              {item.tags.length > 0 ? (
                                <span className="tag-row">
                                  {item.tags.slice(0, 2).map(tag => (
                                    <TagBadge key={tag} tag={tag} />
                                  ))}
                                  {item.tags.length > 2 ? (
                                    <span className="tag-badge-more">+{item.tags.length - 2}</span>
                                  ) : null}
                                </span>
                              ) : null}
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
                              data={item.intraday?.data ?? []}
                              prevClose={item.prevClose}
                              intradayPrevClose={item.intraday?.prevClose}
                              changePct={item.dailyChangePct}
                            />
                          </td>
                          <td className="dual-value">
                            <span className={toneClass(item.floatingPnl)}>{formatNumber(item.floatingPnl, 1)}</span>
                            <span className={toneClass(holdingRate)}>{formatPercent(holdingRate)}</span>
                            {item.tradeDerived && Number.isFinite(item.realizedPnl) ? (
                              <span className={toneClass(item.realizedPnl!)} style={{ fontSize: 9, opacity: 0.7 }}>
                                已实现 {item.realizedPnl! >= 0 ? '+' : ''}{formatNumber(item.realizedPnl!, 1)}
                              </span>
                            ) : null}
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
                                  if (item.tradeDerived) return;
                                  startEditing('stock', item.code, 'cost');
                                }}
                                title={item.tradeDerived ? '由交易记录自动计算' : '点击编辑成本价'}
                              >
                                {hasCost ? formatNumber(item.cost, 3) : '输入成本价'}
                              </span>
                            )}
                            <span className="price-line">{formatNumber(item.price, 2)}</span>
                            {Number.isFinite(item.addedPrice) && item.addedPrice! > 0 ? (
                              <span style={{ fontSize: 9, color: 'var(--text-1)', opacity: 0.6, lineHeight: 1.2, display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                                <span>关注 {formatNumber(item.addedPrice!, 3)}</span>
                                <span className={toneClass(((item.price - item.addedPrice!) / item.addedPrice!) * 100)}>
                                  {formatPercent(((item.price - item.addedPrice!) / item.addedPrice!) * 100)}
                                </span>
                              </span>
                            ) : null}
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
                                  if (item.tradeDerived) return;
                                  startEditing('stock', item.code, 'shares');
                                }}
                                title={item.tradeDerived ? '由交易记录自动计算' : '点击编辑股数'}
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
                <FloatingRefreshBtn onRefresh={handleRefresh} spinning={refreshing} />
              </div>
            ) : null}

            {activeTab === 'funds' && !fundDetailTarget ? (
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
                        <td
                          className={`name-col fund-detail-trigger ${item.special ? 'special-row' : ''}`}
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
                          <span
                            className="primary"
                            title={item.name}
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
                            {item.tags.length > 0 ? (
                              <span className="tag-row">
                                {item.tags.slice(0, 2).map(tag => (
                                  <TagBadge key={tag} tag={tag} />
                                ))}
                                {item.tags.length > 2 ? (
                                  <span className="tag-badge-more">+{item.tags.length - 2}</span>
                                ) : null}
                              </span>
                            ) : null}
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
                          {Number.isFinite(item.addedNav) && item.addedNav! > 0 ? (
                            <span style={{ fontSize: 9, color: 'var(--text-1)', opacity: 0.6, lineHeight: 1.2, display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                              <span>关注 {item.addedNav!.toFixed(4)}</span>
                              <span className={toneClass(((item.estimatedNav - item.addedNav!) / item.addedNav!) * 100)}>
                                {formatPercent(((item.estimatedNav - item.addedNav!) / item.addedNav!) * 100)}
                              </span>
                            </span>
                          ) : null}
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
                <FloatingRefreshBtn onRefresh={handleRefresh} spinning={refreshing} />
              </div>
            ) : null}
          </section>
        </main>

        {techReportDetail ? (
          <div className="tech-report-detail-overlay" onClick={() => setTechReportDetail(null)}>
            <div className="tech-report-detail-modal" onClick={(e) => e.stopPropagation()}>
              <div className="tech-report-detail-header">
                <span className="tech-report-detail-title">📊 盘后技术报告</span>
                <div className="tech-report-detail-actions">
                  <button type="button" className="tech-report-detail-del" title="删除此报告" onClick={() => {
                    // 查找并删除对应的通知
                    const match = notifications.find((n) => n.name === '盘后技术报告' && n.firedAt === techReportDetail.firedAt);
                    if (match) deleteNotification(match.id);
                    setTechReportDetail(null);
                  }}>删除</button>
                  <button type="button" className="tech-report-detail-close" onClick={() => setTechReportDetail(null)}>
                    <X size={14} />
                  </button>
                </div>
              </div>
              <div className="tech-report-detail-time">
                {formatRelativeTime(techReportDetail.firedAt)}
              </div>
              <div className="tech-report-detail-body">
                {techReportDetail.message.split('\n').map((line, i) => {
                  const trimmed = line.trim();
                  if (!trimmed) return <br key={i} />;
                  if (trimmed.startsWith('•')) {
                    return <div key={i} className="tech-report-detail-signal">{trimmed}</div>;
                  }
                  if (trimmed.startsWith('📊')) {
                    return <div key={i} className="tech-report-detail-date">{trimmed}</div>;
                  }
                  if (trimmed.includes('(') && trimmed.includes(')')) {
                    const [stockName] = trimmed.split('(');
                    return <div key={i} className="tech-report-detail-stock">{trimmed}</div>;
                  }
                  return <div key={i} className="tech-report-detail-line">{trimmed}</div>;
                })}
              </div>
            </div>
          </div>
        ) : null}

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
                <button type="button" onClick={() => handleOpenTagEditor('stock', rowContextMenu.code)}>
                  管理标签
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
                <button type="button" onClick={() => handleOpenTagEditor('fund', rowContextMenu.code)}>
                  管理标签
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

        {tagEditorTarget ? (
          <TagEditor
            currentTags={
              tagEditorTarget.kind === 'stock'
                ? (stockHoldings.find(h => h.code === tagEditorTarget.code)?.tags ?? [])
                : (fundHoldings.find(h => h.code === tagEditorTarget.code)?.tags ?? [])
            }
            globalTags={tagConfig.tags}
            onSave={(newTags) => handleSaveTags(tagEditorTarget.kind, tagEditorTarget.code, newTags)}
            onClose={() => setTagEditorTarget(null)}
            onCreateTag={handleCreateTag}
            onDeleteTag={() => {}}
          />
        ) : null}

        {showDemo ? (
          <DemoGuide onComplete={() => setShowDemo(false)} />
        ) : null}
      </div>
    </div>
  );
}
