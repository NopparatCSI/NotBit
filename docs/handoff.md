# ข้อตกลงร่วมสำหรับ Developer 1–3

## บัญชีและ API

- ใช้ API namespace `/api/v1` และ response ตาม `ApiResult<T>`. สำเร็จคืน `{ data }` และข้อผิดพลาดคืน `{ error: { code, message } }`.
- `GET /api/v1/me` คืน `{ id, wallet, role }` ของ session ปัจจุบัน Wallet เป็นตัวพิมพ์เล็ก รหัสผู้ใช้ตรงกับ `auth.users.id`. Client ส่ง Wallet หรือ role มาเพื่อยืนยันตัวตนเองไม่ได้
- ใช้ `requireTradeUser()` สำหรับการซื้อขาย `requireStaff()` สำหรับการตรวจข้อพิพาท และ `requireSuperAdmin()` สำหรับการหยุดหรือเปิดรับเงินฝาก อ่านสิทธิ์ใหม่ทุกคำขอ
- เมื่อใช้งาน Sepolia ให้ตรวจสิทธิ์บนเชนด้วยการจำลองธุรกรรมและอาศัยการบังคับสิทธิ์ใน Contract. หน้าเว็บแสดงผลสำเร็จหลังระบบยืนยันธุรกรรมแล้ว
- Admin และ Super Admin กำหนดตอนติดตั้ง แผน 5 วันนี้ไม่มี API เปลี่ยนบทบาท

## Developer 2

| เส้นทางที่เสนอ | ข้อมูลที่ใช้ |
| --- | --- |
| `GET /api/v1/listings`, `GET /api/v1/listings/:id` | UUID ของประกาศ, slug เกม, `priceWei` แบบ string และสถานะประกาศ |
| `POST /api/v1/listings`, `PATCH /api/v1/listings/:id` | ตรวจผู้ขายด้วย session และ ownership ก่อนเขียน |
| `POST /api/v1/conversations`, `GET /api/v1/conversations/:id/messages`, `POST /api/v1/conversations/:id/messages` | เปิดห้องด้วย `listingId` จากนั้นใช้ `conversationId`. API ข้อความผู้ใช้เขียนได้เฉพาะชนิด `USER` |
| `POST /api/v1/conversations/:id/offers` | ใช้ snapshot ตาม `agreementSchema`, signed offer ตาม `signedOfferSchema` และ domain ตาม chain กับ Contract |
| `GET /api/v1/orders/:id` | UUID เดียวกับข้อเสนอ พร้อม `chainOrderId`, `amountWei`, สถานะจากเชน และกำหนดเวลา |

Migration เปิดการอ่านผ่าน RLS แล้ว สำหรับการเขียนผ่าน client ให้เพิ่ม grants ระดับคอลัมน์และ RLS ของแต่ละฟีเจอร์ใน migration ถัดไป สำหรับเส้นทาง API ที่ใช้สิทธิ์เซิร์ฟเวอร์ ให้ตรวจ session และ ownership ก่อนเขียนทุกครั้ง

## Developer 3

| เส้นทางที่เสนอ | ข้อมูลที่ใช้ |
| --- | --- |
| `POST /api/v1/orders/:id/evidence` | รับ multipart รูป JPEG, PNG หรือ WebP สูงสุด 10 MB ต่อรูป หลังบันทึกรูปแล้วคืน `EvidenceReceipt` ตาม schema สำหรับขั้นส่งหรือรับ |
| `GET /api/v1/orders/:id/evidence/:evidenceId` | ตรวจคู่ค้าหรือสิทธิ์ผู้ดูแล บันทึกการเข้าถึงของผู้ดูแลก่อนออก signed URL |
| `POST /api/v1/orders/:id/dispute` | รับเหตุผลจาก session คู่ค้า สถานะออเดอร์เปลี่ยนหลังเหตุการณ์บนเชนได้รับการยืนยัน |
| `POST /api/v1/admin/orders/:id/decision` | ใช้ `decisionSchema` และ `hashDecision` เพื่อเตรียมข้อมูลก่อนให้ผู้ดูแลส่งธุรกรรม |

`listing-images` เป็น bucket สาธารณะ ส่วน `order-evidence` เป็น bucket ส่วนตัว API เขียนหลักฐานโดยใช้ path ใหม่ทุกครั้งและเก็บ hash ของไฟล์ ผู้ดูแลเข้าคิวออเดอร์ได้ ฝั่ง API ตรวจบริบทออเดอร์ก่อนดึงแชทหรือออกลิงก์หลักฐาน

