'use strict';
// Wish storage on Upstash Redis via its REST pipeline endpoint (no npm dependency).
// Keeps only the newest 300 wishes for 7 days: wishes float away, nothing is kept for long.

const LIST = 'lk:wishes', COUNT = 'lk:count', LOOK = 'lk:look:';
const KEEP = 300, TTL_SECONDS = 604800, RATE_SECONDS = 4, IP_PER_MINUTE = 120;

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// stored form: { id, name, wish, look?: 1 }; listed form: { id, name, wish, look?: true }.
// The look (design + photo) lives under its own key so the list that every screen polls stays small.
function entryIn(id, e) {
  const o = { id, name: e.name, wish: e.wish };
  if (e.design || e.photo) o.look = 1;
  return o;
}
function entryOut(w) {
  const o = { id: String(w.id), name: String(w.name || ''), wish: String(w.wish) };
  if (w.look) o.look = true;
  return o;
}

/**
 * @param {{url?: string, token?: string, fetch?: Function}} cfg
 * @returns {null | { list(n:number): Promise<{count:number, wishes:{id,name,wish}[]}>,
 *                    add(e:{name:string,wish:string,design?:object,photo?:string}): Promise<string>, look(id:string): Promise<{design, photo}|null>, allow(k:{client:string, ip:string}): Promise<boolean> }}
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
          if (w && w.id && w.wish) wishes.push(entryOut(w));
        } catch (e) { /* skip broken entry */ }
      }
      return { count: Number(count) || 0, wishes };
    },
    async add(entry) {
      const id = newId();
      const cmds = [
        ['LPUSH', LIST, JSON.stringify(entryIn(id, entry))],
        ['LTRIM', LIST, 0, KEEP - 1],
        ['EXPIRE', LIST, TTL_SECONDS],
        ['INCR', COUNT]
      ];
      if (entry.design || entry.photo) cmds.push(['SET', LOOK + id, JSON.stringify({ design: entry.design || null, photo: entry.photo || null }), 'EX', TTL_SECONDS]);
      await pipeline(cmds);
      return id;
    },
    async look(id) {
      const [v] = await pipeline([['GET', LOOK + id]]);
      if (!v) return null;
      try { return JSON.parse(v); } catch (e) { return null; }
    },
    // one wish per client every RATE_SECONDS, and at most IP_PER_MINUTE per public IP
    async allow({ client, ip }) {
      const ipKey = 'lk:rl:ip:' + ip;
      const [clientOk, , ipCount] = await pipeline([
        ['SET', 'lk:rl:c:' + client, 1, 'NX', 'EX', RATE_SECONDS],
        ['SET', ipKey, 0, 'NX', 'EX', 60],
        ['INCR', ipKey]
      ]);
      return clientOk === 'OK' && Number(ipCount) <= IP_PER_MINUTE;
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

module.exports = { createStore, storeFromEnv, entryIn, entryOut };
