'use strict';
// In-memory wish store for local development (`npm run dev`). Same interface as lib/store.js.
// Data is lost when the dev server stops; production uses Upstash Redis.
const { entryIn, entryOut, groupsFrom, sumHearts, topFrom } = require('./store.js');
function createMemoryStore({ keep = 300, rateMs = 4000, ipPerMinute = 120, now = Date.now } = {}) {
  let wishes = [], count = 0, seq = 0;
  const lastPost = new Map(), ipWindow = new Map(), looks = new Map(), hearts = new Map(), votes = new Set();
  const counts = () => { const h = {}; hearts.forEach((v, k) => { h[k] = v; }); return h; };
  return {
    async list(n) { return { count, wishes: wishes.slice(0, n).map(entryOut) }; },
    async add(entry) {
      const id = now().toString(36) + (++seq).toString(36);
      wishes.unshift(entryIn(id, entry));
      if (entry.design || entry.photo) looks.set(id, { design: entry.design || null, photo: entry.photo || null });
      if (wishes.length > keep) wishes.length = keep;
      if (looks.size > keep) looks.delete(looks.keys().next().value);
      count++;
      return id;
    },
    async look(id) { return looks.get(id) || null; },
    async gallery(limit, offset) {
      const groups = groupsFrom(wishes), page = groups.slice(offset, offset + limit), sums = sumHearts(page, counts());
      return { total: groups.length, items: page.map((g) => Object.assign({}, g.item, { hearts: sums[g.item.id] })) };
    },
    async top(n) {
      const groups = groupsFrom(wishes);
      return topFrom(groups.map((g) => g.item), sumHearts(groups, counts()), n);
    },
    // one heart per client per krathong (all its floats), counted on this float
    async heart(id, client) {
      if (!looks.has(id)) return null;
      const g = groupsFrom(wishes).find((x) => x.ids.includes(id)) || { key: 'i:' + id, ids: [id] };
      const key = (g.key.startsWith('k:') ? g.key : id) + ':' + client;
      const already = votes.has(key);
      if (!already) { votes.add(key); hearts.set(id, (hearts.get(id) || 0) + 1); }
      return { hearts: g.ids.reduce((n, x) => n + (hearts.get(x) || 0), 0), already };
    },
    // one wish per client every rateMs, and at most ipPerMinute per IP (fixed one-minute window)
    async allow({ client, ip }) {
      const t = now(), prev = lastPost.get(client);
      const clientOk = !(prev != null && t - prev < rateMs);
      if (clientOk) lastPost.set(client, t);
      let w = ipWindow.get(ip);
      if (!w || t - w.start >= 60000) { w = { start: t, n: 0 }; ipWindow.set(ip, w); }
      w.n++;
      if (lastPost.size > 5000) lastPost.clear();
      if (ipWindow.size > 5000) ipWindow.clear();
      return clientOk && w.n <= ipPerMinute;
    }
  };
}
module.exports = { createMemoryStore };
