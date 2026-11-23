'use strict';
// In-memory wish store for local development (`npm run dev`). Same interface as lib/store.js.
// Data is lost when the dev server stops; production uses Upstash Redis.
const { entryIn, entryOut } = require('./store.js');
function createMemoryStore({ keep = 300, rateMs = 4000, ipPerMinute = 120, now = Date.now } = {}) {
  let wishes = [], count = 0, seq = 0;
  const lastPost = new Map(), ipWindow = new Map(), photos = new Map();
  return {
    async list(n) { return { count, wishes: wishes.slice(0, n).map(entryOut) }; },
    async add(entry) {
      const id = now().toString(36) + (++seq).toString(36);
      wishes.unshift(entryIn(id, entry));
      if (entry.photo) photos.set(id, entry.photo);
      if (wishes.length > keep) wishes.length = keep;
      if (photos.size > keep) photos.delete(photos.keys().next().value);
      count++;
      return id;
    },
    async photo(id) { return photos.get(id) || null; },
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
