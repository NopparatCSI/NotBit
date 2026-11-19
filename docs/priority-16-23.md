# ผลตรวจรับลำดับ 16–23

ทดสอบวันที่ 19 พฤศจิกายน 2026 บน branch `codex/integrate-dev2` ต่อจากงาน [1–6](priority-1-6.md) และ [7–15](priority-7-15.md)

## ผลตามลำดับ

| ข้อ | สิ่งที่ตรวจจริง | ผล |
|---|---|---|
| 16 | Web3 session ของ Buyer, Seller, Admin, Super Admin และ outsider; anonymous/ownership/staff API; private Storage; ปลอม metadata/ข้อความระบบ/เรียก service RPC | ผ่าน 4 checks |
| 17 | หน้าเว็บสร้างประกาศ → แชท → ลงนามข้อเสนอ → ฝาก → อัปโหลดภาพ → ยืนยันส่ง/รับ → ผู้ใช้เห็น RELEASED; ตรวจยอด 95/5 โดยหัก gas ออกจากการเปรียบเทียบ; ทดสอบ API/Storage/signer/indexer แยกอีกครั้ง | ผ่าน 2 checks |
| 18 | Admin คืนเต็มจำนวน, Super Admin จ่าย 95/5, เหตุผล/decision hash ตรง, คู่ค้าเห็นผลและข้อความระบบ, ปฏิเสธการตัดสินซ้ำ | ผ่าน 2 checks |
| 19 | Contract เดิมทุกบรรทัดบน local chain: ก่อน deadline 1 วินาทียัง escalate ไม่ได้; ถึง 24/48 ชั่วโมงได้ IN_REVIEW; เงินยังอยู่ escrow | ผ่าน 2 checks |
| 20 | จำลองผู้รับปฏิเสธ ETH จนเกิดยอดค้างรับจริง, API อ่านยอด, ถอนสำเร็จครั้งเดียว, pause ขวางเฉพาะเงินฝากใหม่ แต่ออเดอร์เดิมและการถอนยังทำงาน | ผ่าน 1 check |
| 21 | ปฏิเสธลายเซ็น/ธุรกรรม, account ผิด, ปฏิเสธสลับ network, gas ไม่พอ, browser RPC ล้มเหลว, reload ระหว่าง pending จริงแล้วไม่ฝากซ้ำ | ผ่าน 6 checks |
| 22 | ภาพเสีย, ขนาดเกิน, ticket ผิดผู้ใช้/ผิด purpose/หมดอายุ, signed URL ใช้งานจริงแล้วหมดอายุ 60 วินาที, quota ขนาน 30 รายการ, funding/decision แข่งกันใน block เดียว | ผ่าน 4 checks |
| 23 | HTTP 429/timeout จาก RPC proxy, checkpoint ไม่ข้าม, retry/duplicate indexer, restart process ของแอปจริง, สร้าง audit ที่ browser ไม่เคย POST, alternate fork/reorg แล้ว replay โดยไม่ซ้ำ | ผ่าน 4 checks |

รันรวมตามลำดับผ่าน **25 checks / 9 files** (`vitest.acceptance.config.ts` บังคับเรียงไฟล์และหยุดเมื่อพบความล้มเหลว) หลังเพิ่ม assertion ให้หน้าเว็บต้องแสดง RELEASED จริง ได้รัน browser case นั้นซ้ำและผ่านด้วย

## สิ่งที่แก้เพิ่มจากผลทดสอบ

พบว่าระบบซื้อขายทำงานแล้วแต่ยังไม่สร้างข้อความสถานะจากระบบในแชท จึงเพิ่ม migration `20261119091000_confirmed_trade_messages.sql` และ reconciliation หลัง indexer สำเร็จ:

- สร้างข้อความจาก canonical events ที่ยืนยันแล้วสำหรับการฝาก ส่งสินค้า เข้า review จ่ายเงิน และคืนเงิน
- อ้างอิง event ด้วย unique key ป้องกันข้อความซ้ำเมื่อ retry/restart
- Foreign key ลบเฉพาะข้อความสถานะที่ event ถูก reorg ออก โดยเก็บแชทของผู้ใช้ไว้
- ฟังก์ชันเขียนข้อความให้ `service_role` เท่านั้น; ผู้ใช้ปลอม source ของข้อความที่ยืนยันแล้วไม่ได้
- เพิ่ม regression tests ทั้งการ replay/reorg และสิทธิ์เรียกฟังก์ชัน

