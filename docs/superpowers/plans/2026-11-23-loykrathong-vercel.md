# ลอยกระทงออนไลน์บน Vercel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เปลี่ยนเดโม login เป็นเว็บลอยกระทงสาธารณะในองค์กรบน Vercel: กรอกชื่อ → ลอย, เห็นกระทงเพื่อนแบบเกือบเรียลไทม์, ตัวกรองคำ, โหมดจอใหญ่

**Architecture:** static files ใน `public/` + Vercel function `api/wishes.js` เก็บข้อมูลใน Upstash Redis ผ่าน REST (fetch, ไม่มี dependency). ตัวกรองเป็นไฟล์ UMD `public/filter.js` ใช้ทั้ง browser และ server. GET ถูก cache ที่ edge 3 วินาทีเพื่อคุมโควต้า

**Tech Stack:** Node 22, `node:test`, Vercel Functions (Node runtime), Upstash Redis REST, Three.js r128 (เดิม)

**Spec:** `docs/superpowers/specs/2026-11-23-loykrathong-vercel-design.md`

## Global Constraints
- ไม่มี npm dependency (ทั้ง runtime และ test ใช้ `node:test`)
- ชื่อ ≤ 40 ตัวอักษร, คำอธิษฐาน ≤ 80, body ≤ 4096 bytes
- Redis: list `lk:wishes` LTRIM 300 + EXPIRE 7 วัน (604800s), counter `lk:count`, rate limit `lk:rl:<ip>` NX EX 4
- GET: `Cache-Control: public, s-maxage=3, stale-while-revalidate=10`, คืน `{ count, wishes }` ล่าสุด 50 อัน, ไม่ส่ง ip/site กลับ
- Env: `KV_REST_API_URL`/`KV_REST_API_TOKEN` หรือ `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`
- ข้อความบล็อก (client): `ขอคำอธิษฐานที่สุภาพหน่อยนะ 🙏`; ส่งถี่: `ลอยถี่ไปนิด รอสักครู่นะ`
- ไม่มีเงื่อนไขวันที่บนหน้าเว็บ; โหมดจอใหญ่ `/?screen=1`

## Review Focus
1. Redis ยังไม่ได้ตั้ง env (deploy ครั้งแรก) → GET คืน `{count:0,wishes:[]}` 200, POST 503 `{error:'storage'}`; หน้าเว็บยังลอยกระทงตัวเองได้ — test ใน Task 2
2. เลี่ยงตัวกรองด้วยเว้นวรรค/จุด/ตัวซ้ำ/zero-width (`ค ว า ย`, `f.u.c.k`, `fuuuck`) → ยังบล็อก — test ใน Task 1
3. คำปกติที่มีคำหยาบซ้อนอยู่ไม่ควรโดน (`assume`, `สวัสดี`, `class`) — test ใน Task 1
4. ผู้ใช้ส่งคำอธิษฐานซ้ำกับคนอื่น/ชื่อเดียวกับเพื่อน → กระทงของคนอื่นยังขึ้น (กรองด้วย id ไม่ใช่ชื่อ) — test ใน Task 3
5. จอใหญ่เปิดทิ้งไว้ทั้งวัน มีของใหม่ทีละมาก → ไม่ลอยซ้ำ id เดิม, คิวใหม่ไม่เกิน 30 — test ใน Task 3

---

### Task 0: โครงโปรเจค
**Files:** Move `index.html`, `loykrathong-easter-egg.js`, `semed-logo.png` → `public/`; Create `package.json` (`"type":"commonjs"`, scripts `test: node --test tests/`, `dev: node wish-server.js`), `.gitignore` (`node_modules`, `.vercel`, `wishes.json*`, `.env*`); `git init`
- [ ] ย้ายไฟล์, แก้ `PUBLIC`/`ROOT` ใน wish-server.js ให้อ่านจาก `public/` (และเพิ่ม `app.js`, `filter.js`)
- [ ] `node --check` ทุกไฟล์ผ่าน; commit

