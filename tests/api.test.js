'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHandler } = require('../api/wishes.js');
const { createLookHandler } = require('../api/look.js');
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
  assert.equal((await call(h, post({ wish: 'x'.repeat(100000) }))).statusCode, 413);
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

const D = require('../public/design.js');
const JPEG = 'data:image/jpeg;base64,' + Buffer.from([0xff, 0xd8, 0xff, 0xe0, 9, 9, 9, 9]).toString('base64');
const DESIGN = { base: 6, trunk: 0.7, items: [{ k: D.ITEM.duck, p: [0.2, 0.5, 0.1], r: 1, s: 1.2 }], doodles: [{ s: [{ c: 2, w: 2, p: [[0, 0], [1, 1]] }] }] };

test('POST keeps a sanitized design and photo as the look; /api/look serves it', async () => {
  const store = memoryStore(), h = createHandler({ store });
  const r = await call(h, post({ name: 'ต้น', wish: 'ขอให้รวย', design: Object.assign({ evil: '<x>' }, DESIGN), photo: JPEG }));
  assert.equal(r.statusCode, 201);
  const w = (await call(h)).json.wishes[0];
  assert.equal(w.look, true);
  assert.equal(w.design, undefined);   // the list stays small: looks are fetched one by one
  const l = await call(createLookHandler({ store }), { url: '/api/look?id=' + r.json.id });
  assert.equal(l.statusCode, 200);
  assert.match(l.headers['cache-control'], /max-age=86400/);
  assert.deepEqual(l.json.design, D.sanitize(DESIGN));
  assert.equal(l.json.photo, JPEG);
});

test('POST rejects a photo that is not a small JPEG (422 bad_photo) and a photo without a name (400 photo_needs_name)', async () => {
  const h = createHandler({ store: memoryStore() });
  const bad = await call(h, post({ name: 'ต้น', wish: 'x', photo: 'data:image/svg+xml;base64,PHN2Zz4=' }));
  assert.equal(bad.statusCode, 422); assert.equal(bad.json.error, 'bad_photo');
  const anon = await call(h, post({ wish: 'x', photo: JPEG }, { 'x-real-ip': '7.7.7.7' }));
  assert.equal(anon.statusCode, 400); assert.equal(anon.json.error, 'photo_needs_name');
});

test('a design that is not an object is dropped, the wish still posts without a look', async () => {
  const store = memoryStore(), h = createHandler({ store });
  assert.equal((await call(h, post({ wish: 'x', design: 'boom' }))).statusCode, 201);
  assert.equal((await call(h)).json.wishes[0].look, undefined);
});

test('a post with a big design and photo fits under the body limit', async () => {
  const stroke = { c: 1, w: 2, p: Array.from({ length: 130 }, (_, i) => [i / 130, (i % 7) / 7]) };
  const big = { doodles: [{ s: [stroke, stroke, stroke] }, { s: [stroke, stroke, stroke] }, { s: [stroke, stroke, stroke] }], items: Array.from({ length: 40 }, () => ({ k: 2, p: [1.11, 2.22, -1.33], r: 3.33, s: 1.11 })) };
  const photo = 'data:image/jpeg;base64,/9j/' + 'A'.repeat(D.MAX_PHOTO_CHARS - 40);
  const r = await call(createHandler({ store: memoryStore() }), post({ name: 'ต้น', wish: 'x', design: D.sanitize(big), photo }))   // the browser sends sanitized designs;
  assert.equal(r.statusCode, 201);
});

test('/api/look: bad id 400, unknown id 404, no store 404', async () => {
  const lh = createLookHandler({ store: memoryStore() });
  assert.equal((await call(lh, { url: '/api/look?id=../../x' })).statusCode, 400);
  assert.equal((await call(lh, { url: '/api/look?id=abc123' })).statusCode, 404);
  assert.equal((await call(createLookHandler({ store: null }), { url: '/api/look?id=abc123' })).statusCode, 404);
});

test('POST with a bad word stuck on the krathong as text is rejected with 422 blocked', async () => {
  const store = memoryStore(), h = createHandler({ store });
  const res = await call(h, post({ name: 'a', wish: 'ขอให้รวย', design: { texts: [{ t: 'ไอ้ควาย' }], items: [{ k: 14, d: 0, p: [0, 0.5, 0] }] } }));
  assert.equal(res.statusCode, 422);
  assert.equal(res.json.error, 'blocked');
  assert.equal((await call(h, post({ name: 'a', wish: 'ขอให้รวย', design: { texts: [{ t: 'รวย ๆ' }] } }))).statusCode, 201);
});
