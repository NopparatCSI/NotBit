# NOTBIT

โครงโปรเจกต์สำหรับตลาดกลางไอเทมเกมบน Sepolia ตามขอบเขตสาธิต 5 วัน รุ่นนี้จะใช้ MetaMask และ Escrow สำหรับออเดอร์แบบผู้ซื้อหนึ่งรายกับผู้ขายหนึ่งราย

อ่าน [คู่มือเตรียมโปรเจกต์สำหรับทีม](docs/setup-checklist.md) เพื่อดูจำนวนบัญชีที่ต้องใช้ แหล่งที่มาของแต่ละค่า และสิ่งที่ต้องเตรียมสำหรับเครื่องใหม่

## เริ่มในเครื่อง

ใช้ Node.js **22.13 ขึ้นไป** และแนะนำ npm **11.3 ขึ้นไป** เพื่อให้ npm ติดตั้ง native dependencies จาก lockfile ได้ครบ

```powershell
npm ci
npm run dev
```

เปิด [http://localhost:3000](http://localhost:3000) เพื่อลองหน้าแรกและหน้าบัญชีได้ทันที หน้าแรกใช้ข้อมูลตัวอย่าง 6 เกม รวมถึงหมวดไอเทมและรายการสินค้าตัวอย่างในโค้ด ส่วนการเข้าสู่ระบบด้วย MetaMask ใช้การตั้งค่า Supabase ด้านล่าง

| โฟลเดอร์ | หน้าที่ |
| --- | --- |
| `src/app` | Next.js App Router, หน้าบัญชี Wallet และ API |
| `packages/shared` | สถานะ, schemas, ABI, EIP-712, ฟังก์ชัน hash และ fixture |
| `contracts` | Hardhat 3, Escrow สำหรับซื้อขาย ข้อพิพาท ยอดค้างรับ สิทธิ์ผู้ดูแล และชุดทดสอบ |
| `supabase` | Migration, สิทธิ์ฐานข้อมูล, storage buckets และ seed รายชื่อเกมทั้ง 6 เกม |

## เปิดการเข้าใช้ด้วย MetaMask

1. เปิด Docker แล้วรัน `npx supabase start` จากโฟลเดอร์นี้ ใช้ URL และ publishable key จาก `npx supabase status`. ถ้าใช้ฐานข้อมูล local ที่เริ่มไว้ก่อนแล้ว ให้รัน `npx supabase migration up --local` เพื่อใช้ migration ที่ค้าง
2. คัดลอก `.env.example` เป็น `.env.local` แล้วกรอก `NEXT_PUBLIC_SUPABASE_URL` และ `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
3. เปิด [http://localhost:3000/account](http://localhost:3000/account) แล้วเลือก MetaMask ระบบจะขอเปลี่ยนไป Sepolia และให้ลงนามเพื่อยืนยันบัญชี การลงนามเข้าสู่ระบบไม่ใช้ Gas หน้าบัญชีจะเปลี่ยนจาก `127.0.0.1` เป็น `localhost` เพราะ Supabase Auth ต้องการชื่อโฮสต์ในข้อความที่ลงนาม
4. ตรวจผลที่ `GET /api/v1/me` จากเบราว์เซอร์เดียวกัน ระบบใช้ Supabase Auth ตรวจ session และอ่านบทบาทจากฐานข้อมูล

สำหรับ Supabase ที่โฮสต์เองบนบริการ ให้เปิด Ethereum Web3 provider และใส่ origin ของเว็บใน Redirect URLs ใช้ migration และ seed กับฐานข้อมูลสำหรับสาธิตตาม [เอกสาร Supabase Web3 Auth](https://supabase.com/docs/guides/auth/auth-web3).

ก่อนติดตั้งระบบสาธิต ให้ผู้ติดตั้งบันทึก Wallet ของ Admin และ Super Admin แบบตัวพิมพ์เล็กลงใน `public.staff_wallets` โดยใช้สิทธิ์เจ้าของฐานข้อมูล Wallet ชุดเดียวกันจะใช้ตั้งค่าบทบาทใน Escrow เมื่อติดตั้ง Contract. ใช้ Wallet บัญชีซื้อขายแยกจาก Wallet ผู้ดูแล

## ทดสอบ

```powershell
npm run typecheck
npm test
npm run contracts:test
npx playwright install chromium
npm run test:e2e
npm run build
```

หากใช้ Microsoft Edge ที่ติดตั้งแล้ว ให้ตั้ง `$env:PLAYWRIGHT_CHANNEL = 'msedge'` แล้วรันชุด E2E ได้เลย กำหนด `PLAYWRIGHT_BROWSERS_PATH` เป็นโฟลเดอร์ในโปรเจกต์ก่อนติดตั้ง Chromium หากต้องการเก็บไฟล์ทั้งหมดไว้ที่นี่

หากต้องการทดสอบกับ production build ให้ build ด้วยค่า Supabase ว่าง แล้วตั้ง `PLAYWRIGHT_USE_BUILD=1` ก่อนรัน E2E

ชุดทดสอบฐานข้อมูลรัน migration บน PostgreSQL ผ่าน PGlite โดยจำลองตารางและ roles ของ Supabase ส่วนการทดสอบ MetaMask กับ Supabase Auth ต้องใช้บริการที่เปิดอยู่และ MetaMask จริง

## ทดลอง Escrow ในเครื่อง

เปิด PowerShell ที่โฟลเดอร์โปรเจกต์แล้วรัน `npm run contracts:node` ค้างไว้ จากนั้นเปิดอีกหน้าต่างแล้วรัน `npm run contracts:deploy:local`. คำสั่งจะแสดงที่อยู่ Contract, บล็อกที่ติดตั้ง และ Wallet ทดสอบสำหรับผู้ซื้อ ผู้ขาย แพลตฟอร์ม ผู้ลงนามหลักฐาน Admin และ Super Admin ใช้ RPC `http://127.0.0.1:8545` และ chain ID `31337`.

เมื่อเริ่ม node ใหม่ให้ติดตั้งอีกครั้งและใช้ที่อยู่จากผลลัพธ์ล่าสุด

## ติดตั้ง Escrow บน Sepolia

สำหรับทดสอบกับ Contract ที่ติดตั้งแล้ว ให้ใช้ที่อยู่และบล็อกเริ่มต้นจาก [ข้อมูลส่งต่อ Sepolia](docs/handoff.md#escrow-ที่ติดตั้งบน-sepolia) ตั้ง `NEXT_PUBLIC_ESCROW_ADDRESS` ให้ตรงกับที่อยู่นั้น ขั้นตอนด้านล่างใช้สำหรับติดตั้ง Contract ใหม่

ตั้งค่าจาก `.env.example` ใน `.env.local` หรือ environment ของเทอร์มินัลที่ใช้ติดตั้ง

| ค่า | สิ่งที่ต้องเตรียม |
| --- | --- |
| `SEPOLIA_RPC_URL` | HTTPS RPC ของโปรเจกต์ เช่น Alchemy Sepolia |
| `SEPOLIA_DEPLOYER_PRIVATE_KEY` | คีย์ของ Wallet สำหรับติดตั้งโดยเฉพาะ มี Sepolia ETH สำหรับ gas และเก็บคีย์ในเครื่อง |
| `SEPOLIA_TREASURY_ADDRESS` | ที่อยู่รับค่าบริการ 5% |
| `SEPOLIA_EVIDENCE_SIGNER_ADDRESS` | ที่อยู่ของ Wallet ที่ระบบหลังบ้านใช้เซ็นใบรับหลักฐาน |
| `SEPOLIA_ADMIN_ADDRESS`, `SEPOLIA_SUPER_ADMIN_ADDRESS` | ที่อยู่ของผู้ดูแลสองบัญชีแยกกัน ใช้ Wallet ที่มี Sepolia ETH เพื่อส่งธุรกรรมตามสิทธิ์ |

```powershell
npm run contracts:test
npm run contracts:deploy:sepolia
```

คำสั่งตรวจ chain ID และยอด ETH ก่อนติดตั้ง พิมพ์ transaction hash ทันทีหลังส่ง จากนั้นรอ 3 confirmations และตรวจ bytecode กับที่อยู่ผู้ดูแลบนเชน ถ้าได้ hash แล้วแต่ยังไม่ได้ผลยืนยัน ให้ตรวจธุรกรรมเดิมก่อนรันซ้ำ

เมื่อยืนยันสำเร็จ ให้ตั้ง `NEXT_PUBLIC_ESCROW_ADDRESS` จากผลลัพธ์ ใช้ `blockNumber` เป็นบล็อกเริ่มอ่านเหตุการณ์ และใช้ที่อยู่ Admin กับ Super Admin คู่เดียวกันใน `public.staff_wallets`. ทั้งสองบทบาทตั้งตอน deploy และคงที่ตลอดอายุ Contract รุ่นนี้

## เตรียมเผยแพร่เว็บสาธิตบน Vercel

1. รวมหน้าและ API ซื้อขาย ระบบหลักฐาน หน้าผู้ดูแล และงานอ่านเหตุการณ์ตาม [ข้อตกลงส่งต่อ](docs/handoff.md)
2. ตั้ง Supabase สำหรับเว็บออนไลน์ ใช้ migration และข้อมูลสาธิต เปิด Ethereum Web3 Auth แล้วเพิ่ม origin ของเว็บสาธิตใน Redirect URLs ลงทะเบียน Wallet ผู้ดูแลให้ตรงกับ Contract ตามข้างต้น [คู่มือ Supabase Web3 Auth](https://supabase.com/docs/guides/auth/auth-web3)
3. ตั้ง `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` และ `NEXT_PUBLIC_ESCROW_ADDRESS` ใน environment ของ Vercel สำหรับเว็บสาธิต เก็บ `SUPABASE_SECRET_KEY`, `SEPOLIA_RPC_URL` และ `EVIDENCE_SIGNER_PRIVATE_KEY` ไว้ใน environment ฝั่งเซิร์ฟเวอร์ที่ใช้ค่านั้น เก็บ `SEPOLIA_DEPLOYER_PRIVATE_KEY` ในเครื่องติดตั้ง Contract
4. ทดสอบบน URL ของ preview ด้วย MetaMask ให้ครบทั้งซื้อขายและคืนเงินก่อนส่งลิงก์เว็บสาธิต [คู่มือเผยแพร่และตรวจ preview บน Vercel](https://vercel.com/docs/deployments)

อ่าน [ข้อตกลงส่งต่องาน](docs/handoff.md) ก่อนเริ่มงานตลาด หลักฐาน หรือการอ่านเหตุการณ์จากเชน