### Task 1: ตัวกรอง `public/filter.js`
**Interfaces — Produces:** `LoyKrathongFilter.check(text) -> { ok: boolean, reason?: 'bad_word'|'link'|'phone'|'mention' }`, `normalize(text) -> string`; UMD (`module.exports` + `window.LoyKrathongFilter`)
- [ ] Test `tests/filter.test.js`: ok สำหรับ `ขอให้สุขภาพแข็งแรง`, `assume the best`, `สวัสดีปีใหม่`, `class 2026`; ไม่ ok: `ไอ้ควาย`, `ค ว า ย`, `fuck`, `f.u.c.k`, `fuuuck`, `ค​วาย`, `www.abc.com`, `bit.ly/x`, `http://x`, `line id 0812345678`, `081-234-5678`, `@someone`
- [ ] Run → FAIL; implement: normalize = lowercase, ตัด zero-width/ช่องว่าง/เครื่องหมาย, ยุบตัวซ้ำ ≥3 เป็น 1, leet (0→o,1→i,3→e,4→a,@→a เฉพาะใน normalize สำหรับคำหยาบ); คำอังกฤษเช็คบน token (กัน `assume`) และบน normalized สำหรับคำที่ยาว ≥4 ที่ไม่ใช่ substring ปกติ; ลิงก์/เบอร์/mention เช็คบนข้อความดิบ
- [ ] Run → PASS; commit

### Task 2: API `api/wishes.js` + `lib/store.js`
**Interfaces — Consumes:** `check` จาก Task 1 (`require('../public/filter.js')`). **Produces:** `GET /api/wishes -> {count:number, wishes:[{id:string,name:string,wish:string}]}` ใหม่สุดก่อน; `POST {name,wish} -> 201 {ok:true,id}` | 400 `bad_json|empty` | 403 `origin` | 413 | 415 `json_only` | 422 `blocked` | 429 `too_many` | 503 `storage`
- `lib/store.js`: `createStore({url, token, fetch}) -> { list(n), add(entry) -> id, count(), rateLimit(ip) -> boolean }` | `null` เมื่อไม่มี env; ใช้ Upstash pipeline endpoint (`POST {url}/pipeline`)
- `api/wishes.js`: `module.exports = handler(req, res)` + `module.exports.createHandler({store})` สำหรับ test; อ่าน body เอง (ไม่พึ่ง helper ของ Vercel), Origin ต้องตรง `https://${host}` หรือไม่มี Origin
- [ ] Test `tests/api.test.js` ด้วย fake store (in-memory) + fake req/res: GET ว่าง, POST ok → GET เห็น, 422 คำหยาบ, 429 ครั้งที่สองภายใน 4s, 415, 403 origin อื่น, ตัด `<>` และความยาว, store=null → GET 200 ว่าง / POST 503, header Cache-Control ตาม constraint
- [ ] Test `tests/store.test.js` ด้วย fake fetch: add ส่ง LPUSH+LTRIM 0 299+EXPIRE 604800+INCR; rateLimit ส่ง SET NX EX 4
- [ ] Run → FAIL; implement; Run → PASS
- [ ] `wish-server.js` ใช้ handler เดียวกันกับ in-memory store (dev) — `npm run dev` แล้ว curl GET/POST ได้; commit

