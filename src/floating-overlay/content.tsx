import { createRoot, type Root } from 'react-dom/client';
import App from './App';
import { OVERLAY_CSS } from './styles';
import { shouldInjectFloatingOverlay } from './should-inject';
import { applyThemeVariables, normalizeThemeMode, THEME_STORAGE_KEY } from '../shared/theme';
import { DISPLAY_STORAGE_KEY, DEFAULT_DISPLAY_CONFIG, normalizeDisplayConfig } from '../shared/display';
import type { ColorScheme } from '../shared/display';
import type { ThemeMode } from '../popup/types';

let root: Root | null = null;

function mount() {
  if (root) return;
  if (!shouldInjectFloatingOverlay({
    url: window.location.href,
    contentType: document.contentType,
    isTopFrame: window.top === window,
  })) return;

  const host = document.createElement('div');
  host.id = 'money-helper-float-root';
  host.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:2147483646;pointer-events:none';
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: 'closed' });
  const styleEl = document.createElement('style');
  styleEl.textContent = OVERLAY_CSS;
  shadow.appendChild(styleEl);

  const mountPoint = document.createElement('div');
  shadow.appendChild(mountPoint);

  let currentTheme: ThemeMode = 'dark';
  let currentColorScheme: ColorScheme = DEFAULT_DISPLAY_CONFIG.colorScheme;
  const syncThemeVariables = () => {
    applyThemeVariables(host, currentTheme, currentColorScheme);
  };

  const applyFromStorage = (result: Record<string, unknown>) => {
    currentTheme = normalizeThemeMode(result[THEME_STORAGE_KEY]);
    currentColorScheme = normalizeDisplayConfig(result[DISPLAY_STORAGE_KEY]).colorScheme;
    syncThemeVariables();
  };

  syncThemeVariables();
  root = createRoot(mountPoint);

  chrome.storage.sync.get([THEME_STORAGE_KEY, DISPLAY_STORAGE_KEY], (result: Record<string, unknown>) => {
    applyFromStorage(result);
    root?.render(<App initialTheme={currentTheme} />);
  });

  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area !== 'sync') return;
    let dirty = false;
    if (changes[THEME_STORAGE_KEY]) {
      currentTheme = normalizeThemeMode(changes[THEME_STORAGE_KEY].newValue);
      dirty = true;
    }
    if (changes[DISPLAY_STORAGE_KEY]) {
      currentColorScheme = normalizeDisplayConfig(changes[DISPLAY_STORAGE_KEY].newValue).colorScheme;
      dirty = true;
    }
    if (dirty) syncThemeVariables();
  };
  chrome.storage.onChanged.addListener(listener);
}

mount();
