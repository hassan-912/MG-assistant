// Build the static website into dist/ (used by Vercel: `npm run build`).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_FILES, VENDOR } from '../lib/site.mjs';
import { buildMonitoring } from './build-monitoring.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist');
await buildMonitoring();
fs.rmSync(out, { recursive: true, force: true });

const copy = (from, to) => {
  const src = path.join(root, from);
  const dst = path.join(out, to);
  if (!fs.existsSync(src)) throw new Error('Missing ' + from + ' — run npm install first.');
  fs.cpSync(src, dst, { recursive: true, filter: (f) => !/\.(map|md|d\.ts)$|LICENSE|package\.json$|index\.js$/.test(path.basename(f)) || fs.statSync(f).isDirectory() });
};
APP_FILES.forEach((f) => copy(f, f));
Object.entries(VENDOR).forEach(([pub, src]) => copy(src, pub));

let n = 0;
let bytes = 0;
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
  const p = path.join(d, e.name);
  if (e.isDirectory()) walk(p);
  else {
    n++;
    bytes += fs.statSync(p).size;
  }
});
walk(out);
console.log('Built dist/: ' + n + ' files, ' + (bytes / 1048576).toFixed(1) + ' MB');
