# สถานะเตรียมขึ้นระบบและส่งมอบ 24–29

อัปเดต 19 พฤศจิกายน 2026 ต่อจาก [ผลตรวจรับ 16–23](priority-16-23.md) ใช้ branch `codex/integrate-dev2` ก่อนตรวจและรวมเข้า main

| ข้อ | งาน | สถานะล่าสุด |
|---|---|---|
| 24 | Supabase/Vercel ออนไลน์ | ติดตั้ง Cloud migrations 15 รายการ, 20 ตารางเปิด RLS, Storage 4 buckets, Realtime และโครง Cron; Web3 Auth ลงชื่อเข้าใช้จริงผ่าน; ตั้ง Vercel Preview secrets/config แล้ว ยังต้องกำหนดปลายทาง Cron หลัง deploy |
| 25 | ตรวจ Preview กับ MetaMask/Sepolia | รอ Preview deployment และผลตรวจจาก URL จริง ไม่ใช้ผลในเครื่องแทน |
| 26 | ตรวจและยืนยันซอร์ส Contract | เตรียม Standard JSON 16 source files; compiler/creation/runtime bytecode ตรง artifact รอ publish และตรวจ exact match |
| 27 | ข้อมูลสาธิต | มีข้อมูลเกม 6 เกมและบทบาท staff บน Cloud; ดีลสาธิตจะสร้างผ่าน API/Contract จริงหลัง Preview พร้อม |
| 28 | คู่มือผู้ใช้/Admin/Cron/recovery | เตรียม [คู่มือผู้ใช้และผู้ดูแล](user-admin-guide.md), [คู่มือกู้ระบบ](operations-recovery.md) และรายงานนี้แล้ว จะเติม URL/commit/ผลตรวจจริงก่อนปิดงาน |
| 29 | ตรวจรุ่นและรวม main | เตรียม CI โดย pin Actions SHA และ Node 22.23.5; unit tests 52 รายการผ่าน, TypeScript ผ่าน ยังไม่ merge จนกว่าจะมีผล Preview |

## ปลายทางที่เลือก

- Supabase Cloud: `GameMarketPlaceSmartContract` / `fkhboutupdlaxdhmtkjx` / ap-northeast-2
- Vercel: `nopparatcsis-projects/notbit` / `prj_VCRzLMaFiIjjQ8ro3Dxr1r71yDI9` / Node 22 / icn1
- Environment: Preview; ค่า local ยังแยกใน `.env.local`, online ใน `.env.preview.local` ที่ Git ignore
- Contract ออนไลน์ใหม่: [`0x560510dc7d96512f6b4f94932ca717e612ba80ac`](https://sepolia.etherscan.io/address/0x560510dc7d96512f6b4f94932ca717e612ba80ac)
- Deployment tx: [`0x834f3728…83d7074`](https://sepolia.etherscan.io/tx/0x834f3728d10c5370cefbe9ad3710e38f9f3710409a4b2b072757d139783d7074), start block `12166090`, chain `11155111`
- Treasury ใหม่: `0x05a1fe9299d99137e1cbd37420d2ab77db6fe9c7`
- Evidence signer ใหม่: `0xbdd5477d5ff1e0d4c23cbd98b6463be5506eb4aa`
- Sender ใหม่: `0x73fa7a05a5694654498d69ce109a9cfb4615390d` เติม 0.001 Sepolia ETH แล้ว
- Admin / Super Admin คงใช้ Wallet เดิมที่ตรงกับ Contract ใหม่และ Cloud staff registrations

Contract เก่ายังอยู่สำหรับประวัติและออเดอร์เดิม ไม่ใช้ key treasury/signer ที่เคยติด log ในระบบออนไลน์ชุดใหม่ Admin/Deployer/Treasury private keys ไม่เป็น environment ของแอป Vercel

## การตรวจฐานข้อมูล Cloud

ติดตั้ง migrations จาก repository ตามลำดับและปรับ migration history ให้ใช้ version ตรงชื่อไฟล์เดิม พร้อม seed เกม ไม่คัดลอก auth sessions หรือข้อมูลส่วนตัวจาก local ไป Cloud

- Public `listing-images`: 10 MB; private `order-evidence`, `upload-staging`: 10 MB; private `chat-images`: 3 MB
- Realtime publication: messages, offers, funding_attempts
- Cron `notbit-indexer` ทุกนาที มี function อ่าน URL/token จาก Vault แต่ยังไม่เรียกปลายทางจนกว่าจะตั้ง Vault
- Security Advisors มี INFO 9 รายการเรื่อง RLS ไม่มี policy บนตารางที่ให้ server เข้าถึงเท่านั้น ซึ่งเป็น default deny ตามแบบระบบ
- มี WARN 2 รายการเรื่อง authenticated SECURITY DEFINER RPC (`open_listing_conversation`, `get_conversation_wallets`) ตรวจ source แล้วมีการตรวจตัวตน/บทบาท/คู่ค้าและ `search_path=''`; ต้องคงการตรวจสิทธิ์เหล่านี้ ไม่แก้เตือนด้วยการเปิดสิทธิ์กว้าง [คำอธิบาย linter](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)

## คำสั่งตรวจรุ่น

```powershell
npm run release:check
npm run release:verify
npm run typecheck
npm test
npm run contracts:test
npm run build
```

`release:deploy:prepare` ประเมิน gas เท่านั้น การส่ง deployment ใหม่ต้องระบุ `--send` และตรวจ public transaction ที่บันทึกไว้ก่อน retry สคริปต์มีเพดาน gas 0.01 Sepolia ETH และไม่แก้ local environment

อย่าใส่ secrets ลงในรายงานนี้ การตรวจ Vercel อ่านเฉพาะชื่อ/type/target โดยไม่ decrypt ค่า ผู้ใช้ใส่ Secret 5 รายการเอง; ค่า config สาธารณะเพิ่มแยกสำหรับ Preview

## เกณฑ์ข้อมูลสาธิต

สร้างชื่อประกาศขึ้นต้น DEMO และเก็บ UUID/tx hash สำหรับดีลสำเร็จ, refund, staff release, open dispute, FUNDED และ DELIVERED ผ่าน API และธุรกรรมจริง ไม่ insert สถานะหรือเหตุการณ์เงินปลอมลงฐานข้อมูล

ดีลเกินกำหนดบน Sepolia ต้องเตรียมล่วงหน้า 24/48 ชั่วโมงตามเวลาของ Contract ห้าม backdate projection เพื่ออ้างว่า Contract หมดเวลาแล้ว ผล time travel ใน local และเวลาเกิด overdue จริงบน Sepolia ต้องระบุแยกกัน
