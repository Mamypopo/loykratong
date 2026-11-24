'use strict';
// In-memory wish store for local development (`npm run dev`). Same interface as lib/store.js.
// Data is lost when the dev server stops; production uses Upstash Redis.
const { entryIn, entryOut, galleryFrom, topFrom } = require('./store.js');
function createMemoryStore({ keep = 300, rateMs = 4000, ipPerMinute = 120, now = Date.now } = {}) {
  let wishes = [], count = 0, seq = 0;
  const lastPost = new Map(), ipWindow = new Map(), looks = new Map(), hearts = new Map(), votes = new Set();
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
      const g = galleryFrom(wishes, limit, offset);
      g.items.forEach((x) => { x.hearts = hearts.get(x.id) || 0; });
      return g;
    },
    async top(n) {
      const h = {}; hearts.forEach((v, k) => { h[k] = v; });
      return topFrom(galleryFrom(wishes, keep, 0).items, h, n);
    },
    async heart(id, client) {
      if (!looks.has(id)) return null;
      const key = id + ':' + client;
      if (votes.has(key)) return { hearts: hearts.get(id) || 0, already: true };
      votes.add(key);
      hearts.set(id, (hearts.get(id) || 0) + 1);
      return { hearts: hearts.get(id), already: false };
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
