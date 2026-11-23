'use strict';
// test-only fakes for the wish API
const { Readable } = require('node:stream');

function fakeReq({ method = 'GET', url = '/api/wishes', headers = {}, body = '', ip = '1.2.3.4' } = {}) {
  const req = Readable.from(body ? [Buffer.from(body)] : []);
  req.method = method;
  req.url = url;
  req.headers = Object.assign({ host: 'lk.example.app' }, headers);
  req.socket = { remoteAddress: ip };
  return req;
}

function fakeRes() {
  return new Promise((resolve) => {
    const res = {
      statusCode: 200, headers: {},
      setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
      getHeader(k) { return this.headers[k.toLowerCase()]; },
      end(b) { this.raw = b; this.body = b ? String(b) : ''; try { this.json = this.body ? JSON.parse(this.body) : null; } catch (e) { this.json = null; } resolve(this); }
    };
    fakeRes.last = res;
  });
}

// in-memory store with the same interface as lib/store.js
function memoryStore() {
  let wishes = [], count = 0, n = 0;
  const rl = new Map();
  return {
    async list(limit) { return { count, wishes: wishes.slice(0, limit) }; },
    async add(entry) { const id = 'w' + (++n); wishes.unshift(Object.assign({ id }, entry)); wishes = wishes.slice(0, 300); count++; return id; },
    async rateLimit(ip) { if (rl.has(ip)) return false; rl.set(ip, 1); return true; },
    _resetRateLimit() { rl.clear(); }
  };
}

async function call(handler, opts) {
  const done = fakeRes();
  await handler(fakeReq(opts), fakeRes.last);
  return done;
}

module.exports = { fakeReq, fakeRes, memoryStore, call };
