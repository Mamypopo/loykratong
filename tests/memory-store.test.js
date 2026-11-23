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

test('memory store rate limit frees the IP again after the window', async () => {
  let t = 1000;
  const s = createMemoryStore({ rateMs: 4000, now: () => t });
  assert.equal(await s.rateLimit('ip'), true);
  t += 3999; assert.equal(await s.rateLimit('ip'), false);
  t += 2; assert.equal(await s.rateLimit('ip'), true);
});
