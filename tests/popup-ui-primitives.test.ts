import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { Badge, Button, Input, ModalShell, Panel } from '../src/popup/components/ui/index.ts';

test('Button renders semantic variant and loading state', () => {
  const html = renderToStaticMarkup(
    React.createElement(Button, { variant: 'primary', loading: true }, '保存'),
  );

  assert.match(html, /ui-button/);
  assert.match(html, /ui-button--primary/);
  assert.match(html, /ui-button--loading/);
  assert.match(html, /disabled/);
});

test('Badge renders a positive tone', () => {
  const html = renderToStaticMarkup(
    React.createElement(Badge, { tone: 'positive' }, '上涨'),
  );

  assert.match(html, /ui-badge/);
  assert.match(html, /ui-badge--positive/);
  assert.match(html, /上涨/);
});

test('Input supports compact density', () => {
  const html = renderToStaticMarkup(
    React.createElement(Input, { compact: true, value: '12.3', onChange: () => undefined }),
  );

  assert.match(html, /ui-input/);
  assert.match(html, /ui-input--compact/);
});

test('Panel exposes surface styling', () => {
  const html = renderToStaticMarkup(
    React.createElement(Panel, null, '内容'),
  );

  assert.match(html, /ui-panel/);
  assert.match(html, /内容/);
});

test('ModalShell renders open content and footer actions', () => {
  const html = renderToStaticMarkup(
    React.createElement(
      ModalShell,
      {
        open: true,
        title: '确认操作',
        onClose: () => undefined,
        footer: React.createElement('div', null, 'footer'),
      },
      React.createElement('div', null, 'body'),
    ),
  );

  assert.match(html, /role="dialog"/);
  assert.match(html, /确认操作/);
  assert.match(html, /body/);
  assert.match(html, /footer/);
});
