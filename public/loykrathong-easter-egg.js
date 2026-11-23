/*!
 * Loy Krathong Welcome Easter Egg — 3D cartoon scene (WebGL via Three.js r128 + bloom post-processing)
 *
 * วิธีใช้ (หลังผู้ใช้ login สำเร็จ):
 *   <script src="loykrathong-easter-egg.js"></script>
 *   LoyKrathongEasterEgg.maybeShow({ userName: 'สมชาย', onClose: () => goToDashboard() });
 *
 * - แสดงเฉพาะช่วงวันลอยกระทง (วันเพ็ญเดือน 12) ตาม windowDaysBefore / windowDaysAfter
 * - แสดงครั้งเดียวต่อวันต่อผู้ใช้ (oncePerDay)
 * - บังคับแสดงเพื่อทดสอบ: ใส่ ?loykrathong=1 ใน URL หรือส่ง { force: true }
 */
(function (global) {
  'use strict';

  var THREE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
  var EXAMPLES_URL = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/';
  var POST_FILES = [
    'shaders/CopyShader.js', 'shaders/LuminosityHighPassShader.js',
    'postprocessing/EffectComposer.js', 'postprocessing/RenderPass.js',
    'postprocessing/ShaderPass.js', 'postprocessing/UnrealBloomPass.js'
  ];
  var FONT_URL = 'https://fonts.googleapis.com/css2?family=Mitr:wght@400;500;600&display=swap';

  var DEFAULTS = {
    userName: '',
    force: false,
    windowDaysBefore: 2,
    windowDaysAfter: 1,
    oncePerDay: true,
    storageKey: 'loykrathong-egg-seen',
    dates: null,            // override: { 2027: '2027-11-13', ... }
    enterLabel: 'เข้าสู่ระบบ',
    bloom: true,
    music: true,            // เพลงประกอบ + เสียงพลุ/เสียงน้ำ
    musicUrl: null,         // ไฟล์เพลงของคุณเอง (ต้องมีสิทธิ์ใช้งาน) แทนเพลงสังเคราะห์
    musicVolume: 0.7,
    quality: 'auto',        // 'auto' | 'high' | 'medium' | 'low' (ทดสอบได้ด้วย ?lkq=low)
    logoUrl: 'auto',        // โลโก้บนยอดตึก: 'auto' = semed-logo.png ข้างไฟล์ JS นี้, URL อื่น, หรือ null เพื่อไม่แสดงป้าย
    // คำอธิษฐานของผู้ใช้อื่น: URL ของ API (GET ?limit=N คืน [{name, wish}], POST {name, wish})
    // หรือ object { load: function (limit) -> Promise<[{name, wish}]>, save: function ({name, wish}) -> Promise }
    wishFeed: null,
    wishPollMs: null,       // ถาม API หากระทงใหม่ทุกกี่ ms (null = อัตโนมัติ: จอใหญ่ 3 วิ, ทั่วไป 12 วิ, ไม่มีคนแตะ 5 นาที 30 วิ)
    onFeed: null,           // function ({ count }) ทุกครั้งที่ดึง feed สำเร็จ (ใช้กับตัวนับบนจอใหญ่)
    screen: false,          // โหมดจอใหญ่: ไม่มีช่องพิมพ์/ปุ่มปิด, ลอยกระทงใหม่ของทุกคน
    photos: true,           // แสดงรูปที่คนแนบมากับกระทง (false = ซ่อนรูปของทุกคนบนจอนี้)
    workshop: true,         // ปุ่ม "ทำกระทงของฉัน" (ต้องโหลด design.js และ workshop.js ก่อนไฟล์นี้)
    wishReturnChance: 0,    // โอกาสที่กระทงของเราเองที่ลอยหายไปแล้วจะลอยกลับมาอีก 1 รอบ (0 = ลอยครั้งเดียวแล้วหายไป)
    demo: false,            // โหมดเดโม: เล่นอัตโนมัติ (ลอยกระทง+คำอธิษฐานตัวอย่าง) ไม่สนวันที่/ไม่บันทึกว่าเคยดู
    onClose: null,
    onReady: null,          // function ({ moonScreen }) once the 3D scene shows (landing page moon hand-over)
    container: null
  };

  // วันลอยกระทงที่ประกาศแล้ว (ปีอื่นคำนวณจากวันเพ็ญเฉลี่ย — อาจคลาด ±1 วัน ใช้ options.dates แก้ได้)
  var KNOWN_DATES = { 2023: '2023-11-27', 2024: '2024-11-15', 2025: '2025-11-05', 2026: '2026-11-24' };

  // ---------------------------------------------------------------- date logic
  function computeFullMoon(year) {
    var ref = Date.UTC(2000, 0, 6, 18, 14);           // new moon reference
    var syn = 29.530588853 * 864e5;
    var lo = Date.UTC(year, 10, 1) - 7 * 36e5;         // Nov 1, Thai time
    var hi = Date.UTC(year, 11, 1) - 7 * 36e5;
    var k = Math.floor((lo - ref) / syn) - 1;
    for (var i = 0; i < 4; i++) {
      var fm = ref + (k + i) * syn + syn / 2;
      if (fm >= lo && fm < hi) return new Date(fm + 7 * 36e5).toISOString().slice(0, 10);
    }
    return year + '-11-15';
  }

  function festivalDate(year, overrides) {
    if (overrides && overrides[year]) return overrides[year];
    return KNOWN_DATES[year] || computeFullMoon(year);
  }

  function dayNumber(ymd) {
    var p = ymd.split('-');
    return Math.round(Date.UTC(+p[0], +p[1] - 1, +p[2]) / 864e5);
  }

  function todayYMD(d) {
    d = d || new Date();
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }

  function isLoyKrathongSeason(opts, now) {
    opts = Object.assign({}, DEFAULTS, opts || {});
    var t = todayYMD(now);
    var diff = dayNumber(t) - dayNumber(festivalDate(+t.slice(0, 4), opts.dates));
    return diff >= -opts.windowDaysBefore && diff <= opts.windowDaysAfter;
  }

  function safeGet(k) { try { return global.localStorage.getItem(k); } catch (e) { return null; } }
  function safeSet(k, v) { try { global.localStorage.setItem(k, v); } catch (e) { /* ignore */ } }

  // Rough device tier from memory / cores / touch. The FPS governor in the scene
  // still steps quality down at runtime if the device can't keep up.
  // the graphics chip's name says a lot: software renderers and integrated GPUs start lower
  var gpuNameCache = null;
  function gpuName() {
    if (gpuNameCache !== null) return gpuNameCache;
    gpuNameCache = '';
    try {
      var c = document.createElement('canvas');
      var gl = c.getContext('webgl') || c.getContext('experimental-webgl');
      if (gl) {
        var ext = gl.getExtension('WEBGL_debug_renderer_info');
        gpuNameCache = String((ext && gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) || gl.getParameter(gl.RENDERER) || '');
        var lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();
      }
    } catch (e) { /* ignore */ }
    return gpuNameCache;
  }
  function detectTier() {
    var gpu = gpuName();
    if (/swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic/i.test(gpu)) return 'low';
    var nav = global.navigator || {};
    var mem = nav.deviceMemory || 8, cores = nav.hardwareConcurrency || 8;
    var mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent || '');
    try { mobile = mobile || global.matchMedia('(pointer: coarse)').matches; } catch (e) { /* ignore */ }
    if (mem <= 3 || (mobile && cores <= 4)) return 'low';
    if (mobile || mem <= 6 || cores <= 4) return 'medium';
    if (/intel|uhd|iris|hd graphics|mali|adreno|powervr|vivante/i.test(gpu)) return 'medium';   // integrated GPU
    return 'high';
  }
  function resolveTier(q) {
    try { var m = /[?&]lkq=(high|medium|low)\b/.exec(global.location.search); if (m) return m[1]; } catch (e) { /* ignore */ }
    return q === 'high' || q === 'medium' || q === 'low' ? q : detectTier();
  }

  function urlParam() {
    try { var m = /[?&]loykrathong=(1|demo)\b/.exec(global.location.search); return m ? m[1] : null; } catch (e) { return null; }
  }
  function forcedByUrl() { return urlParam() !== null; }

  // wish feed adapter: a URL string or { load, save }
  // bidi overrides/isolates and LRM/RLM would let text render reversed (built from code points: no invisible source chars)
  var BIDI = new RegExp('[' + String.fromCharCode(0x200e, 0x200f, 0x202a) + '-' + String.fromCharCode(0x202e, 0x2066) + '-' + String.fromCharCode(0x2069) + ']', 'g');
  function clip(s, n) { return String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(BIDI, '').trim().slice(0, n); }

  // random id for this browser, so the server can rate-limit per person rather than per office IP
  var CLIENT_KEY = 'lk-client';
  function clientId() {
    var id = safeGet(CLIENT_KEY);
    if (!id || !/^[A-Za-z0-9-]{8,64}$/.test(id)) {
      id = 'c' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
      safeSet(CLIENT_KEY, id);
    }
    return id;
  }

  // how often to ask for new wishes: big screen 3s; others 12s, 30s once idle 5 minutes; x4 while the tab is hidden
  function pollDelay(o) {
    var ms = o.screen ? 3000 : o.idleMs > 300000 ? 30000 : 12000;
    return o.hidden ? ms * 4 : ms;
  }
  // cap on wish cards on screen at once (each card is a blurred overlay moved every frame)
  function canFloat(labelCount, screen) { return labelCount < (screen ? 16 : 8); }

  // load(limit) -> Promise<{ count: number|null, wishes: [{ id?, name, wish }] }>  (rejects after timeoutMs)
  // save(entry) -> Promise<{ ok: boolean, status: number, error?: string, id?: string }>
  function makeFeed(cfg, o) {
    if (!cfg) return null;
    var timeoutMs = (o && o.timeoutMs) || 8000;
    if (typeof cfg === 'string') {
      var url = cfg;
      return {
        load: function (limit) {
          var ctl = typeof AbortController === 'function' ? new AbortController() : null;
          var timer = ctl ? setTimeout(function () { ctl.abort(); }, timeoutMs) : null;
          return fetch(url + (url.indexOf('?') >= 0 ? '&' : '?') + 'limit=' + limit, { credentials: 'same-origin', headers: { Accept: 'application/json' }, signal: ctl ? ctl.signal : undefined })
            .then(function (r) { clearTimeout(timer); return r.ok ? r.json() : []; }, function (e) { clearTimeout(timer); throw e; })
            .then(function (d) {
              return Array.isArray(d) ? { count: null, wishes: d } : { count: d && typeof d.count === 'number' ? d.count : null, wishes: (d && d.wishes) || [] };
            });
        },
        save: function (entry) {
          var body = { name: entry.name, wish: entry.wish, client: clientId() };
          if (entry.design) body.design = entry.design;
          if (entry.photo) body.photo = entry.photo;
          if (entry.kid) body.kid = entry.kid;
          return fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
            .then(function (r) {
              return r.json().catch(function () { return {}; }).then(function (b) {
                return { ok: r.ok, status: r.status, error: b && b.error, id: b && b.id };
              });
            });
        }
      };
    }
    if (typeof cfg.load === 'function') {   // custom adapter: accept a plain array too
      return {
        load: function (limit) {
          return Promise.resolve(cfg.load(limit)).then(function (d) { return Array.isArray(d) ? { count: null, wishes: d } : d || { count: null, wishes: [] }; });
        },
        save: function (entry) {
          return Promise.resolve(cfg.save ? cfg.save(entry) : null).then(function (r) { return r && typeof r.ok === 'boolean' ? r : { ok: true, status: 200 }; });
        }
      };
    }
    return null;
  }

  // Sort a feed batch into wishes never seen before (fresh: float them next, oldest first, at most 30)
  // and ones seen earlier (pool: float again at random). Own wishes are skipped by id, never by name.
  var FRESH_MAX = 30;
  var MSG_BLOCKED = 'ขอคำอธิษฐานที่สุภาพหน่อยนะ 🙏';
  var MSG_TOO_FAST = 'ลอยถี่ไปนิด รอสักครู่นะ';
  // ready-made wishes to tap when typing is a chore (a wish is needed before floating)
  var QUICK_WISHES = ['ขอให้สุขภาพแข็งแรง', 'ขอให้งานราบรื่น', 'ขอให้ครอบครัวมีความสุข', 'ขอให้รวย ๆ 💰', 'ขอให้สมหวังทุกอย่าง', 'ขอให้ได้โบนัสเยอะ ๆ'];
  var MSG_SHARED = '🪷 กระทงของคุณลอยไปให้เพื่อนๆ เห็นแล้ว';
  function mergeFeed(state, list) {
    var fresh = [], pool = [];
    (list || []).forEach(function (e) {
      var item = { id: e && e.id != null ? String(e.id) : '', name: clip(e && e.name, 40), wish: clip(e && e.wish, 80),
        look: !!(e && e.look) };
      if (!item.wish) return;
      var key = item.id || item.name + '|' + item.wish;
      if (state.mine[key]) return;
      if (state.seen[key]) pool.push(item);
      else { state.seen[key] = 1; fresh.push(item); }
    });
    fresh.reverse();   // API order is newest first
    if (fresh.length > FRESH_MAX) fresh = fresh.slice(fresh.length - FRESH_MAX);
    return { fresh: fresh, pool: pool };
  }

  function feedKey(e) { return e.id || e.name + '|' + e.wish; }

  // folder this script was loaded from (to find semed-logo.png next to it)
  var SCRIPT_BASE = (function () {
    try { var s = document.currentScript && document.currentScript.src; return s ? s.slice(0, s.lastIndexOf('/') + 1) : ''; } catch (e) { return ''; }
  })();

  var DEMO_WISHES = [
    ['คุณแม่', 'ขอให้ทุกคนในบ้านสุขภาพแข็งแรง'],
    ['น้องมิว', 'ขอให้สอบติดคณะที่ฝันไว้'],
    ['ทีมงาน', 'ขอให้ปีนี้งานราบรื่น ยอดขายปัง'],
    ['คุณตา', 'ขอให้ลูกหลานมีความสุข'],
    ['พี่บอส', 'ขอให้ได้เดินทางรอบโลก'],
    ['เพื่อนรัก', 'ขอให้มิตรภาพของเราอยู่ตลอดไป'],
    ['น้องเจ', 'ขอให้มีน้องหมาสักตัว 🐶']
  ];

  // ---------------------------------------------------------------- loaders
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  var threePromise = null;
  function loadThree() {
    if (global.THREE) return Promise.resolve(global.THREE);
    if (!threePromise) {
      threePromise = loadScript(THREE_URL).then(function () { return global.THREE; }, function (e) { threePromise = null; throw e; });
    }
    return threePromise;
  }

  var postPromise = null;
  function loadPost() {
    var T = global.THREE;
    if (T.EffectComposer && T.RenderPass && T.ShaderPass && T.UnrealBloomPass) return Promise.resolve(true);
    if (!postPromise) {
      postPromise = POST_FILES.reduce(function (p, f) {
        return p.then(function () { return loadScript(EXAMPLES_URL + f); });
      }, Promise.resolve()).then(function () { return true; }, function () { return false; });
    }
    return postPromise;
  }

  // low tier never uses bloom, so do not download the post-processing scripts
  function preload(o) {
    return loadThree().then(function () { return resolveTier(o && o.quality) === 'low' ? false : loadPost(); });
  }

  function loadFont() {
    if (document.querySelector('link[data-lk-font]')) return;
    var l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = FONT_URL; l.setAttribute('data-lk-font', '');
    document.head.appendChild(l);
  }

  var CSS = [
    '.lk-egg{position:fixed;inset:0;z-index:2147483000;background:#0b0630;opacity:0;transition:opacity .8s ease;font-family:"Mitr","Noto Sans Thai",system-ui,sans-serif;color:#fff;overflow:hidden;-webkit-tap-highlight-color:transparent}',
    '.lk-egg.lk-in{opacity:1}',
    '.lk-egg *,.lk-egg *::before,.lk-egg *::after{box-sizing:border-box}',
    '.lk-egg button,.lk-egg input{width:auto;margin:0;border-radius:0;background:none;box-shadow:none;outline:0;font-family:inherit}',
    '.lk-egg canvas{display:block;width:100%;height:100%;cursor:default;touch-action:manipulation}',
    '.lk-ui{position:absolute;inset:0;pointer-events:none;display:flex;flex-direction:column;align-items:center;justify-content:space-between;padding:max(24px,env(safe-area-inset-top)) 16px max(20px,env(safe-area-inset-bottom))}',
    '.lk-title{position:relative;text-align:center;margin-top:1.5vh}',
    '.lk-hello{position:relative;z-index:1;display:inline-flex;align-items:center;gap:8px;font-size:clamp(14px,2.2vw,18px);font-weight:500;padding:6px 18px;border-radius:999px;background:linear-gradient(135deg,rgba(255,255,255,.2),rgba(255,255,255,.06));border:1.5px solid rgba(255,226,150,.55);box-shadow:0 4px 18px rgba(20,0,60,.35),inset 0 1px 0 rgba(255,255,255,.35);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);opacity:0;animation:lk-drop .7s .9s cubic-bezier(.2,1.5,.4,1) both}',
    '.lk-hello::before,.lk-hello::after{content:"✦";color:#ffd86b;font-size:.8em}',
    '.lk-title h1{position:relative;margin:.42em 0 6px;font-size:clamp(30px,min(6.6vw,11vh),84px);line-height:1.15;font-weight:600;color:#f0a82c;-webkit-text-stroke:2.5px #3d1763;paint-order:stroke fill;letter-spacing:.5px;',
    '  text-shadow:0 1px 0 #e8962a,0 2px 0 #dc8522,0 3px 0 #cc731a,0 4px 0 #b86014,0 5px 0 #9c4b10,0 6px 0 #5a2470,0 7px 0 #4a1f6b,0 8px 0 #3d1763,0 14px 22px rgba(15,0,40,.7),0 0 46px rgba(255,180,70,.55);',
    '  animation:lk-pop 1s 1.3s cubic-bezier(.2,1.7,.4,1) both, lk-bob 3.4s 2.4s ease-in-out infinite}',
    '.lk-title h1::before,.lk-title h1::after{content:attr(data-text);position:absolute;inset:0;-webkit-text-stroke:0;text-shadow:none;color:transparent;-webkit-background-clip:text;background-clip:text;pointer-events:none}',
    '.lk-title h1::before{background-image:linear-gradient(180deg,#fffbe0 0%,#ffe680 38%,#ffc23d 62%,#ff9a1f 100%)}',
    '.lk-title h1::after{background-image:linear-gradient(105deg,transparent 35%,rgba(255,255,255,.95) 48%,transparent 60%);background-size:260% 100%;background-position:120% 0;animation:lk-shine 4s 2.6s ease-in-out infinite}',
    '.lk-spark{position:absolute;color:#fff3b8;text-shadow:0 0 12px #ffd36b,0 0 24px #ff9f3c;font-style:normal;pointer-events:none;opacity:0;animation:lk-twinkle 2.4s ease-in-out infinite}',
    '.lk-sub{display:flex;align-items:center;justify-content:center;gap:12px;font-size:clamp(12px,1.9vw,16px);opacity:0;color:#f1e6ff;letter-spacing:3px;text-shadow:0 2px 8px rgba(0,0,0,.5);animation:lk-fade .8s 2s ease both}',
    '.lk-sub::before,.lk-sub::after{content:"";width:clamp(24px,6vw,70px);height:1.5px;background:linear-gradient(90deg,transparent,#ffd86b)}',
    '.lk-sub::after{transform:scaleX(-1)}',
    '.lk-bottom{display:flex;flex-direction:column;align-items:center;gap:12px;width:100%;max-width:560px;opacity:0;animation:lk-rise .9s 2.3s cubic-bezier(.2,1.2,.4,1) both}',
    '.lk-hint{font-size:13px;color:#efe8ff;text-align:center;text-shadow:0 1px 6px rgba(0,0,0,.6);padding:4px 14px;border-radius:999px;background:rgba(20,8,60,.42);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px)}',
    '@media (max-height:500px){.lk-ui{padding-top:max(10px,env(safe-area-inset-top));padding-bottom:max(10px,env(safe-area-inset-bottom))}.lk-title{margin-top:0}.lk-hello{font-size:12px;padding:3px 12px}.lk-title h1{margin:.35em 0 2px;font-size:clamp(24px,9vh,46px)}.lk-sub{font-size:11px}.lk-hint{display:none}.lk-bottom{flex-direction:row;max-width:700px;gap:10px}.lk-wish{flex:1}.lk-egg .lk-btn-enter{padding:10px 18px;font-size:14px}.lk-toast{top:50%}}',
    '.lk-wish{pointer-events:auto;display:flex;gap:8px;width:100%;background:linear-gradient(135deg,rgba(60,30,130,.55),rgba(20,8,60,.55));border:1.5px solid rgba(255,226,122,.6);border-radius:999px;padding:6px;box-shadow:0 8px 28px rgba(10,0,40,.45),inset 0 1px 0 rgba(255,255,255,.2)}',
    '.lk-egg .lk-wish input{flex:1;min-width:0;width:auto;background:transparent;border:0;outline:0;color:#fff;font:inherit;font-size:15px;padding:0 14px}',
    '.lk-wish input::placeholder{color:#c4b5f0}',
    '.lk-egg .lk-btn{pointer-events:auto;font:inherit;font-weight:500;font-size:15px;border:0;border-radius:999px;cursor:pointer;padding:10px 18px;transition:transform .15s ease,box-shadow .15s ease,filter .15s ease;white-space:nowrap}',
    '.lk-egg .lk-btn:hover{filter:brightness(1.08)}',
    '.lk-btn:active{transform:translateY(2px)}',
    '.lk-egg .lk-btn-float{background:linear-gradient(#fff0a0,#ffc94a 55%,#ff9f2e);color:#4a1f6b;box-shadow:0 4px 0 #b85c10,0 0 18px rgba(255,190,80,.55)}',
    '.lk-egg .lk-btn-enter{background:linear-gradient(#ffffff,#ece4ff);color:#3b1a6e;border-radius:999px;padding:12px 30px;font-size:16px;box-shadow:0 5px 0 #8a6bd1,0 12px 28px rgba(0,0,0,.4)}',
    '.lk-egg .lk-btn-make{background:linear-gradient(#7fd88f,#3f8a5a);color:#fff;box-shadow:0 4px 0 #22573a,0 10px 24px rgba(0,0,0,.35);text-shadow:0 1px 2px rgba(0,0,0,.35)}',
    '.lk-egg .lk-btn-make[hidden],.lk-egg .lk-btn-gallery[hidden]{display:none}',
    '.lk-mine{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}',
    '.lk-egg .lk-btn-gallery{background:linear-gradient(#b9a4ff,#7a5ad8);color:#fff;box-shadow:0 4px 0 #4a2f9a,0 10px 24px rgba(0,0,0,.35);text-shadow:0 1px 2px rgba(0,0,0,.35)}',
    '.lk-making .lk-toast{top:30%}',
    '.lk-egg .lk-toast{z-index:30}',
    '.lk-making .lk-bottom,.lk-making .lk-bottom *,.lk-making .lk-title,.lk-making .lk-labels,.lk-making .lk-close,.lk-making .lk-sound{opacity:0;pointer-events:none!important;transition:opacity .3s}',
    '.lk-btn:focus-visible,.lk-close:focus-visible{outline:3px solid #7bdff2;outline-offset:3px}',
    '.lk-egg .lk-close{pointer-events:auto;position:absolute;top:max(14px,env(safe-area-inset-top));right:14px;width:40px;height:40px;padding:0;display:grid;place-items:center;border-radius:50%;border:1.5px solid rgba(255,255,255,.4);background:rgba(20,8,60,.45);color:#fff;font-size:18px;line-height:1;font-family:system-ui,sans-serif;cursor:pointer;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}',
    '.lk-toast{position:absolute;left:50%;top:44%;transform:translate(-50%,-50%);max-width:min(88vw,520px);text-align:center;font-size:clamp(16px,2.6vw,22px);padding:12px 24px;border-radius:22px;background:linear-gradient(135deg,rgba(80,45,120,.85),rgba(50,25,90,.85));border:1.5px solid rgba(255,226,122,.7);box-shadow:0 0 30px rgba(255,190,90,.35);color:#fff6d6;text-shadow:0 2px 6px rgba(0,0,0,.5);pointer-events:none;animation:lk-toast 3.6s ease forwards}',
    '.lk-egg .lk-sound{pointer-events:auto;position:absolute;top:max(14px,env(safe-area-inset-top));right:62px;min-width:40px;height:40px;padding:0 10px;border-radius:999px;border:1.5px solid rgba(255,255,255,.4);background:rgba(20,8,60,.45);color:#fff;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;font-size:14px;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}',
    '.lk-sound span{display:none;white-space:nowrap}',
    '.lk-egg.lk-blocked .lk-sound{background:linear-gradient(#fff0a0,#ffc94a);color:#3d1763;border-color:#ffe27a;animation:lk-pulse 1.4s ease-in-out infinite}',
    '.lk-egg.lk-blocked .lk-sound span{display:inline}',
    '.lk-egg .lk-sound:focus-visible{outline:3px solid #7bdff2;outline-offset:3px}',
    '@keyframes lk-pulse{0%,100%{box-shadow:0 0 0 0 rgba(255,226,122,.7)}50%{box-shadow:0 0 0 9px rgba(255,226,122,0)}}',
    '@media (max-width:520px){.lk-title{margin-top:46px}}',
    '.lk-topleft{position:absolute;top:max(14px,env(safe-area-inset-top));left:14px;display:flex;gap:8px;pointer-events:none}',
    '.lk-demo{height:40px;display:inline-flex;align-items:center;gap:8px;border-radius:999px;background:rgba(20,8,60,.45);border:1.5px solid rgba(255,226,122,.55);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}',
    '.lk-demo{padding:0 14px;font-size:13px;font-weight:500;color:#fff;letter-spacing:.5px}',
    '.lk-demo::before{content:"";width:8px;height:8px;border-radius:50%;background:#ff5e8a;box-shadow:0 0 8px #ff5e8a;animation:lk-blink 1.2s ease-in-out infinite}',
    '.lk-plus{position:absolute;left:0;top:0;font-weight:600;font-size:22px;color:#ffe27a;-webkit-text-stroke:1.5px #4a1f6b;paint-order:stroke fill;text-shadow:0 0 12px rgba(255,200,80,.8);pointer-events:none;animation:lk-plus 1s ease-out forwards}',
    '@keyframes lk-bump{0%{transform:scale(1)}40%{transform:scale(1.18)}100%{transform:scale(1)}}',
    '@keyframes lk-blink{0%,100%{opacity:1}50%{opacity:.25}}',
    '@keyframes lk-plus{0%{opacity:0;transform:translate(-50%,-50%) scale(.5)}20%{opacity:1;transform:translate(-50%,-90%) scale(1.15)}100%{opacity:0;transform:translate(-50%,-220%) scale(1)}}',
    '.lk-labels{position:absolute;inset:0;pointer-events:none;overflow:hidden}',
    '.lk-label--other .lk-label-card{background:linear-gradient(135deg,rgba(40,60,130,.78),rgba(30,25,90,.82));border-color:rgba(160,205,255,.8);box-shadow:0 0 22px rgba(120,170,255,.42),inset 0 1px 0 rgba(255,255,255,.3)}',
    '.lk-label--other .lk-label-card::after{background:linear-gradient(rgba(160,205,255,.9),rgba(160,205,255,0))}',
    '.lk-label--other .lk-label-name{color:#bfe0ff}',
    '.lk-name-row{pointer-events:auto;display:inline-flex;align-items:center;gap:8px;max-width:100%;font-size:13px;color:#e9e0ff;padding:4px 6px 4px 14px;border-radius:999px;background:rgba(20,8,60,.45);border:1.5px solid rgba(255,226,122,.4);cursor:text;white-space:nowrap}',
    '.lk-egg .lk-name-input{width:10em;max-width:48vw;min-width:0;background:rgba(255,255,255,.1);border:0;border-radius:999px;color:#fff3c4;font:inherit;font-weight:500;padding:4px 10px;outline:0}',
    '.lk-egg .lk-name-input::placeholder{color:#b9aee0;font-weight:400}',
    '.lk-egg .lk-name-input:focus{background:rgba(255,255,255,.18);box-shadow:0 0 0 2px rgba(255,226,122,.6)}',
    '.lk-name-edit{opacity:.75;font-size:12px;margin-right:6px}',
    '@media (max-height:500px){.lk-name-row{flex:none;padding-left:10px}.lk-egg .lk-name-input{width:6.5em}.lk-name-row>span:first-child{display:none}}',
    '.lk-screen .lk-bottom,.lk-screen .lk-close{display:none}',
    '.lk-screen .lk-label-card{max-width:440px;padding:12px 26px 14px;border-radius:22px}.lk-screen .lk-label-name{font-size:clamp(14px,1.25vw,24px)}.lk-screen .lk-label-wish{font-size:clamp(18px,1.75vw,32px)}',
    '.lk-quick{pointer-events:auto;display:flex;gap:6px;max-width:100%;overflow-x:auto;padding:2px 2px 4px;scrollbar-width:none;-webkit-mask-image:linear-gradient(90deg,#000 88%,transparent)}',
    '.lk-quick::-webkit-scrollbar{display:none}',
    '.lk-egg .lk-quick button{flex:none;font:inherit;font-size:13px;color:#fff6d6;cursor:pointer;padding:5px 12px;border-radius:999px;border:1.5px solid rgba(255,226,122,.45);background:rgba(20,8,60,.6)}',
    '.lk-egg .lk-quick button:hover{border-color:#ffe27a}',
    '.lk-egg .lk-quick button:focus-visible{outline:3px solid #7bdff2;outline-offset:2px}',
    '.lk-screen .lk-quick{display:none}',
    '@media (max-height:500px){.lk-quick{display:none}}',
    '.lk-egg .lk-btn-float:disabled{opacity:.55;cursor:not-allowed;filter:grayscale(.35);box-shadow:0 4px 0 #8a5a30}',
    '.lk-share-note{font-size:11.5px;color:#d9cff7;opacity:.85;text-align:center;margin-top:-4px}',
    '@media (max-height:500px){.lk-share-note{display:none}}',
    '.lk-label{position:absolute;left:0;top:0;transform-origin:50% 100%;will-change:transform,opacity;opacity:0}',
    '.lk-label-card{position:relative;width:max-content;max-width:240px;margin-bottom:16px;padding:8px 16px 10px;border-radius:16px;text-align:center;background:linear-gradient(135deg,rgba(70,40,120,.78),rgba(40,20,90,.82));border:1.5px solid rgba(255,220,130,.8);box-shadow:0 0 24px rgba(255,190,90,.5),inset 0 1px 0 rgba(255,255,255,.3);color:#fff;text-shadow:0 1px 4px rgba(0,0,0,.6);animation:lk-label-in .9s cubic-bezier(.2,1.6,.4,1) both,lk-label-float 3s .9s ease-in-out infinite}',
    '.lk-label-card::after{content:"";position:absolute;left:50%;bottom:-16px;width:2px;height:15px;transform:translateX(-50%);background:linear-gradient(rgba(255,220,130,.9),rgba(255,220,130,0))}',
    '.lk-label-name{display:block;font-size:12px;font-weight:500;color:#ffd86b;letter-spacing:.3px}',
    '.lk-label-name::before{content:"🪷 "}',
    '.lk-label-wish{display:block;font-size:15px;line-height:1.35;overflow-wrap:anywhere}',
    '@keyframes lk-label-in{0%{opacity:0;transform:translateY(18px) scale(.5)}100%{opacity:1;transform:none}}',
    '@keyframes lk-label-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}',
    '@keyframes lk-pop{0%{opacity:0;transform:scale(.3) translateY(30px)}100%{opacity:1;transform:none}}',
    '@keyframes lk-drop{0%{opacity:0;transform:translateY(-24px)}100%{opacity:1;transform:none}}',
    '@keyframes lk-rise{0%{opacity:0;transform:translateY(30px)}100%{opacity:1;transform:none}}',
    '@keyframes lk-fade{to{opacity:1}}',
    '@keyframes lk-bob{0%,100%{transform:translateY(0) rotate(-.6deg)}50%{transform:translateY(-6px) rotate(.6deg)}}',
    '@keyframes lk-shine{0%{background-position:120% 0}55%,100%{background-position:-60% 0}}',
    '@keyframes lk-twinkle{0%,100%{opacity:0;transform:scale(.4) rotate(0)}50%{opacity:1;transform:scale(1) rotate(45deg)}}',
    '@keyframes lk-toast{0%{opacity:0;transform:translate(-50%,-30%) scale(.8)}12%{opacity:1;transform:translate(-50%,-50%) scale(1)}80%{opacity:1}100%{opacity:0;transform:translate(-50%,-90%)}}',
    '@media (max-width:520px){.lk-hint{font-size:12px}.lk-egg .lk-btn-float{padding:10px 14px}.lk-title h1{-webkit-text-stroke-width:2px}}',
    // low-end devices: no live blur over the canvas, no repainting shine — solid glass instead
    '.lk-lowfx *,.lk-lowfx *::before,.lk-lowfx *::after{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}',
    '.lk-lowfx .lk-wish,.lk-lowfx .lk-label-card,.lk-lowfx .lk-toast{background:rgba(34,16,86,.86)}',
    '.lk-lowfx .lk-hello,.lk-lowfx .lk-name-row,.lk-lowfx .lk-demo,.lk-lowfx .lk-hint,.lk-lowfx .lk-close,.lk-lowfx .lk-sound{background:rgba(34,16,86,.78)}',
    '.lk-lowfx .lk-title h1{animation:lk-pop 1s 1.3s cubic-bezier(.2,1.7,.4,1) both}',
    '.lk-lowfx .lk-title h1::after{display:none}',
    '.lk-lowfx .lk-label-card{animation:lk-label-in .9s cubic-bezier(.2,1.6,.4,1) both}',
    '@media (prefers-reduced-motion:reduce){.lk-title h1{animation:lk-fade .4s both}.lk-title h1::after,.lk-spark{animation:none}.lk-hello,.lk-sub,.lk-bottom{animation-delay:0s}}'
  ].join('\n');

  function injectCSS() {
    if (document.getElementById('lk-egg-css')) return;
    var st = document.createElement('style');
    st.id = 'lk-egg-css'; st.textContent = CSS;
    document.head.appendChild(st);
  }

  // Custom shaders author colors in sRGB; convert to linear so they match the
  // rest of the pipeline whether rendering straight to screen or through bloom.
  var OUT = 'gl_FragColor = linearToOutputTexel(vec4(pow(max(col, 0.0), vec3(2.2)), alpha));';

  // ---------------------------------------------------------------- scene
  // env: { labelLayer, sfx, onCoin(screenX, screenY), demo }
  function buildScene(THREE, canvas, reduced, useBloom, env) {
    env = env || {};
    var labelLayer = env.labelLayer, sfx = env.sfx, onCoin = env.onCoin, demoMode = !!env.demo;
    var R = Math.random;
    var tier = env.tier || 'high', LOW = tier === 'low', MID = tier === 'medium';
    var lite = reduced || LOW;
    var Q = {
      pr: LOW ? 1 : MID ? 1.5 : 2,
      bloom: useBloom && !LOW,
      stars: lite ? 450 : MID ? 800 : 1100,
      krathongs: lite ? 6 : MID ? 9 : 12,
      lanterns: lite ? 12 : MID ? 20 : 30,
      lotus: lite ? 6 : MID ? 9 : 12,
      fireflies: lite ? 14 : MID ? 26 : 40,
      sparkles: lite ? 16 : MID ? 32 : 50,
      mist: lite ? 3 : MID ? 6 : 9,
      village: LOW ? 24 : MID ? 40 : 54,
      burst: lite ? 70 : MID ? 120 : 170,
      rocketGap: reduced ? 4.5 : LOW ? 1.8 : MID ? 1.2 : 0.9,
      water: LOW ? [90, 64] : MID ? [130, 90] : [170, 120],
      lights: LOW ? 6 : 10
    };
    useBloom = Q.bloom;
    var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: !LOW, powerPreference: LOW ? 'default' : 'high-performance' });
    var basePR = Math.min(global.devicePixelRatio || 1, Q.pr), prLimit = 99;
    var PR = basePR;
    renderer.info.autoReset = false;   // count every pass of a frame (bloom renders several)
    renderer.setPixelRatio(PR);
    renderer.outputEncoding = THREE.sRGBEncoding;

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1200);
    var camFinal = new THREE.Vector3(0, 3.4, 12);
    var lookFinal = new THREE.Vector3(0, 2.2, -12);
    var camStart = new THREE.Vector3(0, 16, 30);
    var lookStart = new THREE.Vector3(0, 22, -60);
    camera.position.copy(reduced ? camFinal : camStart);

    // toon ramp
    var ramp = new Uint8Array([70, 70, 70, 255, 150, 150, 150, 255, 255, 255, 255, 255]);
    var gradientMap = new THREE.DataTexture(ramp, 3, 1, THREE.RGBAFormat);
    gradientMap.minFilter = gradientMap.magFilter = THREE.NearestFilter;
    gradientMap.needsUpdate = true;

    function toon(color, extra) {
      return new THREE.MeshToonMaterial(Object.assign({ color: color, gradientMap: gradientMap }, extra || {}));
    }

    var outlineMat = new THREE.ShaderMaterial({
      uniforms: { uT: { value: 0.035 }, uC: { value: new THREE.Color(0x1b0f3a) } },
      vertexShader: 'uniform float uT; void main(){ vec3 p = position + normal * uT; gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0); }',
      fragmentShader: 'uniform vec3 uC; void main(){ gl_FragColor = vec4(uC,1.0); }',
      side: THREE.BackSide
    });
    function withOutline(mesh) {
      mesh.add(new THREE.Mesh(mesh.geometry, outlineMat));
      return mesh;
    }

    // merge many small parts into one vertex-colored geometry (fewer draw calls)
    function merge(parts) {
      var pos = [], nor = [], col = [], c = new THREE.Color();
      parts.forEach(function (p) {
        var g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
        g.applyMatrix4(p.m);
        var a = g.attributes.position.array, n = g.attributes.normal.array;
        var vc = p.color == null && g.attributes.color ? g.attributes.color.array : null; // per-vertex gradient
        if (!vc) c.set(p.color);
        for (var i = 0; i < a.length; i += 3) {
          pos.push(a[i], a[i + 1], a[i + 2]);
          nor.push(n[i], n[i + 1], n[i + 2]);
          if (vc) col.push(vc[i], vc[i + 1], vc[i + 2]); else col.push(c.r, c.g, c.b);
        }
        g.dispose();
      });
      var out = new THREE.BufferGeometry();
      out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      return out;
    }
    function M(x, y, z, q, sx, sy, sz) {
      return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q || new THREE.Quaternion(),
        new THREE.Vector3(sx == null ? 1 : sx, sy == null ? (sx == null ? 1 : sx) : sy, sz == null ? (sx == null ? 1 : sx) : sz));
    }

    function canvasTex(w, h, draw) {
      var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      draw(cv.getContext('2d'), w, h);
      var t = new THREE.CanvasTexture(cv);
      t.encoding = THREE.sRGBEncoding;
      return t;
    }
    function glowTexture(stops) {
      return canvasTex(128, 128, function (ctx) {
        var g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
        stops.forEach(function (s) { g.addColorStop(s[0], s[1]); });
        ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
      });
    }
    var flameTex = glowTexture([[0, 'rgba(255,255,235,1)'], [0.2, 'rgba(255,220,120,1)'], [0.45, 'rgba(255,140,40,.55)'], [1, 'rgba(255,90,20,0)']]);
    var softTex = glowTexture([[0, 'rgba(255,255,255,1)'], [0.3, 'rgba(255,255,255,.5)'], [1, 'rgba(255,255,255,0)']]);
    var moonGlowTex = glowTexture([[0, 'rgba(255,248,220,.9)'], [0.28, 'rgba(255,225,160,.35)'], [0.6, 'rgba(200,150,255,.12)'], [1, 'rgba(120,80,200,0)']]);
    var streakTex = canvasTex(256, 16, function (ctx, w, h) {
      var g = ctx.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.85, 'rgba(220,230,255,.6)'); g.addColorStop(1, 'rgba(255,255,255,1)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w - 6, 2); ctx.arc(w - 6, h / 2, h / 2 - 2, -Math.PI / 2, Math.PI / 2); ctx.closePath(); ctx.fill();
    });

    function sprite(tex, color, scale, opacity, normalBlend) {
      var s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex, color: color, transparent: true, opacity: opacity == null ? 1 : opacity,
        blending: normalBlend ? THREE.NormalBlending : THREE.AdditiveBlending, depthWrite: false
      }));
      s.scale.set(scale, scale, 1);
      return s;
    }

    // lights
    var hemi = new THREE.HemisphereLight(0x9d8cff, 0x1a1040, 0.75);
    scene.add(hemi);
    var moonLight = new THREE.DirectionalLight(0xcfd8ff, 0.7); moonLight.position.set(0, 25, -60); scene.add(moonLight);
    var warmLight = new THREE.DirectionalLight(0xffb37a, 0.55); warmLight.position.set(4, 6, 12); scene.add(warmLight);

    // sky
    var skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: {
        uTop: { value: new THREE.Color(0x060322) }, uMid: { value: new THREE.Color(0x2a1462) },
        uHor: { value: new THREE.Color(0x9a4a8e) }, uFlash: { value: 0 }, uFlashCol: { value: new THREE.Color(0xffffff) }
      },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: [
        'uniform vec3 uTop,uMid,uHor,uFlashCol; uniform float uFlash; varying vec3 vP;',
        'void main(){ float h = vP.y; vec3 col = mix(uHor, uMid, smoothstep(-0.02, 0.13, h)); col = mix(col, uTop, smoothstep(0.13, 0.6, h));',
        '  col += uFlashCol * uFlash * 0.12 * smoothstep(0.6, 0.0, h); float alpha = 1.0;', OUT, '}'
      ].join('\n')
    });
    scene.add(new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), skyMat));

    // stars
    var STARS = Q.stars;
    var sp = new Float32Array(STARS * 3), sph = new Float32Array(STARS), ssz = new Float32Array(STARS), stint = new Float32Array(STARS * 3);
    var starTints = [[1, 0.95, 0.82], [0.8, 0.88, 1], [1, 0.85, 0.95]];
    for (var i = 0; i < STARS; i++) {
      var th = R() * Math.PI * 2, y = 0.06 + R() * 0.94, r = Math.sqrt(1 - y * y);
      sp[i * 3] = Math.cos(th) * r * 450; sp[i * 3 + 1] = y * 450; sp[i * 3 + 2] = Math.sin(th) * r * 450;
      sph[i] = R() * 6.28; ssz[i] = 1.4 + R() * R() * 5.5;
      var tn = starTints[i % 3]; stint[i * 3] = tn[0]; stint[i * 3 + 1] = tn[1]; stint[i * 3 + 2] = tn[2];
    }
    var starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    starGeo.setAttribute('aPhase', new THREE.BufferAttribute(sph, 1));
    starGeo.setAttribute('aSize', new THREE.BufferAttribute(ssz, 1));
    starGeo.setAttribute('aTint', new THREE.BufferAttribute(stint, 3));
    var starMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uPR: { value: PR } },
      vertexShader: 'attribute float aPhase; attribute float aSize; attribute vec3 aTint; uniform float uTime; uniform float uPR; varying float vA; varying vec3 vT; void main(){ vT = aTint; vA = 0.4 + 0.6 * (0.5 + 0.5 * sin(uTime * 1.7 + aPhase)); gl_PointSize = aSize * uPR; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying float vA; varying vec3 vT; void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c); float a = smoothstep(0.5, 0.0, d); float cr = max(0.0, 1.0 - abs(c.x) * 14.0) + max(0.0, 1.0 - abs(c.y) * 14.0); vec3 col = vT; float alpha = (a + cr * a) * vA; ' + OUT + ' }'
    });
    scene.add(new THREE.Points(starGeo, starMat));

    // moon: a billboard disc with baked spherical shading, soft craters and the moon rabbit
    // pounding mochi (a flat disc keeps the drawing undistorted, unlike a texture wrapped on a sphere)
    var moonTex = canvasTex(512, 512, paintMoon);
    var moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTex, color: useBloom ? 0xcfc4a4 : 0xffffff, transparent: true }));
    moon.scale.set(16, 16, 1);
    moon.position.set(0, 26, -110);
    scene.add(moon);
    var moonGlow = sprite(moonGlowTex, 0xffffff, 64, useBloom ? 0.55 : 0.9);
    scene.add(moonGlow);
    var moonHalo = sprite(softTex, 0xb79cff, 120, 0.12);
    scene.add(moonHalo);

    // clouds (puffy cartoon, rim-lit by moon)
    var cloudMat = toon(0x7b63c4, { transparent: true, opacity: 0.93, emissive: 0x2a1858 });
    var clouds = [];
    [[-34, 30, -100, 1.3], [32, 37, -105, 1], [-14, 42, -120, 0.8], [48, 22, -95, 0.9], [-58, 20, -98, 1.1]].forEach(function (cfg) {
      var parts = [];
      for (var j = 0; j < 6; j++) {
        parts.push({ geo: new THREE.SphereGeometry(1, 16, 12), color: 0xffffff,
          m: M((j - 2.5) * 2.9, Math.sin(j * 1.7) * 1.1 + (j === 2 || j === 3 ? 1.2 : 0), 0, null, (2.5 + (j % 2) * 1.5), (2.5 + (j % 2) * 1.5) * 0.78, 2.2) });
      }
      var cl = new THREE.Mesh(merge(parts), cloudMat);
      cl.position.set(cfg[0], cfg[1], cfg[2]); cl.scale.setScalar(cfg[3]);
      cl.userData.base = cfg[0]; cl.userData.ph = R() * 6;
      scene.add(cl); clouds.push(cl);
    });

    // far shore: hills, trees, chedi, village lights
    var silhouette = new THREE.MeshBasicMaterial({ color: 0x1e0f3d });
    var silhouette2 = new THREE.MeshBasicMaterial({ color: 0x2b1552 });
    for (var h = 0; h < 9; h++) {
      var hill = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), h % 2 ? silhouette : silhouette2);
      hill.scale.set(14 + R() * 10, 3 + R() * 4, 6);
      hill.position.set(-80 + h * 20, -0.5, -78 - (h % 2) * 6);
      scene.add(hill);
    }
    var treeParts = [];
    for (var tr = 0; tr < 44; tr++) {
      var tx = -75 + R() * 150;
      if (Math.abs(tx + 22) < 6) continue;
      var ts = 1.4 + R() * 1.8;
      if (tr % 4 === 0) { // round tree
        treeParts.push({ geo: new THREE.SphereGeometry(1, 10, 8), color: 0x180c33, m: M(tx, 2.4 * ts, -66 - R() * 6, null, ts * 1.3) });
        treeParts.push({ geo: new THREE.CylinderGeometry(0.2, 0.3, 2.4, 6), color: 0x140a2b, m: M(tx, 1.1 * ts, -66, null, ts) });
      } else {
        treeParts.push({ geo: new THREE.ConeGeometry(1, 3, 7), color: 0x170b30, m: M(tx, 1.4 * ts, -66 - R() * 6, null, ts) });
      }
    }
    scene.add(new THREE.Mesh(merge(treeParts), new THREE.MeshBasicMaterial({ vertexColors: true })));

    var chediProfile = [[0, 0], [3.4, 0], [3.4, 0.8], [2.8, 0.8], [2.8, 1.6], [2.4, 1.6], [2.6, 3.4], [2.2, 4.6], [1.2, 5.4], [1.3, 5.9], [0.7, 6.1], [0.55, 8.5], [0.25, 10.5], [0.05, 12.2], [0, 12.4]]
      .map(function (p) { return new THREE.Vector2(p[0], p[1]); });
    var chedi = new THREE.Mesh(new THREE.LatheGeometry(chediProfile, 32), toon(0x9c6a2a, { emissive: 0x2a1206 }));
    chedi.position.set(-22, 0, -70); chedi.scale.setScalar(1.15);
    withOutline(chedi);
    scene.add(chedi);
    var chediGlow = sprite(softTex, 0xffc46b, 30, 0.16); chediGlow.position.set(-22, 6, -71); scene.add(chediGlow);

    // village lights along the far bank: one point system (was one sprite each = one draw call each)
    var VL = Q.village, vlPos = new Float32Array(VL * 3), vlCol = new Float32Array(VL * 3), vlPh = new Float32Array(VL);
    for (var v = 0; v < VL; v++) {
      vlPos[v * 3] = -78 + R() * 156; vlPos[v * 3 + 1] = 0.4 + R() * 1.4; vlPos[v * 3 + 2] = -64 - R() * 4;
      vlPh[v] = R() * 6;
    }
    var vlGeo = new THREE.BufferGeometry();
    vlGeo.setAttribute('position', new THREE.BufferAttribute(vlPos, 3));
    vlGeo.setAttribute('color', new THREE.BufferAttribute(vlCol, 3));
    scene.add(new THREE.Points(vlGeo, new THREE.PointsMaterial({ size: 1.35, map: flameTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
    var VL_R = 1, VL_G = 0.82, VL_B = 0.54;

    // ---- "อาคาร ๒๐ ปี" — cartoon version of the company building on the far shore, logo sign on the roof
    var building = new THREE.Group();
    (function buildBuilding() {
      var W = 12, D = 7, Y0 = 6, Y1 = 15;   // upper facade box spans y 6..15
      var facadeTex = canvasTex(1024, 768, drawFacade);
      function drawFacade(ctx) {
        ctx.fillStyle = '#8a6a4e'; ctx.fillRect(0, 0, 1024, 768);
        for (var x = 0; x < 1024; x += 9) { ctx.fillStyle = x % 18 ? 'rgba(0,0,0,.13)' : 'rgba(255,255,255,.05)'; ctx.fillRect(x, 0, 3, 768); }
        // cream ribbon shape
        var cg = ctx.createLinearGradient(80, 200, 530, 700);
        cg.addColorStop(0, '#f0dcb2'); cg.addColorStop(1, '#d9bd8c');
        ctx.fillStyle = cg;
        ctx.beginPath();
        ctx.moveTo(150, 215);
        ctx.bezierCurveTo(300, 200, 480, 205, 520, 330);
        ctx.lineTo(530, 560);
        ctx.bezierCurveTo(530, 640, 505, 680, 492, 712);
        ctx.bezierCurveTo(450, 640, 390, 600, 300, 592);
        ctx.bezierCurveTo(150, 585, 70, 520, 78, 420);
        ctx.bezierCurveTo(84, 320, 120, 250, 150, 215);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(150,115,70,.35)'; ctx.lineWidth = 2;
        for (var px = 160; px < 520; px += 90) { ctx.beginPath(); ctx.moveTo(px, 220); ctx.lineTo(px, 600); ctx.stroke(); }
        // teal leaf
        var tg = ctx.createLinearGradient(580, 300, 810, 610);
        tg.addColorStop(0, '#5cc9ae'); tg.addColorStop(1, '#2f9a82');
        ctx.fillStyle = tg;
        ctx.beginPath();
        ctx.moveTo(575, 615);
        ctx.bezierCurveTo(560, 520, 570, 400, 640, 375);
        ctx.bezierCurveTo(700, 358, 780, 352, 812, 300);
        ctx.bezierCurveTo(822, 420, 802, 520, 760, 560);
        ctx.bezierCurveTo(700, 600, 620, 590, 575, 615);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(220,255,245,.5)'; ctx.lineWidth = 4; ctx.stroke();
        // small vent panel
        ctx.fillStyle = '#c9c4c8'; ctx.fillRect(235, 135, 60, 58);
        // building name + subtitle + golden numerals
        ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = '#f4f1fa'; ctx.font = '600 66px Mitr, "Noto Sans Thai", sans-serif';
        ctx.fillText('อาคาร ๒๐ ปี', 950, 118);
        ctx.fillStyle = '#3d55c4';
        var sub = 'ศูนย์วิจัยทางการแพทย์อาชีวเวชศาสตร์ไทย', fs = 30;
        ctx.font = '500 ' + fs + 'px Mitr, "Noto Sans Thai", sans-serif';
        var mw = ctx.measureText(sub).width;
        if (mw > 450) { fs = Math.floor(fs * 450 / mw); ctx.font = '500 ' + fs + 'px Mitr, "Noto Sans Thai", sans-serif'; }
        ctx.fillText(sub, 950, 160);
        ctx.textAlign = 'left';
        ctx.font = '600 56px Mitr, "Noto Sans Thai", sans-serif';
        ctx.lineWidth = 5; ctx.strokeStyle = '#7a5418'; ctx.strokeText('๑๑๕', 412, 735);
        ctx.fillStyle = '#e8b54a'; ctx.fillText('๑๑๕', 412, 735);
        // warm uplight wash from the bottom
        var ug = ctx.createLinearGradient(0, 768, 0, 300);
        ug.addColorStop(0, 'rgba(255,190,120,.28)'); ug.addColorStop(1, 'rgba(255,190,120,0)');
        ctx.fillStyle = ug; ctx.fillRect(0, 0, 1024, 768);
      }
      // redraw once the Thai web font has loaded so the sign text uses Mitr
      try {
        if (document.fonts && document.fonts.load) {
          Promise.all([document.fonts.load('600 66px Mitr'), document.fonts.load('500 30px Mitr')]).then(function () {
            drawFacade(facadeTex.image.getContext('2d')); facadeTex.needsUpdate = true;
          }).catch(function () {});
        }
      } catch (e) { /* ignore */ }

      var lobbyTex = canvasTex(512, 256, function (ctx) {
        var lg = ctx.createLinearGradient(0, 256, 0, 0);
        lg.addColorStop(0, '#f0c27a'); lg.addColorStop(1, '#b97c44');
        ctx.fillStyle = lg; ctx.fillRect(0, 0, 512, 256);
        ctx.fillStyle = 'rgba(255,236,190,.55)';
        for (var i = 0; i < 6; i++) ctx.fillRect(40 + i * 80, 20, 30, 10);                // ceiling lights
        ctx.fillStyle = 'rgba(80,50,30,.55)';
        ctx.fillRect(60, 170, 90, 50); ctx.fillRect(300, 160, 140, 60);                    // furniture silhouettes
        ctx.fillStyle = 'rgba(60,40,30,.75)';
        for (var m = 0; m <= 512; m += 64) ctx.fillRect(m, 0, 5, 256);                     // mullions
        ctx.fillRect(0, 118, 512, 5);
      });

      var cream = toon(0xd8c39a), brownSide = toon(0x6e5440), white = toon(0xe2deea), grey = toon(0x8d8f99), dark = toon(0x2c2433);
      function box(w, h, d, x, y, z, mat, outline) {
        var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        m.position.set(x, y, z);
        if (outline !== false) withOutline(m);
        building.add(m);
        return m;
      }
      // upper volume + facade
      box(W, Y1 - Y0, D, 0, (Y0 + Y1) / 2, 0, brownSide);
      var facade = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.4, Y1 - Y0 - 0.4),
        new THREE.MeshBasicMaterial({ map: facadeTex, color: 0xbcaec8 }));
      facade.position.set(0, (Y0 + Y1) / 2, D / 2 + 0.01);
      building.add(facade);
      // cream frame: roof slab, bottom ledge, side strips
      box(W + 0.6, 0.6, D + 0.6, 0, Y1 + 0.3, 0, cream);
      box(W + 0.8, 0.6, D + 1.2, 0, Y0 - 0.3, 0.3, cream);
      box(0.4, Y1 - Y0, 0.4, -W / 2, (Y0 + Y1) / 2, D / 2 + 0.05, cream, false);
      box(0.4, Y1 - Y0, 0.4, W / 2, (Y0 + Y1) / 2, D / 2 + 0.05, cream, false);
      // right side tower strip + grey canopy block
      box(1.4, 10, 5, W / 2 + 0.7, 8, -0.6, cream);
      box(6, 1.6, 5.4, W / 2 - 1.4, 4.4, 0.8, grey);
      // ground floor: lit lobby glass recessed behind white columns
      var lobby = new THREE.Mesh(new THREE.PlaneGeometry(W - 1.2, Y0 - 0.6), new THREE.MeshBasicMaterial({ map: lobbyTex, color: 0xe6c9a6 }));
      lobby.position.set(-0.6, (Y0 - 0.6) / 2, 1.2);
      building.add(lobby);
      box(W - 1.2, Y0 - 0.6, 2.2, -0.6, (Y0 - 0.6) / 2, 0, dark, false);
      // round columns, spaced as in the photo (the right one runs up behind the grey canopy)
      [-4.1, -0.5, 2.6].forEach(function (cx) {
        var col = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, Y0 - 0.6, 16), white);
        col.position.set(cx, (Y0 - 0.6) / 2, D / 2 - 0.2);
        withOutline(col);
        building.add(col);
      });
      // square pillar at the far right holding up the grey canopy
      box(0.8, 3.6, 0.8, W / 2 + 0.9, 1.8, 2.9, white);
      box(1.1, 0.25, 1.1, W / 2 + 0.9, 0.12, 2.9, cream, false);
      // planter + bushes in front
      box(W + 1, 0.7, 1.2, 0, 0.35, D / 2 + 1.2, dark);
      var bushParts = [];
      for (var b = 0; b < 9; b++) {
        bushParts.push({ geo: new THREE.IcosahedronGeometry(1, 1), color: b % 2 ? 0x2f7d3a : 0x3f9a4a,
          m: M(-W / 2 + 0.8 + b * 1.35, 1.0 + (b % 3) * 0.15, D / 2 + 1.2, null, 0.75, 0.6, 0.6) });
      }
      building.add(withOutline(new THREE.Mesh(merge(bushParts), toon(0xffffff, { vertexColors: true }))));
      // warm uplights at the base of the facade
      [-4, 0, 4].forEach(function (ux) {
        var u = sprite(softTex, 0xffc27a, 4.5, 0.35); u.position.set(ux, Y0 + 0.6, D / 2 + 0.4); building.add(u);
      });
      var lobbyGlow = sprite(softTex, 0xffc98a, 11, 0.22); lobbyGlow.position.set(-0.6, 2.6, D / 2 + 0.6); building.add(lobbyGlow);

      // ---- rooftop logo sign
      if (env.logoUrl) {
        var SW = 10.2, SH = SW * 333 / 900 + 0.6;
        [-3.2, 3.2].forEach(function (px) { box(0.25, 0.9, 0.25, px, Y1 + 1.05, 0.6, grey, false); });
        box(SW + 0.4, SH + 0.4, 0.3, 0, Y1 + 1.5 + SH / 2, 0.6, grey);
        var panel = new THREE.Mesh(new THREE.PlaneGeometry(SW, SH), new THREE.MeshBasicMaterial({ color: 0xcfc9dc }));
        panel.position.set(0, Y1 + 1.5 + SH / 2, 0.77);
        building.add(panel);
        var logoMat = new THREE.MeshBasicMaterial({ transparent: true, color: 0xdcd6e6, opacity: 0 });
        var logo = new THREE.Mesh(new THREE.PlaneGeometry(SW - 0.5, (SW - 0.5) * 333 / 900), logoMat);
        logo.position.set(0, Y1 + 1.5 + SH / 2, 0.79);
        building.add(logo);
        new THREE.TextureLoader().load(env.logoUrl, function (tex) {
          tex.encoding = THREE.sRGBEncoding;
          tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
          var img = tex.image, ratio = img && img.width ? img.height / img.width : 333 / 900;
          logo.scale.y = ratio / (333 / 900);
          logoMat.map = tex; logoMat.opacity = 1; logoMat.needsUpdate = true;
        }, undefined, function () { /* logo missing: keep the plain lit panel */ });
        var signGlow = sprite(softTex, 0xfff4dd, 16, 0.2);
        signGlow.position.set(0, Y1 + 1.5 + SH / 2, 0.2);
        building.add(signGlow);
      }
    })();
    scene.add(building);

    // water
    var MAXL = Q.lights;
    var lightArr = []; for (var li0 = 0; li0 < MAXL; li0++) lightArr.push(new THREE.Vector3(0, -100, 9999));
    var waterMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uCam: { value: camera.position }, uMoonX: { value: 0 }, uFlash: { value: 0 },
        uDeep: { value: new THREE.Color(0x110940) }, uShallow: { value: new THREE.Color(0x2f2a8a) },
        uHor: { value: new THREE.Color(0x6a3283) }, uSky: { value: new THREE.Color(0x7b3f94) },
        uMoon: { value: new THREE.Color(0xfff1c0) }, uFlashCol: { value: new THREE.Color(0xffffff) },
        uLights: { value: lightArr }
      },
      vertexShader: [
        'uniform float uTime; varying vec3 vW; varying float vH;',
        'float wave(vec2 p, float t){ return 0.12*sin(p.x*0.35+t*1.2)+0.08*sin(p.y*0.5+t*0.9)+0.05*sin((p.x+p.y)*0.8+t*1.7); }',
        'void main(){ vec4 w = modelMatrix * vec4(position,1.0); float h = wave(w.xz, uTime); w.y += h; vH = h; vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }'
      ].join('\n'),
      fragmentShader: [
        'uniform float uTime, uMoonX, uFlash; uniform vec3 uCam, uDeep, uShallow, uHor, uSky, uMoon, uFlashCol; uniform vec3 uLights[' + MAXL + '];',
        'varying vec3 vW; varying float vH;',
        'float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
        'void main(){',
        '  float band = floor((vH + 0.25) * 5.0) / 5.0;',
        '  vec3 col = mix(uDeep, uShallow, clamp(band * 1.6 + 0.15, 0.0, 1.0));',
        '  vec3 V = normalize(uCam - vW);',
        '  float fres = pow(1.0 - clamp(V.y, 0.0, 1.0), 4.0);',
        '  col = mix(col, uSky, fres * 0.6);',
        '  float tt = clamp((uCam.z - vW.z) / (uCam.z + 110.0), 0.0, 1.0);',
        '  float cx = uCam.x + (uMoonX - uCam.x) * tt;',
        '  float w = 1.1 + max(0.0, -vW.z) * 0.08;',
        '  float streak = exp(-pow((vW.x - cx) / w, 2.0)) * smoothstep(9.0, -8.0, vW.z);',
        '  float ripple = step(0.62, 0.5 + 0.5 * sin(vW.z * 1.6 + uTime * 2.2 + sin(vW.x * 1.7 + uTime) * 1.6));',
        '  col += uMoon * streak * (0.2 + ripple * 0.8) * 0.8;',
        '  float glit = step(0.972, hash(floor(vW.xz * vec2(5.0, 3.0)) + floor(uTime * 4.0)));',
        '  col += vec3(1.0, 0.97, 0.85) * glit * smoothstep(0.05, 0.5, streak) * 1.6;',
        '  col = mix(col, vec3(0.62, 0.62, 1.0), step(0.2, vH) * 0.3);',
        '  for (int i = 0; i < ' + MAXL + '; i++) { vec2 d = vW.xz - uLights[i].xz; float dd = dot(d, vec2(1.0, 0.35) * d); col += vec3(1.0, 0.55, 0.2) * 0.6 * exp(-dd * 0.45) * (0.6 + 0.4 * step(0.0, vH)); }',
        '  col += vec3(1.0, 0.6, 0.3) * smoothstep(-46.0, -62.0, vW.z) * 0.3 * (0.4 + 0.6 * ripple);',
        '  col += uFlashCol * uFlash * 0.3 * (0.5 + 0.5 * ripple);',
        '  float dist = length(vW.xz - uCam.xz);',
        '  col = mix(col, uHor, smoothstep(40.0, 82.0, dist));',
        '  float alpha = 1.0;', OUT,
        '}'
      ].join('\n')
    });
    var water = new THREE.Mesh(new THREE.PlaneGeometry(240, 170, Q.water[0], Q.water[1]), waterMat);
    water.rotation.x = -Math.PI / 2; water.position.z = -55;
    scene.add(water);

    function wave(x, z, t) {
      return 0.12 * Math.sin(x * 0.35 + t * 1.2) + 0.08 * Math.sin(z * 0.5 + t * 0.9) + 0.05 * Math.sin((x + z) * 0.8 + t * 1.7);
    }

    // mist drifting over the water
    var mists = [];
    for (var mi = 0; mi < Q.mist; mi++) {
      var ms = sprite(softTex, mi % 2 ? 0xd6b4ff : 0xffc6e8, 1, 0.07, true);
      ms.scale.set(34 + R() * 20, 6 + R() * 4, 1);
      ms.position.set(-50 + R() * 100, 1.2 + R(), -22 - R() * 36);
      ms.userData = { bx: ms.position.x, ph: R() * 6, sp: 0.04 + R() * 0.05 };
      scene.add(ms); mists.push(ms);
    }

    // ---- krathong
    var PETAL_GREENS = [0x3fae55, 0x6fd07a, 0x2f9447];
    var FLOWER_SETS = [
      [0xffa31a, 0xffc43d, 0xff7f2a],
      [0xff6f9e, 0xffa1c1, 0xfff0f5],
      [0xffffff, 0xffe38a, 0xc89bff],
      [0xff5a5a, 0xffb347, 0xfff3d6],
      [0xb388ff, 0xff8fd0, 0xffffff]
    ];
    var geoCache = {
      base: new THREE.CylinderGeometry(1, 1.06, 0.38, 28),
      band: new THREE.CylinderGeometry(1.1, 1.13, 0.26, 28),
      dome: new THREE.SphereGeometry(0.62, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2),
      candle: new THREE.CylinderGeometry(0.075, 0.08, 0.6, 12),
      flame: new THREE.ConeGeometry(0.07, 0.22, 10),
      coin: new THREE.CylinderGeometry(0.16, 0.16, 0.04, 20),
      shell: new THREE.SphereGeometry(0.85, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2)
    };
    function isCached(g) {
      if (typeof templateGeos !== 'undefined' && templateGeos.has(g)) return true;   // shared by krathong copies
      for (var key in geoCache) if (geoCache[key] === g) return true;
      return false;
    }
    var mats = {
      base: toon(0xe7d39a), band: toon(0x2f9447), candle: toon(0xfff6dc), dome: toon(0x4caf50),
      flame: new THREE.MeshBasicMaterial({ color: 0xfff2b0 }),
      coin: toon(0xffc93c, { emissive: 0x6a4000 }),
      coinVc: toon(0xffffff, { vertexColors: true, emissive: 0x6a4000 }),
      skin: toon(0xe3ad84),
      coconut: toon(0x7a4a2a, { side: THREE.DoubleSide }),
      vc: toon(0xffffff, { vertexColors: true })
    };

    // ---- krathong styles: each builds its body into g and returns where the candle and coins go
    function E(x, y, z, o) { return new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, o || 'XYZ')); }
    function S(r, w, h) { return new THREE.SphereGeometry(r || 1, w || 10, h || 8); }
    function domeFlowers(parts, set, rad, yOff, n, ys) {
      for (var f = 0; f < n; f++) {
        var phi = Math.acos(0.25 + R() * 0.7), the = R() * Math.PI * 2;
        var dir = new THREE.Vector3(Math.sin(phi) * Math.cos(the), Math.cos(phi) * (ys || 0.75), Math.sin(phi) * Math.sin(the)).multiplyScalar(rad);
        var rr = 0.11 + R() * 0.06;
        parts.push({ geo: new THREE.IcosahedronGeometry(1, 1), color: set[f % 3], m: M(dir.x, dir.y + yOff, dir.z, null, rr, rr * 0.8, rr) });
        parts.push({ geo: S(1, 6, 4), color: 0xfff4a0, m: M(dir.x * 1.08, dir.y * 1.08 + yOff + 0.02, dir.z * 1.08, null, rr * 0.35) });
      }
    }
    function incense(parts, x, y, z) {
      [-0.5, -0.3, -0.1].forEach(function (off, ii) {
        var q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), off * 0.4);
        parts.push({ geo: new THREE.CylinderGeometry(0.018, 0.018, 0.9, 5), color: 0x8a4b2a, m: M(x + ii * 0.06, y + 0.45, z, q) });
        parts.push({ geo: S(0.035, 6, 4), color: 0xff4b2b, m: M(x + ii * 0.06 - Math.sin(off * 0.4) * 0.45, y + 0.45 + Math.cos(off * 0.4) * 0.45, z) });
      });
    }
    function leafRing(parts, n, r, y, len, tilt, w, offset) {
      for (var k = 0; k < n; k++) {
        var a = (k / n) * Math.PI * 2 + (offset || 0);
        parts.push({ geo: new THREE.ConeGeometry(w, len, 4), color: PETAL_GREENS[k % 3],
          m: M(Math.cos(a) * r, y, Math.sin(a) * r, E(0, -a, -tilt, 'YXZ'), 1, 1, 0.55) });
      }
    }
    function addMerged(g, parts, outline) {
      var mesh = new THREE.Mesh(merge(parts), mats.vc);
      g.add(outline ? withOutline(mesh) : mesh);
      return mesh;
    }

    // Folded banana-leaf petal (กลีบใบตองพับ): a broad pointed leaf with a centre crease,
    // facing +z, base at the origin. Vertex colours run dark at the base to bright at the tip,
    // with darker edges and a light crease so it reads as a folded leaf in toon shading.
    function leafPetalGeo(w, h, fold, curl, cBase, cTip, cEdge) {
      return petalGeo({ w: w, h: h, fold: fold, curl: curl, base: cBase, tip: cTip, edge: cEdge, shape: 'leaf' });
    }
    // o: { w, h, fold (V crease), cup (U cup, edges curl inward), curl (tip bends out +/in -),
    //      base, tip, edge colours, shape: 'leaf' (wide base, pointed) | 'oval' (lotus petal / feather) }
    function petalGeo(o) {
      var COLS = 8, ROWS = 10, pos = [], col = [], idx = [];
      var ca = new THREE.Color(o.base), cb = new THREE.Color(o.tip), ce = new THREE.Color(o.edge), white = new THREE.Color(0xffffff), c = new THREE.Color();
      var w = o.w, h = o.h, fold = o.fold || 0, cup = o.cup || 0, curl = o.curl || 0;
      for (var j = 0; j <= ROWS; j++) {
        var v = j / ROWS;
        var hw = o.shape === 'oval'
          ? w * Math.max(0.32 * (1 - v), Math.pow(Math.sin(Math.PI * Math.pow(v, 0.72)), 0.75))
          : w * Math.pow(1 - v, 0.8) * (0.72 + 0.28 * Math.sin(Math.PI * Math.min(1, v * 1.7)));
        for (var i = 0; i <= COLS; i++) {
          var u = i / COLS * 2 - 1;
          pos.push(u * hw, v * h, -Math.abs(u) * hw * fold - u * u * hw * cup + curl * v * v * h);
          c.copy(ca).lerp(cb, Math.pow(v, o.shape === 'oval' ? 1.6 : 0.8)).lerp(ce, Math.pow(Math.abs(u), 3) * 0.65);
          if (fold && i === COLS / 2) c.lerp(white, 0.14);
          col.push(c.r, c.g, c.b);
        }
      }
      for (var jj = 0; jj < ROWS; jj++) {
        for (var ii = 0; ii < COLS; ii++) {
          var a0 = jj * (COLS + 1) + ii;
          idx.push(a0, a0 + 1, a0 + COLS + 1, a0 + 1, a0 + COLS + 2, a0 + COLS + 1);
        }
      }
      var geo = new THREE.BufferGeometry();
      geo.setIndex(idx);
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      geo.computeVertexNormals();
      return geo;
    }
    geoCache.petalOuter = leafPetalGeo(0.34, 0.8, 0.55, 0.16, 0x145c2a, 0x38a24f, 0x0d4220);
    geoCache.petalMid = leafPetalGeo(0.29, 0.66, 0.55, 0.12, 0x1a6b33, 0x4ab460, 0x114a24);
    geoCache.petalInner = leafPetalGeo(0.22, 0.4, 0.5, 0.08, 0x22793b, 0x5cc06f, 0x16562b);
    geoCache.scale = leafPetalGeo(0.21, 0.3, 0.4, 0.05, 0x1a6b33, 0x3f9f55, 0x0f4422);
    mats.leaf = toon(0xffffff, { vertexColors: true, side: THREE.DoubleSide });

    // ring of petals: facing outward, leaning out by `lean`; flip = hang downward (side scales)
    function petalRing(parts, geo, n, r, y, lean, offset, flip, h, curl, tips) {
      for (var k = 0; k < n; k++) {
        var a = (k / n) * Math.PI * 2 + (offset || 0);
        var q = E(lean, Math.PI / 2 - a, flip ? Math.PI : 0, 'YXZ');
        var base = new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
        parts.push({ geo: geo, color: null, m: new THREE.Matrix4().compose(base, q, new THREE.Vector3(1, 1, 1)) });
        if (tips) { // globe-amaranth bud pinned at each petal tip (ดอกบานไม่รู้โรย)
          var tip = new THREE.Vector3(0, h, curl * h + 0.03).applyQuaternion(q).add(base);
          tips.push({ geo: S(1, 8, 6), color: k % 2 ? 0xd81b60 : 0x8e24aa, m: M(tip.x, tip.y, tip.z, null, 0.055) });
        }
      }
    }

    // 1) classic banana-leaf krathong (กระทงใบตอง)
    function styleClassic(g, set) {
      g.add(withOutline(new THREE.Mesh(geoCache.base, mats.base)));
      var band = withOutline(new THREE.Mesh(geoCache.band, mats.band)); band.position.y = 0.02; g.add(band);

      var leaves = [], deco = [];
      // overlapping leaf scales wrapped around the trunk side (กลีบเกล็ด), two rows hanging down
      petalRing(leaves, geoCache.scale, 18, 1.15, 0.2, -0.12, 0, true);
      petalRing(leaves, geoCache.scale, 18, 1.16, 0.06, -0.16, Math.PI / 18, true);
      // three tiers of folded petals standing up from the rim
      petalRing(leaves, geoCache.petalOuter, 12, 1.0, 0.17, 0.38, 0, false, 0.8, 0.16, deco);
      petalRing(leaves, geoCache.petalMid, 12, 0.84, 0.2, 0.24, Math.PI / 12, false);
      petalRing(leaves, geoCache.petalInner, 10, 0.68, 0.22, 0.14, 0.2, false);
      g.add(new THREE.Mesh(merge(leaves), mats.leaf));

      for (var b = 0; b < 30; b++) { // gold bead trim along the rim
        var ba = (b / 30) * Math.PI * 2;
        deco.push({ geo: S(0.04, 6, 4), color: 0xffd54f, m: M(Math.cos(ba) * 1.12, 0.21, Math.sin(ba) * 1.12) });
      }
      addMerged(g, deco, false);

      var dome = withOutline(new THREE.Mesh(geoCache.dome, mats.dome)); dome.position.y = 0.18; dome.scale.y = 0.75; g.add(dome);
      var fl = [];
      domeFlowers(fl, set, 0.62, 0.2, 14);
      for (var gw = 0; gw < 18; gw++) {
        var ga = (gw / 18) * Math.PI * 2;
        fl.push({ geo: S(1, 6, 4), color: 0xfffaf0, m: M(Math.cos(ga) * 0.63, 0.22, Math.sin(ga) * 0.63, null, 0.06) });
      }
      incense(fl, 0.25, 0.45, -0.2);
      addMerged(g, fl, false);
      return { top: 0.65, cx: -0.08, cz: 0.05, coins: [[0, 0.28, 1.22, 0], [0.27, 0.25, 1.19, 0.3]] };
    }

    // shared petal shapes for the other styles
    geoCache.lotusOuterP = petalGeo({ w: 0.27, h: 0.74, cup: 0.65, curl: 0.12, base: 0xf6dde8, tip: 0xff4f93, edge: 0xff86b5, shape: 'oval' });
    geoCache.lotusMidP = petalGeo({ w: 0.24, h: 0.62, cup: 0.7, curl: 0.0, base: 0xf8e4ee, tip: 0xff6aa3, edge: 0xff9cc4, shape: 'oval' });
    geoCache.lotusInnerP = petalGeo({ w: 0.2, h: 0.46, cup: 0.75, curl: -0.18, base: 0xfaeaf2, tip: 0xff86b5, edge: 0xffb3d0, shape: 'oval' });
    geoCache.wlotusOuterP = petalGeo({ w: 0.27, h: 0.74, cup: 0.65, curl: 0.12, base: 0xe9e2ea, tip: 0xf2bcd3, edge: 0xe8c6d6, shape: 'oval' });
    geoCache.wlotusMidP = petalGeo({ w: 0.24, h: 0.62, cup: 0.7, curl: 0.0, base: 0xece6ee, tip: 0xf4c8da, edge: 0xebd0dd, shape: 'oval' });
    geoCache.wlotusInnerP = petalGeo({ w: 0.2, h: 0.46, cup: 0.75, curl: -0.18, base: 0xefe9f0, tip: 0xf6d2e1, edge: 0xeed8e3, shape: 'oval' });
    geoCache.feather = petalGeo({ w: 0.15, h: 0.62, cup: 0.35, curl: 0.18, base: 0xa9a1bf, tip: 0xcac3db, edge: 0x958cad, shape: "oval" });
    geoCache.shellScale = leafPetalGeo(0.25, 0.36, 0.35, 0.04, 0x1f6b2e, 0x8bc34a, 0x134a1f);

    // put one petal at `base`, facing outward at azimuth a, leaning out by `lean`
    function placePetal(parts, geo, base, a, lean, scale, flip) {
      var q = E(lean, Math.PI / 2 - a, flip ? Math.PI : 0, 'YXZ');
      parts.push({ geo: geo, color: null, m: new THREE.Matrix4().compose(base, q, new THREE.Vector3(scale || 1, scale || 1, scale || 1)) });
      return q;
    }

    // 2) lotus-flower krathong (กระทงดอกบัว) on a lotus leaf, with a bud
    function styleLotus(g, set, v) {
      var white = Math.floor(v / 6) % 2 === 1, pre = white ? 'wlotus' : 'lotus';
      var leaf = [], petals = [], p = [];
      // lotus leaf: two-tone pad with a notch, radial veins and a raised rim
      leaf.push({ geo: new THREE.CylinderGeometry(1.12, 1.14, 0.08, 36, 1, false, 0.25, Math.PI * 2 - 0.5), color: 0x1d7040, m: M(0, 0.01, 0) });
      leaf.push({ geo: new THREE.CylinderGeometry(0.75, 0.75, 0.08, 30, 1, false, 0.25, Math.PI * 2 - 0.5), color: 0x37995a, m: M(0, 0.02, 0) });
      leaf.push({ geo: new THREE.TorusGeometry(1.12, 0.035, 6, 40, Math.PI * 2 - 0.5), color: 0x145c33, m: M(0, 0.06, 0, E(Math.PI / 2, 0, Math.PI / 2 + 0.25)) });
      for (var vn = 0; vn < 12; vn++) {
        var va = Math.PI / 2 + 0.45 + vn / 11 * (Math.PI * 2 - 0.9);
        leaf.push({ geo: new THREE.BoxGeometry(1, 1, 1), color: 0x6cc08a, m: M(Math.cos(va) * 0.56, 0.066, Math.sin(va) * 0.56, E(0, -va, 0), 0.98, 0.01, 0.022) });
      }
      g.add(withOutline(new THREE.Mesh(merge(leaf), mats.vc)));

      // three tiers of cupped petals: outer open wide, inner closing in
      for (var k = 0; k < 9; k++) { var a = k / 9 * Math.PI * 2; placePetal(petals, geoCache[pre + 'OuterP'], new THREE.Vector3(Math.cos(a) * 0.3, 0.07, Math.sin(a) * 0.3), a, 0.95); }
      for (var k2 = 0; k2 < 8; k2++) { var a2 = k2 / 8 * Math.PI * 2 + 0.39; placePetal(petals, geoCache[pre + 'MidP'], new THREE.Vector3(Math.cos(a2) * 0.22, 0.11, Math.sin(a2) * 0.22), a2, 0.5); }
      for (var k3 = 0; k3 < 6; k3++) { var a3 = k3 / 6 * Math.PI * 2 + 0.2; placePetal(petals, geoCache[pre + 'InnerP'], new THREE.Vector3(Math.cos(a3) * 0.13, 0.15, Math.sin(a3) * 0.13), a3, 0.18); }
      // a closed bud at the edge of the leaf
      var bud = new THREE.Vector3(0.72, 0.05, -0.55);
      for (var b = 0; b < 5; b++) { var ab = b / 5 * Math.PI * 2; placePetal(petals, geoCache[pre + 'InnerP'], new THREE.Vector3(bud.x + Math.cos(ab) * 0.04, bud.y, bud.z + Math.sin(ab) * 0.04), ab, -0.12, 0.85); }
      g.add(new THREE.Mesh(merge(petals), mats.leaf));

      // seed pod with stamens
      p.push({ geo: new THREE.CylinderGeometry(0.17, 0.12, 0.13, 18), color: 0xc0ca33, m: M(0, 0.44, 0) });
      for (var sd = 0; sd < 7; sd++) {
        var sa = sd / 7 * Math.PI * 2;
        p.push({ geo: S(0.028, 6, 4), color: 0x827717, m: M(Math.cos(sa) * 0.1, 0.51, Math.sin(sa) * 0.1) });
      }
      for (var st = 0; st < 16; st++) {
        var ta = st / 16 * Math.PI * 2;
        p.push({ geo: new THREE.CylinderGeometry(0.008, 0.008, 0.16, 4), color: 0xffd54f, m: M(Math.cos(ta) * 0.19, 0.44, Math.sin(ta) * 0.19, E(Math.sin(ta) * 0.5, 0, -Math.cos(ta) * 0.5)) });
        p.push({ geo: S(0.022, 5, 4), color: 0xffb300, m: M(Math.cos(ta) * 0.23, 0.51, Math.sin(ta) * 0.23) });
      }
      incense(p, 0.18, 0.42, -0.1);
      addMerged(g, p, false);
      return { top: 0.5, cx: -0.04, cz: 0, coins: [[-0.45, 0.1, 1.0, -0.3], [0.45, 0.08, 1.0, 0.3]] };
    }

    // 3) eco bread krathong (กระทงขนมปัง): scalloped flower-shaped loaf with cream rosettes
    function styleBread(g, set) {
      var p = [], petals = [];
      var LOBES = 10;
      p.push({ geo: new THREE.CylinderGeometry(0.8, 0.84, 0.3, 30), color: 0xd99a45, m: M(0, 0.02, 0) });
      for (var l = 0; l < LOBES; l++) {
        var a = l / LOBES * Math.PI * 2;
        p.push({ geo: S(1, 16, 12), color: 0xc98535, m: M(Math.cos(a) * 0.82, 0.06, Math.sin(a) * 0.82, null, 0.33, 0.2, 0.33) });
        p.push({ geo: S(1, 12, 8), color: 0xe7b066, m: M(Math.cos(a) * 0.84, 0.14, Math.sin(a) * 0.84, null, 0.22, 0.08, 0.22) }); // shiny top of lobe
        // cream rosette on each lobe
        p.push({ geo: new THREE.TorusGeometry(0.075, 0.035, 6, 14), color: 0xfff3e6, m: M(Math.cos(a) * 0.84, 0.23, Math.sin(a) * 0.84, E(Math.PI / 2, 0, 0)) });
        p.push({ geo: S(1, 8, 6), color: l % 2 ? 0xff8fb8 : 0xffd166, m: M(Math.cos(a) * 0.84, 0.26, Math.sin(a) * 0.84, null, 0.05) });
      }
      p.push({ geo: new THREE.CylinderGeometry(0.66, 0.7, 0.05, 30), color: 0xf2cd8a, m: M(0, 0.18, 0) });   // glazed top
      for (var s = 0; s < 22; s++) {
        var sr = Math.sqrt(R()) * 0.6, sa = R() * Math.PI * 2;
        p.push({ geo: S(1, 5, 4), color: 0xfff6dc, m: M(Math.cos(sa) * sr, 0.21, Math.sin(sa) * sr, E(0, sa, 0), 0.022, 0.01, 0.04) });
      }
      // small flower garden on top
      var icing = [0xff6f9e, 0xffd166, 0x7bdff2, 0xb388ff, 0x95f985, 0xff9f43];
      for (var f = 0; f < 6; f++) {
        var fa = f / 6 * Math.PI * 2 + 0.3, fx = Math.cos(fa) * 0.42, fz = Math.sin(fa) * 0.42;
        for (var pp = 0; pp < 5; pp++) {
          var b = pp / 5 * Math.PI * 2;
          p.push({ geo: S(1, 8, 6), color: icing[f], m: M(fx + Math.cos(b) * 0.08, 0.24, fz + Math.sin(b) * 0.08, null, 0.065, 0.04, 0.065) });
        }
        p.push({ geo: S(1, 8, 6), color: 0xfff3b0, m: M(fx, 0.27, fz, null, 0.04) });
      }
      addMerged(g, p, true);
      // little ring of banana-leaf petals around the candle
      for (var k = 0; k < 8; k++) { var ka = k / 8 * Math.PI * 2; placePetal(petals, geoCache.petalInner, new THREE.Vector3(Math.cos(ka) * 0.2, 0.2, Math.sin(ka) * 0.2), ka, 0.35, 0.8); }
      g.add(new THREE.Mesh(merge(petals), mats.leaf));
      return { top: 0.22, cx: 0, cz: 0, coins: [[0, 0.3, 1.18, 0], [0.3, 0.27, 1.13, 0.3]] };
    }

    // 4) coconut-shell krathong (กระทงกะลามะพร้าว): shell bowl, folded leaf collar, flowers inside
    function styleCoconut(g, set) {
      var shell = withOutline(new THREE.Mesh(geoCache.shell, mats.coconut));
      shell.position.y = 0.32; shell.scale.y = 0.65; g.add(shell);
      var p = [], petals = [];
      p.push({ geo: new THREE.TorusGeometry(0.85, 0.055, 8, 36), color: 0x4a2a12, m: M(0, 0.32, 0, E(Math.PI / 2, 0, 0)) });
      for (var fb = 0; fb < 26; fb++) { // fibre streaks
        var fa = fb / 26 * Math.PI * 2, fy = 0.08 + (fb % 3) * 0.07;
        p.push({ geo: new THREE.BoxGeometry(1, 1, 1), color: fb % 2 ? 0xa5733f : 0x8a5a2e, m: M(Math.cos(fa) * 0.78, fy, Math.sin(fa) * 0.78, E(0, -fa, 0.45), 0.018, 0.22, 0.025) });
      }
      p.push({ geo: new THREE.SphereGeometry(0.74, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), color: 0x3d8b40, m: M(0, 0.28, 0, null, 1, 0.36, 1) });
      domeFlowers(p, set, 0.6, 0.28, 16, 0.45);
      incense(p, 0.2, 0.4, -0.15);
      addMerged(g, p, false);
      // folded banana-leaf collar over the rim + a few gold pins
      var deco = [];
      for (var k = 0; k < 10; k++) {
        var ka = k / 10 * Math.PI * 2;
        placePetal(petals, geoCache.petalMid, new THREE.Vector3(Math.cos(ka) * 0.8, 0.3, Math.sin(ka) * 0.8), ka, 0.5, 0.8);
        var tip = new THREE.Vector3(Math.cos(ka) * 1.07, 0.77, Math.sin(ka) * 1.07);
        deco.push({ geo: S(1, 8, 6), color: k % 2 ? 0xffd54f : 0xff7043, m: M(tip.x, tip.y, tip.z, null, 0.05) });
      }
      g.add(new THREE.Mesh(merge(petals), mats.leaf));
      addMerged(g, deco, false);
      return { top: 0.5, cx: -0.05, cz: 0.05, coins: [[0, 0.3, 0.95, 0], [0.28, 0.28, 0.9, 0.3]] };
    }

    // 5) swan krathong (กระทงหงส์): feathered wings & tail on a banana-leaf raft
    function styleSwan(g, set) {
      var raft = [], body = [], feathers = [];
      raft.push({ geo: new THREE.CylinderGeometry(1.05, 1.08, 0.1, 30), color: 0x2f9447, m: M(0, -0.01, 0) });
      raft.push({ geo: new THREE.TorusGeometry(1.06, 0.04, 6, 40), color: 0xffd54f, m: M(0, 0.05, 0, E(Math.PI / 2, 0, 0)) });
      g.add(withOutline(new THREE.Mesh(merge(raft), mats.vc)));
      var leaves = [];
      petalRing(leaves, geoCache.scale, 16, 1.1, 0.06, -0.5, 0, true);
      g.add(new THREE.Mesh(merge(leaves), mats.leaf));

      body.push({ geo: S(1, 24, 18), color: 0xbab3cd, m: M(0, 0.26, -0.05, null, 0.62, 0.38, 0.9) });
      var V3 = THREE.Vector3;
      var neck = new THREE.CatmullRomCurve3([new V3(0, 0.35, 0.55), new V3(0, 0.85, 0.92), new V3(0, 1.35, 0.85), new V3(0, 1.55, 0.6)]);
      body.push({ geo: new THREE.TubeGeometry(neck, 28, 0.095, 12, false), color: 0xbab3cd, m: M(0, 0, 0) });
      body.push({ geo: S(0.165, 18, 14), color: 0xbab3cd, m: M(0, 1.6, 0.6) });
      body.push({ geo: new THREE.ConeGeometry(0.055, 0.22, 10), color: 0xff8f00, m: M(0, 1.57, 0.81, E(Math.PI / 2, 0, 0)) });
      body.push({ geo: S(0.05, 8, 6), color: 0x2a1a30, m: M(0, 1.6, 0.73) });
      [-1, 1].forEach(function (s) {
        body.push({ geo: S(1, 10, 8), color: 0x1b1030, m: M(0.115 * s, 1.65, 0.66, null, 0.032, 0.042, 0.03) });
        body.push({ geo: S(1, 6, 4), color: 0xffffff, m: M(0.12 * s + 0.01, 1.665, 0.69, null, 0.01) });
        body.push({ geo: S(1, 8, 6), color: 0xff8fa3, m: M(0.135 * s, 1.56, 0.68, null, 0.04, 0.025, 0.02) });
      });
      // golden crown
      body.push({ geo: new THREE.CylinderGeometry(0.08, 0.09, 0.05, 12), color: 0xffc93c, m: M(0, 1.76, 0.57) });
      for (var cr = 0; cr < 5; cr++) {
        var ca = cr / 5 * Math.PI * 2;
        body.push({ geo: new THREE.ConeGeometry(0.025, 0.1, 6), color: 0xffd54f, m: M(Math.cos(ca) * 0.07, 1.83, 0.57 + Math.sin(ca) * 0.07) });
      }
      body.push({ geo: S(0.025, 6, 4), color: 0xff4f93, m: M(0, 1.8, 0.65) });
      // flowers nestled on the back
      for (var f = 0; f < 8; f++) {
        var fa = f / 8 * Math.PI * 2;
        body.push({ geo: new THREE.IcosahedronGeometry(1, 1), color: set[f % 3], m: M(Math.cos(fa) * 0.2, 0.62, -0.3 + Math.sin(fa) * 0.2, null, 0.085, 0.07, 0.085) });
      }
      g.add(withOutline(new THREE.Mesh(merge(body), mats.vc)));

      // wings: fanned feathers rising up and back on each side
      [-1, 1].forEach(function (s) {
        for (var i = 0; i < 6; i++) {
          var base = new THREE.Vector3(0.42 * s, 0.38, 0.22 - i * 0.15);
          var a = s > 0 ? -0.25 - i * 0.12 : Math.PI + 0.25 + i * 0.12;   // face outward, sweeping back
          placePetal(feathers, geoCache.feather, base, a, 0.35 + i * 0.07, 1.05 - i * 0.06);
        }
      });
      // tail fan
      for (var t = 0; t < 5; t++) {
        var ta = -Math.PI / 2 + (t - 2) * 0.28;
        placePetal(feathers, geoCache.feather, new THREE.Vector3(Math.cos(ta) * 0.1, 0.4, -0.78), ta, 0.6, 0.75);
      }
      g.add(new THREE.Mesh(merge(feathers), mats.leaf));
      return { top: 0.6, cx: 0, cz: -0.3, coins: [[0, 0.08, 1.12, 0], [0.32, 0.06, 1.07, 0.3]] };
    }

    // 6) turtle krathong (กระทงเต่า): shell tiled with banana-leaf scales, flower crown on top
    function styleTurtle(g, set) {
      var p = [], scales = [];
      var RX = 0.85, RY = 0.55, CY = 0.05;
      p.push({ geo: new THREE.SphereGeometry(0.84, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), color: 0x2e7d32, m: M(0, CY, 0, null, 1, RY / RX, 1) });
      p.push({ geo: new THREE.TorusGeometry(0.86, 0.075, 8, 36), color: 0xdce775, m: M(0, CY, 0, E(Math.PI / 2, 0, 0)) });
      // head, eyes, smile, legs, tail
      p.push({ geo: S(0.3, 20, 16), color: 0x9ccc65, m: M(0, 0.22, 1.02) });
      p.push({ geo: S(1, 14, 10), color: 0xc5e1a5, m: M(0, 0.12, 1.12, null, 0.2, 0.1, 0.16) });
      [-1, 1].forEach(function (s) {
        p.push({ geo: S(0.095, 12, 10), color: 0xffffff, m: M(0.12 * s, 0.36, 1.2) });
        p.push({ geo: S(0.055, 10, 8), color: 0x1b1030, m: M(0.12 * s, 0.37, 1.28) });
        p.push({ geo: S(0.018, 6, 4), color: 0xffffff, m: M(0.12 * s + 0.02, 0.395, 1.33) });
        p.push({ geo: S(1, 8, 6), color: 0xff8fa3, m: M(0.2 * s, 0.2, 1.2, null, 0.055, 0.03, 0.02) });
        [-1, 1].forEach(function (f) {
          p.push({ geo: S(1, 12, 8), color: 0x9ccc65, m: M(0.68 * s, 0.0, 0.55 * f, E(0, 0.6 * s * f, 0), 0.3, 0.1, 0.2) });
        });
      });
      p.push({ geo: new THREE.TorusGeometry(0.075, 0.02, 6, 14, Math.PI), color: 0x2e5d1a, m: M(0, 0.22, 1.3, E(0, 0, Math.PI)) });
      p.push({ geo: new THREE.ConeGeometry(0.07, 0.22, 8), color: 0x9ccc65, m: M(0, 0.04, -0.95, E(-Math.PI / 2, 0, 0)) });
      // flower crown around the candle
      for (var f = 0; f < 10; f++) {
        var a = f / 10 * Math.PI * 2, rr = 0.09 + (f % 2) * 0.02;
        p.push({ geo: new THREE.IcosahedronGeometry(1, 1), color: set[f % 3], m: M(Math.cos(a) * 0.24, CY + RY - 0.02, Math.sin(a) * 0.24, null, rr, rr * 0.8, rr) });
      }
      addMerged(g, p, true);

      // shell scales: rows of leaf scales lying on the dome, tips pointing down toward the rim
      [[0.42, 8], [0.72, 13], [1.0, 17], [1.28, 20]].forEach(function (row, ri) {
        var t = row[0];
        for (var k = 0; k < row[1]; k++) {
          var az = k / row[1] * Math.PI * 2 + ri * 0.2;
          var P = new THREE.Vector3(RX * Math.sin(t) * Math.cos(az), CY + RY * Math.cos(t), RX * Math.sin(t) * Math.sin(az));
          var N = new THREE.Vector3(Math.sin(t) * Math.cos(az) / RX, Math.cos(t) / RY, Math.sin(t) * Math.sin(az) / RX).normalize();
          var D = new THREE.Vector3(RX * Math.cos(t) * Math.cos(az), -RY * Math.sin(t), RX * Math.cos(t) * Math.sin(az)).normalize();
          P.addScaledVector(N, 0.02 + (3 - ri) * 0.012);
          var X = new THREE.Vector3().crossVectors(D, N);
          scales.push({ geo: geoCache.shellScale, color: null, m: new THREE.Matrix4().makeBasis(X, D, N).setPosition(P) });
        }
      });
      g.add(new THREE.Mesh(merge(scales), mats.leaf));
      return { top: CY + RY - 0.03, cx: 0, cz: 0, coins: [[0.52, 0.14, 0.78, 0.4], [-0.52, 0.14, 0.78, -0.4]] };
    }

    var STYLES = [styleClassic, styleLotus, styleBread, styleCoconut, styleSwan, styleTurtle];
    var DZ = global.LoyKrathongDesign || null;   // design.js: krathongs people made at the workshop table

    // a petal cut from the outline someone drew (points 0..1, y up), folded along its centre and curled out at the tip
    function cutLeafGeo(points, tone, size) {
      var W = 0.62 * size, H = 0.82 * size;
      var shape = new THREE.Shape(points.map(function (p) { return new THREE.Vector2((p[0] - 0.5) * W, p[1] * H); }));
      var geo = new THREE.ShapeGeometry(shape);
      var pos = geo.attributes.position, col = [];
      var ca = new THREE.Color(tone[0]), cb = new THREE.Color(tone[1]), ce = new THREE.Color(tone[2]), c = new THREE.Color();
      for (var i = 0; i < pos.count; i++) {
        var x = pos.getX(i), v = pos.getY(i) / H;
        pos.setZ(i, -Math.abs(x) * 0.35 + 0.14 * v * v * H);
        c.copy(ca).lerp(cb, Math.pow(Math.max(0, v), 0.8)).lerp(ce, Math.min(1, Math.abs(x) / (W / 2)) * 0.5);
        col.push(c.r, c.g, c.b);
      }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      geo.computeVertexNormals();
      return geo;
    }

    // cut face of a banana trunk: creamy sponge with rings of leaf sheaths
    var trunkTopMat = null;
    function trunkTop() {
      if (trunkTopMat) return trunkTopMat;
      var tex = canvasTex(256, 256, function (ctx) {
        ctx.fillStyle = '#efe8c6'; ctx.fillRect(0, 0, 256, 256);
        for (var r = 124; r > 10; r -= 13 + (r % 3) * 3) {
          ctx.strokeStyle = r > 100 ? 'rgba(90,140,60,.85)' : 'rgba(150,160,100,.5)'; ctx.lineWidth = r > 100 ? 5 : 2;
          ctx.beginPath(); ctx.arc(128, 128, r, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.fillStyle = 'rgba(170,160,110,.35)';
        for (var i = 0; i < 260; i++) { var a = (i * 2.4) % 6.28, rr = (i * 37) % 118; ctx.beginPath(); ctx.arc(128 + Math.cos(a) * rr, 128 + Math.sin(a) * rr, 1.6, 0, 6.28); ctx.fill(); }
      });
      trunkTopMat = toon(0xffffff, { map: tex });
      return trunkTopMat;
    }
    var trunkSideMat = toon(0xb9c77a);
    function trunkGeo(h) { return new THREE.CylinderGeometry(1, 1.04, h, 28); }

    // 7) cut-your-own krathong: a slice of banana trunk as tall as you cut it, petals in the shape you drew
    function styleCustom(g, set, d) {
      var tone = DZ.LEAF_TONES[d.leafColor] || DZ.LEAF_TONES[0];
      var pts = d.leaf || DZ.PRESET_LEAVES[0].points;
      var h = d.trunk, bottom = -0.19, top = bottom + h;
      var base = withOutline(new THREE.Mesh(trunkGeo(h), [trunkSideMat, trunkTop(), trunkTop()]));
      base.position.y = bottom + h / 2; g.add(base);
      var band = withOutline(new THREE.Mesh(geoCache.band, mats.band)); band.position.y = top - 0.17; g.add(band);
      var n = d.petals, big = cutLeafGeo(pts, tone, 1), small = cutLeafGeo(pts, tone, 0.7), leaves = [];
      petalRing(leaves, big, n, 1.0, top - 0.02, 0.42, 0, false);
      petalRing(leaves, small, Math.max(4, n - 2), 0.78, top + 0.01, 0.22, Math.PI / n, false);
      g.add(new THREE.Mesh(merge(leaves), mats.leaf));
      big.dispose(); small.dispose();
      var dome = withOutline(new THREE.Mesh(geoCache.dome, mats.dome)); dome.position.y = top - 0.01; dome.scale.y = 0.75; g.add(dome);
      return { top: top + 0.46, cx: 0, cz: 0, coins: [[0, top + 0.09, 1.22, 0], [0.27, top + 0.06, 1.19, 0.3]] };
    }

    // ---- things people stick on their krathong; each builds parts around its own base point (0,0,0)
    var ITEM_PARTS = [
      function candle(p) {   // extra candles: wax + a static little flame (the main candle is animated)
        p.push({ geo: geoCache.candle, color: 0xfff6dc, m: M(0, 0.3, 0) });
        p.push({ geo: geoCache.flame, color: 0xffe08a, m: M(0, 0.71, 0) });
      },
      function incense(p) { [-1, 0, 1].forEach(function (s) {
        p.push({ geo: new THREE.CylinderGeometry(0.018, 0.018, 0.9, 5), color: 0x8a4b2a, m: M(s * 0.05, 0.45, 0, E(0, 0, s * 0.12)) });
        p.push({ geo: S(0.035, 6, 4), color: 0xff4b2b, m: M(s * 0.05 - s * 0.055, 0.9, 0) });
      }); },
      function marigold(p) {
        p.push({ geo: new THREE.IcosahedronGeometry(1, 1), color: 0xffa31a, m: M(0, 0.13, 0, null, 0.17, 0.13, 0.17) });
        p.push({ geo: new THREE.IcosahedronGeometry(1, 1), color: 0xffc43d, m: M(0, 0.2, 0, null, 0.11, 0.08, 0.11) });
      },
      function rose(p) {
        p.push({ geo: S(1, 12, 10), color: 0xd81b3c, m: M(0, 0.13, 0, null, 0.15, 0.13, 0.15) });
        p.push({ geo: new THREE.TorusGeometry(0.1, 0.045, 6, 14), color: 0xff3b5c, m: M(0, 0.2, 0, E(Math.PI / 2, 0, 0)) });
        p.push({ geo: S(0.06, 8, 6), color: 0xa3122e, m: M(0, 0.24, 0) });
      },
      function jasmine(p) { for (var i = 0; i < 6; i++) { var a = i / 6 * 6.28;
        p.push({ geo: S(0.055, 8, 6), color: 0xffffff, m: M(Math.cos(a) * 0.09, 0.06 + (i % 2) * 0.05, Math.sin(a) * 0.09) }); }
        p.push({ geo: S(0.05, 8, 6), color: 0xfff6c8, m: M(0, 0.12, 0) });
      },
      function amaranth(p) { [[-0.08, 0.05], [0.08, -0.03], [0, 0.09]].forEach(function (o, i) {
        p.push({ geo: new THREE.CylinderGeometry(0.012, 0.012, 0.25, 4), color: 0x3f8a3a, m: M(o[0], 0.12, o[1]) });
        p.push({ geo: S(0.07, 10, 8), color: i % 2 ? 0x8e24aa : 0xd81b60, m: M(o[0], 0.27, o[1]) });
      }); },
      function bud(p) {
        p.push({ geo: S(1, 14, 10), color: 0xff86b5, m: M(0, 0.25, 0, null, 0.12, 0.24, 0.12) });
        p.push({ geo: new THREE.ConeGeometry(0.06, 0.14, 10), color: 0xff4f93, m: M(0, 0.52, 0) });
        p.push({ geo: new THREE.CylinderGeometry(0.1, 0.06, 0.08, 10), color: 0x3f8a3a, m: M(0, 0.04, 0) });
      },
      function coin(p) { p.push({ geo: geoCache.coin, color: 0xffc93c, m: M(0, 0.15, 0, E(Math.PI / 2 - 0.35, 0, 0)) }); },
      function duck(p) {
        p.push({ geo: S(1, 16, 12), color: 0xffd600, m: M(0, 0.15, 0, null, 0.2, 0.15, 0.25) });
        p.push({ geo: S(0.13, 14, 10), color: 0xffd600, m: M(0, 0.35, 0.13) });
        p.push({ geo: new THREE.ConeGeometry(0.05, 0.12, 8), color: 0xff7a00, m: M(0, 0.33, 0.28, E(Math.PI / 2, 0, 0)) });
        [-1, 1].forEach(function (s) { p.push({ geo: S(0.025, 6, 4), color: 0x1b1030, m: M(0.06 * s, 0.4, 0.23) }); });
      },
      function egg(p) {
        p.push({ geo: S(1, 16, 8), color: 0xfffaf0, m: M(0, 0.03, 0, null, 0.3, 0.035, 0.26) });
        p.push({ geo: S(1, 12, 8), color: 0xffb300, m: M(0.02, 0.08, 0, null, 0.1, 0.07, 0.1) });
      },
      function hat(p) {
        p.push({ geo: new THREE.ConeGeometry(0.17, 0.45, 14), color: 0xff4f93, m: M(0, 0.24, 0) });
        p.push({ geo: new THREE.TorusGeometry(0.15, 0.03, 6, 16), color: 0xffe14d, m: M(0, 0.05, 0, E(Math.PI / 2, 0, 0)) });
        p.push({ geo: S(0.06, 8, 6), color: 0x7bdff2, m: M(0, 0.48, 0) });
      },
      function heart(p) {
        p.push({ geo: S(0.12, 12, 10), color: 0xff3b6b, m: M(-0.085, 0.42, 0) });
        p.push({ geo: S(0.12, 12, 10), color: 0xff3b6b, m: M(0.085, 0.42, 0) });
        p.push({ geo: new THREE.ConeGeometry(0.17, 0.26, 14), color: 0xff3b6b, m: M(0, 0.26, 0, E(Math.PI, 0, 0)) });
        p.push({ geo: new THREE.CylinderGeometry(0.012, 0.012, 0.2, 4), color: 0x3f8a3a, m: M(0, 0.1, 0) });
      }
    ];
    var INK = DZ ? DZ.INK : ['#1b1030'];

    function itemMatrix(it) { return M(it.p[0], it.p[1], it.p[2], E(0, it.r, 0), it.s); }

    // a drawing as a paper sticker on a stick: strokes on a transparent canvas with a white cut-out border
    function doodleMesh(doodle, s) {
      var tex = canvasTex(256, 256, function (ctx) {
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        [true, false].forEach(function (border) {
          doodle.s.forEach(function (st) {
            ctx.strokeStyle = border ? '#ffffff' : INK[st.c] || INK[0];
            ctx.fillStyle = ctx.strokeStyle;
            var w = 5 + st.w * 5 + (border ? 14 : 0);
            if (st.p.length === 1) { ctx.beginPath(); ctx.arc(st.p[0][0] * 216 + 20, st.p[0][1] * 216 + 20, w / 2, 0, 6.28); ctx.fill(); return; }
            ctx.lineWidth = w; ctx.beginPath();
            st.p.forEach(function (q, i) { var x = q[0] * 216 + 20, y = q[1] * 216 + 20; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
            ctx.stroke();
          });
        });
      });
      var mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide });
      var mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), mat);
      mesh.position.y = 0.62; mesh.userData.ownMap = true;
      var grp = new THREE.Group(); grp.add(mesh);
      var stick = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.25, 4), mats.candle); stick.position.y = 0.12; grp.add(stick);
      return grp;
    }

    // the person's photo as a polaroid that always faces the camera
    function photoSprite(url) {
      var mat = new THREE.SpriteMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
      var s = new THREE.Sprite(mat);
      s.scale.set(0.8, 0.8 * 190 / 160, 1);
      s.position.y = 0.5;
      s.userData.ownMap = true;
      new THREE.TextureLoader().load(url, function (tex) {
        if (!s.parent) { tex.dispose(); return; }
        tex.encoding = THREE.sRGBEncoding;
        mat.map = tex; mat.opacity = 1; mat.needsUpdate = true;
      }, undefined, function () { /* photo blocked: no polaroid */ });
      return s;
    }

    // items: merged into one mesh on the river (cheap); one pickable group per item at the workshop table
    function addItems(g, d, photo, separate) {
      var merged = [];
      d.items.forEach(function (it, idx) {
        var holder = null;
        if (separate) { holder = new THREE.Group(); holder.userData.itemIndex = idx; holder.matrixAutoUpdate = true; }
        var special = null;
        if (it.k === DZ.ITEM.photo) { if (!photo || env.photos === false) return; special = photoSprite(photo); }
        else if (it.k === DZ.ITEM.doodle) { var dd = d.doodles[it.d]; if (!dd) return; special = doodleMesh(dd); }
        if (special) {
          var wrap = holder || new THREE.Group();
          wrap.position.set(it.p[0], it.p[1], it.p[2]); wrap.rotation.y = it.r; wrap.scale.setScalar(it.s);
          wrap.add(special);
          g.add(wrap);
          return;
        }
        var parts = [], build = ITEM_PARTS[it.k];
        if (!build) return;
        build(parts);
        if (separate) {
          holder.position.set(it.p[0], it.p[1], it.p[2]); holder.rotation.y = it.r; holder.scale.setScalar(it.s);
          addMerged(holder, parts, true);
          if (it.k === DZ.ITEM.candle) { var fl = sprite(flameTex, 0xffffff, 0.7, 1); fl.position.y = 0.74; holder.add(fl); }
          g.add(holder);
        } else {
          var im = itemMatrix(it);
          parts.forEach(function (q) { q.m = im.clone().multiply(q.m); merged.push(q); });
          if (it.k === DZ.ITEM.candle) {
            var fs = sprite(flameTex, 0xffffff, 0.7 * it.s, 1);
            fs.position.set(0, 0.74, 0).applyMatrix4(im); g.add(fs);
          }
        }
      });
      if (merged.length) addMerged(g, merged, true);
    }

    // Building a krathong merges ~100 small parts - too slow to do every time a random one spawns.
    // Each random look (style x flower colours, 30 in all) is built once as a template and then copied;
    // copies share geometry, so spawning is cheap and the shared buffers are never disposed.
    // Krathongs people made (look with a design or photo) are built for themselves.
    var krathongTemplates = {}, templateGeos = new Set();
    function templateFor(key) {
      var tpl = krathongTemplates[key];
      if (!tpl) {
        tpl = krathongTemplates[key] = buildKrathong(key, null, null);
        tpl.traverse(function (o) { if (o.geometry) templateGeos.add(o.geometry); });
      }
      return tpl;
    }
    function prewarmKrathongs() {   // build the remaining random looks a few at a time while the browser is idle
      var keys = [];
      for (var kk = 0; kk < 30; kk++) if (!krathongTemplates[kk]) keys.push(kk);
      var step = function (deadline) {
        if (!running) return;
        while (keys.length && (!deadline || deadline.timeRemaining() > 6)) {
          templateFor(keys.shift());
          if (!deadline) break;
        }
        if (keys.length) schedule();
      };
      var schedule = function () { if (global.requestIdleCallback) global.requestIdleCallback(step, { timeout: 1500 }); else setTimeout(step, 120); };
      schedule();
    }
    // look = { design?, photo? (URL or data URL) } from the workshop or another person's wish
    // o.separateItems: one pickable group per item (workshop table)
    function makeKrathong(variant, look, o) {
      var custom = !!(look && (look.design || look.photo));
      var g = custom || (o && o.separateItems) ? buildKrathong(variant, look, o) : templateFor(variant % 30).clone(true);
      var d = custom && look.design && DZ ? DZ.sanitize(look.design) : null;
      var ud = { robbed: false, claimed: null, ph: R() * 10, spin: (R() - 0.5) * 0.25,
        vx: (R() - 0.5) * 0.15, vz: -(0.35 + R() * 0.35), pop: 1, scale: 1, style: d ? Math.min(d.base, STYLES.length - 1) : variant % STYLES.length };
      g.traverse(function (c) {
        if (c.isSprite && !c.userData.ownMap && !custom) c.material = c.material.clone();   // each flame flickers on its own
        if (c.name === 'flame') ud.flame = c;
        else if (c.name === 'core') ud.core = c;
        else if (c.name === 'halo') ud.halo = c;
        else if (c.name === 'coins') ud.coin = c;
      });
      g.userData = ud;
      return g;
    }
    function buildKrathong(variant, look, o) {
      var g = new THREE.Group();
      var d = look && look.design && DZ ? DZ.sanitize(look.design) : null;
      var set = d ? FLOWER_SETS[d.flowers] : variant === 0 ? FLOWER_SETS[0] : FLOWER_SETS[Math.floor(variant / 6) % FLOWER_SETS.length];
      var cfg = d ? (d.base === DZ.CUSTOM_BASE ? styleCustom(g, set, d) : STYLES[d.base](g, set, d.flowers)) : STYLES[variant % STYLES.length](g, set, variant);
      if (d) addItems(g, d, look.photo || null, !!(o && o.separateItems));
      var cx = cfg.cx, cz = cfg.cz, top = cfg.top;

      var candle = withOutline(new THREE.Mesh(geoCache.candle, mats.candle)); candle.position.set(cx, top + 0.3, cz); g.add(candle);
      var flameCore = new THREE.Mesh(geoCache.flame, mats.flame); flameCore.name = 'core'; flameCore.position.set(cx, top + 0.71, cz); g.add(flameCore);
      var flame = sprite(flameTex, 0xffffff, 1.1, 1); flame.name = 'flame'; flame.position.set(cx, top + 0.73, cz); g.add(flame);
      var halo = sprite(softTex, 0xff9a3c, 3.4, 0.35); halo.name = 'halo'; halo.position.set(cx, top + 0.65, cz); g.add(halo);

      // coins resting on the rim - the kids swim over to collect them (one merged mesh, placed where they aim)
      var coins = new THREE.Group(); coins.name = 'coins';
      var c0 = cfg.coins[0], coinParts = [];
      coins.position.set(c0[0], c0[1], c0[2]);
      cfg.coins.forEach(function (c) {
        coinParts.push({ geo: geoCache.coin, color: 0xffc93c, m: M(c[0] - c0[0], c[1] - c0[1], c[2] - c0[2], E(Math.PI / 2 - 0.35, 0, c[3])) });
      });
      coins.add(withOutline(new THREE.Mesh(merge(coinParts), mats.coinVc)));
      g.add(coins);
      return g;
    }

    var krathongs = [];
    function addKrathong(x, z, scale, variant, pop, look) {
      if (variant == null) variant = 1 + Math.floor(R() * 60);
      var k = makeKrathong(variant, look);
      k.userData.variant = variant;
      k.position.set(x, 0, z);
      k.rotation.y = R() * 6.28;
      k.userData.scale = scale;
      k.userData.pop = pop ? 0 : 1;
      k.scale.setScalar(pop ? 0.001 : scale);
      scene.add(k); krathongs.push(k);
      return k;
    }
    // a bump (from the hippo-dog): spin, a wobble that settles, and a shove away from where it came from
    function bumpKrathong(k, fx, fz, power) {
      var d = k.userData, dx = k.position.x - fx, dz = k.position.z - fz, dl = Math.sqrt(dx * dx + dz * dz) || 1;
      d.pvx = (d.pvx || 0) + dx / dl * 2.6 * power; d.pvz = (d.pvz || 0) + dz / dl * 2.6 * power;
      d.bspin = (d.bspin || 0) + (R() < 0.5 ? -1 : 1) * (5 + R() * 4) * power;
      d.wob = Math.min(0.55, (d.wob || 0) + 0.45 * power); d.wobT = 0; d.wobAx = Math.atan2(dz, dx);
      ripple(k.position.x, k.position.z, 1.6);
    }
    function disposeKrathong(k) {
      scene.remove(k);
      var el = k.userData.labelEl;
      if (el && el.parentNode) el.parentNode.removeChild(el);
      k.traverse(function (o) {
        if (o.isMesh && o.material !== outlineMat && !isCached(o.geometry)) o.geometry.dispose();
        if (o.userData.ownMap && o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); }
        else if (o.isSprite) o.material.dispose();
      });
    }
    // the opening krathong (your selected one, if any) starts up front and drifts away downriver like the others;
    // changing your krathong restyles it only while it is still on its way
    var heroGone = false;
    function setHeroLook(look) {
      if (heroGone || krathongs.indexOf(hero) < 0) return;
      var old = hero, k = makeKrathong(0, look);
      k.userData.variant = 0; k.userData.hero = true; k.userData.scale = old.userData.scale; k.userData.pop = 1;
      k.userData.vz = old.userData.vz; k.userData.vx = old.userData.vx;
      k.position.copy(old.position); k.rotation.copy(old.rotation); k.scale.copy(old.scale);
      if (heroLight) { old.remove(heroLight); k.add(heroLight); }
      scene.add(k);
      krathongs[krathongs.indexOf(old)] = k;
      hero = k;
      disposeKrathong(old);
    }

    // a picture of a krathong for thumbnails (shelf, gallery): rendered off-screen, one at a time
    var snap = null;
    function snapshot(look) {
      if (!snap) {
        var ss = new THREE.Scene(); ss.background = new THREE.Color(0x3a2418);
        ss.add(new THREE.HemisphereLight(0xffe6c8, 0x3a2418, 0.95));
        var sl = new THREE.DirectionalLight(0xffd7a0, 0.8); sl.position.set(3, 8, 5); ss.add(sl);
        var sc = new THREE.PerspectiveCamera(36, 1, 0.1, 50); sc.position.set(0, 3.4, 5.6); sc.lookAt(0, 0.5, 0);
        var rt = new THREE.WebGLRenderTarget(256, 256); rt.texture.encoding = THREE.sRGBEncoding;
        snap = { scene: ss, cam: sc, rt: rt, queue: Promise.resolve() };
      }
      var job = snap.queue.then(function () {
        return new Promise(function (resolve) {
          if (!running) { resolve(null); return; }
          var k = makeKrathong(0, look, null); k.rotation.y = -0.5; snap.scene.add(k);
          setTimeout(function () {   // give a photo texture a moment to decode
            var url = null;
            try {
              renderer.setRenderTarget(snap.rt); renderer.render(snap.scene, snap.cam);
              var px = new Uint8Array(256 * 256 * 4);
              renderer.readRenderTargetPixels(snap.rt, 0, 0, 256, 256, px);
              var cv = document.createElement('canvas'); cv.width = cv.height = 256;
              var cx = cv.getContext('2d'), img = cx.createImageData(256, 256);
              for (var y = 0; y < 256; y++) img.data.set(px.subarray((255 - y) * 1024, (256 - y) * 1024), y * 1024);
              cx.putImageData(img, 0, 0);
              url = cv.toDataURL('image/jpeg', 0.85);
            } catch (e) { url = null; }
            renderer.setRenderTarget(null);
            snap.scene.remove(k); disposeKrathong(k);
            resolve(url);
          }, 160);
        });
      });
      snap.queue = job.catch(function () { return null; });
      return job;
    }

    // ---- โต๊ะทำกระทง: a second little scene (wooden table, lamp, banana trunk) drawn instead of the river
    // while someone builds their krathong. The krathong on the board is built by the same makeKrathong as
    // on the river, from the same design, so what you make is exactly what everyone sees.
    var table = (function () {
      var ts = new THREE.Scene();
      ts.background = new THREE.Color(0x2b1a12);
      ts.fog = new THREE.Fog(0x2b1a12, 14, 32);
      var cam = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
      ts.add(new THREE.HemisphereLight(0xffe6c8, 0x3a2418, 0.85));
      var lamp = new THREE.DirectionalLight(0xffd7a0, 0.85); lamp.position.set(3, 9, 5); ts.add(lamp);
      var fill = new THREE.DirectionalLight(0xb8c8ff, 0.25); fill.position.set(-6, 4, -3); ts.add(fill);

      function woodTex(base, line) {
        var t = canvasTex(512, 256, function (ctx, w, h) {
          ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
          for (var i = 0; i < 46; i++) {
            ctx.strokeStyle = line; ctx.globalAlpha = 0.12 + (i % 5) * 0.05; ctx.lineWidth = 1 + (i % 3);
            var y = (i * 37) % h;
            ctx.beginPath(); ctx.moveTo(0, y);
            for (var x = 0; x <= w; x += 32) ctx.lineTo(x, y + Math.sin(x * 0.02 + i) * 5);
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
          for (var p = 1; p < 4; p++) { ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(0, p * h / 4 - 1, w, 2); }   // planks
        });
        return t;
      }
      var desk = new THREE.Mesh(new THREE.BoxGeometry(16, 0.5, 10), toon(0xffffff, { map: woodTex('#8a5a34', '#4a2a14') }));
      desk.position.y = -0.46; ts.add(desk);
      var board = withOutline(new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.95, 0.12, 40), toon(0xffffff, { map: woodTex('#d9a86a', '#8a5a2a') })));
      board.position.y = -0.25; ts.add(board);

      // banana trunk lying at the back, with a cut face toward the camera's right
      var trunk = new THREE.Group();
      var tBody = withOutline(new THREE.Mesh(new THREE.CylinderGeometry(1, 1.04, 4.2, 28), [trunkSideMat, trunkTop(), trunkTop()]));
      tBody.rotation.z = Math.PI / 2; trunk.add(tBody);
      for (var st = 0; st < 9; st++) {   // darker sheath streaks along the trunk
        var sa = st / 9 * Math.PI * 2;
        var streak = new THREE.Mesh(new THREE.BoxGeometry(4.1, 0.05, 0.12), toon(0x7f9a4a));
        streak.position.set(0, Math.cos(sa) * 1.02, Math.sin(sa) * 1.02); streak.rotation.x = sa; trunk.add(streak);
      }
      trunk.position.set(0.6, 0.8, -6.5); ts.add(trunk);
      // knife: blade + handle, shown while cutting
      var knife = new THREE.Group();
      var blade = withOutline(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.9, 1.9), toon(0xdfe6ee)));
      blade.position.y = 0.45; knife.add(blade);
      var handle = withOutline(new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.32, 0.9), toon(0x5a3416)));
      handle.position.set(0, 0.75, 1.35); knife.add(handle);
      // where the knife will cut: a glowing ring around the trunk
      var cutRing = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.035, 6, 40), new THREE.MeshBasicMaterial({ color: 0xffe07a, depthTest: false, transparent: true }));
      cutRing.rotation.y = Math.PI / 2; cutRing.renderOrder = 11; cutRing.visible = false; ts.add(cutRing);
      knife.visible = false; ts.add(knife);
      // a slice that just got cut (animates from the trunk onto the board)
      var slice = null;
      // a few bowls of flowers and leaves around the board, just for the mood
      [[-3.4, 1.2, 0xffa31a], [3.5, 1.4, 0xff6f9e], [-3.2, -1.6, 0xffffff]].forEach(function (b) {
        var bowl = withOutline(new THREE.Mesh(geoCache.shell, toon(0x7a4a2a, { side: THREE.DoubleSide })));
        bowl.position.set(b[0], 0.35, b[1]); bowl.scale.set(0.8, 0.45, 0.8); ts.add(bowl);
        var fp = [];
        for (var f = 0; f < 9; f++) { var fa = f * 2.4, fr = (f % 3) * 0.2; fp.push({ geo: new THREE.IcosahedronGeometry(1, 1), color: f % 2 ? b[2] : 0xffe38a, m: M(b[0] + Math.cos(fa) * fr, 0.42, b[1] + Math.sin(fa) * fr, null, 0.16, 0.12, 0.16) }); }
        addMerged(ts, fp, false);
      });
      var lampGlow = sprite(softTex, 0xffc070, 9, 0.18); lampGlow.position.set(0, 6, -6); ts.add(lampGlow);
      var stage = new THREE.Group(); stage.position.y = -0.0; ts.add(stage);
      var ring = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.025, 6, 32), new THREE.MeshBasicMaterial({ color: 0xffe07a, transparent: true, opacity: 0.9, depthTest: false }));
      ring.rotation.x = Math.PI / 2; ring.renderOrder = 10; ring.visible = false; ts.add(ring);

      var st8 = { active: false, look: null, k: null, mode: 'build', tool: null, sel: -1, hooks: {}, spin: 0.35, yaw: -0.5, knifeX: 0.9, drag: null, t: 0 };
      var ray = new THREE.Raycaster(), ndc2 = new THREE.Vector2(), tmpV = new THREE.Vector3();

      function rebuild() {
        if (st8.k) { stage.remove(st8.k); disposeKrathong(st8.k); st8.k = null; }
        st8.k = makeKrathong(0, st8.look, { separateItems: true });
        stage.add(st8.k);
        updateRing();
      }
      function itemObj(i) {
        if (!st8.k) return null;
        for (var c = 0; c < st8.k.children.length; c++) if (st8.k.children[c].userData.itemIndex === i) return st8.k.children[c];
        return null;
      }
      function updateRing() {
        var o = st8.sel >= 0 ? itemObj(st8.sel) : null;
        ring.visible = !!o && st8.mode === 'build';
        if (o) { o.getWorldPosition(tmpV); ring.position.copy(tmpV); ring.position.y += 0.02; ring.scale.setScalar(Math.max(0.6, o.scale.x)); }
      }
      function setNdc(e) {
        var r = canvas.getBoundingClientRect();
        ndc2.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        ray.setFromCamera(ndc2, cam);
      }
      function realMesh(o) { return o.material !== outlineMat && o.visible; }
      // which item is under the pointer (its index), or -1
      function pickItem() {
        if (!st8.k) return -1;
        var hits = ray.intersectObject(st8.k, true);
        for (var i = 0; i < hits.length; i++) {
          var o = hits[i].object;
          if (!realMesh(o)) continue;
          for (var p = o; p && p !== st8.k; p = p.parent) if (p.userData.itemIndex != null) return p.userData.itemIndex;
          return -1;   // the krathong itself is in front
        }
        return -1;
      }
      // a point on the krathong body (not on items) in the krathong's own coordinates
      function pickSurface() {
        if (!st8.k) return null;
        var hits = ray.intersectObject(st8.k, true);
        for (var i = 0; i < hits.length; i++) {
          var o = hits[i].object, onItem = false;
          if (!realMesh(o) || o.isSprite) continue;
          for (var p = o; p && p !== st8.k; p = p.parent) if (p.userData.itemIndex != null) onItem = true;
          if (onItem) continue;
          return st8.k.worldToLocal(hits[i].point.clone());
        }
        return null;
      }
      function within(p) { return [Math.max(-2.9, Math.min(2.9, p.x)), Math.max(-0.9, Math.min(3.9, p.y)), Math.max(-2.9, Math.min(2.9, p.z))]; }

      function down(e) {
        if (!st8.active || slice) return;
        setNdc(e);
        if (st8.mode === 'cut') { st8.drag = { cut: true }; moveKnife(e); return; }
        var idx = st8.tool || st8.view ? -1 : pickItem();
        st8.drag = { x: e.clientX, y: e.clientY, idx: idx, moved: false, yaw: st8.yaw };
        if (idx >= 0) { st8.sel = idx; updateRing(); if (st8.hooks.select) st8.hooks.select(idx); }
        try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* old browser */ }
      }
      function move(e) {
        if (!st8.active) return;
        if (st8.mode === 'cut') { moveKnife(e); return; }
        var dr = st8.drag;
        if (!dr) return;
        if (Math.abs(e.clientX - dr.x) + Math.abs(e.clientY - dr.y) > 6) dr.moved = true;
        if (!dr.moved) return;
        if (dr.idx >= 0) {   // drag an item over the krathong
          setNdc(e);
          var p = pickSurface(), it = st8.look.design.items[dr.idx], o = itemObj(dr.idx);
          if (p && it && o) { it.p = within(p).map(function (v) { return Math.round(v * 100) / 100; }); o.position.set(it.p[0], it.p[1], it.p[2]); updateRing(); }
        } else {             // spin the krathong on the board
          st8.yaw = dr.yaw + (e.clientX - dr.x) * 0.012;
        }
      }
      function up(e) {
        if (!st8.active) return;
        var dr = st8.drag; st8.drag = null;
        if (!dr) return;
        if (dr.cut) { doCut(); return; }
        if (dr.idx >= 0) { if (dr.moved && st8.hooks.change) st8.hooks.change(); return; }
        if (dr.moved || st8.view) return;
        // a tap: place the chosen thing here, or deselect
        setNdc(e);
        if (st8.tool) {
          var p = pickSurface();
          if (!p) { if (st8.hooks.miss) st8.hooks.miss(); return; }
          var items = st8.look.design.items;
          if (items.length >= DZ.MAX_ITEMS) { if (st8.hooks.full) st8.hooks.full(); return; }
          var it = { k: st8.tool.k, p: within(p).map(function (v) { return Math.round(v * 100) / 100; }), r: Math.round(st8.yaw * -100) / 100, s: 1 };
          if (st8.tool.d != null) it.d = st8.tool.d;
          items.push(it);
          st8.sel = items.length - 1;
          rebuild();
          if (sfx) sfx.launch(false);
          if (st8.hooks.change) st8.hooks.change();
          if (st8.hooks.select) st8.hooks.select(st8.sel);
        } else if (st8.sel >= 0) {
          st8.sel = -1; updateRing(); if (st8.hooks.select) st8.hooks.select(-1);
        }
      }
      canvas.addEventListener('pointerdown', down);
      canvas.addEventListener('pointermove', move);
      canvas.addEventListener('pointerup', up);
      canvas.addEventListener('pointercancel', function () { st8.drag = null; });

      // ---- cutting the trunk: the knife follows the pointer along the trunk; release = cut
      var TRUNK_END = trunk.position.x + 2.1;   // world x of the trunk's cut end
      function moveKnife(e) {
        setNdc(e);
        var hitP = new THREE.Vector3();
        if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -trunk.position.z - 1.1), hitP)) return;
        st8.knifeX = Math.max(TRUNK_END - DZ.TRUNK_MAX, Math.min(TRUNK_END - DZ.TRUNK_MIN, hitP.x));
      }
      function doCut() {
        var h = Math.round((TRUNK_END - st8.knifeX) * 100) / 100;
        slice = withOutline(new THREE.Mesh(trunkGeo(h), [trunkSideMat, trunkTop(), trunkTop()]));
        slice.userData = { t: 0, h: h, from: new THREE.Vector3(TRUNK_END - h / 2, trunk.position.y, trunk.position.z) };
        slice.position.copy(slice.userData.from); slice.rotation.z = Math.PI / 2;
        ts.add(slice);
        if (sfx) sfx.launch(true);
      }

      function frame(dt) {
        st8.t += dt;
        var portrait = cam.aspect < 0.8;
        var cutting = st8.mode === 'cut';
        var dist = portrait ? 8.6 : 7.6, el = cutting ? 0.62 : 0.5;
        var tx = 0, ty = portrait ? -0.2 : 0.35, tz = 0;
        var want = new THREE.Vector3(tx + Math.sin(-0.08) * dist * Math.cos(el), ty + Math.sin(el) * dist, tz + Math.cos(-0.08) * dist * Math.cos(el));
        if (cutting) { want.set(TRUNK_END + 1.6, 3.2, trunk.position.z + (portrait ? 6.2 : 4.6)); tx = TRUNK_END - (portrait ? 0.5 : 0.9); ty = 0.7; tz = trunk.position.z; }
        cam.position.lerp(want, Math.min(1, dt * 4));
        tmpV.set(tx, ty, tz);
        cam.lookAt(tmpV);
        stage.rotation.y += ((st8.drag && st8.drag.idx < 0 ? st8.yaw : st8.yaw) - stage.rotation.y) * Math.min(1, dt * 8);
        if (!st8.drag && !cutting) st8.yaw += dt * 0.05;   // a gentle turntable
        knife.visible = cutting && !slice;
        knife.position.set(st8.knifeX, trunk.position.y + 1.05 + Math.abs(Math.sin(st8.t * 3)) * 0.08, trunk.position.z);
        cutRing.visible = knife.visible; cutRing.position.set(st8.knifeX, trunk.position.y, trunk.position.z);
        stage.visible = !cutting;
        if (st8.k) {
          var fl = st8.k.userData.flame;
          if (fl) fl.scale.setScalar(1.0 + Math.sin(st8.t * 14) * 0.06);
        }
        if (slice) {   // fly the slice from the trunk, stand it up and set it on the board
          var u = slice.userData; u.t += dt / 0.9;
          var e = Math.min(1, u.t), k = e * e * (3 - 2 * e);
          slice.position.set(u.from.x * (1 - k), u.from.y * (1 - k) + (-0.19 + u.h / 2) * k + Math.sin(k * Math.PI) * 1.4, u.from.z * (1 - k));
          slice.rotation.z = Math.PI / 2 * (1 - k);
          if (e >= 1) {
            ts.remove(slice); slice.geometry.dispose(); slice = null;
            st8.mode = 'build';
            if (st8.hooks.cut) st8.hooks.cut(u.h);
          }
        }
        updateRing();
      }

      return {
        scene: ts, camera: cam, frame: frame,
        get active() { return st8.active; },
        resize: function (w, h) {
          cam.aspect = w / h; cam.fov = cam.aspect < 0.8 ? 55 : 42;
          // wide screens: the tool panel sits on the right (workshop.js), so centre the table in the space left of it
          if (w >= 900) cam.setViewOffset(w, h, 210, 0, w, h); else cam.clearViewOffset();
          cam.updateProjectionMatrix();
        },
        // look is shared with the workshop UI: the table edits look.design.items in place and calls hooks.change()
        // opts.view: look only (gallery) - spin it, nothing can be picked or placed
        open: function (look, hooks, opts) {
          st8.active = true; st8.look = look; st8.hooks = hooks || {}; st8.mode = 'build'; st8.tool = null; st8.sel = -1; st8.yaw = -0.5;
          st8.view = !!(opts && opts.view);
          cam.position.set(0, 6, 10);
          rebuild();
        },
        close: function () {
          st8.active = false; st8.drag = null;
          if (st8.k) { stage.remove(st8.k); disposeKrathong(st8.k); st8.k = null; }
          if (slice) { ts.remove(slice); slice.geometry.dispose(); slice = null; }
        },
        refresh: function () { if (st8.active) rebuild(); },
        mode: function (m) { st8.mode = m; st8.sel = -1; st8.drag = null; },
        tool: function (t) { st8.tool = t; if (t) { st8.sel = -1; } },
        selected: function () { return st8.sel; },
        select: function (i) { st8.sel = i; updateRing(); },
        // change the selected item: { rotate: radians, scale: factor, remove: true }
        edit: function (op) {
          var items = st8.look.design.items, it = items[st8.sel];
          if (!it) return;
          if (op.remove) { items.splice(st8.sel, 1); st8.sel = -1; rebuild(); }
          else {
            if (op.rotate) it.r = Math.round((((it.r + op.rotate) % 6.28) + 6.28) % 6.28 * 100) / 100;
            if (op.scale) it.s = Math.round(Math.max(DZ.SCALE_MIN, Math.min(DZ.SCALE_MAX, it.s * op.scale)) * 100) / 100;
            if (op.lift) it.p[1] = Math.round(Math.max(-0.9, Math.min(3.9, it.p[1] + op.lift)) * 100) / 100;
            var o = itemObj(st8.sel);
            if (o) { o.rotation.y = it.r; o.scale.setScalar(it.s); o.position.y = it.p[1]; }
          }
          if (st8.hooks.change) st8.hooks.change();
        }
      };
    })();

    var hero = addKrathong(0.6, 6.2, 1.15, 0, false);
    hero.userData.hero = true;
    hero.userData.vz = -0.55; hero.userData.vx = 0.03;
    // a real point light costs every lit pixel; low tier relies on the glow sprites instead
    var heroLight = LOW ? null : new THREE.PointLight(0xffa040, 0.8, 6, 2);
    if (heroLight) { heroLight.position.set(0, 1.6, 0); hero.add(heroLight); }
    var COUNT = Q.krathongs;
    for (var kc = 0; kc < COUNT; kc++) addKrathong(-14 + R() * 28, 4 - R() * 50, 0.7 + R() * 0.35, kc, false);

    // ---- floating lotuses along both banks: cupped leaves with veins, layered blooms, buds on stems
    var PAD_NOTCH = 0.5;
    // lotus leaf: a shallow cup (rim turned up) with a notch, lighter centre, darker rim
    function lotusPadGeo() {
      var RINGS = 6, SEG = 44, pos = [], col = [], idx = [];
      var cCenter = new THREE.Color(0x5fb479), cIn = new THREE.Color(0x1f7a3c), cOut = new THREE.Color(0x15602d), cRim = new THREE.Color(0x0c4120), c = new THREE.Color();
      pos.push(0, 0.02, 0); col.push(cCenter.r, cCenter.g, cCenter.b);
      for (var r = 1; r <= RINGS; r++) {
        var rr = r / RINGS;
        for (var s = 0; s <= SEG; s++) {
          var a = PAD_NOTCH / 2 + s / SEG * (Math.PI * 2 - PAD_NOTCH);
          pos.push(Math.cos(a) * rr, 0.03 + 0.12 * Math.pow(rr, 4) + 0.018 * Math.sin(a * 5) * rr, Math.sin(a) * rr);
          if (r === RINGS) c.copy(cRim); else c.copy(cIn).lerp(cOut, rr);
          if (r === 1) c.lerp(cCenter, 0.4);
          col.push(c.r, c.g, c.b);
        }
      }
      var b1 = 1;
      for (var f = 0; f < SEG; f++) idx.push(0, b1 + f + 1, b1 + f);
      for (var ring = 1; ring < RINGS; ring++) {
        var bi = 1 + (ring - 1) * (SEG + 1), bo = 1 + ring * (SEG + 1);
        for (var q = 0; q < SEG; q++) {
          idx.push(bi + q, bi + q + 1, bo + q);
          idx.push(bi + q + 1, bo + q + 1, bo + q);
        }
      }
      var geo = new THREE.BufferGeometry();
      geo.setIndex(idx);
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      geo.computeVertexNormals();
      return geo;
    }
    geoCache.lotusPad = lotusPadGeo();

    // veins + rim line for one leaf (merged vertex-coloured parts), at offset/scale
    function padDetails(parts, ox, oz, sc, rot) {
      var qr = E(0, rot, 0);
      for (var v = 0; v < 11; v++) {
        var va = PAD_NOTCH / 2 + (v + 0.5) / 11 * (Math.PI * 2 - PAD_NOTCH);
        var p = new THREE.Vector3(Math.cos(va) * 0.42, 0.062, Math.sin(va) * 0.42).applyQuaternion(qr).multiplyScalar(sc);
        parts.push({ geo: new THREE.BoxGeometry(1, 1, 1), color: 0x6cc48a,
          m: new THREE.Matrix4().compose(new THREE.Vector3(ox + p.x, p.y, oz + p.z), E(0, rot - va, 0.06), new THREE.Vector3(0.74 * sc, 0.008, 0.02 * sc)) });
      }
      parts.push({ geo: new THREE.TorusGeometry(1, 0.022, 5, 48, Math.PI * 2 - PAD_NOTCH), color: 0x0f4524,
        m: new THREE.Matrix4().compose(new THREE.Vector3(ox, 0.15 * sc, oz), E(0, rot, 0).multiply(E(Math.PI / 2, 0, PAD_NOTCH / 2)), new THREE.Vector3(sc, sc, sc)) });
    }
    function addPad(petals, ox, oz, sc, rot) {
      petals.push({ geo: geoCache.lotusPad, color: null, m: new THREE.Matrix4().compose(new THREE.Vector3(ox, 0, oz), E(0, rot, 0), new THREE.Vector3(sc, sc, sc)) });
    }
    // a full bloom: three tiers of cupped petals + seed pod with stamens
    function addBloom(petals, deco, pre, ox, oy, oz, s) {
      function P(geo, n, r, y, lean, off) {
        for (var k = 0; k < n; k++) {
          var a = k / n * Math.PI * 2 + off;
          placePetal(petals, geoCache[pre + geo], new THREE.Vector3(ox + Math.cos(a) * r * s, oy + y * s, oz + Math.sin(a) * r * s), a, lean, s);
        }
      }
      P('OuterP', 9, 0.3, 0.05, 1.0, 0);
      P('MidP', 8, 0.22, 0.09, 0.55, 0.39);
      P('InnerP', 6, 0.13, 0.13, 0.2, 0.2);
      deco.push({ geo: new THREE.CylinderGeometry(0.16, 0.11, 0.12, 16), color: 0xc0ca33, m: M(ox, oy + 0.42 * s, oz, null, s, s, s) });
      for (var st = 0; st < 14; st++) {
        var ta = st / 14 * Math.PI * 2;
        deco.push({ geo: S(1, 5, 4), color: st % 2 ? 0xffb300 : 0xffd54f, m: M(ox + Math.cos(ta) * 0.2 * s, oy + 0.47 * s, oz + Math.sin(ta) * 0.2 * s, null, 0.025 * s) });
      }
      for (var sd = 0; sd < 6; sd++) {
        var sa = sd / 6 * Math.PI * 2;
        deco.push({ geo: S(1, 5, 4), color: 0x827717, m: M(ox + Math.cos(sa) * 0.09 * s, oy + 0.485 * s, oz + Math.sin(sa) * 0.09 * s, null, 0.024 * s) });
      }
    }
    // a closed bud rising on a curved stem
    function addBud(petals, deco, pre, ox, oz, h) {
      var V3 = THREE.Vector3, top = new V3(ox + 0.15, h, oz - 0.1);
      var stem = new THREE.CatmullRomCurve3([new V3(ox, 0.04, oz), new V3(ox + 0.12, h * 0.55, oz + 0.05), top]);
      deco.push({ geo: new THREE.TubeGeometry(stem, 12, 0.035, 6, false), color: 0x3f9a4a, m: M(0, 0, 0) });
      deco.push({ geo: S(1, 8, 6), color: 0x3f9a4a, m: M(top.x, top.y, top.z, null, 0.07, 0.05, 0.07) });
      for (var b = 0; b < 5; b++) {
        var ab = b / 5 * Math.PI * 2;
        placePetal(petals, geoCache[pre + 'InnerP'], new V3(top.x + Math.cos(ab) * 0.03, top.y, top.z + Math.sin(ab) * 0.03), ab, -0.16, 0.72);
      }
    }

    var lotuses = [];
    for (var lp = 0; lp < Q.lotus; lp++) {
      var side = lp % 2 ? 1 : -1, kind = lp % 4, pre = kind === 1 ? 'wlotus' : 'lotus';
      var lg = new THREE.Group(), petals = [], deco = [];
      var rot = R() * Math.PI * 2;
      addPad(petals, 0, 0, 1, rot);
      padDetails(deco, 0, 0, 1, rot);
      if (kind === 0) {                       // pink bloom + bud + small leaf
        addBloom(petals, deco, pre, 0.1, 0.03, 0.05, 1.05);
        addBud(petals, deco, pre, -0.55, -0.35, 0.95);
        addPad(petals, 1.05, 0.55, 0.5, rot + 1.7); padDetails(deco, 1.05, 0.55, 0.5, rot + 1.7);
      } else if (kind === 1) {                // white bloom
        addBloom(petals, deco, pre, 0.05, 0.03, 0, 1.1);
      } else if (kind === 2) {                // leaves only, with a bud
        addPad(petals, -1.0, 0.45, 0.62, rot + 2.4); padDetails(deco, -1.0, 0.45, 0.62, rot + 2.4);
        addBud(petals, deco, pre, 0.3, 0.2, 0.8);
      } else {                                // small pink bloom + extra leaf
        addBloom(petals, deco, pre, 0.15, 0.03, 0.1, 0.85);
        addPad(petals, -0.95, -0.5, 0.55, rot + 0.9); padDetails(deco, -0.95, -0.5, 0.55, rot + 0.9);
      }
      lg.add(new THREE.Mesh(merge(petals), mats.leaf));
      lg.add(new THREE.Mesh(merge(deco), mats.vc));
      var ps = 0.85 + R() * 0.6; lg.scale.setScalar(ps);
      lg.position.set(side * (7 + R() * 12), 0, 5 - R() * 34);
      lg.userData.ph = R() * 6;
      scene.add(lg); lotuses.push(lg);
    }

    // ---- kids in swim rings who paddle over and collect coins from krathongs
    function stripeTorus(c1, c2) {
      var g = new THREE.TorusGeometry(0.52, 0.19, 12, 32);
      var p = g.attributes.position, cols = new Float32Array(p.count * 3), a = new THREE.Color(c1), b = new THREE.Color(c2);
      for (var i = 0; i < p.count; i++) {
        var ang = Math.atan2(p.getY(i), p.getX(i));
        var c = Math.floor((ang + Math.PI) / (Math.PI / 4)) % 2 ? a : b;
        cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      return g;
    }
    function makeKid(cfg) {
      var SKIN = 0xe3ad84;
      var kid = new THREE.Group(), body = new THREE.Group();
      kid.add(body);
      var ring = withOutline(new THREE.Mesh(stripeTorus(cfg.ring1, cfg.ring2), mats.vc));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.08; body.add(ring);
      var torso = withOutline(new THREE.Mesh(new THREE.SphereGeometry(0.36, 18, 14), toon(cfg.shirt)));
      torso.scale.set(1, 1.05, 0.85); torso.position.y = 0.26; body.add(torso);

      var hp = [
        { geo: new THREE.SphereGeometry(0.34, 22, 16), color: SKIN, m: M(0, 0.84, 0) },
        { geo: new THREE.SphereGeometry(0.36, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.52), color: cfg.hair, m: M(0, 0.86, -0.03, new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.35, 0, 0))) },
        { geo: new THREE.SphereGeometry(0.075, 10, 8), color: SKIN, m: M(-0.34, 0.82, 0) },
        { geo: new THREE.SphereGeometry(0.075, 10, 8), color: SKIN, m: M(0.34, 0.82, 0) }
      ];
      if (cfg.girl) {
        hp.push({ geo: new THREE.SphereGeometry(0.14, 12, 10), color: cfg.hair, m: M(-0.3, 1.08, -0.05) });
        hp.push({ geo: new THREE.SphereGeometry(0.14, 12, 10), color: cfg.hair, m: M(0.3, 1.08, -0.05) });
        hp.push({ geo: new THREE.SphereGeometry(1, 10, 8), color: 0xff6fa5, m: M(0.24, 1.2, 0.06, null, 0.09, 0.06, 0.06) });
      } else {
        hp.push({ geo: new THREE.ConeGeometry(0.08, 0.24, 6), color: cfg.hair, m: M(0.04, 1.22, 0.02, new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, 0, -0.4))) });
      }
      body.add(withOutline(new THREE.Mesh(merge(hp), mats.vc)));

      var fp = [];
      [-1, 1].forEach(function (s) {
        fp.push({ geo: new THREE.SphereGeometry(1, 10, 8), color: 0x1b1030, m: M(0.12 * s, 0.87, 0.29, null, 0.055, 0.07, 0.04) });
        fp.push({ geo: new THREE.SphereGeometry(1, 6, 4), color: 0xffffff, m: M(0.12 * s + 0.02, 0.9, 0.325, null, 0.018) });
        fp.push({ geo: new THREE.SphereGeometry(1, 8, 6), color: 0xff8fa3, m: M(0.21 * s, 0.77, 0.26, null, 0.06, 0.035, 0.03) });
      });
      fp.push({ geo: new THREE.TorusGeometry(0.075, 0.02, 6, 14, Math.PI), color: 0x7a2333,
        m: M(0, 0.79, 0.315, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI))) });
      body.add(new THREE.Mesh(merge(fp), mats.vc));

      var arms = [];
      [-1, 1].forEach(function (s) {
        var piv = new THREE.Group(); piv.position.set(0.34 * s, 0.42, 0.02);
        var arm = withOutline(new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.5, 10), mats.skin)); arm.position.y = -0.25; piv.add(arm);
        var hand = withOutline(new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), mats.skin)); hand.position.y = -0.52; piv.add(hand);
        body.add(piv); arms.push(piv);
      });

      var fly = new THREE.Group();
      var fc = withOutline(new THREE.Mesh(geoCache.coin, mats.coin)); fc.rotation.x = Math.PI / 2; fly.add(fc);
      fly.visible = false; scene.add(fly);
      var spark = sprite(softTex, 0xffd86b, 2.4, 0); scene.add(spark);

      kid.userData = { body: body, arms: arms, fly: fly, spark: spark, state: 'swim', st: 0, t: R() * 5, retry: 0,
        target: null, wander: null, speed: 1.9 + R() * 0.4, rip: 0, from: new THREE.Vector3(), to: new THREE.Vector3(), flying: false, ft: 0 };
      kid.scale.setScalar(1.6);
      scene.add(kid);
      return kid;
    }
    var kids = [
      makeKid({ shirt: 0xff5b5b, ring1: 0xffffff, ring2: 0xff7ab8, hair: 0x2a1a14, girl: true }),
      makeKid({ shirt: 0x3fa9f5, ring1: 0xffffff, ring2: 0xffc93c, hair: 0x1d140f, girl: false })
    ];
    kids[0].position.set(-9, 0, 3); kids[1].position.set(9, 0, -3);

    var rippleGeo = new THREE.RingGeometry(0.55, 0.68, 28);
    var ripples = [];
    for (var rp = 0; rp < 16; rp++) {
      var rm = new THREE.Mesh(rippleGeo, new THREE.MeshBasicMaterial({ color: 0xd9d0ff, transparent: true, opacity: 0, depthWrite: false }));
      rm.rotation.x = -Math.PI / 2; rm.userData.life = 99; rm.visible = false;
      scene.add(rm); ripples.push(rm);
    }
    function ripple(x, z, s) {
      for (var i = 0; i < ripples.length; i++) {
        if (ripples[i].userData.life > 1.2) { var r = ripples[i]; r.position.set(x, 0, z); r.userData.life = 0; r.userData.s = s; r.visible = true; return; }
      }
    }
    function lerpAngle(a, b, k) {
      var d = (b - a + Math.PI) % (Math.PI * 2); if (d < 0) d += Math.PI * 2;
      return a + (d - Math.PI) * k;
    }
    function pickTarget(kid) {
      var best = null, bd = 1e9;
      krathongs.forEach(function (k) {
        var d = k.userData;
        if (d.hero || d.robbed || d.claimed || d.pop < 1) return;
        if (k.position.z < -13 || k.position.z > 7 || Math.abs(k.position.x) > 12) return;
        var dd = k.position.distanceToSquared(kid.position);
        if (dd < bd) { bd = dd; best = k; }
      });
      return best;
    }
    function collectCoin(kid) {
      var u = kid.userData;
      u.spark.position.copy(u.to); u.spark.material.opacity = 1; u.spark.scale.set(2.6, 2.6, 1);
      if (sfx && sfx.coin) sfx.coin();
      if (onCoin) {
        labelV.copy(u.to).project(camera);
        onCoin((labelV.x * 0.5 + 0.5) * viewW, (-labelV.y * 0.5 + 0.5) * viewH);
      }
    }
    function updateKid(kid, dt, t) {
      var u = kid.userData, A = u.arms, moving = false, k = u.target;
      u.t += dt;
      if (u.state === 'swim') {
        if (k && (k.userData.robbed || k.parent !== scene || k.position.z < -20 || k.userData.pop < 1)) {
          if (k.userData.claimed === kid) k.userData.claimed = null;
          k = u.target = null;
        }
        if (!k && u.t > u.retry) {
          k = u.target = pickTarget(kid);
          if (k) k.userData.claimed = kid;
          else {
            u.retry = u.t + 1;
            if (!u.wander || kid.position.distanceTo(u.wander) < 1) u.wander = new THREE.Vector3(-8 + R() * 16, 0, -4 + R() * 8);
          }
        }
        var goal = k ? k.position : u.wander;
        if (goal) {
          var dx = goal.x - kid.position.x, dz = goal.z - kid.position.z, dist = Math.sqrt(dx * dx + dz * dz);
          var stop = k ? 1.0 + 1.05 * k.userData.scale : 0.4;
          kid.rotation.y = lerpAngle(kid.rotation.y, Math.atan2(dx, dz), Math.min(1, dt * 4));
          if (dist > stop) {
            var sp = Math.min(u.speed, (dist - stop) * 3 + 0.4);
            kid.position.x += Math.sin(kid.rotation.y) * sp * dt;
            kid.position.z += Math.cos(kid.rotation.y) * sp * dt;
            moving = true;
          } else if (k) { u.state = 'grab'; u.st = 0; }
        }
      } else if (u.state === 'grab') {
        u.st += dt;
        if (k) {
          kid.position.x += k.userData.vx * dt; kid.position.z += k.userData.vz * dt;
          kid.rotation.y = lerpAngle(kid.rotation.y, Math.atan2(k.position.x - kid.position.x, k.position.z - kid.position.z), Math.min(1, dt * 6));
          if (u.st > 0.35 && !u.flying && !k.userData.robbed) {
            k.userData.robbed = true; k.userData.coin.visible = false;
            k.userData.coin.children[0].getWorldPosition(u.from);
            u.fly.position.copy(u.from); u.fly.visible = true; u.flying = true; u.ft = 0;
          }
        }
        if (u.flying) {
          u.ft = Math.min(1, u.ft + dt / 0.5);
          kid.localToWorld(u.to.set(0, 1.35, 0.1));
          u.fly.position.lerpVectors(u.from, u.to, u.ft);
          u.fly.position.y += Math.sin(u.ft * Math.PI) * 1.2;
          u.fly.rotation.y += dt * 16;
          if (u.ft >= 1) { u.flying = false; u.fly.visible = false; collectCoin(kid); }
        }
        if (u.st > 1.0 && !u.flying) {
          if (k && k.userData.claimed === kid) k.userData.claimed = null;
          u.target = null; u.state = 'cheer'; u.st = 0;
        }
      } else {
        u.st += dt;
        if (u.st > 0.9) { u.state = 'swim'; u.retry = u.t + 0.3; }
      }

      // keep clear of the hero krathong and stay on screen
      var hx = kid.position.x - hero.position.x, hz = kid.position.z - hero.position.z, hd = Math.sqrt(hx * hx + hz * hz);
      if (hd < 2.5 && hd > 0.001) { kid.position.x += hx / hd * (2.5 - hd); kid.position.z += hz / hd * (2.5 - hd); }
      kid.position.x = Math.max(-14, Math.min(14, kid.position.x));
      kid.position.z = Math.max(-16, Math.min(7, kid.position.z));

      // pose
      var ph = u.t * (moving ? 8 : 4);
      if (u.state === 'swim') {
        A[0].rotation.set(-1.4 + Math.sin(ph) * 0.7, 0, -0.35);
        A[1].rotation.set(-1.4 + Math.sin(ph + Math.PI) * 0.7, 0, 0.35);
      } else if (u.state === 'grab') {
        var r = Math.min(1, u.st / 0.3);
        A[1].rotation.set(-1.4 - r * 0.3, 0, 0.15);
        A[0].rotation.set(-1.0, 0, -0.4);
      } else {
        var w = Math.sin(u.st * 18) * 0.3;
        A[0].rotation.set(-2.9 + w, 0, -0.35);
        A[1].rotation.set(-2.9 - w, 0, 0.35);
      }
      u.body.position.y = Math.sin(u.t * (moving ? 8 : 3)) * 0.04 + (u.state === 'cheer' ? Math.abs(Math.sin(u.st * Math.PI * 2.5)) * 0.3 : 0);
      u.body.rotation.z = moving ? Math.sin(ph) * 0.08 : 0;
      u.body.rotation.x = moving ? 0.15 : 0;
      kid.position.y = wave(kid.position.x, kid.position.z, t) - 0.12;

      u.rip -= dt;
      if (u.rip <= 0) { ripple(kid.position.x, kid.position.z, 1.2); u.rip = moving ? 0.35 : 1.2; }
      if (u.spark.material.opacity > 0) {
        u.spark.material.opacity = Math.max(0, u.spark.material.opacity - dt * 2.5);
        u.spark.scale.multiplyScalar(1 + dt * 1.5);
      }
    }

    // ---- the river "hippo-dog": a chubby black-and-tan dog that lives in the river like a hippo —
    // lurks with only eyes/ears/nose above water, floats, yawns, dives and resurfaces with a splash
    var dogInfo = { state: '', charges: 0, bumps: 0 };   // for stats() / ?lkdebug=1
    var updateDog = (function makeDog() {
      var V3 = THREE.Vector3;
      var BLACK = 0x26242d, TAN = 0xc67a36, PINK = 0xd9637a;
      var black = toon(BLACK, { emissive: 0x0b0a12 }), tan = toon(TAN);
      var g = new THREE.Group(), body = new THREE.Group();
      g.add(body);

      // round hippo body, head, long snout, tan chest and cheeks (outlined)
      var p = [];
      p.push({ geo: S(1, 28, 20), color: BLACK, m: M(0, 0, 0, null, 1.25, 0.95, 1.7) });
      p.push({ geo: S(1, 20, 14), color: TAN, m: M(0, -0.38, 1.1, null, 0.72, 0.5, 0.55) });
      p.push({ geo: S(1, 24, 18), color: BLACK, m: M(0, 0.55, 1.72, null, 0.72, 0.64, 0.74) });
      p.push({ geo: S(1, 20, 14), color: BLACK, m: M(0, 0.42, 2.38, null, 0.44, 0.36, 0.62) });
      [-1, 1].forEach(function (s) { p.push({ geo: S(1, 14, 10), color: TAN, m: M(0.22 * s, 0.3, 2.3, null, 0.26, 0.2, 0.5) }); });
      body.add(withOutline(new THREE.Mesh(merge(p), mats.vc)));
      // face details: brown eyes, tan eyebrow dots, raised nose and nostrils (hippo style), palate
      var d = [];
      [-1, 1].forEach(function (s) {
        d.push({ geo: S(1, 12, 10), color: 0x3b2414, m: M(0.27 * s, 0.86, 2.28, null, 0.11, 0.12, 0.08) });
        d.push({ geo: S(1, 6, 4), color: 0xffffff, m: M(0.27 * s + 0.03, 0.9, 2.35, null, 0.03) });
        d.push({ geo: S(1, 10, 8), color: TAN, m: M(0.27 * s, 1.03, 2.2, null, 0.1, 0.06, 0.07) });
        d.push({ geo: S(1, 8, 6), color: 0x0d0d12, m: M(0.1 * s, 0.68, 3.0, null, 0.05, 0.03, 0.04) });
      });
      d.push({ geo: S(1, 16, 12), color: 0x111117, m: M(0, 0.6, 2.92, null, 0.2, 0.13, 0.14) });
      d.push({ geo: S(1, 14, 10), color: PINK, m: M(0, 0.3, 2.4, null, 0.32, 0.05, 0.48) });
      body.add(new THREE.Mesh(merge(d), mats.vc));

      // lower jaw on a hinge (opens for the yawn) with tongue and two little tusks
      var jawPivot = new THREE.Group(); jawPivot.position.set(0, 0.3, 1.95); body.add(jawPivot);
      var jp = [];
      jp.push({ geo: S(1, 16, 12), color: TAN, m: M(0, -0.04, 0.42, null, 0.38, 0.16, 0.56) });
      jp.push({ geo: S(1, 14, 10), color: PINK, m: M(0, 0.07, 0.38, null, 0.3, 0.06, 0.46) });
      [-1, 1].forEach(function (s) { jp.push({ geo: new THREE.ConeGeometry(0.05, 0.16, 8), color: 0xfff8ec, m: M(0.2 * s, 0.13, 0.78) }); });
      jawPivot.add(withOutline(new THREE.Mesh(merge(jp), mats.vc)));

      // big upright ears (they flick like a hippo's)
      var ears = [];
      [-1, 1].forEach(function (s) {
        var piv = new THREE.Group(); piv.position.set(0.42 * s, 1.02, 1.62); piv.rotation.z = -0.32 * s; body.add(piv);
        var outer = withOutline(new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.78, 16), black)); outer.scale.z = 0.45; outer.position.y = 0.36; piv.add(outer);
        var inner = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.56, 12), toon(0x8a4a2c)); inner.scale.z = 0.3; inner.position.set(0, 0.3, 0.07); piv.add(inner);
        piv.userData.side = s;
        ears.push(piv);
      });
      // stubby tan legs that paddle
      var legs = [];
      [[-0.72, 1.0], [0.72, 1.0], [-0.72, -0.95], [0.72, -0.95]].forEach(function (lp) {
        var piv = new THREE.Group(); piv.position.set(lp[0], -0.55, lp[1]); body.add(piv);
        var leg = withOutline(new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.24, 0.62, 12), tan)); leg.position.y = -0.28; piv.add(leg);
        var paw = withOutline(new THREE.Mesh(S(1, 12, 8), tan)); paw.scale.set(0.3, 0.16, 0.36); paw.position.set(0, -0.6, 0.06); piv.add(paw);
        legs.push(piv);
      });
      // thin curled tail
      var tailPiv = new THREE.Group(); tailPiv.position.set(0, 0.3, -1.55); body.add(tailPiv);
      var tailCurve = new THREE.CatmullRomCurve3([new V3(0, 0, 0), new V3(0, 0.45, -0.3), new V3(0, 0.85, -0.15), new V3(0, 0.9, 0.1)]);
      tailPiv.add(withOutline(new THREE.Mesh(new THREE.TubeGeometry(tailCurve, 16, 0.07, 8, false), black)));

      g.scale.setScalar(0.95);
      scene.add(g);

      // water droplets: splash, nose spray and bubbles
      var DN = 56, dPos = new Float32Array(DN * 3), drops = [];
      for (var di = 0; di < DN; di++) { drops.push({ life: 9, vx: 0, vy: 0, vz: 0 }); dPos[di * 3 + 1] = -100; }
      var dGeo = new THREE.BufferGeometry(); dGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
      scene.add(new THREE.Points(dGeo, new THREE.PointsMaterial({ size: 0.17, map: softTex, color: 0xdfe9ff, transparent: true, opacity: 0.9, depthWrite: false })));
      function spray(x, y, z, n, spread, up) {
        for (var k = 0, made = 0; k < DN && made < n; k++) {
          var dp = drops[k];
          if (dp.life < 1.6) continue;
          dp.life = 0; made++;
          dp.vx = (R() - 0.5) * spread; dp.vz = (R() - 0.5) * spread; dp.vy = up * (0.6 + R() * 0.6);
          dPos[k * 3] = x; dPos[k * 3 + 1] = y; dPos[k * 3 + 2] = z;
        }
      }

      var u = { state: 'under', st: 0, dur: 4.5, off: -2.8, pitch: 0.3, heading: 0.8, target: new V3(-5, 0, -10),
        x: -6, z: -11, earFlick: 0, nextFlick: 2, nextSpray: 3, rip: 0, bub: 0, victim: null, hits: 0, rage: 0 };
      // glowing red eyes while it rampages
      var rageEyes = [-1, 1].map(function (s) {
        var e = sprite(softTex, 0xff2a2a, 0.55, 0); e.position.set(0.27 * s, 0.88, 2.36); body.add(e); return e;
      });
      // the closest krathong ahead in reach (krathongs with a wish card count too: they get bumped, never capsized)
      function pickVictim() {
        var best = null, bd = Infinity;
        krathongs.forEach(function (k) {
          var p = k.position;
          if (p.z > 1 || p.z < -26 || Math.abs(p.x) > 12 || k.userData.pop < 1) return;
          var dd = (p.x - u.x) * (p.x - u.x) + (p.z - u.z) * (p.z - u.z);
          if (dd < bd && dd > 1) { bd = dd; best = k; }
        });
        u.victim = best;
        return best;
      }
      var tmp = new V3();
      function pickTarget() { u.target.set(-9 + R() * 18, 0, -15 + R() * 8); }
      function setState(s, dur) {
        u.state = s; u.st = 0; u.dur = dur;
        var wy = wave(u.x, u.z, t);
        if (s === 'dive') { ripple(u.x, u.z, 2.6); spray(u.x, wy + 0.2, u.z, 16, 3, 3); if (sfx) sfx.launch(false); }
        if (s === 'under') { pickTarget(); }
        if (s === 'charge') { dogInfo.charges++; u.hits = 0; pickVictim(); u.earFlick = 1; spray(u.x, wy + 0.3, u.z, 20, 2.5, 3.5); ripple(u.x, u.z, 2.4); if (sfx) sfx.launch(false); }
        if (s === 'emerge') { ripple(u.x, u.z, 2.8); ripple(u.x, u.z, 1.8); spray(u.x, wy + 0.3, u.z, 26, 4, 4.5); u.earFlick = 1; if (sfx) sfx.launch(false); }
      }
      var OFF = { lurk: -0.62, surface: -0.12, yawn: -0.08, dive: -2.8, under: -2.8, emerge: -0.5, charge: -0.25 };
      var SPEED = { lurk: 0.5, surface: 0.25, yawn: 0, dive: 0.35, under: 1.4, emerge: 0.15, charge: 3.4 };
      var PITCH = { lurk: -0.12, surface: 0, yawn: -0.42, dive: 0.55, under: 0.3, emerge: -0.22, charge: -0.18 };

      return function (dt, now) {
        u.st += dt;
        // behaviour: lurk → (float [+ yawn]) or dive → swim under → resurface
        if (u.state === 'lurk' && u.st > u.dur) {
          var roll = R();
          if (roll < 0.4 && pickVictim()) setState('charge', 8);   // berserk!
          else if (roll < 0.7) setState('surface', 4 + R() * 2); else setState('dive', 1.4);
        }
        else if (u.state === 'charge' && (u.st > u.dur || u.hits >= 3 || !u.victim)) setState('lurk', 6 + R() * 4);
        else if (u.state === 'surface' && u.st > u.dur) { if (R() < 0.65) setState('yawn', 2.6); else setState('lurk', 6 + R() * 4); }
        else if (u.state === 'yawn' && u.st > u.dur) setState('lurk', 6 + R() * 4);
        else if (u.state === 'dive' && u.st > u.dur) setState('under', 3 + R() * 3);
        else if (u.state === 'under' && u.st > u.dur) setState('emerge', 1.3);
        else if (u.state === 'emerge' && u.st > u.dur) setState('lurk', 6 + R() * 4);

        // slow swim toward a spot in the river, turning gently (a charge chases its krathong and turns hard)
        var charging = u.state === 'charge';
        if (charging) {
          if (u.victim && krathongs.indexOf(u.victim) < 0) pickVictim();
          if (u.victim) u.target.set(u.victim.position.x, 0, u.victim.position.z);
        }
        var dx = u.target.x - u.x, dz = u.target.z - u.z, dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < 1.2 && !charging) pickTarget();
        u.heading = lerpAngle(u.heading, Math.atan2(dx, dz), Math.min(1, dt * (charging ? 4 : u.state === 'under' ? 1.5 : 0.6)));
        var sp = SPEED[u.state];
        u.x += Math.sin(u.heading) * sp * dt; u.z += Math.cos(u.heading) * sp * dt;
        // keep a polite distance from the kids and the big krathong up front
        for (var ki = 0; ki <= kids.length; ki++) {
          if (ki === kids.length && charging) break;   // the big krathong is fair game while it rampages
          var o = ki < kids.length ? kids[ki] : hero;
          var ox = u.x - o.position.x, oz = u.z - o.position.z, od = Math.sqrt(ox * ox + oz * oz);
          if (od < 3.2 && od > 0.001) { u.x += ox / od * (3.2 - od) * dt * 2; u.z += oz / od * (3.2 - od) * dt * 2; }
        }
        if (charging) {
          u.x = Math.max(-12, Math.min(12, u.x)); u.z = Math.max(-26, Math.min(1, u.z));
          // anything it runs into gets bumped (spins and wobbles, never capsizes)
          for (var bk = 0; bk < krathongs.length; bk++) {
            var kk = krathongs[bk], kd = kk.userData;
            var bx = kk.position.x - u.x, bz = kk.position.z - u.z;
            if (bx * bx + bz * bz < 2.4 && now - (kd.bumpAt || -9) > 1.2) {
              kd.bumpAt = now; dogInfo.bumps++;
              bumpKrathong(kk, u.x, u.z, 1);
              spray(kk.position.x, wave(kk.position.x, kk.position.z, now) + 0.3, kk.position.z, 10, 1.8, 2.6);
              if (sfx) sfx.launch(false);
              if (kk === u.victim) { u.hits++; pickVictim(); }
            }
          }
          u.rip -= dt;
          if (u.rip <= 0) { ripple(u.x, u.z, 2.4); spray(u.x, wave(u.x, u.z, now) + 0.1, u.z, 3, 1.2, 1.2); u.rip = 0.25; }
          u.earFlick = Math.max(u.earFlick, 0.6);
        } else {
          u.x = Math.max(-10, Math.min(10, u.x)); u.z = Math.max(-16, Math.min(-6, u.z));
        }
        dogInfo.state = u.state;
        u.rage += ((charging ? 1 : 0) - u.rage) * Math.min(1, dt * 4);
        rageEyes.forEach(function (e) { e.material.opacity = u.rage * (0.75 + 0.25 * Math.sin(now * 18)); });

        // how deep it sits, head pitch, roll
        var k = u.state === 'dive' ? 2.4 : u.state === 'emerge' ? 3.2 : 1.3;
        u.off += (OFF[u.state] - u.off) * Math.min(1, dt * k);
        u.pitch += (PITCH[u.state] - u.pitch) * Math.min(1, dt * 3);
        var wy = wave(u.x, u.z, now);
        g.position.set(u.x, wy + u.off + Math.sin(now * 1.3) * 0.04, u.z);
        g.rotation.y = u.heading;
        body.rotation.x = u.pitch;
        body.rotation.z = Math.sin(now * (charging ? 9 : 0.8)) * (charging ? 0.12 : 0.05);
        g.visible = u.state !== 'under';

        // yawn: jaw opens wide and closes
        var jaw = u.state === 'yawn' ? Math.pow(Math.sin(Math.PI * Math.min(1, u.st / u.dur)), 0.6) * 0.95 : 0;
        jawPivot.rotation.x += (jaw - jawPivot.rotation.x) * Math.min(1, dt * 8);
        // ear flicks
        u.nextFlick -= dt;
        if (u.nextFlick <= 0 && (u.state === 'lurk' || u.state === 'surface')) { u.earFlick = 1; u.nextFlick = 2 + R() * 4; }
        u.earFlick = Math.max(0, u.earFlick - dt * 2.2);
        ears.forEach(function (e, i) { e.rotation.z = -0.32 * e.userData.side + Math.sin(now * 2 + i) * 0.04 + Math.sin(now * 34 + i) * 0.28 * u.earFlick; });
        // paddling legs and wagging tail
        var moving = sp > 0.1;
        legs.forEach(function (l, i) { l.rotation.x = Math.sin(now * (moving ? 5 : 1.5) + i * Math.PI / 2) * (moving ? 0.6 : 0.15); });
        tailPiv.rotation.z = Math.sin(now * (u.state === 'surface' || u.state === 'yawn' ? 7 : 2)) * (u.state === 'surface' || u.state === 'yawn' ? 0.45 : 0.15);

        // nose spray while lurking, wake ripples while moving, bubbles while under
        u.nextSpray -= dt;
        if (u.nextSpray <= 0 && u.state === 'lurk') {
          body.localToWorld(tmp.set(0, 0.68, 3.0));
          spray(tmp.x, Math.max(tmp.y, wy + 0.05), tmp.z, 12, 0.6, 2.6);
          u.nextSpray = 4 + R() * 5;
        }
        u.rip -= dt;
        if (u.rip <= 0 && (u.state === 'lurk' || u.state === 'surface')) { ripple(u.x, u.z, moving ? 2.2 : 1.6); u.rip = moving ? 0.7 : 1.6; }
        u.bub -= dt;
        if (u.bub <= 0 && u.state === 'under') { spray(u.x + (R() - 0.5) * 0.6, wy + 0.02, u.z + (R() - 0.5) * 0.6, 2, 0.15, 0.5); ripple(u.x, u.z, 0.5); u.bub = 0.3; }
        if (u.state === 'emerge' && u.st > 0.6 && u.st - dt <= 0.6) { body.localToWorld(tmp.set(0, 0.68, 3.0)); spray(tmp.x, tmp.y, tmp.z, 14, 0.7, 3); }

        // droplets fly, fall, vanish into the water
        for (var q = 0; q < DN; q++) {
          var dp = drops[q];
          if (dp.life > 1.6) continue;
          dp.life += dt; dp.vy -= 9.8 * dt;
          dPos[q * 3] += dp.vx * dt; dPos[q * 3 + 1] += dp.vy * dt; dPos[q * 3 + 2] += dp.vz * dt;
          if (dPos[q * 3 + 1] < wave(dPos[q * 3], dPos[q * 3 + 2], now) - 0.05) { dp.life = 9; dPos[q * 3 + 1] = -100; }
        }
        dGeo.attributes.position.needsUpdate = true;
      };
    })();

    // khom loi lanterns (glowing paper shader)
    var lanternGeo = new THREE.LatheGeometry([[0.32, 0], [0.42, 0.25], [0.52, 0.75], [0.5, 1.1], [0.0, 1.14]].map(function (p) { return new THREE.Vector2(p[0], p[1]); }), 16);
    var lanternMat = new THREE.ShaderMaterial({
      side: THREE.DoubleSide, uniforms: { uFlick: { value: 1 } },
      vertexShader: [
        'varying vec2 vUv; varying vec3 vN;',
        'void main(){',
        '  vUv = uv; vec4 p = vec4(position, 1.0); vec3 n = normal;',
        '  #ifdef USE_INSTANCING',
        '  p = instanceMatrix * p; n = mat3(instanceMatrix) * n;',
        '  #endif',
        '  vN = normalize(normalMatrix * n);',
        '  gl_Position = projectionMatrix * modelViewMatrix * p;',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform float uFlick; varying vec2 vUv; varying vec3 vN;',
        'void main(){',
        '  vec3 col = mix(vec3(1.0, 0.9, 0.55), vec3(0.95, 0.34, 0.1), smoothstep(0.0, 1.0, vUv.y));',
        '  col *= (1.35 - 0.6 * vUv.y) * uFlick;',
        '  float f = fract(vUv.x * 8.0); float rib = min(f, 1.0 - f);',
        '  col *= mix(0.72, 1.0, smoothstep(0.0, 0.06, rib));',
        '  col += vec3(1.0, 0.55, 0.25) * (1.0 - abs(vN.z)) * 0.2;',
        '  float alpha = 1.0;', OUT,
        '}'
      ].join('\n')
    });
    // sky lanterns: every body in one instanced draw, every glow in one point system
    var LC = Q.lanterns, lanterns = [];
    var lanternMesh = new THREE.InstancedMesh(lanternGeo, lanternMat, LC);
    lanternMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    lanternMesh.frustumCulled = false;   // instances spread far beyond the base geometry's bounds
    scene.add(lanternMesh);
    var lgPos = new Float32Array(LC * 3), lgGeo = new THREE.BufferGeometry();
    lgGeo.setAttribute('position', new THREE.BufferAttribute(lgPos, 3));
    var lgPts = new THREE.Points(lgGeo, new THREE.PointsMaterial({ size: 3.6, map: flameTex, color: 0xb37a38, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    lgPts.frustumCulled = false;
    scene.add(lgPts);
    function resetLantern(l, first) {
      l.x = -42 + R() * 84; l.y = first ? R() * 42 : 0.5; l.z = -26 - R() * 46;
      l.vy = 0.55 + R() * 0.8; l.ph = R() * 6; l.bx = l.x;
    }
    for (var lc = 0; lc < LC; lc++) { var lt = { s: 0.8 + R() * 0.9 }; resetLantern(lt, true); lanterns.push(lt); }
    var lanternM = new THREE.Matrix4(), lanternQ = new THREE.Quaternion(), lanternE = new THREE.Euler(), lanternP = new THREE.Vector3(), lanternS = new THREE.Vector3();

    // fireflies
    var FF = Q.fireflies, ffPos = new Float32Array(FF * 3), ffCol = new Float32Array(FF * 3), ffData = [];
    for (var fi = 0; fi < FF; fi++) {
      var fs = fi % 2 ? 1 : -1;
      ffData.push({ x: fs * (4 + R() * 16), y: 0.6 + R() * 2.6, z: 6 - R() * 32, ph: R() * 6, sp: 0.4 + R() * 0.6 });
    }
    var ffGeo = new THREE.BufferGeometry();
    ffGeo.setAttribute('position', new THREE.BufferAttribute(ffPos, 3));
    ffGeo.setAttribute('color', new THREE.BufferAttribute(ffCol, 3));
    scene.add(new THREE.Points(ffGeo, new THREE.PointsMaterial({ size: 0.35, map: softTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));

    // sparkles around the hero
    var SP = Q.sparkles, spPos = new Float32Array(SP * 3), spData = [];
    for (var s = 0; s < SP; s++) spData.push({ a: R() * 6.28, r: 1.2 + R() * 2.2, y: R() * 2.5, sp: 0.2 + R() * 0.5 });
    var sparkGeo = new THREE.BufferGeometry(); sparkGeo.setAttribute('position', new THREE.BufferAttribute(spPos, 3));
    scene.add(new THREE.Points(sparkGeo, new THREE.PointsMaterial({ size: 0.18, map: softTex, color: 0xfff0a0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));

    // shooting stars
    var shooters = [];
    function shootingStar() {
      var dir = R() < 0.5 ? 1 : -1, ang = dir > 0 ? -0.38 - R() * 0.2 : Math.PI + 0.38 + R() * 0.2;
      var st = sprite(streakTex, 0xffffff, 1, 0);
      st.material.rotation = ang;
      st.scale.set(46, 1.6, 1);
      st.position.set(-dir * (60 + R() * 120), 140 + R() * 50, -320);
      st.userData = { v: new THREE.Vector3(Math.cos(ang), Math.sin(ang), 0).multiplyScalar(220), life: 0 };
      scene.add(st); shooters.push(st);
    }

    // ---- fireworks: rockets with trails → peony / two-tone / ring / willow / heart
    // Everything comes from fixed pools made once: a burst no longer allocates buffers, materials or
    // hundreds of vectors (that garbage made weaker computers hitch every few seconds).
    var FW_COLORS = [0xff5e8a, 0xffd166, 0x7bdff2, 0xb388ff, 0x95f985, 0xff9f43, 0xffffff];
    function pickCol(target) { return (target || new THREE.Color()).set(FW_COLORS[Math.floor(R() * FW_COLORS.length)]); }
    var TRAIL = 16, MAXP = Q.burst;
    var flash = { level: 0, col: new THREE.Color(0xffffff) };
    function additivePoints(size, count) {
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
      var pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: size, map: softTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      pts.frustumCulled = false; pts.visible = false;
      scene.add(pts);
      return pts;
    }
    var rocketPool = [], burstPool = [];
    for (var rpI = 0; rpI < 6; rpI++) {
      var hd = sprite(softTex, 0xffffff, 1.6, 1); hd.visible = false; scene.add(hd);
      rocketPool.push({ active: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), col: new THREE.Color(), head: hd, trail: additivePoints(0.8, TRAIL), fuse: 0 });
    }
    for (var bpI = 0; bpI < 8; bpI++) {
      var fl0 = sprite(softTex, 0xffffff, 34, 0); fl0.visible = false; scene.add(fl0);
      burstPool.push({ active: false, pts: additivePoints(1.7, MAXP), vel: new Float32Array(MAXP * 3), n: 0, flash: fl0, life: 0,
        drag: 0, grav: 0, max: 0, size: 1.7, col: new THREE.Color(), crackle: true });
    }

    function launchRocket(x) {
      var rk = null;
      for (var i = 0; i < rocketPool.length; i++) if (!rocketPool[i].active) { rk = rocketPool[i]; break; }
      if (!rk) return;
      pickCol(rk.col);
      rk.pos.set(x != null ? x : -42 + R() * 84, 0.5, -74 - R() * 14);
      rk.vel.set((R() - 0.5) * 3, 22 + R() * 7, 0);
      rk.fuse = 0.95 + R() * 0.45; rk.active = true;
      rk.head.material.color.copy(rk.col); rk.head.position.copy(rk.pos); rk.head.visible = true;
      var tp = rk.trail.geometry.attributes.position.array, tc = rk.trail.geometry.attributes.color.array;
      for (var j = 0; j < TRAIL; j++) {
        tp[j * 3] = rk.pos.x; tp[j * 3 + 1] = rk.pos.y; tp[j * 3 + 2] = rk.pos.z;
        var k = Math.pow(1 - j / TRAIL, 1.6);
        tc[j * 3] = (rk.col.r * 0.5 + 0.5) * k; tc[j * 3 + 1] = (rk.col.g * 0.5 + 0.4) * k; tc[j * 3 + 2] = (rk.col.b * 0.5 + 0.2) * k;
      }
      rk.trail.geometry.attributes.position.needsUpdate = true; rk.trail.geometry.attributes.color.needsUpdate = true;
      rk.trail.visible = true;
    }

    var TYPES = ['peony', 'twotone', 'ring', 'willow', 'heart', 'peony', 'twotone'];
    var FW_CFG = { peony: [1.6, 3.2, 2.4], twotone: [1.6, 3.0, 2.5], ring: [1.5, 2.6, 2.3], willow: [0.9, 4.2, 3.6], heart: [2.4, 0.9, 2.6] };
    var colA0 = new THREE.Color(), colB0 = new THREE.Color(), dirV = new THREE.Vector3(), ringQ = new THREE.Quaternion(), ringE = new THREE.Euler();
    function explode(c, colA, forceType) {
      var fw = null, oldest = null;
      for (var i = 0; i < burstPool.length; i++) {
        var b = burstPool[i];
        if (!b.active) { fw = b; break; }
        if (!oldest || b.life > oldest.life) oldest = b;
      }
      fw = fw || oldest;   // all busy: recycle the one closest to fading out
      var type = forceType || TYPES[Math.floor(R() * TYPES.length)];
      if (sfx) sfx.burst();
      colA0.copy(colA || pickCol(colA0)); pickCol(colB0);
      if (type === 'willow') { colA0.set(0xffc35a); colB0.set(0xfff0b0); }
      if (type === 'heart') { colA0.set(0xff5e8a); colB0.set(0xffa1c1); }
      var n = type === 'heart' ? Math.round(MAXP * 0.77) : MAXP;
      var pos = fw.pts.geometry.attributes.position.array, cols = fw.pts.geometry.attributes.color.array, vel = fw.vel;
      var speed = type === 'willow' ? 6 : 8 + R() * 4;
      ringQ.setFromEuler(ringE.set(R() * 1.2 - 0.6, R() * 6, R() * 1.2 - 0.6));
      for (var p = 0; p < n; p++) {
        var cc = p % 2 ? colA0 : colB0;
        if (type === 'ring') {
          var a = (p / n) * Math.PI * 2;
          dirV.set(Math.cos(a), Math.sin(a), 0).applyQuaternion(ringQ).multiplyScalar(speed);
          cc = colA0;
        } else if (type === 'heart') {
          var th2 = (p / n) * Math.PI * 2, sx = Math.sin(th2);
          dirV.set(16 * sx * sx * sx, 13 * Math.cos(th2) - 5 * Math.cos(2 * th2) - 2 * Math.cos(3 * th2) - Math.cos(4 * th2), (R() - 0.5) * 2).multiplyScalar(speed / 15);
        } else {
          var u2 = R() * 2 - 1, th = R() * Math.PI * 2, r = Math.sqrt(1 - u2 * u2);
          dirV.set(r * Math.cos(th), u2, r * Math.sin(th)).multiplyScalar(speed * (0.85 + R() * 0.15));
          if (type === 'twotone') { cc = p < n * 0.4 ? colB0 : colA0; if (p < n * 0.4) dirV.multiplyScalar(0.5); }
        }
        vel[p * 3] = dirV.x; vel[p * 3 + 1] = dirV.y; vel[p * 3 + 2] = dirV.z;
        pos[p * 3] = c.x; pos[p * 3 + 1] = c.y; pos[p * 3 + 2] = c.z;
        cols[p * 3] = cc.r; cols[p * 3 + 1] = cc.g; cols[p * 3 + 2] = cc.b;
      }
      fw.n = n;
      fw.pts.geometry.setDrawRange(0, n);
      fw.pts.geometry.attributes.position.needsUpdate = true; fw.pts.geometry.attributes.color.needsUpdate = true;
      fw.size = type === 'willow' ? 1.2 : 1.7; fw.pts.material.size = fw.size;
      var cfg = FW_CFG[type];
      fw.drag = cfg[0]; fw.grav = cfg[1]; fw.max = cfg[2]; fw.crackle = type !== 'heart';
      fw.col.copy(colA0); fw.life = 0; fw.active = true; fw.pts.visible = true;
      fw.flash.material.color.copy(colA0); fw.flash.material.opacity = 0.7; fw.flash.position.copy(c); fw.flash.visible = true;
    }

    function updateFireworks(dt) {
      for (var ri = 0; ri < rocketPool.length; ri++) {
        var rk = rocketPool[ri];
        if (!rk.active) continue;
        rk.fuse -= dt; rk.vel.y -= 9 * dt;
        rk.pos.addScaledVector(rk.vel, dt);
        rk.head.position.copy(rk.pos);
        var tp = rk.trail.geometry.attributes.position.array;
        for (var ti = TRAIL - 1; ti > 0; ti--) { tp[ti * 3] = tp[ti * 3 - 3]; tp[ti * 3 + 1] = tp[ti * 3 - 2] - 0.05; tp[ti * 3 + 2] = tp[ti * 3 - 1]; }
        tp[0] = rk.pos.x; tp[1] = rk.pos.y; tp[2] = rk.pos.z;
        rk.trail.geometry.attributes.position.needsUpdate = true;
        if (rk.fuse <= 0) {
          rk.active = false; rk.head.visible = false; rk.trail.visible = false;
          explode(rk.pos, rk.col);
        }
      }
      flash.level = Math.max(0, flash.level - dt * 2.2);
      for (var bi = 0; bi < burstPool.length; bi++) {
        var fw = burstPool[bi];
        if (!fw.active) continue;
        fw.life += dt;
        var arr = fw.pts.geometry.attributes.position.array, v = fw.vel, drag = Math.max(0, 1 - fw.drag * dt), gdt = fw.grav * dt;
        for (var j = 0, n3 = fw.n * 3; j < n3; j += 3) {
          v[j] *= drag; v[j + 1] = v[j + 1] * drag - gdt; v[j + 2] *= drag;
          arr[j] += v[j] * dt; arr[j + 1] += v[j + 1] * dt; arr[j + 2] += v[j + 2] * dt;
        }
        fw.pts.geometry.attributes.position.needsUpdate = true;
        var lk = fw.life / fw.max;
        fw.pts.material.opacity = Math.max(0, 1 - lk * lk) * (0.8 + 0.2 * Math.sin(fw.life * 40));
        fw.pts.material.size = fw.size * (fw.crackle && lk > 0.55 ? 0.6 + R() * 0.8 : 1);
        var fo = Math.max(0, 0.7 - fw.life * 2.6);
        fw.flash.material.opacity = fo;
        if (fo <= 0) fw.flash.visible = false;
        if (fo > flash.level) { flash.level = fo; flash.col.copy(fw.col); }
        if (fw.life > fw.max) { fw.active = false; fw.pts.visible = false; fw.flash.visible = false; }
      }
    }

    // ---- post-processing: bloom + vignette/grade/grain
    var composer = null, bloomPass = null, finalPass = null;
    if (useBloom && THREE.EffectComposer && THREE.UnrealBloomPass) {
      try {
        composer = new THREE.EffectComposer(renderer);
        composer.addPass(new THREE.RenderPass(scene, camera));
        bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(256, 256), 0.7, 0.55, 0.82);
        composer.addPass(bloomPass);
        finalPass = new THREE.ShaderPass({
          uniforms: { tDiffuse: { value: null }, uTime: { value: 0 } },
          vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
          fragmentShader: [
            'uniform sampler2D tDiffuse; uniform float uTime; varying vec2 vUv;',
            'float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }',
            'void main(){',
            '  vec4 c = LinearTosRGB(texture2D(tDiffuse, vUv));',
            '  float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));',
            '  c.rgb = mix(vec3(l), c.rgb, 1.12);',
            '  c.rgb = mix(c.rgb, c.rgb * vec3(1.04, 0.98, 1.06), 0.6);',
            '  vec2 d = vUv - 0.5; float vig = smoothstep(0.9, 0.28, length(d * vec2(1.0, 1.2)));',
            '  c.rgb *= mix(0.5, 1.0, vig);',
            '  c.rgb += (hash(vUv * 1000.0 + fract(uTime)) - 0.5) * 0.022;',
            '  gl_FragColor = vec4(c.rgb, 1.0);',
            '}'
          ].join('\n')
        });
        composer.addPass(finalPass);
      } catch (e) { composer = null; }
    }

    // ---- loop
    var lastNow = 0, t = 0, nextRocket = reduced ? 3 : 1.4, nextShooter = 3 + R() * 3, raf = 0, running = true;
    var salvo = reduced ? [] : [1.3, 1.55, 1.8];
    var tmpLook = new THREE.Vector3(), labelV = new THREE.Vector3(), viewW = 1, viewH = 1, frameCards = [];
    function ease(x) { return x < 0 ? 0 : x > 1 ? 1 : 1 - Math.pow(1 - x, 3); }
    function elastic(x) { return x >= 1 ? 1 : 1 - Math.pow(2, -9 * x) * Math.cos(x * 14); }

    function resize() {
      var w = canvas.clientWidth || global.innerWidth, h = canvas.clientHeight || global.innerHeight;
      renderer.setSize(w, h, false);
      viewW = w; viewH = h;
      camera.aspect = w / h;
      table.resize(w, h);
      var portrait = camera.aspect < 0.8;
      camera.fov = portrait ? 66 : 50;
      camFinal.set(0, portrait ? 4.6 : 3.4, portrait ? 15.5 : 12);
      camera.updateProjectionMatrix();
      var mx = portrait ? 0 : Math.min(26, 10 + camera.aspect * 6);
      moon.position.set(mx, portrait ? 26 : 24, -110);
      moonGlow.position.set(mx, moon.position.y, -112);
      moonHalo.position.set(mx, moon.position.y, -114);
      moonLight.position.set(mx * 0.5, 25, -60);
      // building on the right bank, pulled in on portrait screens so it stays in frame
      if (portrait) { building.position.set(12.5, 0, -60); building.rotation.y = -0.12; }
      else { building.position.set(Math.min(34, 18 + camera.aspect * 8), 0, -60); building.rotation.y = -0.2; }
      waterMat.uniforms.uMoonX.value = mx;
      // keep the drawing buffer near 2.6 million pixels: big or high-DPI screens otherwise cost several times more per frame
      PR = Math.min(basePR, prLimit, Math.max(0.75, Math.sqrt(2.6e6 / Math.max(1, w * h))));
      renderer.setPixelRatio(PR);
      starMat.uniforms.uPR.value = PR;
      renderer.setSize(w, h, false);
      if (composer) {
        composer.setPixelRatio(Math.min(PR, w < 700 ? 1.25 : 1.5, w * h > 1.6e6 ? 1 : 2));
        composer.setSize(w, h);
      }
    }

    // FPS governor: if frames stay slow, step down — bloom off → lower resolution → 30fps cap
    var perf = { ema: 16.7, slow: 0, settleAt: 5, step: 0, cap: 0, spikes: 0, worst: 0, worstAt: 0 };   // ignore the startup seconds (shader compiles, thumbnails)
    function degrade() {
      perf.step++;
      if (composer) {
        if (bloomPass && bloomPass.dispose) bloomPass.dispose();
        composer.renderTarget1.dispose(); composer.renderTarget2.dispose();
        composer = null; bloomPass = null; finalPass = null; useBloom = false;
        moon.material.color.set(0xffffff);
      } else if (PR > 1) { prLimit = 1; resize(); }
      else if (PR > 0.75) { prLimit = 0.75; resize(); }
      else if (!perf.cap) { perf.cap = 30; }
      else { perf.step = 99; }
      if (env.onDegrade) env.onDegrade(perf.step);
    }
    function frame(now) {
      if (!running) return;
      raf = requestAnimationFrame(frame);
      now = now || performance.now();
      if (perf.cap && lastNow && now - lastNow < 1000 / perf.cap - 2) return;
      var raw = lastNow ? (now - lastNow) / 1000 : 1 / 60;
      lastNow = now;
      var dt = Math.min(raw, 0.05); t += dt;
      if (raw < 0.5) { // ignore long gaps (tab switches)
        // a long frame is a visible hitch even when the average looks fine
        var ms = raw * 1000;
        perf.spikes *= Math.exp(-dt / 4);
        if (t > perf.settleAt && ms > Math.max(50, perf.ema * 2.5)) perf.spikes += 1;
        if (ms > perf.worst || now - perf.worstAt > 3000) { perf.worst = ms; perf.worstAt = now; }
        perf.ema = perf.ema * 0.92 + ms * 0.08;
        if (t > perf.settleAt && perf.spikes > 6 && perf.step < 99) { perf.spikes = 0; perf.settleAt = t + 3; degrade(); }
        if (t > perf.settleAt && perf.step < 99) {
          var budget = perf.cap ? 1000 / perf.cap + 8 : 28;   // ~35fps, or below the cap
          perf.slow = perf.ema > budget ? perf.slow + dt : Math.max(0, perf.slow - dt * 0.5);
          if (perf.slow > 2.5) { perf.slow = 0; perf.settleAt = t + 2; degrade(); }
        }
      }

      if (table.active) { table.frame(dt); renderer.render(table.scene, table.camera); return; }

      // camera intro + gentle drift
      var p = reduced ? 1 : ease(t / 4.2);
      camera.position.lerpVectors(camStart, camFinal, p);
      camera.position.x += Math.sin(t * 0.25) * 0.4 * p;
      camera.position.y += Math.sin(t * 0.4) * 0.12 * p;
      tmpLook.lerpVectors(lookStart, lookFinal, p);
      if (demoMode) { // slow cinematic sweep for showcasing
        camera.position.x += Math.sin(t * 0.07) * 3.5 * p;
        camera.position.y += Math.sin(t * 0.05) * 0.7 * p;
        tmpLook.x += Math.sin(t * 0.07) * 1.5 * p;
      }
      camera.lookAt(tmpLook);

      starMat.uniforms.uTime.value = t;
      waterMat.uniforms.uTime.value = t;
      if (finalPass) finalPass.uniforms.uTime.value = t;
      moonGlow.material.opacity = (useBloom ? 0.5 : 0.85) + Math.sin(t * 0.8) * 0.06;
      lanternMat.uniforms.uFlick.value = 1 + Math.sin(t * 9) * 0.03 + Math.sin(t * 23) * 0.02;

      clouds.forEach(function (c) { c.position.x = c.userData.base + Math.sin(t * 0.05 + c.userData.ph) * 6; });
      for (var vq = 0; vq < VL; vq++) {
        var vb = (0.6 + 0.4 * Math.sin(t * 3 + vlPh[vq])) * 0.9;
        vlCol[vq * 3] = VL_R * vb; vlCol[vq * 3 + 1] = VL_G * vb; vlCol[vq * 3 + 2] = VL_B * vb;
      }
      vlGeo.attributes.color.needsUpdate = true;
      mists.forEach(function (m) { m.position.x = m.userData.bx + Math.sin(t * m.userData.sp + m.userData.ph) * 10; });
      lotuses.forEach(function (lo) {
        lo.position.y = wave(lo.position.x, lo.position.z, t) + 0.02;
        lo.rotation.x = (wave(lo.position.x, lo.position.z + 0.6, t) - wave(lo.position.x, lo.position.z - 0.6, t)) * 0.6;
        lo.rotation.y = Math.sin(t * 0.2 + lo.userData.ph) * 0.2;
      });

      // krathongs
      var li = 0;
      for (var i = krathongs.length - 1; i >= 0; i--) {
        var k = krathongs[i], d = k.userData;
        k.position.x += d.vx * dt; k.position.z += d.vz * dt;
        var x = k.position.x, z = k.position.z;
        k.position.y = wave(x, z, t) + 0.02;
        k.rotation.x = (wave(x, z + 0.6, t) - wave(x, z - 0.6, t)) * 0.9;
        k.rotation.z = -(wave(x + 0.6, z, t) - wave(x - 0.6, z, t)) * 0.9;
        k.rotation.y += d.spin * dt;
        if (d.wob > 0.002 || Math.abs(d.bspin || 0) > 0.01 || Math.abs(d.pvx || 0) + Math.abs(d.pvz || 0) > 0.01) {   // settling after a bump
          d.wobT += dt;
          var wt = d.wob * Math.sin(d.wobT * 9);
          k.rotation.x += Math.cos(d.wobAx) * wt; k.rotation.z += Math.sin(d.wobAx) * wt;
          d.wob *= Math.exp(-dt * 1.6);
          k.rotation.y += d.bspin * dt; d.bspin *= Math.exp(-dt * 1.4);
          k.position.x += d.pvx * dt; k.position.z += d.pvz * dt;
          d.pvx *= Math.exp(-dt * 1.8); d.pvz *= Math.exp(-dt * 1.8);
        }
        if (d.pop < 1) { d.pop = Math.min(1, d.pop + dt * 1.1); k.scale.setScalar(d.scale * Math.max(0.001, elastic(d.pop))); }
        var fl = 1 + 0.16 * Math.sin(t * 13 + d.ph) + 0.08 * Math.sin(t * 7.3 + d.ph * 2);
        d.flame.scale.set(1.1 * fl, 1.25 * fl, 1);
        d.core.scale.set(1, fl, 1);
        // soften glow when the krathong is close to the camera so it does not wash out
        var camNear = Math.max(0, Math.min(1, (camera.position.distanceTo(k.position) - 3.5) / 9));
        d.halo.material.opacity = (0.28 + 0.08 * fl) * (0.2 + 0.8 * camNear);
        d.flame.material.opacity = 0.6 + 0.4 * camNear;
        if (d.labelEl) {
          // pin the name + wish card above the krathong; shrink and fade as it drifts away
          labelV.set(x, k.position.y + 1.9 * d.scale * Math.max(0.001, elastic(d.pop)), z).project(camera);
          var sx = (labelV.x * 0.5 + 0.5) * viewW, sy = (-labelV.y * 0.5 + 0.5) * viewH;
          var dist = camera.position.distanceTo(k.position);
          // desktop: shrink more gently and never below ~11px text, a bit larger on wide screens
          var lsc = viewW >= 1024
            ? Math.max(1, Math.min(1.3, viewW / 1280)) *Math.max(0.75, Math.min(1.1, 11 / dist))
            : Math.max(0.35, Math.min(1.1, 8 / dist));
          var lop = labelV.z < 1 ? Math.max(0, Math.min(1, (z + 44) / 16)) : 0;
          // keep the whole card on screen (narrow phones)
          if (!d.labelW) d.labelW = d.labelEl.offsetWidth || 200;
          var halfW = d.labelW * lsc / 2 + 8;
          sx = halfW * 2 > viewW ? viewW / 2 : Math.max(halfW, Math.min(viewW - halfW, sx));
          frameCards.push({ d: d, sx: sx, sy: sy, rawSy: sy, sc: lsc, op: lop });
        }
        if (z < -58) {
          if (d.hero) { heroGone = true; disposeKrathong(k); krathongs.splice(i, 1); continue; }   // floats away for good
          if (d.user) {
            var wi = d.wishInfo;
            if (wi && !wi.other && R() < wi.chance) {   // your own may drift back into view once (others come back via the feed)
              returnQueue.push({ at: t + 6 + R() * 14, info: { name: wi.name, wish: wi.wish, other: wi.other, variant: d.variant, design: wi.design, photo: wi.photo, chance: 0, returning: true } });
            }
            disposeKrathong(k); krathongs.splice(i, 1); continue;
          }
          k.position.set(-14 + R() * 28, 0, 7 + R() * 3);
          d.pop = 0; d.coin.visible = true; d.robbed = false; d.claimed = null;
        }
        if (li < MAXL) { lightArr[li].set(k.position.x, 0, k.position.z); li++; }
      }
      for (; li < MAXL; li++) lightArr[li].set(0, -100, 9999);

      // wish cards: nearer ones (lower on screen) keep their spot, overlapping ones slide up above them
      frameCards.sort(function (a, b) { return b.rawSy - a.rawSy; });
      for (var fc = 0; fc < frameCards.length; fc++) {
        var cd = frameCards[fc], dd = cd.d;
        if (!dd.labelH) dd.labelH = dd.labelEl.offsetHeight || 60;
        cd.w = dd.labelW * cd.sc; cd.h = (dd.labelH + 16) * cd.sc;   // + the little stem under the card
        for (var pass = 0; pass < 4; pass++) {
          var moved = false;
          for (var pc = 0; pc < fc; pc++) {
            var oc = frameCards[pc];
            if (oc.op < 0.05 || cd.op < 0.05) continue;
            var xOver = Math.abs(cd.sx - oc.sx) < (cd.w + oc.w) / 2 + 6;
            var yOver = cd.sy > oc.sy - oc.h - 6 && cd.sy - cd.h < oc.sy + 6;
            if (xOver && yOver) { cd.sy = oc.sy - oc.h - 8; moved = true; }
          }
          if (!moved) break;
        }
        // ease the offset so cards glide apart instead of jumping
        var want = cd.sy - cd.rawSy;
        dd.cardOff = (dd.cardOff || 0) + (want - (dd.cardOff || 0)) * Math.min(1, dt * 8);
        var fy = Math.max(cd.h + 8, cd.rawSy + dd.cardOff);
        dd.labelEl.style.transform = 'translate(' + cd.sx.toFixed(1) + 'px,' + fy.toFixed(1) + 'px) translate(-50%,-100%) scale(' + cd.sc.toFixed(3) + ')';
        // desktop: cards pushed up into the big title fade out instead of sitting under it
        var cardTop = fy - cd.h;
        if (viewW >= 1024) cd.op *= Math.max(0, Math.min(1, (cardTop - viewH * 0.2) / 40));
        dd.labelEl.style.opacity = cd.op.toFixed(3);
      }
      frameCards.length = 0;
      if (heroLight) heroLight.intensity = 0.7 + 0.15 * Math.sin(t * 12);

      // kids + ripples
      for (var kd = 0; kd < kids.length; kd++) updateKid(kids[kd], dt, t);
      updateDog(dt, t);
      for (var rq = 0; rq < ripples.length; rq++) {
        var rr = ripples[rq], rl = rr.userData.life;
        if (rl > 1.2) { rr.visible = false; continue; }
        rr.userData.life = rl + dt;
        rr.scale.setScalar(rr.userData.s * (1 + rl * 1.8));
        rr.material.opacity = 0.45 * (1 - rl / 1.2);
        rr.position.y = wave(rr.position.x, rr.position.z, t) + 0.04;
      }

      // lanterns
      for (var lq = 0; lq < LC; lq++) {
        var ln = lanterns[lq];
        ln.y += ln.vy * dt;
        ln.x = ln.bx + Math.sin(t * 0.6 + ln.ph) * 1.2;
        if (ln.y > 58) resetLantern(ln, false);
        lanternM.compose(lanternP.set(ln.x, ln.y, ln.z), lanternQ.setFromEuler(lanternE.set(0, 0, Math.sin(t * 0.9 + ln.ph) * 0.08)), lanternS.set(ln.s, ln.s, ln.s));
        lanternMesh.setMatrixAt(lq, lanternM);
        lgPos[lq * 3] = ln.x; lgPos[lq * 3 + 1] = ln.y + 0.35 * ln.s; lgPos[lq * 3 + 2] = ln.z;
      }
      lanternMesh.instanceMatrix.needsUpdate = true;
      lgGeo.attributes.position.needsUpdate = true;

      // fireflies
      for (var fi = 0; fi < FF; fi++) {
        var f = ffData[fi], blink = Math.max(0, Math.sin(t * f.sp * 3 + f.ph));
        ffPos[fi * 3] = f.x + Math.sin(t * f.sp + f.ph) * 1.4;
        ffPos[fi * 3 + 1] = f.y + Math.sin(t * f.sp * 1.7 + f.ph * 2) * 0.5;
        ffPos[fi * 3 + 2] = f.z + Math.cos(t * f.sp * 0.8 + f.ph) * 1.4;
        ffCol[fi * 3] = 0.75 * blink; ffCol[fi * 3 + 1] = 1.0 * blink; ffCol[fi * 3 + 2] = 0.45 * blink;
      }
      ffGeo.attributes.position.needsUpdate = true; ffGeo.attributes.color.needsUpdate = true;

      // shooting stars
      nextShooter -= dt;
      if (nextShooter <= 0 && t > 3) { shootingStar(); nextShooter = 4 + R() * 6; }
      for (var si2 = shooters.length - 1; si2 >= 0; si2--) {
        var ss = shooters[si2]; ss.userData.life += dt;
        ss.position.addScaledVector(ss.userData.v, dt);
        var sl = ss.userData.life;
        ss.material.opacity = Math.min(1, sl * 6) * Math.max(0, 1 - sl / 1.1);
        if (sl > 1.1) { scene.remove(ss); ss.material.dispose(); shooters.splice(si2, 1); }
      }

      // wishes coming back
      for (var rqi = returnQueue.length - 1; rqi >= 0; rqi--) {
        if (t < returnQueue[rqi].at) continue;
        if (labelLayer && labelLayer.querySelectorAll('.lk-label').length >= 5) { returnQueue[rqi].at = t + 3; continue; }
        launchFront(returnQueue.splice(rqi, 1)[0].info);
      }

      // fireworks
      if (salvo.length && t > salvo[0]) { salvo.shift(); launchRocket(-30 + R() * 60); }
      nextRocket -= dt;
      if (nextRocket <= 0 && t > 2.6) { launchRocket(); nextRocket = Q.rocketGap + R() * 1.8; }
      updateFireworks(dt);
      waterMat.uniforms.uFlash.value = flash.level; waterMat.uniforms.uFlashCol.value.copy(flash.col);
      skyMat.uniforms.uFlash.value = flash.level; skyMat.uniforms.uFlashCol.value.copy(flash.col);
      hemi.intensity = 0.75 + flash.level * 0.5;

      // sparkles
      for (var si = 0; si < SP; si++) {
        var sd = spData[si]; sd.y += sd.sp * dt; if (sd.y > 3) sd.y = 0;
        var aa = sd.a + t * 0.3;
        spPos[si * 3] = hero.position.x + Math.cos(aa) * sd.r; spPos[si * 3 + 1] = heroGone ? -100 : 0.3 + sd.y; spPos[si * 3 + 2] = hero.position.z + Math.sin(aa) * sd.r;
      }
      sparkGeo.attributes.position.needsUpdate = true;

      renderer.info.reset();
      if (composer) composer.render(dt); else renderer.render(scene, camera);
      updateDebug(now);
    }

    // click on water → launch krathong there
    var raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
    function launchAt(clientX, clientY, look) {
      if (table.active) return false;
      var rect = canvas.getBoundingClientRect();
      ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      if (!raycaster.ray.intersectPlane(plane, hit)) return false;
      if (hit.z > 9 || hit.z < -40) return false;
      var k = addKrathong(hit.x, hit.z, 0.85, null, true, look || null);
      k.userData.user = true;
      if (sfx) sfx.launch(false);
      return true;
    }
    // info: { name, wish, other } — when a wish is given, the krathong carries a floating card with it.
    // other = a wish from another user: appears a little further out, blue card, no heart firework
    // returning = a wish that floated away and drifts back in (same look, no firework/chime)
    var returnQueue = [];
    var RETURN_CHANCE = env.returnChance == null ? 0 : Math.max(0, Math.min(1, env.returnChance));
    function launchFront(info) {
      var other = !!(info && info.other), returning = !!(info && info.returning);
      var variant = info && info.variant != null ? info.variant : null;
      var side = R() < 0.5 ? -1 : 1;
      var spread = camera.aspect < 0.8 ? 0.6 : 1;   // stay in frame on portrait phones
      var look = info && (info.design || info.photo) ? { design: info.design, photo: info.photo } : null;
      var k = other || returning
        ? addKrathong(0.6 + side * (3.5 + R() * 2.5) * spread, 2.5 + R() * 2.5, 0.9, variant, true, look)
        : addKrathong(0.6 + side * (2.4 + R() * 0.8) * spread, 6.6, 0.95, variant, true, look);
      k.userData.user = true; k.userData.vz = -0.9; k.userData.vx = (R() - 0.5) * 0.3;
      if (info && info.wish) {
        k.userData.wishInfo = { name: info.name, wish: info.wish, other: other, chance: info.chance == null ? RETURN_CHANCE : info.chance, design: info.design, photo: info.photo };
      }
      if (sfx) sfx.launch(!!(info && info.wish) && !other && !returning);
      if (info && info.wish && labelLayer) {
        var el = document.createElement('div'); el.className = other ? 'lk-label lk-label--other' : 'lk-label';
        if (info.key) el.dataset.key = info.key;
        var card = document.createElement('div'); card.className = 'lk-label-card';
        var nm = document.createElement('span'); nm.className = 'lk-label-name'; nm.textContent = info.name;
        var ws = document.createElement('span'); ws.className = 'lk-label-wish'; ws.textContent = info.wish;
        card.appendChild(nm); card.appendChild(ws); el.appendChild(card);
        labelLayer.appendChild(el);
        k.userData.labelEl = el;
        k.userData.vz = -0.6;                       // slower, so the wish can be read
        k.userData.vx = -side * (0.06 + R() * 0.06); // drift toward the moonlit path
      }
      if (!other && !returning) explode(new THREE.Vector3(-10 + R() * 20, 24, -80), pickCol(), 'heart');
    }

    function launchRandom() {
      var k = addKrathong(-10 + R() * 20, -2 - R() * 12, 0.85, null, true);
      k.userData.user = true;
      if (sfx) sfx.launch(false);
    }

    // small portraits of each krathong style for the picker (rendered off-screen, once)
    function makeThumbnails(size) {
      size = size || 160;
      var out = [], ts = new THREE.Scene(), cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
      cam.position.set(0, 2.5, 5.2); cam.lookAt(0, 0.62, 0);
      ts.add(new THREE.HemisphereLight(0xc9bcff, 0x2a1850, 0.95));
      var dl = new THREE.DirectionalLight(0xffe2c4, 0.75); dl.position.set(3, 6, 5); ts.add(dl);
      var rt = new THREE.WebGLRenderTarget(size, size), px = new Uint8Array(size * size * 4);
      var cv = document.createElement('canvas'); cv.width = cv.height = size;
      var c2 = cv.getContext('2d'), img = c2.createImageData(size, size);
      var lut = new Uint8ClampedArray(256);   // render target is linear: encode to sRGB for the <img>
      for (var li2 = 0; li2 < 256; li2++) lut[li2] = Math.round(255 * Math.pow(li2 / 255, 1 / 2.2));
      var prevColor = new THREE.Color(); renderer.getClearColor(prevColor); var prevAlpha = renderer.getClearAlpha();
      try {
        for (var s = 0; s < STYLES.length; s++) {
          var k = makeKrathong(s);
          k.rotation.y = -0.55; ts.add(k);
          renderer.setRenderTarget(rt);
          renderer.setClearColor(0x0a0520, 1); renderer.clear();
          renderer.render(ts, cam);
          renderer.readRenderTargetPixels(rt, 0, 0, size, size, px);
          for (var y = 0; y < size; y++) {
            for (var x = 0; x < size; x++) {
              var si = ((size - 1 - y) * size + x) * 4, di = (y * size + x) * 4;
              img.data[di] = lut[px[si]]; img.data[di + 1] = lut[px[si + 1]]; img.data[di + 2] = lut[px[si + 2]]; img.data[di + 3] = 255;
            }
          }
          c2.putImageData(img, 0, 0);
          out.push(cv.toDataURL('image/png'));
          ts.remove(k); disposeKrathong(k);
        }
      } finally {
        renderer.setRenderTarget(null); renderer.setClearColor(prevColor, prevAlpha);
        rt.dispose();
      }
      return out;
    }

    // ?lkdebug=1: a small live readout to diagnose a slow computer
    var dbgEl = null, dbgNext = 0;
    if (env.debug && labelLayer) {
      dbgEl = document.createElement('div');
      dbgEl.style.cssText = 'position:absolute;left:8px;bottom:8px;z-index:5;font:11px/1.45 ui-monospace,Consolas,monospace;color:#d7ffd9;background:rgba(0,0,0,.72);padding:6px 9px;border-radius:8px;white-space:pre;pointer-events:none';
      labelLayer.parentNode.appendChild(dbgEl);
    }
    function updateDebug(now) {
      if (!dbgEl || now < dbgNext) return;
      dbgNext = now + 500;
      var inf = renderer.info.render;
      dbgEl.textContent = 'tier ' + tier + ' · gpu ' + (env.gpu || '?').slice(0, 46) + '\n' +
        'fps ' + Math.round(1000 / perf.ema) + ' · worst ' + Math.round(perf.worst) + ' ms · hitches ' + perf.spikes.toFixed(1) + '\n' +
        'pixelRatio ' + PR.toFixed(2) + ' · bloom ' + (composer ? 'on' : 'off') + ' · cap ' + (perf.cap || '-') + ' · steps ' + perf.step + '\n' +
        'draws ' + inf.calls + ' · tris ' + inf.triangles + ' · krathongs ' + krathongs.length;
    }

    resize();
    try { renderer.compile(scene, camera); } catch (e) { /* compile lazily instead */ }
    setTimeout(prewarmKrathongs, 6000);   // after the intro: build the remaining krathong looks during idle time
    frame();

    return {
      thumbnails: makeThumbnails,
      // where the moon disc is on screen right now, in CSS pixels of the canvas: { x, y, d } (centre, diameter)
      moonScreen: function () {
        camera.updateMatrixWorld();
        var c = moon.position.clone().applyMatrix4(camera.matrixWorldInverse);
        var depth = Math.max(0.001, -c.z);
        var p = moon.position.clone().project(camera);
        var viewHalf = Math.tan(camera.fov * Math.PI / 360) * depth;
        return { x: (p.x + 1) / 2 * viewW, y: (1 - p.y) / 2 * viewH, d: moon.scale.y * (252 / 256) / (2 * viewHalf) * viewH };
      },
      stats: function () {
        return { tier: tier, gpu: env.gpu || '', pixelRatio: PR, bloom: !!composer, fpsCap: perf.cap || null, fps: Math.round(1000 / perf.ema),
          worstFrameMs: Math.round(perf.worst), hitches: +perf.spikes.toFixed(1), degradeSteps: perf.step, drawCalls: renderer.info.render.calls,
          dog: { state: dogInfo.state, charges: dogInfo.charges, bumps: dogInfo.bumps } };
      },
      resize: resize,
      launchAt: launchAt,
      launchFront: launchFront,
      launchRandom: launchRandom,
      setHeroLook: setHeroLook,
      snapshot: snapshot,
      table: table,
      dispose: function () {
        running = false; cancelAnimationFrame(raf);
        templateGeos.forEach(function (g) { g.dispose(); }); templateGeos.clear(); krathongTemplates = {};
        if (dbgEl && dbgEl.parentNode) dbgEl.parentNode.removeChild(dbgEl);
        scene.traverse(function (o) {
          if (o.geometry) o.geometry.dispose();
          if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { if (m.map) m.map.dispose(); m.dispose(); });
        });
        gradientMap.dispose();
        if (composer) {
          if (bloomPass && bloomPass.dispose) bloomPass.dispose();
          composer.renderTarget1.dispose(); composer.renderTarget2.dispose();
        }
        renderer.dispose();
        if (renderer.forceContextLoss) renderer.forceContextLoss();
      }
    };
  }

  // ---------------------------------------------------------------- audio
  // Original Thai-festival style tune synthesized with Web Audio (ranat-like lead,
  // khim arpeggio, ching/chap cymbals, drum, bass) + water ambience + sound effects.
  // Pass { musicUrl: '...' } to play your own (licensed) recording instead of the synth tune.
  var MUTE_KEY = 'loykrathong-egg-muted';

  function createAudio(opts) {
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return null;
    var ctx;
    try { ctx = new AC(); } catch (e) { return null; }

    var vol = Math.max(0, Math.min(1, opts.musicVolume));
    var master = ctx.createGain(); master.gain.value = 0.0001;
    var comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 3;
    master.connect(comp); comp.connect(ctx.destination);
    var music = ctx.createGain(); music.gain.value = 0.5 * vol; music.connect(master);
    var sfx = ctx.createGain(); sfx.gain.value = 0.65 * vol; sfx.connect(master);

    // reverb (generated impulse)
    var verb = ctx.createConvolver();
    var irLen = Math.floor(ctx.sampleRate * 2.4), ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
    for (var ch = 0; ch < 2; ch++) {
      var dch = ir.getChannelData(ch);
      for (var i = 0; i < irLen; i++) dch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 3);
    }
    verb.buffer = ir;
    var verbIn = ctx.createGain(); verbIn.gain.value = 0.28;
    verbIn.connect(verb); verb.connect(master);
    music.connect(verbIn); sfx.connect(verbIn);

    var noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    var nd = noise.getChannelData(0);
    for (var n = 0; n < nd.length; n++) nd[n] = Math.random() * 2 - 1;
    function noiseSrc() { var s = ctx.createBufferSource(); s.buffer = noise; return s; }

    function env(g, t, peak, attack, decay) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    }
    function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
    function tone(t, freq, type, peak, decay, dest, freqEnd) {
      var o = ctx.createOscillator(); o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + decay * 0.6);
      var g = ctx.createGain(); env(g, t, peak, 0.004, decay);
      o.connect(g); g.connect(dest);
      o.start(t); o.stop(t + decay + 0.05);
    }
    function pluck(t, m, v, dest) {
      var f = mtof(m);
      tone(t, f, 'triangle', v, 0.55, dest);
      tone(t, f * 2, 'sine', v * 0.35, 0.35, dest);
      tone(t, f * 3.01, 'sine', v * 0.12, 0.18, dest);   // bright metallic khim/ranat partial
    }
    function noiseHit(t, type, freq, q, peak, decay, dest) {
      var s = noiseSrc(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      f.type = type; f.frequency.value = freq; f.Q.value = q;
      env(g, t, peak, 0.002, decay);
      s.connect(f); f.connect(g); g.connect(dest);
      s.start(t, Math.random() * 1.5); s.stop(t + decay + 0.05);
    }
    function ching(t, open) {
      noiseHit(t, 'bandpass', 7500, 2.5, open ? 0.15 : 0.11, open ? 0.32 : 0.045, music);
      if (open) { tone(t, 5180, 'sine', 0.025, 0.45, music); tone(t, 7340, 'sine', 0.018, 0.35, music); }
    }
    function drum(t, low) { tone(t, low ? 130 : 230, 'sine', low ? 0.5 : 0.3, low ? 0.28 : 0.14, music, low ? 55 : 150); }
    function bass(t, m) { tone(t, mtof(m), 'sine', 0.2, 0.7, music); tone(t, mtof(m), 'triangle', 0.05, 0.4, music); }

    // melody in C major pentatonic: [midi (0 = rest), length in eighth notes]; 16 bars
    var MEL = [
      [76, 2], [74, 1], [72, 1], [69, 2], [72, 2],
      [74, 2], [76, 1], [74, 1], [72, 1], [69, 1], [67, 2],
      [69, 2], [72, 1], [74, 1], [76, 2], [79, 1], [76, 1],
      [74, 1], [72, 1], [69, 1], [72, 1], [74, 4],
      [76, 2], [74, 1], [72, 1], [69, 2], [72, 2],
      [74, 2], [76, 1], [74, 1], [72, 1], [69, 1], [67, 1], [69, 1],
      [72, 2], [69, 1], [67, 1], [64, 2], [67, 1], [69, 1],
      [72, 4], [0, 4],
      [79, 2], [76, 1], [79, 1], [81, 2], [79, 1], [76, 1],
      [74, 2], [76, 1], [79, 1], [76, 2], [74, 1], [72, 1],
      [69, 1], [72, 1], [74, 1], [76, 1], [74, 1], [72, 1], [69, 1], [67, 1],
      [69, 4], [72, 2], [74, 2],
      [79, 2], [76, 1], [79, 1], [81, 2], [79, 1], [76, 1],
      [74, 2], [76, 1], [79, 1], [81, 1], [79, 1], [76, 1], [74, 1],
      [72, 1], [74, 1], [76, 1], [74, 1], [72, 1], [69, 1], [67, 1], [69, 1],
      [72, 4], [0, 4]
    ];
    var LEAD = [], pos = 0;
    MEL.forEach(function (ev) { if (ev[0]) LEAD[pos] = { m: ev[0], len: ev[1] }; pos += ev[1]; });
    var SONG_STEPS = pos; // 128
    var CHORD = {
      C: { root: 48, fifth: 55, arp: [55, 60, 64] },
      G: { root: 43, fifth: 50, arp: [55, 62, 67] },
      A: { root: 45, fifth: 52, arp: [57, 64, 69] }
    };
    var PROG = 'CGAGCGACCGAGCGAC';
    var EIGHTH = 60 / 108 / 2;

    function scheduleStep(i, t) {
      var s = i % SONG_STEPS, bar = Math.floor(s / 8), e = s % 8, c = CHORD[PROG[bar]];
      var ev = LEAD[s];
      if (ev) {
        pluck(t, ev.m, 0.2, music);
        // ranat-style tremolo on held notes
        var reps = ev.len >= 4 ? ev.len * 2 - 1 : ev.len >= 2 ? 1 : 0;
        for (var r = 1; r <= reps; r++) pluck(t + r * EIGHTH / 2, ev.m, 0.2 * 0.42 * (1 - r / (reps + 2)), music);
      }
      if (e % 2 === 1) pluck(t, c.arp[(e >> 1) % 3], 0.065, music);
      if (e === 0) bass(t, c.root);
      if (e === 4) bass(t, c.fifth);
      if (e === 1 || e === 5) ching(t, true);
      if (e === 3 || e === 7) ching(t, false);
      if (e === 0 || e === 6) drum(t, true);
      if (e === 3 || e === 4) drum(t, false);
    }

    var step = 0, nextT = 0, timer = null, stopped = false;
    function tick() {
      if (ctx.state !== 'running') return;
      if (nextT < ctx.currentTime - 0.05) nextT = ctx.currentTime + 0.05; // resumed after a pause
      while (nextT < ctx.currentTime + 0.15) {
        scheduleStep(step, nextT);
        step++;
        nextT += EIGHTH * (step % 2 ? 1.05 : 0.95); // light swing
      }
    }

    function startWater() {
      var s = noiseSrc(); s.loop = true;
      var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
      var g = ctx.createGain(); g.gain.value = 0.05;
      var lfo = ctx.createOscillator(); lfo.frequency.value = 0.15;
      var lg = ctx.createGain(); lg.gain.value = 180;
      lfo.connect(lg); lg.connect(lp.frequency);
      s.connect(lp); lp.connect(g); g.connect(sfx);
      s.start(); lfo.start();
    }

    // optional recording instead of the synth tune
    var el = null, elFade = null;
    if (opts.musicUrl) {
      el = new Audio(opts.musicUrl);
      el.loop = true; el.preload = 'auto'; el.volume = 0;
    }
    function fadeEl(to, sec, done) {
      if (!el) return;
      clearInterval(elFade);
      var from = el.volume, t0 = Date.now();
      elFade = setInterval(function () {
        var k = Math.min(1, (Date.now() - t0) / (sec * 1000));
        el.volume = from + (to - from) * k;
        if (k >= 1) { clearInterval(elFade); if (done) done(); }
      }, 50);
    }

    var muted = safeGet(MUTE_KEY) === '1';
    function applyGain(sec) {
      var now = ctx.currentTime, target = muted ? 0.0001 : 1;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now);
      master.gain.exponentialRampToValueAtTime(target, now + sec);
      if (el) { el.muted = muted; fadeEl(muted ? 0 : vol, sec); }
    }

    var wasRunning = false;
    function onVis() {
      if (stopped) return;
      if (document.hidden) {
        wasRunning = ctx.state === 'running';
        ctx.suspend(); if (el) el.pause();
      } else if (wasRunning) {
        ctx.resume(); if (el) el.play().catch(function () {});
      }
    }

    function unlock() {
      var p = ctx.resume();
      return Promise.resolve(p).then(function () {
        if (el && el.paused) return el.play().catch(function () {});
      }).catch(function () {});
    }

    return {
      start: function () {
        unlock();
        startWater();
        applyGain(2.5);
        if (el) el.play().catch(function () {});
        else { nextT = ctx.currentTime + 0.3; timer = setInterval(tick, 30); }
        document.addEventListener('visibilitychange', onVis);
      },
      unlock: unlock,
      isRunning: function () { return ctx.state === 'running' && (!el || !el.paused); },
      muted: function () { return muted; },
      setMuted: function (m) { muted = !!m; safeSet(MUTE_KEY, muted ? '1' : '0'); applyGain(0.4); },
      stop: function () {
        if (stopped) return; stopped = true;
        document.removeEventListener('visibilitychange', onVis);
        var now = ctx.currentTime;
        master.gain.cancelScheduledValues(now);
        master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now);
        master.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
        if (el) fadeEl(0, 0.7);
        setTimeout(function () {
          clearInterval(timer); clearInterval(elFade);
          if (el) { el.pause(); el.removeAttribute('src'); el.load(); }
          if (ctx.close) ctx.close();
        }, 800);
      },
      sfx: {
        burst: function () {
          if (stopped || ctx.state !== 'running') return;
          var t = ctx.currentTime + 0.04;
          var s = noiseSrc(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
          lp.type = 'lowpass';
          lp.frequency.setValueAtTime(1600, t); lp.frequency.exponentialRampToValueAtTime(200, t + 0.6);
          env(g, t, 0.2, 0.003, 0.7);
          s.connect(lp); lp.connect(g); g.connect(sfx);
          s.start(t, Math.random()); s.stop(t + 0.8);
          tone(t, 90, 'sine', 0.22, 0.35, sfx, 40);
          for (var i = 0; i < 6; i++) noiseHit(t + 0.5 + Math.random() * 0.8, 'highpass', 3000, 0.7, 0.045, 0.03, sfx); // crackle
        },
        coin: function () {
          if (stopped || ctx.state !== 'running') return;
          var t = ctx.currentTime + 0.01;
          pluck(t, 88, 0.12, sfx); pluck(t + 0.08, 95, 0.14, sfx);
          tone(t + 0.08, mtof(107), 'sine', 0.03, 0.4, sfx);
        },
        launch: function (wish) {
          if (stopped || ctx.state !== 'running') return;
          var t = ctx.currentTime + 0.01;
          tone(t, 280, 'sine', 0.18, 0.22, sfx, 620);                 // "bloop"
          noiseHit(t, 'bandpass', 900, 1.2, 0.08, 0.25, sfx);         // splash
          if (wish) [84, 88, 91, 96].forEach(function (m, k) { pluck(t + 0.12 + k * 0.09, m, 0.11, sfx); }); // wish chime
        }
      }
    };
  }

  var ICON_ON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z" fill="currentColor"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
  var ICON_OFF = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z" fill="currentColor"/><path d="m16 9 6 6M22 9l-6 6"/></svg>';

  // ---------------------------------------------------------------- overlay UI
  var active = null;

  // the moon with its rabbit, drawn in a 512×512 box (shared by the 3D scene and pages that show the same moon)
  function paintMoon(ctx) {
    ctx.save();
    ctx.beginPath(); ctx.arc(256, 256, 252, 0, Math.PI * 2); ctx.clip();
    var g = ctx.createRadialGradient(200, 190, 20, 256, 256, 262);
    g.addColorStop(0, '#fffdf0'); g.addColorStop(0.55, '#fff0c2'); g.addColorStop(1, '#f2cf86');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 512, 512);
    // soft craters: darker bowl with a light lower rim
    [[118, 128, 34], [372, 112, 22], [432, 300, 26], [96, 392, 20], [468, 196, 13], [262, 462, 18], [150, 230, 12], [400, 420, 14]].forEach(function (c) {
      var cg = ctx.createRadialGradient(c[0] - c[2] * 0.25, c[1] - c[2] * 0.25, 1, c[0], c[1], c[2]);
      cg.addColorStop(0, 'rgba(222,182,104,.42)'); cg.addColorStop(0.8, 'rgba(232,196,120,.28)'); cg.addColorStop(1, 'rgba(255,250,228,.0)');
      ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(c[0], c[1], c[2], 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,252,236,.55)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(c[0], c[1], c[2] - 1, 0.3, 2.6); ctx.stroke();
    });

    // --- the rabbit (facing right, raising a pestle over a mortar of mochi)
    var rg = ctx.createLinearGradient(150, 120, 430, 400);
    rg.addColorStop(0, 'rgba(214,160,74,.62)'); rg.addColorStop(1, 'rgba(186,128,52,.72)');
    ctx.fillStyle = rg;
    ctx.shadowColor = 'rgba(190,130,50,.45)'; ctx.shadowBlur = 8;
    function E2(x, y, rx, ry, rot) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot || 0, 0, Math.PI * 2); ctx.fill(); }
    E2(226, 302, 74, 60, -0.35);    // body
    E2(190, 332, 54, 44, 0.2);      // haunch
    E2(238, 372, 52, 13, 0);        // hind foot
    E2(150, 318, 17, 17, 0);        // tail
    E2(278, 262, 34, 42, 0.4);      // chest
    E2(306, 212, 41, 34, 0.25);     // head
    E2(341, 225, 17, 13, 0.3);      // snout
    E2(266, 146, 13, 52, -0.55);    // back ear
    E2(291, 136, 14, 56, -0.3);     // front ear
    E2(334, 270, 31, 12, -0.75);    // arm
    ctx.lineCap = 'round'; ctx.strokeStyle = rg; ctx.lineWidth = 10;
    ctx.beginPath(); ctx.moveTo(344, 262); ctx.lineTo(392, 198); ctx.stroke();   // pestle handle
    E2(400, 186, 27, 15, 0.95);     // pestle head
    ctx.beginPath();                 // mortar
    ctx.moveTo(370, 324); ctx.lineTo(460, 324);
    ctx.quadraticCurveTo(456, 372, 440, 382); ctx.lineTo(390, 382);
    ctx.quadraticCurveTo(374, 372, 370, 324); ctx.closePath(); ctx.fill();
    E2(415, 386, 30, 7, 0);          // mortar base
    E2(415, 324, 46, 9, 0);          // mortar rim
    ctx.shadowBlur = 0;
    // light details
    ctx.fillStyle = 'rgba(255,248,226,.8)'; E2(415, 317, 30, 10, 0);            // mochi
    ctx.fillStyle = 'rgba(255,242,206,.32)'; E2(291, 140, 6, 42, -0.3);         // inner ear
    ctx.fillStyle = 'rgba(255,242,206,.22)'; E2(266, 150, 5, 38, -0.55);
    ctx.fillStyle = 'rgba(255,240,205,.25)'; E2(236, 282, 40, 28, -0.4);       // belly highlight
    ctx.fillStyle = 'rgba(255,252,240,.95)'; E2(318, 204, 5, 5.5, 0);           // eye
    ctx.fillStyle = 'rgba(255,165,140,.35)'; E2(330, 226, 8, 6, 0);             // blush
    ctx.fillStyle = 'rgba(160,104,40,.5)'; E2(356, 222, 3.2, 2.6, 0);           // nose
    // pounding sparkles
    ctx.fillStyle = 'rgba(255,252,238,.85)';
    [[442, 290, 7], [452, 262, 4.5], [388, 292, 4]].forEach(function (s) {
      ctx.beginPath();
      ctx.moveTo(s[0], s[1] - s[2]); ctx.quadraticCurveTo(s[0], s[1], s[0] + s[2], s[1]);
      ctx.quadraticCurveTo(s[0], s[1], s[0], s[1] + s[2]); ctx.quadraticCurveTo(s[0], s[1], s[0] - s[2], s[1]);
      ctx.quadraticCurveTo(s[0], s[1], s[0], s[1] - s[2]); ctx.fill();
    });
    // limb darkening so the disc reads as a sphere
    var lg = ctx.createRadialGradient(256, 256, 170, 256, 256, 256);
    lg.addColorStop(0, 'rgba(225,175,90,0)'); lg.addColorStop(1, 'rgba(225,175,90,.38)');
    ctx.fillStyle = lg; ctx.fillRect(0, 0, 512, 512);
    ctx.restore();
  }
  // draw the moon onto any canvas, e.g. a landing page that hands over to the scene
  function drawMoon(canvas) {
    var ctx = canvas.getContext('2d');
    ctx.save(); ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(canvas.width / 512, canvas.height / 512);
    paintMoon(ctx);
    ctx.restore();
    return canvas;
  }

  function show(options) {
    var opts = Object.assign({}, DEFAULTS, options || {});
    if (active) return active.promise;
    if (opts.demo && !(options && options.enterLabel)) opts.enterLabel = 'ออกจากโหมดเดโม';
    injectCSS(); loadFont();

    var tier = resolveTier(opts.screen && opts.quality === 'auto' ? 'high' : opts.quality);
    var reduced = false;
    try { reduced = global.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { /* ignore */ }

    var root = document.createElement('div');
    root.className = 'lk-egg' + (tier === 'low' ? ' lk-lowfx' : '') + (opts.screen ? ' lk-screen' : '');
    root.setAttribute('data-quality', tier);
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'สุขสันต์วันลอยกระทง');
    var beYear = new Date().getFullYear() + 543;
    var sparks = [[-4, 22, 0, 18], [102, 30, 0.6, 22], [8, 78, 1.2, 14], [94, 84, 1.8, 16], [50, -6, 0.9, 12]]
      .map(function (s) { return '<i class="lk-spark" style="left:' + s[0] + '%;top:' + s[1] + '%;animation-delay:' + (2.4 + s[2]) + 's;font-size:' + s[3] + 'px">✦</i>'; }).join('');
    root.innerHTML =
      '<canvas aria-hidden="true"></canvas>' +
      '<div class="lk-labels" aria-live="polite"></div>' +
      '<div class="lk-ui">' +
      '  <div class="lk-title">' +
      '    <span class="lk-hello"></span>' +
      '    <h1 data-text="สุขสันต์วันลอยกระทง">สุขสันต์วันลอยกระทง</h1>' + sparks +
      '    <div class="lk-sub">HAPPY LOY KRATHONG ' + beYear + '</div>' +
      '  </div>' +
      '  <div class="lk-bottom">' +
      '    <div class="lk-hint">พิมพ์คำอธิษฐาน หรือแตะคำอธิษฐานสำเร็จรูป แล้วกดลอยกระทง</div>' +
      '    <div class="lk-mine"><button type="button" class="lk-btn lk-btn-make" hidden>✂️ ทำกระทงของฉัน</button>' +
      '    <button type="button" class="lk-btn lk-btn-gallery" hidden>🏛 กระทงทุกคน</button></div>' +
      '    <label class="lk-name-row"><span>ลอยในนาม</span>' +
      '      <input class="lk-name-input" type="text" maxlength="40" placeholder="ไม่ระบุชื่อ" aria-label="ชื่อที่จะแสดงบนกระทง" autocomplete="nickname">' +
      '      <span class="lk-name-edit" aria-hidden="true">✎</span></label>' +
      '    <div class="lk-quick" role="group" aria-label="คำอธิษฐานสำเร็จรูป"></div>' +
      '    <form class="lk-wish">' +
      '      <input type="text" maxlength="80" placeholder="พิมพ์คำอธิษฐาน…" aria-label="คำอธิษฐาน (ต้องใส่ก่อนลอยกระทง)">' +
      '      <button type="submit" class="lk-btn lk-btn-float">ลอยกระทง</button>' +
      '    </form>' +
      '    <div class="lk-share-note" hidden>คำอธิษฐานของคุณจะลอยไปให้เพื่อนๆ ในระบบเห็นแบบสุ่ม</div>' +
      '    <button type="button" class="lk-btn lk-btn-enter"></button>' +
      '  </div>' +
      '</div>' +
      '<div class="lk-topleft">' +
      (opts.demo ? '  <div class="lk-demo">โหมดเดโม</div>' : '') +
      '</div>' +
      '<button type="button" class="lk-sound"></button>' +
      '<button type="button" class="lk-close" aria-label="ปิด">✕</button>';

    root.querySelector('.lk-hello').textContent = opts.screen ? 'ร่วมลอยกระทงด้วยกัน' : opts.userName ? 'ยินดีต้อนรับ คุณ' + opts.userName : 'ยินดีต้อนรับ';
    var nameInput = root.querySelector('.lk-name-input');
    nameInput.value = clip(opts.userName, 40);
    nameInput.addEventListener('keydown', function (e) {   // Enter jumps to the wish box
      if (e.key === 'Enter') { e.preventDefault(); root.querySelector('.lk-wish input').focus(); }
    });
    root.querySelector('.lk-btn-enter').textContent = opts.enterLabel + ' →';
    (opts.container || document.body).appendChild(root);
    // lock page scroll behind the overlay (restored on close)
    var htmlEl = document.documentElement, prevOverflow = htmlEl.style.overflow;
    htmlEl.style.overflow = 'hidden';

    // start audio synchronously so it counts as part of the login click (autoplay policy)
    var audio = opts.music ? createAudio(opts) : null;
    if (audio) audio.start();
    var soundBtn = root.querySelector('.lk-sound');
    function renderSound() {
      if (!audio) { soundBtn.style.display = 'none'; return; }
      var blocked = !audio.isRunning();
      root.classList.toggle('lk-blocked', blocked);
      soundBtn.innerHTML = (audio.muted() || blocked ? ICON_OFF : ICON_ON) + '<span>แตะเพื่อเปิดเพลง</span>';
      soundBtn.setAttribute('aria-label', blocked || audio.muted() ? 'เปิดเสียง' : 'ปิดเสียง');
      soundBtn.setAttribute('aria-pressed', String(!audio.muted() && !blocked));
    }
    soundBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (!audio) return;
      if (!audio.isRunning()) { if (audio.muted()) audio.setMuted(false); audio.unlock().then(renderSound); }
      else audio.setMuted(!audio.muted());
      renderSound();
    });
    // browsers that blocked autoplay (e.g. egg opened on page load) start on the first tap
    root.addEventListener('pointerdown', function (e) {
      if (e.target.closest && e.target.closest('.lk-sound')) return; // the button handles itself
      if (audio && !audio.isRunning() && !audio.muted()) audio.unlock().then(renderSound);
    });
    renderSound();
    setTimeout(renderSound, 500);

    var canvas = root.querySelector('canvas');
    var labelsLayer = root.querySelector('.lk-labels');
    var scene = null, closed = false, resolveFn;

    // coins the kids collect: a small "+1" where the coin lands (no running total)
    function onCoin(sx, sy) {
      var p = document.createElement('div');
      p.className = 'lk-plus'; p.textContent = '+1';
      p.style.left = sx.toFixed(0) + 'px'; p.style.top = sy.toFixed(0) + 'px';
      labelsLayer.appendChild(p);
      setTimeout(function () { if (p.parentNode) p.parentNode.removeChild(p); }, 1000);
    }

    // other users' wishes: poll the feed; each one floated after we opened floats past once, a few seconds apart
    var feed = opts.demo ? null : makeFeed(opts.wishFeed);
    // ids of wishes sent from this browser: kept across reloads so your own never come back to you as "others"
    var MINE_KEY = 'lk-mine', mineIds = {};
    try { (JSON.parse(safeGet(MINE_KEY) || '[]') || []).forEach(function (id) { mineIds[id] = 1; }); } catch (e) { /* ignore */ }
    function rememberMine(id) {
      mineIds[id] = 1;
      try { safeSet(MINE_KEY, JSON.stringify(Object.keys(mineIds).slice(-100))); } catch (e) { /* ignore */ }
    }
    // every wish floats past once on this device, then it is gone for good (reloads included)
    var SEEN_KEY = 'lk-seen', seenIds = {};
    try { (JSON.parse(safeGet(SEEN_KEY) || '[]') || []).forEach(function (k) { seenIds[k] = 1; }); } catch (e) { /* ignore */ }
    function saveSeen() { try { safeSet(SEEN_KEY, JSON.stringify(Object.keys(seenIds).slice(-300))); } catch (e) { /* ignore */ } }
    var feedState = { seen: seenIds, mine: mineIds }, freshQueue = [], feedTimer = null, pollTimer = null, firstFetch = true;
    var lastInput = Date.now();   // polling slows down when nobody has touched the page for a while
    root.addEventListener("pointerdown", function () { lastInput = Date.now(); }, true);
    root.addEventListener("keydown", function () { lastInput = Date.now(); }, true);
    var freshGap = opts.screen ? 1500 : 2500, lastFloat = 0;
    if (feed && !opts.screen) root.querySelector('.lk-share-note').hidden = false;
    function feedFetch() {
      Promise.resolve(feed.load(50)).then(function (d) {
        var m = mergeFeed(feedState, d && d.wishes);
        if (firstFetch) {   // wishes from before we opened stay off the river (they are in the gallery): only live ones float
          firstFetch = false;
        } else {
          freshQueue = freshQueue.concat(m.fresh);
          if (freshQueue.length > FRESH_MAX) freshQueue = freshQueue.slice(freshQueue.length - FRESH_MAX);
        }
        if (m.fresh.length) saveSeen();
        if (typeof opts.onFeed === 'function' && d && typeof d.count === 'number') opts.onFeed({ count: d.count });
      }).catch(function () { /* feed unavailable: just skip */ }).then(function () {
        if (!closed) pollTimer = setTimeout(feedFetch, opts.wishPollMs || pollDelay({ screen: !!opts.screen, idleMs: Date.now() - lastInput, hidden: document.hidden }));
      });
    }
    // a friend's krathong look (design + photo) is fetched once per wish and kept for this visit
    var lookBase = typeof opts.wishFeed === 'string' ? opts.wishFeed.replace(/\/wishes\/?(\?.*)?$/, '/look') : null;
    var lookCache = {};
    function fetchLook(id) {
      if (!lookBase || !/^[a-z0-9]{4,32}$/.test(id)) return Promise.resolve(null);
      if (!lookCache[id]) {
        lookCache[id] = fetch(lookBase + '?id=' + id, { credentials: 'same-origin' })
          .then(function (r) { return r.ok ? r.json() : null; })
          .catch(function () { delete lookCache[id]; return null; });
      }
      return lookCache[id];
    }
    function floatWish(e) {
      var info = { name: e.name || 'เพื่อนในระบบ', wish: e.wish, other: true, key: feedKey(e) };
      if (!e.look) { scene.launchFront(info); return; }
      fetchLook(e.id).then(function (l) {
        if (closed || !scene) return;
        if (l) { info.design = l.design || null; info.photo = opts.photos && DZ && DZ.photoOk(l.photo) ? l.photo : null; }
        scene.launchFront(info);
      });
    }

    // the person's krathongs live on a shelf on this device (shelf.js); the selected one is what they float
    var DZ = global.LoyKrathongDesign, WS = global.LoyKrathongWorkshop, SH = global.LoyKrathongShelf, GA = global.LoyKrathongGallery;
    var mineOk = !!(WS && DZ && SH && opts.workshop && !opts.screen && !opts.demo);
    var shelf = mineOk ? SH.createShelf((function () { try { return global.localStorage; } catch (e) { return null; } })()) : null;
    var myLook = null, myKid = null;
    var makeBtn = root.querySelector('.lk-btn-make'), galleryBtn = root.querySelector('.lk-btn-gallery');
    var floatBtn = root.querySelector('.lk-btn-float'), hintEl = root.querySelector('.lk-hint'), wishInput = root.querySelector('.lk-wish input');
    function renderMine() {
      floatBtn.textContent = myLook ? 'ลอยกระทงของฉัน' : 'ลอยกระทง';
      hintEl.textContent = myLook ? 'พิมพ์คำอธิษฐาน หรือแตะคำอธิษฐานสำเร็จรูป แล้วกดลอยกระทงของฉัน' : 'พิมพ์คำอธิษฐาน หรือแตะคำอธิษฐานสำเร็จรูป แล้วกดลอยกระทง';
      if (shelf) makeBtn.textContent = shelf.items().length ? '🧺 กระทงของฉัน (' + shelf.items().length + ')' : '🧺 เลือก/ทำกระทง';
    }
    // the float button works only once there is a wish
    function syncFloat() { floatBtn.disabled = !wishInput.value.trim(); }
    wishInput.addEventListener('input', syncFloat);
    var quickEl = root.querySelector('.lk-quick');
    QUICK_WISHES.forEach(function (w) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = w;
      b.addEventListener('click', function () { wishInput.value = w; syncFloat(); floatBtn.focus({ preventScroll: true }); });
      quickEl.appendChild(b);
    });
    syncFloat();
    function syncLook() {
      var it = shelf && shelf.selected();
      myLook = it ? it.look : null; myKid = it ? it.kid : null;
      renderMine();
    }
    function snapshot(look) { return scene && scene.snapshot ? scene.snapshot(look) : Promise.resolve(null); }
    function openWorkshop(kid) {
      if (!scene) return;
      var editing = kid ? shelf.get(kid) : null;
      root.classList.add('lk-making');
      WS.open({
        container: root, look: editing ? editing.look : null, toast: toast, table: scene.table,
        onDone: function (look) {
          root.classList.remove('lk-making');
          if (look !== undefined) {   // undefined = cancelled
            if (editing) { shelf.update(editing.kid, look); shelf.select(editing.kid); }
            else if (!shelf.add(look)) toast('ชั้นวางเต็มแล้ว ลบกระทงเก่าก่อนนะ');
            if (!shelf.lastSaveOk()) toast('เครื่องนี้เก็บกระทงเพิ่มไม่ได้แล้ว ลองลบใบที่มีรูปออกบ้างนะ');
            syncLook();
            if (myLook && myLook.photo && !clip(nameInput.value, 40)) { toast('ใส่ชื่อด้วยนะ กระทงที่มีรูปต้องมีชื่อเจ้าของ'); nameInput.focus({ preventScroll: true }); }
            else if (myLook) { toast('✨ กระทงของคุณพร้อมลอยแล้ว กด ลอยกระทงของฉัน ได้เลย'); floatBtn.focus({ preventScroll: true }); }
          } else syncLook();
        }
      });
    }
    function openShelf() {
      if (!scene) return;
      SH.open({
        container: root, shelf: shelf, snapshot: snapshot, toast: toast,
        onPick: function () { syncLook(); },
        onEdit: function (kid) { openWorkshop(kid); },
        onNew: function () { openWorkshop(null); },
        onClose: function () { syncLook(); }
      });
    }
    function openGallery() {
      if (!scene || !GA) return;
      root.classList.add('lk-making');
      GA.open({
        container: root, table: scene.table, snapshot: snapshot, toast: toast, client: clientId(),
        base: lookBase ? lookBase.replace(/\/look$/, '') : '/api', fetchLook: fetchLook,
        onClose: function () { root.classList.remove('lk-making'); }
      });
    }
    if (mineOk) {
      makeBtn.hidden = false;
      makeBtn.addEventListener('click', openShelf);
      if (GA && lookBase) { galleryBtn.hidden = false; galleryBtn.addEventListener('click', openGallery); }
      syncLook();
    }
    function feedLoop() {
      if (closed) return;
      var now = Date.now();
      if (scene && !document.hidden && canFloat(labelsLayer.querySelectorAll(".lk-label").length, !!opts.screen)) {
        if (freshQueue.length && now - lastFloat >= freshGap) { floatWish(freshQueue.shift()); lastFloat = now; }
      }
      feedTimer = setTimeout(feedLoop, 500);
    }
    function startFeed() { if (!feed) return; feedFetch(); feedTimer = setTimeout(feedLoop, 2500); }

    // demo mode: autopilot that keeps launching wish krathongs and tapping the water
    var demoTimers = [];
    function startDemo() {
      var i = Math.floor(Math.random() * DEMO_WISHES.length);
      function later(fn, ms) { demoTimers.push(setTimeout(fn, ms)); }
      function wishLoop() {
        if (closed) return;
        if (scene && !document.hidden) { var w = DEMO_WISHES[i++ % DEMO_WISHES.length]; scene.launchFront({ name: w[0], wish: w[1] }); }
        later(wishLoop, 6500 + Math.random() * 2500);
      }
      function tapLoop() {
        if (closed) return;
        if (scene && !document.hidden) scene.launchRandom();
        later(tapLoop, 3500 + Math.random() * 2500);
      }
      later(wishLoop, 3500);
      later(tapLoop, 5200);
    }
    var promise = new Promise(function (r) { resolveFn = r; });

    function toast(text) {
      var prev = root.querySelector('.lk-toast');
      if (prev) prev.parentNode.removeChild(prev);
      var el = document.createElement('div');
      el.className = 'lk-toast';
      el.textContent = text;
      root.appendChild(el);
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 3700);
    }

    function onResize() { if (scene) scene.resize(); }
    function onKey(e) { if (e.key === 'Escape' && !opts.screen && !root.classList.contains('lk-making')) close(); }

    function close() {
      if (closed) return; closed = true;
      if (WS && WS.close) WS.close();
      if (SH && SH.close) SH.close();
      if (GA && GA.close) GA.close();
      root.classList.remove('lk-in');
      if (audio) audio.stop();
      demoTimers.forEach(clearTimeout);
      clearTimeout(feedTimer); clearTimeout(pollTimer);
      global.removeEventListener('resize', onResize);
      document.removeEventListener('keydown', onKey);
      setTimeout(function () {
        if (scene) scene.dispose();
        if (root.parentNode) root.parentNode.removeChild(root);
        htmlEl.style.overflow = prevOverflow;
        active = null;
        if (typeof opts.onClose === 'function') opts.onClose();
        resolveFn(true);
      }, 850);
    }

    root.querySelector('.lk-wish').addEventListener('submit', function (e) {
      e.preventDefault();
      var input = this.querySelector('input');
      var wish = clip(input.value, 80);
      if (!wish) { toast('✍️ พิมพ์คำอธิษฐาน หรือแตะคำอธิษฐานสำเร็จรูปก่อนนะ'); input.focus(); syncFloat(); return; }
      var shownName = clip(nameInput.value, 40);   // what the person typed (prefilled from the system)
      var filter = global.LoyKrathongFilter;
      if (filter && ((wish && !filter.check(wish).ok) || (shownName && !filter.check(shownName).ok))) {
        toast(MSG_BLOCKED); input.focus(); return;   // keep the text so it can be edited
      }
      if (myLook && myLook.photo && !shownName && wish) {
        toast('ใส่ชื่อก่อนนะ กระทงที่มีรูปต้องมีชื่อเจ้าของ'); nameInput.focus(); return;
      }
      var look = myLook || {};
      if (feed && wish) {   // share it so other users may see it
        var floatKid = myLook ? myKid : null;
        Promise.resolve(feed.save({ name: shownName, wish: wish, design: look.design && DZ ? DZ.sanitize(look.design) : null, photo: look.photo || null, kid: floatKid })).then(function (r) {
          if (closed || !r) return;
          if (r.ok) {
            if (r.id) rememberMine(r.id);
            if (floatKid && shelf) { shelf.markFloated(floatKid); renderMine(); }
            setTimeout(function () { if (!closed) toast(floatKid ? '🪷 กระทงของคุณลอยไปให้ทุกคนเห็นแล้ว ดูได้ใน 🏛 กระทงทุกคน' : MSG_SHARED); }, 1800);
          }
          else if (r.status === 422) toast(MSG_BLOCKED);
          else if (r.status === 429) toast(MSG_TOO_FAST);
          else if (r.status === 413 || r.error === 'bad_photo') toast('รูปนี้ส่งไม่ได้ ลองเลือกรูปใหม่ในโรงทำกระทงนะ');
        }).catch(function () { /* offline: it still floats on this screen */ });
      }
      if (scene) scene.launchFront({ name: shownName || 'ไม่ระบุชื่อ', wish: wish, design: look.design || null, photo: look.photo || null });
      if (!scene) toast('✨ ' + wish);
      input.value = '';
      syncFloat();
    });
    root.querySelector('.lk-btn-enter').addEventListener('click', close);
    root.querySelector('.lk-close').addEventListener('click', close);
    global.addEventListener('resize', onResize);
    document.addEventListener('keydown', onKey);

    function fallback() {
      root.style.background = 'radial-gradient(ellipse at 50% 30%,#6b3fa0,#1a0b4a 60%,#07042a)';
      root.classList.add('lk-in');
    }

    loadThree().then(function (THREE) {
      // low tier never uses bloom, so skip downloading the post-processing scripts
      return (opts.bloom && tier !== 'low' ? loadPost() : Promise.resolve(false)).then(function (hasPost) {
        if (closed) return;
        try {
          scene = buildScene(THREE, canvas, reduced, hasPost, {
            labelLayer: labelsLayer, sfx: audio ? audio.sfx : null, onCoin: onCoin, demo: opts.demo, tier: tier, gpu: gpuName(),
            debug: /[?&]lkdebug=1\b/.test(global.location.search),
            logoUrl: opts.logoUrl === 'auto' ? SCRIPT_BASE + 'semed-logo.png' : opts.logoUrl,
            returnChance: opts.wishReturnChance, photos: opts.photos,
            onDegrade: function (step) {
              root.classList.add('lk-lowfx');
              root.setAttribute('data-degrade', String(step));
            }
          });
          if (opts.demo) startDemo();
          startFeed();
        } catch (err) {
          fallback(); return;   // WebGL unavailable: keep the 2D greeting
        }
        setTimeout(function () { root.classList.add('lk-in'); }, 40);
        if (typeof opts.onReady === 'function' && scene) {
          requestAnimationFrame(function () { requestAnimationFrame(function () {
            if (closed) return;
            try { opts.onReady({ moonScreen: function () { return scene && scene.moonScreen ? scene.moonScreen() : null; } }); } catch (err) { /* ignore */ }
          }); });
        }
        setTimeout(function () { var b = root.querySelector('.lk-btn-enter'); if (b && !closed) b.focus({ preventScroll: true }); }, 2400);
      });
    }).catch(fallback);

    active = { promise: promise, close: close, stats: function () { return scene && scene.stats ? scene.stats() : null; } };
    return promise;
  }

  // Show only during the festival window and once per day per user. Resolves true if shown.
  function maybeShow(options) {
    var opts = Object.assign({}, DEFAULTS, options || {});
    if (urlParam() === 'demo') opts.demo = true;
    if (opts.demo) return show(opts);   // demo ignores the date window and never marks as seen
    var force = opts.force || forcedByUrl();
    if (!force && !isLoyKrathongSeason(opts)) {
      if (typeof opts.onClose === 'function') opts.onClose();
      return Promise.resolve(false);
    }
    var key = opts.storageKey + ':' + (opts.userName || '_') + ':' + todayYMD();
    if (!force && opts.oncePerDay && safeGet(key)) {
      if (typeof opts.onClose === 'function') opts.onClose();
      return Promise.resolve(false);
    }
    safeSet(key, '1');
    return show(opts);
  }

  global.LoyKrathongEasterEgg = {
    maybeShow: maybeShow,
    show: show,
    demo: function (options) { return show(Object.assign({}, options || {}, { demo: true })); },
    close: function () { if (active) active.close(); },
    stats: function () { return active ? active.stats() : null; },   // { tier, pixelRatio, bloom, fpsCap, fps, degradeSteps }
    isSeason: isLoyKrathongSeason,
    drawMoon: drawMoon,
    festivalDate: function (year) { return festivalDate(year || new Date().getFullYear()); },
    preload: preload,
    // exposed for tests
    _mergeFeed: mergeFeed, _makeFeed: makeFeed, _pollDelay: pollDelay, _canFloat: canFloat
  };
})(window);
