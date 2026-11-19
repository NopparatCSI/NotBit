# คู่มือ Cron และการกู้ระบบ

## การทำงานปกติ

Supabase Cron เรียก `marketplace_private.invoke_indexer()` ทุกนาที โดยอ่าน URL และ bearer secret จาก Vault ชื่อ `notbit_indexer_url` และ `notbit_indexer_secret` แอปตรวจ bearer ก่อนอ่าน confirmed events ของ chain/Contract ที่ตั้งค่าไว้

ตรวจ job ว่า active, `cron.job_run_details` ว่า succeeded และ `net._http_response` ว่า HTTP 200 การสำเร็จของ SQL job เพียงอย่างเดียวไม่ยืนยันว่า HTTP หรือ indexer สำเร็จ ตรวจ checkpoint ว่าเดินหน้าและออเดอร์ตรงกับ Contract ด้วย

Preview ที่มี Vercel Authentication ต้องให้ Cron ผ่านช่องทาง automation ที่ได้รับอนุญาต การส่ง `INDEXER_SECRET` อย่างเดียวผ่านหน้าป้องกันของ Vercel ไม่ได้ และไม่ควรปิด Deployment Protection เพื่อให้ทดสอบผ่าน

ใช้ Automation Bypass เฉพาะ project `nopparatcsis-projects/notbit` หลังได้รับอนุมัติ เก็บใน Vault ชื่อ `notbit_vercel_bypass` พร้อม `notbit_vercel_origin` ซึ่งต้องเป็น origin ของ Preview ที่ทดสอบ เช่น `https://<deployment>.vercel.app` ตั้ง `notbit_indexer_url` เป็น origin เดียวกันต่อด้วย `/api/v1/internal/indexer` ฟังก์ชันปฏิเสธ origin ที่ไม่ตรงก่อนส่ง credential และยังต้องตรวจ `INDEXER_SECRET` ที่แอปตามเดิม ห้ามใส่ token ใน query string, log หรือเอกสารนี้

หากเปลี่ยน deployment ให้ปรับทั้ง origin และ URL พร้อมกันใน transaction เดียว ตรวจ HTTP 200 และ checkpoint หลังปรับ ค่า bypass ใช้ได้เฉพาะโปรเจกต์ที่ออกให้ เก็บในไฟล์ local ที่ Git ignore สำหรับการทดสอบด้วย browser และถอนสิทธิ์ใน Settings → Deployment Protection → Protection Bypass for Automation เมื่อเลิกใช้ Preview

## ลำดับกู้เหตุขัดข้อง

1. ยืนยัน chain ID, Contract, start block, deployment tx, Supabase project และบทบาทจาก environment ของ deployment นั้น ตรวจด้วย `npm run release:check` สำหรับไฟล์ `.env.preview.local`
2. ตรวจ RPC ว่าต่อ Sepolia ได้และอ่าน block ล่าสุดได้ แก้ rate limit/timeout แล้วเรียก indexer ใหม่ผ่าน bearer ที่เก็บเป็น secret
3. ให้ indexer อ่านต่อจาก `chain_checkpoints` ไม่ลบ checkpoint หรือ events เพื่อเริ่มใหม่โดยไม่ตรวจสาเหตุ การอ่าน event ซ้ำมี unique key และ projection ถูกปรับพร้อม checkpoint
4. หลัง restart ตรวจ submitted staff transactions; reconciliation เติม audit ที่ขาดจาก confirmed events โดยไม่ส่งคำตัดสินซ้ำ
5. หากเกิด reorg รอให้โหนดตอบ canonical blocks ได้ ระบบย้อนถึงบล็อกร่วมแล้ว replay ข้อความสถานะที่อ้าง event เก่าจะถูกลบ ส่วนแชทและ audit เดิมยังอยู่ พร้อม TRANSACTION_REORGED
6. หากมีเงินฝากยืนยันแต่ UI รอซิงก์ ตรวจ funding event และออเดอร์ projection ก่อน ไม่ให้ผู้ซื้อฝากอีกครั้ง
7. ถ้า escalation ส่งไม่ได้ ตรวจ gas ของ sender และสิทธิ์ RPC เงินยังคง escrow และ Contract ปฏิเสธเส้นทางปกติตั้งแต่ถึง deadline

อย่านำ private keys, bearer tokens, signed URLs หรือ auth cookies ไปใส่ issue/log/report สรุปเพียง transaction hash, block/checkpoint, error code และชื่อค่าตั้งค่าที่ขาด

## สำรองและ rollback

- เก็บ migration history, public deployment metadata และข้อมูลธุรกรรมที่ยืนยันแล้ว เก็บ keys แยกจาก Git
- ถ้า rollback เฉพาะเว็บ ให้ใช้ deployment ก่อนหน้าที่รองรับ schema และ Contract เดียวกัน ไม่ย้อน destructive migration อัตโนมัติ
- Contract แก้ code หรือบทบาทย้อนหลังไม่ได้ การเปลี่ยน Contract ต้องคงช่องทางดูแลออเดอร์และถอนเงินของรุ่นเดิม
- แยก Preview และ local secrets; ห้ามนำ key ที่เคยปรากฏใน log กลับมาใช้กับระบบออนไลน์รุ่นใหม่

## เกณฑ์ก่อน merge main

ต้องมี typecheck/unit/Contract/build ผ่าน, Preview test ที่ระบุ deployment กับ commit, หลักฐาน MetaMask/Sepolia ตามข้อ 25, source verification ตามข้อ 26 และรายการ demo ที่ไม่มีสถานะปลอม หากข้อมูลใดไม่ครบ ให้บันทึกว่ายังค้างและเก็บ candidate branch ไว้
