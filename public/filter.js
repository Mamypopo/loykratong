/*
 * ตัวกรองคำอธิษฐาน ใช้ทั้งในเบราว์เซอร์ (window.LoyKrathongFilter) และบน server (require)
 * check(text) -> { ok: true } | { ok: false, reason: 'link' | 'phone' | 'mention' | 'bad_word' }
 *
 * เพิ่ม/ลบคำได้ที่ SUBSTRING_WORDS / TOKEN_WORDS ด้านล่าง แล้ว deploy ใหม่
 *  - SUBSTRING_WORDS: เจอที่ไหนในข้อความก็บล็อก (ภาษาไทยไม่มีเว้นวรรค จึงต้องใช้แบบนี้)
 *    ระวังคำที่เป็นส่วนหนึ่งของคำปกติ เช่น "หี" อยู่ใน "หีบ", "สัด" อยู่ใน "สัดส่วน"
 *  - TOKEN_WORDS: บล็อกเฉพาะเมื่อเป็นคำเดี่ยวๆ (กัน "ass" ใน "assume")
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LoyKrathongFilter = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SUBSTRING_WORDS = [
    // ไทย
    'ควาย', 'ควย', 'เหี้ย', 'สัส', 'ไอ้สัด', 'อีสัด', 'เย็ด', 'หน้าหี', 'อีหี', 'แตด', 'ระยำ', 'อีดอก',
    'ดอกทอง', 'ตอแหล', 'ชิบหาย', 'จัญไร', 'ส้นตีน', 'ไอ้เวร', 'อีเวร', 'กะหรี่', 'ร่าน', 'พ่อมึง', 'แม่มึง',
    'พ่องตาย', 'ไอ้เหี้ย', 'อีเหี้ย', 'เงี่ยน', 'โคตรพ่อ', 'โคตรแม่', 'มึงตาย',
    // English
    'fuck', 'shit', 'bitch', 'cunt', 'asshole', 'bastard', 'porn', 'pussy', 'motherfucker', 'wtf'
  ];
  var TOKEN_WORDS = ['ass', 'dick', 'cum', 'fag', 'slut', 'whore', 'nigger', 'nigga', 'damn', 'sex'];

  // zero-width space/joiners, word joiner, BOM, soft hyphen (built from code points so the source stays readable)
  var ZERO_WIDTH = new RegExp('[' + String.fromCharCode(0x200b) + '-' + String.fromCharCode(0x200d) +
    String.fromCharCode(0x2060, 0xfeff, 0x00ad) + ']', 'g');
  var LEET = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's' };
  var NOT_LETTER = /[^a-z฀-๿]+/g;

  function collapse(s) { return s.replace(/(.)\1+/g, '$1'); }   // fuuuck -> fuck, ควายยย -> ควาย
  function base(text) {
    var s = String(text == null ? '' : text);
    if (s.normalize) s = s.normalize('NFKC');
    return s.toLowerCase().replace(ZERO_WIDTH, '').replace(/[013457@$]/g, function (c) { return LEET[c]; });
  }
  // compact form: letters only, repeats collapsed. "F.U.C.K you" -> "fuckyou"
  function normalize(text) { return collapse(base(text).replace(NOT_LETTER, '')); }
  function tokens(text) { return base(text).split(NOT_LETTER).filter(Boolean).map(collapse); }

  var SUBS = SUBSTRING_WORDS.map(normalize);
  var TOKS = TOKEN_WORDS.map(normalize);

  var LINK = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|co|th|ly|me|io|xyz|info|biz|app|link|gg|tv|cc|to|shop|site|online|club|vip|bet)\b)/i;
  var PHONE = /(?:\d[\s\-.]?){9,}/;
  var MENTION = /(^|[^\w])@[\w฀-๿]{2,}/;

  function check(text) {
    var raw = String(text == null ? '' : text).replace(ZERO_WIDTH, '');
    if (LINK.test(raw)) return { ok: false, reason: 'link' };
    if (PHONE.test(raw)) return { ok: false, reason: 'phone' };
    if (MENTION.test(raw)) return { ok: false, reason: 'mention' };
    var compact = normalize(raw);
    for (var i = 0; i < SUBS.length; i++) if (SUBS[i] && compact.indexOf(SUBS[i]) >= 0) return { ok: false, reason: 'bad_word' };
    var t = tokens(raw);
    for (var j = 0; j < t.length; j++) if (TOKS.indexOf(t[j]) >= 0) return { ok: false, reason: 'bad_word' };
    return { ok: true };
  }

  return { check: check, normalize: normalize };
});
