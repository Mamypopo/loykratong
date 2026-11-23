/* Krathong design ("สูตรกระทง") shared by the browser (workshop table + river scene) and the API.
 * Friends and the big screen rebuild the same 3D krathong from this small JSON, so everyone sees the same shape.
 *   { v: 2,
 *     base: 0..6        0-5 ready-made styles, 6 = a slice you cut yourself
 *     material: 0..4    what the slice is cut from: banana trunk, bread, coconut, ice, watermelon (base 6)
 *     trunk: 0.2..0.9   height of the slice you cut (base 6)
 *     leaf, leafColor, petals   petal outline you drew (0..1, y up), what the petals are made of, how many (0 = none) (base 6)
 *     flowers: 0..4     flower colours of the ready-made styles
 *     items: [{ k, p: [x,y,z], r, s, d? }]   things stuck on the krathong, in the krathong's own coordinates
 *     doodles: [{ s: [{ c, w, p: [[x,y],...] }] }]   drawings (0..1, y down) shown as paper stickers (item k = doodle, d = index)
 *   }
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LoyKrathongDesign = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var BASES = ['ใบตอง', 'ดอกบัว', 'ขนมปัง', 'กะลามะพร้าว', 'หงส์', 'เต่า', 'ตัดต้นกล้วยเอง'];
  var CUSTOM_BASE = 6;
  // what you cut your own base from (order is part of the saved data: only ever append)
  var MATERIALS = [
    { id: 'banana', name: 'ต้นกล้วย', icon: '🍌' }, { id: 'bread', name: 'ขนมปัง', icon: '🍞' },
    { id: 'coconut', name: 'มะพร้าว', icon: '🥥' }, { id: 'ice', name: 'น้ำแข็ง', icon: '🧊' },
    { id: 'watermelon', name: 'แตงโม', icon: '🍉' }
  ];
  var FLOWERS = ['ดาวเรือง', 'กุหลาบชมพู', 'มะลิ', 'แดงส้ม', 'ม่วงพาสเทล'];
  var FLOWER_COLORS = [
    ['#ffa31a', '#ffc43d', '#ff7f2a'], ['#ff6f9e', '#ffa1c1', '#fff0f5'], ['#ffffff', '#ffe38a', '#c89bff'],
    ['#ff5a5a', '#ffb347', '#fff3d6'], ['#b388ff', '#ff8fd0', '#ffffff']
  ];
  // what the petals are made of (order is part of the saved data: only ever append)
  var LEAF_COLORS = ['ใบตองสด', 'ใบตองอ่อน', 'ใบตองแห้ง', 'ใบตองเวทมนตร์', 'กลีบบัวชมพู', 'กลีบกุหลาบแดง', 'ดาวเรืองส้ม', 'กระดาษสายรุ้ง', 'ทองคำเปลว'];
  // [base, tip, edge] colours per petal; null = rainbow (each petal a different colour)
  var LEAF_TONES = [[0x145c2a, 0x38a24f, 0x0d4220], [0x4f8f2a, 0x9fd65a, 0x3c7020], [0x7a5a2a, 0xc9a35a, 0x5c4320], [0x5a2a8a, 0xd77bff, 0x3d1a66],
    [0xfbe3ee, 0xff5a9a, 0xff9cc4], [0x8e0f2a, 0xff3b5c, 0x6a0a1f], [0xe36b00, 0xffc43d, 0xd45a00], null, [0xb8860b, 0xffe27a, 0x8a6508]];
  var RAINBOW_TONES = [[0xd81b3c, 0xff6b81, 0xa3122e], [0xe36b00, 0xffb347, 0xb85000], [0xd4a800, 0xfff176, 0xa88400],
    [0x2e7d32, 0x81c784, 0x1b5e20], [0x1565c0, 0x64b5f6, 0x0d47a1], [0x6a1b9a, 0xce93d8, 0x4a148c]];
  // things to stick on the krathong; the order is part of the saved data: only ever append
  var ITEMS = [
    { id: 'candle', name: 'เทียน', icon: '🕯️' }, { id: 'incense', name: 'ธูป', icon: '🥢' },
    { id: 'marigold', name: 'ดาวเรือง', icon: '🌼' }, { id: 'rose', name: 'กุหลาบ', icon: '🌹' },
    { id: 'jasmine', name: 'มะลิ', icon: '🤍' }, { id: 'amaranth', name: 'บานไม่รู้โรย', icon: '💜' },
    { id: 'bud', name: 'บัวตูม', icon: '🪷' }, { id: 'coin', name: 'เหรียญ', icon: '🪙' },
    { id: 'duck', name: 'เป็ดยาง', icon: '🦆' }, { id: 'egg', name: 'ไข่ดาว', icon: '🍳' },
    { id: 'hat', name: 'หมวกปาร์ตี้', icon: '🥳' }, { id: 'heart', name: 'หัวใจ', icon: '❤️' },
    { id: 'photo', name: 'รูปของฉัน', icon: '📷' }, { id: 'doodle', name: 'ภาพวาด', icon: '✏️' }
  ];
  var ITEM = {};
  ITEMS.forEach(function (it, i) { ITEM[it.id] = i; });
  var INK = ['#1b1030', '#ffffff', '#ff3b6b', '#ffb300', '#ffe14d', '#3fbf5f', '#3fa9f5', '#b26bff'];

  var TRUNK_MIN = 0.2, TRUNK_MAX = 0.9, TRUNK_DEFAULT = 0.4;
  var PETALS_MIN = 5, PETALS_MAX = 16, PETALS_DEFAULT = 11;
  var SCALE_MIN = 0.4, SCALE_MAX = 2.5;
  var MAX_LEAF_POINTS = 24, MAX_ITEMS = 40, MAX_DOODLES = 3, MAX_STROKES = 60, MAX_DOODLE_POINTS = 400;
  var MAX_DESIGN_CHARS = 20000;   // JSON of a sanitized design never gets bigger than this
  var MAX_PHOTO_CHARS = 40000;    // base64 data URL; the workshop makes ~5-20 KB

  var PRESET_LEAVES = [
    { name: 'กลีบแหลม', points: [[0.5, 0], [0.8, 0.25], [0.78, 0.6], [0.5, 1], [0.22, 0.6], [0.2, 0.25]] },
    { name: 'กลีบมน', points: [[0.5, 0], [0.82, 0.2], [0.95, 0.55], [0.8, 0.88], [0.5, 1], [0.2, 0.88], [0.05, 0.55], [0.18, 0.2]] },
    { name: 'หัวใจ', points: [[0.5, 0], [0.92, 0.45], [0.95, 0.8], [0.75, 0.98], [0.5, 0.82], [0.25, 0.98], [0.05, 0.8], [0.08, 0.45]] },
    { name: 'ดาว', points: [[0.5, 0], [0.62, 0.35], [1, 0.4], [0.7, 0.62], [0.82, 1], [0.5, 0.78], [0.18, 1], [0.3, 0.62], [0, 0.4], [0.38, 0.35]] },
    { name: 'ฟันเลื่อย', points: [[0.5, 0], [0.75, 0.1], [0.6, 0.25], [0.85, 0.4], [0.65, 0.55], [0.85, 0.75], [0.5, 1], [0.15, 0.75], [0.35, 0.55], [0.15, 0.4], [0.4, 0.25], [0.25, 0.1]] }
  ];

  function isInt(v, n) { return typeof v === 'number' && v % 1 === 0 && v >= 0 && v < n; }
  function pick(v, n, def) { return isInt(v, n) ? v : def; }
  function num(v) { return typeof v === 'number' && isFinite(v); }
  function r2(v) { return Math.round(v * 100) / 100; }
  function clamp(v, lo, hi, def) { return num(v) ? r2(Math.max(lo, Math.min(hi, v))) : def; }

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
      if (!Array.isArray(p) || p.length !== 2 || !num(p[0]) || !num(p[1])) return null;
      if (!(p[0] >= 0 && p[0] <= 1 && p[1] >= 0 && p[1] <= 1)) return null;
      out.push([r2(p[0]), r2(p[1])]);
    }
    return area(out) >= 0.02 ? out : null;
  }

  function cleanDoodle(d) {
    if (!d || typeof d !== 'object' || !Array.isArray(d.s)) return null;
    var strokes = [], budget = MAX_DOODLE_POINTS;
    for (var i = 0; i < d.s.length && strokes.length < MAX_STROKES && budget > 0; i++) {
      var st = d.s[i];
      if (!st || !Array.isArray(st.p)) continue;
      var pts = [];
      for (var j = 0; j < st.p.length && budget > 0; j++) {
        var p = st.p[j];
        if (!Array.isArray(p) || p.length !== 2 || !num(p[0]) || !num(p[1])) continue;
        pts.push([r2(Math.max(0, Math.min(1, p[0]))), r2(Math.max(0, Math.min(1, p[1])))]);
        budget--;
      }
      if (pts.length) strokes.push({ c: pick(st.c, INK.length, 0), w: isInt(st.w, 4) && st.w > 0 ? st.w : 1, p: pts });
    }
    return strokes.length ? { s: strokes } : null;
  }

  function cleanItem(it, doodleMap) {
    if (!it || typeof it !== 'object' || !isInt(it.k, ITEMS.length)) return null;
    var p = it.p;
    if (!Array.isArray(p) || p.length !== 3 || !num(p[0]) || !num(p[1]) || !num(p[2])) return null;
    if (Math.abs(p[0]) > 3 || Math.abs(p[2]) > 3 || p[1] < -1 || p[1] > 4) return null;
    var out = { k: it.k, p: [r2(p[0]), r2(p[1]), r2(p[2])], r: num(it.r) ? r2(((it.r % 6.28) + 6.28) % 6.28) : 0, s: clamp(it.s, SCALE_MIN, SCALE_MAX, 1) };
    if (it.k === ITEM.doodle) {
      if (!isInt(it.d, MAX_DOODLES) || doodleMap[it.d] == null) return null;
      out = { k: it.k, d: doodleMap[it.d], p: out.p, r: out.r, s: out.s };
    }
    return out;
  }

  /** @returns {null | design} with every field present and in range */
  function sanitize(d) {
    if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
    var doodles = [], doodleMap = {};
    (Array.isArray(d.doodles) ? d.doodles : []).forEach(function (raw, i) {
      if (doodles.length >= MAX_DOODLES) return;
      var c = cleanDoodle(raw);
      if (c) { doodleMap[i] = doodles.length; doodles.push(c); }
    });
    var items = [];
    (Array.isArray(d.items) ? d.items : []).forEach(function (raw) {
      if (items.length >= MAX_ITEMS) return;
      var c = cleanItem(raw, doodleMap);
      if (c) items.push(c);
    });
    return {
      v: 2,
      base: pick(d.base, BASES.length, CUSTOM_BASE),
      material: pick(d.material, MATERIALS.length, 0),
      noCandle: d.noCandle === true,   // the centre candle taken away (candles can still be stuck on as items)
      trunk: clamp(d.trunk, TRUNK_MIN, TRUNK_MAX, TRUNK_DEFAULT),
      leaf: cleanLeaf(d.leaf),
      leafColor: pick(d.leafColor, LEAF_COLORS.length, 0),
      petals: num(d.petals) ? (d.petals <= 0 ? 0 : Math.round(Math.max(PETALS_MIN, Math.min(PETALS_MAX, d.petals)))) : PETALS_DEFAULT,   // 0 = no petals
      flowers: pick(d.flowers, FLOWERS.length, 0),
      items: items,
      doodles: doodles
    };
  }

  // Ramer-Douglas-Peucker on an open polyline
  function rdp(pts, eps) {
    if (pts.length < 3) return pts.slice();
    var a = pts[0], b = pts[pts.length - 1], dx = b[0] - a[0], dy = b[1] - a[1];
    var len = Math.sqrt(dx * dx + dy * dy), best = -1, at = 0;
    for (var i = 1; i < pts.length - 1; i++) {
      var d = len < 1e-9 ? Math.hypot(pts[i][0] - a[0], pts[i][1] - a[1]) : Math.abs(dy * pts[i][0] - dx * pts[i][1] + b[0] * a[1] - b[1] * a[0]) / len;
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
    var f = simple[0], l = simple[simple.length - 1];
    if (simple.length > 3 && Math.hypot(f[0] - l[0], f[1] - l[1]) < size * 0.05) simple.pop();
    var s = 1 / size, cx = (minX + maxX) / 2;
    return cleanLeaf(simple.map(function (p) { return [r2((p[0] - cx) * s + 0.5), r2((p[1] - minY) * s)]; }));
  }

  /** One drawn stroke in canvas pixels -> simplified points in 0..1 (y down). */
  function simplifyStroke(path, w, h) {
    var pts = path.map(function (p) { return [Math.max(0, Math.min(1, p[0] / w)), Math.max(0, Math.min(1, p[1] / h))]; });
    return rdp(pts, 0.004).map(function (p) { return [r2(p[0]), r2(p[1])]; });
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
    BASES: BASES, CUSTOM_BASE: CUSTOM_BASE, MATERIALS: MATERIALS, FLOWERS: FLOWERS, FLOWER_COLORS: FLOWER_COLORS,
    LEAF_COLORS: LEAF_COLORS, LEAF_TONES: LEAF_TONES, RAINBOW_TONES: RAINBOW_TONES, ITEMS: ITEMS, ITEM: ITEM, INK: INK, PRESET_LEAVES: PRESET_LEAVES,
    TRUNK_MIN: TRUNK_MIN, TRUNK_MAX: TRUNK_MAX, TRUNK_DEFAULT: TRUNK_DEFAULT, PETALS_MIN: PETALS_MIN, PETALS_MAX: PETALS_MAX,
    SCALE_MIN: SCALE_MIN, SCALE_MAX: SCALE_MAX,
    MAX_LEAF_POINTS: MAX_LEAF_POINTS, MAX_ITEMS: MAX_ITEMS, MAX_DOODLES: MAX_DOODLES, MAX_DOODLE_POINTS: MAX_DOODLE_POINTS,
    MAX_DESIGN_CHARS: MAX_DESIGN_CHARS, MAX_PHOTO_CHARS: MAX_PHOTO_CHARS,
    sanitize: sanitize, normalizeLeaf: normalizeLeaf, simplifyStroke: simplifyStroke, photoOk: photoOk
  };
});