Indexer ใช้ `chain_events` และ `chain_checkpoints` แยกตาม chain และ Contract. ใช้ `tx_hash` กับ `log_index` กันการอ่านซ้ำ เมื่อ block hash เปลี่ยนให้ย้อนถึงบล็อกร่วมแล้วสร้างสถานะที่กระทบใหม่ ทำให้การแก้ projection กับ checkpoint อยู่ใน transaction เดียวกัน

## Contract และข้อมูลจำลอง

- `contracts/contracts/IEscrow.sol` และ `escrowAbi` เป็น interface ร่วม ติดตั้ง `MarketplaceEscrow` บน Hardhat ด้วย `npm run contracts:node` และ `npm run contracts:deploy:local` ในสองเทอร์มินัล ใช้ `npm run contracts:deploy:sepolia` เมื่อค่าติดตั้ง Sepolia พร้อม
- Developer 2 ใช้ chain ID `31337` และที่อยู่ `escrowAddress` จากผลติดตั้งสำหรับการทดสอบธุรกรรมในเครื่อง การลงชื่อเข้าใช้ MetaMask กับ Supabase ยังใช้ Sepolia ตามเดิม
- Developer 3 ใช้ Wallet `evidenceSigner` จากผลติดตั้งเพื่อลงนามใบรับทดสอบด้วย `evidenceReceiptTypes` และ `escrowDomain(31337, escrowAddress)`. ใช้ค่า `stage` 0 สำหรับหลักฐานส่งและ 1 สำหรับหลักฐานรับ
- ใช้ `toChainId(uuid)` สร้าง `bytes32` ของประกาศและออเดอร์จาก UUID ต้นฉบับ สร้าง UUID ข้อเสนอก่อนเซ็นและใช้ UUID นั้นเป็นรหัสออเดอร์เมื่อฝากสำเร็จ
- `hashAgreement` ใช้การเข้ารหัส ABI ตามลำดับฟิลด์ใน shared package. Hash ไฟล์ใช้ Keccak-256 จากไบต์ต้นฉบับ ส่วน `hashEvidence` เข้ารหัสชุด file hash ตามลำดับที่บันทึก การตัดสินใช้ `hashDecision`.
- เวลาบนเชนเป็น Unix seconds ส่วนฐานข้อมูลเป็น `timestamptz`. เงินใน API เป็นข้อความทศนิยมจำนวนเต็มหน่วย wei แปลงเป็น `bigint` เมื่อเรียก Contract.
- ข้อเสนอหมดอายุภายใน 30 นาที ออเดอร์ `FUNDED → DELIVERED → RELEASED` มีเวลา 24 และ 48 ชั่วโมงตามลำดับ Contract ปฏิเสธขั้นตอนปกติตั้งแต่บล็อกที่มี timestamp เท่ากับเส้นตาย เมื่อเกิดข้อพิพาทหรือยกระดับออเดอร์หมดเวลาให้เข้าสู่ `IN_REVIEW`. Admin เป็นผู้ตัดสิน `REFUNDED` หรือ `RELEASED`.
- คู่ค้าใช้ `openDispute` เพื่อเข้าสู่ `IN_REVIEW`. งานเบื้องหลังเรียก `escalateExpiredOrder` ได้ตั้งแต่ถึงเส้นตายโดยใช้บัญชีส่งธุรกรรมทั่วไป ทั้งสองทางส่ง `OrderInReview` และแยกกรณีหมดเวลาด้วย `expired`.
- Admin และ Super Admin ใช้ `resolveDispute(orderId, refundBuyer, decisionHash)` กับออเดอร์ `IN_REVIEW`. เหตุการณ์ `DisputeResolved` บันทึกผู้ตัดสินและ hash ส่วน `OrderRefunded` หรือ `OrderReleased` ใช้อัปเดตผลทางการเงินของออเดอร์
- อ่านยอดค้างจาก `pendingPayouts(wallet)`. การถอนใช้ `withdrawPendingPayout()` จาก Wallet เจ้าของยอด สิทธิ์ `setFundingPaused` เป็นของ Super Admin และครอบคลุมเฉพาะเงินฝากใหม่
- แยกสถานะธุรกรรมจากสถานะออเดอร์ รออย่างน้อย 3 confirmations ก่อนแสดงว่าเงินฝากสำเร็จ หักค่าบริการ 500 basis points ปัดเศษลงในหน่วย wei.
- `demoGames`, `demoViewers`, `demoOrder` และ `createMockEscrowReader()` ใช้ทำหน้าจอและทดสอบแบบไม่มี RPC. บัญชีใน fixture ใช้เป็นข้อมูลทดสอบ ไม่มีสิทธิ์เข้าสู่ระบบ

