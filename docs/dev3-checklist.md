# ลำดับปิดงาน Developer 3

ผลตรวจรับล่าสุด 19 พฤศจิกายน 2026: [ลำดับ 16–23](priority-16-23.md) ผ่าน acceptance รวม 25 checks และธุรกรรม Sepolia เดิมทั้งรับสินค้า/คืนเงิน/จ่ายเงิน รวมถึงข้อความสถานะในแชทที่เพิ่มจากผลทดสอบ รายงานระบุขอบเขต test wallet และ Cloud ไว้แยกชัดเจน

ปรับสถานะวันที่ 18 พฤศจิกายน 2026 ตามขอบเขตรุ่น 5 วันใน `PlanDev.md`

อัปเดตหลังรวม Dev 2 วันที่ 19 พฤศจิกายน 2026: ดู [ผลตรวจงานค้างทั้งทีม](team-completion-audit.md) สำหรับรายการปัจจุบัน รวมจุดเชื่อมรูปแชท/ยอดค้างรับ/การอัปโหลดบนโฮสต์จริง

หลังทำรายการลำดับ 1–6: ตั้ง signer และ sender พร้อม gas แล้ว ติดตั้ง local Cron/Vault และทดสอบ HTTP 200; เพิ่ม image decode กับ direct Storage uploads ดู [ผลดำเนินการและวิธีเปิดใช้งาน](priority-1-6.md) งานตรวจรับซื้อขายบน Sepolia และ Cloud deployment ยังแยกต่างหาก

## 1. ฐานข้อมูลและสิทธิ์ — ทำแล้วในเครื่องนี้

- [x] เชื่อม backend กับ Supabase ที่เว็บใช้อยู่ (`http://127.0.0.1:54321`)
- [x] ตรวจตารางและ views ของหลักฐาน ข้อพิพาท คำตัดสิน ประวัติ staff และ indexer ผ่าน Data API จริง
- [x] ตรวจ private bucket `order-evidence`, ชนิดรูป และขนาด 10 MB
- [x] ทดสอบอัปโหลด → signed URL → ดาวน์โหลด → hash ตรง → public URL เปิดไม่ได้ และลบไฟล์ตรวจสอบแล้ว
- [x] แก้ migration ให้เติมยอดเงินและข้อมูลคู่ค้าของออเดอร์เดิมก่อนใช้ domain พร้อมรักษาคำตัดสินเดิม
- [x] แก้ unique index ให้ replacement funding หลัง reorg ทำงานได้ โดยยังห้าม canonical orders ซ้ำต่อประกาศ
- [x] ตัด order ที่หลุด chain ออกจากรายการคำตัดสินล่าสุด
- [x] สร้าง migration `20261118150408_dev3_canonical_orders.sql` จากฐานข้อมูลที่แก้ และบันทึก migration history ใน local แล้ว
- [x] ตรวจ Security Advisors ของ local: ไม่พบปัญหา

คำสั่งตรวจซ้ำ:

```powershell
npm run db:check
npm run db:check:storage
npx supabase migration list --local
```

`db:check` อ่านข้อมูลเพื่อตรวจ schema และคิวเท่านั้น ส่วน `db:check:storage` สร้างไฟล์ตรวจสอบใหม่หนึ่งไฟล์ใน `_connection-check/` แล้วลบเฉพาะไฟล์นั้นเมื่อเสร็จ ไม่มีการสร้างออเดอร์สาธิตลงฐานข้อมูลจริง

เครื่องทีมที่ยังไม่ได้ใช้ migration Dev 3 ให้ใช้ไฟล์เวอร์ชันที่แก้ใน branch นี้ก่อน `npx supabase migration up --local` เครื่องที่ใช้ migration Dev 3 ไปแล้วให้ใช้ migration ใหม่ที่ค้างตามปกติ ไม่รัน migration เก่าซ้ำหรือ reset ข้อมูล

## 2. เชื่อมสถานะจาก Contract เข้าฐานข้อมูล — ตั้งค่าและติดตั้ง Cron ใน local แล้ว

