# สถานะเตรียมขึ้นระบบและส่งมอบ 24–29

อัปเดต 19 พฤศจิกายน 2026 ต่อจาก [ผลตรวจรับ 16–23](priority-16-23.md) ใช้ branch `codex/integrate-dev2` ก่อนตรวจและรวมเข้า main

| ข้อ | งาน | สถานะล่าสุด |
|---|---|---|
| 24 | Supabase/Vercel ออนไลน์ | Cloud migrations 16 รายการ, 20 ตารางเปิด RLS, Storage 4 buckets, Realtime; Preview build ผ่าน, Web3 Auth ของ 4 บทบาทผ่าน; Cron เรียก alias คงที่ได้ HTTP 200 และ checkpoint เดินหน้าแล้ว ตรึง Node major 22 ให้ตรง CI |
| 25 | ตรวจ Preview กับ MetaMask/Sepolia | API/Sepolia ผ่าน 8 checks; browser render ผ่าน 11 กรณี, client errors 0, ตรวจ JS 29 ไฟล์ไม่พบ server secrets; MetaMask จริงหยุดที่คำเตือน domain Malicious จึงยังไม่ผ่าน gate นี้ |
| 26 | ตรวจและยืนยันซอร์ส Contract | เผยแพร่ Sourcify หลังผู้ใช้อนุมัติ; ทั้ง 16 source files ตรวจผ่าน `exact_match` |
| 27 | ข้อมูลสาธิต | มีเกม 6 เกมและ staff; chain มี RELEASED 2, REFUNDED 1, IN_REVIEW 1, FUNDED 1, DELIVERED 1 จาก API/ธุรกรรมจริง; overdue เตรียมไว้รอ 20/21 พฤศจิกายนตามเวลาจริง |
| 28 | คู่มือผู้ใช้/Admin/Cron/recovery | [คู่มือผู้ใช้และผู้ดูแล](user-admin-guide.md), [คู่มือกู้ระบบ](operations-recovery.md), [หลักฐานออนไลน์และ demo](online-acceptance.md), [ร่างส่งตรวจ MetaMask](metamask-domain-review.md) พร้อมแล้ว |
| 29 | ตรวจรุ่นและรวม main | CI commit `1629ac4` ผ่าน typecheck/unit/Contract/build; unit tests 52 รายการและ TypeScript ผ่าน; เปิด Draft PR #1 ยังไม่ merge เพราะ MetaMask gate ค้าง |

## ปลายทางที่เลือก

- Supabase Cloud: `GameMarketPlaceSmartContract` / `fkhboutupdlaxdhmtkjx` / ap-northeast-2
- Vercel: `nopparatcsis-projects/notbit` / `prj_VCRzLMaFiIjjQ8ro3Dxr1r71yDI9` / Node 22 / icn1
- Environment: Preview; ค่า local ยังแยกใน `.env.local`, online ใน `.env.preview.local` ที่ Git ignore
- URL คงที่: `https://notbit-preview-nopparatcsi.vercel.app` ผู้ใช้เพิ่ม Redirect URLs แล้ว
- Preview ที่ทดสอบรอบแรก: `dpl_6bbbvvgZNW7PNeePEGwit1RXZjpV` / commit `641c587`
- Preview ที่ส่งทดสอบซ้ำ: `dpl_GphXokMkRnvyAPf2fsbvcqMcetgx` / commit `1629ac424d72ab9143e40c50e029178c35163aa0` / READY / target `staging` (Preview environment)
- พบ runtime Node 26 ใน deployment แรกเพราะ `engines.node >=22.13.0` แม้ตั้ง project เป็น 22.x จึงตรึง `>=22.13.0 <23` และทดสอบ alias คงที่ซ้ำบน deployment ใหม่ครบ 8 API checks และ 11 browser cases
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
- Cron `notbit-indexer` ทุกนาที อ่าน URL/bearer/Automation Bypass จาก Vault หลังผู้ใช้อนุมัติ ส่ง header เฉพาะ origin ที่กำหนดตรงกัน ตรวจ HTTP 200 และ checkpoint จริงแล้ว ทดสอบ missing/wrong origin และการปฏิเสธ app roles ผ่านใน transaction ที่ rollback ก่อน dispatch
- Security Advisors มี INFO 9 รายการเรื่อง RLS ไม่มี policy บนตารางที่ให้ server เข้าถึงเท่านั้น ซึ่งเป็น default deny ตามแบบระบบ
- มี WARN 2 รายการเรื่อง authenticated SECURITY DEFINER RPC (`open_listing_conversation`, `get_conversation_wallets`) ตรวจ source แล้วมีการตรวจตัวตน/บทบาท/คู่ค้าและ `search_path=''`; ต้องคงการตรวจสิทธิ์เหล่านี้ ไม่แก้เตือนด้วยการเปิดสิทธิ์กว้าง [คำอธิบาย linter](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)

