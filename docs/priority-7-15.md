# ผลดำเนินการข้อ 7–15

วันที่ 19 พฤศจิกายน 2026 บน branch `codex/integrate-dev2` ต่อจากงานข้อ 1–6 การแก้รอบนี้อยู่ใน working tree ของเครื่อง ยังไม่ promote เข้า main หรือ deploy Cloud

## ผลแต่ละข้อ

| ข้อ | การแก้ | หลักฐานตรวจ |
|---|---|---|
| 7. รอ projection หลังฝาก | orders API คืน `projectionReady` เมื่อออเดอร์ canonical ตรงทั้ง chain order ID, status และ deadline; UI ยังไม่เปิด evidence/dispute จนพร้อม และไม่ชวนฝากซ้ำ | regression tests ของข้อมูลหาย/เก่า/orphaned; browser ยืนยันว่าไม่มีคำขอ evidence ระหว่างรอ และเปิดฟอร์มหลังพร้อม |
| 8. รูปแชทใน Admin | query เพิ่ม image metadata; ปุ่มเปิดรูปเรียก endpoint staff โดยผูก message กับ conversation ของออเดอร์ และ audit ก่อนดาวน์โหลด | tests ปฏิเสธ non-staff/รูปต่างห้อง, ตรวจลำดับ audit ก่อน read และ no-store; browser เปิดรูปได้ |
| 9. แชทเกิน 500 รายการ | อ่านล่าสุดหน้าละ 50, timestamp+UUID cursor, โหลดก่อนหน้าได้ต่อเนื่อง; เมื่อ refresh ไม่ทิ้งประวัติที่โหลดแล้ว และเริ่ม pagination ใหม่หากมีช่องว่างหลังข้อความเข้ามาจำนวนมาก | tests รายการลำดับ 501–550, timestamp ซ้ำ, cursor ต่างห้อง, ไม่มีข้อความซ้ำ และ reconnect gap; browser โหลดข้อความก่อนหน้าได้ |
| 10. ประวัติธุรกรรม Admin | ตรวจ hash กับ RPC: sender/escrow/calldata/order ต้องตรง; มีตาราง staff_transactions และ audit dedupe key; indexer กู้ confirmed actions จาก events; failed tx กับ audit บันทึกใน transaction เดียว | tests ของ hash ผิดผู้ส่ง/Contract/action, retry หลัง audit ล้มเหลว, replay ไม่ซ้ำ, reorg ไม่ลบประวัติ และ rollback เมื่อ audit เขียนไม่ได้ |
| 11. กู้หลัง reload | เก็บ hash/action/context ใน localStorage ก่อนส่งประวัติ; retry พร้อม timeout และอ่านผล server; แยก UNKNOWN/รอยืนยันจาก FAILED; รับสำเร็จเฉพาะ receipt ที่มี event ตรงคำสั่ง | browser จำลอง history API ล่ม → reload → retry → confirmed และยืนยันว่าไม่ได้ POST decision ใหม่; server endpoints ยังตรวจ session ทุกครั้ง |
| 12. ถอนเงินค้างรับ | หน้า Wallet มี Queued payments สำหรับ Wallet ที่ลงชื่อเข้าใช้; review/cancel ก่อน MetaMask, ตรวจ wallet/chain, simulate/send, เก็บ hash ข้าม reload และรอ PayoutWithdrawn ครบ 3 confirmations | API tests อ่านเฉพาะ session wallet ณ confirmed block, anon ถูกปฏิเสธ, RPC ล่มไม่คืนยอด 0 ปลอม; Web3 session จริงอ่านยอดตนเองได้; browser ตรวจ review/cancel ที่ 320px; Contract tests ตรวจถอนครั้งเดียว/ขณะ pause |
| 13. โควตาพร้อมกัน | RPC จองโควตาใต้ per-user advisory lock นับทั้ง evidence ที่เก็บแล้วและส่วนที่ยังจอง ไม่คิดซ้ำเมื่อบันทึกไฟล์; ใช้กับ multipart เดิมและ staged uploads | SQL tests ของ partial batch/สิทธิ์; Supabase จริงยิง 6 คำขอพร้อมกัน คำขอละ 6 ไฟล์ รับ 5 ปฏิเสธ 1 รวม 30 ไฟล์พอดี |
| 14. Admin ตามผลเอง | refresh ทุก 15 วินาทีเมื่อหน้า visible พร้อม manual refresh เดิม; ใช้ RSC refresh เพื่อรักษา client draft; pause status อ่าน confirmed block และปุ่มกลับมาใช้ได้หลังสถานะตรงผลที่ส่ง | browser ตรวจ timer และเหตุผลร่างยังอยู่; production build ผ่าน; queue/history/order/super ใช้ layout เดียวกัน |
| 15. Configuration/RPC ร่วม | offers/evidence/admin/payout/indexer ใช้ server settings เดียวกันและตรวจ RPC chain; cache ผลตรวจสำเร็จ 30 วินาที โดยไม่ cache failure; staff กับ trader ใช้ walletConfig เดียวกัน | tests ของ override/unsupported chain/wrong chain/retry/concurrent check; env:check เทียบกับ deployment และ staff wallets จริงผ่าน |