- [x] ตรวจ chain ID, ที่อยู่ Contract และบล็อกติดตั้งผ่าน RPC ให้ตรงกับ `docs/handoff.md`
- [x] ตั้ง `ESCROW_START_BLOCK` และ secret สุ่มของ endpoint ใน `.env` ที่ไม่ถูก commit
- [x] แก้ indexer ให้ลดช่วงอ่านตามข้อจำกัด RPC ของโปรเจกต์ (10 บล็อกต่อคำขอ)
- [x] เรียก endpoint จริงและตรวจว่า checkpoint เขียนลง Supabase สำเร็จ
- [x] อ่านย้อนหลังจากบล็อกติดตั้งจนถึง confirmed head ณ เวลาตรวจ: checkpoint `12162278` ตรงกับ head `12162278`
- [x] ติดตั้ง local scheduler เรียก `/api/v1/internal/indexer` ทุกหนึ่งนาที โดยเก็บ URL/token ใน Vault และตรวจ HTTP 200 จริง
- [x] ตั้ง `INDEXER_SENDER_PRIVATE_KEY` เป็นบัญชีเฉพาะและเติม 0.001 Sepolia ETH ยืนยันครบ 3 confirmations
- [ ] ทดสอบ job หลัง RPC ขัดข้องและหลังบริการ restart

การอ่าน events ใช้เฉพาะข้อมูลที่ครบ 3 confirmations และเขียน projection/checkpoint ใน transaction เดียว รอบ backfill เดิมไม่มี sender key; รอบลำดับ 1–6 ตั้ง key และเติม gas แล้ว แต่ยังไม่ได้ทดสอบ escalation ของออเดอร์จริงเพราะคิว local ว่าง

ระหว่าง backfill พบ RPC จำกัดอัตรา (`Too Many Requests`) จึงเว้นช่วงแล้วอ่านต่อจาก checkpoint เดิมจนทัน การรัน Cron ควรมีการติดตาม 503/429 และ retry ในรอบถัดไป ปัจจุบันคิวใน local ยังว่าง ไม่มีการเติมออเดอร์ปลอมเพื่อให้หน้าเว็บมีรายการ

## 3. เปิดใช้ใบรับหลักฐาน — ตั้ง signer แล้ว; รอทดสอบการซื้อขายจริง

- [x] ตั้ง `EVIDENCE_SIGNER_PRIVATE_KEY` ให้ตรงกับ Contract เดิม และทดสอบลงนาม/ตรวจ EIP-712 กลับสำเร็จ
- [ ] ทดสอบอัปโหลดจากผู้ขาย/ผู้ซื้อ → ใบรับ EIP-712 → confirmDelivery/confirmReceipt ผ่าน MetaMask
- [ ] ทดสอบกรณี signer ผิด ไม่ได้ตั้ง key และเซ็นไม่สำเร็จ โดยไม่ทำให้ผู้ใช้เข้าใจว่ายืนยันสำเร็จ

อย่าสร้าง key ใหม่มาใช้แทน signer เดิม เพราะ Contract รุ่นนี้กำหนด signer ตอนติดตั้ง ใช้ `.env.example` เป็นรายการค่า และเก็บ private key ใน `.env.local` หรือ server environment

## 4. ทำให้ประวัติผู้ดูแลกู้คืนได้ — เพิ่ม implementation และ tests แล้ว; รอ E2E รวม

- [x] แทน best-effort `recordActivity()` ด้วยการตรวจ tx จริง บันทึกแบบ idempotent และแจ้ง retry แทนกลืนข้อผิดพลาด
- [x] เพิ่ม retry/hash recovery หลัง reload และ reconciliation จาก confirmed events พร้อมรักษาประวัติ reorg
- [x] แยกส่งแล้ว/ยืนยันแล้ว/ล้มเหลว/UNKNOWN และ atomic failed-tx audit; tests ตรวจ rollback และการบันทึกซ้ำ
- [ ] ตรวจรับด้วย MetaMask/หลายบทบาทจริงครบเส้นทางบน environment รวม ดู [ผลข้อ 7–15](priority-7-15.md)

## 5. เชื่อมหน้าซื้อขายของ Dev 2 — มีโค้ดเชื่อมแล้ว; รอตรวจรับจริง

