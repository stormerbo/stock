import test from 'node:test';
import assert from 'node:assert/strict';

import { THEME_STORAGE_KEY, normalizeThemeMode } from '../src/shared/theme.ts';

test('theme storage uses a single shared key', () => {
  assert.equal(THEME_STORAGE_KEY, 'popup-theme');
});

test('normalizeThemeMode falls back to dark for invalid values', () => {
  assert.equal(normalizeThemeMode('light'), 'light');
  assert.equal(normalizeThemeMode('dark'), 'dark');
  assert.equal(normalizeThemeMode('glass'), 'dark');
  assert.equal(normalizeThemeMode(null), 'dark');
});
