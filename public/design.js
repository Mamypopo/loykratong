/* Krathong design shared by the browser (workshop + 3D scene) and the API.
 * A design is a small JSON object:
 *   { base: 0..6, flowers: 0..4, topper: 0..5, leafColor: 0..3, leaf: [[x,y],...] | null }
 * base 6 = "cut your own leaf": the petals around the krathong use the leaf outline the person drew.
 * Leaf points are in 0..1, y = 0 at the petal's base, y up.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LoyKrathongDesign = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var BASES = ['ใบตอง', 'ดอกบัว', 'ขนมปัง', 'กะลามะพร้าว', 'หงส์', 'เต่า', 'ตัดใบตองเอง'];
  var CUSTOM_BASE = 6;
  var FLOWERS = ['ดาวเรือง', 'กุหลาบชมพู', 'มะลิ', 'แดงส้ม', 'ม่วงพาสเทล'];
  var FLOWER_COLORS = [   // same order as FLOWER_SETS in the 3D scene
    ['#ffa31a', '#ffc43d', '#ff7f2a'], ['#ff6f9e', '#ffa1c1', '#fff0f5'], ['#ffffff', '#ffe38a', '#c89bff'],
    ['#ff5a5a', '#ffb347', '#fff3d6'], ['#b388ff', '#ff8fd0', '#ffffff']
  ];
  var TOPPERS = ['ไม่มี', 'ธูปเพิ่ม', 'ไข่ดาว', 'เป็ดยาง', 'หมวกปาร์ตี้', 'หัวใจ'];
  var LEAF_COLORS = ['ใบตองสด', 'ใบตองอ่อน', 'ใบตองแห้ง', 'ใบตองเวทมนตร์'];
  // [dark base, light middle, edge] per leaf colour
  var LEAF_TONES = [[0x145c2a, 0x38a24f, 0x0d4220], [0x4f8f2a, 0x9fd65a, 0x3c7020], [0x7a5a2a, 0xc9a35a, 0x5c4320], [0x5a2a8a, 0xd77bff, 0x3d1a66]];
  var MAX_LEAF_POINTS = 24;
  var MAX_PHOTO_CHARS = 40000;   // base64 data URL; the workshop makes ~10-20 KB

  var PRESET_LEAVES = [
    { name: 'กลีบแหลม', points: [[0.5, 0], [0.8, 0.25], [0.78, 0.6], [0.5, 1], [0.22, 0.6], [0.2, 0.25]] },
    { name: 'กลีบมน', points: [[0.5, 0], [0.82, 0.2], [0.95, 0.55], [0.8, 0.88], [0.5, 1], [0.2, 0.88], [0.05, 0.55], [0.18, 0.2]] },
    { name: 'หัวใจ', points: [[0.5, 0], [0.92, 0.45], [0.95, 0.8], [0.75, 0.98], [0.5, 0.82], [0.25, 0.98], [0.05, 0.8], [0.08, 0.45]] },
    { name: 'ดาว', points: [[0.5, 0], [0.62, 0.35], [1, 0.4], [0.7, 0.62], [0.82, 1], [0.5, 0.78], [0.18, 1], [0.3, 0.62], [0, 0.4], [0.38, 0.35]] },
    { name: 'ฟันเลื่อย', points: [[0.5, 0], [0.75, 0.1], [0.6, 0.25], [0.85, 0.4], [0.65, 0.55], [0.85, 0.75], [0.5, 1], [0.15, 0.75], [0.35, 0.55], [0.15, 0.4], [0.4, 0.25], [0.25, 0.1]] }
  ];

  function pick(v, n) { return typeof v === 'number' && v % 1 === 0 && v >= 0 && v < n ? v : 0; }
  function r2(v) { return Math.round(v * 100) / 100; }

  function area(pts) {
    var a = 0;
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i], q = pts[(i + 1) % pts.length];
      a += p[0] * q[1] - q[0] * p[1];
    }
    return Math.abs(a) / 2;
  }

  function cleanLeaf(leaf) {
    if (!Array.isArray(leaf) || leaf.length < 3 || leaf.length > MAX_LEAF_POINTS) return null;
    var out = [];
    for (var i = 0; i < leaf.length; i++) {
      var p = leaf[i];
      if (!Array.isArray(p) || p.length !== 2) return null;
      var x = p[0], y = p[1];
      if (typeof x !== 'number' || typeof y !== 'number' || !(x >= 0 && x <= 1 && y >= 0 && y <= 1)) return null;
      out.push([r2(x), r2(y)]);
    }
    return area(out) >= 0.02 ? out : null;
  }

  /** @returns {null | {base, flowers, topper, leafColor, leaf}} */
  function sanitize(d) {
    if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
    return {
      base: pick(d.base, BASES.length),
      flowers: pick(d.flowers, FLOWERS.length),
      topper: pick(d.topper, TOPPERS.length),
      leafColor: pick(d.leafColor, LEAF_COLORS.length),
      leaf: cleanLeaf(d.leaf)
    };
  }

  // Ramer-Douglas-Peucker on an open polyline
  function rdp(pts, eps) {
    if (pts.length < 3) return pts.slice();
    var a = pts[0], b = pts[pts.length - 1], dx = b[0] - a[0], dy = b[1] - a[1];
    var len = Math.sqrt(dx * dx + dy * dy) || 1e-9, best = -1, at = 0;
    for (var i = 1; i < pts.length - 1; i++) {
      var d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + b[0] * a[1] - b[1] * a[0]) / len;
      if (len < 1e-6) d = Math.hypot(pts[i][0] - a[0], pts[i][1] - a[1]);
      if (d > best) { best = d; at = i; }
    }
    if (best <= eps) return [a, b];
    var left = rdp(pts.slice(0, at + 1), eps), right = rdp(pts.slice(at), eps);
    return left.slice(0, -1).concat(right);
  }

  /** Drawn path in screen coordinates (y down) -> petal outline for sanitize, or null if it encloses nothing. */
  function normalizeLeaf(path) {
    if (!Array.isArray(path) || path.length < 3) return null;
    var pts = path.map(function (p) { return [p[0], -p[1]]; });
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    pts.forEach(function (p) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); });
    var size = Math.max(maxX - minX, maxY - minY);
    if (!(size > 0)) return null;
    var eps = size * 0.01, simple = rdp(pts, eps);
    while (simple.length > MAX_LEAF_POINTS) { eps *= 1.5; simple = rdp(pts, eps); }
    // a closed drawing ends where it started: drop the duplicate end point
    var f = simple[0], l = simple[simple.length - 1];
    if (simple.length > 3 && Math.hypot(f[0] - l[0], f[1] - l[1]) < size * 0.05) simple.pop();
    var s = 1 / size, cx = (minX + maxX) / 2;
    var out = simple.map(function (p) { return [r2((p[0] - cx) * s + 0.5), r2((p[1] - minY) * s)]; });
    return cleanLeaf(out);
  }

  function photoOk(url) {
    var pre = 'data:image/jpeg;base64,';
    if (typeof url !== 'string' || url.indexOf(pre) !== 0 || url.length > MAX_PHOTO_CHARS) return false;
    var b64 = url.slice(pre.length);
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return false;
    try {
      var head = atob(b64.slice(0, 8));
      return head.charCodeAt(0) === 0xff && head.charCodeAt(1) === 0xd8 && head.charCodeAt(2) === 0xff;
    } catch (e) { return false; }
  }

  return {
    BASES: BASES, CUSTOM_BASE: CUSTOM_BASE, FLOWERS: FLOWERS, FLOWER_COLORS: FLOWER_COLORS, TOPPERS: TOPPERS,
    LEAF_COLORS: LEAF_COLORS, LEAF_TONES: LEAF_TONES, PRESET_LEAVES: PRESET_LEAVES,
    MAX_LEAF_POINTS: MAX_LEAF_POINTS, MAX_PHOTO_CHARS: MAX_PHOTO_CHARS,
    sanitize: sanitize, normalizeLeaf: normalizeLeaf, photoOk: photoOk
  };
});
