'use strict';
// Wish storage on Upstash Redis via its REST pipeline endpoint (no npm dependency).
// Keeps only the newest 300 wishes for 7 days: wishes float away, nothing is kept for long.

const LIST = 'lk:wishes', COUNT = 'lk:count', LOOK = 'lk:look:', HEARTS = 'lk:hearts', VOTE = 'lk:hv:';
const KEEP = 300, TTL_SECONDS = 604800, RATE_SECONDS = 4, IP_PER_MINUTE = 120;

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// stored form: { id, name, wish, look?: 1 }; listed form: { id, name, wish, look?: true }.
// The look (design + photo) lives under its own key so the list that every screen polls stays small.
function entryIn(id, e) {
  const o = { id, name: e.name, wish: e.wish };
  if (e.design || e.photo) o.look = 1;
  if (e.kid) o.kid = e.kid;   // which of the person's krathongs (gallery shows each one once)
  return o;
}
function entryOut(w) {
  const o = { id: String(w.id), name: String(w.name || ''), wish: String(w.wish) };
  if (w.look) o.look = true;
  return o;
}

// krathongs (wishes with a look), newest first, one group per kid: shown as its newest float,
// with the ids of all its floats (hearts are counted per float and summed per krathong)
function groupsFrom(raw) {
  const byKey = new Map(), groups = [];
  for (const w of raw) {
    if (!w || !w.look || !w.id) continue;
    const key = w.kid ? 'k:' + w.kid : 'i:' + w.id;
    let g = byKey.get(key);
    if (!g) {
      g = { key, ids: [], item: { id: String(w.id), name: String(w.name || ''), wish: String(w.wish || '') } };
      byKey.set(key, g); groups.push(g);
    }
    g.ids.push(String(w.id));
  }
  return groups;
}
function galleryFrom(raw, limit, offset) {
  const all = groupsFrom(raw).map((g) => g.item);
  return { total: all.length, items: all.slice(offset, offset + limit) };
}
// hearts per krathong: the sum over its floats; counts maps float id -> hearts
function sumHearts(groups, counts) {
  const out = {};
  groups.forEach((g) => { out[g.item.id] = g.ids.reduce((n, id) => n + (Number(counts[id]) || 0), 0); });
  return out;
}

// podium: the most-hearted krathongs (at least one heart), ties keep the newer first; items come newest first
function topFrom(items, hearts, n) {
  return items.map((x, i) => ({ x: Object.assign({}, x, { hearts: Number(hearts[x.id]) || 0 }), i }))
    .filter((e) => e.x.hearts > 0)
    .sort((p, q) => q.x.hearts - p.x.hearts || p.i - q.i)
    .slice(0, n).map((e) => e.x);
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

  async function rawList() {
    const [items] = await pipeline([['LRANGE', LIST, 0, KEEP - 1]]);
    const raw = [];
    for (const s of items || []) { try { raw.push(JSON.parse(s)); } catch (e) { /* skip */ } }
    return raw;
  }
  async function heartsOf(ids) {
    const [h] = await pipeline([['HMGET', HEARTS].concat(ids)]);
    const out = {};
    ids.forEach((id, i) => { out[id] = h && h[i]; });
    return out;
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
    async gallery(limit, offset) {
      const groups = groupsFrom(await rawList()), page = groups.slice(offset, offset + limit);
      const items = page.map((g) => g.item);
      if (items.length) {
        const counts = await heartsOf([].concat(...page.map((g) => g.ids)));
        const sums = sumHearts(page, counts);
        items.forEach((x) => { x.hearts = sums[x.id]; });
      }
      return { total: groups.length, items };
    },
    async top(n) {
      const groups = groupsFrom(await rawList());
      if (!groups.length) return [];
      const sums = sumHearts(groups, await heartsOf([].concat(...groups.map((g) => g.ids))));
      return topFrom(groups.map((g) => g.item), sums, n);
    },
    // one heart per client per krathong (all its floats); counted on this float; null when unknown
    async heart(id, client) {
      const [items, exists] = await pipeline([['LRANGE', LIST, 0, KEEP - 1], ['EXISTS', LOOK + id]]);
      if (!Number(exists)) return null;
      const raw = [];
      for (const s of items || []) { try { raw.push(JSON.parse(s)); } catch (e) { /* skip */ } }
      const g = groupsFrom(raw).find((x) => x.ids.includes(id)) || { key: 'i:' + id, ids: [id] };
      const voteKey = VOTE + (g.key.startsWith('k:') ? g.key : id) + ':' + client;
      const [fresh] = await pipeline([['SET', voteKey, 1, 'NX', 'EX', TTL_SECONDS]]);
      const read = ['HMGET', HEARTS].concat(g.ids);
      const out = fresh === 'OK'
        ? (await pipeline([['HINCRBY', HEARTS, id, 1], ['EXPIRE', HEARTS, TTL_SECONDS], read]))[2]
        : (await pipeline([read]))[0];
      return { hearts: (out || []).reduce((n, v) => n + (Number(v) || 0), 0), already: fresh !== 'OK' };
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

module.exports = { createStore, storeFromEnv, entryIn, entryOut, galleryFrom, groupsFrom, sumHearts, topFrom };
