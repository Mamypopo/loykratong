'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../public/design.js');

const tri = [[0.5, 1], [0, 0], [1, 0]];
const DEF = { v: 2, base: 6, material: 0, trunk: 0.4, leaf: null, leafColor: 0, petals: 11, flowers: 0, items: [], doodles: [] };

test('sanitize fills defaults and keeps valid choices', () => {
  assert.deepEqual(D.sanitize({}), DEF);
  const d = D.sanitize({ base: 2, trunk: 0.7, leaf: tri, leafColor: 3, petals: 8, flowers: 4 });
  assert.deepEqual(d, Object.assign({}, DEF, { base: 2, trunk: 0.7, leaf: tri, leafColor: 3, petals: 8, flowers: 4 }));
});

test('sanitize returns null for non-objects; out-of-range choices fall back to defaults, trunk and petals are clamped', () => {
  assert.equal(D.sanitize(null), null);
  assert.equal(D.sanitize('x'), null);
  assert.equal(D.sanitize([1]), null);
  const d = D.sanitize({ base: 99, flowers: -1, leafColor: '2', trunk: 9, petals: 100 });
  assert.deepEqual([d.base, d.flowers, d.leafColor, d.trunk, d.petals], [6, 0, 0, D.TRUNK_MAX, D.PETALS_MAX]);
  assert.equal(D.sanitize({ trunk: 0.01, petals: 1 }).trunk, D.TRUNK_MIN);
  assert.equal(D.sanitize({ trunk: 'a' }).trunk, 0.4);
});

test('leaf points are rounded and bad leaves dropped', () => {
  assert.deepEqual(D.sanitize({ leaf: [[0.123, 0.987], [0, 0], [1, 0]] }).leaf, [[0.12, 0.99], [0, 0], [1, 0]]);
  assert.equal(D.sanitize({ leaf: [[0, 0], [1, 0]] }).leaf, null);
  assert.equal(D.sanitize({ leaf: [[0, 0], [1, 0], [2, 1]] }).leaf, null);
  assert.equal(D.sanitize({ leaf: [[0, 0], [0.5, 0], [1, 0]] }).leaf, null);
});

test('items: kept with rounded position, rotation and scale; unknown kinds, bad positions and extras dropped', () => {
  const d = D.sanitize({ items: [
    { k: D.ITEM.duck, p: [0.123, 0.456, -0.789], r: 1.234, s: 1.5 },
    { k: 999, p: [0, 0, 0] },
    { k: D.ITEM.candle, p: [0, 0] },
    { k: D.ITEM.rose, p: [9, 0, 0] },
    { k: D.ITEM.heart, p: [0, 1, 0], s: 50 },
    'junk'
  ] });
  assert.deepEqual(d.items, [
    { k: D.ITEM.duck, p: [0.12, 0.46, -0.79], r: 1.23, s: 1.5 },
    { k: D.ITEM.heart, p: [0, 1, 0], r: 0, s: D.SCALE_MAX }
  ]);
  const many = Array.from({ length: D.MAX_ITEMS + 5 }, () => ({ k: D.ITEM.coin, p: [0, 0, 0] }));
  assert.equal(D.sanitize({ items: many }).items.length, D.MAX_ITEMS);
});

test('doodles: strokes kept with colour and width; a doodle item must point at an existing doodle', () => {
  const doodle = { s: [{ c: 2, w: 2, p: [[0.1, 0.1], [0.5, 0.5], [0.9, 0.2]] }, { c: 99, w: 1, p: [[0, 0], [1, 1]] }, { c: 1, w: 1, p: [[0.5, 0.5]] }] };
  const d = D.sanitize({
    doodles: [doodle, { s: [] }, 'x'],
    items: [{ k: D.ITEM.doodle, d: 0, p: [0, 0.5, 0] }, { k: D.ITEM.doodle, d: 5, p: [0, 0.5, 0] }, { k: D.ITEM.doodle, p: [0, 0.5, 0] }]
  });
  assert.equal(d.doodles.length, 1);
  assert.deepEqual(d.doodles[0].s, [{ c: 2, w: 2, p: [[0.1, 0.1], [0.5, 0.5], [0.9, 0.2]] }, { c: 0, w: 1, p: [[0, 0], [1, 1]] }, { c: 1, w: 1, p: [[0.5, 0.5]] }]);
  assert.deepEqual(d.items, [{ k: D.ITEM.doodle, d: 0, p: [0, 0.5, 0], r: 0, s: 1 }]);
});