## Escrow ที่ติดตั้งบน Sepolia

| ค่า | รายละเอียด |
| --- | --- |
| Chain ID | `11155111` |
| `NEXT_PUBLIC_ESCROW_ADDRESS` | [`0x3D32396Cd1017DeD8cCE5150b88Ee6fEb3ca6eBe`](https://sepolia.etherscan.io/address/0x3D32396Cd1017DeD8cCE5150b88Ee6fEb3ca6eBe) |
| บล็อกเริ่มอ่านเหตุการณ์ | `12146825` |
| ธุรกรรมติดตั้ง | [`0x975a81a2…8805395`](https://sepolia.etherscan.io/tx/0x975a81a218bf2ff4b0055346230603c48cc9f32a6130d112bbe48c5278805395) |

ใช้ ABI จาก `@marketplace/shared` และใส่ chain ID กับที่อยู่ Contract นี้ใน EIP-712 domain ของข้อเสนอและใบรับหลักฐาน

## ผลตรวจวันที่ 4

| ส่วนที่ตรวจ | ผล |
| --- | --- |
| Hardhat | ผ่าน 13 รายการ ครอบคลุมการจ่ายและคืนเงิน ลายเซ็นผิดบริบท การฝากพร้อมกัน คำตัดสินซ้ำ และการเรียกถอนอีกครั้งจาก callback ระหว่างรับเงิน |
| Escrow บน Sepolia | ข้อมูลธุรกรรมติดตั้งตรงกับ bytecode และพารามิเตอร์จากโปรเจกต์ ตรวจ EIP-712 domain และจำลองคำสั่งตามสิทธิ์ผู้ดูแลผ่าน RPC |
| เว็บและ API | Production build, TypeScript, Vitest และ Playwright ผ่าน ทดสอบเข้าสู่ระบบ รีโหลดบนจอมือถือ และออกจากระบบผ่าน Supabase ในเครื่องด้วย Wallet ทดสอบ |
| การตั้งค่า Supabase | ลงทะเบียน Admin และ Super Admin ใน Supabase ในเครื่องตามที่อยู่บนเชน ยืนยันว่า bucket หลักฐานเป็นแบบส่วนตัวและผู้ใช้ทั่วไปแก้บทบาทไม่ได้ |

จุดตรวจรับร่วมที่ยังต้องยืนยันคือซื้อขายและคืนเงินจากหน้าเว็บบน Sepolia ทดสอบได้เมื่อรวมเส้นทางออเดอร์ อัปโหลดและเซ็นหลักฐาน หน้าผู้ดูแล และตัวอ่านเหตุการณ์หรือ Cron แล้ว ให้ตั้ง `EVIDENCE_SIGNER_PRIVATE_KEY` ใน backend ให้ตรงกับ `SEPOLIA_EVIDENCE_SIGNER_ADDRESS` ของ Contract ก่อนทดสอบใบรับหลักฐาน

## สถานะส่งมอบวันที่ 5

- ตรวจรุ่นจาก workspace นี้แล้ว Hardhat ผ่าน 13 รายการ, Vitest ผ่าน 5 รายการ, Playwright บนจอมือถือผ่าน 1 รายการ พร้อม TypeScript และ production build ด้วยค่าของโปรเจกต์
- เตรียมยืนยันซอร์สของ Escrow บน Sepolia ด้วย Solidity Standard JSON และ `0.8.38+commit.1835d247` ตั้ง EVM เป็น Prague และ optimizer 200 runs คอมไพล์แล้วได้ creation bytecode และ runtime bytecode ตรงกับ artifact การเผยแพร่ซอร์สไป Sourcify ยังรอการอนุมัติสำหรับปลายทางนี้
- การส่งลิงก์สาธิตทั้งระบบรอรวมงาน Developer 2 และ 3 ตั้ง Supabase สำหรับเว็บออนไลน์ และทดสอบธุรกรรมซื้อขายกับคืนเงินจากหน้าเว็บบน Sepolia ดู [คู่มือติดตั้งและเตรียมเผยแพร่](../README.md)
