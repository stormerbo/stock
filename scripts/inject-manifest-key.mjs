import { createHash, createPublicKey } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const manifestPath = path.join(rootDir, 'dist', 'manifest.json');

function resolveKeyPath() {
  const envKey = process.env.EXTENSION_KEY_PEM?.trim();
  if (envKey) {
    const absolute = path.isAbsolute(envKey) ? envKey : path.join(rootDir, envKey);
    if (fs.existsSync(absolute)) return absolute;
  }

  const defaultKey = path.join(rootDir, 'key.pem');
  if (fs.existsSync(defaultKey)) return defaultKey;

  return null;
}

function extensionIdFromDer(derBuffer) {
  const hex = createHash('sha256').update(derBuffer).digest('hex');
  const nibbleMap = 'abcdefghijklmnop';
  let id = '';
  for (const ch of hex.slice(0, 32)) {
    id += nibbleMap[parseInt(ch, 16)];
  }
  return id;
}

function main() {
  if (!fs.existsSync(manifestPath)) {
    console.log(`[inject-key] Skip: manifest not found: ${manifestPath}`);
    return;
  }

  const keyPath = resolveKeyPath();
  if (!keyPath) {
    console.log('[inject-key] Skip: no key.pem found, extension ID may vary.');
    return;
  }

  const pem = fs.readFileSync(keyPath, 'utf8');
  const publicDer = createPublicKey(pem).export({ type: 'spki', format: 'der' });
  const keyBase64 = Buffer.from(publicDer).toString('base64');
  const extensionId = extensionIdFromDer(publicDer);

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.key = keyBase64;
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  console.log(`[inject-key] Injected key from: ${keyPath}`);
  console.log(`[inject-key] Stable extension ID: ${extensionId}`);
}

main();
