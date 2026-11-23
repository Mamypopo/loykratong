# ลอยกระทงออนไลน์ (ในองค์กร) บน Vercel — Design

วันที่: 2026-11-23 · เป้าหมาย: ใช้งานได้ทันวันลอยกระทง 24 พ.ย. 2569

## เป้าหมาย / ทำไม
ให้คนในองค์กรเปิดลิงก์เดียว กรอกชื่อ ลอยกระทงพร้อมคำอธิษฐาน และเห็นกระทงของเพื่อนร่วมงานลอยมาในฉากเดียวกัน
พร้อมจอใหญ่สำหรับฉายในงานที่รวมกระทงของทุกคน

**Goals**
- ไม่มี login: หน้าแรกกรอกชื่อ (จำไว้ใน localStorage) → เข้าฉาก, ไม่ผูกกับวันที่ (เปิดได้ตลอด)
- กระทงที่คนเพิ่งลอย โผล่ในจอคนอื่น/จอใหญ่ภายใน ~3–5 วินาที
- ตัวกรองคำไม่เหมาะสม ทั้งฝั่ง server (บังคับ) และฝั่ง client (แจ้งทันที)
- โหมดจอใหญ่ `/?screen=1`: ฉากเต็มจอ ไม่มีช่องพิมพ์, ตัวนับ "ลอยไปแล้ว N กระทง", QR code ของลิงก์หน้าแรก
- Deploy บน Vercel ฟรี, ตั้งค่าตาม best practice

**Non-goals**
- เก็บคำอธิษฐานถาวร / หน้า admin / หน้าลบ (ลอยแล้วหายได้ ผู้ใช้ยืนยันว่าไม่ติดใจ)
- ระบบยืนยันตัวตน

**Anti-goals**
- คำหยาบ/สแปม/ลิงก์ขึ้นจอใหญ่
- ใช้โควต้าฟรีหมดกลางงาน
- ฉากช้าลงหรือพังบนมือถือ

## Approaches ที่พิจารณา
1. **รันบนเครื่องผู้ใช้ + Cloudflare Tunnel** — ง่าย ไม่ต้องสมัคร แต่เครื่องต้องเปิดตลอด ลิงก์เปลี่ยนทุกครั้ง
2. **Vercel + Upstash Redis (เลือก)** — ลิงก์ถาวร ไม่ต้องเฝ้าเครื่อง ผู้ใช้มีบัญชี Vercel อยู่แล้ว ต้องแปลง server เป็น function
3. Vercel อย่างเดียวไม่มีที่เก็บ — ตัดทิ้ง: function แต่ละตัวไม่แชร์ memory จึงเห็นกระทงคนอื่นไม่ได้

## การออกแบบ
**โครงไฟล์**
```
public/index.html, public/app.js        หน้ากรอกชื่อ + โหมดจอใหญ่ (ไม่มี inline script เพื่อใช้ CSP ได้)
public/loykrathong-easter-egg.js        ฉากเดิม + ปรับ: ลอยของใหม่ก่อนสุ่ม, โหมด screen
public/semed-logo.png
api/wishes.js                           Vercel function (GET/POST)
lib/filter.js                           ตัวกรองคำ ใช้ร่วม server/dev
vercel.json                             security headers
wish-server.js                          คงไว้สำหรับรัน local (ใช้ lib/filter.js, เก็บใน memory/ไฟล์)
```

**ที่เก็บ (Upstash Redis ผ่าน Vercel Marketplace, เรียก REST ด้วย fetch ไม่มี dependency)**
- `lk:wishes` list: LPUSH `{id,name,wish,at}` + LTRIM เหลือ 300, EXPIRE 7 วัน
- `lk:count` ตัวนับรวม (INCR)
- rate limit: `SET lk:rl:<ip> 1 NX EX 4` ต่อ POST (IP จาก `x-real-ip` ที่ Vercel ใส่ให้)

**API (same-origin เท่านั้น ไม่เปิด CORS)**
- `GET /api/wishes` → `{ count, wishes: [ล่าสุด 50 อัน] }`, `Cache-Control: public, s-maxage=3, stale-while-revalidate=10`
  ทำให้ Redis ถูกเรียก ~1 ครั้ง/3 วินาที ไม่ว่าจะมีกี่คน
- `POST /api/wishes {name, wish}` → ตรวจ Origin ตรงกับ host, JSON เท่านั้น, ขนาด ≤4KB, ความยาวชื่อ 40 / คำอธิษฐาน 80,
  ผ่านตัวกรอง, rate limit → 201 / 400 / 422 (blocked) / 429
- client จำ id ที่เคยเห็น: ของใหม่ลอยทันที, ของเก่าสุ่มลอยกลับเป็นระยะตามกลไกเดิม

**ตัวกรอง**
- normalize: ตัวเล็ก, ตัด zero-width/ช่องว่าง/จุด/ตัวซ้ำ, แทน leetspeak พื้นฐาน
- รายการคำหยาบไทย+อังกฤษ (แก้ได้ที่ `lib/filter.js`), บล็อก URL/โดเมน, เบอร์โทร, @mention
- client เช็คก่อนส่งเพื่อขึ้นข้อความ "ขอคำอธิษฐานที่สุภาพหน่อยนะ 🙏" แต่ server เป็นตัวตัดสิน

**โหมดจอใหญ่ `/?screen=1`**
- เรียกฉากเดิมแบบไม่มีปุ่ม/ช่องพิมพ์, quality high, poll ทุก 3 วินาที
- มุมจอ: QR code ลิงก์หน้าแรก (ไลบรารี QR จาก CDN, สร้างในเบราว์เซอร์ ไม่ส่ง URL ไปบริการภายนอก) + ตัวนับ
- ไม่มีเพลงอัตโนมัติ (เบราว์เซอร์บล็อก) — มีปุ่มเปิดเสียง

**Security headers (vercel.json)**
CSP อนุญาตเฉพาะ self + cdnjs.cloudflare.com + cdn.jsdelivr.net + fonts.googleapis.com/gstatic.com,
`X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
`Permissions-Policy` ปิด camera/mic/geolocation, `X-Frame-Options: DENY` (ยกเว้นต้องฝังในเว็บองค์กร — ยังไม่มี)

## ขั้นตอนผู้ใช้ (ทำเองบน Vercel)
1. push โฟลเดอร์ขึ้น GitHub หรือ `vercel` CLI deploy
2. Project → Storage → เพิ่ม Upstash Redis (env vars ถูกใส่ให้อัตโนมัติ)
3. Redeploy → แจกลิงก์ / เปิด `/?screen=1` บนจอใหญ่

## ปล่อยให้ผู้สร้างตัดสินใจ
- รายละเอียด UI หน้ากรอกชื่อและตำแหน่ง QR/ตัวนับ (ให้เข้ากับสไตล์ฉากเดิม)
- วิธีเพิ่มกระทงใหม่เข้าฉากโดยไม่กระทบ FPS governor เดิม (จำกัดจำนวนกระทงบนจอพร้อมกัน)
