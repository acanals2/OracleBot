/**
 * Copies legacy static assets from repo root into platform/public/
 * so Vite emits them alongside the SPA (oraclebot.net/trading.html, /css/*, etc.).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');
const publicDir = path.join(repoRoot, 'platform', 'public');

const copies = [
  ['css', path.join(repoRoot, 'css'), path.join(publicDir, 'css')],
  ['js', path.join(repoRoot, 'js'), path.join(publicDir, 'js')],
];

function rmIfExists(p) {
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
}

for (const [, src, dest] of copies) {
  if (!fs.existsSync(src)) {
    console.warn(`sync-public-assets: skip missing ${src}`);
    continue;
  }
  rmIfExists(dest);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
}

const files = [
  ['trading.html', path.join(repoRoot, 'trading.html'), path.join(publicDir, 'trading.html')],
  [
    'sample-readiness-report.html',
    path.join(repoRoot, 'sample-readiness-report.html'),
    path.join(publicDir, 'sample-readiness-report.html'),
  ],
];

for (const [label, src, dest] of files) {
  if (!fs.existsSync(src)) {
    console.warn(`sync-public-assets: skip missing ${label}`);
    continue;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

console.log('sync-public-assets: updated platform/public for build');
