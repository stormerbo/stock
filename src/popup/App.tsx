import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BarChart3, Bell, FileText, GripVertical, Moon, PieChart, Pin, RefreshCw, Search, Settings, Star, Sun, WalletCards, X } from 'lucide-react';
import StockDetailView from './views/StockDetailView';
import SectorDetailView from './views/SectorDetailView';
import IndexDetailModal from './views/IndexDetailModal';
import FundDetailView from './views/FundDetailView';
import DiagnosticPanel from './views/DiagnosticPanel';
import TagBadge from './tags/TagBadge';
import TagFilterBar from './tags/TagFilterBar';
import TagEditor from './tags/TagEditor';
import DemoGuide, { loadDemoFlag } from './views/DemoGuide';
import TradeHistoryPage from './views/TradeHistoryPage';
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
import { fetchDayFqKline } from '../shared/technical-analysis';
import { calcMaxDrawdownFromKline, calcVolatilityFromKline } from '../shared/risk-metrics';
import { loadTradeHistory, getTradesForStock, computePositionFromTrades, computeDailyPnlFromTrades, type StockTradeRecord } from '../shared/trade-history';
import { getFundTradesForCode, computeFundPositionFromTrades } from '../shared/fund-trade-history';
import type {
  PageTab, ThemeMode, IndexDetailTarget, SearchStock,
  RowContextMenuState, SortingMode, StockDetailTarget, FundDetailTarget,
  TradeHistoryTarget, StockRow, FundRow, NotificationRecord, PortfolioConfig,
  IntradayDataPoint, MarketStats as MarketStatsType,
} from './types';
import { formatNumber, formatLooseNumber, formatMarketAmount, formatPercent, formatRatioPercent, toneClass, formatRelativeTime, getShanghaiDateKey, resolvePrevTurnover, deriveMarketStats } from './utils/format';
import { applyPinnedOrder, insertAfterPinned, reorderCodes, moveCodeAfterPinned, sortRowsByCodes } from './utils/sorting';
import { STORAGE_KEYS, EMPTY_PORTFOLIO, parseStockHoldings, parseFundHoldings, loadPortfolioConfig, savePortfolioConfig } from './utils/portfolio-io';
import { fetchTencentStockSuggestions, fetchFundSuggestions } from './utils/search-suggestions';
import FloatingRefreshBtn from './components/FloatingRefreshBtn';
import DetailErrorBoundary from './components/DetailErrorBoundary';
import IntradayChart from './components/IntradayChart';
import SideNav from './components/SideNav';
import AccountDashboard from './components/AccountDashboard';
import NotificationPanel from './components/NotificationPanel';
import StockTable from './components/StockTable';
import FundTable from './components/FundTable';

const BADGE_STORAGE_KEY = 'badgeConfig';
const MARKET_STATS_CACHE_KEY = 'marketStats';
const MARKET_STATS_UPDATED_AT_KEY = 'marketStatsUpdatedAt';
const MARKET_STATS_HISTORY_KEY = 'marketStatsHistory';
const STOCK_INTRADAY_DATE_KEY = 'stockIntradayDate';

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

