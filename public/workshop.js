/* โรงทำกระทง: a bottom sheet over the 3D scene where people build their own krathong.
 * LoyKrathongWorkshop.open({ container, look, toast, onChange(look), onDone(look | null | undefined) })
 *   look = { design: {base, flowers, topper, leafColor, leaf}, photo: JPEG data URL | null }
 *   onChange fires (debounced) while building so the scene can restyle the krathong in front;
 *   onDone gets the finished look, null when everything was cleared, undefined when cancelled.
 * Needs design.js (LoyKrathongDesign). No inline scripts or remote assets, so the page CSP stays strict.
 */
(function (global) {
  'use strict';
  var D = global.LoyKrathongDesign;
  var BASE_ICONS = ['🍃', '🪷', '🍞', '🥥', '🦢', '🐢', '✂️'];
  var TOPPER_ICONS = ['🚫', '🥢', '🍳', '🦆', '🥳', '❤️'];
  var LEAF_SWATCH = ['#38a24f', '#9fd65a', '#c9a35a', '#d77bff'];
  var CSS = [
    '.lkw{position:absolute;left:0;right:0;bottom:0;z-index:20;max-height:58vh;display:flex;flex-direction:column;background:rgba(18,8,52,.9);border-top:1.5px solid rgba(255,226,122,.5);border-radius:22px 22px 0 0;box-shadow:0 -12px 40px rgba(0,0,0,.45);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);color:#fff;font-family:inherit;transform:translateY(105%);transition:transform .35s cubic-bezier(.2,.8,.2,1);padding-bottom:env(safe-area-inset-bottom)}',
    '.lkw.lkw-in{transform:none}',
    '.lkw .lkw-head{display:flex;align-items:center;gap:8px;padding:12px 14px 6px}',
    '.lkw .lkw-head h2{flex:1;margin:0;font-size:18px;font-weight:500;color:#ffe9a8}',
    '.lkw button{font:inherit;color:inherit;cursor:pointer;border:0;-webkit-tap-highlight-color:transparent}',
    '.lkw .lkw-x{background:rgba(255,255,255,.1);border-radius:999px;padding:7px 12px;font-size:14px}',
    '.lkw .lkw-done{background:linear-gradient(#ffe07a,#ffb83d);color:#4a2400!important;border-radius:999px;padding:8px 18px;font-weight:500;box-shadow:0 3px 0 #b8761a}',
    '.lkw .lkw-dice{background:rgba(255,255,255,.1);border-radius:999px;padding:7px 11px;font-size:16px}',
    '.lkw .lkw-tabs{display:flex;gap:6px;padding:4px 12px 8px;overflow-x:auto;scrollbar-width:none}',
    '.lkw .lkw-tabs::-webkit-scrollbar{display:none}',
    '.lkw .lkw-tab{flex:none;background:rgba(255,255,255,.08);border-radius:999px;padding:7px 14px;font-size:14px;color:#e9e0ff!important}',
    '.lkw .lkw-tab[aria-selected="true"]{background:#ffe9a8;color:#3b1a6e!important}',
    '.lkw .lkw-body{overflow-y:auto;padding:4px 14px 16px;flex:1;min-height:0}',
    '.lkw .lkw-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:8px}',
    '.lkw .lkw-opt{display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px 6px;border-radius:14px;background:rgba(255,255,255,.07);border:2px solid transparent!important;font-size:13px;line-height:1.2}',
    '.lkw .lkw-opt b{font-size:26px;font-weight:400;line-height:1}',
    '.lkw .lkw-opt[aria-pressed="true"]{border-color:#ffe07a!important;background:rgba(255,224,122,.16)}',
    '.lkw .lkw-dots{display:flex;gap:3px}.lkw .lkw-dots i{width:16px;height:16px;border-radius:50%;box-shadow:inset 0 0 0 1px rgba(0,0,0,.2)}',
    '.lkw .lkw-cut{display:flex;gap:14px;flex-wrap:wrap;align-items:flex-start}',
    '.lkw .lkw-cv{touch-action:none;height:auto;width:min(62vw,240px);aspect-ratio:1;border-radius:18px;background:#0c2a1a;cursor:crosshair;display:block}',
    '.lkw .lkw-side{flex:1;min-width:150px;display:flex;flex-direction:column;gap:8px;font-size:13px;color:#d9cff5}',
    '.lkw .lkw-chips{display:flex;flex-wrap:wrap;gap:6px}',
    '.lkw .lkw-chip{background:rgba(255,255,255,.09);border-radius:999px;padding:6px 11px;font-size:13px;border:2px solid transparent!important}',
    '.lkw .lkw-chip[aria-pressed="true"]{border-color:#ffe07a!important}',
    '.lkw .lkw-sw{width:30px;height:30px;border-radius:50%;border:3px solid transparent!important;padding:0}',
    '.lkw .lkw-sw[aria-pressed="true"]{border-color:#fff!important}',
    '.lkw .lkw-photo{display:flex;gap:16px;align-items:center;flex-wrap:wrap}',
    '.lkw .lkw-pola{width:120px;height:142px;border-radius:6px;background:rgba(255,255,255,.08);display:grid;place-items:center;font-size:40px;overflow:hidden;transform:rotate(-3deg)}',
    '.lkw .lkw-pola img{width:100%;height:100%;object-fit:cover}',
    '.lkw .lkw-btn{background:rgba(255,255,255,.12);border-radius:999px;padding:9px 16px;font-size:14px}',
    '.lkw .lkw-note{font-size:12px;color:#bfb3e6;margin:6px 0 0}',
    '.lkw .lkw-file{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}',
    '.lkw :focus-visible{outline:2px solid #ffe07a;outline-offset:2px}',
    '@media (min-width:900px){.lkw{left:auto;right:24px;bottom:24px;width:440px;max-height:calc(100vh - 48px);border-radius:22px;border:1.5px solid rgba(255,226,122,.5)}}',
    '@media (prefers-reduced-motion:reduce){.lkw{transition:none}}'
  ].join('\n');

  var current = null;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
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

  function open(o) {
    if (!D) return;
    close();
    injectCss();
    var start = o.look || null;
    var look = {
      design: D.sanitize(start && start.design) || { base: D.CUSTOM_BASE, flowers: 0, topper: 0, leafColor: 0, leaf: null },
      photo: start && start.photo ? start.photo : null
    };
    var toast = o.toast || function () {};
    var timer = null;
    function changed() {
      clearTimeout(timer);
      timer = setTimeout(function () { if (o.onChange) o.onChange(copy()); }, 120);
    }
    function copy() { return { design: JSON.parse(JSON.stringify(look.design)), photo: look.photo }; }

    var root = el('section', 'lkw');
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'ทำกระทงของฉัน');
    var head = el('div', 'lkw-head');
    var cancel = el('button', 'lkw-x', '✕'); cancel.type = 'button'; cancel.setAttribute('aria-label', 'ยกเลิก');
    var title = el('h2', null, 'ทำกระทงของฉัน');
    var dice = el('button', 'lkw-dice', '🎲'); dice.type = 'button'; dice.setAttribute('aria-label', 'สุ่มกระทง'); dice.title = 'สุ่มกระทง';
    var done = el('button', 'lkw-done', 'เสร็จแล้ว'); done.type = 'button';
    head.appendChild(cancel); head.appendChild(title); head.appendChild(dice); head.appendChild(done);
    var tabs = el('div', 'lkw-tabs'); tabs.setAttribute('role', 'tablist');
    var body = el('div', 'lkw-body');
    root.appendChild(head); root.appendChild(tabs); root.appendChild(body);

    var TABS = [['base', 'ฐานกระทง'], ['leaf', 'ตัดใบตอง'], ['flowers', 'ดอกไม้'], ['topper', 'ของแต่ง'], ['photo', 'รูปของฉัน']];
    var tab = look.design.base === D.CUSTOM_BASE ? 'leaf' : 'base';
    TABS.forEach(function (t) {
      var b = el('button', 'lkw-tab', t[1]); b.type = 'button'; b.setAttribute('role', 'tab'); b.dataset.tab = t[0];
      b.addEventListener('click', function () { tab = t[0]; render(); });
      tabs.appendChild(b);
    });

    function optionGrid(names, icons, key, extra) {
      var g = el('div', 'lkw-grid');
      names.forEach(function (n, i) {
        var b = el('button', 'lkw-opt'); b.type = 'button';
        b.setAttribute('aria-pressed', String(look.design[key] === i));
        if (icons) b.appendChild(el('b', null, icons[i]));
        if (extra) b.appendChild(extra(i));
        b.appendChild(el('span', null, n));
        b.addEventListener('click', function () {
          look.design[key] = i;
          if (key === 'base' && i === D.CUSTOM_BASE) { tab = 'leaf'; }
          changed(); render();
        });
        g.appendChild(b);
      });
      return g;
    }

    // ---- leaf cutting: draw a closed shape on the leaf, release = cut
    function leafPanel() {
      var wrap = el('div', 'lkw-cut');
      var cv = el('canvas', 'lkw-cv'); cv.width = 480; cv.height = 480;
      cv.setAttribute('aria-label', 'ใบตอง ลากนิ้ววาดรูปกลีบที่จะตัด');
      var ctx = cv.getContext('2d'), path = [], drawing = false;
      function drawLeaf() {
        ctx.clearRect(0, 0, 480, 480);
        var tone = LEAF_SWATCH[look.design.leafColor] || LEAF_SWATCH[0];
        // a banana leaf: wide strip with a midrib and side veins
        ctx.save();
        ctx.fillStyle = tone; ctx.globalAlpha = look.design.leaf ? 0.25 : 1;
        ctx.beginPath(); ctx.moveTo(40, 60); ctx.quadraticCurveTo(240, 10, 440, 60); ctx.lineTo(440, 420); ctx.quadraticCurveTo(240, 470, 40, 420); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 2;
        for (var y = 70; y < 420; y += 26) { ctx.beginPath(); ctx.moveTo(240, y); ctx.lineTo(60, y + 30); ctx.moveTo(240, y); ctx.lineTo(420, y + 30); ctx.stroke(); }
        ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(240, 40); ctx.lineTo(240, 450); ctx.stroke();
        ctx.restore();
        if (look.design.leaf) {   // the piece that was cut, standing up like a petal
          ctx.save();
          ctx.fillStyle = tone; ctx.strokeStyle = '#fff6c8'; ctx.lineWidth = 4; ctx.setLineDash([]);
          ctx.beginPath();
          look.design.leaf.forEach(function (p, i) { var x = 90 + p[0] * 300, y = 410 - p[1] * 340; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
          ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.restore();
        }
      }
      function at(e) {
        var r = cv.getBoundingClientRect();
        return [(e.clientX - r.left) / r.width * 480, (e.clientY - r.top) / r.height * 480];
      }
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
      function finish() {
        if (!drawing) return;
        drawing = false;
        var leaf = D.normalizeLeaf(path);
        if (!leaf) { toast('ลองวาดเป็นรูปปิดนะ เช่น วงรีหรือหยดน้ำ ✂️'); drawLeaf(); return; }
        look.design.leaf = leaf; look.design.base = D.CUSTOM_BASE;
        drawLeaf(); changed(); toast('✂️ ฉับ! ได้กลีบใหม่แล้ว');
        renderPresets();
      }
      cv.addEventListener('pointerup', finish);
      cv.addEventListener('pointercancel', finish);
      drawLeaf();

      var side = el('div', 'lkw-side');
      side.appendChild(el('div', null, 'ลากนิ้ววาดรูปกลีบบนใบตอง ปล่อยนิ้ว = ตัด กลีบจะถูกพับรอบกระทงให้เอง'));
      var presets = el('div', 'lkw-chips');
      function renderPresets() {
        presets.textContent = '';
        D.PRESET_LEAVES.forEach(function (p) {
          var b = el('button', 'lkw-chip', p.name); b.type = 'button';
          b.setAttribute('aria-pressed', String(JSON.stringify(look.design.leaf) === JSON.stringify(p.points)));
          b.addEventListener('click', function () {
            look.design.leaf = p.points.map(function (q) { return q.slice(); }); look.design.base = D.CUSTOM_BASE;
            drawLeaf(); changed(); renderPresets();
          });
          presets.appendChild(b);
        });
      }
      renderPresets();
      side.appendChild(el('div', null, 'หรือเลือกแบบสำเร็จ'));
      side.appendChild(presets);
      side.appendChild(el('div', null, 'สีใบตอง'));
      var sw = el('div', 'lkw-chips');
      D.LEAF_COLORS.forEach(function (n, i) {
        var b = el('button', 'lkw-sw'); b.type = 'button'; b.title = n; b.setAttribute('aria-label', n);
        b.style.background = LEAF_SWATCH[i];
        b.setAttribute('aria-pressed', String(look.design.leafColor === i));
        b.addEventListener('click', function () { look.design.leafColor = i; look.design.base = D.CUSTOM_BASE; changed(); render(); });
        sw.appendChild(b);
      });
      side.appendChild(sw);
      if (look.design.base !== D.CUSTOM_BASE) side.appendChild(el('div', 'lkw-note', 'ตัดหรือเลือกกลีบเมื่อไหร่ ฐานจะเปลี่ยนเป็น "ตัดใบตองเอง" ให้อัตโนมัติ'));
      wrap.appendChild(cv); wrap.appendChild(side);
      return wrap;
    }

    // ---- photo
    function photoPanel() {
      var wrap = el('div');
      var row = el('div', 'lkw-photo');
      var pola = el('div', 'lkw-pola');
      if (look.photo) { var im = el('img'); im.alt = 'รูปของฉัน'; im.src = look.photo; pola.appendChild(im); } else pola.textContent = '📷';
      var btns = el('div', 'lkw-chips');
      var file = el('input', 'lkw-file'); file.type = 'file'; file.accept = 'image/*';
      var pickB = el('button', 'lkw-btn', look.photo ? 'เปลี่ยนรูป' : 'เลือกรูป'); pickB.type = 'button';
      pickB.addEventListener('click', function () { file.click(); });
      file.addEventListener('change', function () {
        var f = file.files && file.files[0];
        if (!f) return;
        pickB.textContent = 'กำลังย่อรูป…';
        makePolaroid(f).then(function (url) { look.photo = url; changed(); render(); })
          .catch(function () { toast('เปิดรูปนี้ไม่ได้ ลองรูป JPG หรือ PNG นะ'); render(); });
      });
      btns.appendChild(pickB); btns.appendChild(file);
      if (look.photo) {
        var rm = el('button', 'lkw-btn', 'เอารูปออก'); rm.type = 'button';
        rm.addEventListener('click', function () { look.photo = null; changed(); render(); });
        btns.appendChild(rm);
      }
      row.appendChild(pola); row.appendChild(btns);
      wrap.appendChild(row);
      wrap.appendChild(el('p', 'lkw-note', 'รูปจะลอยไปกับกระทงให้ทุกคนเห็น รวมถึงบนจอใหญ่ในงาน และต้องใส่ชื่อเจ้าของกระทงด้วย รูปถูกย่อเหลือเล็กมากและหายไปเองใน 7 วัน'));
      return wrap;
    }

    function render() {
      Array.prototype.forEach.call(tabs.children, function (b) { b.setAttribute('aria-selected', String(b.dataset.tab === tab)); });
      body.textContent = '';
      if (tab === 'base') body.appendChild(optionGrid(D.BASES, BASE_ICONS, 'base'));
      else if (tab === 'leaf') body.appendChild(leafPanel());
      else if (tab === 'flowers') body.appendChild(optionGrid(D.FLOWERS, null, 'flowers', function (i) {
        var dots = el('div', 'lkw-dots');
        D.FLOWER_COLORS[i].forEach(function (c) { var d = el('i'); d.style.background = c; dots.appendChild(d); });
        return dots;
      }));
      else if (tab === 'topper') body.appendChild(optionGrid(D.TOPPERS, TOPPER_ICONS, 'topper'));
      else body.appendChild(photoPanel());
    }

    function rnd(n) { return Math.floor(Math.random() * n); }
    dice.addEventListener('click', function () {
      var base = rnd(D.BASES.length);
      look.design = {
        base: base, flowers: rnd(D.FLOWERS.length), topper: rnd(D.TOPPERS.length), leafColor: rnd(D.LEAF_COLORS.length),
        leaf: base === D.CUSTOM_BASE ? D.PRESET_LEAVES[rnd(D.PRESET_LEAVES.length)].points : look.design.leaf
      };
      changed(); render();
    });

    function finish(result) {
      clearTimeout(timer);
      root.classList.remove('lkw-in');
      document.removeEventListener('keydown', onKey, true);
      setTimeout(function () { if (root.parentNode) root.parentNode.removeChild(root); }, 350);
      current = null;
      if (o.onDone) o.onDone(result);
    }
    function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); finish(undefined); } }
    cancel.addEventListener('click', function () { finish(undefined); });
    done.addEventListener('click', function () { finish(copy()); });
    root.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    root.addEventListener('click', function (e) { e.stopPropagation(); });
    document.addEventListener('keydown', onKey, true);

    render();
    (o.container || document.body).appendChild(root);
    requestAnimationFrame(function () { root.classList.add('lkw-in'); });
    setTimeout(function () { done.focus({ preventScroll: true }); }, 360);
    changed();
    current = { cancel: function () { finish(undefined); } };
  }

  function close() { if (current) current.cancel(); }

  global.LoyKrathongWorkshop = { open: open, close: close, _makePolaroid: makePolaroid };
})(typeof window !== 'undefined' ? window : this);
