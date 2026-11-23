'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadEgg() {
  const window = { navigator: {}, location: { search: '' } };
  const ctx = vm.createContext({ window, document: {}, setTimeout, clearTimeout, Promise, console });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/loykrathong-easter-egg.js'), 'utf8'), ctx);
  return window.LoyKrathongEasterEgg;
}
const mergeFeed = loadEgg()._mergeFeed;
const W = (id, name, wish) => ({ id, name: name || 'n' + id, wish: wish || 'w' + id });
const ids = (xs) => Array.from(xs, (x) => x.id);   // copy out of the vm realm so deepEqual compares plain arrays

test('unseen wishes come back as fresh, oldest first', () => {
  const st = { seen: {}, mine: {} };
  const out = mergeFeed(st, [W('c'), W('b'), W('a')]);   // API returns newest first
  assert.deepEqual(ids(out.fresh), ['a', 'b', 'c']);
  assert.deepEqual(ids(out.pool), []);
});

test('wishes already seen go to the random pool, not fresh', () => {
  const st = { seen: {}, mine: {} };
  mergeFeed(st, [W('b'), W('a')]);
  const out = mergeFeed(st, [W('c'), W('b'), W('a')]);
  assert.deepEqual(ids(out.fresh), ['c']);
  assert.deepEqual(ids(out.pool).sort(), ['a', 'b']);
});

test('my own wishes (by id) are never fresh or pooled', () => {
  const st = { seen: {}, mine: { b: 1 } };
  const out = mergeFeed(st, [W('b'), W('a')]);
  assert.deepEqual(ids(out.fresh), ['a']);
  assert.deepEqual(ids(mergeFeed(st, [W('b'), W('a')]).pool), ['a']);
});

test('a colleague with my name and my wish text still shows up (filtered by id, not name)', () => {
  const st = { seen: {}, mine: { mine1: 1 } };
  const out = mergeFeed(st, [W('x', 'สมใจ', 'ขอให้รวย'), W('mine1', 'สมใจ', 'ขอให้รวย')]);
  assert.deepEqual(ids(out.fresh), ['x']);
});

test('a burst of 50 new wishes keeps only the newest 30 as fresh', () => {
  const st = { seen: {}, mine: {} };
  const list = []; for (let i = 50; i >= 1; i--) list.push(W('id' + i));
  const out = mergeFeed(st, list);
  assert.equal(out.fresh.length, 30);
  assert.equal(out.fresh[0].id, 'id21');
  assert.equal(out.fresh[29].id, 'id50');
});

test('entries without id fall back to name+wish as the key', () => {
  const st = { seen: {}, mine: {} };
  assert.equal(mergeFeed(st, [{ name: 'a', wish: 'x' }]).fresh.length, 1);
  assert.equal(mergeFeed(st, [{ name: 'a', wish: 'x' }]).fresh.length, 0);
});

// ---- review fixes: feed adapter and pacing helpers
function loadEggWith(fetchImpl) {
  const store = {};
  const window = { navigator: {}, location: { search: '' }, localStorage: { getItem: (k) => store[k] || null, setItem: (k, v) => { store[k] = String(v); } } };
  const ctx = vm.createContext({ window, document: {}, setTimeout, clearTimeout, Promise, console, fetch: fetchImpl, AbortController });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/loykrathong-easter-egg.js'), 'utf8'), ctx);
  return window.LoyKrathongEasterEgg;
}

test('save sends the same random client id on every post from this browser', async () => {
  const bodies = [];
  const egg = loadEggWith(async (url, init) => { bodies.push(JSON.parse(init.body)); return { ok: true, status: 201, json: async () => ({ ok: true, id: 'x' }) }; });
  const feed = egg._makeFeed('/api/wishes');
  await feed.save({ name: 'a', wish: 'b' }); await feed.save({ name: 'a', wish: 'c' });
  assert.match(bodies[0].client, /^[A-Za-z0-9-]{8,64}$/);
  assert.equal(bodies[1].client, bodies[0].client);
});

test('load gives up on a hung request after the timeout instead of waiting forever', async () => {
  const egg = loadEggWith((url, init) => new Promise((resolve, reject) => { init.signal.addEventListener('abort', () => reject(new Error('aborted'))); }));
  const feed = egg._makeFeed('/api/wishes', { timeoutMs: 50 });
  const t0 = Date.now();
  await assert.rejects(feed.load(50));
  assert.ok(Date.now() - t0 < 1000);
});

test('poll delay: big screen 3s; phones 12s, 30s after 5 idle minutes; hidden tabs x4', () => {
  const egg = loadEggWith(async () => ({}));
  assert.equal(egg._pollDelay({ screen: true, idleMs: 0, hidden: false }), 3000);
  assert.equal(egg._pollDelay({ screen: false, idleMs: 0, hidden: false }), 12000);
  assert.equal(egg._pollDelay({ screen: false, idleMs: 301000, hidden: false }), 30000);
  assert.equal(egg._pollDelay({ screen: false, idleMs: 0, hidden: true }), 48000);
});

test('label cap: at most 8 wish cards on a phone and 16 on the big screen', () => {
  const egg = loadEggWith(async () => ({}));
  assert.equal(egg._canFloat(7, false), true);
  assert.equal(egg._canFloat(8, false), false);
  assert.equal(egg._canFloat(15, true), true);
  assert.equal(egg._canFloat(16, true), false);
});

test('mergeFeed keeps the design and photo flag so friends see the krathong as it was made', () => {
  const st = { seen: {}, mine: {} };
  const d = { base: 6, flowers: 1, topper: 3, leafColor: 0, leaf: null };
  const out = mergeFeed(st, [Object.assign(W('a'), { design: d, photo: true }), W('b')]);
  const a = out.fresh.find((x) => x.id === 'a'), b = out.fresh.find((x) => x.id === 'b');
  assert.deepEqual(JSON.parse(JSON.stringify(a.design)), d);
  assert.equal(a.photo, true);
  assert.equal(b.design, null);
  assert.equal(b.photo, false);
});
