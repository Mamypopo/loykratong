'use strict';
// Wish storage on Upstash Redis via its REST pipeline endpoint (no npm dependency).
// Keeps only the newest 300 wishes for 7 days: wishes float away, nothing is kept for long.

const LIST = 'lk:wishes', COUNT = 'lk:count';
const KEEP = 300, TTL_SECONDS = 604800, RATE_SECONDS = 4;

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * @param {{url?: string, token?: string, fetch?: Function}} cfg
 * @returns {null | { list(n:number): Promise<{count:number, wishes:{id,name,wish}[]}>,
 *                    add(e:{name:string,wish:string}): Promise<string>, rateLimit(ip:string): Promise<boolean> }}
 */
function createStore(cfg) {
  const url = cfg && cfg.url ? String(cfg.url).replace(/\/+$/, '') : '';
  const token = cfg && cfg.token;
  const doFetch = (cfg && cfg.fetch) || globalThis.fetch;
  if (!url || !token) return null;

  async function pipeline(commands) {
    const r = await doFetch(url + '/pipeline', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(commands.map((c) => c.map(String)))
    });
    if (!r.ok) throw new Error('redis http ' + r.status);
    const out = await r.json();
    if (!Array.isArray(out)) throw new Error('redis bad response');
    const err = out.find((x) => x && x.error);
    if (err) throw new Error('redis: ' + err.error);
    return out.map((x) => x.result);
  }

  return {
    async list(n) {
      const [items, count] = await pipeline([['LRANGE', LIST, 0, n - 1], ['GET', COUNT]]);
      const wishes = [];
      for (const s of items || []) {
        try {
          const w = JSON.parse(s);
          if (w && w.id && w.wish) wishes.push({ id: String(w.id), name: String(w.name || ''), wish: String(w.wish) });
        } catch (e) { /* skip broken entry */ }
      }
      return { count: Number(count) || 0, wishes };
    },
    async add(entry) {
      const id = newId();
      await pipeline([
        ['LPUSH', LIST, JSON.stringify({ id, name: entry.name, wish: entry.wish })],
        ['LTRIM', LIST, 0, KEEP - 1],
        ['EXPIRE', LIST, TTL_SECONDS],
        ['INCR', COUNT]
      ]);
      return id;
    },
    async rateLimit(ip) {
      const [ok] = await pipeline([['SET', 'lk:rl:' + ip, 1, 'NX', 'EX', RATE_SECONDS]]);
      return ok === 'OK';
    }
  };
}

function storeFromEnv(env) {
  env = env || process.env;
  return createStore({
    url: env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL,
    token: env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN
  });
}

module.exports = { createStore, storeFromEnv };