## API และ migrations

API เพิ่ม:

- `GET /api/v1/admin/orders/:id/chat?before=<message UUID>` — staff, pagination และ audit
- `GET /api/v1/admin/orders/:id/chat/:messageId/image` — staff, scoped private image และ audit ก่อนอ่าน
- `GET /api/v1/admin/transactions?hash=<tx hash>` — อ่านเฉพาะธุรกรรมของ staff session ตนเองใน environment ปัจจุบัน
- `GET /api/v1/payout` — อ่านยอดค้างของ session wallet เท่านั้น ไม่รับ wallet จาก client

`POST /api/v1/admin/activity` ตรวจ transaction จริงก่อนเก็บ และ retry ได้ด้วย hash/dedupe key เดิม ส่วน orders API เพิ่ม `projectionReady` โดยยังแยกสถานะธุรกรรมกับสถานะออเดอร์

Migrations ใหม่ ใช้กับ local แล้วโดยไม่ reset ข้อมูล:

1. `20261118193607_staff_transaction_recovery.sql`
2. `20261118194552_atomic_evidence_quota.sql`
3. `20261118195114_staff_transaction_finalization.sql`

ตารางใหม่เปิด RLS และไม่อนุญาต browser roles อ่าน/เขียนโดยตรง RPC สำหรับ recovery/finalization/quota ให้เฉพาะ service_role ส่วน key และ .runtime ยังถูก Git ignore

เครื่องทีมอื่นใช้ pending migrations ก่อนรันโค้ด: `npx supabase migration up --local --include-all` และตรวจ `npm run db:check` ตัว scheduler จากข้อ 1–6 จะเรียก reconciliation/cleanup ต่อหลังอ่าน events สำเร็จ

## พฤติกรรม recovery

