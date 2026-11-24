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

test('mergeFeed keeps the look flag so friends see the krathong as it was made', () => {
  const st = { seen: {}, mine: {} };
  const out = mergeFeed(st, [Object.assign(W('a'), { look: true }), W('b')]);
  assert.equal(out.fresh.find((x) => x.id === 'a').look, true);
  assert.equal(out.fresh.find((x) => x.id === 'b').look, false);
});

const eggF = loadEgg();
test('pickFortune: a slip number in range, never the same one twice in a row', () => {
  const n = eggF._FORTUNES.length;
  assert.ok(n >= 20);
  for (let prev = -1; prev < n; prev++) {
    for (const r of [0, 0.5, 0.999]) {
      const i = eggF._pickFortune(prev, () => r);
      assert.ok(i >= 0 && i < n);
      assert.notEqual(i, prev);
    }
  }
  eggF._FORTUNES.forEach((f) => { assert.ok(f.text && f.rank, JSON.stringify(f)); });
});

test('shake detector: a drag counts one shake each time it swings back after travelling far enough', () => {
  const run = (dxs) => { const feed = eggF._shakeDetector(12); return dxs.reduce((n, dx) => n + (feed(dx) ? 1 : 0), 0); };
  assert.equal(run([5, 5, 5]), 0);                         // one way only: no shake yet
  assert.equal(run([5, 5, 5, -5]), 1);                     // swung back after 15 px: one shake
  assert.equal(run([2, -2, 2, -2]), 0);                    // jitter does not count
  assert.equal(run([8, 8, -8, -8, 8, 8]), 2);              // back, then forth again: two shakes
});

test('luckyNumbers: a 2-digit and a 3-digit number, zero-padded', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(eggF._luckyNumbers(() => 0))), { two: '00', three: '000' });
  assert.deepEqual(JSON.parse(JSON.stringify(eggF._luckyNumbers(() => 0.999))), { two: '99', three: '999' });
  const seq = [0.07, 0.042]; let k = 0;
  assert.deepEqual(JSON.parse(JSON.stringify(eggF._luckyNumbers(() => seq[k++]))), { two: '07', three: '042' });
});

// old wishes keep the river company: each one comes round once before any comes back
test('replay bag shows every old wish once before repeating, skipping the opening ones', () => {
  const egg = loadEgg();
  let s = 1; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const r = egg._makeReplay(rnd);
  r.add([W('a'), W('b'), W('c'), W('d')]);
  r.skip(['a']);   // already floated in the opening batch
  const first = [r.next(), r.next(), r.next()].map((x) => x.id).sort();
  assert.deepEqual(first, ['b', 'c', 'd']);
  const round2 = [r.next(), r.next(), r.next(), r.next()].map((x) => x.id).sort();
  assert.deepEqual(round2, ['a', 'b', 'c', 'd']);
});

test('replay bag: nothing to show when empty, and a live wish joins the bag', () => {
  const r = loadEgg()._makeReplay(Math.random);
  assert.equal(r.next(), null);
  r.add([W('x')]); r.add([W('x')]);
  assert.equal(r.size(), 1);
  assert.equal(r.next().id, 'x');
});
