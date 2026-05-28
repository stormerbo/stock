import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(import.meta.dirname, '..');
const rootManifestPath = path.join(rootDir, 'manifest.json');

test('repo root does not expose an unpacked manifest that points at ts or tsx source files', () => {
  if (!fs.existsSync(rootManifestPath)) {
    assert.ok(true);
    return;
  }

  const manifest = JSON.parse(fs.readFileSync(rootManifestPath, 'utf8')) as {
    background?: { service_worker?: string };
    content_scripts?: Array<{ js?: string[] }>;
    action?: { default_popup?: string };
    options_page?: string;
  };

  const scriptPaths = [
    manifest.background?.service_worker,
    ...(manifest.content_scripts ?? []).flatMap((item) => item.js ?? []),
    manifest.action?.default_popup,
    manifest.options_page,
  ].filter((value): value is string => typeof value === 'string');

  const invalidSourceEntry = scriptPaths.find((value) => /\.tsx?$/i.test(value) || value.startsWith('src/'));
  assert.equal(
    invalidSourceEntry,
    undefined,
    `root manifest should not advertise source entry "${invalidSourceEntry ?? ''}" to Chrome`,
  );
});
