// Visa File Review — local web server (the same site that is deployed to Vercel).
// Documents are read in the browser; this server only serves the files and the exchange rates.
// Start:  node server.mjs   (or double-click start.bat)  →  http://localhost:5178
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_FILES, vendorSource } from './lib/site.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 5178;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.wasm': 'application/wasm',
  '.gz': 'application/gzip', '.bcmap': 'application/octet-stream', '.pfb': 'application/octet-stream', '.ttf': 'font/ttf',
};

let fxCache = null;
async function rates() {
  if (fxCache && Date.now() - fxCache.at < 6 * 3600 * 1000) return fxCache.body;
  const r = await fetch('https://open.er-api.com/v6/latest/EUR');
  const j = await r.json();
  if (!r.ok || j.result !== 'success' || !j.rates) throw new Error('rates unavailable');
  fxCache = { at: Date.now(), body: { base: 'EUR', date: j.time_last_update_utc || '', rates: j.rates } };
  return fxCache.body;
}

const allowed = (p) => APP_FILES.some((f) => (f.endsWith('/') ? p.startsWith(f) : p === f));

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/rates') {
      try {
        const body = await rates();
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        return res.end(JSON.stringify(body));
      } catch (e) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Live exchange rates unavailable: ' + e.message }));
      }
    }
    let p = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    if (p === '') p = 'index.html';
    const src = allowed(p) ? p : vendorSource(p);
    const file = src && path.normalize(path.join(here, src));
    if (!file || !file.startsWith(here + path.sep)) {
      res.writeHead(404);
      return res.end('Not found');
    }
    fs.readFile(file, (err, buf) => {
      if (err) {
        res.writeHead(404);
        return res.end('Not found');
      }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': p.startsWith('vendor/') ? 'public, max-age=86400' : 'no-cache' });
      res.end(buf);
    });
  } catch (e) {
    res.writeHead(500);
    res.end('Server error');
  }
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.log('Visa File Review is already running — open http://localhost:' + PORT + ' in your browser.');
    process.exit(0);
  }
  throw e;
});
server.listen(PORT, '127.0.0.1', () => {
  console.log('Visa File Review running at http://localhost:' + PORT);
  console.log('Documents are read in your browser — nothing is uploaded anywhere.');
});
