/*
 * ตัวกรองคำอธิษฐาน ใช้ทั้งในเบราว์เซอร์ (window.LoyKrathongFilter) และบน server (require)
 * check(text) -> { ok: true } | { ok: false, reason: 'link' | 'phone' | 'mention' | 'bad_word' }
 *
 * เพิ่ม/ลบคำได้ที่ THAI_WORDS / EN_WORDS / EN_TOKENS ด้านล่าง แล้ว deploy ใหม่
 *  - THAI_WORDS: เจอที่ไหนในข้อความก็บล็อก (ภาษาไทยไม่มีเว้นวรรค) ระวังคำที่ซ้อนในคำปกติ เช่น "หี" ใน "หีบ"
 *    ถ้าคำปกติโดนบล็อก ให้เพิ่มคำนั้นใน THAI_ALLOW
 *  - EN_WORDS: บล็อกเมื่ออยู่ในคำภาษาอังกฤษคำใดคำหนึ่ง, EN_TOKENS: เฉพาะเมื่อเป็นคำเดี่ยวๆ (กัน "ass" ใน "assume")
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LoyKrathongFilter = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var THAI_WORDS = [
    'ควาย', 'ควย', 'เหี้ย', 'สัส', 'ไอ้สัด', 'อีสัด', 'เย็ด', 'หน้าหี', 'อีหี', 'แตด', 'ระยำ', 'อีดอก',
    'ดอกทอง', 'ตอแหล', 'ชิบหาย', 'จัญไร', 'ส้นตีน', 'ไอ้เวร', 'อีเวร', 'กะหรี่', 'ร่าน', 'พ่อมึง', 'แม่มึง',
    'พ่องตาย', 'เงี่ยน', 'โคตรพ่อ', 'โคตรแม่', 'มึงตาย'
  ];
  // คำปกติที่มีคำต้องห้ามซ้อนอยู่ (ตัดออกก่อนตรวจ)
  var THAI_ALLOW = ['แกงกะหรี่', 'ข้าวกะหรี่', 'กะหรี่ปั๊บ', 'ดอกทองหลาง'];
  // อังกฤษ: บล็อกเมื่ออยู่ในคำ (motherfucker มี fuck อยู่แล้ว)
  var EN_WORDS = ['fuck', 'shit', 'bitch', 'cunt', 'asshole', 'bastard', 'porn', 'pussy', 'wtf'];
  var EN_TOKENS = ['ass', 'dick', 'cum', 'fag', 'slut', 'whore', 'nigger', 'nigga', 'damn', 'sex'];

  // character ranges are built from code points so the source has no invisible characters
  function ch(code) { return String.fromCharCode(code); }
  var THAI = ch(0x0e00) + '-' + ch(0x0e7f);
  // zero-width chars, LRM/RLM, bidi embeddings/overrides/isolates, word joiner, BOM, soft hyphen
  var HIDDEN = new RegExp('[' + ch(0x200b) + '-' + ch(0x200f) + ch(0x202a) + '-' + ch(0x202e) +
    ch(0x2060) + '-' + ch(0x2069) + ch(0xfeff) + ch(0x00ad) + ']', 'g');
  var THAI_REPEAT = new RegExp(ch(0x0e46), 'g');   // the Thai repeat mark
  var NOT_THAI = new RegExp('[^' + THAI + ']+', 'g');
  var LEET = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's' };

  function base(text) {
    var s = String(text == null ? '' : text);
    if (s.normalize) s = s.normalize('NFKC');
    return s.toLowerCase().replace(HIDDEN, '').replace(/[013457@$]/g, function (c) { return LEET[c]; });
  }
  // English words; runs of single letters are joined so "f u c k" / "f.u.c.k" become "fuck"
  function englishTokens(text) {
    var out = [], buf = '';
    base(text).split(/[^a-z]+/).forEach(function (t) {
      if (!t) return;
      if (t.length === 1) { buf += t; return; }
      if (buf) { out.push(buf); buf = ''; }
      out.push(t);
    });
    if (buf) out.push(buf);
    return out;
  }
  // Thai letters only (Thai has no spaces), with allowed everyday words removed
  function thaiText(text) {
    var s = base(text).replace(THAI_REPEAT, '').replace(NOT_THAI, '');
    THAI_ALLOW.forEach(function (w) { s = s.split(w).join(''); });
    return s;
  }
  // each letter may repeat: "fuck" matches "fuuuck", "ควาย" matches "ควายยย" (word lists hold letters only)
  function stretchy(word, anchored) {
    var p = word.split('').map(function (c) { return c + '+'; }).join('');
    return new RegExp(anchored ? '^' + p + '$' : p);
  }
  var THAI_RE = THAI_WORDS.map(function (w) { return stretchy(w, false); });
  var EN_RE = EN_WORDS.map(function (w) { return stretchy(w, false); });
  var TOKEN_RE = EN_TOKENS.map(function (w) { return stretchy(w, true); });

  var LINK = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|co|th|ly|me|io|xyz|info|biz|app|link|gg|tv|cc|to|shop|site|online|club|vip|bet)\b)/i;
  var PHONE = /(?:\d[\s\-.]?){9,}/;
  var MENTION = new RegExp('(^|[^\\w])@[\\w' + THAI + ']{2,}');

  function any(res, s) { for (var i = 0; i < res.length; i++) if (res[i].test(s)) return true; return false; }

  function check(text) {
    var raw = String(text == null ? '' : text).replace(HIDDEN, '');
    if (LINK.test(raw)) return { ok: false, reason: 'link' };
    if (PHONE.test(raw)) return { ok: false, reason: 'phone' };
    if (MENTION.test(raw)) return { ok: false, reason: 'mention' };
    if (any(THAI_RE, thaiText(raw))) return { ok: false, reason: 'bad_word' };
    var toks = englishTokens(raw);
    for (var i = 0; i < toks.length; i++) {
      if (any(EN_RE, toks[i]) || any(TOKEN_RE, toks[i])) return { ok: false, reason: 'bad_word' };
    }
    return { ok: true };
  }
  function normalize(text) { return englishTokens(text).join('') + thaiText(text); }

  return { check: check, normalize: normalize, HIDDEN: HIDDEN };
});