function renderNotificationMessage(message: string): ReactNode {
  const parts: ReactNode[] = [];
  const regex = /([¥¥]?\d+\.\d+|\+\d+\.\d+%|-\d+\.\d+%)/g;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(message)) !== null) {
    if (match.index > lastIndex) {
      parts.push(message.slice(lastIndex, match.index));
    }
    const text = match[0];
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
  const [sectorDetailTarget, setSectorDetailTarget] = useState<{ code: string; name: string } | null>(null);
  const [fundDetailTarget, setFundDetailTarget] = useState<FundDetailTarget | null>(null);
  const [rowContextMenu, setRowContextMenu] = useState<RowContextMenuState | null>(null);
  const [sortingMode, setSortingMode] = useState<SortingMode>(null);
  const [stockSortDraft, setStockSortDraft] = useState<string[] | null>(null);
  const [fundSortDraft, setFundSortDraft] = useState<string[] | null>(null);
  const [draggingCode, setDraggingCode] = useState<string | null>(null);

  // 交易记录缓存（用于修正当日盈亏）
  const [tradeHistoryForPnl, setTradeHistoryForPnl] = useState<Record<string, StockTradeRecord[]>>({});

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

  const popupRootRef = useRef<HTMLDivElement | null>(null);
  const searchWrapRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const scrollPosRef = useRef(0);

  // 统一出口：从 stockPositions + 交易记录汇总盈亏（区分隔夜/当日建仓）
  const correctedStockDaily = useMemo(() => {
    const today = getShanghaiToday();
    return stockPositions.reduce((sum, item) => {
      const trades = tradeHistoryForPnl[item.code];
      if (trades && trades.length > 0) {
        const corrected = computeDailyPnlFromTrades(trades, item.price, item.prevClose, today);
        if (Number.isFinite(corrected)) return sum + corrected;
      }
      if (!Number.isFinite(item.dailyPnl)) return sum;
      return sum + item.dailyPnl;
    }, 0);
  }, [stockPositions, tradeHistoryForPnl]);

  const correctedStockFloating = useMemo(() => {
    return stockPositions.reduce((sum, item) => {
      const trades = tradeHistoryForPnl[item.code];
      if (trades && trades.length > 0) {
        // 用持仓成本重算浮动盈亏
        const holding = stockHoldings.find(h => h.code === item.code);
        if (holding && holding.cost > 0 && holding.shares > 0 && Number.isFinite(item.price)) {
          return sum + (item.price - holding.cost) * holding.shares;
        }
      }
      if (!Number.isFinite(item.floatingPnl)) return sum;
      return sum + item.floatingPnl;
    }, 0);
  }, [stockPositions, stockHoldings, tradeHistoryForPnl]);

  const stockMetrics = useMemo(() => {
    const totalMarketValue = stockPositions.reduce((sum, item) => {
      if (!Number.isFinite(item.price) || item.shares <= 0) return sum;
      return sum + item.price * item.shares;
    }, 0);

    return [
      { label: '总市值', value: formatNumber(totalMarketValue, 2), tone: 'neutral' },
      { label: '总盈亏', value: formatNumber(correctedStockFloating, 1), tone: toneClass(correctedStockFloating) },
      { label: '当日盈亏', value: formatNumber(correctedStockDaily, 1), tone: toneClass(correctedStockDaily) },
    ] as const;
  }, [stockPositions, correctedStockFloating, correctedStockDaily]);

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

    const stockTotalPnl = correctedStockFloating;
    const stockDaily = correctedStockDaily;
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
  }, [fundPositions, stockPositions, correctedStockFloating, correctedStockDaily]);

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
    const stockFloating = correctedStockFloating;
    const stockDaily = correctedStockDaily;

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
  }, [fundHoldings, fundPositions, stockHoldings, stockPositions, correctedStockFloating, correctedStockDaily]);
  const stockPinnedCode = stockHoldings.find((item) => item.pinned)?.code ?? null;
  const fundPinnedCode = fundHoldings.find((item) => item.pinned)?.code ?? null;
  const stockRows = useMemo<StockRow[]>(() => {
    const positionMap = new Map(stockPositions.map((item) => [item.code, item]));
    const today = getShanghaiToday();
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

      // 用交易记录修正浮动盈亏和当日盈亏
      const trades = tradeHistoryForPnl[holding.code];
      if (trades && trades.length > 0) {
        const correctedDaily = computeDailyPnlFromTrades(trades, row.price, row.prevClose, today);
        if (Number.isFinite(correctedDaily)) {
          next.dailyPnl = correctedDaily;
          const positionCost = holding.cost > 0 && holding.shares > 0
            ? holding.cost * holding.shares : Number.NaN;
          if (Number.isFinite(positionCost) && positionCost > 0) {
            next.dailyChangePct = (correctedDaily / positionCost) * 100;
          }
        }
        // 同步修正浮动盈亏 = (现价 - 持仓成本) × 持仓股数
        if (holding.cost > 0 && holding.shares > 0 && Number.isFinite(row.price)) {
          next.floatingPnl = (row.price - holding.cost) * holding.shares;
        }
      }

      rows.push(next);
    }
    return rows;
  }, [stockHoldings, stockPositions, tradeHistoryForPnl]);

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

  const fundNameMap = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const pos of fundPositions) {
      if (pos.name) map[pos.code] = pos.name;
    }
    for (const h of fundHoldings) {
      if (h.name) map[h.code] = h.name;
    }
    return map;
  }, [fundPositions, fundHoldings]);

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

  // 加载交易记录用于修正当日盈亏
  useEffect(() => {
    loadTradeHistory().then((history) => setTradeHistoryForPnl(history));
  }, [portfolioReady, refreshSig]);

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
            // 用 stockHoldings 的最新 shares/cost 覆写缓存数据，防止编辑被缓存冲掉
            const holdingMap = new Map(stockHoldings.map((h) => [normalizeStockCode(h.code), h]));
            cached = cached.map((p) => {
              const h = holdingMap.get(p.code);
              if (!h) return p;
              return { ...p, shares: Math.max(0, h.shares), cost: Math.max(0, h.cost) };
            });
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


  const handleStockTradesChanged = useCallback(async (code: string) => {
    const trades = await getTradesForStock(code);
    if (trades.length === 0) {
      setTradeHistoryForPnl((prev) => {
        const next = { ...prev };
        delete next[code];
        return next;
      });
      return;
    }
    const pos = computePositionFromTrades(trades);
    setTradeHistoryForPnl((prev) => ({ ...prev, [code]: trades }));
    setStockHoldings((prev) =>
      prev.map((h) => h.code === code ? { ...h, shares: pos.shares, cost: pos.avgCost } : h)
    );
    setStockPositions((prev) =>
      prev.map((p) => {
        if (p.code !== code) return p;
        const floatingPnl = pos.shares > 0 && pos.avgCost > 0 && Number.isFinite(p.price)
          ? (p.price - pos.avgCost) * pos.shares
          : Number.NaN;
        return { ...p, shares: pos.shares, cost: pos.avgCost, floatingPnl };
      })
    );
  }, []);

  const handleFundTradesChanged = useCallback(async (code: string) => {
    const trades = await getFundTradesForCode(code);
    if (trades.length === 0) return;
    const pos = computeFundPositionFromTrades(trades);
    setFundHoldings((prev) =>
      prev.map((h) => h.code === code ? { ...h, units: pos.units, cost: pos.avgCost } : h)
    );
  }, []);



  useEffect(() => {
    if (activeTab !== 'stocks' && stockDetailTarget) {
      setStockDetailTarget(null);
    }
    if (activeTab !== 'funds' && fundDetailTarget) {
      setFundDetailTarget(null);
    }
    if (activeTab !== 'stocks' && sectorDetailTarget) {
      setSectorDetailTarget(null);
    }
  }, [activeTab, stockDetailTarget, sectorDetailTarget]);

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
          estimatedProfit: recalcEstimated,
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
        <SideNav
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          unreadCount={unreadCount}
          marketStats={marketStats}
          theme={theme}
          toggleTheme={toggleTheme}
          openSettings={openSettings}
          clearDetailTargets={() => { setStockDetailTarget(null); setFundDetailTarget(null); }}
        />

        <main className={`main-area ${stockDetailTarget || fundDetailTarget || sectorDetailTarget ? 'detail-layout' : ''}`}>
          {!stockDetailTarget && !fundDetailTarget && activeTab !== 'notifications' && activeTab !== 'trades' ? (
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

          {!stockDetailTarget && !fundDetailTarget && activeTab !== 'notifications' && activeTab !== 'trades' ? (
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

          <section className={`content-scroll ${activeTab === 'stocks' && stockDetailTarget ? 'detail-mode' : ''} ${activeTab === 'funds' && fundDetailTarget ? 'detail-mode' : ''} ${sectorDetailTarget || activeTab === 'trades' ? 'detail-mode' : ''}`}>
            {activeTab === 'stocks' && stockDetailTarget && !sectorDetailTarget ? (
              <StockDetailView
                code={stockDetailTarget.code}
                fallbackName={stockDetailTarget.name}
                onBack={closeStockDetail}
                onSelectSector={(sectorCode, sectorName) => setSectorDetailTarget({ code: sectorCode, name: sectorName })}
              />
            ) : null}

            {sectorDetailTarget ? (
              <SectorDetailView
                sectorCode={sectorDetailTarget.code}
                sectorName={sectorDetailTarget.name}
                stockCodes={stockHoldings.map((h) => h.code)}
                onAddStock={(stock) => addStockToPortfolio({ code: stock.code, name: stock.name })}
                onBack={() => setSectorDetailTarget(null)}
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
              <AccountDashboard
                snapshot={accountSnapshot}
                stockPositions={stockPositions}
                fundPositions={fundPositions}
              />
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
              <NotificationPanel
                notifications={notifications}
                panelOpacity={panelOpacity}
                notifSubTab={notifSubTab}
                setNotifSubTab={setNotifSubTab}
                techReportStatus={techReportStatus}
                techReportDetail={techReportDetail}
                signalStocks={signalStocks}
                unreadCount={unreadCount}
                markAllRead={markAllRead}
                markNotificationRead={markNotificationRead}
                clearNotifications={clearNotifications}
                deleteNotification={deleteNotification}
                setTechReportDetail={setTechReportDetail}
                setTechReportStatus={setTechReportStatus}
                setActiveTab={setActiveTab}
                scrollPosRef={scrollPosRef}
                renderNotificationMessage={renderNotificationMessage}
              />
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
              <StockTable
                rows={stockDisplayRows}
                stockPinnedCode={stockPinnedCode}
                sortingMode={sortingMode}
                draggingCode={draggingCode}
                editingCell={editingCell}
                signalStocks={signalStocks}
                stocksLoading={stocksLoading}
                stocksError={stocksError}
                stockTotalHoldingAmount={stockTotalHoldingAmount}
                openStockDetail={openStockDetail}
                openRowContextMenu={openRowContextMenu}
                startEditing={startEditing}
                updateEditingValue={updateEditingValue}
                finishEditing={finishEditing}
                cancelEditing={cancelEditing}
                handleDragStart={handleDragStart}
                handleDragEnd={handleDragEnd}
                handleStockDrop={handleStockDrop}
                handleStockDropAfterPinned={handleStockDropAfterPinned}
                getStockBadge={getStockBadge}
                onRefresh={handleRefresh}
                refreshing={refreshing}
              />
            ) : null}

            {activeTab === 'funds' && !fundDetailTarget ? (
              <FundTable
                rows={fundDisplayRows}
                fundPinnedCode={fundPinnedCode}
                sortingMode={sortingMode}
                draggingCode={draggingCode}
                editingCell={editingCell}
                fundsLoading={fundsLoading}
                fundsError={fundsError}
                fundPositionsLength={fundPositions.length}
                openFundDetail={openFundDetail}
                openRowContextMenu={openRowContextMenu}
                startEditing={startEditing}
                updateEditingValue={updateEditingValue}
                finishEditing={finishEditing}
                cancelEditing={cancelEditing}
                handleDragStart={handleDragStart}
                handleDragEnd={handleDragEnd}
                handleFundDrop={handleFundDrop}
                handleFundDropAfterPinned={handleFundDropAfterPinned}
                onRefresh={handleRefresh}
                refreshing={refreshing}
              />
            ) : null}

            {activeTab === 'trades' ? (
              <TradeHistoryPage stockNames={stockNameMap} fundNames={fundNameMap} allStockCodes={stockHoldings.map(h => h.code)} allFundCodes={fundHoldings.map(h => h.code)} onStockTradesChanged={handleStockTradesChanged} onFundTradesChanged={handleFundTradesChanged} />
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
