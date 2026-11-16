# คู่มือเตรียมโปรเจกต์ NOTBIT

ใช้คู่มือนี้เมื่อรับโค้ดจากทีม หรือตั้งเครื่องใหม่สำหรับพัฒนาและทดสอบตลาดไอเทมเกมบน Ethereum Sepolia

## ต้องเตรียมกี่บัญชี

| งานที่ต้องการทำ | บัญชี Ethereum ที่ต้องเตรียม | บริการภายนอก |
| --- | --- | --- |
| เปิดหน้าเว็บด้วยข้อมูลจำลองในเครื่อง | 0 | ใช้ Node.js และ npm |
| ทดสอบล็อกอินในเครื่อง | 1 บัญชีใน MetaMask | ใช้ Docker Desktop เปิด Supabase ในเครื่อง |
| ติดตั้ง Escrow ใหม่บน Sepolia | 5 บัญชีสำหรับแยกหน้าที่ตามตารางด้านล่าง | ใช้ RPC ของ Sepolia เช่น Alchemy |
| สาธิตซื้อขายและคืนเงินครบทุกบทบาทบน Sepolia | 7 บัญชีหลัก โดยเพิ่ม Buyer และ Seller | ใช้ RPC ของ Sepolia ถ้าต้องการลิงก์เว็บออนไลน์ให้เตรียม Supabase Cloud และ Vercel |