ติดตั้ง migration และบันทึก migration history แล้วทั้งฐานข้อมูลหลักในเครื่องและฐานทดสอบแยก เครื่องของทีมที่ยังไม่ได้ติดตั้งต้องรัน pending migrations ก่อนใช้โค้ดใหม่นี้

## หลักฐานบน Contract Sepolia เดิม

Contract: `0x3D32396Cd1017DeD8cCE5150b88Ee6fEb3ca6eBe` · chain `11155111` · รออย่างน้อย 3 confirmations ทุกธุรกรรม

ใช้ Wallet ผู้ซื้อ/ผู้ขายที่สร้างเฉพาะรอบทดสอบ และ Wallet Admin/Super Admin เดิมที่ตรวจตรงกับ Contract แล้ว ไม่ใช้ public Hardhat seed บน Sepolia ยอดต่อดีล **0.00001 Sepolia ETH**

| เส้นทาง | ออเดอร์ | ธุรกรรมผลสำเร็จ |
|---|---|---|
| ยืนยันรับสินค้า → RELEASED | `03337574-9bfd-47f0-bac6-a11ff2e1a6f2` | [confirmReceipt](https://sepolia.etherscan.io/tx/0xb9a9e1ce27d42179df3771301d615b1000c879b1cd196f86048ae850462fb97c) |
| Admin คืนเงิน → REFUNDED | `8d813f3a-9474-4d2f-a31e-096426aa9916` | [resolveDispute: refund](https://sepolia.etherscan.io/tx/0xd09a311c752277b247882d1b72c1239cb3c58a698e866c342a0db1a08f72c3cb) |
| Super Admin จ่ายเงิน → RELEASED | `e9e7047a-e66b-4273-af60-008c11e3f581` | [resolveDispute: release](https://sepolia.etherscan.io/tx/0xdc918e6681eec2f466607a1264ca4e3fcaa8de964c27fc3c78f543da499569ec) |

ตรวจยอดจริง: ผู้ขายได้รับ **9,500,000,000,000 wei**, treasury ได้ **500,000,000,000 wei** ต่อดีล RELEASED; ดีล REFUNDED คืนผู้ซื้อ **10,000,000,000,000 wei** และไม่มีค่าบริการ การอัปโหลดและ signed evidence receipts ใช้ API/Storage/signer ของแอปจริง

เก็บข้อมูลสาธิตและประวัติไว้ในฐานข้อมูลหลัก ไม่ลบ events/audit ของธุรกรรมที่เกิดแล้ว มีสคริปต์ `scripts/acceptance/recover-sepolia.mjs` สำหรับคืนเงินเฉพาะออเดอร์ของ Wallet ทดสอบชุดนี้ที่หยุดกลางทาง

คืนเงินออเดอร์ที่หยุดกลางทางแล้วด้วย [cleanup refund](https://sepolia.etherscan.io/tx/0xc6b00383f2b10b6f2c78b571cc3341fcdc915e88ac592611c949632b87404783) และตรวจ projection หลัง retry: รอบนี้มี RELEASED 2 และ REFUNDED 2 ออเดอร์ ไม่มีออเดอร์ทดสอบค้างเปิดอยู่

## ขอบเขตของหลักฐาน

- Browser E2E ใช้ **deterministic EIP-1193 test provider** แทนหน้าต่าง MetaMask เพื่อทดสอบปฏิเสธ/สลับ account/network/สร้าง pending ซ้ำได้จริง การลงนาม, Supabase Web3 auth, API, Storage, RPC และ Contract เป็นของจริงทั้งหมด ไม่ mock ยอดเงินหรือผลธุรกรรม
- เปิด MetaMask รุ่นทางการ v13.57.0 ใน Chromium profile แยกและตรวจ session Buyer ผ่านหน้า Wallet ได้แล้ว แต่ไม่ได้อ้างว่า automated full-flow ทุกขั้นใช้ extension รุ่นนี้
- Sepolia ทั้งสามเส้นทางลงนามด้วย Wallet ทดสอบและ key ผู้ดูแลเดิมผ่าน harness ฝั่ง Node ไม่ใช่การกด extension ทุกขั้น
- ทดสอบ 24/48 ชั่วโมงและ reorg ด้วย local time travel/snapshot เท่านั้น ไม่ลดค่ากำหนดเวลาใน Contract และไม่เปลี่ยนเวลาของ Sepolia
- การทดสอบนี้ใช้ Supabase ใน Docker และ production build ในเครื่อง ไม่ใช่การตรวจรับ Cloud/Vercel deployment

## ผล regression และ configuration

- TypeScript ผ่าน
- Vitest ปกติ **47 tests / 21 files** ผ่าน
- Contract tests **13 tests** ผ่าน
- Acceptance รวม **25 checks / 9 files** ผ่าน
- Sepolia suite ผ่านทั้ง 3 outcomes
- Production Webpack build ของแอปทดสอบผ่าน; มี upstream warning จาก `ox/viem` dynamic dependency ตามเดิม
- `env:check`, `db:check` ผ่าน; ตรวจ deployment, chain, treasury, signer และ staff roles ตรงกัน
- Security Advisors ของฐานหลักและฐานทดสอบแยก: **No issues found**
- Scheduler หลักยัง active: 3 รอบล่าสุด succeeded และ HTTP 200 ต่อเนื่องหลังคืนเงิน cleanup

ระหว่างตั้งค่าพบ private-key-shaped values ใต้ตัวแปร `..._ADDRESS` ของผู้ดูแล/treasury/signer จึงแก้ชื่อเป็น `..._PRIVATE_KEY` และคง public address ที่ตรงกับ Contract ไว้ ส่วน treasury/signer มีค่าติด underlying RPC error log ครั้งหนึ่งก่อนตรวจรูปแบบ จึงเพิ่ม strict address validation และ redaction ครอบ error ของ Sepolia harness แล้ว ควรถือว่า key testnet สองค่านั้นเคยปรากฏใน log และใช้ Wallet/Signer/Contract ชุดใหม่ก่อนนำระบบไปใช้กับเงินจริง

## วิธีทดสอบซ้ำ

ใช้ Node >=22.13, Docker และ dependencies ใน repository รันคำสั่งจาก root ของโปรเจกต์ คำสั่งต่อไปนี้สร้างฐานทดสอบ project `notbit-acceptance` แยกจาก `game-item-marketplace` ไม่ reset ฐานหลัก

1. `npm run acceptance:database` คัดลอก config/migrations/seed, reset เฉพาะฐานทดสอบ `notbit-acceptance` เพื่อไม่ใช้ checkpoint จาก Hardhat รอบเก่า และเปิด API 54331 / DB 54332 โดยซ่อน CLI credential output
2. เปิด local Contract node ใน terminal แยก: `npm run contracts:node` (127.0.0.1:8545)
3. `npm run contracts:build` แล้ว `npm run acceptance:setup` เพื่อติดตั้ง Contract ทดสอบและสร้าง app snapshot/environment ใน `.runtime/acceptance`
4. เปิด `npm run acceptance:rpc` ใน terminal แยก (RPC fault proxy 8546)
5. Build app: `node node_modules/next/dist/bin/next build .runtime/acceptance/app --webpack` แล้วเปิด `npm run acceptance:app` ใน terminal แยก (app 3201, authenticated local restart control 3202)
6. ติดตั้ง Playwright Chromium หากยังไม่มี: `npx playwright install chromium`; จากนั้น `npm run test:acceptance`

ถ้าเก็บ Chromium ไว้ใน path อื่น ให้ตั้ง `PLAYWRIGHT_BROWSERS_PATH` ให้ตรงก่อนรันทดสอบ ห้ามรัน acceptance หลายชุดพร้อมกันเพราะชุดทดสอบใช้ time travel และ RPC fault injection ร่วมกัน หยุดแอป/proxy ก่อนรัน setup ใหม่เพราะ setup สร้าง deployment และ secret ชุดใหม่

ไฟล์ `.runtime/acceptance/results.jsonl`, `sepolia-results.jsonl` และภาพ `17-browser-settled.png` เป็นหลักฐานในเครื่อง ส่วน credentials/Wallet ทดสอบอยู่ใน `.runtime` ที่ Git ignore ไว้ ห้ามนำไฟล์เหล่านี้ขึ้น Git

Sepolia ต้องเปิดแอปหลักและ indexer ที่ตั้งค่าถูกต้องก่อน และเป็นคำสั่ง opt-in เพราะส่งธุรกรรม testnet จริง:

```powershell
$env:ACCEPTANCE_SEPOLIA = '1'
npm run test:sepolia
# ใช้เมื่อรอบก่อนหยุดกลางทาง และต้องการคืนเงินเฉพาะดีลของ test wallets:
node scripts/acceptance/recover-sepolia.mjs
Remove-Item Env:ACCEPTANCE_SEPOLIA
```

ยังไม่ได้ commit/push หรือ merge การเปลี่ยนแปลงรอบนี้เข้า main
