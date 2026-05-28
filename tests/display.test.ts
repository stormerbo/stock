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
    {
      colorScheme: 'us',
      decimalPlaces: 4,
      privacyHidden: true,
      stockPrivacyHidden: true,
      fundPrivacyHidden: true,
    },
  );
});

test('normalizeDisplayConfig keeps stock and fund privacy switches independent', () => {
  assert.deepEqual(
    normalizeDisplayConfig({ colorScheme: 'cn', decimalPlaces: 2, stockPrivacyHidden: true, fundPrivacyHidden: false }),
    {
      colorScheme: 'cn',
      decimalPlaces: 2,
      privacyHidden: true,
      stockPrivacyHidden: true,
      fundPrivacyHidden: false,
    },
  );
});
