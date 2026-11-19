# ผลตรวจงาน Developer 3

วันที่ตรวจ: 18 พฤศจิกายน 2026

สถานะล่าสุดหลังรวม Dev 2 วันที่ 19 พฤศจิกายน 2026 อยู่ใน [ผลตรวจงานค้าง Developer 1–3](team-completion-audit.md) รายงานเก่านี้เก็บไว้เป็นประวัติ ไม่ใช่ checklist ปัจจุบัน

> รายงานด้านล่างเป็นผลตรวจรอบแรก ก่อนแก้ส่วนฐานข้อมูล ดูสถานะหลังแก้และลำดับงานที่ค้างใน [ลำดับปิดงาน Dev 3](dev3-checklist.md). รอบถัดมาแก้ migration/reorg, เชื่อมและทดสอบฐานข้อมูล/Storage, ตั้ง deploy block/indexer secret และแก้ข้อจำกัด RPC แล้ว

ข้อสรุป: มีโค้ดของระบบหลักฐาน หน้า Admin/Super Admin และ indexer แล้ว แต่ยังไม่ครบเกณฑ์ตรวจรับรุ่นสาธิต พบข้อบกพร่องที่ทำซ้ำได้ 2 จุด และยังขาดการตั้งค่าการทำงานอัตโนมัติ ชุดทดสอบเฉพาะส่วน และหลักฐานการสาธิตครบเส้นทาง

การตรวจครั้งนี้เป็นการตรวจงาน ไม่ได้แก้โค้ดหรือปรับการตั้งค่าระบบเพิ่มเติม รายงานนี้แยกจากการแก้ script และใช้ migration ในแชทก่อนหน้า

## ขอบเขตที่ใช้ตรวจ

- ใช้ `PlanDev.md` เป็นรายการส่งมอบรุ่น 5 วัน โดยเฉพาะหัวข้อ 2–5
- ใช้ `FullPlan.md` ประกอบรายละเอียดพฤติกรรมหลักฐานและข้อพิพาท
- `PlanDev.md` ระบุชัดว่าลดขอบเขตจากแผนต้นฉบับ ดังนั้นระบบเพิ่ม/เปลี่ยน/ถอนผู้ดูแล การจัดการและระงับผู้ใช้ รายงานประกาศ รีวิว การแจ้งเตือนแยกหน้า รายงานยอดขาย และตัวกรองขั้นสูง ไม่ถูกนับเป็นงาน Dev 3 ที่ขาดในรุ่นนี้
- ตรวจโค้ดและฐานข้อมูล Supabase ในเครื่อง ไม่ได้ตรวจการตั้งค่าทุก environment หรือยืนยันธุรกรรมใหม่บน Sepolia

## ตารางเทียบสิ่งที่ต้องส่ง

