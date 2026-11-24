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

test('redis store: heart finds the krathong, votes once per client per krathong, counts on this float', async () => {
  const calls = [];
  const list = [JSON.stringify({ id: 'abcd1234', name: 'n', wish: 'w', look: 1, kid: 'kidone1' }), JSON.stringify({ id: 'old00001', name: 'n', wish: 'w', look: 1, kid: 'kidone1' })];
  const results = [
    [{ result: list }, { result: 1 }], [{ result: 'OK' }], [{ result: 3 }, { result: 1 }, { result: ['3', '2'] }],
    [{ result: list }, { result: 1 }], [{ result: null }], [{ result: ['3', '2'] }]
  ];
  const f = async (url, init) => { calls.push(JSON.parse(init.body)); return { ok: true, status: 200, json: async () => results.shift() }; };
  const s = createStore({ url: 'https://r', token: 't', fetch: f });
  assert.deepEqual(await s.heart('abcd1234', 'client-one-01'), { hearts: 5, already: false });
  assert.deepEqual(calls[0], [['LRANGE', 'lk:wishes', '0', '299'], ['EXISTS', 'lk:look:abcd1234']]);
  assert.deepEqual(calls[1], [['SET', 'lk:hv:k:kidone1:client-one-01', '1', 'NX', 'EX', '604800']]);
  assert.deepEqual(calls[2], [['HINCRBY', 'lk:hearts', 'abcd1234', '1'], ['EXPIRE', 'lk:hearts', '604800'], ['HMGET', 'lk:hearts', 'abcd1234', 'old00001']]);
  assert.deepEqual(await s.heart('abcd1234', 'client-one-01'), { hearts: 5, already: true });
});

test('hearts follow the krathong across its floats (one per client per krathong)', async () => {
  const st = createMemoryStore();
  const a1 = await st.add({ name: 'a', wish: '1', design: { v: 2 }, kid: 'kidaaa1' });
  assert.deepEqual(await st.heart(a1, 'client-one-01'), { hearts: 1, already: false });
  const a2 = await st.add({ name: 'a ใหม่', wish: '2', design: { v: 2 }, kid: 'kidaaa1' });   // floated again after editing
  assert.deepEqual(await st.heart(a2, 'client-one-01'), { hearts: 1, already: true });
  assert.deepEqual(await st.heart(a2, 'client-two-02'), { hearts: 2, already: false });
  assert.deepEqual(await st.gallery(24, 0), { total: 1, items: [{ id: a2, name: 'a ใหม่', wish: '2', hearts: 2 }] });
  assert.deepEqual((await st.top(3)).map((x) => [x.id, x.hearts]), [[a2, 2]]);
});

test('redis store: gallery sums the hearts of every float of a krathong', async () => {
  const list = [JSON.stringify({ id: 'n2', name: 'N', wish: 'w', look: 1, kid: 'kidnnn1' }), JSON.stringify({ id: 'x1', name: 'X', wish: 'w', look: 1 }), JSON.stringify({ id: 'n1', name: 'N', wish: 'w', look: 1, kid: 'kidnnn1' })];
  const calls = [], results = [[{ result: list }], [{ result: ['1', '4', '2'] }]];
  const f = async (url, init) => { calls.push(JSON.parse(init.body)); return { ok: true, status: 200, json: async () => results.shift() }; };
  const g = await createStore({ url: 'https://r', token: 't', fetch: f }).gallery(24, 0);
  assert.deepEqual(g.items.map((x) => [x.id, x.hearts]), [['n2', 5], ['x1', 2]]);
  assert.deepEqual(calls[1], [['HMGET', 'lk:hearts', 'n2', 'n1', 'x1']]);
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

test('topFrom: the most-hearted krathongs, at least one heart, ties keep the newer first', () => {
  const { topFrom } = require('../lib/store.js');
  const items = [{ id: 'e' }, { id: 'd' }, { id: 'c' }, { id: 'b' }, { id: 'a' }];   // newest first
  const out = topFrom(items, { a: 5, b: 2, c: 0, d: 2, e: 1 }, 3);
  assert.deepEqual(out.map((x) => [x.id, x.hearts]), [['a', 5], ['d', 2], ['b', 2]]);
  assert.deepEqual(topFrom(items, {}, 3), []);
});

test('memory store and GET /api/gallery?top=3 return the podium', async () => {
  const store = createMemoryStore();
  const a = await store.add({ name: 'a', wish: '1', design: { v: 2 }, kid: 'kida01' });
  const b = await store.add({ name: 'b', wish: '2', design: { v: 2 }, kid: 'kidb01' });
  await store.add({ name: 'c', wish: '3', design: { v: 2 }, kid: 'kidc01' });
  await store.heart(a, 'client-one-01'); await store.heart(a, 'client-two-02'); await store.heart(b, 'client-one-01');
  assert.deepEqual((await store.top(3)).map((x) => [x.name, x.hearts]), [['a', 2], ['b', 1]]);
  const g = await call(createGalleryHandler({ store }), { url: '/api/gallery?top=3' });
  assert.equal(g.statusCode, 200);
  assert.deepEqual(g.json.items.map((x) => x.name), ['a', 'b']);
  assert.deepEqual((await call(createGalleryHandler({ store: null }), { url: '/api/gallery?top=3' })).json, { items: [] });
});

test('redis store: top reads the whole list once and the hearts once', async () => {
  const calls = [];
  const list = [JSON.stringify({ id: 'b', name: 'B', wish: 'w', look: 1 }), JSON.stringify({ id: 'a', name: 'A', wish: 'w', look: 1 }), JSON.stringify({ id: 'p', name: 'P', wish: 'plain' })];
  const results = [[{ result: list }], [{ result: ['1', '4'] }]];
  const f = async (url, init) => { calls.push(JSON.parse(init.body)); return { ok: true, status: 200, json: async () => results.shift() }; };
  const s = createStore({ url: 'https://r', token: 't', fetch: f });
  assert.deepEqual(await s.top(3), [{ id: 'a', name: 'A', wish: 'w', hearts: 4 }, { id: 'b', name: 'B', wish: 'w', hearts: 1 }]);
  assert.deepEqual(calls[1], [['HMGET', 'lk:hearts', 'b', 'a']]);
});
