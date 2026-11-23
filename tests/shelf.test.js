'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
global.LoyKrathongDesign = require('../public/design.js');
const { createShelf, MAX } = require('../public/shelf.js');

function memStorage(init, quota) {
  const m = new Map(Object.entries(init || {}));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { if (quota && v.length > quota) throw new Error('QuotaExceededError'); m.set(k, String(v)); },
    removeItem: (k) => m.delete(k), _m: m
  };
}
const LOOK = (base) => ({ design: { base }, photo: null });

test('add keeps a sanitized look, selects it, and survives a reload', () => {
  const st = memStorage();
  const s = createShelf(st);
  const kid = s.add(LOOK(4));
  assert.match(kid, /^[a-z0-9]{6,24}$/);
  assert.equal(s.selected().kid, kid);
  assert.equal(s.selected().look.design.base, 4);
  assert.equal(s.selected().look.design.v, 2);
  const again = createShelf(st);
  assert.equal(again.items().length, 1);
  assert.equal(again.selected().kid, kid);
});

test('update, select, markFloated and remove (removing the selected one selects the next)', () => {
  const s = createShelf(memStorage());
  const a = s.add(LOOK(1)), b = s.add(LOOK(2));
  s.select(a);
  assert.equal(s.selected().kid, a);
  s.update(a, LOOK(5));
  assert.equal(s.get(a).look.design.base, 5);
  s.markFloated(a); s.markFloated(a);
  assert.equal(s.get(a).floats, 2);
  s.remove(a);
  assert.equal(s.items().length, 1);
  assert.equal(s.selected().kid, b);
  s.remove(b);
  assert.equal(s.selected(), null);
});

test('the shelf holds at most MAX krathongs', () => {
  const s = createShelf(memStorage());
  for (let i = 0; i < MAX; i++) assert.ok(s.add(LOOK(1)));
  assert.equal(s.add(LOOK(1)), null);
});

test('a krathong from the old single-look storage moves onto the shelf', () => {
  const st = memStorage({ 'lk-look': JSON.stringify(LOOK(3)) });
  const s = createShelf(st);
  assert.equal(s.items().length, 1);
  assert.equal(s.selected().look.design.base, 3);
  assert.equal(st.getItem('lk-look'), null);
});

test('broken storage or a full disk never throws; save reports failure', () => {
  const s = createShelf(memStorage({ 'lk-shelf': '{not json' }));
  assert.equal(s.items().length, 0);
  const full = createShelf(memStorage({}, 10));
  assert.equal(full.add(LOOK(1)) !== null, true);
  assert.equal(full.lastSaveOk(), false);
  assert.equal(createShelf(null).items().length, 0);
});

test('random mode: select(null) floats a random krathong and survives a reload', () => {
  const st = memStorage();
  const s = createShelf(st);
  s.add(LOOK(1));
  s.select(null);
  assert.equal(s.selected(), null);
  assert.equal(createShelf(st).selected(), null);
});

test('usePreset adds a ready-made krathong once and selects it', () => {
  const s = createShelf(memStorage());
  const a = s.usePreset(4);
  assert.equal(s.selected().kid, a);
  assert.equal(s.selected().look.design.base, 4);
  s.select(null);
  assert.equal(s.usePreset(4), a);          // same plain preset: reuse it
  assert.equal(s.items().length, 1);
  assert.equal(s.selected().kid, a);
  assert.equal(s.usePreset(99), null);
});
