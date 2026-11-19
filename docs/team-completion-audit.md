# ตรวจงานค้าง Developer 1–3 หลังรวมโค้ด

ตรวจวันที่ 19 พฤศจิกายน 2026 บน branch `codex/integrate-dev2`, commit `3ca5271` ซึ่งรวมฐาน Dev 1, งาน Dev 2 จาก `bitka` และ Dev 3 จาก `bitkub` แล้ว ขณะตรวจ `main` ยังอยู่ที่ `fd3c3b2` และยังไม่รวม Dev 2

อัปเดตหลังผู้ใช้สั่งทำลำดับ 1–6: ดู [ผลดำเนินการและวิธีเปิดใช้งาน](priority-1-6.md) สำหรับ configuration, signer, Cron/sender, image decode และ staged uploads ที่แก้แล้ว ตารางด้านล่างเก็บผล audit ก่อนเริ่มแก้ไว้เป็น baseline

อัปเดตลำดับ 7–15: เพิ่ม projection gating, รูป/แชทย้อนหลัง Admin, durable transaction/audit recovery, ถอนยอดค้าง, atomic evidence quota, auto refresh และ shared checked RPC แล้ว ดู [ผลดำเนินการและข้อจำกัดการตรวจรับ](priority-7-15.md)

อัปเดตลำดับ 16–23: [ผลตรวจรับล่าสุด](priority-16-23.md) ผ่าน acceptance 25 checks, regression 47 tests, Contract 13 tests และทั้ง 3 เส้นทางบน Sepolia เดิม เนื้อหาด้านล่างเป็น baseline ก่อนดำเนินงานเหล่านี้

รายงานนี้แยก **ไม่มีโค้ด**, **มีโค้ดแต่ต้องเชื่อมเพิ่ม**, **ขาดการตั้งค่า**, และ **รอทดสอบจริง** การมีไฟล์หรือ tests ผ่านไม่ได้หมายความว่าผ่านการตรวจรับบน Sepolia ครบแล้ว การแบ่งเจ้าของงานอิงบทบาทใน PlanDev; งานที่กระทบหลายส่วนต้องตรวจร่วมกัน

## 1. ขอบเขตที่ใช้ตรวจ

- `PlanDev.md`: งานส่งมอบรอบสาธิต 5 วัน เป็นขอบเขตขั้นต่ำของรอบนี้
- `FullPlan.md`: แผนเต็ม มีหลายฟีเจอร์ที่ PlanDev ระบุชัดว่าเลื่อนไปรอบถัดไป จึงแยกไว้ในหัวข้อ 7
- `Design.md`: UI อังกฤษ, Dark/Sci-Fi และคำขอปรับ UI ล่าสุด ขัดกับแผนเก่าที่เขียนภาษาไทย จึงถือเป็นความต่างของเอกสารที่ต้องปรับให้ตรง ไม่ถือว่าต้องแปลเว็บกลับโดยอัตโนมัติ
- อ่านโค้ดหน้าเว็บและ API, auth/RLS, schema/migrations, Storage, shared ABI/schema/hash, Contract/tests, ตัวอ่าน events และเอกสารส่งมอบ ไม่ได้ยืนยันการตั้งค่าบนบัญชี Cloud ที่ไม่ได้ตรวจในรอบนี้

## 2. ภาพรวมที่ทำแล้ว

