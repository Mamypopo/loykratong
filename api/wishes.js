'use strict';
// GET  /api/wishes            -> { count, wishes: [{ id, name, wish }] } newest first (edge-cached 3s)
// POST /api/wishes {name,wish,client?,design?,photo?} -> 201 { ok, id } | 400 | 403 | 405 | 413 | 415 | 422 | 429 | 503
const { check, HIDDEN } = require('../public/filter.js');
const { storeFromEnv } = require('../lib/store.js');
const design = require('../public/design.js');

const MAX_NAME = 40, MAX_WISH = 80, MAX_BODY = 81920, LIST_SIZE = 50;

function clean(s, n) {
  return String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(HIDDEN, '').replace(/\s+/g, ' ').trim().slice(0, n);
}

function send(res, code, body, cache) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', cache || 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(body));
}

function clientIp(req) {
  const h = req.headers;
  return String(h['x-real-ip'] || String(h['x-forwarded-for'] || '').split(',')[0] || (req.socket && req.socket.remoteAddress) || '').trim() || 'unknown';
}

// only this site may post: Origin absent (same-origin tooling) or equal to our own host
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return origin === 'https://' + host || origin === 'http://' + host;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error('too big'), { code: 413 })); req.destroy && req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function createHandler({ store }) {
  return async function handler(req, res) {
    if (req.method === 'GET' || req.method === 'HEAD') {
      if (!store) return send(res, 200, { count: 0, wishes: [] }, 'no-store');
      try {
        return send(res, 200, await store.list(LIST_SIZE), 'public, s-maxage=3, stale-while-revalidate=10');
      } catch (e) {
        console.error('list failed', e.message);
        return send(res, 503, { error: 'storage' });   // the client keeps what it already shows
      }
    }
    if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return send(res, 405, { error: 'method' }); }

    if (!sameOrigin(req)) return send(res, 403, { error: 'origin' });
    if (!/^application\/json\b/i.test(String(req.headers['content-type'] || ''))) return send(res, 415, { error: 'json_only' });
    if (Number(req.headers['content-length']) > MAX_BODY) return send(res, 413, { error: 'too_big' });

    let raw;
    try { raw = await readBody(req); } catch (e) { return send(res, e.code === 413 ? 413 : 400, { error: e.code === 413 ? 'too_big' : 'bad_body' }); }
    let data;
    try { data = JSON.parse(raw); } catch (e) { return send(res, 400, { error: 'bad_json' }); }
    if (!data || typeof data !== 'object') data = {};

    const name = clean(data && data.name, MAX_NAME), wish = clean(data && data.wish, MAX_WISH);
    if (!wish) return send(res, 400, { error: 'empty' });
    if (!check(wish).ok || (name && !check(name).ok)) return send(res, 422, { error: 'blocked' });
    let photo = null;
    if (data.photo != null && data.photo !== '') {
      if (!design.photoOk(data.photo)) return send(res, 422, { error: 'bad_photo' });
      if (!name) return send(res, 400, { error: 'photo_needs_name' });   // a face on the big screen should have a name on it
      photo = data.photo;
    }
    const look = design.sanitize(data.design);
    if (!store) return send(res, 503, { error: 'storage' });

    try {
      // limit per browser (random id kept in localStorage), because a whole office shares one public IP;
      // the per-IP ceiling only stops scripted floods
      const ip = clientIp(req);
      const client = /^[A-Za-z0-9-]{8,64}$/.test(String(data.client || '')) ? String(data.client) : 'ip-' + ip;
      if (!(await store.allow({ client, ip }))) return send(res, 429, { error: 'too_many' });
      const id = await store.add({ name, wish, design: look, photo });
      return send(res, 201, { ok: true, id });
    } catch (e) {
      console.error('add failed', e.message);
      return send(res, 503, { error: 'storage' });
    }
  };
}

let defaultHandler = null;
module.exports = function (req, res) {
  if (!defaultHandler) defaultHandler = createHandler({ store: storeFromEnv() });
  return defaultHandler(req, res);
};
module.exports.createHandler = createHandler;
