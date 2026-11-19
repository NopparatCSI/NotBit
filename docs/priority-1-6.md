# ผลปิดงานลำดับ 1–6

วันที่ 19 พฤศจิกายน 2026 บน `codex/integrate-dev2` งานทั้งหมดด้านล่างทำกับ Supabase local ของโปรเจกต์และ Contract Sepolia เดิม ไม่ได้ deploy เว็บขึ้น Vercel ในรอบนี้

| ลำดับ | ผลดำเนินการ | หลักฐาน |
|---|---|---|
| 1. Configuration ตรงกัน | รวมการเลือก chain/address/RPC ของ offers, evidence, Admin และ indexer ผ่าน `resolveEscrowSettings`; เพิ่ม `npm run env:check` | chain `11155111`, มี bytecode, deployment/start block/treasury/signer ตรงกัน และ staff ใน DB ตรงกับ Admin/Super Admin บนเชน |
| 2. Evidence Signer | ตั้ง key ที่ผู้ใช้ใส่ไว้ใน environment และตรวจ prefix/address; Sepolia signer ต้องมี expected address ที่ตรงกัน | ลงนามและตรวจ EIP-712 กลับสำเร็จโดยไม่ส่งธุรกรรมและไม่พิมพ์ key/signature |
| 3. Cron | เปิด pg_cron/pg_net, schedule `notbit-indexer` ทุกนาที; URL/token อยู่ใน Vault และ function เรียกได้เฉพาะเจ้าของ DB | cron active, run succeeded และ HTTP response 200 จริงหลัง restart dev server |
| 4. Sender/gas | สร้าง Wallet เฉพาะใน `.env.local` ที่ Git ไม่ติดตาม; เติม 0.001 Sepolia ETH จาก Deploy | sender `0x0613d267059ff0B8dFdb9A15089194403BE833b0`, balance `1000000000000000` wei หลัง 3 confirmations |
| 5. ตรวจรูปจริง | หลักฐานและรูปแชทผ่าน sharp decode ทุกเฟรม จำกัด 40 ล้าน pixels โดยไม่แก้ bytes เดิม | JPEG/PNG/WebP ใช้ได้; magic bytes ล้วน/ภาพเสีย/MIME ไม่ตรง/เกินขนาดถูกปฏิเสธ; hash เดิมไม่เปลี่ยน |
| 6. Uploads บนสถาปัตยกรรม Vercel | รูปจาก UI อัปโหลดตรงเข้า private `upload-staging`; web API รับ ticket JSON แล้วโหลด bytes มาตรวจ ownership/scope/expiry/ขนาด/hash/decode ก่อนนำไปใช้ | Web3 sessions จริงสองบัญชี: รูป PNG 7,695,273 bytes สร้างประกาศได้ผ่าน JSON ขนาดเล็ก, รูปแชทคู่ค้าอ่านได้, ticket ข้ามเจ้าของ/ข้ามประเภท/ใช้ซ้ำ/รูปเสียและ anonymous chat read ถูกปฏิเสธ |

