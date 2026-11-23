/*
 * ปุ่ม "ลอยกระทงออนไลน์" สำหรับเว็บ A–F — วางบรรทัดเดียว
 *
 *   <script src="https://<เว็บกลาง>/lk-button.js" data-site="siteA" async></script>
 *
 * data-site      รหัสเว็บ (a–z 0–9 - _) ส่งไปเป็น ?from= เพื่อนับสถิติ
 * data-style     pill (ค่าเริ่มต้น, วางตรงจุดที่ใส่ script) | floating (ลอยมุมจอ) | banner (แบนเนอร์กว้าง)
 * data-target    CSS selector ที่จะใส่ปุ่ม (pill/banner) แทนตำแหน่งของ script
 * data-show      season (ค่าเริ่มต้น: แสดงเฉพาะวันลอยกระทง) | always
 * data-days-before / data-days-after  แสดงก่อนหรือหลังวันลอยกระทงกี่วัน (ค่าเริ่มต้น 0 / 0)
 * data-side      left | right (floating, ค่าเริ่มต้น right)
 * data-offset    ระยะจากขอบล่างของ floating เป็น px (ค่าเริ่มต้น 20)
 * data-new-tab   1 (ค่าเริ่มต้น เปิดแท็บใหม่) | 0
 * data-font      mitr (ค่าเริ่มต้น โหลดฟอนต์ Mitr) | none (ใช้ฟอนต์ของเว็บ)
 * data-preview   1 = โหมดตัวอย่าง (หน้า button.html): floating ที่มี data-target จะอยู่ในกล่องนั้นแทนมุมจอ
 * ปุ่ม ✕ ของ floating ซ่อนปุ่มเฉพาะหน้านั้น รีเฟรชหรือเปลี่ยนหน้าแล้วปุ่มจะขึ้นใหม่
 *
 * ทดสอบ: ต่อท้าย URL ของหน้าเว็บด้วย ?lkbtn=1 เพื่อแสดงทุกวัน หรือ ?lktoday=2026-11-20 เพื่อจำลองวันที่
 * ปุ่มอยู่ใน Shadow DOM: CSS ของเว็บไม่กระทบปุ่ม และปุ่มไม่กระทบเว็บ
 */
