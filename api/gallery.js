'use strict';
// GET /api/gallery?limit=24&offset=0 -> { total, items: [{ id, name, wish, hearts }] }
// GET /api/gallery?top=3             -> { items }   the most-hearted krathongs (podium)
// krathongs people made and floated, newest first; each one's look comes from /api/look?id=
const { storeFromEnv } = require('../lib/store.js');
const { send } = require('./wishes.js').helpers;

function int(v, def, lo, hi) { const n = parseInt(v, 10); return isNaN(n) ? def : Math.max(lo, Math.min(hi, n)); }

function createGalleryHandler({ store }) {
  return async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.setHeader('Allow', 'GET'); return send(res, 405, { error: 'method' }); }
    const q = new URL(req.url || '/', 'http://x').searchParams;
    if (q.has('top')) {
      if (!store) return send(res, 200, { items: [] });
      try { return send(res, 200, { items: await store.top(int(q.get('top'), 3, 1, 10)) }, 'public, s-maxage=10, stale-while-revalidate=30'); }
      catch (e) { console.error('top failed', e.message); return send(res, 503, { error: 'storage' }); }
    }
    if (!store) return send(res, 200, { total: 0, items: [] });
    try {
      return send(res, 200, await store.gallery(int(q.get('limit'), 24, 1, 48), int(q.get('offset'), 0, 0, 300)), 'public, s-maxage=10, stale-while-revalidate=30');
    } catch (e) {
      console.error('gallery failed', e.message);
      return send(res, 503, { error: 'storage' });
    }
  };
}

let defaultHandler = null;
module.exports = function (req, res) {
  if (!defaultHandler) defaultHandler = createGalleryHandler({ store: storeFromEnv() });
  return defaultHandler(req, res);
};
module.exports.createGalleryHandler = createGalleryHandler;
