'use strict';
// POST /api/heart { id, client } -> 200 { hearts, already } | 400 | 403 | 404 | 503
// one heart per browser per krathong
const { storeFromEnv } = require('../lib/store.js');
const { send, sameOrigin, readBody } = require('./wishes.js').helpers;

function createHeartHandler({ store }) {
  return async function handler(req, res) {
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return send(res, 405, { error: 'method' }); }
    if (!sameOrigin(req)) return send(res, 403, { error: 'origin' });
    if (!/^application\/json\b/i.test(String(req.headers['content-type'] || ''))) return send(res, 415, { error: 'json_only' });
    let data;
    try { data = JSON.parse(await readBody(req)); } catch (e) { return send(res, 400, { error: 'bad_json' }); }
    const id = String((data && data.id) || ''), client = String((data && data.client) || '');
    if (!/^[a-z0-9]{4,32}$/.test(id) || !/^[A-Za-z0-9-]{8,64}$/.test(client)) return send(res, 400, { error: 'bad_input' });
    if (!store) return send(res, 503, { error: 'storage' });
    try {
      const r = await store.heart(id, client);
      return r ? send(res, 200, r) : send(res, 404, { error: 'not_found' });
    } catch (e) {
      console.error('heart failed', e.message);
      return send(res, 503, { error: 'storage' });
    }
  };
}

let defaultHandler = null;
module.exports = function (req, res) {
  if (!defaultHandler) defaultHandler = createHeartHandler({ store: storeFromEnv() });
  return defaultHandler(req, res);
};
module.exports.createHeartHandler = createHeartHandler;