| งาน | สิ่งที่พบ | ผลตรวจ |
| --- | --- | --- |
| อัปโหลดหลักฐานส่วนตัว | มี API ตรวจคู่ค้า/ขั้นตอน ตรวจ magic bytes ชนิดไฟล์และขนาด 10 MB จำกัดอัตรา ใช้ path ใหม่และ `upsert: false` | มี implementation; ยังขาด integration tests และ signer ของเครื่องนี้ |
| ใบรับหลักฐานลงนาม | มี EIP-712 ผูก chain/contract/order/submitter/stage/hash และบันทึก batch ใน `evidence_receipts` | มี implementation; ยังไม่ยืนยันการใช้ใบรับจาก API กับ Contract จริงครบเส้นทาง |
| เปิดดูไฟล์และตรวจ hash | มี signed URL อายุ 60 วินาที ตรวจสิทธิ์ order บันทึก staff access ก่อนออก URL และ endpoint ตรวจ hash | มี implementation; ยังไม่มีชุดทดสอบ storage/สิทธิ์ไฟล์ครบกรณี |
| ข้อพิพาท | มี API เก็บเหตุผลก่อนส่งธุรกรรม ไม่เปลี่ยนสถานะสำเร็จจาก hash อย่างเดียว | มี API; การเปิดข้อพิพาทและแนบรูปจากหน้าซื้อขายต้องเชื่อมกับ Dev 2 |
| คิว Admin | มี IN_REVIEW, เกินกำหนด และคำตัดสินล่าสุด พร้อมหน้าเจาะ order | มี implementation; ปัญหา view หายจากเครื่องนี้แก้แล้วในแชทก่อนหน้า |
| หน้าตรวจ order | แสดงข้อตกลง คู่ค้า chat หลักฐาน timeline และ staff activity | มี implementation; ยังไม่ได้ตรวจครบด้วยข้อมูลสาธิตและผู้ใช้หลายบทบาท |
| คำตัดสินผ่าน Wallet | เก็บเหตุผล/hash ก่อนส่ง รองรับ refund/release จำลองธุรกรรม และรอ 3 confirmations | มี implementation; ยังขาด E2E ของ API → MetaMask → chain → indexer → UI |
| ประวัติผู้ดูแล | มี append-only audit table และหน้า history | มี implementation แต่การบันทึก transaction activity ยังสูญหายได้ ดูข้อบกพร่องข้อ 3 |
| Super Admin | แสดงสิทธิ์บน Contract หยุด/เปิดเงินฝากใหม่ และแสดง pending payouts | มี implementation; ยังขาด E2E หลายบทบาทและ pause/resume |
| อ่าน chain และ checkpoint | มี confirmed safe head, event deduplication, batch, atomic projection/checkpoint และ reorg rewind | มี implementation แต่ reorg บางกรณีหยุดทำงาน ดูข้อบกพร่องข้อ 2 |
| ยกระดับออเดอร์เกินกำหนด | มี background sender และปุ่มให้ staff ส่งจาก Wallet | มี implementation; เครื่องนี้ยังไม่มี sender key สำหรับทำอัตโนมัติ |
| ทำงานทุกหนึ่งนาที | มี endpoint `/api/v1/internal/indexer` | ยังไม่พบ schedule/Edge Function หรือคำแนะนำติดตั้ง schedule ใน repository; local ยังไม่มี Cron |
| ภาษาไทย/มือถือ/testnet | ใช้ layout รองรับหลายขนาดและมีข้อความ testnet | หน้าและข้อความ Admin ยังเป็นอังกฤษ จึงไม่ตรงข้อกำหนดภาษาไทย; ยังไม่มี mobile E2E ของหน้าผู้ดูแลที่มีข้อมูล |
| คู่มือ/รายงาน/ข้อมูลสาธิต | มี handoff และ setup checklist ทั่วไป | ยังไม่พบคู่มือปฏิบัติงาน Admin, รายงานทดสอบ Dev 3 หรือ seed สำหรับข้อพิพาท/คำตัดสิน/หลักฐาน |

## ข้อบกพร่องที่ควรแก้ก่อนตรวจรับ

### 1. P1 — migration ใช้ไม่ผ่านเมื่อมีออเดอร์เดิม

ตำแหน่ง: `supabase/migrations/20261117090000_evidence_disputes_indexer.sql:15`

Migration เพิ่ม `orders.amount_wei` ด้วย domain `positive_wei` โดยไม่มีค่าเริ่มต้นหรือการเติมค่าจาก offers ก่อน ขณะที่ check ของ domain ใน foundation ไม่ยอมรับ NULL เมื่อมี order เดิม การเพิ่ม column จึงล้มเหลว

ทดสอบใน PGlite แยกจากฐานข้อมูลใช้งานจริง: ใช้ foundation และ migration บัญชี สร้าง order ตาม schema เดิม แล้วใช้ migration Dev 3 ได้ผล:

```text
23514: value for domain positive_wei violates check constraint "positive_wei_check"
```

ผลกระทบ: เครื่องหรือ environment ที่มีออเดอร์ก่อนรวม branch ไม่สามารถอัปเกรด schema นี้ได้ การทดสอบปัจจุบันใช้ฐานข้อมูลว่างจึงไม่พบปัญหานี้ เครื่องที่แก้ในแชทก่อนหน้ามีออเดอร์ 0 รายการจึงใช้ migration ผ่าน

สิ่งที่ต้องทำ: ออกแบบขั้นตอนเพิ่ม column/เติมค่าจาก offers/ตรวจข้อมูลเดิม แล้วจึงบังคับ domain พร้อมทดสอบ upgrade จากฐานข้อมูลที่มีข้อมูล ไม่แก้เฉพาะ fixture หรือ reset ข้อมูลเพื่อให้ผ่าน

### 2. P1 — reorg แล้วออเดอร์ใหม่ของประกาศเดิมทำให้ indexer ติดค้าง

ตำแหน่ง: `supabase/migrations/20261117090000_evidence_disputes_indexer.sql:197` และ unique constraint ใน foundation บรรทัด 117

