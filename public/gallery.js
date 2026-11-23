/* ห้องจัดแสดงกระทงทุกคน: every krathong people made and floated, newest first.
 * Tap one to spin it on the workshop table (view only); give hearts to the ones you like (one per krathong per browser).
 * LoyKrathongGallery.open({ container, table, snapshot(look) -> Promise<url>, fetchLook(id) -> Promise<{design, photo}>,
 *                           base: '/api', client, toast, onClose })
 */
(function (global) {
  'use strict';
  var PAGE = 24, HEARTED_KEY = 'lk-hearted';
  var CSS = [
    '.lkg{position:absolute;inset:0;z-index:20;display:flex;flex-direction:column;background:rgba(14,8,40,.96);color:#fff;opacity:0;transition:opacity .3s}',
    '.lkg.lkg-in{opacity:1}',
    '.lkg.lkg-viewing{background:transparent;pointer-events:none}',
    '.lkg.lkg-viewing>.lkg-list{display:none}',
    '.lkg button{font:inherit;color:inherit;cursor:pointer;border:0;-webkit-tap-highlight-color:transparent}',
    '.lkg .lkg-head{display:flex;align-items:center;gap:8px;padding:max(12px,env(safe-area-inset-top)) 14px 8px;pointer-events:auto}',
    '.lkg .lkg-head h2{flex:1;margin:0;font-size:19px;font-weight:500;color:#ffe9a8;text-shadow:0 2px 8px rgba(0,0,0,.6)}',
    '.lkg .lkg-x{background:rgba(30,14,60,.75);border-radius:999px;padding:8px 14px;font-size:14px;border:1.5px solid rgba(255,255,255,.2)}',
    '.lkg .lkg-list{flex:1;min-height:0;overflow-y:auto;padding:4px 14px 24px}',
    '.lkg .lkg-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px;max-width:1100px;margin:0 auto}',
    '.lkg .lkg-card{border-radius:16px;background:rgba(255,255,255,.07);padding:6px;display:flex;flex-direction:column;gap:5px}',
    '.lkg .lkg-pic{aspect-ratio:1;border-radius:12px;background:radial-gradient(circle at 50% 40%,#5a3a24,#2b1a12);display:grid;place-items:center;overflow:hidden;padding:0;font-size:36px}',
    '.lkg .lkg-pic img{width:100%;height:100%;object-fit:cover;display:block}',
    '.lkg .lkg-name{font-size:14px;color:#ffe9a8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:0 4px}',
    '.lkg .lkg-wish{font-size:12px;color:#d9cff5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:0 4px}',
    '.lkg .lkg-heart{align-self:flex-start;background:rgba(255,255,255,.1);border-radius:999px;padding:4px 11px;font-size:13px}',
    '.lkg .lkg-heart[aria-pressed="true"]{background:rgba(255,59,107,.25);color:#ffd0dc}',
    '.lkg .lkg-more{display:block;margin:16px auto 0;background:rgba(255,255,255,.12);border-radius:999px;padding:9px 20px}',
    '.lkg .lkg-empty{white-space:pre-line;text-align:center;color:#d9cff5;margin-top:18vh;font-size:15px;line-height:1.7}',
    '.lkg .lkg-info{position:absolute;left:50%;bottom:max(18px,env(safe-area-inset-bottom));transform:translateX(-50%);width:min(92vw,460px);display:none;align-items:center;gap:12px;padding:12px 14px;border-radius:18px;background:rgba(36,20,12,.9);border:1.5px solid rgba(255,226,122,.5);pointer-events:auto}',
    '.lkg.lkg-viewing .lkg-info{display:flex}',
    '.lkg .lkg-info div{flex:1;min-width:0}',
    '.lkg .lkg-info b{display:block;color:#ffe9a8;font-weight:500}',
    '.lkg .lkg-info span{display:block;font-size:14px;color:#f3e6d0;overflow-wrap:anywhere}',
    '.lkg .lkg-bigheart{background:rgba(255,255,255,.12);border-radius:999px;padding:10px 16px;font-size:16px;flex:none}',
    '.lkg .lkg-bigheart[aria-pressed="true"]{background:rgba(255,59,107,.35)}',
    '.lkg .lkg-tip{position:absolute;left:50%;transform:translateX(-50%);top:calc(max(12px,env(safe-area-inset-top)) + 56px);display:none;font-size:13px;color:#fff6d6;background:rgba(30,14,8,.6);padding:6px 14px;border-radius:999px}',
    '.lkg.lkg-viewing .lkg-tip{display:block}',
    '.lkg :focus-visible{outline:2px solid #ffe07a;outline-offset:2px}'
  ].join('\n');

  var current = null;
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function btn(cls, text, fn, label) { var b = el('button', cls, text); b.type = 'button'; if (label) { b.setAttribute('aria-label', label); b.title = label; } if (fn) b.addEventListener('click', fn); return b; }
  function hearted() { try { return JSON.parse(global.localStorage.getItem(HEARTED_KEY) || '[]'); } catch (e) { return []; } }
  function markHearted(id) {
    var h = hearted(); if (h.indexOf(id) < 0) h.push(id);
    try { global.localStorage.setItem(HEARTED_KEY, JSON.stringify(h.slice(-300))); } catch (e) { /* ignore */ }
  }

  function open(o) {
    close();
    if (!document.getElementById('lkg-css')) { var st = el('style'); st.id = 'lkg-css'; st.textContent = CSS; document.head.appendChild(st); }
    var toast = o.toast || function () {}, base = o.base || '/api';
    var items = [], total = 0, loading = false, viewing = null, thumbs = {};

    var box = el('section', 'lkg'); box.setAttribute('aria-label', 'กระทงของทุกคน');
    var head = el('div', 'lkg-head');
    var title = el('h2', null, '🏛 กระทงของทุกคน');
    var closeB = btn('lkg-x', 'ปิด', function () { if (viewing) back(); else finish(); });
    head.appendChild(title); head.appendChild(closeB);
    var list = el('div', 'lkg-list');
    var tip = el('div', 'lkg-tip', 'ลากเพื่อหมุนดูรอบๆ');
    var info = el('div', 'lkg-info');
    var infoText = el('div'), infoName = el('b'), infoWish = el('span');
    infoText.appendChild(infoName); infoText.appendChild(infoWish);
    var bigHeart = btn('lkg-bigheart', '', function () { if (viewing) giveHeart(viewing, bigHeart); });
    info.appendChild(infoText); info.appendChild(bigHeart);
    box.appendChild(head); box.appendChild(list); box.appendChild(tip); box.appendChild(info);
    box.addEventListener('pointerdown', function (e) { if (!viewing) e.stopPropagation(); });
    box.addEventListener('click', function (e) { if (!viewing || e.target.closest('button')) e.stopPropagation(); });

    function heartLabel(it) { return (hearted().indexOf(it.id) >= 0 ? '❤️ ' : '🤍 ') + (it.hearts || 0); }
    function giveHeart(it, b) {
      if (hearted().indexOf(it.id) >= 0) { toast('ให้หัวใจกระทงใบนี้ไปแล้ว ❤️'); return; }
      fetch(base + '/heart', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: it.id, client: o.client }) })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
          if (!d) { toast('ให้หัวใจไม่สำเร็จ ลองใหม่อีกทีนะ'); return; }
          it.hearts = d.hearts; markHearted(it.id);
          b.textContent = heartLabel(it); b.setAttribute('aria-pressed', 'true');
          renderList();
        }).catch(function () { toast('ให้หัวใจไม่สำเร็จ ลองใหม่อีกทีนะ'); });
    }

    function thumb(it, holder) {
      if (thumbs[it.id]) { var im = el('img'); im.alt = ''; im.src = thumbs[it.id]; holder.appendChild(im); return; }
      holder.textContent = '🪷';
      o.fetchLook(it.id).then(function (l) { return l ? o.snapshot(l) : null; }).then(function (url) {
        if (!url) return;
        thumbs[it.id] = url;
        if (!holder.isConnected) return;
        holder.textContent = '';
        var img = el('img'); img.alt = ''; img.src = url; holder.appendChild(img);
      });
    }

    function renderList() {
      var y = list.scrollTop;
      list.textContent = '';
      if (!items.length) {
        list.appendChild(el('div', 'lkg-empty', loading ? 'กำลังโหลด…' : 'ยังไม่มีใครลอยกระทงที่ทำเองเลย\nเป็นคนแรกสิ! กด ✂️ ทำกระทงของฉัน'));
        return;
      }
      var grid = el('div', 'lkg-grid');
      items.forEach(function (it) {
        var card = el('div', 'lkg-card');
        var pic = btn('lkg-pic', null, function () { view(it); }, 'ดูกระทงของ ' + (it.name || 'ไม่ระบุชื่อ'));
        thumb(it, pic);
        card.appendChild(pic);
        card.appendChild(el('div', 'lkg-name', it.name || 'ไม่ระบุชื่อ'));
        card.appendChild(el('div', 'lkg-wish', it.wish));
        var hb = btn('lkg-heart', heartLabel(it), function () { giveHeart(it, hb); }, 'ให้หัวใจ');
        hb.setAttribute('aria-pressed', String(hearted().indexOf(it.id) >= 0));
        card.appendChild(hb);
        grid.appendChild(card);
      });
      list.appendChild(grid);
      if (items.length < total) list.appendChild(btn('lkg-more', loading ? 'กำลังโหลด…' : 'ดูเพิ่ม', load));
      list.scrollTop = y;
    }

    function load() {
      if (loading) return;
      loading = true; renderList();
      fetch(base + '/gallery?limit=' + PAGE + '&offset=' + items.length, { credentials: 'same-origin' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
          loading = false;
          if (!d) { toast('โหลดกระทงไม่สำเร็จ ลองใหม่อีกทีนะ'); renderList(); return; }
          var have = {}; items.forEach(function (x) { have[x.id] = 1; });
          (d.items || []).forEach(function (x) { if (!have[x.id]) items.push(x); });
          total = d.total || items.length;
          title.textContent = '🏛 กระทงของทุกคน (' + total + ')';
          renderList();
        }).catch(function () { loading = false; toast('โหลดกระทงไม่สำเร็จ ลองใหม่อีกทีนะ'); renderList(); });
    }

    function view(it) {
      o.fetchLook(it.id).then(function (l) {
        if (!l || !current) { toast('เปิดกระทงใบนี้ไม่ได้'); return; }
        viewing = it;
        o.table.open({ design: l.design, photo: l.photo }, {}, { view: true });
        box.classList.add('lkg-viewing');
        closeB.textContent = '← กลับ';
        infoName.textContent = it.name || 'ไม่ระบุชื่อ';
        infoWish.textContent = it.wish;
        bigHeart.textContent = heartLabel(it);
        bigHeart.setAttribute('aria-pressed', String(hearted().indexOf(it.id) >= 0));
      });
    }
    function back() {
      viewing = null;
      o.table.close();
      box.classList.remove('lkg-viewing');
      closeB.textContent = 'ปิด';
      renderList();
    }
    function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); if (viewing) back(); else finish(); } }
    function finish() {
      if (viewing) { viewing = null; o.table.close(); }
      document.removeEventListener('keydown', onKey, true);
      box.classList.remove('lkg-in');
      setTimeout(function () { if (box.parentNode) box.parentNode.removeChild(box); }, 300);
      current = null;
      if (o.onClose) o.onClose();
    }
    document.addEventListener('keydown', onKey, true);
    (o.container || document.body).appendChild(box);
    requestAnimationFrame(function () { box.classList.add('lkg-in'); });
    current = { close: finish };
    load();
  }
  function close() { if (current) current.close(); }

  global.LoyKrathongGallery = { open: open, close: close };
})(typeof window !== 'undefined' ? window : this);
