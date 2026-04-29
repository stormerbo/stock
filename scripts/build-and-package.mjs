import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const releaseDir = path.join(rootDir, 'release');
const packageJsonPath = path.join(rootDir, 'package.json');

function runCommand(command, args, cwd = rootDir) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: false,
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(' ')}`);
  }
}

function runCommandCapture(command, args, cwd = rootDir) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const stderr = result.stderr?.toString('utf8')?.trim();
    throw new Error(`Command failed: ${command} ${args.join(' ')}${stderr ? `\n${stderr}` : ''}`);
  }
  return result.stdout;
}

function getTimestamp() {
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}

function resolveKeyPath() {
  const envKey = process.env.EXTENSION_KEY_PEM?.trim();
  if (envKey) {
    // 如果 env 值本身就是 PEM 内容（不以路径分隔符开头），写入临时文件
    if (envKey.startsWith('-----BEGIN')) {
      const tmpPath = path.join(rootDir, '.tmp-key.pem');
      fs.writeFileSync(tmpPath, envKey, 'utf8');
      return tmpPath;
    }
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

function injectManifestKey(distManifestPath, keyPath) {
  const pubDer = runCommandCapture('openssl', ['pkey', '-in', keyPath, '-pubout', '-outform', 'DER']);
  const keyBase64 = Buffer.from(pubDer).toString('base64');
  const extId = extensionIdFromDer(pubDer);

  const manifest = JSON.parse(fs.readFileSync(distManifestPath, 'utf8'));
  manifest.key = keyBase64;
  fs.writeFileSync(distManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  return extId;
}

function main() {
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const pkgName = String(pkg.name || 'extension').replace(/[^a-zA-Z0-9._-]/g, '-');
  const pkgVersion = String(pkg.version || '0.0.0');

  console.log('[package] Running build...');
  runCommand('npx', ['tsc']);
  runCommand('npx', ['vite', 'build']);
  runCommand('node', ['scripts/inject-manifest-key.mjs']);

  const manifestPath = path.join(distDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Build output is invalid: missing ${manifestPath}`);
  }

  const keyPath = resolveKeyPath();
  let stableId = null;
  if (keyPath) {
    stableId = injectManifestKey(manifestPath, keyPath);
    console.log(`[package] Using key: ${keyPath}`);
    console.log(`[package] Stable extension ID: ${stableId}`);
  } else {
    console.log('[package] No key.pem found, package ID may vary across builds.');
  }

  fs.mkdirSync(releaseDir, { recursive: true });

  // Clean up old release zips
  const existingZips = fs.readdirSync(releaseDir).filter((f) => f.endsWith('.zip'));
  for (const zip of existingZips) {
    fs.unlinkSync(path.join(releaseDir, zip));
  }
  if (existingZips.length > 0) {
    console.log(`[package] Removed ${existingZips.length} old release(s)`);
  }

  const zipName = `${pkgName}-v${pkgVersion}-${getTimestamp()}.zip`;
  const zipPath = path.join(releaseDir, zipName);

  console.log(`[package] Creating zip: ${zipPath}`);
  runCommand('zip', ['-r', zipPath, '.', '-x', '*.DS_Store'], distDir);

  console.log(`[package] Done: ${zipPath}`);
}

main();