test('doodles are capped in count and in points', () => {
  const big = { s: [{ c: 0, w: 1, p: Array.from({ length: D.MAX_DOODLE_POINTS + 50 }, (_, i) => [(i % 100) / 100, 0.5]) }] };
  const d = D.sanitize({ doodles: [big, big, big, big, big] });
  assert.equal(d.doodles.length, D.MAX_DOODLES);
  const pts = d.doodles[0].s.reduce((n, s) => n + s.p.length, 0);
  assert.ok(pts <= D.MAX_DOODLE_POINTS);
});

test('the whole sanitized design stays small', () => {
  const stroke = { c: 1, w: 2, p: Array.from({ length: 40 }, (_, i) => [i / 40, (i % 7) / 7]) };
  const doodle = { s: Array.from({ length: 20 }, () => stroke) };
  const items = Array.from({ length: 60 }, (_, i) => ({ k: i % 12, p: [1.11, 2.22, -1.33], r: 3.33, s: 1.11 }));
  const json = JSON.stringify(D.sanitize({ doodles: [doodle, doodle, doodle], items, leaf: tri }));
  assert.ok(json.length <= D.MAX_DESIGN_CHARS, json.length);
});

test('simplifyStroke turns a drawn line into rounded 0..1 points', () => {
  const pts = D.simplifyStroke(Array.from({ length: 200 }, (_, i) => [i, 100]), 200, 200);
  assert.deepEqual(pts, [[0, 0.5], [1, 0.5]]);
  assert.equal(D.simplifyStroke([[5, 5]], 10, 10).length, 1);
});

test('normalizeLeaf turns a drawn path into a petal standing on y=0, fit in 0..1', () => {
  const pts = D.normalizeLeaf([[100, 300], [150, 200], [100, 100], [50, 200]]);
  const ys = pts.map((p) => p[1]);
  assert.equal(Math.min(...ys), 0);
  assert.equal(Math.max(...ys), 1);
  assert.ok(pts.some((p) => p[1] === 0 && Math.abs(p[0] - 0.5) < 0.01));
  assert.equal(D.normalizeLeaf([[0, 0], [10, 10], [20, 20], [30, 30]]), null);
  const circle = Array.from({ length: 500 }, (_, i) => [200 + 80 * Math.cos(i / 80), 200 + 80 * Math.sin(i / 80)]);
  assert.ok(D.normalizeLeaf(circle).length <= D.MAX_LEAF_POINTS);
});

test('every preset leaf passes sanitize', () => {
  for (const p of D.PRESET_LEAVES) assert.ok(D.sanitize({ leaf: p.points }).leaf, p.name);
});

test('photoOk accepts a small JPEG data URL only', () => {
  const jpeg = 'data:image/jpeg;base64,' + Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]).toString('base64');
  assert.equal(D.photoOk(jpeg), true);
  assert.equal(D.photoOk('data:image/png;base64,iVBORw0KGgo='), false);
  assert.equal(D.photoOk('data:image/jpeg;base64,' + Buffer.from('<svg>').toString('base64')), false);
  assert.equal(D.photoOk('data:image/jpeg;base64,' + 'A'.repeat(D.MAX_PHOTO_CHARS)), false);
  assert.equal(D.photoOk(null), false);
});

test('material: five things to cut a base from, unknown ones fall back to banana trunk', () => {
  assert.deepEqual(D.MATERIALS.map((m) => m.id), ['banana', 'bread', 'coconut', 'ice', 'watermelon']);
  assert.equal(D.sanitize({ material: 3 }).material, 3);
  assert.equal(D.sanitize({ material: 9 }).material, 0);
  assert.equal(D.sanitize({ material: '2' }).material, 0);
});
