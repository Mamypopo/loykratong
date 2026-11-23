/* Page logic: name form (default) or big-screen mode (?screen=1). No inline scripts, so a strict CSP works. */
(function () {
  'use strict';
  var egg = window.LoyKrathongEasterEgg;
  var FEED = '/api/wishes';
  var NAME_KEY = 'lk-name';
  var QR_LIB = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';
  var QR_SRI = 'sha384-8FWZA6BGMXhsfO+BLtrJK0We6gg5o1JyO8xQm6peWDEUs17ACA5ziE/NIAkl9z2k';

  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k) || ''; localStorage.setItem(k, v); } catch (e) { return ''; } }

  function startForm() {
    var form = document.getElementById('start');
    var input = document.getElementById('name');
    var note = document.getElementById('note');
    var defaultNote = note.textContent;
    input.value = store(NAME_KEY);
    egg.preload();

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = input.value.replace(/\s+/g, ' ').trim().slice(0, 40);
      if (name && window.LoyKrathongFilter && !window.LoyKrathongFilter.check(name).ok) {
        note.textContent = 'ขอชื่อที่สุภาพหน่อยนะ 🙏'; input.focus(); return;
      }
      note.textContent = defaultNote;
      store(NAME_KEY, name);
      var from = liftMoon();
      document.body.classList.add('leaving');
      var handed = false;
      // no 3D (no WebGL): just let the moon fade away
      var safety = setTimeout(function () { if (!handed) { handed = true; flyTo(null, from); } }, 8000);
      // called inside the click so the music may start (browser autoplay rules)
      egg.show({
        userName: name, wishFeed: FEED, enterLabel: 'กลับหน้าแรก',
        onReady: function (api) { if (handed) return; handed = true; clearTimeout(safety); flyTo(api, from); },
        onClose: function () { resetMoon(); document.body.classList.remove('leaving'); input.focus(); }
      });
    });
  }

  // ---- the landing moon is the scene's moon: on "go" a copy lifts above the scene as it fades in,
  // glides and shrinks onto the 3D moon (following it while the camera tilts down) and dissolves into it
  var moonEl = document.getElementById('moon'), flyer = null, flyRaf = 0;
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (moonEl && egg.drawMoon) egg.drawMoon(moonEl.querySelector('canvas'));
  function resetMoon() {
    cancelAnimationFrame(flyRaf);
    if (flyer && flyer.parentNode) flyer.parentNode.removeChild(flyer);
    flyer = null;
    if (moonEl) moonEl.style.visibility = '';
  }
  function place(c, d0, op) {
    flyer.style.transform = 'translate(' + (c.x - d0 / 2).toFixed(1) + 'px,' + (c.y - d0 / 2).toFixed(1) + 'px) scale(' + (c.d / d0).toFixed(4) + ')';
    flyer.style.opacity = op;
  }
  function liftMoon() {
    if (!moonEl) return null;
    resetMoon();
    var r = moonEl.getBoundingClientRect(), from = { x: r.left + r.width / 2, y: r.top + r.height / 2, d: r.width };
    flyer = document.createElement('div');
    flyer.className = 'moon flying'; flyer.setAttribute('aria-hidden', 'true');
    var src = moonEl.querySelector('canvas'), cv = document.createElement('canvas');
    cv.width = src.width; cv.height = src.height; cv.getContext('2d').drawImage(src, 0, 0);
    flyer.appendChild(cv);
    flyer.style.width = from.d + 'px';
    document.body.appendChild(flyer);
    place(from, from.d, 1);
    moonEl.style.visibility = 'hidden';
    return from;
  }
  function easeInOut(x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }
  function flyTo(api, from) {
    if (!flyer || !from) return;
    var d0 = from.d, t0 = performance.now(), FLY = reduceMotion ? 1 : 1700, FADE = reduceMotion ? 400 : 700;
    (function step(now) {
      if (!flyer) return;
      var to = (api && api.moonScreen()) || from;
      var e = now - t0, k = easeInOut(Math.min(1, e / FLY));
      var cur = { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k, d: from.d + (to.d - from.d) * k };
      // dissolve into the scene's moon at the end, so the two never show as separate discs
      var op = e < FLY * 0.8 ? 1 : Math.max(0, 1 - (e - FLY * 0.8) / (FLY * 0.2 + FADE));
      place(cur, d0, op);
      if (op > 0) flyRaf = requestAnimationFrame(step); else flyer.style.visibility = 'hidden';
    })(t0);
  }

  function loadQrLib() {
    return new Promise(function (resolve, reject) {
      if (window.qrcode) return resolve(window.qrcode);
      var s = document.createElement('script');
      s.src = QR_LIB; s.integrity = QR_SRI; s.crossOrigin = 'anonymous';
      s.onload = function () { resolve(window.qrcode); };
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function startScreen() {
    document.body.classList.add('is-screen');
    var joinUrl = location.origin + '/';
    var panel = document.createElement('aside');
    panel.className = 'join';
    panel.setAttribute('aria-label', 'วิธีร่วมลอยกระทง');
    panel.innerHTML = '<div class="qr" role="img" aria-label="QR code ไปหน้าลอยกระทง"></div>' +
      '<div><p class="scan">สแกนเพื่อร่วมลอยกระทง</p><p class="url"></p><p class="count" hidden></p></div>';
    panel.querySelector('.url').textContent = location.host;
    document.body.appendChild(panel);

    loadQrLib().then(function (qrcode) {
      var qr = qrcode(0, 'M');
      qr.addData(joinUrl); qr.make();
      panel.querySelector('.qr').innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
    }).catch(function () { panel.querySelector('.qr').hidden = true; });

    // one click: full screen + music (browsers only allow both after a click), then the button gets out of the way
    var canFull = !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
    function isFull() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
    function goFull() {
      var el = document.documentElement;
      try { var p = (el.requestFullscreen || el.webkitRequestFullscreen).call(el); if (p && p.catch) p.catch(function () {}); } catch (e) { /* not allowed */ }
      // the scene starts its music on a pointerdown inside it; this click counts as the user's gesture
      var scene = document.querySelector('.lk-egg');
      if (scene) scene.dispatchEvent(new Event('pointerdown'));
    }
    var big = document.createElement('button');
    big.type = 'button'; big.className = 'go-big';
    big.innerHTML = '▶ เริ่มแสดงบนจอใหญ่<small>เต็มจอ และเปิดเพลง</small>';
    var small = document.createElement('button');
    small.type = 'button'; small.className = 'go-full'; small.textContent = '⛶ เต็มจอ'; small.hidden = true;
    big.addEventListener('click', function () { goFull(); big.hidden = true; small.hidden = !canFull || isFull(); });
    small.addEventListener('click', function () { goFull(); });
    function syncFull() { if (big.hidden) small.hidden = !canFull || isFull(); }
    document.addEventListener('fullscreenchange', syncFull);
    document.addEventListener('webkitfullscreenchange', syncFull);
    document.body.appendChild(big); document.body.appendChild(small);

    var countEl = panel.querySelector('.count');
    egg.show({
      screen: true, wishFeed: FEED,
      photos: !/[?&]photos=0\b/.test(location.search),   // ?screen=1&photos=0 hides everyone's photos
      onFeed: function (d) {
        countEl.hidden = false;
        countEl.innerHTML = 'ลอยไปแล้ว <b></b> กระทง';
        countEl.querySelector('b').textContent = d.count.toLocaleString('th-TH');
      }
    });
  }

  if (/[?&]screen=1\b/.test(location.search)) startScreen(); else startForm();
})();