- [x] มีโค้ดเชื่อมฟอร์มอัปโหลด delivery/receipt/dispute กับ API ของ Dev 3
- [x] มีโค้ดเชื่อมเหตุผลข้อพิพาท → openDispute → indexer → คิว Admin
- [x] หน้าคู่ค้า polling สถานะจาก Contract หลัง confirmations ผ่าน API orders
- [x] เปิด local scheduler, เพิ่ม projectionReady และ browser fixture ตรวจช่วงรอ; หน้า Admin auto refresh ทุก 15 วินาที
- [x] เชื่อมรูปแชทของ Dev 2 ให้ผู้ดูแลดูได้พร้อม audit และ pagination แบบ cursor
- [ ] ทดสอบ refund เต็มจำนวน และ release ผู้ขาย/แพลตฟอร์มครบเส้นทาง

หลังรวม `bitka` ใน `codex/integrate-dev2` และแก้ข้อ 1–15 มี UI/API/Contract เชื่อมกันและตั้ง signer แล้ว การติ๊กว่ามีโค้ดข้างต้นยังไม่แทนการตรวจรับด้วย MetaMask/Sepolia จริงครบเส้นทาง

## 6. เพิ่มการทดสอบและตรวจรับ — ทำบางส่วนแล้ว

- [x] เพิ่ม regression tests ของ upgrade ที่มีออเดอร์/คำตัดสินเดิม
- [x] เพิ่ม reorg/replacement funding และตรวจว่าหลักฐานเดิมยังอยู่
- [x] ตรวจ event ซ้ำ, stale checkpoint และ rollback ของ batch ที่ผิดพลาด
- [x] ตรวจ service-role queries และปฏิเสธ direct access ของ anon/authenticated ต่อข้อมูลส่วนตัว
- [x] เพิ่ม tests ของข้อจำกัด RPC และ safe confirmed head
- [x] ตรวจ evidence receipt และ decision draft เชื่อมกับ confirmed events จนแสดงคำตัดสินใน staff view
- [ ] เพิ่ม API tests แยก buyer/seller/staff/คนนอก พร้อมตรวจ session จริง
- [ ] เพิ่ม tests ของไฟล์เกินขนาด ปลอมชนิดไฟล์ rate limit และ signed URL หมดอายุ
- [ ] ทดสอบคำตัดสินพร้อมกัน หมดเวลา 24/48 ชั่วโมง และ MetaMask ปฏิเสธ
- [ ] ทำ E2E ด้วย MetaMask บน Sepolia และเก็บ transaction hashes ในรายงานส่งมอบ

ผลตรวจรอบนี้: `npm test` ผ่าน 12 tests, `npm run typecheck` ผ่าน, `npm run db:check:storage` ผ่าน และคำขอ indexer ที่ไม่มี secret ยังตอบ 401 การทดสอบเหล่านี้ยังไม่แทน E2E ด้วย MetaMask หลายบทบาท

## 7. หน้าจอและชุดส่งมอบ — ทำบางส่วนแล้ว

- [x] เพิ่ม `.env.example` และคำสั่งตรวจฐานข้อมูล/Storage
- [x] ปรับหน้า Admin/Super Admin ตาม `Design.md` ซึ่งกำหนดภาษาอังกฤษและ Dark/Sci-Fi (ปรับตามคำขอ UI วันที่ 19 พฤศจิกายน 2026)
- [x] ตรวจ UI queue/order/history/super ด้วย fixture ทั้ง 2 ธีมและ 5 ขนาดจอ โดยยังแยกจาก E2E บน session/Wallet จริง
- [ ] เตรียมข้อมูลสาธิตข้อพิพาท คำตัดสิน และออเดอร์เกินกำหนดใน environment สำหรับสาธิต
- [ ] ส่งคู่มือ Admin, วิธีติดตั้ง Cron/กู้ indexer และรายงานการสาธิต

ระบบเปลี่ยน/ถอดผู้ดูแล ระงับผู้ใช้ และรายงานประกาศเป็นงานรอบถัดไปตาม `PlanDev.md` จึงไม่รวมในลำดับตรวจรับนี้