สร้างทั้ง 7 บัญชีใน MetaMask ตัวเดียวได้ ตั้งชื่อตามบทบาทเพื่อช่วยเลือกบัญชี เวลาทำงานเป็นทีมให้กำหนดว่าใครรับผิดชอบแต่ละบัญชี บัญชี Buyer และ Seller ต้องต่างกัน และบัญชีผู้ดูแลที่กำหนดบน Contract ใช้ซื้อขายไม่ได้ [คู่มือเพิ่มบัญชี Ethereum ใน MetaMask](https://support.metamask.io/configure/accounts/how-to-add-accounts-in-your-wallet/)

| บัญชี | หน้าที่ | เตรียม Sepolia ETH เมื่อใด |
| --- | --- | --- |
| `Deploy` | เซ็นธุรกรรมติดตั้ง Contract ใหม่ | ก่อนติดตั้ง |
| `Treasury` | รับค่าบริการ 5% เมื่อจ่ายเงินให้ผู้ขาย | เมื่อบัญชีต้องส่งธุรกรรมเอง เช่น ถอนยอดค้างรับ |
| `Evidence Signer` | ให้ backend เซ็นใบรับหลักฐานส่งและรับสินค้า | การเซ็นใบรับนอกเชนไม่เสีย gas |
| `Admin` | อนุมัติคืนเงินหรือจ่ายตามดีลหลังข้อพิพาท | ก่อนสาธิตการตัดสินข้อพิพาท |
| `Super Admin` | หยุดหรือเปิดรับเงินฝาก และตัดสินข้อพิพาทได้ | ก่อนสาธิตการใช้งานสิทธิ์ |
| `Buyer` | ฝากเงิน ยืนยันรับสินค้า และเปิดข้อพิพาท | ก่อนสาธิต เตรียมยอดฝากและค่า gas |
| `Seller` | เซ็นข้อเสนอและส่งธุรกรรมยืนยันส่งสินค้า | ก่อนสาธิตยืนยันส่งสินค้า |

ถ้าทีมใช้ Escrow ที่ติดตั้งไว้แล้ว ให้ใช้บัญชีผู้ดูแลและผู้เซ็นหลักฐานที่กำหนดไว้ใน Contract นั้น ผู้ร่วมทีมสร้าง Buyer และ Seller ของตัวเองได้ ถ้า Cron จะส่งธุรกรรมยกระดับออเดอร์หมดเวลาเอง ให้ทีมตกลงกระเป๋าผู้ส่งและเตรียม Sepolia ETH ให้กระเป๋านั้น หากแยกเป็นบัญชีเฉพาะจะเป็นบัญชีที่ 8 การทดสอบยกระดับด้วยมือใช้บัญชีทดสอบที่มี gas ได้

## บัญชีบริการของทีม

| บริการ | เตรียมเมื่อใด | สิ่งที่ได้รับ |
| --- | --- | --- |
| **Alchemy** | ต้องการ RPC ของทีมสำหรับ Sepolia | หนึ่งแอปที่เปิดใช้ Ethereum Sepolia และ HTTPS endpoint |
| **Supabase Cloud** | จะให้เว็บออนไลน์หรือหลายเครื่องใช้ backend ร่วมกัน | หนึ่งโปรเจกต์ฐานข้อมูลและ Auth ของทีม พร้อม Project URL, publishable key และ server secret ตามงาน |
| **Vercel** | จะเผยแพร่เว็บเป็นลิงก์สำหรับทดสอบร่วมกัน | หนึ่งโปรเจกต์เว็บของทีมและที่ตั้งค่า environment ของ Preview หรือ Production |
| **GitHub** | ทีมเลือกใช้ GitHub ส่ง Pull Request หรือเชื่อม Git กับ Vercel | Repository ร่วมของทีมและสิทธิ์เข้าถึงรายคน |

สำหรับเว็บออนไลน์ตามแผนนี้ให้เตรียม **3 บริการ** คือ Alchemy, Supabase Cloud และ Vercel อย่างละหนึ่งโปรเจกต์ของทีม สมาชิกใช้บัญชีของตัวเองและรับสิทธิ์จากเจ้าของโปรเจกต์ สำหรับ Supabase ใน Docker ให้แต่ละเครื่องใช้ค่าจาก Supabase local ของเครื่องนั้น [คู่มือ Supabase Local](https://supabase.com/docs/guides/local-development/cli/getting-started) · [คู่มือ Vercel Deployments](https://vercel.com/docs/deployments)

## 1. เปิดโปรเจกต์ในเครื่อง

1. ติดตั้ง Node.js **22.13 ขึ้นไป** โปรเจกต์แนะนำ npm **11.3 ขึ้นไป** ใช้ `node --version` และ `npm --version` ตรวจเวอร์ชัน ถ้าทดสอบล็อกอินให้ติดตั้ง Docker Desktop และ MetaMask ด้วย [Node.js](https://nodejs.org/en/download) · [ติดตั้ง Docker Desktop บน Windows](https://docs.docker.com/desktop/setup/install/windows-install/)
2. เปิด PowerShell ที่ root ของโปรเจกต์แล้วรันคำสั่งด้านล่าง ไฟล์ `.env.example` ใช้แจกในทีม ส่วน `.env.local` ใช้เก็บค่าของเครื่องตนเอง หากเครื่องมี `.env` ที่ใช้งานอยู่แล้ว ให้กรอกค่าในไฟล์เดิมได้เลย

   ```powershell
   npm ci
   if (-not ((Test-Path -LiteralPath '.env.local') -or (Test-Path -LiteralPath '.env'))) {
     Copy-Item -LiteralPath '.env.example' -Destination '.env.local'
   }
   ```

3. ถ้าจะดูหน้าเว็บตัวอย่าง ใช้ `npm run dev` แล้วเปิด [localhost:3000](http://localhost:3000) โดยเว้นค่า Supabase ทั้งสองช่องว่าง
4. ถ้าจะทดสอบล็อกอิน ให้เปิด Docker Desktop แล้วรัน `npx supabase start` และ `npx supabase status` จาก root ของโปรเจกต์ ใช้ **Project URL** และ **Publishable key** จากผลลัพธ์ ถ้าเครื่องมี Supabase local จากงานรอบก่อนแล้ว ใช้ `npx supabase migration up --local` เพื่อใช้ migration ที่ค้าง [ตำแหน่งคีย์ใน Supabase](https://supabase.com/docs/guides/getting-started/api-keys)

   ```dotenv
   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=ใส่_publishable_key_จาก_supabase_status
   ```

5. รัน `npm run dev` ใหม่หลังแก้ไฟล์ แล้วเปิด [หน้าบัญชีที่ localhost:3000](http://localhost:3000/account) เลือก MetaMask และลงนามเพื่อเข้าสู่ระบบ การลงนามเข้าสู่ระบบไม่เสีย gas ใช้ `GET /api/v1/me` ตรวจบัญชีและบทบาทจากเบราว์เซอร์ที่ล็อกอินแล้ว

สำหรับงาน Contract ในเครื่อง เปิดสองเทอร์มินัล ใช้ `npm run contracts:node` และ `npm run contracts:deploy:local` ตามลำดับ Hardhat เตรียมกระเป๋าทดสอบและยอดทดสอบบน chain ID `31337` ไว้ให้ ใช้ [คำสั่งติดตั้งและทดสอบใน README](../README.md) สำหรับรายละเอียด

## 2. เตรียมค่าของ Sepolia

1. เข้า Alchemy Dashboard สร้างแอปหรือเปิดแอปของทีม ไปที่ **Endpoints** เปิด **Ethereum Sepolia** แล้วคัดลอก HTTPS URL ทั้งบรรทัด ค่า Alchemy ของ Sepolia ใช้โฮสต์ `eth-sepolia.g.alchemy.com` และ chain ID `11155111` [คู่มือสร้าง API key ของ Alchemy](https://www.alchemy.com/docs/create-an-api-key) · [หน้าตั้งค่าเครือข่ายใน Endpoints](https://www.alchemy.com/docs/changelog/2025/11/20)
2. ใน MetaMask เปิด **Show test networks** แล้วเลือก **Sepolia** กดคัดลอกที่อยู่สาธารณะของบัญชีที่ต้องเติม gas ไปขอ Sepolia ETH จาก faucet สำหรับ Wallet ใหม่สามารถใช้ Sepolia PoW Faucet ส่วน Alchemy Faucet ตรวจยอดและประวัติบน Ethereum Mainnet ของที่อยู่ที่ขอ [คู่มือดูเครือข่ายทดสอบใน MetaMask](https://support.metamask.io/configure/networks/how-to-view-testnets-in-metamask/) · [Sepolia PoW Faucet](https://sepolia-faucet.pk910.de/) · [เงื่อนไข Alchemy Faucet](https://www.alchemy.com/docs/faucets)
3. คัดลอก **ที่อยู่สาธารณะเต็ม** จากปุ่มคัดลอกของแต่ละบัญชี ที่อยู่มี `0x` ตามด้วยเลขฐานสิบหก 40 ตัว ถ้าต้องใช้ **private key** ของบัญชี Deploy หรือ Evidence Signer ให้เปิดเมนูสามจุดข้างบัญชี → **Account details → Private key** คีย์ Ethereum ในการตั้งค่าโปรเจกต์ใช้ `0x` หนึ่งชุดตามด้วยเลขฐานสิบหก 64 ตัว เก็บคีย์ในเครื่องหรือ environment ฝั่งเซิร์ฟเวอร์ของบัญชีที่ใช้งาน [วิธีคัดลอกที่อยู่](https://support.metamask.io/start/how-to-copy-your-metamask-account-public-address-) · [วิธีดู private key](https://support.metamask.io/configure/accounts/how-to-export-an-accounts-private-key/)

### ค่าที่ใช้ตอนติดตั้ง Contract ใหม่

ตั้งบนเครื่องผู้ที่ติดตั้งเท่านั้น

| ตัวแปร | เอาค่ามาจากไหน |
| --- | --- |
| `SEPOLIA_RPC_URL` | HTTPS endpoint ของ Ethereum Sepolia จาก Alchemy แอปของทีม URL ที่ฝัง API key เป็นค่าฝั่งเซิร์ฟเวอร์ |
| `SEPOLIA_DEPLOYER_PRIVATE_KEY` | Private key ของบัญชี Deploy ใน MetaMask บัญชีนี้ต้องมี Sepolia ETH |
| `SEPOLIA_TREASURY_ADDRESS` | ที่อยู่สาธารณะของบัญชี Treasury |
| `SEPOLIA_EVIDENCE_SIGNER_ADDRESS` | ที่อยู่สาธารณะของบัญชี Evidence Signer ให้ตรงกับบัญชีที่ backend จะใช้เซ็น |
| `SEPOLIA_ADMIN_ADDRESS` | ที่อยู่สาธารณะของบัญชี Admin |
| `SEPOLIA_SUPER_ADMIN_ADDRESS` | ที่อยู่สาธารณะของบัญชี Super Admin ต้องต่างจาก Admin |

ตรวจด้วย `npm run contracts:test` แล้วใช้ `npm run contracts:deploy:sepolia` เมื่อพร้อมติดตั้งใหม่ คำสั่งจะแสดงที่อยู่ Contract และเลขบล็อกหลังครบ confirmations ให้บันทึกทั้งสองค่าเพื่อนำไปตั้งเว็บและตัวอ่านเหตุการณ์ บทบาท Admin, Super Admin และที่อยู่ Evidence Signer ถูกกำหนดตอนติดตั้ง Escrow รุ่นนี้

### ค่าที่ใช้เชื่อมเว็บและ backend

| ตัวแปร | เอาค่ามาจากไหน | ใช้ที่ไหน |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL จาก `supabase status` ตอนรัน local หรือจาก **Connect** ใน Supabase Dashboard ตอนใช้โปรเจกต์ออนไลน์ | เว็บและ backend ที่อ่าน session |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key จากแหล่งเดียวกับ Project URL | เว็บและ backend ที่อ่าน session |
| `NEXT_PUBLIC_ESCROW_ADDRESS` | ที่อยู่จากผลติดตั้ง Escrow หรือจากเอกสารส่งต่อของทีม | เว็บที่เรียก Contract |
| `NEXT_PUBLIC_SEPOLIA_RPC_URL` | HTTPS RPC ที่ตั้งใจให้เบราว์เซอร์เรียกได้ | เว้นว่างได้ หากตั้งให้ใช้ endpoint ที่เปิดเผยต่อผู้ใช้ได้ |
| `SEPOLIA_RPC_URL` | HTTPS RPC ของทีมจาก Alchemy | ตัวติดตั้งและงานอ่านข้อมูลบนเชนฝั่งเซิร์ฟเวอร์ |
| `SUPABASE_SECRET_KEY` | Secret key จาก `supabase status` ของ local หรือ **Settings → API Keys** ของโปรเจกต์ Supabase ออนไลน์ | Backend ที่ต้องทำงานด้วยสิทธิ์บริการ |
| `EVIDENCE_SIGNER_PRIVATE_KEY` | Private key ของบัญชี Evidence Signer ที่มีที่อยู่เดียวกับ `SEPOLIA_EVIDENCE_SIGNER_ADDRESS` | Backend ที่เซ็นใบรับหลักฐาน |

**Escrow ที่ทีมใช้ร่วมกันได้ตอนนี้** ใช้ที่อยู่ `0x3D32396Cd1017DeD8cCE5150b88Ee6fEb3ca6eBe` บน chain ID `11155111` ให้ตัวอ่านเหตุการณ์เริ่มที่บล็อก `12146825` คนที่ใช้ Contract นี้กรอก `NEXT_PUBLIC_ESCROW_ADDRESS` จากที่อยู่ดังกล่าวและเว้นค่า private key ของผู้ติดตั้งได้ [ข้อมูลส่งต่อและ ABI](handoff.md)

ค่าที่เพื่อนแต่ละคนต้องเตรียมเมื่อใช้ Contract เดิม

- ผู้พัฒนาหน้าเว็บตั้ง Project URL และ publishable key ของ Supabase พร้อมที่อยู่ Escrow และใช้บัญชี Buyer หรือ Seller ใน MetaMask เพื่อทดสอบ
- ผู้พัฒนา backend เลือกค่า Supabase ให้ตรงกับ environment ของเว็บ ตั้ง RPC ฝั่งเซิร์ฟเวอร์สำหรับตัวอ่านเหตุการณ์ และตั้ง private key ของ Evidence Signer เมื่อทดสอบใบรับหลักฐาน ใช้ Supabase secret key เฉพาะงานที่ต้องใช้สิทธิ์บริการ

## 3. เตรียมเว็บออนไลน์และส่งต่อให้ทีม

1. ใน Supabase Cloud ใช้ migration จาก `supabase/migrations` และข้อมูลตัวอย่างจาก `supabase/seed.sql` เปิด **Ethereum Web3 Wallet** ตั้ง Site URL และ Redirect URLs ตาม origin ที่จะใช้ทดสอบ และบันทึก Wallet ของ Admin กับ Super Admin ใน `public.staff_wallets` ให้ตรงกับ Contract บน Sepolia [คู่มือ Web3 Auth](https://supabase.com/docs/guides/auth/auth-web3)
2. ในโปรเจกต์ Vercel เปิด **Settings → Environment Variables** ตั้งค่า `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` และ `NEXT_PUBLIC_ESCROW_ADDRESS` ใน **Preview** สำหรับทดสอบก่อน ใส่คีย์ฝั่งเซิร์ฟเวอร์เฉพาะในบริการที่ต้องใช้ หลังแก้ค่า `NEXT_PUBLIC_*` ให้ build หรือ deploy ใหม่เพื่อให้เบราว์เซอร์โหลดค่าล่าสุด [คู่มือ Environment Variables ของ Vercel](https://vercel.com/docs/environment-variables) · [การฝังค่าในเบราว์เซอร์ของ Next.js](https://nextjs.org/docs/app/guides/environment-variables#bundling-environment-variables-for-the-browser)
3. ส่งให้เพื่อน **ซอร์สโปรเจกต์, [ไฟล์ตัวอย่าง](../.env.example), [คู่มือรันและทดสอบ](../README.md) และ [ข้อมูลส่งต่อ](handoff.md)** ข้อมูลสาธารณะที่ใช้ร่วมกันได้คือที่อยู่ Contract, chain ID, บล็อกเริ่มอ่าน และที่อยู่ Wallet ตามบทบาท เก็บ `.env` และ `.env.local` ที่มีค่าจริงไว้กับเจ้าของเครื่องหรือบริการที่ใช้ ค่า `SEPOLIA_DEPLOYER_PRIVATE_KEY` อยู่ที่เครื่องที่ติดตั้ง Contract
4. เมื่อรวมเว็บออเดอร์ ระบบหลักฐาน หน้าผู้ดูแล และตัวอ่านเหตุการณ์แล้ว ให้ทดสอบล็อกอิน ซื้อขายสำเร็จ และคืนเงินจากหน้าเว็บ Preview ก่อนส่งลิงก์สาธิต
