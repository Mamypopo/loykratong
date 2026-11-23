'use strict';
// GET /api/photo?id=<wish id> -> the krathong photo as image/jpeg (browser-cached for a day: a wish's photo never changes)
const { storeFromEnv } = require('../lib/store.js');

function fail(res, code) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(String(code));
}

function createPhotoHandler({ store }) {
  return async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.setHeader('Allow', 'GET'); return fail(res, 405); }
    const id = new URL(req.url || '/', 'http://x').searchParams.get('id') || '';
    if (!/^[a-z0-9]{4,32}$/.test(id)) return fail(res, 400);
    if (!store) return fail(res, 404);
    let url;
    try { url = await store.photo(id); } catch (e) { console.error('photo failed', e.message); return fail(res, 503); }
    if (!url || url.indexOf('data:image/jpeg;base64,') !== 0) return fail(res, 404);
    const buf = Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
    res.statusCode = 200;
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Content-Length', String(buf.length));
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end(req.method === 'HEAD' ? undefined : buf);
  };
}

let defaultHandler = null;
module.exports = function (req, res) {
  if (!defaultHandler) defaultHandler = createPhotoHandler({ store: storeFromEnv() });
  return defaultHandler(req, res);
};
module.exports.createPhotoHandler = createPhotoHandler;