| เจ้าของ | โค้ด/การเชื่อมต่อที่มีแล้ว | หลักฐานหลัก |
|---|---|---|
| Dev 1 | โครง Next.js/TypeScript, แพ็กเกจร่วม, MetaMask + Supabase Web3 Auth, session/role guards และ RLS | `src/components/wallet-account.tsx`, `src/lib/auth/viewer.ts`, `src/proxy.ts`, migrations foundation/identity |
| Dev 1 | Escrow ฝาก/ส่ง/รับ, 95/5, ข้อพิพาท, 24/48 ชั่วโมง, หยุดฝาก, ยอดค้างรับ และบทบาทคงที่ | `contracts/contracts/MarketplaceEscrow.sol`, `EscrowSettlement.sol`, `packages/shared/src/escrow.ts` |
| Dev 2 | ตลาดข้อมูลจริง, รายละเอียดสินค้า, เพิ่ม/แก้ไข/พักประกาศ พร้อมรูป | `src/lib/listings/*`, `src/components/listing-form.tsx`, หน้า `/sell`, `/buy/listings/[id]` |
| Dev 2 | เปิดห้อง ข้อความ/รูปแชท, Realtime, ข้อเสนอ EIP-712, ฝากเงินและติดตาม 3 confirmations | `src/components/trade-room.tsx`, `trade-offers.tsx`, `src/lib/trade/*`, `src/lib/offers/*` |
| Dev 2 | Purchases/Sales orders, pagination รายการของบัญชี, ข้อตกลง snapshot, UI หลักฐาน/ยืนยันส่งรับ/เปิดข้อพิพาท | `src/components/account-orders.tsx`, `order-evidence.tsx`, `src/components/orders-page.tsx` |
| Dev 3 | API หลักฐานส่วนตัว, hash, ใบรับ EIP-712, signed URL และบันทึกการดูของผู้ดูแล | `src/app/api/v1/orders/[id]/evidence/*`, `src/lib/evidence/*` |
| Dev 3 | Admin queue/order/history, decision draft, คำตัดสินผ่าน Wallet, Super Admin pause/resume | `src/components/admin/*`, `src/lib/admin/queries.ts`, Admin API |
| Dev 3 | Indexer events/checkpoint, event ซ้ำ/reorg/replay, projection ของ order/payout/pause, endpoint ที่ตรวจ secret | `src/lib/indexer/*`, `20261117090000_evidence_disputes_indexer.sql` |

ปัญหารวม branch ที่แก้แล้ว: ใช้ `next/script` คืนธีม, migration สร้าง staff view, backfill ออเดอร์เดิม, partial unique index เฉพาะ canonical orders, offer guard ที่ไม่ปิดกั้นหลัง reorg และการลดช่วง RPC ตามข้อจำกัด ไม่ต้องทำรายการเหล่านี้ซ้ำ

## 3. งานค้าง Dev 1 — โครงสร้าง / Contract / ระบบส่งมอบ

| ID | งานค้าง | สถานะและสิ่งที่ต้องทำ | เกณฑ์ปิดงาน |
|---|---|---|---|
| D1-1 | Environment สำหรับทีม/เว็บออนไลน์ | มีคู่มือและ local; ยังไม่มีหลักฐานตรวจรับ Cloud ในรอบนี้ ตั้ง Supabase migrations, Web3 origins/redirects, Storage/Realtime, staff wallets และ Vercel env ให้ตรงกับ chain/contract เดียวกัน | Buyer/Seller/Admin/Super Admin login บน Preview ได้ และสิทธิ์ตรงกับ Contract |
| D1-2 | ยืนยันซอร์ส Contract และลิงก์รุ่นส่งมอบ | Contract ติดตั้งแล้วตาม handoff แต่เอกสารยังบอกว่าการ publish source รออยู่ ตรวจสถานะปัจจุบันและเผยแพร่ถ้ายังไม่ verified | explorer แสดง source/compiler/settings ตรงกับ bytecode ที่ใช้จริง พร้อมลิงก์ใน handoff |
| D1-3 | ปรับทางอัปโหลดให้ใช้บนโฮสต์ตามแผนได้ | ร่วม Dev 2–3: รูปประกาศ/หลักฐานส่ง multipart ผ่าน Next API สูงสุด 10 MB ต่อรูป และหลักฐานสูงสุด 6 รูปต่อคำขอ ซึ่งเกิน Vercel Function request limit | รูปตามขนาดที่ประกาศอัปโหลดได้บน Preview โดยยังตรวจสิทธิ์/เนื้อหา/hash และลงนามหลังตรวจไฟล์สำเร็จ |
| D1-4 | ตรวจรับการเชื่อมระบบครบวงจร | Contract tests ผ่าน แต่ยังไม่มีผลสาธิตทั้งเว็บบน Sepolia ที่ครอบคลุมแผนทั้งหมด | มี transaction hashes/ยอดเงินจริงบน testnet สำหรับซื้อขายสำเร็จ คืนเงิน จ่ายหลังข้อพิพาท หมดเวลา และหยุดฝาก |
| D1-5 | ชุดส่งมอบและเอกสารเวอร์ชันรวม | README/handoff มีแล้ว แต่ผลทดสอบและบางข้อความยังอ้างก่อนรวม branch ต้องรวมคู่มือผู้ใช้/Admin และรายงานรุ่นที่รับมอบ | เอกสารระบุ commit, env, migrations, Contract, วิธีรัน Cron, ข้อจำกัด และผลทดสอบล่าสุดตรงกัน |

