import test from 'node:test';
import assert from 'node:assert/strict';

import { shouldInjectFloatingOverlay } from '../src/floating-overlay/should-inject.ts';

test('injects on top-level https html pages', () => {
  assert.equal(shouldInjectFloatingOverlay({
    url: 'https://example.com/watchlist',
    contentType: 'text/html',
    isTopFrame: true,
  }), true);
});

test('skips non-http protocols', () => {
  assert.equal(shouldInjectFloatingOverlay({
    url: 'file:///Users/stormer/report.html',
    contentType: 'text/html',
    isTopFrame: true,
  }), false);
});

test('skips non-html documents', () => {
  assert.equal(shouldInjectFloatingOverlay({
    url: 'https://example.com/report.pdf',
    contentType: 'application/pdf',
    isTopFrame: true,
  }), false);
});

test('skips nested frames', () => {
  assert.equal(shouldInjectFloatingOverlay({
    url: 'https://example.com/embedded',
    contentType: 'text/html',
    isTopFrame: false,
  }), false);
});