- การส่ง hash ให้ activity API ไม่ใช่หลักฐานว่าสำเร็จ server ตรวจผู้ส่ง/ปลายทาง/calldata ก่อนเก็บ submission และใช้ confirmed events/receipts ตัดสินผล
- แชทจากคู่ค้าคงเป็นข้อมูล private; ไม่เปิด bucket ต่อสาธารณะเพื่อให้ Admin ดูภาพ แต่เพิ่ม endpoint ที่ตรวจ staff และผูกกับ order
- การเรียก retry ของ activity API ไม่ส่งธุรกรรมบนเชนซ้ำ ถ้า audit write ล้มเหลวหลังเก็บ submission แล้วจะลองบันทึกด้วย dedupe key เดิม
- ถ้าการลงนามถูกปฏิเสธก่อนมี hash ให้แก้และลองใหม่ได้ ถ้ามี hash แล้วแต่ตรวจผลไม่ได้จะคง hash และสถานะ UNKNOWN/รอตรวจ ไม่แสดงว่าสำเร็จหรือเปิดให้ส่งซ้ำโดยอาศัย timeout อย่างเดียว
- หาก indexer พบ confirmed staff event ที่ไม่มี submission จากเว็บ จะสร้าง confirmed history กลับให้ Wallet ที่มี profile/staff registration อยู่แล้ว เหตุการณ์ที่ยังจับคู่ profile ไม่ได้ยังอยู่ใน chain_events ให้ reconcile รอบถัดไป
- เมื่อ confirmed event ถูก reorg จะเก็บ audit เดิมและเพิ่ม TRANSACTION_REORGED พร้อมเปลี่ยน record เป็น ORPHANED รอผลเชนใหม่ ไม่ลบหลักฐานประวัติ
- การกู้ hash ฝั่ง browser ต้องใช้ browser/origin เดิมที่ยังมี localStorage; hash ที่บันทึกถึง server แล้วอยู่ในฐานข้อมูล การสูญเสียทั้ง browser storage และ submission ที่ยังไม่ถึง server โดย transaction ไม่เคยมี confirmed event ยังต้องตรวจ hash จาก Wallet
- หลังโหลดแชทย้อนหลัง refresh จะ merge โดย UUID; ถ้าข้อความใหม่จำนวนมากทำให้เกิด gap จะเริ่มจากหน้าล่าสุดและให้โหลดก่อนหน้าใหม่ เพื่อไม่ข้ามข้อความถาวร

## ผลทดสอบ

- TypeScript ผ่าน
- Vitest 45 tests / 20 files ผ่าน
- Contract tests 13 รายการผ่าน รวม queued payout, failed withdrawal, ถอนซ้ำ และถอนระหว่าง pause
- Production Webpack build ผ่าน มี upstream warning ของ `ox/viem` dynamic dependency เช่นเดียวกับรอบก่อน
- Production browser regression Microsoft Edge 6 รายการผ่าน
- Operational component fixture browser checks 4 รายการผ่าน: projection gating, recovery/retry/no resend, chat pagination/image/draft และ payout review/cancel/mobile
- Supabase จริง: query ของ Admin อ่านแชท 600 รายการที่ timestamp เดียวกันครบ ไม่ซ้ำ/ไม่ข้าม; parallel quota ถูกบังคับ 30 ไฟล์; Web3 session อ่าน queued balance ของตนเองได้; trading user ถูกปฏิเสธ staff transaction/chat APIs และ anon ถูกปฏิเสธ payout API
- Security Advisors ไม่พบปัญหา; env:check และ db:check ผ่าน; Cron ล่าสุด active/run succeeded และ HTTP 200

ข้อมูลทดสอบ local ที่สร้างเพิ่มถูกลบตาม ID ที่บันทึกไว้ ไม่ล้างฐานข้อมูล ไม่ได้ส่งคำตัดสินหรือถอนยอดค้างบน Sepolia ในรอบนี้

## ขอบเขตที่ยังต้องตรวจรับต่อ

การทดสอบหน้า Admin บางส่วนใช้ fixture/mocked network และไม่ได้แทนการใช้ MetaMask ทุกบทบาทบนเว็บ Preview การถอนยอดค้างใน Contract ทดสอบบนเครือข่ายทดสอบในเครื่อง ส่วน session จริงรอบนี้มียอดค้าง 0 จึงยังไม่ได้ส่งธุรกรรมถอนยอดค้างจริงบน Sepolia

รายการตรวจรับข้อ 16 เป็นต้นไปยังคงอยู่: session หลายบทบาทครบทุก API, ซื้อขาย/คืนเงิน/จ่ายหลังข้อพิพาทครบเส้นทาง, timeout/concurrency/recovery บน environment รวม และ Vercel Preview/ชุดส่งมอบ ไม่ถือว่าการปิด implementation ข้อ 7–15 เท่ากับส่งมอบระบบทั้งโครงการแล้ว
