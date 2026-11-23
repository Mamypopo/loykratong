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
      // called inside the click so the music may start (browser autoplay rules)
      egg.show({ userName: name, wishFeed: FEED, enterLabel: 'กลับหน้าแรก', onClose: function () { input.focus(); } });
    });
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

    var countEl = panel.querySelector('.count');
    egg.show({
      screen: true, wishFeed: FEED,
      onFeed: function (d) {
        countEl.hidden = false;
        countEl.innerHTML = 'ลอยไปแล้ว <b></b> กระทง';
        countEl.querySelector('b').textContent = d.count.toLocaleString('th-TH');
      }
    });
  }

  if (/[?&]screen=1\b/.test(location.search)) startScreen(); else startForm();
})();
