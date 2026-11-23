'use strict';
// GET /api/look?id=<wish id> -> { design, photo } of a krathong someone made (browser-cached for a day: it never changes)
const { storeFromEnv } = require('../lib/store.js');

function send(res, code, body, cache) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', cache || 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(body));
}

function createLookHandler({ store }) {
  return async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.setHeader('Allow', 'GET'); return send(res, 405, { error: 'method' }); }
    const id = new URL(req.url || '/', 'http://x').searchParams.get('id') || '';
    if (!/^[a-z0-9]{4,32}$/.test(id)) return send(res, 400, { error: 'id' });
    if (!store) return send(res, 404, { error: 'not_found' });
    let look;
    try { look = await store.look(id); } catch (e) { console.error('look failed', e.message); return send(res, 503, { error: 'storage' }); }
    if (!look) return send(res, 404, { error: 'not_found' });
    return send(res, 200, { design: look.design || null, photo: look.photo || null }, 'public, max-age=86400, s-maxage=86400, immutable');
  };
}

let defaultHandler = null;
module.exports = function (req, res) {
  if (!defaultHandler) defaultHandler = createLookHandler({ store: storeFromEnv() });
  return defaultHandler(req, res);
};
module.exports.createLookHandler = createLookHandler;
