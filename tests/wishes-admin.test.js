'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { pickWishes, deleteCommands } = require('../scripts/wishes-admin.js');

const raw = [
  JSON.stringify({ id: 'a1', name: 'ทดสอบ1', wish: 'ขอให้รวย', look: 1 }),
  JSON.stringify({ id: 'b2', name: 'สมใจ', wish: 'ขอให้สุขภาพดี' }),
  JSON.stringify({ id: 'c3', name: 'ต้น', wish: 'test test' }),
  'not json'
];

test('pick by id returns only those wishes, with their stored text', () => {
  const out = pickWishes(raw, { ids: ['b2'] });
  assert.deepEqual(out.map((w) => w.id), ['b2']);
  assert.equal(out[0].raw, raw[1]);
});

test('pick by text matches name or wish, case-insensitive', () => {
  assert.deepEqual(pickWishes(raw, { match: 'ทดสอบ' }).map((w) => w.id), ['a1']);
  assert.deepEqual(pickWishes(raw, { match: 'TEST' }).map((w) => w.id), ['c3']);
});

test('nothing is picked without an id or text', () => {
  assert.deepEqual(pickWishes(raw, {}), []);
  assert.deepEqual(pickWishes(raw, { match: '  ' }), []);
});

test('delete removes the list entry, its look and hearts, and lowers the count', () => {
  const cmds = deleteCommands(pickWishes(raw, { ids: ['a1', 'c3'] }));
  assert.deepEqual(cmds, [
    ['LREM', 'lk:wishes', 0, raw[0]], ['DEL', 'lk:look:a1'], ['HDEL', 'lk:hearts', 'a1'],
    ['LREM', 'lk:wishes', 0, raw[2]], ['DEL', 'lk:look:c3'], ['HDEL', 'lk:hearts', 'c3'],
    ['DECRBY', 'lk:count', 2]
  ]);
  assert.deepEqual(deleteCommands([]), []);
});
