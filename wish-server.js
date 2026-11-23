#!/usr/bin/env node
/*
 * Reference server for the Loy Krathong easter egg (Node.js, no dependencies).
 * One instance can serve every website: they all load the same script/logo from here
 * and read/write the same pool of wishes.
 *
 *   node wish-server.js                                   -> http://localhost:5173
 *   ALLOWED_ORIGINS="https://a.example.co.th,https://b.example.co.th" HOST=0.0.0.0 node wish-server.js
 *
 * - Serves loykrathong-easter-egg.js and semed-logo.png (+ the demo index.html) with CORS, so
 *   other sites can load them (the logo is a WebGL texture, which requires CORS)
 * - GET  /api/wishes?limit=20        -> random sample: [{ "name": "...", "wish": "..." }, ...]
 * - POST /api/wishes  {"name","wish"} -> stores a wish (wishes.json next to this file)
 * - Only origins in ALLOWED_ORIGINS may call the API; each stored wish records which site sent it
 *
 * Environment variables:
 *   PORT              default 5173
 *   HOST              default 127.0.0.1 (use 0.0.0.0 behind your reverse proxy)
 *   ALLOWED_ORIGINS   comma-separated list of site origins, e.g. https://www.example.co.th
 *   TRUST_PROXY=1     take the client IP from X-Forwarded-For (only when behind your own proxy)
 *   DATA_FILE         where to store wishes (default ./wishes.json)
 *
 * This is a starting point to port into your real backend. Add moderation before going live.
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 5173;
const HOST = process.env.HOST || '127.0.0.1';
const ROOT = __dirname;
const DATA_FILE = process.env.DATA_FILE || path.join(ROOT, 'wishes.json');
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const MAX_STORED = 2000;          // keep the newest N wishes
const MAX_NAME = 40, MAX_WISH = 80;
const POST_GAP_MS = 4000;         // one wish per client every few seconds
const BLOCKED = [];               // add words to reject, e.g. ['คำหยาบ']

// Websites allowed to use the wish API. Edit here or set ALLOWED_ORIGINS.
// An origin is scheme + host (+ port), with no path or trailing slash: https://www.example.co.th
const ALLOWED_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean)
);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.json': 'application/json; charset=utf-8', '.ico': 'image/x-icon'
};
// only these files may be served (never the server, its data or dotfiles)
const PUBLIC = new Set(['index.html', 'loykrathong-easter-egg.js', 'semed-logo.png']);
// files other websites embed: served with CORS so <script>, fonts and WebGL textures work cross-site
const SHARED_ASSETS = new Set(['loykrathong-easter-egg.js', 'semed-logo.png']);

let wishes = [];
try { wishes = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); if (!Array.isArray(wishes)) wishes = []; } catch (e) { wishes = []; }

let saveTimer = null;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.writeFile(DATA_FILE + '.tmp', JSON.stringify(wishes), (err) => {
      if (!err) fs.rename(DATA_FILE + '.tmp', DATA_FILE, () => {});
    });
  }, 300);
}

function clean(s, n) {
  return String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
}

function send(res, code, body, type, extra) {
  res.writeHead(code, Object.assign({
    'Content-Type': type || 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'
  }, extra || {}));
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function clientIp(req) {
  if (TRUST_PROXY) {
    const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (xf) return xf;
  }
  return req.socket.remoteAddress || '';
}

// CORS headers for the API, only for allowed origins
function apiCors(req) {
  const origin = req.headers.origin;
  const h = { Vary: 'Origin' };
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    h['Access-Control-Allow-Origin'] = origin;
    h['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    h['Access-Control-Allow-Headers'] = 'Content-Type';
    h['Access-Control-Max-Age'] = '600';
  }
  return h;
}

const lastPost = new Map();
setInterval(() => { // forget old rate-limit entries
  const cutoff = Date.now() - POST_GAP_MS;
  for (const [ip, t] of lastPost) if (t < cutoff) lastPost.delete(ip);
}, 60000).unref();

function handleApi(req, res, url) {
  const cors = apiCors(req);
  const origin = req.headers.origin;
  const allowed = !origin || ALLOWED_ORIGINS.has(origin);   // no Origin = same-site page or server-to-server

  if (req.method === 'OPTIONS') {                           // CORS preflight
    return send(res, allowed ? 204 : 403, '', 'text/plain', cors);
  }
  if (req.method === 'GET') {
    if (!allowed) return send(res, 403, { error: 'origin' }, null, cors);
    const limit = Math.max(1, Math.min(30, parseInt(url.searchParams.get('limit'), 10) || 20));
    const pool = wishes.slice();
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    return send(res, 200, pool.slice(0, limit).map((w) => ({ name: w.name, wish: w.wish })), null, cors);
  }
  if (req.method === 'POST') {
    // reject other sites, and non-JSON bodies (blocks cross-site "simple" text/plain posts)
    if (!allowed) return send(res, 403, { error: 'origin' }, null, cors);
    if (!/^application\/json\b/i.test(String(req.headers['content-type'] || ''))) return send(res, 415, { error: 'json_only' }, null, cors);
    const ip = clientIp(req);
    const now = Date.now();
    if (now - (lastPost.get(ip) || 0) < POST_GAP_MS) return send(res, 429, { error: 'too_many' }, null, cors);
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (c) => { body += c; if (body.length > 4096) req.destroy(); });
    req.on('end', () => {
      let data;
      try { data = JSON.parse(body); } catch (e) { return send(res, 400, { error: 'bad_json' }, null, cors); }
      const wish = clean(data && data.wish, MAX_WISH), name = clean(data && data.name, MAX_NAME);
      if (!wish) return send(res, 400, { error: 'empty' }, null, cors);
      if (BLOCKED.some((w) => w && wish.includes(w))) return send(res, 422, { error: 'blocked' }, null, cors);
      lastPost.set(ip, now);
      // remember which website it came from (for moderation); never sent back to clients
      wishes.push({ name, wish, site: origin || 'same-origin', at: new Date(now).toISOString() });
      if (wishes.length > MAX_STORED) wishes = wishes.slice(-MAX_STORED);
      persist();
      send(res, 201, { ok: true }, null, cors);
    });
    return;
  }
  send(res, 405, { error: 'method' }, null, Object.assign({ Allow: 'GET, POST, OPTIONS' }, cors));
}

function handleStatic(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed', 'text/plain');
  let name;
  try { name = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html'; } catch (e) { return send(res, 400, 'Bad request', 'text/plain'); }
  if (!PUBLIC.has(name)) return send(res, 404, 'Not found', 'text/plain');
  fs.readFile(path.join(ROOT, name), (err, buf) => {
    if (err) return send(res, 404, 'Not found', 'text/plain');
    const headers = { 'Content-Type': MIME[path.extname(name)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' };
    if (SHARED_ASSETS.has(name)) {
      headers['Access-Control-Allow-Origin'] = '*';           // public assets, no credentials
      headers['Cross-Origin-Resource-Policy'] = 'cross-origin';
    }
    res.writeHead(200, headers);
    res.end(req.method === 'HEAD' ? undefined : buf);
  });
}

http.createServer((req, res) => {
  let url;
  try { url = new URL(req.url, 'http://localhost'); } catch (e) { return send(res, 400, 'Bad request', 'text/plain'); }
  if (url.pathname === '/api/wishes') return handleApi(req, res, url);
  return handleStatic(req, res, url);
}).listen(PORT, HOST, () => {
  console.log('Loy Krathong server: http://localhost:' + PORT + '  (' + wishes.length + ' wishes stored)');
  console.log('Allowed sites: ' + Array.from(ALLOWED_ORIGINS).join(', '));
});