เมื่อ funding ถูกถอนออกจาก canonical chain ฟังก์ชัน rebuild เก็บ order เดิมไว้ด้วย `on_chain = false` แต่ยังมี unique constraint `(chain_id, escrow_address, listing_id)` ครอบคลุม order ที่ไม่อยู่บน chain ด้วย หาก canonical chain ใหม่มี funding เป็น order ใหม่ของประกาศเดิม การสร้าง projection ของ order ใหม่จะชนแถวเก่า

ทดสอบจริงผ่าน `indexer_apply_batch` → `indexer_rewind` → `indexer_apply_batch` บน PGlite:

```text
rewound_order: on_chain = false
23505: duplicate key value violates unique constraint "orders_chain_id_escrow_address_listing_id_key"
```

ผลกระทบ: transaction ของ batch rollback และ checkpoint ไม่เดินต่อ การลองใหม่จะชนซ้ำ จึงกระทบการอัปเดตออเดอร์อื่นใน batch ด้วย

สิ่งที่ต้องทำ: ปรับกติกาความเป็นเอกลักษณ์ให้เก็บประวัติ order ที่หลุด chain ได้ พร้อมรักษากติกาหนึ่ง canonical funded order ต่อประกาศ และเพิ่ม regression test ของ replacement funding

### 3. P2 — ประวัติ transaction activity ของ staff สูญหายได้

ตำแหน่ง: `src/components/admin/staff-actions.tsx:29`

`recordActivity()` กลืนข้อผิดพลาดจาก `/api/v1/admin/activity` ทั้งหมด การส่ง transaction จึงดำเนินต่อโดยไม่มีบันทึก `DECISION_SUBMITTED`, `ESCALATION_SUBMITTED` หรือ `FUNDING_PAUSE_SUBMITTED` ได้ แม้ indexer เก็บ chain events แต่ไม่มี logic เติมรายการ audit ที่ขาดกลับเข้า `audit_logs` ส่วนหน้า history อ่านจาก `audit_logs` เท่านั้น

สิ่งที่ต้องทำ: มีสถานะบันทึกค้างและ retry ที่อ้างอิง transaction เดิม หรือ reconciliation จาก confirmed chain events และแยก submitted/confirmed/failed ให้ตรวจสอบย้อนหลังได้ โดยไม่ส่งธุรกรรมซ้ำเพื่อแก้การบันทึกประวัติ

## งานตั้งค่าและเปิดระบบที่ยังค้างในเครื่องนี้

ตรวจเฉพาะสถานะมี/ไม่มีค่า โดยไม่บันทึกค่าลับ:

| ค่า/บริการ | สถานะ | ผลต่อการทำงาน |
| --- | --- | --- |
| `SUPABASE_SECRET_KEY` | มี | backend ติดต่อฐานข้อมูลได้ |
| `NEXT_PUBLIC_ESCROW_ADDRESS`, `SEPOLIA_RPC_URL` | มี | มีเป้าหมาย Contract/RPC |
| `EVIDENCE_SIGNER_PRIVATE_KEY` | ไม่มี | ออกใบรับหลักฐานส่ง/รับไม่ได้ |
| `ESCROW_START_BLOCK` | ไม่มี | `runIndexer()` ปฏิเสธการเริ่ม index Sepolia |
| `INDEXER_SECRET` / `CRON_SECRET` | ไม่มีทั้งคู่ | endpoint indexer ปฏิเสธทุกคำขอ |
| `INDEXER_SENDER_PRIVATE_KEY` | ไม่มี | background job ไม่ส่งธุรกรรมยกระดับออเดอร์อัตโนมัติ; ยังมีวิธีให้ staff ส่งด้วยมือ |
| `pg_cron`, `pg_net`, `cron.job` ใน local | ไม่มี | ยังไม่มี Supabase Cron ในฐานข้อมูลที่ตรวจ |
| `.env.example` | ไม่พบ | คู่มืออ้างถึงไฟล์ตัวอย่างที่ไม่มีอยู่ใน checkout |

ไม่พบไฟล์ schedule หรือ Supabase Edge Function สำหรับเรียกงานทุกนาทีใน repository ปัจจุบัน ตัว endpoint ที่มีอยู่เป็น Next.js Route Handler หากทีมเลือกใช้อันนี้แทน Edge Function ต้องส่งการตั้ง scheduler และคู่มือให้รันซ้ำได้ด้วย การไม่พบใน local/repository ไม่ใช่ข้อยืนยันว่าไม่มีการติดตั้งด้วยมือในระบบอื่น

จำนวนข้อมูล local ที่ตรวจ: orders, evidence, decision_drafts, chain_events และ chain_checkpoints เท่ากับ 0 ทั้งหมด จึงยังใช้เครื่องนี้สาธิตกรณีคืนเงิน จ่ายหลังข้อพิพาท และออเดอร์เกินกำหนดไม่ได้ทันที

