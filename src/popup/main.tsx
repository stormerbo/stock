import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { applyThemeVariables, normalizeThemeMode, THEME_STORAGE_KEY } from '../shared/theme';
import { DEFAULT_DISPLAY_CONFIG, DISPLAY_STORAGE_KEY, normalizeDisplayConfig } from '../shared/display';

function bootstrapThemeVariables() {
  const theme = normalizeThemeMode(window.localStorage.getItem(THEME_STORAGE_KEY));
  let displayConfig = DEFAULT_DISPLAY_CONFIG;
  try {
    const raw = window.localStorage.getItem(DISPLAY_STORAGE_KEY);
    displayConfig = raw ? normalizeDisplayConfig(JSON.parse(raw)) : DEFAULT_DISPLAY_CONFIG;
  } catch {
    displayConfig = DEFAULT_DISPLAY_CONFIG;
  }
  applyThemeVariables(document, theme, displayConfig.colorScheme);
}

bootstrapThemeVariables();

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
