'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { galleryFrom, createStore } = require('../lib/store.js');
const { createMemoryStore } = require('../lib/memory-store.js');
const { createGalleryHandler } = require('../api/gallery.js');
const { createHeartHandler } = require('../api/heart.js');
const { createHandler } = require('../api/wishes.js');
const { call } = require('./helpers.js');

const JSON_H = { 'content-type': 'application/json', origin: 'https://lk.example.app' };
const post = (body, extra) => ({ method: 'POST', headers: Object.assign({}, JSON_H, extra), body: JSON.stringify(body) });

test('galleryFrom keeps krathongs with a look, newest first, one per kid', () => {
  const raw = [
    { id: 'e', name: 'n', wish: 'w5', look: 1, kid: 'k1' },   // newest float of k1
    { id: 'd', name: 'n', wish: 'w4' },                       // plain wish: not in the gallery
    { id: 'c', name: 'n', wish: 'w3', look: 1, kid: 'k1' },   // older float of the same krathong
    { id: 'b', name: 'm', wish: 'w2', look: 1 },              // no kid: its own entry
    { id: 'a', name: 'o', wish: 'w1', look: 1, kid: 'k2' }
  ];
  assert.deepEqual(galleryFrom(raw, 10, 0), { total: 3, items: [{ id: 'e', name: 'n', wish: 'w5' }, { id: 'b', name: 'm', wish: 'w2' }, { id: 'a', name: 'o', wish: 'w1' }] });
  assert.deepEqual(galleryFrom(raw, 1, 1).items.map((x) => x.id), ['b']);
});

test('memory store: gallery with hearts, one heart per client per krathong', async () => {
  const s = createMemoryStore();
  const a = await s.add({ name: 'a', wish: '1', design: { v: 2 }, kid: 'kida01' });
  await s.add({ name: 'b', wish: '2' });
  assert.deepEqual(await s.heart(a, 'client-one-01'), { hearts: 1, already: false });
  assert.deepEqual(await s.heart(a, 'client-one-01'), { hearts: 1, already: true });
  assert.deepEqual(await s.heart(a, 'client-two-02'), { hearts: 2, already: false });
  assert.equal(await s.heart('nope1234', 'client-two-02'), null);
  assert.deepEqual(await s.gallery(24, 0), { total: 1, items: [{ id: a, name: 'a', wish: '1', hearts: 2 }] });
});

test('redis store: heart checks the krathong exists, sets a per-client marker, then counts', async () => {
  const calls = [];
  const results = [[{ result: 1 }, { result: 'OK' }], [{ result: 3 }, { result: 1 }], [{ result: 1 }, { result: null }], [{ result: '3' }]];
  const f = async (url, init) => { calls.push(JSON.parse(init.body)); return { ok: true, status: 200, json: async () => results.shift() }; };
  const s = createStore({ url: 'https://r', token: 't', fetch: f });
  assert.deepEqual(await s.heart('abcd1234', 'client-one-01'), { hearts: 3, already: false });
  assert.deepEqual(calls[0], [['EXISTS', 'lk:look:abcd1234'], ['SET', 'lk:hv:abcd1234:client-one-01', '1', 'NX', 'EX', '604800']]);
  assert.deepEqual(calls[1], [['HINCRBY', 'lk:hearts', 'abcd1234', '1'], ['EXPIRE', 'lk:hearts', '604800']]);
  assert.deepEqual(await s.heart('abcd1234', 'client-one-01'), { hearts: 3, already: true });
});

test('GET /api/gallery lists krathongs with hearts, edge-cached briefly; bad paging is clamped', async () => {
  const store = createMemoryStore(), h = createHandler({ store });
  await call(h, post({ name: 'ต้น', wish: 'ขอให้รวย', design: { base: 4 }, kid: 'kidabc1' }));
  const g = await call(createGalleryHandler({ store }), { url: '/api/gallery?limit=999&offset=-5' });
  assert.equal(g.statusCode, 200);
  assert.equal(g.json.total, 1);
  assert.equal(g.json.items[0].name, 'ต้น');
  assert.equal(g.json.items[0].hearts, 0);
  assert.match(g.headers['cache-control'], /s-maxage=10/);
  assert.deepEqual((await call(createGalleryHandler({ store: null }), { url: '/api/gallery' })).json, { total: 0, items: [] });
});

test('POST /api/heart: counts once per client, 404 for unknown, 400 bad input, 403 other origins', async () => {
  const store = createMemoryStore(), h = createHandler({ store });
  const id = (await call(h, post({ name: 'ต้น', wish: 'x', design: { base: 1 } }))).json.id;
  const hh = createHeartHandler({ store });
  const r1 = await call(hh, post({ id, client: 'client-one-01' }));
  assert.equal(r1.statusCode, 200); assert.deepEqual(r1.json, { hearts: 1, already: false });
  assert.deepEqual((await call(hh, post({ id, client: 'client-one-01' }))).json, { hearts: 1, already: true });
  assert.equal((await call(hh, post({ id: 'zzzz9999', client: 'client-one-01' }))).statusCode, 404);
  assert.equal((await call(hh, post({ id: '../x', client: 'client-one-01' }))).statusCode, 400);
  assert.equal((await call(hh, post({ id, client: 'x' }))).statusCode, 400);
  assert.equal((await call(hh, post({ id, client: 'client-one-01' }, { origin: 'https://evil.example' }))).statusCode, 403);
});

test('a wish keeps its kid for the gallery but the public list does not show it', async () => {
  const store = createMemoryStore(), h = createHandler({ store });
  await call(h, post({ wish: 'x', design: { base: 1 }, kid: 'bad kid!' }));
  await call(h, post({ wish: 'y', design: { base: 1 }, kid: 'goodkid1' }, { 'x-real-ip': '5.5.5.5' }));
  const w = (await call(h)).json.wishes;
  assert.ok(w.every((x) => x.kid === undefined));
  assert.equal((await store.gallery(10, 0)).total, 2);
});