Contract หลักตาม PlanDev มีครบ ไม่พบเหตุให้เขียนระบบเงินใหม่ งานถอนค้างรับที่ยังขาดอยู่ที่หน้าจอ/การเชื่อมต่อ ไม่ใช่การขาดฟังก์ชันใน Solidity การตั้ง CI ตรวจ typecheck/tests/build ก่อน merge เป็นข้อเสนอปรับกระบวนการ; ยังไม่พบ `.github/workflows` ใน checkout นี้

## 4. งานค้าง Dev 2 — ตลาด / ผู้ซื้อ / ผู้ขาย

| ID | งานค้าง | สถานะและสิ่งที่ต้องทำ | เกณฑ์ปิดงาน |
|---|---|---|---|
| D2-1 | หน้าถอนเงินค้างรับ | ยังไม่มี UI เรียก `pendingPayouts`/`withdrawPendingPayout` แม้ ABI/Contract และ Super Admin มีข้อมูลยอดค้างแล้ว ร่วม Dev 1/3 | ผู้รับเห็นยอดของตน ถอนด้วย Wallet ของตนได้ รอผลยืนยัน และยอดไม่ถูกถอนซ้ำ; ยังทำได้เมื่อหยุดฝาก |
| D2-2 | แยกเงินฝากยืนยันแล้วออกจากรอระบบบันทึกออเดอร์ | หน้า Deal อ่าน Contract โดยตรงได้ แต่ evidence/dispute ต้องรอ `orders` จาก indexer ขณะนี้จึงอาจเห็นฝากสำเร็จแล้วเจอ 404 เมื่อกดหลักฐาน | แสดงสถานะกำลังซิงก์/ลองใหม่ได้และเปิดขั้นต่อไปหลัง projection พร้อม โดยไม่ชวนฝากซ้ำ |
| D2-3 | ตรวจรับผู้ซื้อ/ผู้ขายด้วย Wallet จริง | มีโค้ด flow แล้ว ต้องทดสอบ image listing, สองบัญชีแชท, เซ็นข้อเสนอ, ฝาก, หลักฐาน, ส่ง/รับ, เปิดข้อพิพาท, reload และสลับบัญชี | ทำจากหน้าเว็บครบทั้งเส้นทางปกติและปฏิเสธ MetaMask/เครือข่ายผิด/RPC ล่ม พร้อมหลักฐานผล |
| D2-4 | การตรวจรูปและทางอัปโหลดที่ใช้ร่วมกัน | รูปประกาศใช้ sharp ตรวจอ่านจริงแล้ว แต่รูปแชทยังใช้ตัวตรวจ magic bytes ของ Dev 3; แก้ร่วม D3-5/D1-3 | รูปเสียถูกปฏิเสธ และอัปโหลดจริงบน Preview ได้ตามขนาดที่ระบุ |
| D2-5 | เชื่อมรูปแชทให้ผู้ดูแลตรวจได้ | UI คู่ค้าเปิดรูปได้แล้ว แต่ API รูปแชทอนุญาตเฉพาะ trade user และ Admin query ไม่ดึง image metadata | เปิดรูปจากหน้า Order review ได้ผ่าน staff endpoint ที่ตรวจสิทธิ์และ audit โดยคนนอกยังเปิดไม่ได้ |

