/* โต๊ะทำกระทง: the controls around the 3D workshop table (the table itself lives in the scene: scene.table).
 * LoyKrathongWorkshop.open({ container, table, look, toast, onDone(look | undefined) })
 *   look = { design (see design.js), photo: JPEG data URL | null }
 *   onDone gets the finished look, or undefined when cancelled.
 * Steps: cut a slice of banana trunk (or pick a ready-made base) → draw the petal you cut from a leaf →
 * stick things anywhere (tap the krathong; drag to move; rotate, resize, lift, delete) → draw your own stickers → add a photo.
 * Needs design.js (LoyKrathongDesign). No inline scripts or remote assets, so the page CSP stays strict.
 */
(function (global) {
  'use strict';
  var D = global.LoyKrathongDesign;
  var BASE_ICONS = ['🍃', '🪷', '🍞', '🥥', '🦢', '🐢'];
  // swatch per petal material (same order as LeafColors in design.js); the rainbow shows as a gradient
  var LEAF_SWATCH = ['#38a24f', '#9fd65a', '#c9a35a', '#d77bff', '#ff7fb0', '#e53950', '#ffa31a',
    'linear-gradient(135deg,#ff6b81,#ffb347,#fff176,#81c784,#64b5f6,#ce93d8)', '#ffd54a'];
  function inkFor(i) { var c = LEAF_SWATCH[i] || LEAF_SWATCH[0]; return c.charAt(0) === '#' ? c : '#b388ff'; }   // canvas needs a plain colour
  var CSS = [
    '.lkw-top{position:absolute;left:0;right:0;top:0;z-index:21;display:flex;align-items:center;gap:8px;padding:max(10px,env(safe-area-inset-top)) 12px 10px;pointer-events:none}',
    '.lkw-top>*{pointer-events:auto}',
    '.lkw-top h2{flex:1;margin:0;font-size:18px;font-weight:500;color:#ffe9a8;text-shadow:0 2px 8px rgba(0,0,0,.6);pointer-events:none}',
    '.lkw-hint{position:absolute;left:50%;transform:translateX(-50%);z-index:21;top:calc(max(10px,env(safe-area-inset-top)) + 52px);width:max-content;max-width:min(92vw,520px);text-align:center;font-size:14px;padding:8px 16px;border-radius:999px;background:rgba(30,14,8,.72);border:1.5px solid rgba(255,226,122,.5);color:#fff6d6;pointer-events:none}',
    '.lkw-hint:empty{display:none}',
    '.lkw-sheet{position:absolute;left:0;right:0;bottom:0;z-index:20;max-height:46vh;display:flex;flex-direction:column;background:rgba(36,20,12,.92);border-top:1.5px solid rgba(255,226,122,.45);border-radius:20px 20px 0 0;box-shadow:0 -12px 40px rgba(0,0,0,.45);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);color:#fff;transform:translateY(105%);transition:transform .35s cubic-bezier(.2,.8,.2,1);padding-bottom:env(safe-area-inset-bottom)}',
    '.lkw-in .lkw-sheet{transform:none}',
    '.lkw-wrap button{font:inherit;color:inherit;cursor:pointer;border:0;-webkit-tap-highlight-color:transparent}',
    '.lkw-wrap .lkw-x{background:rgba(30,14,8,.7);border-radius:999px;padding:8px 14px;font-size:14px;border:1.5px solid rgba(255,255,255,.2)}',
    '.lkw-wrap .lkw-done{background:linear-gradient(#ffe07a,#ffb83d);color:#4a2400;border-radius:999px;padding:9px 20px;font-weight:500;box-shadow:0 3px 0 #b8761a}',
    '.lkw-wrap .lkw-tabs{display:flex;gap:6px;padding:10px 12px 8px;overflow-x:auto;scrollbar-width:none;flex:none}',
    '.lkw-wrap .lkw-tabs::-webkit-scrollbar{display:none}',
    '.lkw-wrap .lkw-tab{flex:none;background:rgba(255,255,255,.08);border-radius:999px;padding:7px 14px;font-size:14px;color:#f3e6d0}',
    '.lkw-wrap .lkw-tab[aria-selected="true"]{background:#ffe9a8;color:#4a2400}',
    '.lkw-wrap .lkw-body{overflow-y:auto;padding:2px 12px 14px;flex:1;min-height:0}',
    '.lkw-wrap .lkw-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(78px,1fr));gap:7px}',
    '.lkw-wrap .lkw-opt{display:flex;flex-direction:column;align-items:center;gap:3px;padding:8px 4px;border-radius:14px;background:rgba(255,255,255,.07);border:2px solid transparent;font-size:12px;line-height:1.2}',
    '.lkw-wrap .lkw-opt b{font-size:24px;font-weight:400;line-height:1}',
    '.lkw-wrap .lkw-opt[aria-pressed="true"]{border-color:#ffe07a;background:rgba(255,224,122,.16)}',
    '.lkw-wrap .lkw-big{display:flex;align-items:center;gap:12px;width:100%;padding:12px 14px;border-radius:16px;background:linear-gradient(#7fd88f,#3f8a5a);box-shadow:0 4px 0 #22573a;font-size:16px;margin-bottom:10px;text-align:left}',
    '.lkw-wrap .lkw-big:disabled{opacity:.45;cursor:default}',
    '.lkw-wrap .lkw-big b{font-size:30px;font-weight:400}',
    '.lkw-wrap .lkw-big small{display:block;font-size:12px;opacity:.85}',
    '.lkw-wrap .lkw-label{font-size:13px;color:#e8d8bf;margin:12px 0 6px}',
    '.lkw-wrap .lkw-dots{display:flex;gap:3px}.lkw-wrap .lkw-dots i{width:15px;height:15px;border-radius:50%;box-shadow:inset 0 0 0 1px rgba(0,0,0,.2)}',
    '.lkw-wrap .lkw-row{display:flex;gap:12px;flex-wrap:wrap;align-items:flex-start}',
    '.lkw-wrap .lkw-cv{touch-action:none;width:min(52vw,210px);height:auto;aspect-ratio:1;border-radius:16px;background:#2a1a10;cursor:crosshair;display:block;flex:none}',
    '.lkw-wrap .lkw-paper{background:#fffaf0}',
    '.lkw-wrap .lkw-side{flex:1;min-width:140px;display:flex;flex-direction:column;gap:7px;font-size:13px;color:#e8d8bf}',
    '.lkw-wrap .lkw-chips{display:flex;flex-wrap:wrap;gap:6px;align-items:center}',
    '.lkw-wrap .lkw-chip{background:rgba(255,255,255,.1);border-radius:999px;padding:6px 11px;font-size:13px;border:2px solid transparent}',
    '.lkw-wrap .lkw-chip[aria-pressed="true"]{border-color:#ffe07a}',
    '.lkw-wrap .lkw-sw{width:28px;height:28px;border-radius:50%;border:3px solid transparent;padding:0}',
    '.lkw-wrap .lkw-sw[aria-pressed="true"]{border-color:#fff;box-shadow:0 0 0 2px #3a2010}',
    '.lkw-wrap .lkw-pola{width:96px;height:114px;border-radius:6px;background:rgba(255,255,255,.08);display:grid;place-items:center;font-size:36px;overflow:hidden;transform:rotate(-3deg);flex:none}',
    '.lkw-wrap .lkw-pola img{width:100%;height:100%;object-fit:cover}',
    '.lkw-wrap .lkw-note{font-size:12px;color:#cdbb9e;margin:8px 0 0}',
    '.lkw-wrap .lkw-file{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}',
    '.lkw-wrap .lkw-thumb{width:52px;height:52px;border-radius:10px;background:#fffaf0;padding:0;border:2px solid transparent}',
    '.lkw-wrap .lkw-thumb[aria-pressed="true"]{border-color:#ffe07a}',
    '.lkw-wrap .lkw-thumb canvas{width:100%;height:100%;display:block}',
    '.lkw-edit{position:absolute;left:50%;transform:translateX(-50%);z-index:21;top:calc(max(10px,env(safe-area-inset-top)) + 118px);display:flex;gap:6px;padding:6px;border-radius:999px;background:rgba(30,14,8,.85);border:1.5px solid rgba(255,226,122,.5)}',
    '.lkw-edit[hidden]{display:none}',
    '.lkw-wrap .lkw-edit button{width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,.1);font-size:17px}',
    '.lkw-wrap :focus-visible{outline:2px solid #ffe07a;outline-offset:2px}',
    '@media (min-width:900px){.lkw-sheet{left:auto;right:20px;bottom:20px;top:76px;width:400px;max-height:none;border-radius:20px;border:1.5px solid rgba(255,226,122,.45)}.lkw-edit{left:calc(50% - 210px)}.lkw-hint{left:calc(50% - 210px)}}',
    '@media (prefers-reduced-motion:reduce){.lkw-sheet{transition:none}}'
  ].join('\n');

  var current = null;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function btn(cls, text, onClick, label) {
    var b = el('button', cls, text); b.type = 'button';
    if (label) { b.setAttribute('aria-label', label); b.title = label; }
    if (onClick) b.addEventListener('click', onClick);
    return b;
  }
  function injectCss() {
    if (document.getElementById('lkw-css')) return;
    var s = document.createElement('style'); s.id = 'lkw-css'; s.textContent = CSS;
    document.head.appendChild(s);
  }

  // photo -> small polaroid JPEG (white frame, square crop), shrunk until it fits MAX_PHOTO_CHARS
  function makePolaroid(file) {
    return new Promise(function (resolve, reject) {
      if (!file || !/^image\//.test(file.type)) return reject(new Error('type'));
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        var cv = document.createElement('canvas'); cv.width = 160; cv.height = 190;
        var ctx = cv.getContext('2d');
        ctx.fillStyle = '#fffdf6'; ctx.fillRect(0, 0, 160, 190);
        var side = Math.min(img.naturalWidth, img.naturalHeight);
        ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 9, 9, 142, 142);
        ctx.fillStyle = '#e8c35a'; ctx.font = '22px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('🪷', 80, 179);
        var q = [0.8, 0.65, 0.5, 0.35];
        for (var i = 0; i < q.length; i++) {
          var out = cv.toDataURL('image/jpeg', q[i]);
          if (D.photoOk(out)) return resolve(out);
        }
        reject(new Error('size'));
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('decode')); };
      img.src = url;
    });
  }

  function drawDoodle(ctx, doodle, size) {
    ctx.clearRect(0, 0, size, size);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    doodle.s.forEach(function (st) {
      ctx.strokeStyle = ctx.fillStyle = D.INK[st.c] || D.INK[0];
      var w = (5 + st.w * 5) * size / 256;
      if (st.p.length === 1) { ctx.beginPath(); ctx.arc(st.p[0][0] * size, st.p[0][1] * size, w / 2, 0, 6.28); ctx.fill(); return; }
      ctx.lineWidth = w; ctx.beginPath();
      st.p.forEach(function (q, i) { if (i) ctx.lineTo(q[0] * size, q[1] * size); else ctx.moveTo(q[0] * size, q[1] * size); });
      ctx.stroke();
    });
  }

  function open(o) {
    if (!D || !o.table) return;
    close();
    injectCss();
    var table = o.table, toast = o.toast || function () {};
    var start = o.look ? JSON.parse(JSON.stringify(o.look)) : null;
    var look = { design: D.sanitize(start && start.design) || D.sanitize({}), photo: start && D.photoOk(start.photo) ? start.photo : null };
    var tab = 'base', tool = null;

    var wrap = el('div', 'lkw-wrap');
    var top = el('div', 'lkw-top');
    var cancelB = btn('lkw-x', '✕ ยกเลิก', function () { finish(undefined); });
    var doneB = btn('lkw-done', 'เสร็จแล้ว ✓', function () { finish(JSON.parse(JSON.stringify(look))); });
    top.appendChild(cancelB); top.appendChild(el('h2', null, 'โต๊ะทำกระทง')); top.appendChild(doneB);
    var hint = el('div', 'lkw-hint'); hint.setAttribute('role', 'status');
    var sheet = el('section', 'lkw-sheet'); sheet.setAttribute('aria-label', 'เครื่องมือทำกระทง');
    var tabs = el('div', 'lkw-tabs'); tabs.setAttribute('role', 'tablist');
    var body = el('div', 'lkw-body');
    sheet.appendChild(tabs); sheet.appendChild(body);
    var edit = el('div', 'lkw-edit'); edit.hidden = true; edit.setAttribute('aria-label', 'แก้ของที่เลือก');
    [['⟲', 'หมุนซ้าย', { rotate: 0.4 }], ['⟳', 'หมุนขวา', { rotate: -0.4 }], ['＋', 'ใหญ่ขึ้น', { scale: 1.2 }], ['－', 'เล็กลง', { scale: 1 / 1.2 }],
      ['⬆', 'ยกขึ้น', { lift: 0.1 }], ['⬇', 'กดลง', { lift: -0.1 }], ['🗑', 'ลบ', { remove: true }]].forEach(function (a) {
      edit.appendChild(btn('', a[0], function () { table.edit(a[2]); if (a[2].remove) showEdit(-1); }, a[1]));
    });
    edit.appendChild(btn('', '✓', function () { table.select(-1); showEdit(-1); }, 'เลิกเลือก'));
    wrap.appendChild(top); wrap.appendChild(hint); wrap.appendChild(edit); wrap.appendChild(sheet);
    // clicks on the controls must not reach the 3D canvas underneath
    wrap.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    wrap.addEventListener('click', function (e) { e.stopPropagation(); });

    function setHint(t) { hint.textContent = t || ''; }
    function showEdit(i) {
      edit.hidden = i < 0;
      if (i >= 0) { var it = look.design.items[i]; setHint('ลากเพื่อย้าย' + (it ? D.ITEMS[it.k].name : '') + ' หรือใช้ปุ่มหมุน ย่อ ขยาย ลบ'); }
      else if (!tool) setHint('');
    }
    function setTool(t, label) {
      tool = t;
      table.tool(t);
      showEdit(-1);
      setHint(t ? 'แตะบนกระทงตรงที่อยากติด ' + label : '');
    }
    function changed() { table.refresh(); }

    var TABS = [['base', 'ฐาน'], ['leaf', 'กลีบ'], ['stick', 'ติดของ'], ['draw', 'วาดเอง'], ['photo', 'รูปของฉัน']];
    TABS.forEach(function (t) {
      var b = btn('lkw-tab', t[1], function () { tab = t[0]; table.mode('build'); setTool(null); render(); });
      b.setAttribute('role', 'tab'); b.dataset.tab = t[0];
      tabs.appendChild(b);
    });

    // ---- base: cut the trunk, or pick a ready-made base
    function basePanel() {
      var box = el('div');
      var mat = D.MATERIALS[look.design.material] || D.MATERIALS[0];
      var cut = btn('lkw-big', '', function () {
        setTool(null);
        table.mode('cut');
        setHint('🔪 เลื่อนมีดไปตรงที่จะตัด' + mat.name + ' แล้วกด/ปล่อยนิ้วเพื่อตัด ยิ่งตัดหนา ฐานยิ่งสูง');
      });
      cut.appendChild(el('b', null, '🔪'));
      var tx = el('span', null, 'ตัด' + mat.name + 'ทำฐาน');
      tx.appendChild(el('small', null, look.design.base === D.CUSTOM_BASE ? 'ฐานตอนนี้สูง ' + Math.round(look.design.trunk * 10) + ' นิ้ว แตะเพื่อตัดใหม่' : 'ตัดเป็นแว่น แล้วเอามาทำฐาน'));
      cut.appendChild(tx);
      box.appendChild(cut);
      // what to cut it from
      var mg = el('div', 'lkw-chips'); mg.setAttribute('role', 'group'); mg.setAttribute('aria-label', 'วัสดุทำฐาน');
      D.MATERIALS.forEach(function (m, i) {
        var b = btn('lkw-chip', m.icon + ' ' + m.name, function () { look.design.material = i; look.design.base = D.CUSTOM_BASE; changed(); render(); });
        b.setAttribute('aria-pressed', String(look.design.base === D.CUSTOM_BASE && look.design.material === i));
        mg.appendChild(b);
      });
      box.appendChild(mg);
      box.appendChild(el('div', 'lkw-label', 'หรือใช้ฐานสำเร็จ'));
      var g = el('div', 'lkw-grid');
      D.BASES.slice(0, D.CUSTOM_BASE).forEach(function (n, i) {
        var b = btn('lkw-opt', null, function () { look.design.base = i; changed(); render(); });
        b.setAttribute('aria-pressed', String(look.design.base === i));
        b.appendChild(el('b', null, BASE_ICONS[i])); b.appendChild(el('span', null, n));
        g.appendChild(b);
      });
      box.appendChild(g);
      if (look.design.base !== D.CUSTOM_BASE) {
        box.appendChild(el('div', 'lkw-label', 'สีดอกไม้ของฐานสำเร็จ'));
        var fg = el('div', 'lkw-grid');
        D.FLOWERS.forEach(function (n, i) {
          var b = btn('lkw-opt', null, function () { look.design.flowers = i; changed(); render(); });
          b.setAttribute('aria-pressed', String(look.design.flowers === i));
          var dots = el('div', 'lkw-dots');
          D.FLOWER_COLORS[i].forEach(function (c) { var d = el('i'); d.style.background = c; dots.appendChild(d); });
          b.appendChild(dots); b.appendChild(el('span', null, n));
          fg.appendChild(b);
        });
        box.appendChild(fg);
      }
      return box;
    }

    // ---- petals: draw a closed shape on the leaf, release = cut
    function leafPanel() {
      var box = el('div');
      if (look.design.base !== D.CUSTOM_BASE) box.appendChild(el('p', 'lkw-note', 'กลีบที่ตัดเองใช้กับฐานต้นกล้วย ตัดหรือเลือกกลีบเมื่อไหร่ ฐานจะเปลี่ยนเป็นต้นกล้วยให้'));
      var row = el('div', 'lkw-row');
      var cv = el('canvas', 'lkw-cv'); cv.width = 420; cv.height = 420;
      cv.setAttribute('aria-label', 'ใบตอง ลากนิ้ววาดรูปกลีบที่จะตัด');
      var ctx = cv.getContext('2d'), path = [], drawing = false;
      function drawLeaf() {
        ctx.clearRect(0, 0, 420, 420);
        var tone = inkFor(look.design.leafColor);
        ctx.save();
        ctx.fillStyle = tone; ctx.globalAlpha = look.design.leaf ? 0.25 : 1;
        ctx.beginPath(); ctx.moveTo(30, 50); ctx.quadraticCurveTo(210, 8, 390, 50); ctx.lineTo(390, 370); ctx.quadraticCurveTo(210, 412, 30, 370); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 2;
        for (var y = 60; y < 370; y += 24) { ctx.beginPath(); ctx.moveTo(210, y); ctx.lineTo(50, y + 28); ctx.moveTo(210, y); ctx.lineTo(370, y + 28); ctx.stroke(); }
        ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(210, 32); ctx.lineTo(210, 395); ctx.stroke();
        ctx.restore();
        if (look.design.leaf) {
          ctx.save(); ctx.fillStyle = tone; ctx.strokeStyle = '#fff6c8'; ctx.lineWidth = 4;
          ctx.beginPath();
          look.design.leaf.forEach(function (p, i) { var x = 75 + p[0] * 270, y = 360 - p[1] * 300; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
          ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
        }
      }
      function at(e) { var r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * 420, (e.clientY - r.top) / r.height * 420]; }
      cv.addEventListener('pointerdown', function (e) {
        e.preventDefault(); drawing = true; path = [at(e)];
        try { cv.setPointerCapture(e.pointerId); } catch (err) { /* old browser */ }
        look.design.leaf = null; drawLeaf();
      });
      cv.addEventListener('pointermove', function (e) {
        if (!drawing) return;
        var p = at(e), last = path[path.length - 1];
        if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 4) return;
        path.push(p);
        ctx.save(); ctx.strokeStyle = '#fff6c8'; ctx.lineWidth = 4; ctx.setLineDash([12, 10]); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(last[0], last[1]); ctx.lineTo(p[0], p[1]); ctx.stroke(); ctx.restore();
      });
      function done() {
        if (!drawing) return;
        drawing = false;
        var leaf = D.normalizeLeaf(path);
        if (!leaf) { toast('ลองวาดเป็นรูปปิดนะ เช่น วงรีหรือหยดน้ำ ✂️'); drawLeaf(); return; }
        look.design.leaf = leaf; look.design.base = D.CUSTOM_BASE;
        drawLeaf(); changed(); toast('✂️ ฉับ! ได้กลีบใหม่แล้ว'); renderSide();
      }
      cv.addEventListener('pointerup', done);
      cv.addEventListener('pointercancel', done);
      drawLeaf();

      var side = el('div', 'lkw-side');
      function renderSide() {
        side.textContent = '';
        side.appendChild(el('div', null, 'ลากนิ้ววาดรูปกลีบ ปล่อยนิ้ว = ตัด'));
        var presets = el('div', 'lkw-chips');
        D.PRESET_LEAVES.forEach(function (p) {
          var b = btn('lkw-chip', p.name, function () {
            look.design.leaf = p.points.map(function (q) { return q.slice(); }); look.design.base = D.CUSTOM_BASE;
            drawLeaf(); changed(); renderSide();
          });
          b.setAttribute('aria-pressed', String(JSON.stringify(look.design.leaf) === JSON.stringify(p.points)));
          presets.appendChild(b);
        });
        side.appendChild(presets);
        var sw = el('div', 'lkw-chips');
        D.LEAF_COLORS.forEach(function (n, i) {
          var b = btn('lkw-sw', null, function () { look.design.leafColor = i; look.design.base = D.CUSTOM_BASE; drawLeaf(); changed(); renderSide(); }, n);
          b.style.background = LEAF_SWATCH[i];
          b.setAttribute('aria-pressed', String(look.design.leafColor === i));
          sw.appendChild(b);
        });
        side.appendChild(sw);
        var cnt = el('div', 'lkw-chips');
        function setPetals(p) { look.design.petals = p; look.design.base = D.CUSTOM_BASE; changed(); renderSide(); }
        var none = look.design.petals === 0;
        cnt.appendChild(btn('lkw-chip', '－', function () { setPetals(look.design.petals <= D.PETALS_MIN ? 0 : look.design.petals - 1); }, 'กลีบน้อยลง'));
        cnt.appendChild(el('span', null, none ? 'ไม่มีกลีบ' : look.design.petals + ' กลีบ'));
        cnt.appendChild(btn('lkw-chip', '＋', function () { setPetals(none ? D.PETALS_MIN : Math.min(D.PETALS_MAX, look.design.petals + 1)); }, 'กลีบมากขึ้น'));
        var noneB = btn('lkw-chip', 'ไม่มีกลีบ', function () { setPetals(none ? 11 : 0); });
        noneB.setAttribute('aria-pressed', String(none));
        cnt.appendChild(noneB);
        side.appendChild(cnt);
      }
      renderSide();
      row.appendChild(cv); row.appendChild(side);
      box.appendChild(row);
      return box;
    }

    // ---- stick things anywhere
    function stickPanel() {
      var box = el('div');
      var g = el('div', 'lkw-grid');
      D.ITEMS.forEach(function (it, i) {
        if (it.id === 'photo' || it.id === 'doodle') return;
        var on = !!tool && tool.k === i;
        var b = btn('lkw-opt', null, function () { if (on) setTool(null); else setTool({ k: i }, it.icon); render(); });
        b.setAttribute('aria-pressed', String(on));
        b.appendChild(el('b', null, it.icon)); b.appendChild(el('span', null, it.name));
        g.appendChild(b);
      });
      box.appendChild(g);
      var row = el('div', 'lkw-chips'); row.style.marginTop = '10px';
      row.appendChild(el('span', 'lkw-note', 'ติดแล้ว ' + look.design.items.length + '/' + D.MAX_ITEMS + ' ชิ้น แตะของบนกระทงเพื่อย้ายหรือแก้'));
      if (look.design.items.length) row.appendChild(btn('lkw-chip', 'ล้างทั้งหมด', function () { look.design.items = []; table.select(-1); showEdit(-1); changed(); render(); }));
      box.appendChild(row);
      return box;
    }

    // ---- draw your own sticker
    var ink = 0, width = 2, strokes = [];
    function drawPanel() {
      var box = el('div');
      var row = el('div', 'lkw-row');
      var cv = el('canvas', 'lkw-cv lkw-paper'); cv.width = 256; cv.height = 256;
      cv.setAttribute('aria-label', 'กระดาษวาดรูป');
      var ctx = cv.getContext('2d'), cur = null;
      function redraw() { drawDoodle(ctx, { s: strokes.concat(cur ? [cur] : []) }, 256); }
      function at(e) { var r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * 256, (e.clientY - r.top) / r.height * 256]; }
      cv.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        try { cv.setPointerCapture(e.pointerId); } catch (err) { /* old browser */ }
        var p = at(e); cur = { c: ink, w: width, raw: [p], p: [[p[0] / 256, p[1] / 256]] }; redraw();
      });
      cv.addEventListener('pointermove', function (e) {
        if (!cur) return;
        var p = at(e), last = cur.raw[cur.raw.length - 1];
        if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 2) return;
        cur.raw.push(p); cur.p.push([p[0] / 256, p[1] / 256]); redraw();
      });
      function end() {
        if (!cur) return;
        strokes.push({ c: cur.c, w: cur.w, p: D.simplifyStroke(cur.raw, 256, 256) });
        cur = null; redraw();
      }
      cv.addEventListener('pointerup', end);
      cv.addEventListener('pointercancel', end);
      redraw();
      var side = el('div', 'lkw-side');
      var inks = el('div', 'lkw-chips');
      D.INK.forEach(function (c, i) {
        var b = btn('lkw-sw', null, function () { ink = i; render(); }, 'สี ' + (i + 1));
        b.style.background = c; b.setAttribute('aria-pressed', String(ink === i));
        inks.appendChild(b);
      });
      side.appendChild(inks);
      var ws = el('div', 'lkw-chips');
      [['เส้นเล็ก', 1], ['กลาง', 2], ['ใหญ่', 3]].forEach(function (w) {
        var b = btn('lkw-chip', w[0], function () { width = w[1]; render(); });
        b.setAttribute('aria-pressed', String(width === w[1]));
        ws.appendChild(b);
      });
      side.appendChild(ws);
      var acts = el('div', 'lkw-chips');
      acts.appendChild(btn('lkw-chip', '↶ ย้อน', function () { strokes.pop(); redraw(); }));
      acts.appendChild(btn('lkw-chip', 'ล้าง', function () { strokes = []; redraw(); }));
      side.appendChild(acts);
      var full = look.design.doodles.length >= D.MAX_DOODLES;
      var use = btn('lkw-big', '📌 ติดภาพนี้บนกระทง', function () {
        if (!strokes.length) { toast('วาดอะไรสักอย่างก่อนนะ ✏️'); return; }
        var clean = D.sanitize({ doodles: [{ s: strokes }] }).doodles[0];
        look.design.doodles.push(clean);
        strokes = [];
        setTool({ k: D.ITEM.doodle, d: look.design.doodles.length - 1 }, 'ภาพวาด ✏️');
        render();
      });
      use.disabled = full;
      side.appendChild(use);
      row.appendChild(cv); row.appendChild(side);
      box.appendChild(row);
      if (look.design.doodles.length) {
        box.appendChild(el('div', 'lkw-label', full ? 'วาดครบ ' + D.MAX_DOODLES + ' ภาพแล้ว แตะภาพเพื่อติดเพิ่มอีกชิ้น' : 'ภาพที่วาดไว้ แตะเพื่อติดเพิ่มอีกชิ้น'));
        var th = el('div', 'lkw-chips');
        look.design.doodles.forEach(function (d, i) {
          var on = !!tool && tool.k === D.ITEM.doodle && tool.d === i;
          var b = btn('lkw-thumb', null, function () { if (on) setTool(null); else setTool({ k: D.ITEM.doodle, d: i }, 'ภาพวาด ✏️'); render(); }, 'ภาพวาดที่ ' + (i + 1));
          b.setAttribute('aria-pressed', String(on));
          var c = el('canvas'); c.width = 96; c.height = 96; drawDoodle(c.getContext('2d'), d, 96); b.appendChild(c);
          th.appendChild(b);
        });
        box.appendChild(th);
      }
      return box;
    }

    // ---- photo
    function photoPanel() {
      var box = el('div');
      var row = el('div', 'lkw-row');
      var pola = el('div', 'lkw-pola');
      if (look.photo) { var im = el('img'); im.alt = 'รูปของฉัน'; im.src = look.photo; pola.appendChild(im); } else pola.textContent = '📷';
      var side = el('div', 'lkw-side');
      var file = el('input', 'lkw-file'); file.type = 'file'; file.accept = 'image/*';
      var pick = btn('lkw-chip', look.photo ? 'เปลี่ยนรูป' : 'เลือกรูป', function () { file.click(); });
      file.addEventListener('change', function () {
        var f = file.files && file.files[0];
        if (!f) return;
        pick.textContent = 'กำลังย่อรูป…';
        makePolaroid(f).then(function (url) {
          look.photo = url;
          changed();
          setTool({ k: D.ITEM.photo }, '📷');
          render();
        }).catch(function () { toast('เปิดรูปนี้ไม่ได้ ลองรูป JPG หรือ PNG นะ'); render(); });
      });
      var chips = el('div', 'lkw-chips');
      chips.appendChild(pick); chips.appendChild(file);
      if (look.photo) {
        chips.appendChild(btn('lkw-chip', 'ปักรูป', function () { setTool({ k: D.ITEM.photo }, '📷'); render(); }));
        chips.appendChild(btn('lkw-chip', 'เอารูปออก', function () {
          look.photo = null;
          look.design.items = look.design.items.filter(function (it) { return it.k !== D.ITEM.photo; });
          setTool(null); table.select(-1); changed(); render();
        }));
      }
      side.appendChild(chips);
      side.appendChild(el('p', 'lkw-note', 'รูปจะลอยไปกับกระทงให้ทุกคนเห็น รวมถึงบนจอใหญ่ และต้องใส่ชื่อเจ้าของกระทงด้วย รูปถูกย่อเหลือเล็กมากและหายไปเองใน 7 วัน'));
      row.appendChild(pola); row.appendChild(side);
      box.appendChild(row);
      return box;
    }

    function render() {
      Array.prototype.forEach.call(tabs.children, function (b) { b.setAttribute('aria-selected', String(b.dataset.tab === tab)); });
      var y = body.scrollTop;
      body.textContent = '';
      body.appendChild(tab === 'base' ? basePanel() : tab === 'leaf' ? leafPanel() : tab === 'stick' ? stickPanel() : tab === 'draw' ? drawPanel() : photoPanel());
      body.scrollTop = y;
    }

    function finish(result) {
      table.close();
      wrap.classList.remove('lkw-in');
      document.removeEventListener('keydown', onKey, true);
      setTimeout(function () { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }, 350);
      current = null;
      if (o.onDone) o.onDone(result);
    }
    function onKey(e) {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      if (tool) { setTool(null); render(); } else if (table.selected() >= 0) { table.select(-1); showEdit(-1); } else finish(undefined);
    }
    document.addEventListener('keydown', onKey, true);

    table.open(look, {
      change: function () { if (tab === 'stick') render(); },
      select: function (i) { showEdit(i); },
      miss: function () { toast('แตะบนตัวกระทงนะ'); },
      full: function () { toast('ติดของได้สูงสุด ' + D.MAX_ITEMS + ' ชิ้นนะ'); },
      cut: function (h) {
        look.design.base = D.CUSTOM_BASE; look.design.trunk = h;
        changed(); setHint('');
        toast('🔪 ฉับ! ได้ฐาน' + (D.MATERIALS[look.design.material] || D.MATERIALS[0]).name + 'สูง ' + Math.round(h * 10) + ' นิ้ว ต่อไปตัดกลีบกัน');
        tab = 'leaf'; render();
      }
    });
    render();
    (o.container || document.body).appendChild(wrap);
    requestAnimationFrame(function () { wrap.classList.add('lkw-in'); });
    setTimeout(function () { doneB.focus({ preventScroll: true }); }, 360);
    if (!start) setHint('เริ่มจากตัดต้นกล้วยมาทำฐานกันเลย 🔪');
    current = { cancel: function () { finish(undefined); } };
  }

  function close() { if (current) current.cancel(); }

  global.LoyKrathongWorkshop = { open: open, close: close, _makePolaroid: makePolaroid };
})(typeof window !== 'undefined' ? window : this);
