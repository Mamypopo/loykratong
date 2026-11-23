'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { check } = require('../public/filter.js');

test('allows ordinary wishes, including words that contain a bad word inside', () => {
  for (const s of ['ขอให้สุขภาพแข็งแรง', 'assume the best', 'สวัสดีปีใหม่', 'class 2026', 'ขอให้มีน้องหมาสักตัว 🐶', 'Happy Loy Krathong!']) {
    assert.deepEqual(check(s), { ok: true }, s);
  }
});

test('blocks Thai and English profanity, including spaced, dotted, stretched and zero-width variants', () => {
  for (const s of ['ไอ้ควาย', 'ค ว า ย', 'fuck', 'f.u.c.k', 'fuuuck', 'ค​วาย', 'F U C K you']) {
    assert.deepEqual(check(s), { ok: false, reason: 'bad_word' }, s);
  }
});

test('blocks links', () => {
  for (const s of ['www.abc.com', 'bit.ly/x', 'http://x', 'ไปที่ shop.co.th นะ']) {
    assert.deepEqual(check(s), { ok: false, reason: 'link' }, s);
  }
});

test('blocks phone numbers', () => {
  for (const s of ['line id 0812345678', '081-234-5678', 'โทร 02 123 4567']) {
    assert.deepEqual(check(s), { ok: false, reason: 'phone' }, s);
  }
});

test('blocks @mentions', () => {
  assert.deepEqual(check('@someone'), { ok: false, reason: 'mention' });
});
