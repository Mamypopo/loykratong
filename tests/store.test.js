'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createStore } = require('../lib/store.js');

function fakeFetch(results) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return { ok: true, status: 200, json: async () => results.shift() };
  };
  fn.calls = calls;
  return fn;
}

test('returns null when url or token is missing', () => {
  assert.equal(createStore({ url: '', token: 't', fetch: fakeFetch([]) }), null);
  assert.equal(createStore({ url: 'https://x', token: '', fetch: fakeFetch([]) }), null);
});

test('add pipelines LPUSH, LTRIM 0 299, EXPIRE 604800 and INCR with a bearer token', async () => {
  const f = fakeFetch([[{ result: 1 }, { result: 'OK' }, { result: 1 }, { result: 5 }]]);
  const store = createStore({ url: 'https://r.upstash.io/', token: 'tok', fetch: f });
  const id = await store.add({ name: 'a', wish: 'b' });
  assert.equal(typeof id, 'string');
  const c = f.calls[0];
  assert.equal(c.url, 'https://r.upstash.io/pipeline');
  assert.equal(c.init.method, 'POST');
  assert.equal(c.init.headers.Authorization, 'Bearer tok');
  assert.equal(c.body[0][0], 'LPUSH');
  assert.equal(c.body[0][1], 'lk:wishes');
  assert.deepEqual(JSON.parse(c.body[0][2]), { id, name: 'a', wish: 'b' });
  assert.deepEqual(c.body.slice(1), [['LTRIM', 'lk:wishes', '0', '299'], ['EXPIRE', 'lk:wishes', '604800'], ['INCR', 'lk:count']]);
});

test('list reads newest wishes and the counter in one round trip, skipping broken entries', async () => {
  const f = fakeFetch([[{ result: ['{"id":"b","name":"n","wish":"w2"}', 'not json', '{"id":"a","name":"","wish":"w1"}'] }, { result: '7' }]]);
  const store = createStore({ url: 'https://r', token: 't', fetch: f });
  const out = await store.list(50);
  assert.deepEqual(f.calls[0].body, [['LRANGE', 'lk:wishes', '0', '49'], ['GET', 'lk:count']]);
  assert.deepEqual(out, { count: 7, wishes: [{ id: 'b', name: 'n', wish: 'w2' }, { id: 'a', name: '', wish: 'w1' }] });
});

test('allow: per-client SET NX EX 4 plus a per-IP counter capped at 120 a minute', async () => {
  const f = fakeFetch([[{ result: 'OK' }, { result: 'OK' }, { result: 1 }], [{ result: null }, { result: null }, { result: 2 }], [{ result: 'OK' }, { result: null }, { result: 121 }]]);
  const store = createStore({ url: 'https://r', token: 't', fetch: f });
  assert.equal(await store.allow({ client: 'c1', ip: '1.2.3.4' }), true);
  assert.equal(await store.allow({ client: 'c1', ip: '1.2.3.4' }), false);
  assert.equal(await store.allow({ client: 'c2', ip: '1.2.3.4' }), false);
  assert.deepEqual(f.calls[0].body, [['SET', 'lk:rl:c:c1', '1', 'NX', 'EX', '4'], ['SET', 'lk:rl:ip:1.2.3.4', '0', 'NX', 'EX', '60'], ['INCR', 'lk:rl:ip:1.2.3.4']]);
});

test('a Redis error surfaces as a rejected promise', async () => {
  const f = async () => ({ ok: false, status: 401, json: async () => ({ error: 'unauthorized' }) });
  const store = createStore({ url: 'https://r', token: 't', fetch: f });
  await assert.rejects(store.list(10));
});

test('add stores the design with the wish and the photo under its own key with the same TTL', async () => {
  const f = fakeFetch([[{ result: 1 }, { result: 'OK' }, { result: 1 }, { result: 5 }, { result: 'OK' }]]);
  const store = createStore({ url: 'https://r', token: 't', fetch: f });
  const design = { base: 6, flowers: 1, topper: 2, leafColor: 0, leaf: [[0.5, 0], [1, 1], [0, 1]] };
  const id = await store.add({ name: 'a', wish: 'b', design, photo: 'data:image/jpeg;base64,/9j/' });
  const body = f.calls[0].body;
  assert.deepEqual(JSON.parse(body[0][2]), { id, name: 'a', wish: 'b', design, photo: 1 });
  assert.deepEqual(body[4], ['SET', 'lk:img:' + id, 'data:image/jpeg;base64,/9j/', 'EX', '604800']);
});

test('list returns design and photo flag; photo(id) reads the image key', async () => {
  const d = { base: 1, flowers: 0, topper: 0, leafColor: 0, leaf: null };
  const f = fakeFetch([[{ result: [JSON.stringify({ id: 'x', name: 'n', wish: 'w', design: d, photo: 1 })] }, { result: '1' }], [{ result: 'data:image/jpeg;base64,/9j/' }]]);
  const store = createStore({ url: 'https://r', token: 't', fetch: f });
  assert.deepEqual((await store.list(50)).wishes, [{ id: 'x', name: 'n', wish: 'w', design: d, photo: true }]);
  assert.equal(await store.photo('x'), 'data:image/jpeg;base64,/9j/');
  assert.deepEqual(f.calls[1].body, [['GET', 'lk:img:x']]);
});
