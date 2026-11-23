'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHandler } = require('../api/wishes.js');
const { call } = require('./helpers.js');
const { createMemoryStore } = require('../lib/memory-store.js');
const memoryStore = () => createMemoryStore();

const JSON_H = { 'content-type': 'application/json' };
const post = (body, extra) => ({ method: 'POST', headers: Object.assign({}, JSON_H, { origin: 'https://lk.example.app' }, extra), body: JSON.stringify(body) });

test('GET on an empty store returns count 0 and no wishes, cached at the edge for 3s', async () => {
  const res = await call(createHandler({ store: memoryStore() }));
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json, { count: 0, wishes: [] });
  assert.equal(res.headers['cache-control'], 'public, s-maxage=3, stale-while-revalidate=10');
});

test('POST stores a wish that the next GET returns with an id, newest first', async () => {
  const store = memoryStore(), h = createHandler({ store });
  const r1 = await call(h, post({ name: 'สมใจ', wish: 'ขอให้สุขภาพแข็งแรง' }));
  assert.equal(r1.statusCode, 201);
  assert.equal(r1.json.ok, true);
  assert.equal(typeof r1.json.id, 'string');
  await call(h, post({ name: 'บอส', wish: 'ขอให้งานราบรื่น', client: 'client-two-0001' }));
  const g = await call(h);
  assert.equal(g.json.count, 2);
  assert.deepEqual(g.json.wishes.map((w) => w.wish), ['ขอให้งานราบรื่น', 'ขอให้สุขภาพแข็งแรง']);
  assert.deepEqual(Object.keys(g.json.wishes[0]).sort(), ['id', 'name', 'wish']);   // no ip/site/time leak
});

test('POST without Origin (same-origin form/tooling) is accepted', async () => {
  const res = await call(createHandler({ store: memoryStore() }), { method: 'POST', headers: JSON_H, body: JSON.stringify({ wish: 'ขอให้รวย' }) });
  assert.equal(res.statusCode, 201);
});

test('POST with a bad word in the wish or the name is rejected with 422 blocked', async () => {
  const store = memoryStore(), h = createHandler({ store });
  assert.equal((await call(h, post({ name: 'a', wish: 'ไอ้ควาย' }))).statusCode, 422);
  assert.equal((await call(h, post({ name: 'fuck', wish: 'ขอให้รวย' }))).json.error, 'blocked');
  assert.equal((await call(h)).json.count, 0);
});

test('second POST from the same client within the window is rejected with 429', async () => {
  const h = createHandler({ store: memoryStore() });
  assert.equal((await call(h, post({ wish: 'หนึ่ง' }))).statusCode, 201);
  const r = await call(h, post({ wish: 'สอง' }));
  assert.equal(r.statusCode, 429);
  assert.equal(r.json.error, 'too_many');
});

test('rate limit uses x-real-ip set by Vercel', async () => {
  const h = createHandler({ store: memoryStore() });
  assert.equal((await call(h, post({ wish: 'หนึ่ง' }, { 'x-real-ip': '9.9.9.1' }))).statusCode, 201);
  assert.equal((await call(h, post({ wish: 'สอง' }, { 'x-real-ip': '9.9.9.2' }))).statusCode, 201);
});

test('POST rejects non-JSON (415), other origins (403), bad JSON (400), empty wish (400), big body (413)', async () => {
  const h = createHandler({ store: memoryStore() });
  assert.equal((await call(h, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{"wish":"x"}' })).statusCode, 415);
  assert.equal((await call(h, post({ wish: 'x' }, { origin: 'https://evil.example' }))).statusCode, 403);
  assert.equal((await call(h, { method: 'POST', headers: JSON_H, body: '{nope' })).json.error, 'bad_json');
  assert.equal((await call(h, post({ wish: '   ' }))).json.error, 'empty');
  assert.equal((await call(h, post({ wish: 'x'.repeat(5000) }))).statusCode, 413);
});

test('POST strips tags/control chars and truncates name to 40 and wish to 80', async () => {
  const store = memoryStore(), h = createHandler({ store });
  await call(h, post({ name: '<b>' + 'น'.repeat(60), wish: 'ขอ<script>ให้\u0007' + 'ก'.repeat(100) }));
  const w = (await call(h)).json.wishes[0];
  assert.ok(!/[<>\u0007]/.test(w.name + w.wish));
  assert.equal(w.name.length, 40);
  assert.equal(w.wish.length, 80);
});

test('without storage configured: GET returns empty list, POST returns 503 storage', async () => {
  const h = createHandler({ store: null });
  const g = await call(h);
  assert.equal(g.statusCode, 200);
  assert.deepEqual(g.json, { count: 0, wishes: [] });
  const p = await call(h, post({ wish: 'ขอให้รวย' }));
  assert.equal(p.statusCode, 503);
  assert.equal(p.json.error, 'storage');
});

test('other methods get 405', async () => {
  assert.equal((await call(createHandler({ store: memoryStore() }), { method: 'DELETE' })).statusCode, 405);
});

test('review fix: many colleagues behind one office IP can all post at once', async () => {
  const h = createHandler({ store: memoryStore() });
  for (let i = 0; i < 50; i++) {
    const r = await call(h, post({ wish: 'ขอให้มีความสุข ' + i, client: 'office-client-' + String(i).padStart(4, '0') }));
    assert.equal(r.statusCode, 201, 'client ' + i);
  }
});

test('review fix: one IP is still capped at 120 posts per minute', async () => {
  const h = createHandler({ store: memoryStore() });
  let last;
  for (let i = 0; i < 121; i++) last = await call(h, post({ wish: 'x' + i, client: 'spam-client-' + String(i).padStart(4, '0') }));
  assert.equal(last.statusCode, 429);
});

test('review fix: bidi control characters are stripped before storing', async () => {
  const store = memoryStore(), h = createHandler({ store });
  await call(h, post({ name: '‮abc', wish: 'ขอให้⁦รวย‏' }));
  const w = (await call(h)).json.wishes[0];
  assert.ok(!/[‎‏‪-‮⁦-⁩]/.test(w.name + w.wish));
});

test('review fix: a storage error on GET is a 503, so the big-screen counter keeps its last value', async () => {
  const h = createHandler({ store: { list: async () => { throw new Error('down'); } } });
  assert.equal((await call(h)).statusCode, 503);
});