ของที่ไม่มีตาม FullPlan และควรทำในรอบถัดไป: ชื่อ/บัญชีตัวละครในหน้า Profile ที่แก้ได้, โปรไฟล์ผู้ขายในหน้าสินค้า, รีวิว, การแจ้งเตือนแยกหน้า, รายงานยอดขาย/ค่าบริการรวม และตัวกรองราคา/การเรียงแบบเลือกได้ ดูหัวข้อ 7

## 5. งานค้าง Dev 3 — หลักฐาน / Admin / งานเบื้องหลัง

| ID | งานค้าง | สถานะและสิ่งที่ต้องทำ | เกณฑ์ปิดงาน |
|---|---|---|---|
| D3-1 | ตั้ง Evidence Signer | ยืนยันจาก `npm run db:check` ว่า `EVIDENCE_SIGNER_PRIVATE_KEY` ยังไม่มี ต้องใช้ key ที่ตรงกับ signer ของ Contract เดิม | upload → ใบรับที่ตรวจได้ → confirmDelivery/confirmReceipt สำเร็จบน Contract จริง; ผิด key ต้องไม่แสดงสำเร็จ |
| D3-2 | ติดตั้ง scheduler และผู้ส่ง escalation | มี Next endpoint แต่ไม่พบ schedule/Edge Function ใน repository และ sender key ยังไม่มี ต้องเลือกวิธีเรียกทุกนาทีและจัด gas | ซื้อขายโดยไม่เรียก endpoint เองแล้ว DB ตามเชนได้; ออเดอร์หมดเวลาเข้า IN_REVIEW โดยเงินยังพัก |
| D3-3 | กู้ประวัติธุรกรรมผู้ดูแล | `recordActivity()` กลืน error ทั้งหมด; hash/สถานะ tx อยู่ใน React state เมื่อ refresh อาจหาย และ indexer ไม่เติม audit ที่ตกหล่น | เก็บ submission แบบทนการ reload, retry/reconcile จาก tx/event, แยก pending/confirmed/failed/unknown โดยไม่ส่ง tx ซ้ำเพราะบันทึก audit ไม่สำเร็จ |
| D3-4 | เชื่อมแชทรูป/ประวัติให้ครบสำหรับคำตัดสิน | Admin query อ่านเฉพาะข้อความ 500 รายการแรก ไม่มีรูปและไม่มี pagination | ผู้ดูแลอ่านแชทที่เกี่ยวข้องได้ครบ รวมข้อความหลังรายการที่ 500 และรูป โดย audit การเข้าถึง |
| D3-5 | ตรวจไฟล์หลักฐาน/รูปแชทให้อ่านเป็นรูปได้จริง | ตรวจเฉพาะ signature ของไฟล์; probe ยืนยัน PNG 9 bytes ที่เสียผ่าน validator ได้ ปัจจุบันจึงอาจลงนามใบรับให้ภาพที่เปิดไม่ได้ | ใช้ตัวตรวจ decode รูปจริง จำกัดขนาด/มิติที่เหมาะสม รักษา hash ของ bytes ที่เก็บ และมี tests ของไฟล์เสีย/ปลอมชนิด |
| D3-6 | บังคับ upload quota เมื่อคำขอเข้าพร้อมกัน | มี count ก่อน insert แต่ไม่มีการจอง quota ใน transaction สองคำขอพร้อมกันอาจผ่านทั้งคู่ | quota ต่อผู้ใช้ถูกบังคับแบบ atomic; มี integration test ของ parallel requests |
| D3-7 | ตรวจรับ recovery และข้อผิดพลาดจริง | มี tests แกน projection/reorg แล้ว แต่ยังไม่มี API/session/Storage integration tests ครบทุกบทบาทและกรณีผิดพลาด | ผ่าน outsider access, URL หมดอายุ, concurrent decisions, file limit, RPC 429/timeout/restart และการอ่านต่อจาก checkpoint |
| D3-8 | ซิงก์สถานะ Admin หลังธุรกรรม/เตรียมสาธิต | UI refresh หลัง tx หนึ่งครั้งอาจเกิดก่อน indexer ตามทัน คิวไม่มี auto refresh; ข้อมูล local ปัจจุบันคิวว่าง | แสดงรอ projection และ refresh จนพบ confirmed result; มีชุดสาธิต dispute/refund/release/overdue และคู่มือ Admin/Cron recovery |

