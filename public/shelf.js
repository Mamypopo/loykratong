/* ชั้นวางกระทงของฉัน: the krathongs a person made on this device, and which one they float.
 * Kept in localStorage (this device only, no login). Each krathong: { kid, look: { design, photo }, floats, at }.
 *   createShelf(storage) -> { items, get, selected, select, add, update, remove, markFloated, lastSaveOk }
 *   LoyKrathongShelf.open({ container, shelf, snapshot(look) -> Promise<url>, toast, onPick(kid), onEdit(kid), onNew(), onClose() })
 * Needs design.js (LoyKrathongDesign).
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LoyKrathongShelf = api;
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';
  var KEY = 'lk-shelf', OLD_KEY = 'lk-look', MAX = 12, RANDOM = 'random';
  function D() { return (root && root.LoyKrathongDesign) || (typeof module === 'object' && module.exports ? require('./design.js') : null); }

  function newKid() { return (Date.now().toString(36) + Math.random().toString(36).slice(2, 10)).slice(0, 20); }
  function cleanLook(l) {
    if (!l || typeof l !== 'object' || !D()) return null;
    var design = D().sanitize(l.design);
    if (!design) return null;
    return { design: design, photo: D().photoOk(l.photo) ? l.photo : null };
  }

  function createShelf(storage) {
    var state = { sel: null, items: [] }, saveOk = true;
    function read(k) { try { return storage ? storage.getItem(k) : null; } catch (e) { return null; } }
    try {
      var raw = JSON.parse(read(KEY) || 'null');
      if (raw && Array.isArray(raw.items)) {
        raw.items.forEach(function (it) {
          var look = it && /^[a-z0-9]{6,24}$/.test(String(it.kid)) ? cleanLook(it.look) : null;
          if (look && state.items.length < MAX) state.items.push({ kid: it.kid, look: look, floats: Math.max(0, it.floats | 0), at: Number(it.at) || 0 });
        });
        state.sel = raw.sel;
      }
    } catch (e) { /* broken storage: start empty */ }
    if (!state.items.length) {   // move a krathong saved by the earlier single-krathong version
      try {
        var old = cleanLook(JSON.parse(read(OLD_KEY) || 'null'));
        if (old) { state.items.push({ kid: newKid(), look: old, floats: 0, at: Date.now() }); state.sel = state.items[0].kid; save(); }
        if (storage) storage.removeItem(OLD_KEY);
      } catch (e) { /* ignore */ }
    }
    if (state.sel !== RANDOM && !get(state.sel)) state.sel = state.items.length ? state.items[0].kid : RANDOM;

    function save() {
      try { if (storage) storage.setItem(KEY, JSON.stringify(state)); saveOk = true; } catch (e) { saveOk = false; }
      return saveOk;
    }
    function get(kid) { for (var i = 0; i < state.items.length; i++) if (state.items[i].kid === kid) return state.items[i]; return null; }

    return {
      items: function () { return state.items.slice(); },
      get: get,
      selected: function () { return get(state.sel); },
      // kid, or null = a random krathong every time
      select: function (kid) { if (kid == null) { state.sel = RANDOM; save(); } else if (get(kid)) { state.sel = kid; save(); } },
      isRandom: function () { return state.sel === RANDOM; },
      // a ready-made style (base 0-5) as it is: reuse the plain one already on the shelf, or add it
      usePreset: function (base) {
        if (!D() || !(base >= 0 && base < D().CUSTOM_BASE && base % 1 === 0)) return null;
        var plain = cleanLook({ design: { base: base } }), want = JSON.stringify(plain.design);
        for (var i = 0; i < state.items.length; i++) {
          var it = state.items[i];
          if (!it.look.photo && JSON.stringify(it.look.design) === want) { state.sel = it.kid; save(); return it.kid; }
        }
        return this.add(plain);
      },
      add: function (look) {
        var l = cleanLook(look);
        if (!l || state.items.length >= MAX) return null;
        var it = { kid: newKid(), look: l, floats: 0, at: Date.now() };
        state.items.unshift(it); state.sel = it.kid; save();
        return it.kid;
      },
      update: function (kid, look) {
        var it = get(kid), l = cleanLook(look);
        if (!it || !l) return false;
        it.look = l; it.at = Date.now(); save();
        return true;
      },
      remove: function (kid) {
        state.items = state.items.filter(function (it) { return it.kid !== kid; });
        if (state.sel === kid) state.sel = state.items.length ? state.items[0].kid : RANDOM;
        save();
      },
      markFloated: function (kid) { var it = get(kid); if (it) { it.floats++; save(); } },
      lastSaveOk: function () { return saveOk; }
    };
  }

  // ------------------------------------------------------------------ UI (browser only)
  var CSS = [
    '.lks{position:absolute;left:0;right:0;bottom:0;z-index:20;max-height:62vh;display:flex;flex-direction:column;background:rgba(24,12,58,.94);border-top:1.5px solid rgba(255,226,122,.5);border-radius:20px 20px 0 0;box-shadow:0 -12px 40px rgba(0,0,0,.45);color:#fff;transform:translateY(105%);transition:transform .35s cubic-bezier(.2,.8,.2,1);padding-bottom:env(safe-area-inset-bottom)}',
    '.lks.lks-in{transform:none}',
    '.lks button{font:inherit;color:inherit;cursor:pointer;border:0;-webkit-tap-highlight-color:transparent}',
    '.lks .lks-head{display:flex;align-items:center;gap:8px;padding:12px 14px 6px}',
    '.lks .lks-head h2{flex:1;margin:0;font-size:18px;font-weight:500;color:#ffe9a8}',
    '.lks .lks-x{background:rgba(255,255,255,.1);border-radius:999px;padding:7px 13px;font-size:14px}',
    '.lks .lks-body{overflow-y:auto;padding:6px 14px 16px}',
    '.lks .lks-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px}',
    '.lks .lks-card{position:relative;border-radius:16px;background:rgba(255,255,255,.07);border:2px solid transparent;padding:6px;display:flex;flex-direction:column;gap:6px}',
    '.lks .lks-card[aria-current="true"]{border-color:#ffe07a;background:rgba(255,224,122,.12)}',
    '.lks .lks-pic{aspect-ratio:1;border-radius:12px;background:radial-gradient(circle at 50% 40%,#5a3a24,#2b1a12);display:grid;place-items:center;overflow:hidden;padding:0}',
    '.lks .lks-pic img{width:100%;height:100%;object-fit:cover;display:block}',
    '.lks .lks-meta{font-size:12px;color:#d9cff5;text-align:center}',
    '.lks .lks-acts{display:flex;gap:6px}',
    '.lks .lks-act{flex:1;background:rgba(255,255,255,.1);border-radius:999px;padding:6px 4px;font-size:13px}',
    '.lks .lks-use{background:linear-gradient(#ffe07a,#ffb83d);color:#4a2400}',
    '.lks .lks-del{flex:0 0 36px}',
    '.lks .lks-new{aspect-ratio:auto;min-height:180px;border:2px dashed rgba(255,226,122,.5);background:transparent;border-radius:16px;font-size:15px;color:#ffe9a8;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px}',
    '.lks .lks-new b{font-size:34px;font-weight:400}',
    '.lks .lks-badge{position:absolute;top:10px;left:10px;background:#ffe07a;color:#4a2400;border-radius:999px;padding:2px 9px;font-size:12px}',
    '.lks .lks-note{font-size:12px;color:#bfb3e6;margin:12px 0 0}',
    '.lks .lks-h{font-size:14px;color:#ffe9a8;margin:4px 0 8px}',
    '.lks .lks-quick{display:flex;gap:8px;overflow-x:auto;padding-bottom:6px;margin-bottom:12px;scrollbar-width:thin}',
    '.lks .lks-q{flex:none;width:84px;display:flex;flex-direction:column;align-items:center;gap:4px;padding:5px;border-radius:14px;background:rgba(255,255,255,.07);border:2px solid transparent;font-size:12px}',
    '.lks .lks-q[aria-pressed="true"]{border-color:#ffe07a;background:rgba(255,224,122,.14)}',
    '.lks .lks-q span.lks-qpic{width:72px;height:72px;border-radius:10px;background:radial-gradient(circle at 50% 40%,#5a3a24,#2b1a12);display:grid;place-items:center;overflow:hidden;font-size:30px}',
    '.lks .lks-q img{width:100%;height:100%;object-fit:cover;display:block}',
    '.lks :focus-visible{outline:2px solid #ffe07a;outline-offset:2px}',
    '@media (min-width:900px){.lks{left:auto;right:20px;bottom:20px;width:520px;border-radius:20px;border:1.5px solid rgba(255,226,122,.5)}}'
  ].join('\n');

  var current = null, thumbs = {};
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function btn(cls, text, fn, label) { var b = el('button', cls, text); b.type = 'button'; if (label) { b.setAttribute('aria-label', label); b.title = label; } if (fn) b.addEventListener('click', fn); return b; }

  function open(o) {
    close();
    if (!document.getElementById('lks-css')) { var s = el('style'); s.id = 'lks-css'; s.textContent = CSS; document.head.appendChild(s); }
    var shelf = o.shelf, toast = o.toast || function () {};
    var box = el('section', 'lks'); box.setAttribute('aria-label', 'กระทงของฉัน');
    var head = el('div', 'lks-head');
    head.appendChild(el('h2', null, '🧺 กระทงของฉัน'));
    head.appendChild(btn('lks-x', 'ปิด', function () { finish(); }));
    var body = el('div', 'lks-body');
    box.appendChild(head); box.appendChild(body);
    box.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    box.addEventListener('click', function (e) { e.stopPropagation(); });
    var armed = null;   // kid waiting for a second tap on delete

    function thumb(it, holder, icon) {
      var key = it.kid + ':' + it.at;
      if (thumbs[key]) { var im = el('img'); im.alt = ''; im.src = thumbs[key]; holder.appendChild(im); return; }
      holder.textContent = icon || '🪷';
      if (!o.snapshot) return;
      o.snapshot(it.look).then(function (url) {
        if (!url) return;
        thumbs[key] = url;
        holder.textContent = '';
        var img = el('img'); img.alt = ''; img.src = url; holder.appendChild(img);
      });
    }

    // ready-made krathongs and "random", one tap to use
    var PRESET_ICONS = ['🍃', '🪷', '🍞', '🥥', '🦢', '🐢'];
    function quickRow(sel) {
      var row = el('div', 'lks-quick'), D = root.LoyKrathongDesign;
      var rnd = btn('lks-q', null, function () { shelf.select(null); if (o.onPick) o.onPick(null); toast('🎲 ลอยครั้งไหนก็ได้กระทงแบบสุ่ม'); render(); }, 'สุ่มทุกครั้ง');
      rnd.setAttribute('aria-pressed', String(shelf.isRandom()));
      var rp = el('span', 'lks-qpic', '🎲'); rnd.appendChild(rp); rnd.appendChild(el('span', null, 'สุ่มทุกครั้ง'));
      row.appendChild(rnd);
      for (var i = 0; i < D.CUSTOM_BASE; i++) (function (base) {
        var plain = JSON.stringify(D.sanitize({ base: base }));
        var on = !!sel && !sel.look.photo && JSON.stringify(sel.look.design) === plain;
        var b = btn('lks-q', null, function () {
          var kid = shelf.usePreset(base);
          if (!kid) { toast('ชั้นวางเต็มแล้ว ลบกระทงเก่าก่อนนะ'); return; }
          if (o.onPick) o.onPick(kid); toast('✓ เลือกกระทง' + D.BASES[base] + 'แล้ว'); render();
        }, 'กระทง' + D.BASES[base]);
        b.setAttribute('aria-pressed', String(on));
        var pic = el('span', 'lks-qpic');
        thumb({ kid: 'preset' + base, at: 0, look: { design: { base: base }, photo: null } }, pic, PRESET_ICONS[base]);
        b.appendChild(pic); b.appendChild(el('span', null, D.BASES[base]));
        row.appendChild(b);
      })(i);
      return row;
    }

    function render() {
      body.textContent = '';
      var sel = shelf.selected();
      body.appendChild(el('div', 'lks-h', 'เลือกแบบเร็ว'));
      body.appendChild(quickRow(sel));
      body.appendChild(el('div', 'lks-h', 'กระทงของฉัน'));
      var grid = el('div', 'lks-grid');
      shelf.items().forEach(function (it) {
        var on = !!sel && sel.kid === it.kid;
        var card = el('div', 'lks-card'); if (on) card.setAttribute('aria-current', 'true');
        var pic = btn('lks-pic', null, function () { shelf.select(it.kid); if (o.onPick) o.onPick(it.kid); render(); }, 'เลือกกระทงใบนี้');
        thumb(it, pic);
        card.appendChild(pic);
        if (on) card.appendChild(el('span', 'lks-badge', '✓ ใบที่จะลอย'));
        card.appendChild(el('div', 'lks-meta', it.floats ? 'ลอยไปแล้ว ' + it.floats + ' ครั้ง' : 'ยังไม่เคยลอย'));
        var acts = el('div', 'lks-acts');
        if (!on) acts.appendChild(btn('lks-act lks-use', 'ใช้ใบนี้', function () { shelf.select(it.kid); if (o.onPick) o.onPick(it.kid); toast('✓ เลือกกระทงใบนี้แล้ว'); render(); }));
        acts.appendChild(btn('lks-act', '✏️ แก้', function () { finish(); if (o.onEdit) o.onEdit(it.kid); }));
        acts.appendChild(btn('lks-act lks-del', armed === it.kid ? 'ลบ?' : '🗑', function () {
          if (armed !== it.kid) { armed = it.kid; render(); return; }
          armed = null; shelf.remove(it.kid); if (o.onPick) o.onPick(shelf.selected() ? shelf.selected().kid : null); render();
        }, 'ลบกระทงใบนี้ (แตะสองครั้ง)'));
        card.appendChild(acts);
        grid.appendChild(card);
      });
      if (shelf.items().length < MAX) {
        var nb = btn('lks-new', null, function () { finish(); if (o.onNew) o.onNew(); });
        nb.appendChild(el('b', null, '＋')); nb.appendChild(el('span', null, 'ทำกระทงใบใหม่'));
        grid.appendChild(nb);
      }
      body.appendChild(grid);
      body.appendChild(el('p', 'lks-note', 'กระทงเก็บไว้ในเครื่องนี้ (สูงสุด ' + MAX + ' ใบ) ใบที่เลือกจะลอยไปให้เพื่อนและจอใหญ่เห็นเมื่อกด ลอยกระทง กระทงสำเร็จกด ✏️ แก้ เพื่อติดของเพิ่มได้'));
    }
    function finish() {
      box.classList.remove('lks-in');
      setTimeout(function () { if (box.parentNode) box.parentNode.removeChild(box); }, 350);
      current = null;
      if (o.onClose) o.onClose();
    }
    render();
    (o.container || document.body).appendChild(box);
    requestAnimationFrame(function () { box.classList.add('lks-in'); });
    current = { close: finish };
  }
  function close() { if (current) current.close(); }

  return { createShelf: createShelf, open: open, close: close, MAX: MAX };
});