### Task 3: ฝั่งฉาก `public/loykrathong-easter-egg.js`
**Interfaces — Produces:** options ใหม่ `screen:boolean`, `wishPollMs:number` (default 5000; screen 3000), `onFeed:function({count})`; `feed.save` คืน `Promise<{ok, status, error}>`; export `_mergeFeed(state, list) -> {fresh:[], pool:[]}` สำหรับ test
- `_mergeFeed`: state = `{seen:{id:1}, mine:{id:1}}`; id ที่ไม่เคยเห็นและไม่ใช่ของตัวเอง → fresh (เรียงเก่า→ใหม่, ตัดเหลือ 30 ใหม่สุด); id ที่เห็นแล้ว → pool สำหรับสุ่ม; รองรับรายการไม่มี id (fallback key = name+wish)
- feedLoop: poll ทุก `wishPollMs`; fresh ลอยก่อน (ห่าง ≥1.5s), ถ้าไม่มี fresh สุ่มจาก pool ตาม `wishFeedEvery` เดิม; เรียก `onFeed({count})`
- submit: ถ้ามี `LoyKrathongFilter` และ check ไม่ผ่าน → toast ข้อความบล็อก, ไม่ลอย, คงข้อความใน input; save ได้ 422/429 → toast ตาม constraint (กระทงลอยไปแล้วในจอตัวเอง ไม่เป็นไร); ได้ 201 → เก็บ id ใน `mine`, toast `🪷 กระทงของคุณลอยไปให้เพื่อนๆ เห็นแล้ว`
- screen: ซ่อน `.lk-bottom`, `.lk-close`, ปิด Escape, คำทักเป็น `ร่วมลอยกระทงด้วยกัน`; quality default `high`
- [ ] Test `tests/merge-feed.test.js` (โหลดไฟล์ผ่าน `vm` ด้วย window stub): ใหม่ → fresh, เรียกซ้ำ → pool, ของตัวเองไม่อยู่ใน fresh, ชื่อซ้ำกับตัวเองแต่ id ต่างยังอยู่, 50 อันใหม่ → fresh 30
- [ ] Run → FAIL; implement; Run → PASS; commit

### Task 4: หน้าเว็บ `public/index.html` + `public/app.js`
**Interfaces — Consumes:** `LoyKrathongEasterEgg.show(opts)` จาก Task 3, `LoyKrathongFilter`
- หน้ากรอกชื่อ: พื้นหลังกลางคืน (ไล่สีน้ำเงินเข้ม-ม่วง, ดาว, แสงเทียน), หัวข้อ `ลอยกระทงออนไลน์ ๒๕๖๙`, ช่องชื่อ (maxlength 40, จำใน localStorage `lk-name`), ปุ่ม `ไปลอยกระทง 🪷`; กดแล้ว `show({userName, wishFeed:'/api/wishes', enterLabel:'กลับหน้าแรก'})`; preload ตอนโหลดหน้า
- `?screen=1`: ไม่แสดงฟอร์ม เรียก show({screen:true, wishFeed, onFeed}) + overlay มุมขวาล่าง: QR (qrcode-generator 1.4.4 จาก cdn.jsdelivr.net, สร้างเป็น SVG ในเครื่อง) ของ `location.origin + '/'` + ข้อความ `สแกนเพื่อร่วมลอยกระทง` + ตัวนับ `ลอยไปแล้ว N กระทง`
- ไม่มี inline script/handler (รองรับ CSP)
- [ ] รัน `npm run dev`, เปิดหน้าแรกและ `/?screen=1` ในเบราว์เซอร์/ภาพหน้าจอ มือถือ 390×844 และ 1920×1080; ลอยจากแท็บหนึ่ง เห็นในจอใหญ่ภายใน ~5s; commit

### Task 5: `vercel.json` + README deploy
- `vercel.json`: headers ทุก path — CSP `default-src 'self'; script-src 'self' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`; `/semed-logo.png` และ js: `Cache-Control: public, max-age=3600`
- `README.md` (ไทย): deploy ผ่าน `npx vercel` หรือ GitHub, เพิ่ม Upstash ใน Storage, redeploy, ลิงก์จอใหญ่, แก้รายการคำใน `public/filter.js`
- [ ] ตรวจว่า CSP ไม่บล็อกอะไรใน dev (เปิด console ไม่มี CSP error — ใส่ header เดียวกันใน wish-server.js); `npm test` ผ่านทั้งหมด; commit