การเปิดไฟล์หลักฐานแบบส่วนตัว การบันทึก staff access ก่อน signed URL และปุ่มหยุดฝากมีโค้ดแล้ว ไม่ใช่งานที่ขาดทั้งหมด ส่วนระบบขอหลักฐานเพิ่มแบบเป็นงานให้คู่ค้าตอบยังไม่มี; การแนบ dispute evidence ของคู่ค้าทำได้แล้ว ถ้าต้องการปิดข้อกำหนดนี้ใน FullPlan ต้องเพิ่ม request/response workflow

## 6. จุดเชื่อมที่ต้องปิดร่วมกัน

| ลำดับ | จุดเชื่อม | เจ้าของร่วม | สถานะ/งานต่อ |
|---|---|---|---|
| I1 | Session → Wallet → role → API/RLS → Contract | Dev 1 + ทุกคน | มี guard แล้ว; ตรวจบน env สำหรับทีมจริง รวม staff wallets กับ role บนเชน |
| I2 | Signed offer → fundOrder → confirmed event → orders/listing projection | Dev 1 + 2 + 3 | มีแล้ว; เปิด scheduler และจัด UX ช่วงเงินเข้าก่อน projection พร้อม |
| I3 | เลือกรูป → Storage → hash → signed receipt → confirmDelivery/Receipt | Dev 2 + 3, Dev 1 ตรวจ ABI/hosting | มีโค้ดแล้ว; ขาด signer และต้องแก้ file decode/วิธีอัปโหลดบน Vercel |
| I4 | เหตุผล/รูปข้อพิพาท → openDispute → Admin queue → decision → buyer/seller | Dev 2 + 3 | มี API/หน้า/tx แล้ว; เพิ่มรูปแชท Admin และการตามผล projection, ทดสอบคืน/จ่ายจริง |
| I5 | PayoutQueued → ยอดผู้รับ → withdrawPendingPayout → PayoutWithdrawn | Dev 1 + 2 + 3 | Contract/ABI/indexer มี; ขาดหน้าผู้รับและคำสั่งถอนจาก Wallet |
| I6 | Staff tx → audit → event → recovery หลัง refresh/RPC failure | Dev 3 + Dev 1 ตรวจ | ยังไม่ครบ โดยเฉพาะ audit ที่บันทึกไม่ได้และการรอผลหลัง refresh |
| I7 | 24/48 ชั่วโมง → scheduler sender → IN_REVIEW → คิวตรวจ | Dev 1 + 3, Dev 2 แสดงผล | Contract บังคับเวลาแล้ว; ต้องตั้ง scheduler/key/gas และทดสอบความขัดข้อง |
| I8 | Local configuration → Cloud migrations/auth/storage → Preview | Dev 1 + ทุกคน | ยังต้องตรวจรับ Cloud และไฟล์ใหญ่บนบริการจริงก่อนเรียกว่าระบบออนไลน์พร้อมสาธิต |

ข้อควรปรับร่วม: Dev 2 มี configuration/RPC client แยกจาก Dev 3 (`src/lib/offers/server.ts` เทียบ `src/lib/chain/config.ts`) และ frontend ใช้ Wallet config สองชุด ควรรวมมาตรฐานหรือเพิ่ม tests ยืนยันว่า `chainId`, address และ RPC ของทุกเส้นทางตรงกัน โดยเฉพาะเมื่อใช้ `ESCROW_ADDRESS`/`ESCROW_RPC_URL` override ทั้งนี้ไม่ได้พบว่า environment ปัจจุบันชี้ผิดจากประเด็นนี้

