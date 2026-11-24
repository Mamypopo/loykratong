#!/usr/bin/env node
/*
 * Look through and delete wishes in Upstash (test ones, or anything that should not be on the river).
 *
 *   node scripts/wishes-admin.js list                  every wish, newest first, with its id
 *   node scripts/wishes-admin.js find ทดสอบ             wishes whose name or wish contains the text
 *   node scripts/wishes-admin.js delete <id> [<id>...] delete these (asks before deleting)
 *   node scripts/wishes-admin.js delete-match ทดสอบ     delete every wish found by "find" (asks first)
 *
 * Deleting removes the wish from the list, its krathong picture and its hearts, and lowers the total count.
 * Needs KV_REST_API_URL and KV_REST_API_TOKEN: in the environment, or in .env.local
 * (get it with `vercel env pull .env.local`). The file is git-ignored; never commit it.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const LIST = 'lk:wishes', COUNT = 'lk:count', LOOK = 'lk:look:', HEARTS = 'lk:hearts';

// raw: the strings stored in lk:wishes; sel: { all?: boolean, ids?: string[], match?: string }
function pickWishes(raw, sel) {
  const ids = new Set((sel.ids || []).map(String));
  const text = String(sel.match || '').trim().toLowerCase();
  if (!ids.size && !text && !sel.all) return [];
  const out = [];
  for (const s of raw) {
    let w;
    try { w = JSON.parse(s); } catch (e) { continue; }
    if (!w || !w.id) continue;
    const hit = sel.all || ids.has(String(w.id)) ||
      (text && (String(w.name || '') + '\n' + String(w.wish || '')).toLowerCase().includes(text));
    if (hit) out.push({ id: String(w.id), name: String(w.name || ''), wish: String(w.wish || ''), look: !!w.look, raw: s });
  }
  return out;
}

function deleteCommands(picked) {
  if (!picked.length) return [];
  const cmds = [];
  for (const w of picked) cmds.push(['LREM', LIST, 0, w.raw], ['DEL', LOOK + w.id], ['HDEL', HEARTS, w.id]);
  cmds.push(['DECRBY', COUNT, picked.length]);
  return cmds;
}

function loadEnv() {
  const f = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
}

async function main() {
  loadEnv();
  const url = String(process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/+$/, '');
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    console.error('ไม่เจอ KV_REST_API_URL / KV_REST_API_TOKEN\nรัน  vercel env pull .env.local  ในโฟลเดอร์โปรเจกต์ก่อน');
    process.exit(1);
  }
  async function pipeline(commands) {
    const r = await fetch(url + '/pipeline', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(commands.map((c) => c.map(String)))
    });
    if (!r.ok) throw new Error('redis http ' + r.status);
    const out = await r.json();
    const err = out.find((x) => x && x.error);
    if (err) throw new Error('redis: ' + err.error);
    return out.map((x) => x.result);
  }
  const show = (ws) => ws.forEach((w) => console.log(w.id.padEnd(16) + (w.look ? '🪷 ' : '   ') + w.name + ' : ' + w.wish));
  const ask = (q) => new Promise((res) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(q, (a) => { rl.close(); res(/^(y|yes|ใช่)$/i.test(a.trim())); });
  });

  const [cmd, ...args] = process.argv.slice(2);
  const [raw] = await pipeline([['LRANGE', LIST, 0, -1]]);
  const all = raw || [];

  if (cmd === 'list') { show(pickWishes(all, { all: true })); console.log('— ทั้งหมด ' + all.length + ' อัน'); return; }
  if (cmd === 'find') { const p = pickWishes(all, { match: args.join(' ') }); show(p); console.log('— เจอ ' + p.length + ' อัน'); return; }
  if (cmd === 'delete' || cmd === 'delete-match') {
    const p = cmd === 'delete' ? pickWishes(all, { ids: args }) : pickWishes(all, { match: args.join(' ') });
    if (!p.length) { console.log('ไม่เจออันที่จะลบ'); return; }
    show(p);
    if (!(await ask('ลบ ' + p.length + ' อันนี้? พิมพ์ y แล้ว Enter เพื่อยืนยัน: '))) { console.log('ยกเลิก ไม่ได้ลบอะไร'); return; }
    await pipeline(deleteCommands(p));
    console.log('ลบแล้ว ' + p.length + ' อัน');
    return;
  }
  console.log('ใช้แบบนี้:\n  node scripts/wishes-admin.js list\n  node scripts/wishes-admin.js find <คำ>\n' +
    '  node scripts/wishes-admin.js delete <id> [<id>...]\n  node scripts/wishes-admin.js delete-match <คำ>');
}

if (require.main === module) main().catch((e) => { console.error('ผิดพลาด:', e.message); process.exit(1); });

module.exports = { pickWishes, deleteCommands };