## ชุดทดสอบและหลักฐานที่ยังขาด

ชุดทดสอบที่มีอยู่ยังไม่ครอบคลุมงาน Dev 3 โดยตรงครบเส้นทาง:

- unit tests ของ file validation, upload rules, signer และ pure indexer helpers
- integration tests ของอัปโหลด → storage → evidence rows → signed receipt
- การเปิดไฟล์โดย buyer/seller/staff เทียบกับคนนอกและผู้ใช้ไม่ล็อกอิน รวมถึง signed URL หมดอายุและการแก้ hash
- decision API ตามบทบาท และการตัดสินพร้อมกัน/ซ้ำผ่านหน้าเว็บ
- indexer replay, events ซ้ำ, RPC ล่ม, checkpoint ชนกัน และ reorg/replacement funding
- งานหมดเวลา 24/48 ชั่วโมงตั้งแต่ job ส่งธุรกรรมจนหน้า Admin เห็นสถานะจริง
- staff history เมื่อ API บันทึก activity ขัดข้อง
- mobile E2E ของหน้า queue/order/history/super และกรณีเข้าหน้าโดยไม่มีสิทธิ์
- รายงานสาธิตด้วย MetaMask จริงบน Sepolia: อัปโหลดใบรับ → เปิดข้อพิพาท → refund/release → projection และหน้าเว็บตรงกัน

Contract tests มีกรณีเงิน ลายเซ็น หลักฐานผิดบริบท คำตัดสินซ้ำ หมดเวลา และสิทธิ์อยู่แล้ว แต่ไม่ได้ทดสอบ API/storage/indexer ของ Dev 3 ชุด Vitest ปัจจุบันผ่าน migration บนฐานข้อมูลว่างและทดสอบสิทธิ์พื้นฐาน ส่วน Playwright เน้น storefront/theme

## สิ่งที่ตรวจและรันจริงครั้งนี้

| การตรวจ | ผล |
| --- | --- |
| `npm run typecheck` | ผ่าน |
| `npm test` | ผ่าน 5 tests |
| `npm run contracts:test` | ผ่าน 13 tests |
| API ไม่มี session: evidence GET/POST, เปิดไฟล์, dispute, decision, activity | ทั้ง 6 endpoint/method ตอบ 401 `UNAUTHENTICATED` |
| indexer ไม่มี secret | ตอบ 401 `UNAUTHENTICATED` |
| upgrade ฐานข้อมูลที่มี order เดิม | พบข้อบกพร่อง 23514 ตามข้อ 1 |
| funding → reorg → replacement funding | พบข้อบกพร่อง 23505 ตามข้อ 2 |
| Supabase local extensions/counts | ยังไม่มี Cron และข้อมูลสาธิตงาน Dev 3 |

การตรวจครั้งนี้ไม่ได้ส่งธุรกรรม เปลี่ยนค่า secret ตั้ง Cron หรือแก้ฐานข้อมูลใช้งานจริง และไม่ได้รัน production build หรือ E2E ที่ต้องใช้ session/MetaMask หลายบทบาท จึงยังไม่รับรองการส่งมอบออนไลน์บน Sepolia

## ลำดับงานแนะนำสำหรับปิด Dev 3

1. แก้ migration upgrade และ reorg พร้อม regression tests
2. ตั้ง signer ให้ตรงกับ Contract, deploy block, indexer secret และ scheduler ทุกหนึ่งนาที; เตรียม sender ที่มี gas สำหรับ automatic escalation
3. ทำให้ประวัติ staff transaction กู้กลับได้เมื่อการบันทึกขัดข้อง
4. เพิ่ม integration/E2E ของหลักฐาน สิทธิ์ คำตัดสิน หมดเวลา และ indexer พร้อมเชื่อม Dev 2
5. เปลี่ยนข้อความ Admin เป็นภาษาไทยตามแผน และทดสอบหน้าที่มีข้อมูลบนมือถือ
6. ส่ง `.env.example`, คู่มือติดตั้ง Cron/กู้ indexer, คู่มือปฏิบัติงาน Admin, ข้อมูลสาธิต และรายงาน MetaMask/Sepolia

การตรวจรับควรยึดผลสาธิตและหลักฐานการทดสอบตามรายการข้างต้น ไม่ใช้จำนวนไฟล์หรือการผ่าน typecheck เป็นตัวแทนความครบของระบบ
