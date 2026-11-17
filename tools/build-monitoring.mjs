import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export async function buildMonitoring() {
  let revision = process.env.VERCEL_GIT_COMMIT_SHA;
  if (!revision) {
    try { revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
    catch { revision = 'local'; }
  }
  await build({
    entryPoints: [path.join(root, 'lib/monitoring-entry.mjs')],
    outfile: path.join(root, 'js/monitoring.bundle.js'),
    bundle: true, format: 'iife', platform: 'browser', target: ['es2020'],
    minify: false, sourcemap: false,
    define: {
      __MONITORING_RELEASE__: JSON.stringify('mg-assistant@' + revision),
      __MONITORING_ENVIRONMENT__: JSON.stringify(process.env.VERCEL_ENV || 'development'),
    },
  });
}
