'use strict';
// In-memory wish store for local development (`npm run dev`). Same interface as lib/store.js.
// Data is lost when the dev server stops; production uses Upstash Redis.
function createMemoryStore({ keep = 300, rateMs = 4000, now = Date.now } = {}) {
  let wishes = [], count = 0, seq = 0;
  const lastPost = new Map();
  return {
    async list(n) { return { count, wishes: wishes.slice(0, n) }; },
    async add(entry) {
      const id = now().toString(36) + (++seq).toString(36);
      wishes.unshift({ id, name: entry.name, wish: entry.wish });
      if (wishes.length > keep) wishes.length = keep;
      count++;
      return id;
    },
    async rateLimit(ip) {
      const t = now(), prev = lastPost.get(ip);
      if (prev != null && t - prev < rateMs) return false;
      lastPost.set(ip, t);
      if (lastPost.size > 5000) lastPost.clear();
      return true;
    }
  };
}
module.exports = { createMemoryStore };
