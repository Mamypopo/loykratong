'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../public/design.js');

const tri = [[0.5, 1], [0, 0], [1, 0]];

test('sanitize keeps a valid design and fills defaults', () => {
  const d = D.sanitize({ base: 6, flowers: 2, topper: 3, leafColor: 1, leaf: tri });
  assert.deepEqual(d, { base: 6, flowers: 2, topper: 3, leafColor: 1, leaf: tri });
  assert.deepEqual(D.sanitize({}), { base: 0, flowers: 0, topper: 0, leafColor: 0, leaf: null });
});

test('sanitize returns null for non-objects and clamps out-of-range choices to defaults', () => {
  assert.equal(D.sanitize(null), null);
  assert.equal(D.sanitize('x'), null);
  assert.equal(D.sanitize([1]), null);
  const d = D.sanitize({ base: 99, flowers: -1, topper: 1.5, leafColor: '2' });
  assert.deepEqual([d.base, d.flowers, d.topper, d.leafColor], [0, 0, 0, 0]);
});

test('sanitize rounds leaf points to 2 decimals and drops bad leaves', () => {
  assert.deepEqual(D.sanitize({ leaf: [[0.123, 0.987], [0, 0], [1, 0]] }).leaf, [[0.12, 0.99], [0, 0], [1, 0]]);
  assert.equal(D.sanitize({ leaf: [[0, 0], [1, 0]] }).leaf, null);                       // too few
  assert.equal(D.sanitize({ leaf: [[0, 0], [1, 0], [2, 1]] }).leaf, null);               // out of 0..1
  assert.equal(D.sanitize({ leaf: [[0, 0], [1, 0], ['a', 1]] }).leaf, null);             // not numbers
  assert.equal(D.sanitize({ leaf: [[0, 0], [0.5, 0], [1, 0]] }).leaf, null);             // no area
  const many = Array.from({ length: D.MAX_LEAF_POINTS + 1 }, (_, i) => [i / 40, (i % 2) * 0.9]);
  assert.equal(D.sanitize({ leaf: many }).leaf, null);
});

test('normalizeLeaf turns a drawn path into a petal standing on y=0, fit in 0..1', () => {
  // a tall diamond drawn in screen coordinates (y grows downward)
  const pts = D.normalizeLeaf([[100, 300], [150, 200], [100, 100], [50, 200]]);
  assert.ok(pts.length >= 3 && pts.length <= D.MAX_LEAF_POINTS);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  assert.equal(Math.min(...ys), 0);
  assert.equal(Math.max(...ys), 1);                       // the taller side fills 0..1
  assert.ok(Math.abs((Math.min(...xs) + Math.max(...xs)) / 2 - 0.5) < 0.01);   // centred
  // the drawing's bottom point (screen y 300) becomes the petal base (y 0)
  assert.ok(pts.some((p) => p[1] === 0 && Math.abs(p[0] - 0.5) < 0.01));
  assert.ok(D.sanitize({ leaf: pts }).leaf);
});

test('normalizeLeaf simplifies a long scribble to at most MAX_LEAF_POINTS', () => {
  const circle = Array.from({ length: 500 }, (_, i) => [200 + 80 * Math.cos(i / 80), 200 + 80 * Math.sin(i / 80)]);
  const pts = D.normalizeLeaf(circle);
  assert.ok(pts.length <= D.MAX_LEAF_POINTS && pts.length >= 8);
});

test('normalizeLeaf returns null for a tap or a straight line', () => {
  assert.equal(D.normalizeLeaf([[1, 1]]), null);
  assert.equal(D.normalizeLeaf([[0, 0], [10, 10], [20, 20], [30, 30]]), null);
});

test('every preset leaf passes sanitize', () => {
  assert.ok(D.PRESET_LEAVES.length >= 3);
  for (const p of D.PRESET_LEAVES) assert.ok(D.sanitize({ leaf: p.points }).leaf, p.name);
});

test('photoOk accepts a small JPEG data URL only', () => {
  const jpeg = 'data:image/jpeg;base64,' + Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]).toString('base64');
  assert.equal(D.photoOk(jpeg), true);
  assert.equal(D.photoOk('data:image/png;base64,iVBORw0KGgo='), false);
  assert.equal(D.photoOk('data:image/jpeg;base64,' + Buffer.from('<svg>').toString('base64')), false);   // not really a jpeg
  assert.equal(D.photoOk('data:image/jpeg;base64,' + 'A'.repeat(D.MAX_PHOTO_CHARS)), false);
  assert.equal(D.photoOk('data:image/jpeg;base64,@@@@'), false);
  assert.equal(D.photoOk(null), false);
});
