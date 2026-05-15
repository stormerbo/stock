import { useEffect, useState, useCallback, useRef, type DragEvent, type MouseEvent as ReactMouseEvent } from 'react';
import type { StockPosition } from '../shared/fetch';
import {
  CONFIG_KEY, STATE_KEY, DEFAULT_CONFIG, DEFAULT_STATE,
  type FloatingOverlayConfig, type FloatingOverlayState,
} from './config';
import FloatingWidget from './components/FloatingWidget';
import StockCard from './components/StockCard';
import StockDetail from './components/StockDetail';

type StockDisplay = {
  code: string;
  name: string;
  price: number;
  prevClose: number;
  changePct: number;
  high?: number;
  low?: number;
  open?: number;
  intraday: { data: Array<{ time: string; price: number }>; prevClose: number };
};

export default function App() {
  const [config, setConfig] = useState<FloatingOverlayConfig>(DEFAULT_CONFIG);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [uiState, setUiState] = useState<FloatingOverlayState>(DEFAULT_STATE);
  const [positions, setPositions] = useState<StockPosition[]>([]);
  const [ready, setReady] = useState(false);
  const [selectedStock, setSelectedStock] = useState<StockDisplay | null>(null);
  const dragIndexRef = useRef<number>(-1);

  // ---- Load initial data ----
  useEffect(() => {
    chrome.storage.sync.get([CONFIG_KEY, 'popup-theme'], (result) => {
      const savedConfig = (result[CONFIG_KEY] as FloatingOverlayConfig) ?? DEFAULT_CONFIG;
      setConfig(savedConfig);
      setTheme((result['popup-theme'] as 'dark' | 'light') ?? 'dark');
      // 如果开启了但被隐藏了，复位 hidden
      if (savedConfig.enabled) {
        chrome.storage.local.get(STATE_KEY, (sr) => {
          const savedState = sr[STATE_KEY] as FloatingOverlayState | undefined;
          if (savedState?.hidden) {
            const resetState = { ...savedState, hidden: false };
            chrome.storage.local.set({ [STATE_KEY]: resetState }).catch(() => {});
          }
        });
      }
    });
    chrome.storage.local.get([STATE_KEY, 'stockPositions'], (result) => {
      const rawState = result[STATE_KEY] as Partial<FloatingOverlayState> | undefined;
      setUiState(rawState ? { ...DEFAULT_STATE, ...rawState } : DEFAULT_STATE);
      setPositions((result.stockPositions as StockPosition[]) ?? []);
      setReady(true);
    });
  }, []);

  // ---- Subscribe to live changes ----
  useEffect(() => {
    const handler = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (area === 'local') {
        if (changes.stockPositions) {
          setPositions(changes.stockPositions.newValue as StockPosition[] ?? []);
        }
        if (changes[STATE_KEY]) {
          setUiState(changes[STATE_KEY].newValue as FloatingOverlayState);
        }
      }
      if (area === 'sync') {
        if (changes[CONFIG_KEY]) {
          setConfig(changes[CONFIG_KEY].newValue as FloatingOverlayConfig);
        }
        if (changes['popup-theme']) {
          setTheme(changes['popup-theme'].newValue as 'dark' | 'light');
        }
      }
    };
    chrome.storage.onChanged.addListener(handler);
    return () => chrome.storage.onChanged.removeListener(handler);
  }, []);

  // ---- Persist UI state (position, collapsed) ----
  const persistState = useCallback((partial: Partial<FloatingOverlayState>) => {
    setUiState((prev) => {
      const next = { ...prev, ...partial };
      chrome.storage.local.set({ [STATE_KEY]: next }).catch(() => {});
      return next;
    });
  }, []);

  const handlePositionChange = useCallback(
    (pos: { x: number; y: number }) => persistState({ position: pos }),
    [persistState],
  );

  const handleToggleCollapse = useCallback(
    () => persistState({ collapsed: !uiState.collapsed }),
    [persistState, uiState.collapsed],
  );

  const handleClose = useCallback(
    () => persistState({ hidden: true }),
    [persistState],
  );

  // ---- Build display list: intersect config.stockCodes with stockPositions ----
  const codeSet = new Set(config.stockCodes);
  const displayList: StockDisplay[] = [];
  for (const p of positions) {
    if (codeSet.has(p.code)) {
      displayList.push({
        code: p.code,
        name: p.name,
        price: p.price,
        prevClose: p.prevClose,
        changePct: p.dailyChangePct,
        intraday: p.intraday,
      });
    }
  }
  // Sort by the order in config.stockCodes
  displayList.sort((a, b) => config.stockCodes.indexOf(a.code) - config.stockCodes.indexOf(b.code));

  // ---- Drag & drop reorder ----
  const handleDragStart = useCallback((e: DragEvent<HTMLDivElement>, index: number) => {
    dragIndexRef.current = index;
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>, dropIndex: number) => {
    e.preventDefault();
    const from = dragIndexRef.current;
    if (from === dropIndex || from < 0) return;

    const codes = [...config.stockCodes];
    const [moved] = codes.splice(from, 1);
    codes.splice(dropIndex, 0, moved);
    const next = { ...config, stockCodes: codes };
    setConfig(next);
    chrome.storage.sync.set({ [CONFIG_KEY]: next }).catch(() => {});
    dragIndexRef.current = -1;
  }, [config]);

  // ---- Stock detail ----
  const handleSelectStock = useCallback((code: string) => {
    const stock = displayList.find((s) => s.code === code);
    if (stock) setSelectedStock(stock);
  }, [displayList]);

  const handleBackToList = useCallback(() => {
    setSelectedStock(null);
  }, []);

  // ---- Compute aggregate values ----
  const totalChangePct = displayList.reduce((sum, s) => sum + (Number.isFinite(s.changePct) ? s.changePct : 0), 0);
  const lastUpdated = positions.length > 0
    ? positions.reduce((latest, p) => {
        if (p.updatedAt && p.updatedAt > latest) return p.updatedAt;
        return latest;
      }, '')
    : null;

  // ---- Refresh ----
  const handleRefresh = useCallback(() => {
    // Force re-read positions from storage
    chrome.storage.local.get('stockPositions', (result) => {
      setPositions((result.stockPositions as StockPosition[]) ?? []);
    });
  }, []);

  // ---- Auto-collapse: expanded → collapsed after timeout ----
  useEffect(() => {
    if (!config.enabled || config.autoCollapseSeconds <= 0 || uiState.collapsed || uiState.hidden) return;
    const timer = setTimeout(() => {
      persistState({ collapsed: true });
    }, config.autoCollapseSeconds * 1000);
    return () => clearTimeout(timer);
  }, [config.enabled, config.autoCollapseSeconds, uiState.collapsed, uiState.hidden, persistState]);

  // ---- Prevents rendering before storage data loaded ----
  if (!ready) return null;

  // ---- Not enabled or hidden ----
  if (!config.enabled) return null;
  if (uiState.hidden) return null;

  return (
    <div className={theme === 'light' ? 'theme-light' : ''}>
      <FloatingWidget
        initialPosition={uiState.position}
        collapsed={uiState.collapsed}
        opacity={uiState.opacity}
        panelWidth={uiState.panelWidth}
        panelHeight={uiState.panelHeight}
        stockCount={displayList.length}
        totalChangePct={totalChangePct}
        lastUpdated={lastUpdated}
        onPositionChange={handlePositionChange}
        onToggleCollapse={handleToggleCollapse}
        onClose={handleClose}
        onRefresh={handleRefresh}
        onOpacityChange={(v) => persistState({ opacity: v })}
        onResize={({ w, h }) => persistState({ panelWidth: w, panelHeight: h })}
      >
        {selectedStock ? (
          <StockDetail
            name={selectedStock.name}
            code={selectedStock.code}
            price={selectedStock.price}
            changePct={selectedStock.changePct}
            prevClose={selectedStock.prevClose}
            high={selectedStock.high}
            low={selectedStock.low}
            open={selectedStock.open}
            intradayData={selectedStock.intraday?.data ?? []}
            intradayPrevClose={selectedStock.intraday?.prevClose}
            onBack={handleBackToList}
          />
        ) : displayList.length === 0 ? (
          <div className="float-empty">
            <div className="float-empty-icon">○</div>
            <div className="float-empty-text">暂无股票数据</div>
            <div className="float-empty-hint">请在扩展设置中添加股票</div>
          </div>
        ) : (
          displayList.map((s, i) => (
            <StockCard
              key={s.code}
              name={s.name}
              code={s.code}
              price={s.price}
              changePct={s.changePct}
              prevClose={s.prevClose}
              intradayData={s.intraday?.data ?? []}
              intradayPrevClose={s.intraday?.prevClose}
              index={i}
              onSelect={handleSelectStock}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            />
          ))
        )}
      </FloatingWidget>
    </div>
  );
}