### ข้อจำกัดโฮสต์ที่ยืนยันจากเอกสารบริการ

Vercel Functions จำกัด request body ที่ 4.5 MB; การรับไฟล์ 10 MB หรือหลายไฟล์ผ่าน Next Route Handler ปัจจุบันจึงใช้กับโฮสต์นี้ไม่ได้ตามขนาดที่ UI รับปาก อาจอัปโหลดตรงไป private Storage ด้วยสิทธิ์จำกัด แล้วให้บริการฝั่งเซิร์ฟเวอร์ดาวน์โหลดตรวจ bytes/ขนาด/ownership/hash ก่อนบันทึกและเซ็น หรือเลือก upload backend ที่รองรับขนาดนั้น ห้ามข้ามการตรวจไฟล์เพียงเพื่อหลบ limit [Vercel Functions — Request body size](https://vercel.com/docs/functions/limitations#request-body-size)

## 7. งานตาม FullPlan ที่ยังไม่มี แต่ถูกเลื่อนจากรอบ 5 วัน

| งาน | ส่วนที่ยังไม่มี | เจ้าของที่ควรรับในรอบถัดไป |
|---|---|---|
| จัดการ Admin/Super Admin | membership/request/history, แต่งตั้ง/ยอมรับ/เปลี่ยน/ถอด, ป้องกันถอด Super Admin คนสุดท้าย | Dev 1 ทำ Contract/ข้อมูล/สิทธิ์; Dev 3 ทำ UI/API/audit |
| จัดการผู้ใช้/ระงับ/คืนสถานะ/ปิดบัญชี | หน้า/API/สถานะ/เหตุผล; บังคับห้ามดีลใหม่แต่รักษาสิทธิ์ออเดอร์เดิม | Dev 3 ร่วม Dev 1 และ Dev 2 |
| รายงาน/ระงับประกาศ | ระบบรับรายงานและ moderation ที่มีเหตุผล/ประวัติ | Dev 2 + Dev 3, Dev 1 ตรวจ schema/สิทธิ์ |
| Profile/รีวิว | profile editor, game character profile, ข้อมูลผู้ขาย, reviews และหนึ่งรีวิวต่อดีลสำเร็จ | Dev 2 + Dev 1 ตรวจ RLS |
| Notifications | ตาราง/บริการ/หน้าสำหรับข้อความใหม่ เงินฝาก กำหนดเวลา และคำตัดสิน | Dev 2 + Dev 3 |
| รายงานยอดขาย/ค่าบริการรวม | dashboard/aggregate แยกจากส่วนแบ่งต่อออเดอร์ที่มีแล้ว | Dev 2 ร่วม Dev 3 |
| ค้นหา/กรองขั้นสูง | ราคา/ตัวเลือกเรียง, server pagination สำหรับตลาดขนาดใหญ่ | Dev 2; ปัจจุบันมีค้นหาชื่อ/เกม/ประเภทและเรียงล่าสุดแบบตายตัว |

Contract ปัจจุบันกำหนด `admin`/`superAdmin` แบบ immutable และไม่รองรับ upgrade การทำ role management ตาม FullPlan ต้องออกแบบ Contract รุ่นใหม่และแผนดูแลออเดอร์/เงินใน Contract เดิม ไม่สามารถทำให้สมบูรณ์ด้วยการเพิ่มหน้า Super Admin อย่างเดียว งานนี้ไม่ใช่บั๊กของขอบเขต PlanDev ที่ระบุบทบาทคงที่ไว้แล้ว

ระบบ inventory เกมจริง เงินจริง NFT ตะกร้าหลายร้าน คืนบางส่วน และเหรียญแพลตฟอร์มอยู่ขอบเขตที่ยังไม่รวม จึงไม่ควรนับเป็นงานตกหล่นของผู้พัฒนารอบนี้

## 8. ลำดับปิดงานที่แนะนำ

1. **P0 — ตั้ง signer ให้ถูกต้อง (D3-1)** เพื่อปลดบล็อกการยืนยันส่ง/รับ และยืนยัน configuration/บทบาทของทุกคน (D1-1/I1)
2. **P0 — เปิดงานอ่าน events และ escalation (D3-2/I2/I7)** ตรวจ checkpoint และ gas; ไม่ถือว่าการเรียก endpoint ด้วยมือแทน scheduler ที่ส่งมอบ
3. **P1 — แก้ uploads สำหรับโฮสต์จริงและตรวจรูปจริง (D1-3/D2-4/D3-5)** ให้ผ่านขนาดที่ระบุโดยรักษาสิทธิ์และ hash
4. **P1 — เชื่อมภาพ/แชทครบใน Admin และ audit recovery (D2-5/D3-3/D3-4)** เพื่อมีข้อมูลและประวัติเพียงพอตอนตัดสิน
5. **P1 — เติมหน้าถอนค้างรับและ UX รอซิงก์ (D2-1/D2-2/D3-8)** ครบวงจรจาก Contract ถึงผู้รับ Sepolia ETH
6. **P1 — ตรวจ API/Storage/session และ failure/concurrency/recovery (D2-3/D3-6/D3-7)** โดยไม่อาศัย fixture แทน auth จริง
7. **P1 — สาธิต Sepolia ทุกเส้นทางและยืนยันซอร์ส (D1-2/D1-4)** เก็บ tx hash และยอด buyer/seller/treasury; ทดสอบเวลาใน local แยกจากเวลาจริงบน Sepolia
8. **ส่งมอบ — อัปเดตคู่มือ/ผลทดสอบ/ข้อมูลสาธิต (D1-5/D3-8)** และตรวจ branch รวมก่อน promote เข้า main
9. เปิดงานรอบถัดไปของ FullPlan แยกจาก acceptance ของรอบนี้

## 9. หลักฐานการตรวจและข้อจำกัด

รันซ้ำในรอบ audit นี้:

- `npm run typecheck`: ผ่าน
- `npm test`: ผ่าน 20 tests / 8 files
- `npm run contracts:test`: ผ่าน 13 tests
- `npm run db:check`: ตาราง/view/private bucket ผ่าน; review/overdue/resolved local เป็น 0 รายการ; signer และ escalation sender key ยังไม่มี; start block และ endpoint secret ตั้งแล้ว
- probe validator ด้วย PNG ที่มีเฉพาะ magic bytes 9 bytes: `checkEvidenceFile()` คืน `ok: true` แต่ sharp อ่านรูปไม่ได้ ยืนยันปัญหา D3-5 โดยไม่อัปโหลดหรือแก้ข้อมูลจริง

หลักฐานจากรอบรวม code ก่อนหน้านี้บน source commit เดียวกัน: production build ผ่าน และ Playwright Microsoft Edge ผ่าน 6 tests ตาม `docs/dev2-integration.md` ชุด E2E นี้ทดสอบ storefront/demo/navigation/theme โดยปิด Supabase ไม่ใช่การซื้อขายด้วย MetaMask หรือการตรวจ auth หลายบทบาท

ยังไม่ได้ส่งธุรกรรม Sepolia หรือทดสอบลงชื่อเข้าใช้ Wallet จริงใน audit รอบนี้ ไม่ได้ตรวจว่า Cloud มี scheduler/deployment/source verification ที่ติดตั้งด้วยมืออยู่แล้วหรือไม่ จึงใช้สถานะ “ต้องยืนยัน/ยังไม่มีหลักฐาน” แทนการกล่าวว่าไม่มีแน่นอน รายงานนี้เพิ่มเอกสารตรวจงาน ไม่ได้แก้ implementation หรือรับรองว่าปิดงานทั้งสามคนแล้ว
