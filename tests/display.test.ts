import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_DISPLAY_CONFIG, normalizeDisplayConfig } from '../src/shared/display.ts';

test('normalizeDisplayConfig fills defaults for missing fields', () => {
  assert.deepEqual(
    normalizeDisplayConfig({}),
    DEFAULT_DISPLAY_CONFIG,
  );
});

test('normalizeDisplayConfig preserves privacy toggle and clamps decimal places', () => {
  assert.deepEqual(
    normalizeDisplayConfig({ colorScheme: 'us', decimalPlaces: 9, privacyHidden: true }),
    { colorScheme: 'us', decimalPlaces: 4, privacyHidden: true },
  );
});
