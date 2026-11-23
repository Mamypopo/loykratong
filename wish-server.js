#!/usr/bin/env node
/*
 * Local development server — mirrors what Vercel serves, with no dependencies.
 *   npm run dev            -> http://localhost:5173   (and /?screen=1 for the big screen)
 *
 * - Static files from public/ (only the files listed in PUBLIC)
 * - /api/wishes handled by the same code as on Vercel (api/wishes.js)
 * - Storage: Upstash Redis if KV_REST_API_URL/KV_REST_API_TOKEN are set, otherwise in memory
 * - Response headers taken from vercel.json, so CSP problems show up locally too
 *
 * Env: PORT (5173), HOST (127.0.0.1; use 0.0.0.0 to test from a phone on the same Wi-Fi)
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { createHandler } = require('./api/wishes.js');
const { storeFromEnv } = require('./lib/store.js');
const { createMemoryStore } = require('./lib/memory-store.js');

const PORT = Number(process.env.PORT) || 5173;
const HOST = process.env.HOST || '127.0.0.1';
const ROOT = path.join(__dirname, 'public');
const PUBLIC = new Set(['index.html', 'app.js', 'filter.js', 'loykrathong-easter-egg.js', 'semed-logo.png']);
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.json': 'application/json'
};

// headers from vercel.json: [{ source, headers: [{ key, value }] }]; "/(.*)" matches all, other sources match exactly
function vercelHeaders(urlPath) {
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'vercel.json'), 'utf8')); } catch (e) { return {}; }
  const out = {};
  for (const rule of cfg.headers || []) {
    const re = new RegExp('^' + rule.source.replace(/\(\.\*\)/g, '.*') + '$');
    if (re.test(urlPath)) for (const h of rule.headers) out[h.key] = h.value;
  }
  return out;
}

const store = storeFromEnv() || createMemoryStore();
const api = createHandler({ store });

http.createServer((req, res) => {
  let url;
  try { url = new URL(req.url, 'http://localhost'); } catch (e) { res.statusCode = 400; return res.end(); }
  for (const [k, v] of Object.entries(vercelHeaders(url.pathname))) res.setHeader(k, v);
  if (url.pathname === '/api/wishes') return api(req, res);

  if (req.method !== 'GET' && req.method !== 'HEAD') { res.statusCode = 405; return res.end(); }
  let name;
  try { name = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html'; } catch (e) { res.statusCode = 400; return res.end(); }
  if (!PUBLIC.has(name)) { res.statusCode = 404; return res.end('Not found'); }
  fs.readFile(path.join(ROOT, name), (err, buf) => {
    if (err) { res.statusCode = 404; return res.end('Not found'); }
    res.setHeader('Content-Type', MIME[path.extname(name)] || 'application/octet-stream');
    res.end(req.method === 'HEAD' ? undefined : buf);
  });
}).listen(PORT, HOST, () => {
  console.log('Loy Krathong dev server: http://localhost:' + PORT + '   big screen: http://localhost:' + PORT + '/?screen=1');
  console.log('Storage: ' + (storeFromEnv() ? 'Upstash Redis' : 'in memory (lost on restart)'));
});
