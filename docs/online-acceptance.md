# หลักฐาน Preview และข้อมูลสาธิต

ตรวจวันที่ 19 พฤศจิกายน 2026, เวลา Asia/Bangkok บน `https://notbit-preview-nopparatcsi.vercel.app` ซึ่งเปิด Vercel Deployment Protection อยู่

Deployment `dpl_GphXokMkRnvyAPf2fsbvcqMcetgx`, commit `1629ac424d72ab9143e40c50e029178c35163aa0`, target `staging` ใช้ environment Preview และจำกัด Node major 22 รหัสปลายทางตรงกับ project `nopparatcsis-projects/notbit` และ Supabase `fkhboutupdlaxdhmtkjx`

## ผลที่ผ่านจริง

- [CI](https://github.com/NopparatCSI/NotBit/actions/runs/44490389875): TypeScript, unit 52 tests, Contract 13 tests, production build ผ่าน
- Online API/Sepolia 8 checks ผ่าน: Cloud sign-in USER/ADMIN/SUPER_ADMIN, anonymous/role denial, bearer ของ indexer, refund, staff release, normal delivery/receipt, demo state และข้อเสนอสำหรับทดสอบ Wallet ที่ยังไม่ฝาก
- ตรวจยอดคืนเต็ม 10,000,000,000,000 wei และยอด RELEASED ผู้ขาย 9,500,000,000,000 wei / Treasury 500,000,000,000 wei ผ่านจริง รออย่างน้อย 3 confirmations ทุกธุรกรรม
- Browser render 11 กรณีผ่าน: anonymous 2, buyer 3, seller 2, Admin 3, Super Admin 1; client errors 0; หน้า Admin แสดง open dispute จาก Cloud; buyer/seller เห็น RELEASED ใน Evidence tab
- ตรวจ JavaScript ฝั่ง client 29 ไฟล์ ไม่พบค่าลับ server ของ Preview
- Cron ทุกนาทีเรียก URL คงที่ผ่าน Automation Bypass + application bearer; request 27 ได้ HTTP 200 ไม่มี timeout และตรวจ checkpoint เดินหน้า
- [Sourcify result](https://sourcify.dev/server/v2/contract/11155111/0x560510dc7d96512f6b4f94932ca717e612ba80ac) รายงาน `exact_match` ของ 16 source files ไม่ได้อ้างว่า Etherscan source verification เสร็จแล้ว

Browser checks และธุรกรรมออนไลน์ใช้ Node ลงนาม/สร้าง SIWE sessions จึงไม่ใช่หลักฐานว่า MetaMask extension ผ่าน full flow การทดสอบ MetaMask จริงหยุดที่คำเตือน domain และยกเลิกการเชื่อมต่อแล้ว ดู [ร่างข้อมูลส่งตรวจ](metamask-domain-review.md)

## ดีลบน Contract ใหม่

Contract `0x560510dc7d96512f6b4f94932ca717e612ba80ac`, Sepolia chain `11155111` ราคาต่อดีล 0.00001 Sepolia ETH ประกาศขึ้นต้น DEMO และระบุว่าไม่มีสินค้าจริง ไม่ insert สถานะ/ยอดเงิน/chain events จำลองลง Cloud

| ตัวอย่าง | Order UUID | สถานะ ณ วันตรวจ | ธุรกรรมอ้างอิง |
|---|---|---|---|
| ผู้ซื้อยืนยันรับ | `e092d1d3-d182-4f77-9f6c-2ba564bb5277` | RELEASED | [confirmReceipt](https://sepolia.etherscan.io/tx/0xd59e1fe3d3c8f4c8426c2d182756c73dd0f782fd525566c25218f84a264156e3) |
| Admin คืนเงิน | `7d6ee7e8-f6ad-4ae1-b1b5-d072cfe4d354` | REFUNDED | [resolveDispute](https://sepolia.etherscan.io/tx/0x1a2a7cc89b7142bd430f2fbd6eba101e223fb71c07fdb1d76052b01bbaeaa2ff) |
| Super Admin จ่ายผู้ขาย | `9fa550da-eb2e-4651-86b1-af39dbe55a9b` | RELEASED | [resolveDispute](https://sepolia.etherscan.io/tx/0x399dea092051f3da5b62896cc2544578fdc7c597050cf606cfdafff5cf279e41) |
| ข้อพิพาทเปิด | `d9c38684-e7b1-4fc8-ae24-054ed20e262f` | IN_REVIEW | [openDispute](https://sepolia.etherscan.io/tx/0x847472528c5d67db3671fa3aa4d258f9a81f7c7aead1b81a40bda3dcbf79f5bf) |
| เตรียมหมดเวลาส่ง | `1d6c9a9c-ae47-4ccc-bea5-fa29c59fd4a5` | FUNDED | [fundOrder](https://sepolia.etherscan.io/tx/0x0314f48c9b352106beae8ca0793024e6d170f7a81784a01b8087e04a06402238) |
| เตรียมหมดเวลารับ | `140ad435-8104-45cc-bd0f-f36fd7c97b4d` | DELIVERED | [confirmDelivery](https://sepolia.etherscan.io/tx/0x3243e41a16ec95ec63228abfc6009a441effbe4123f0daf5cf92135b34ea9cd9) |

ยังมีข้อเสนอ `b04fd90e-c26a-45de-b73b-baae8d83d621` สำหรับ MetaMask ซึ่งยังไม่ฝาก จึงไม่ใช่ออเดอร์บน chain ข้อเสนอมีอายุ 30 นาที; สร้างข้อเสนอใหม่หากกลับมาทดสอบหลังหมดอายุ

## Deadline ที่ต้องตรวจต่อ

- ดีล FUNDED: **20 พฤศจิกายน 2026 15:41:12 น.** Asia/Bangkok
- ดีล DELIVERED: **21 พฤศจิกายน 2026 15:42:24 น.** Asia/Bangkok

หลังเวลาข้างต้น Contract จะปิดทางยืนยันตามปกติ Cron ควรส่ง `escalateExpiredOrder` และรอ 3 confirmations ก่อน projection เปลี่ยนเป็น IN_REVIEW เงินยังอยู่ escrow จนผู้ดูแลตัดสิน ห้าม backdate ตารางเพื่อให้ดูว่าเคสนี้ผ่านแล้ว ตอนส่งรายงานนี้ยังไม่ถึง deadline ผลทดสอบ boundary 24/48 ชั่วโมงบน local อยู่ใน [รายงาน 16–23](priority-16-23.md)

## คำสั่งตรวจซ้ำ

```powershell
npm run release:check
npm run release:verify
$env:PREVIEW_ACCEPTANCE='1'; npm run test:preview
npm run release:smoke
```

Harness จะใช้ไฟล์ `.env.preview.local` และบัญชี Sepolia acceptance เดิมที่เก็บเฉพาะ local ไม่ใช้ public Hardhat seed ไม่เติมเงินอัตโนมัติ ไม่เผยแพร่ไฟล์ auth, browser profile หรือ wallet keys ผล 8 checks เป็น snapshot ตอนเตรียม demo; เมื่อ deadline ผ่านหรือผู้ดูแลตัดสินดีลเปิดแล้ว ให้ตรวจเหตุการณ์และสถานะใหม่แทนการคาดหวัง snapshot เดิม

GitHub [Draft PR #1](https://github.com/NopparatCSI/NotBit/pull/1) ยังคง draft ไม่ merge main จนกว่า MetaMask gate และหลักฐาน deadline ที่ต้องใช้ตรวจรับจะครบ
