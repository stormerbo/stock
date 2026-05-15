import { useEffect, useState, useCallback } from 'react';
import type { StockPosition } from '../shared/fetch';
import {
  CONFIG_KEY, STATE_KEY, DEFAULT_CONFIG, DEFAULT_STATE,
  type FloatingOverlayConfig, type FloatingOverlayState,
} from './config';
import FloatingWidget from './components/FloatingWidget';
import StockCard from './components/StockCard';

type StockDisplay = {
  code: string;
  name: string;
  price: number;
  prevClose: number;
  changePct: number;
  intraday: { data: Array<{ time: string; price: number }>; prevClose: number };
};

export default function App() {
  const [config, setConfig] = useState<FloatingOverlayConfig>(DEFAULT_CONFIG);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [uiState, setUiState] = useState<FloatingOverlayState>(DEFAULT_STATE);
  const [positions, setPositions] = useState<StockPosition[]>([]);
  const [ready, setReady] = useState(false);

  // ---- Load initial data ----
  useEffect(() => {
    chrome.storage.sync.get([CONFIG_KEY, 'popup-theme'], (result) => {
      setConfig((result[CONFIG_KEY] as FloatingOverlayConfig) ?? DEFAULT_CONFIG);
      setTheme((result['popup-theme'] as 'dark' | 'light') ?? 'dark');
    });
    chrome.storage.local.get([STATE_KEY, 'stockPositions'], (result) => {
      setUiState((result[STATE_KEY] as FloatingOverlayState) ?? DEFAULT_STATE);
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
        onPositionChange={handlePositionChange}
        onToggleCollapse={handleToggleCollapse}
        onClose={handleClose}
      >
        {displayList.length === 0 ? (
          <div className="float-empty">
            暂无自选股数据
            <div className="float-empty-hint">请在扩展设置中添加股票</div>
          </div>
        ) : (
          displayList.map((s) => (
            <StockCard
              key={s.code}
              name={s.name}
              code={s.code}
              price={s.price}
              changePct={s.changePct}
              prevClose={s.prevClose}
              intradayData={s.intraday?.data ?? []}
              intradayPrevClose={s.intraday?.prevClose}
            />
          ))
        )}
      </FloatingWidget>
    </div>
  );
}