ธุรกรรมเติม gas: [Sepolia funding transaction](https://sepolia.etherscan.io/tx/0x59a2aff2e440c6304226b8727aedfe7dad355dc426e5218b4122803d2b727b85)

## เปิดใช้งานในเครื่องหลัง restart

1. เปิด Docker/Supabase และใช้ pending migrations โดยไม่ reset ข้อมูล: `npx supabase migration up --local --include-all`
2. เปิดเว็บที่พอร์ต 3001: `npm run dev -- --port 3001`
3. เปิดอีก terminal และรัน `npm run indexer:bridge` เพื่อให้ Docker เรียก localhost ได้ ตัว bridge เปิดเฉพาะ route indexer และตรวจ bearer secret ไม่ส่งต่อหน้า/API อื่น
4. ถ้าเป็นฐานข้อมูลใหม่ หรือเปลี่ยน URL/token ให้ตั้ง `INDEXER_SCHEDULE_URL=http://host.docker.internal:3301/api/v1/internal/indexer` ใน `.env.local` แล้วรัน `npm run indexer:configure:local` คำสั่งเขียน Vault ผ่าน stdin โดยไม่พิมพ์ token
5. ตรวจ `npm run env:check` และ `npm run db:check`

Cron อยู่ในฐานข้อมูลและยังคงอยู่หลัง restart แต่ Docker เว็บ และ bridge ต้องทำงานเพื่อให้ HTTP call สำเร็จ ถ้าเปลี่ยนพอร์ตเว็บให้เปลี่ยน `LOCAL_APP_URL` แล้ว restart bridge ไม่ต้องแก้ schedule

## นำไปใช้กับเว็บออนไลน์

- ใช้ migrations ใหม่ทั้ง `scheduled_indexer` และ `staged_image_uploads` กับ Supabase ของ environment นั้น
- ตั้ง public Supabase URL/key, Escrow address และ server-only RPC/service/signer/sender/INDEXER_SECRET ตาม `.env.example`; อย่าคัดลอก key ไปในตัวแปร NEXT_PUBLIC
- ใช้ Supabase Vault ตั้ง `notbit_indexer_url` เป็น HTTPS URL ของเว็บตามด้วย `/api/v1/internal/indexer` และ `notbit_indexer_secret` ให้ตรงกับ `INDEXER_SECRET` ของเว็บ ไม่ใช้ local Docker bridge บน Cloud
- Scheduler ส่ง POST ไป Next Route Handler เดิมโดยตรง จึงไม่ต้องมี Edge Function ตัวกลาง หน้าแผนที่ระบุ Edge Function ควรอ่านร่วมกับสถาปัตยกรรมที่ติดตั้งจริงนี้
- ตั้ง CORS/บริการ Storage ให้เบราว์เซอร์เรียก upload URL ของโปรเจกต์ได้ แล้วตรวจขนาดไฟล์บน Preview จริงอีกครั้ง นี่เป็นงาน deployment/acceptance ที่ยังไม่ทำในรอบ local นี้

## รายละเอียด uploads และการกู้เมื่อผิดพลาด

- API `POST /api/v1/uploads` ตรวจ trading session และ ownership ของ listing/order/conversation ก่อนออก signed upload URL เส้นทางเป็น path ใหม่เสมอ ไม่ใช้ upsert
- ticket ใช้ได้ 15 นาทีและใช้ finalize ได้ครั้งเดียว ผูก user, purpose, scope, content type, ขนาด และ keccak256 ของ bytes เดิม
- เพิ่ม grants เฉพาะ service role และปิด RLS ต่อ browser; จำกัดการออก ticket 30 รายการต่อผู้ใช้ต่อ 10 นาทีด้วย advisory lock ใน transaction
- UI listing/evidence/chat ส่ง bytes ไป Storage โดยตรง จากนั้นส่ง JSON ขนาดเล็กไป web API ภาพประกาศเผยแพร่หลัง decode สำเร็จเท่านั้น; หลักฐานและรูปแชทปลายทางยังเป็น private
- หาก finalize ล้มเหลวหลังใช้ ticket แล้ว ให้กดอัปโหลด/บันทึกอีกครั้ง UI จะออก ticket ใหม่ ห้ามนำ ticket เดิมไปใช้กับออเดอร์อื่น
- token upload ของ Storage มีอายุ 2 ชั่วโมง จึงเก็บ staging object ไว้จน ticket หมดอายุเกิน 2 ชั่วโมงก่อน cleanup เพื่อไม่เปิดให้เขียนทับ path ระหว่าง token ยังใช้ได้ Indexer ลบ staging เก่าเป็นชุดละไม่เกิน 20 รายการต่อรอบ
- วิธี multipart เดิมยังรองรับ client เก่า แต่ UI ทั้งสามส่วนใช้ direct Storage แล้ว หากเรียก multipart ขนาดใหญ่ผ่าน Vercel โดยตรงยังติด platform limit ได้
- ถ้า Cron มี run succeeded แต่ข้อมูลไม่ตามเชน ให้ตรวจ HTTP status ของ `net._http_response` ด้วย เพราะ pg_net ส่ง HTTP แบบ asynchronous; ตรวจ checkpoint, RPC และ gas ของ sender ต่อ อย่าอ่านแค่ cron run status

## ผลตรวจ

- TypeScript ผ่าน; Vitest ผ่าน 25 tests / 11 files รวม configuration, decode รูปจริง และ service-only ticket/quota/single-use
- Supabase local Security Advisors: ไม่พบปัญหา
- Integration check ใช้ Web3 Auth จริงและ HTTP API/Storage จริง; ลบเฉพาะข้อมูลและไฟล์ diagnostic ตาม manifest หลังทดสอบ
- Production Webpack build ผ่าน (มี warning จาก dynamic dependency ของ upstream `ox/viem`); Playwright Microsoft Edge ผ่าน 6 tests บน production build ใน app directory แยก โดยไม่หยุดเว็บ local

ยังไม่ได้สาธิต `confirmDelivery/confirmReceipt` หรือ escalation ของออเดอร์จริงบน Sepolia ในรอบนี้ เพราะไม่มีออเดอร์ค้างสำหรับทดสอบ การตั้ง signer/sender และการลงนาม/เติม gas ผ่านแล้ว ส่วนการซื้อขายเต็มเส้นทางอยู่ในรายการตรวจรับถัดไป ไม่ถือว่าปิดงานทั้งสามคนทั้งหมด
