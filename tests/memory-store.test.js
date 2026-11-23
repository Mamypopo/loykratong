'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createMemoryStore } = require('../lib/memory-store.js');

test('memory store keeps newest first, caps the list and counts every wish', async () => {
  const s = createMemoryStore({ keep: 2 });
  await s.add({ name: 'a', wish: '1' }); await s.add({ name: 'b', wish: '2' }); await s.add({ name: 'c', wish: '3' });
  const out = await s.list(50);
  assert.equal(out.count, 3);
  assert.deepEqual(out.wishes.map((w) => w.wish), ['3', '2']);
});

test('memory store allow: per-client window, per-IP cap', async () => {
  let t = 1000;
  const s = createMemoryStore({ rateMs: 4000, ipPerMinute: 3, now: () => t });   // every attempt counts toward the IP cap, like Redis INCR
  assert.equal(await s.allow({ client: 'a', ip: 'ip' }), true);
  t += 3999; assert.equal(await s.allow({ client: 'a', ip: 'ip' }), false);
  t += 2; assert.equal(await s.allow({ client: 'a', ip: 'ip' }), true);
  assert.equal(await s.allow({ client: 'b', ip: 'ip' }), false);   // fourth attempt from this IP within the minute
  t += 60001; assert.equal(await s.allow({ client: 'b', ip: 'ip' }), true);
});

test('memory store keeps looks like the Redis store', async () => {
  const s = createMemoryStore();
  const id = await s.add({ name: 'a', wish: '1', design: { v: 2 }, photo: null });
  await s.add({ name: 'b', wish: '2' });
  const out = await s.list(50);
  assert.deepEqual(out.wishes[1], { id, name: 'a', wish: '1', look: true });
  assert.deepEqual(Object.keys(out.wishes[0]).sort(), ['id', 'name', 'wish']);
  assert.deepEqual(await s.look(id), { design: { v: 2 }, photo: null });
  assert.equal(await s.look('nope'), null);
});