## คำสั่งตรวจรุ่น

```powershell
npm run release:check
npm run release:verify
npm run release:smoke
npm run typecheck
npm test
npm run contracts:test
npm run build
$env:PREVIEW_ACCEPTANCE='1'; npm run test:preview
```

`release:deploy:prepare` ประเมิน gas เท่านั้น การส่ง deployment ใหม่ต้องระบุ `--send` และตรวจ public transaction ที่บันทึกไว้ก่อน retry สคริปต์มีเพดาน gas 0.01 Sepolia ETH และไม่แก้ local environment

อย่าใส่ secrets ลงในรายงานนี้ การตรวจ Vercel อ่านเฉพาะชื่อ/type/target โดยไม่ decrypt ค่า ผู้ใช้ใส่ Secret 5 รายการเอง; ค่า config สาธารณะเพิ่มแยกสำหรับ Preview

## เงื่อนไขที่ยังไม่ปิด

- MetaMask 13.57.0 แสดง `Malicious—flagged as unsafe` บน URL ของ deployment รอบแรก หยุดก่อนอนุมัติเชื่อมต่อ ไม่มีการปิด security alerts หรือข้ามคำเตือน เตรียม [ร่างส่งตรวจ domain](metamask-domain-review.md) พร้อมหลักฐานไว้แล้ว ยังไม่ส่งให้บุคคลภายนอกและยังไม่ยืนยันว่าเป็น false positive
- ผลธุรกรรมด้วย Node wallet ไม่ใช่หลักฐานว่า MetaMask extension ผ่านทั้งเส้นทาง
- Deployment แรกที่ละ `target` ถูก Vercel จัดเป็น Production โดยอัตโนมัติ และ build เสร็จก่อนยกเลิกได้ ไม่มีการคัดลอก Preview secrets เข้า Production จากนั้นสร้าง target `staging` ซึ่งใช้ Preview environment โดยชัดเจน ไม่ใช้ deployment แรกเป็นรุ่นส่งมอบ
- ต้องลบ deployment แรก `dpl_EpedPSN4iXTaaYNe6FaQEWbi7bkZ` ก่อนเปิด Production จริง เครื่องมือ Vercel ที่เชื่อมอยู่ไม่มีคำสั่งลบ deployment และ CLI ยังไม่ได้ login; ห้ามอ้างว่า cleanup นี้เสร็จแล้ว
- การสร้างลิงก์ share 23 ชั่วโมงถูก automatic approval review ปฏิเสธ จึงไม่ได้เปิดลิงก์นั้น; ใช้ Automation Bypass เฉพาะโปรเจกต์หลังผู้ใช้อนุมัติแทน Token ทดสอบที่เคยปรากฏในผลเครื่องมือถูกยกเลิกและเปลี่ยนใหม่ก่อนใช้งาน

## เกณฑ์ข้อมูลสาธิต

สร้างชื่อประกาศขึ้นต้น DEMO และเก็บ UUID/tx hash สำหรับดีลสำเร็จ, refund, staff release, open dispute, FUNDED และ DELIVERED ผ่าน API และธุรกรรมจริง ไม่ insert สถานะหรือเหตุการณ์เงินปลอมลงฐานข้อมูล

ดีลเกินกำหนดบน Sepolia ต้องเตรียมล่วงหน้า 24/48 ชั่วโมงตามเวลาของ Contract ห้าม backdate projection เพื่ออ้างว่า Contract หมดเวลาแล้ว ผล time travel ใน local และเวลาเกิด overdue จริงบน Sepolia ต้องระบุแยกกัน
