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