(function () {
  'use strict';
  var script = document.currentScript;
  if (!script) return;
  var BASE = script.src.replace(/[^/]*(\?.*)?$/, '');                    // https://<เว็บกลาง>/
  var d = script.dataset;
  var STYLE = /^(pill|floating|banner)$/.test(d.style || '') ? d.style : 'pill';
  var SITE = (d.site || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 32);
  var NEW_TAB = d.newTab !== '0';
  var PREVIEW = d.preview === '1';
  var params = new URLSearchParams(location.search);

  // ---------------------------------------------------------------- dates (same rules as the scene)
  var KNOWN = { 2023: '2023-11-27', 2024: '2024-11-15', 2025: '2025-11-05', 2026: '2026-11-24' };
  function fullMoon(y) {
    var ref = Date.UTC(2000, 0, 6, 18, 14), syn = 29.530588853 * 864e5;
    var lo = Date.UTC(y, 10, 1) - 7 * 36e5, hi = Date.UTC(y, 11, 1) - 7 * 36e5, k = Math.floor((lo - ref) / syn) - 1;
    for (var i = 0; i < 4; i++) { var fm = ref + (k + i) * syn + syn / 2; if (fm >= lo && fm < hi) return new Date(fm + 7 * 36e5).toISOString().slice(0, 10); }
    return y + '-11-15';
  }
  function dayNo(ymd) { var p = ymd.split('-'); return Math.round(Date.UTC(+p[0], +p[1] - 1, +p[2]) / 864e5); }
  var testDay = /^\d{4}-\d{2}-\d{2}$/.test(params.get('lktoday') || '') ? params.get('lktoday') : null;
  var now = testDay ? new Date(testDay + 'T12:00:00') : new Date();
  var todayN = Math.round(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 864e5);
  var fest = KNOWN[now.getFullYear()] || fullMoon(now.getFullYear());
  var left = dayNo(fest) - todayN;                                        // days until the festival (0 = today)
  function days(v) { var n = parseInt(v, 10); return isNaN(n) ? 0 : Math.max(0, Math.min(60, n)); }
  var inWindow = left <= days(d.daysBefore) && left >= -days(d.daysAfter);   // default: the festival day only
  if (d.show !== 'always' && !inWindow && params.get('lkbtn') !== '1') return;

  var p = fest.split('-');
  var dateTxt = new Date(+p[0], +p[1] - 1, +p[2]).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
  if (PREVIEW) left = 0;   // the sample page shows what visitors see on the day
  var sub = left > 1 ? 'อีก ' + left + ' วัน · ' + dateTxt
          : left === 1 ? 'พรุ่งนี้แล้ว · ' + dateTxt
          : left === 0 ? 'มาลอยด้วยกัน'
          : left < 0 ? 'ยังร่วมลอยกระทงออนไลน์ได้'
          : 'เขียนคำอธิษฐาน แล้วลอยไปด้วยกัน';
  var href = BASE + (SITE ? '?from=' + encodeURIComponent(SITE) : '');

  // ---------------------------------------------------------------- font (outside the shadow root, where @font-face works)
  if (d.font !== 'none' && !document.querySelector('link[data-lk-font]')) {
    var fl = document.createElement('link');
    fl.rel = 'stylesheet'; fl.setAttribute('data-lk-font', '');
    fl.href = 'https://fonts.googleapis.com/css2?family=Mitr:wght@400;500;600&display=swap';
    document.head.appendChild(fl);
  }

  // ---------------------------------------------------------------- artwork
  // a banana-leaf krathong with lotus petals, a flickering candle and two incense sticks
  var KRATHONG =
    '<svg class="kt" viewBox="0 0 64 50" aria-hidden="true">' +
    '<ellipse cx="32" cy="41" rx="27" ry="6.5" fill="#1f6b33"/>' +
    '<path d="M6 38 Q32 50 58 38 L55 33 Q32 42 9 33 Z" fill="#2f8a44"/>' +
    '<g fill="#47b25c">' +
    '<path d="M9 35 L12 24 L17 35 Z"/><path d="M17 37 L21 25 L25 38 Z"/><path d="M27 38 L32 25 L37 38 Z"/>' +
    '<path d="M39 38 L43 25 L47 37 Z"/><path d="M47 35 L52 24 L55 35 Z"/></g>' +
    '<g fill="#3a9a50"><path d="M13 36 L16.5 28 L21 37 Z"/><path d="M22 38 L26.5 28 L31 38.5 Z"/>' +
    '<path d="M33 38.5 L37.5 28 L42 38 Z"/><path d="M43 37 L47.5 28 L51 36 Z"/></g>' +
    '<g fill="#ff8fbf"><ellipse cx="22" cy="28" rx="4" ry="5.5" transform="rotate(-25 22 28)"/>' +
    '<ellipse cx="42" cy="28" rx="4" ry="5.5" transform="rotate(25 42 28)"/></g>' +
    '<g fill="#ffb3d4"><ellipse cx="27" cy="26" rx="3.6" ry="6" transform="rotate(-10 27 26)"/>' +
    '<ellipse cx="37" cy="26" rx="3.6" ry="6" transform="rotate(10 37 26)"/></g>' +
    '<circle cx="18" cy="31" r="2.2" fill="#ffd54a"/><circle cx="46" cy="31" r="2.2" fill="#ffd54a"/>' +
    '<path d="M24 22 L23 9" stroke="#b5563a" stroke-width="1.2" stroke-linecap="round"/>' +
    '<path d="M40 22 L41.5 10" stroke="#b5563a" stroke-width="1.2" stroke-linecap="round"/>' +
    '<circle cx="23" cy="8.6" r="1" fill="#ff6a3c"/><circle cx="41.6" cy="9.6" r="1" fill="#ff6a3c"/>' +
    '<rect x="30" y="12" width="4" height="13" rx="1.4" fill="#fff4d6"/>' +
    '<g class="fl"><ellipse cx="32" cy="8" rx="3.2" ry="5.4" fill="#ffb02e"/><ellipse cx="32" cy="9" rx="1.6" ry="3" fill="#fff6b0"/></g>' +
    '</svg>';
  // a little night window: sky, moon, water ripples and the bobbing krathong
  function scene(cls) {
    return '<span class="sc ' + (cls || '') + '" aria-hidden="true">' +
      '<span class="mo"></span><i class="st s1"></i><i class="st s2"></i><i class="st s3"></i>' +
      '<span class="wa"><svg viewBox="0 0 120 20" preserveAspectRatio="none"><path d="M0 8 Q10 3 20 8 T40 8 T60 8 T80 8 T100 8 T120 8 V20 H0 Z"/></svg></span>' +
      '<span class="bob">' + KRATHONG + '</span>' +
      '</span>';
  }

  // ---------------------------------------------------------------- styles
  var CSS = [
    ':host{all:initial;display:inline-block;font-family:"Mitr","Noto Sans Thai",system-ui,sans-serif;-webkit-font-smoothing:antialiased}',
    ':host([data-style=banner]){display:block}',
    '*{box-sizing:border-box}',
    'a{color:inherit;text-decoration:none;-webkit-tap-highlight-color:transparent}',
    'a:focus-visible{outline:3px solid #7bdff2;outline-offset:4px}',

    /* the little night scene */
    '.sc{position:relative;display:block;flex:none;overflow:hidden;border-radius:50%;background:radial-gradient(circle at 70% 20%,#4b2a8f,#1b0d4d 70%);box-shadow:inset 0 0 0 1.5px rgba(255,226,140,.55)}',
    '.mo{position:absolute;right:16%;top:12%;width:30%;height:30%;border-radius:50%;background:radial-gradient(circle at 38% 35%,#fffdf0,#ffeeb8 60%,#f2cf86);box-shadow:0 0 10px 3px rgba(255,228,160,.55);animation:glow 3.2s ease-in-out infinite}',
    '.st{position:absolute;width:3px;height:3px;border-radius:50%;background:#fff;animation:tw 2.4s ease-in-out infinite}',
    '.s1{left:18%;top:22%}.s2{left:40%;top:12%;animation-delay:.8s}.s3{left:28%;top:40%;width:2px;height:2px;animation-delay:1.5s}',
    '.wa{position:absolute;left:0;right:0;bottom:0;height:36%;overflow:hidden}',
    '.wa svg{position:absolute;left:0;bottom:0;width:200%;height:100%;fill:#2b5fb8;opacity:.9;animation:wave 3s linear infinite}',
    '.wa::after{content:"";position:absolute;inset:0;background:linear-gradient(transparent,rgba(10,20,70,.55))}',
    '.bob{position:absolute;left:12%;right:12%;bottom:10%;animation:bob 2.6s ease-in-out infinite;transform-origin:50% 90%}',
    '.kt{display:block;width:100%;height:auto;filter:drop-shadow(0 2px 2px rgba(0,0,0,.35))}',
    '.fl{transform-origin:32px 13px;animation:flick .18s ease-in-out infinite alternate}',

    /* shared text */
    '.tt{display:block;font-weight:600;line-height:1.15;color:#ffd56b;text-shadow:0 1px 0 #7a3a10,0 0 14px rgba(255,190,80,.35);white-space:nowrap}',
    '.sb{display:block;font-weight:400;line-height:1.2;color:#e3d8ff;white-space:nowrap}',
    '.ar{flex:none;display:grid;place-items:center;border-radius:50%;background:linear-gradient(#fff0a0,#ffc94a 55%,#ff9f2e);color:#4a1f6b;font-weight:600;transition:transform .25s cubic-bezier(.3,1.6,.5,1)}',

    /* PILL */
    '.pill{position:relative;display:inline-flex;align-items:center;gap:12px;min-height:56px;padding:6px 8px 6px 6px;border-radius:999px;overflow:hidden;isolation:isolate;',
    '  background:linear-gradient(135deg,#2c1566,#170a45 60%,#24104f);box-shadow:0 0 0 1.5px rgba(255,214,120,.55),0 8px 22px -6px rgba(40,10,90,.65),0 0 24px -4px rgba(255,180,80,.35);',
    '  transition:transform .25s cubic-bezier(.3,1.6,.5,1),box-shadow .25s ease;animation:breathe 3.2s ease-in-out infinite}',
    '.pill .sc{width:44px;height:44px}',
    '.pill .tt{font-size:16px}.pill .sb{font-size:12px;margin-top:2px}',
    '.pill .tx{padding-right:4px}',
    '.pill .ar{width:30px;height:30px;font-size:16px}',
    '.pill:hover{transform:translateY(-2px);box-shadow:0 0 0 1.5px rgba(255,226,140,.9),0 12px 26px -6px rgba(40,10,90,.7),0 0 34px -2px rgba(255,190,80,.55)}',
    '.pill:hover .ar,.ban:hover .ar,.fab:hover .ar{transform:translateX(3px)}',
    '.pill:active{transform:translateY(1px) scale(.98)}',
    /* a slow shine sweeping across */
    '.pill::after,.ban::after{content:"";position:absolute;inset:0;z-index:-1;background:linear-gradient(105deg,transparent 35%,rgba(255,236,170,.22) 50%,transparent 65%);transform:translateX(-120%);animation:shine 4.5s ease-in-out infinite 1s}',

    /* BANNER */
    '.ban{position:relative;display:flex;align-items:center;gap:18px;width:100%;max-width:760px;min-height:112px;padding:14px 18px 14px 14px;border-radius:20px;overflow:hidden;isolation:isolate;',
    '  background:radial-gradient(ellipse 60% 120% at 12% 30%,rgba(255,220,150,.18),transparent 60%),linear-gradient(120deg,#2c1566,#140838 55%,#2a1258);',
    '  box-shadow:0 0 0 1.5px rgba(255,214,120,.45),0 14px 30px -12px rgba(30,8,80,.7);transition:transform .25s ease,box-shadow .25s ease}',
    '.ban:hover{transform:translateY(-2px);box-shadow:0 0 0 1.5px rgba(255,226,140,.85),0 18px 34px -12px rgba(30,8,80,.75),0 0 30px -6px rgba(255,190,80,.45)}',
    '.ban .sc{width:84px;height:84px}',
    '.ban .tx{flex:1;min-width:0}',
    '.ban .tt{font-size:22px;white-space:normal}.ban .sb{font-size:14px;margin-top:4px;white-space:normal}',
    '.ban .cta{flex:none;display:inline-flex;align-items:center;gap:8px;padding:11px 14px 11px 20px;border-radius:999px;background:linear-gradient(#fff0a0,#ffc94a 55%,#ff9f2e);color:#4a1f6b;font-weight:600;font-size:15px;box-shadow:0 4px 0 #b85c10;white-space:nowrap}',
    '.ban .cta .ar{width:24px;height:24px;font-size:13px;background:#4a1f6b;color:#ffd56b}',
    '.ban .lt{position:absolute;bottom:-20px;width:10px;height:13px;border-radius:40% 40% 30% 30%;background:radial-gradient(circle at 50% 70%,#fff3c4,#ffb24d 55%,#e0661f);box-shadow:0 0 10px 3px rgba(255,170,70,.45);z-index:-1;animation:rise 9s linear infinite}',
    '.ban .l1{left:38%}.ban .l2{left:62%;animation-delay:-3s;animation-duration:11s}.ban .l3{left:84%;animation-delay:-6s;width:8px;height:10px}',
    '@media (max-width:560px){.ban{flex-wrap:wrap;gap:12px;padding:14px}.ban .sc{width:64px;height:64px}.ban .tt{font-size:18px;white-space:normal}.ban .tx{flex:1 1 calc(100% - 80px)}.ban .cta{width:100%;justify-content:center}}',

    /* FLOATING */
    '.fw{position:fixed;z-index:2147482000;bottom:var(--b,20px);display:flex;align-items:center;gap:10px;flex-direction:row-reverse}',
    '.fw.in{position:absolute}',
    '.fw.r{right:max(16px,env(safe-area-inset-right))}.fw.l{left:max(16px,env(safe-area-inset-left));flex-direction:row}',
    '.fab{position:relative;display:grid;place-items:center;width:68px;height:68px;border-radius:50%;transition:transform .3s cubic-bezier(.3,1.6,.5,1);animation:enter .7s cubic-bezier(.3,1.5,.5,1) both}',
    '.fab .sc{width:100%;height:100%;box-shadow:inset 0 0 0 2px rgba(255,226,140,.8),0 10px 24px -6px rgba(30,8,80,.7),0 0 26px rgba(255,190,80,.4)}',
    '.fab:hover{transform:scale(1.07) rotate(-3deg)}',
    '.fab::before,.fab::after{content:"";position:absolute;inset:0;border-radius:50%;border:2px solid rgba(255,214,120,.6);animation:ring 2.8s ease-out infinite;pointer-events:none}',
    '.fab::after{animation-delay:1.4s}',
    '.tip{display:flex;align-items:center;gap:10px;padding:9px 10px 9px 16px;border-radius:999px;background:linear-gradient(135deg,#2c1566,#170a45);box-shadow:0 0 0 1.5px rgba(255,214,120,.55),0 8px 20px -6px rgba(30,8,80,.7);',
    '  transform-origin:right center;transition:opacity .35s ease,transform .35s cubic-bezier(.3,1.4,.5,1);opacity:0;transform:translateX(10px) scale(.9);pointer-events:none}',
    '.fw.l .tip{transform-origin:left center;transform:translateX(-10px) scale(.9)}',
    '.fw.open .tip,.fw:hover .tip,.fw:focus-within .tip{opacity:1;transform:none;pointer-events:auto}',
    '.tip .tt{font-size:15px}.tip .sb{font-size:11.5px;margin-top:1px}',
    '.tip .ar{width:26px;height:26px;font-size:14px}',
    '.x{position:absolute;top:-6px;width:24px;height:24px;border-radius:50%;border:0;padding:0;cursor:pointer;background:#fff;color:#4a1f6b;font:600 13px/24px system-ui,sans-serif;box-shadow:0 2px 6px rgba(0,0,0,.35);opacity:0;transform:scale(.6);transition:opacity .2s,transform .2s}',
    '.fw.r .x{right:-4px}.fw.l .x{left:-4px}',
    '.fw:hover .x,.fw:focus-within .x{opacity:1;transform:none}',
    '.x:focus-visible{outline:3px solid #7bdff2;outline-offset:2px}',
    '@media (hover:none){.x{opacity:1;transform:none}}',
    '@media (max-width:480px){.fab{width:58px;height:58px}.tip .sb{display:none}}',

    /* motion */
    '@keyframes bob{0%,100%{transform:translateY(0) rotate(-4deg)}50%{transform:translateY(-6%) rotate(4deg)}}',
    '@keyframes wave{to{transform:translateX(-50%)}}',
    '@keyframes flick{from{transform:scale(1,1)}to{transform:scale(.88,1.1)}}',
    '@keyframes glow{0%,100%{box-shadow:0 0 8px 2px rgba(255,228,160,.45)}50%{box-shadow:0 0 14px 5px rgba(255,228,160,.7)}}',
    '@keyframes tw{0%,100%{opacity:.2;transform:scale(.6)}50%{opacity:1;transform:scale(1)}}',
    '@keyframes shine{0%,60%{transform:translateX(-120%)}100%{transform:translateX(120%)}}',
    '@keyframes breathe{0%,100%{box-shadow:0 0 0 1.5px rgba(255,214,120,.55),0 8px 22px -6px rgba(40,10,90,.65),0 0 20px -6px rgba(255,180,80,.3)}50%{box-shadow:0 0 0 1.5px rgba(255,214,120,.75),0 8px 22px -6px rgba(40,10,90,.65),0 0 30px -2px rgba(255,180,80,.5)}}',
    '@keyframes ring{0%{transform:scale(1);opacity:.8}100%{transform:scale(1.55);opacity:0}}',
    '@keyframes enter{0%{transform:scale(0) rotate(-30deg);opacity:0}100%{transform:none;opacity:1}}',
    '@keyframes rise{0%{transform:translateY(0);opacity:0}15%{opacity:1}100%{transform:translateY(-150px) translateX(12px);opacity:0}}',
    '@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}.pill::after,.ban::after,.ban .lt{display:none}}'
  ].join('\n');

  // ---------------------------------------------------------------- build
  var host = document.createElement('lk-krathong-button');
  host.setAttribute('data-style', STYLE);
  var root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
  var target = NEW_TAB ? ' target="_blank" rel="noopener"' : '';
  var label = 'ลอยกระทงออนไลน์ — ' + sub;
  var text = '<span class="tx"><span class="tt">ลอยกระทงออนไลน์</span><span class="sb">' + sub + '</span></span>';
  var html;
  if (STYLE === 'banner') {
    html = '<a class="ban" href="' + href + '"' + target + ' aria-label="' + label + '">' +
      '<i class="lt l1"></i><i class="lt l2"></i><i class="lt l3"></i>' + scene() +
      '<span class="tx"><span class="tt">ลอยกระทงออนไลน์ ' + (+p[0] + 543) + '</span><span class="sb">เขียนคำอธิษฐาน แล้วลอยกระทงไปพร้อมเพื่อนๆ · ' + sub + '</span></span>' +
      '<span class="cta">ร่วมลอยกระทง<span class="ar">→</span></span></a>';
  } else if (STYLE === 'floating') {
    var side = d.side === 'left' ? 'l' : 'r';
    html = '<div class="fw ' + side + (PREVIEW && d.target ? ' in' : '') + '" style="--b:' + (parseInt(d.offset, 10) || 20) + 'px">' +
      '<a class="fab" href="' + href + '"' + target + ' aria-label="' + label + '">' + scene() + '</a>' +
      '<a class="tip" href="' + href + '"' + target + ' tabindex="-1" aria-hidden="true">' + text + '<span class="ar">→</span></a>' +
      '<button type="button" class="x" aria-label="ซ่อนปุ่มลอยกระทง">✕</button></div>';
  } else {
    html = '<a class="pill" href="' + href + '"' + target + ' aria-label="' + label + '">' + scene() + text + '<span class="ar">→</span></a>';
  }
  root.innerHTML = '<style>' + CSS + '</style>' + html;

  if (STYLE === 'floating') {
    // ✕ hides it for this page view only: it comes back on refresh or on the next page
    var fw = root.querySelector('.fw');
    root.querySelector('.x').addEventListener('click', function () {
      fw.style.transition = 'opacity .3s, transform .3s'; fw.style.opacity = '0'; fw.style.transform = 'scale(.6)';
      setTimeout(function () { if (host.parentNode) host.parentNode.removeChild(host); }, 320);
    });
    // say what it is once, shortly after the page loads, then tuck the label away
    setTimeout(function () { fw.classList.add('open'); }, 1200);
    setTimeout(function () { fw.classList.remove('open'); }, 6500);
    var box = PREVIEW && d.target ? document.querySelector(d.target) : null;
    (box || document.body || document.documentElement).appendChild(host);
  } else {
    var mount = d.target ? document.querySelector(d.target) : null;
    if (mount) mount.appendChild(host);
    else if (script.parentNode && script.parentNode !== document.head) script.parentNode.insertBefore(host, script);
    else (document.body || document.documentElement).appendChild(host);
  }
})();
