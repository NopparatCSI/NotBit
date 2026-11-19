# NOTBIT Design System

มาตรฐาน UI ของตลาดไอเทมเกม NOTBIT สำหรับทุกคนที่แก้หน้าเว็บ ค่าด้านล่างอ้างอิงหน้าร้านและหน้า Wallet ที่ใช้งานอยู่ เมื่อเปลี่ยนสี ขนาด หรือพฤติกรรมร่วม ให้อัปเดตโค้ดต้นทางกับเอกสารนี้ในงานเดียวกัน

## ภาพรวมและแหล่งอ้างอิงในโปรเจกต์

- ใช้ภาพเกมเต็มขอบจอใน **Game Spotlight** และให้พื้นที่ **Item Store** เป็นพื้นเรียบเพื่อเน้นการค้นหา หมวดหมู่ และภาพไอเทม
- Dark ใช้ดำ ขาว เทา Sci-Fi ใช้พื้นม่วงเข้ม ปุ่มม่วง–ชมพู ไซแอนสำหรับ focus เขียวสำหรับการเลือก และเหลืองสำหรับราคา
- ใช้ชื่อแบรนด์ **NOTBIT** ตัวพิมพ์ใหญ่ ภาษาใน UI เป็นอังกฤษ `<html lang="en">` และชื่อแท็บเป็น `NOTBIT | Game Item Marketplace`

| เรื่อง | จุดที่ Dev ใช้ร่วมกัน |
| --- | --- |
| สี ฟอนต์ เลย์เอาต์ และ motion | [src/app/globals.css](src/app/globals.css) |
| หัวเว็บ แบรนด์ metadata และการคืนค่าธีมก่อนแสดงผล | [src/app/layout.tsx](src/app/layout.tsx) |
| ปุ่มและการรวม Tailwind classes | [Button](src/components/ui/button.tsx) · [cn](src/lib/utils.ts) |
| ไอคอน โลโก้ และ favicon | [MarketplaceIcon](src/components/marketplace-icon.tsx) · [icon.svg](src/app/icon.svg) |
| ธีมและแถบเลือกเกม | [ThemeToggle](src/components/theme-toggle.tsx) · [GameSpotlight](src/components/game-spotlight.tsx) |
| แค็ตตาล็อก หมวด และภาพของแต่ละเกม | [GameCatalog](src/components/game-catalog.tsx) · [หน้าแรก](src/app/page.tsx) · [ภาพในโปรเจกต์](public/marketplace/) |
| หน้าบัญชี | [Account](src/app/account/page.tsx) · [WalletAccount](src/components/wallet-account.tsx) |
| หน้าผู้ดูแล | [Admin shell](src/components/admin/shell.tsx) · [Review queue](src/components/admin/review-queue.tsx) · [Order review](src/components/admin/order-review.tsx) · [Staff history](src/components/admin/history.tsx) · [Super Admin](src/components/admin/super-admin.tsx) |

## แบรนด์และไอคอน

- โลโก้หัวเว็บใช้เครื่องหมาย **N** ทรงเรขาคณิตตัดเฉียงจาก `MarketplaceIcon name="notbit"` คู่กับตัวอักษร **NOTBIT** ให้ทั้งชุดเป็นลิงก์ไป `/` และมีชื่อสำหรับโปรแกรมอ่านหน้าจอ `NOTBIT home`
- เครื่องหมายในหัวเว็บขนาด `24 × 24px` ใช้สีข้อความหลักใน Dark และ `--primary` ใน Sci-Fi เว้นระยะจากชื่อเว็บ `0.55rem`
- Wordmark ใช้ขนาด `1.125rem` น้ำหนัก `600` และระยะระหว่างตัวอักษร `0.145em`
- Favicon ใช้เครื่องหมาย N รูปเดียวกันบนพื้น `#171717` ขนาด `32 × 32px` มุม `7px` และสีเครื่องหมาย `#f5f5f5`
- ไอคอน UI เดิมใช้ `MarketplaceIcon` ขนาด `20 × 20px` บน `viewBox="0 0 24 24"` เส้น `1.65px` สี `currentColor` ปลายเส้นและมุมมน ไอคอนตกแต่งใช้ `aria-hidden` และปุ่มมีชื่อที่บอกการทำงาน

## ธีมและสี

ธีมที่รองรับคือ **Dark** `dark` และ **Sci-Fi** `scifi` อ่านธีมจาก `document.documentElement.dataset.theme` เริ่มที่ Dark และใช้ `color-scheme: dark` ทั้งคู่ ค่า `scifi` ที่บันทึกใน `localStorage` จะถูกคืนก่อนแสดงหน้า ส่วนค่าเดิมจาก Light ใช้ Dark เป็นค่าเริ่มต้น คีย์เดิมที่ใช้เก็บการตั้งค่าคือ `orbit-color-theme`

ตัวเลือกธีมเป็นปุ่มไอคอนเดียว `Button variant="quiet" size="icon"` ที่หัวเว็บ ไอคอนแสดงธีมปัจจุบัน และชื่อสำหรับโปรแกรมอ่านหน้าจออธิบายผลของการกด

| ธีมปัจจุบัน | ไอคอน | ชื่อปุ่มสำหรับการเข้าถึง |
| --- | --- | --- |
| Dark | พระจันทร์ `moon` | `Switch to Sci-Fi mode` |
| Sci-Fi | ประกายดาว `sparkles` | `Switch to dark mode` |

| CSS variable | Dark | Sci-Fi | การใช้งาน |
| --- | --- | --- | --- |
| `--background` | `#101010` | `#1a142c` | พื้นหลัก |
| `--foreground` | `#f5f5f5` | `#faf6ff` | ข้อความหลัก |
| `--card` | `#181818` | `#271d3b` | พื้นช่องค้นหาและคอมโพเนนต์ |
| `--border` | `#363636` | `#624c82` | เส้นแบ่งและขอบทั่วไป |
| `--input-border` | `#656565` | `#6386a4` | ขอบช่องค้นหา |
| `--primary` | `#ededed` | `#c39aff` | ปุ่มหลักและสีเครื่องหมายแบรนด์ใน Sci-Fi |
| `--primary-foreground` | `#171717` | `#201230` | ตัวอักษรบนปุ่มหลัก |
| `--muted` | `#242424` | `#30224d` | พื้น hover ของปุ่มรอง |
| `--muted-foreground` | `#b4b4b4` | `#d4c8e8` | คำอธิบายและข้อมูลรอง |
| `--destructive` | `#ffaaa2` | `#ffaaa2` | ข้อความผิดพลาด |
| `--ring` | `#d4d4d4` | `#83efff` | Focus ที่เห็นชัด |
| `--selection` | ใช้สีข้อความในพื้นผิว | `#8bffb8` | หมวดและเกมที่เลือกใน Sci-Fi |
| `--price` | ตัวเลขใช้ `--foreground` หน่วยใช้ `--muted-foreground` | `#f2ff82` | ราคาและหน่วย ETH ใน Sci-Fi |
| `--signal` | ไอคอนค้นหาใช้ `--muted-foreground` | `#83efff` | เส้นไฮไลต์และไอคอนค้นหา Sci-Fi |
| `--highlight` | ใช้สีหลักตามคอมโพเนนต์ | `#ff9cda` | ชมพูที่ใช้ไล่สีใน Sci-Fi |
| `--success` | `#a1dfb0` | `#8bffb8` | Badge ของคำตัดสินที่ยืนยันแล้วและบทบาทที่ตรงกัน |
| `--warning` | `#f1ce87` | `#f2ff82` | Badge ของงานรอตรวจหรือการพักฝากเงิน โดยมีข้อความประกอบเสมอ |

ใช้คลาส Tailwind ตามบทบาท เช่น `bg-background`, `text-foreground`, `bg-card`, `text-muted-foreground`, `border-border` และ `outline-ring` ค่าสีประกอบภาพและเอฟเฟกต์เฉพาะธีมให้ใช้ selector กลางใน `globals.css`

### ไล่สีและพื้นผิว

ค่าด้านล่างเป็นค่า CSS จากโค้ด โดยรายการไล่สีหลายชั้นเรียงจากชั้นที่อยู่หน้าสุดไปด้านหลัง

| พื้นผิว | ค่าที่ใช้ |
| --- | --- |
| พื้นหน้า Sci-Fi | `radial-gradient(ellipse at 1% 84%, #733aa033, transparent 53%), radial-gradient(ellipse at 98% 90%, #28556655, transparent 49%)` |
| หัวเว็บ Sci-Fi | `linear-gradient(110deg, #3b2456, #281d44 42%, #183945)` |
| เส้นใต้หัวเว็บ Sci-Fi | สูง `2px` ไล่จาก `--primary` → `--highlight` → `--signal` → `--selection` → `--price` ที่ `90deg` |
| แผ่นทับภาพ Spotlight ใน Dark | `linear-gradient(90deg, #060606ed 0%, #080808b8 32%, #08080826 72%, transparent), linear-gradient(0deg, #0808088c, transparent 34%)` |
| แผ่นทับภาพ Spotlight ใน Sci-Fi | `linear-gradient(90deg, #231332f2 0%, #2f1a4dba 33%, transparent 80%), linear-gradient(0deg, #1b11279c, transparent 58%), linear-gradient(113deg, #7f39bd3b 8%, #e773c34a 44%, #60d7ff54 74%, #6dffc34d)` |
| แถบเลือกเกมใน Dark | ขอบบน `#ffffff26` พื้นเบลอ `#0c0c0c9c` พื้นสำรอง `#0c0c0ce6` |
| แถบเลือกเกมใน Sci-Fi | ขอบบน `#d0bdff40` พื้นเบลอ `#251837bd` พื้นสำรอง `#251837eb` |
| เกมที่เลือกใน Sci-Fi | ขีดล่าง `2px` ไล่ `--signal` → `--selection` → `--price` ที่ `90deg` และพื้น `linear-gradient(0deg, #85eecb25, transparent 86%)` |
| ปุ่ม Browse game items ใน Sci-Fi | `linear-gradient(110deg, var(--primary), #eba1ff 57%, var(--highlight))` เงา `0 0 22px #c39aff55` |
| ปุ่ม Browse game items เมื่อ hover ใน Sci-Fi | `linear-gradient(110deg, #d2b0ff, #f1b6ff 57%, #ffb4e4)` |
| การ์ดสินค้าใน Sci-Fi | พื้น `linear-gradient(110deg, #2d2148, #201d3b) padding-box` และขอบ `linear-gradient(110deg, #8b63cc, #70569a 48%, #578ea1) border-box` |

Blur ใช้ `backdrop-filter: blur(12px)` ที่พื้นแถบเลือกเกม ภาพหลักกับข้อความเกมแสดงคมชัดทั้งสองธีม

## ตัวอักษร

ฟอนต์หลักคือ `Kantumruy Pro, Tahoma, system-ui, sans-serif` โหลด Kantumruy Pro ชุด Latin น้ำหนัก `400` และ `600` จาก Fontsource ตาม [layout.tsx](src/app/layout.tsx)

| ตำแหน่ง | ขนาดและน้ำหนัก | รายละเอียด |
| --- | --- | --- |
| ชื่อเกมใน Spotlight | `clamp(2.5rem, 6.4vw, 5.6rem)` / `600` | line-height `0.99` tracking `-0.06em` ตัดบรรทัดแบบ balance |
| ป้าย Game Spotlight | `0.75rem` / `600` | ตัวพิมพ์ใหญ่ tracking `0.15em` สี `#e2e2e2` หรือ `#f3c7fd` ใน Sci-Fi |
| คำอธิบาย Spotlight | `clamp(0.9rem, 2vw, 1.12rem)` | สี `#e2e2e2` |
| ชื่อเกมในแถบเลือก | `0.8125rem` และ `0.9375rem` ที่ `≥900px` / `600` | line-height `1.18` สี `#d5d5d5` และ `#fff` เมื่อเลือกหรือ hover |
| หัวข้อ Item Store | `clamp(1.65rem, 3vw, 2.25rem)` / `600` | line-height `1.1` tracking `-0.045em` |
| ชื่อเกมใต้ Item Store | `0.875rem` / `600` | `--muted-foreground` เว้นจากหัวข้อ `0.2rem` |
| หัวข้อ Sample listings | `1.125rem` / `600` | จำนวนผลอยู่ข้างหัวข้อ ขนาด `0.75rem` ใช้ tabular numbers |
| ชื่อไอเทม | `clamp(0.9rem, 2vw, 1.125rem)` / `600` | line-height `1.25` |
| ประเภทไอเทมและราคา | `0.8125rem` | ประเภทใช้สีรอง ราคาใช้ `600` กับ tabular numbers |
| ลิงก์ Item Store ในหัวเว็บ | `0.875rem` | ใช้สีรองและเปลี่ยนเป็นสีข้อความหลักเมื่อ hover |
| สถานะ Sepolia testnet | `0.75rem` | ใช้สีรอง |
| หัวข้อ Wallet account | `text-4xl font-semibold tracking-tight` | ใช้ `h1` |
| Wallet address | `font-mono text-sm break-all` | ใช้สีรอง ตัดบรรทัดได้บนจอเล็ก |

## เลย์เอาต์และ responsive

ใช้ `.page-width` จัดแนวทุกส่วน กว้างสูงสุด `82rem` และอยู่กึ่งกลาง ที่จอเล็กใช้ `width: min(100% - 2rem, 82rem)` ที่ `≥640px` ใช้ `width: min(100% - clamp(3rem, 9vw, 10rem), 82rem)` ภาพ Spotlight และพื้นแถบเลือกเกมกว้างเต็ม viewport โดยวางข้อความและปุ่มไว้ใน `.page-width`

| จุดเปลี่ยน | ผลกับหน้าเว็บ |
| --- | --- |
| `≤539px` | Spotlight ใช้ภาพครอปสำหรับมือถือ |
| ต่ำกว่า `640px` | ช่องค้นหาอยู่ใต้ชื่อร้าน กริดสินค้ามี 2 คอลัมน์ หัวเว็บแสดง Testnet แบบสั้น |
| `≥640px` | หัวร้านแบ่ง `1fr minmax(0, 23rem)` ชื่อร้านอยู่ซ้าย ช่องค้นหาอยู่ขวา กริดสินค้ามี 3 คอลัมน์ หัวเว็บแสดงลิงก์ Item Store กับข้อความ Sepolia testnet แบบเต็ม |
| ต่ำกว่า `900px` | แถบเลือกเกมแบ่ง 3 คอลัมน์ |
| `≥900px` | แถบเลือกเกมแบ่ง 6 คอลัมน์ |

| ส่วน | ความสูง ระยะห่าง และรูปทรง |
| --- | --- |
| หัวเว็บ | สูงอย่างน้อย `4rem` เส้นล่าง `1px` ช่องระหว่างกลุ่ม `0.5rem` |
| ลิงก์ Item Store ในหัวเว็บ | สูงอย่างน้อย `2.75rem` เส้นแบ่งซ้าย `1px` padding ซ้าย `1.75rem` |
| Spotlight stage | สูงอย่างน้อย `clamp(19rem, 31vw, 29rem)` padding แนวตั้ง `clamp(2.25rem, 5vw, 4.5rem)` เนื้อหาจัดกึ่งกลางแนวตั้ง |
| ข้อความ Spotlight | กว้างสูงสุด `36rem` ช่องไฟ `0.7rem` ปุ่มเว้นด้านบนเพิ่ม `0.4rem` |
| แถบเลือกเกม | padding แนวตั้ง `0.5rem` ช่องระหว่างแถว `0.2rem` คอลัมน์ `clamp(0.35rem, 1.7vw, 1.5rem)` |
| ปุ่มเลือกเกม | อย่างน้อย `44px` padding `0.35rem 0.2rem` ขีดล่าง `2px` จัดข้อความกึ่งกลางและตัดบรรทัดได้ |
| หัวร้าน | เส้นแบ่งบน `1px` ช่องไฟ `0.85rem 2rem` padding บน `clamp(1rem, 2.7vw, 1.8rem)` และล่าง `0.65rem` |
| ช่องค้นหา | สูงอย่างน้อย `48px` มุม `4px` ขอบ `1px` ช่องระหว่างไอคอนกับอินพุต `0.625rem` |
| แถบหมวดไอเทม | ตัดขึ้นบรรทัดใหม่ได้ ช่องคอลัมน์ `clamp(0.45rem, 2.2vw, 2rem)` และเส้นล่าง `1px` |
| แถวหัวข้อผลค้นหา | gap `0.25rem 0.65rem` margin บน `1rem` และล่าง `0.65rem` |
| กริดไอเทม | gap `clamp(0.6rem, 2vw, 1.3rem)` ภาพสินค้าอัตราส่วน `1.36:1` |
| การ์ดใน Dark | เส้นล่าง `1px` เว้นด้านล่าง `0.65rem` |
| การ์ดใน Sci-Fi | ขอบไล่สี `1px` มุม `8px` และ padding แนวนอนของข้อมูล `0.65rem` |
| ข้อมูลในการ์ด | เว้นเหนือข้อความ `0.65rem` gap `0.3rem 0.8rem` วางราคาชิดขวาเมื่อมีที่พอ ตัดขึ้นบรรทัดได้ |
| สถานะไม่มีผลค้นหา | สูงอย่างน้อย `9rem` จัดข้อความกับปุ่มชิดซ้าย gap `0.75rem` |
| ท้าย Item Store | padding ล่าง `clamp(2.5rem, 6vw, 5rem)` |
| หน้า Wallet | ใช้ `.page-width` ระยะบน–ล่าง `3rem` เพิ่มเป็น `4rem` ที่ `≥640px` gap `1.5rem` ส่วน Wallet settings กว้างสูงสุด `max-w-xl` มีเส้นบน `1px` padding บน `1.5rem` และ gap `1rem` |

## คอมโพเนนต์และพฤติกรรม

### ปุ่มและอินพุต

ใช้ `Button` ใน `@/components/ui/button` กับ Radix `asChild` เมื่อตัวจริงเป็นลิงก์ ใช้ `cn()` รวมคลาสตามสถานะ ใช้ `data-icon="inline-start"` หรือ `"inline-end"` สำหรับไอคอนคู่ป้ายข้อความ

| Variant | ใช้กับ | รูปแบบ |
| --- | --- | --- |
| `default` | Sign in with MetaMask และปุ่มหลักทั่วไป | พื้น `--primary` ข้อความ `--primary-foreground` มุม `rounded-lg` และ hover ที่ `85%` |
| `hero` | Browse game items | รูปทรง pill ใช้พื้นหลัก และใช้ gradient ประจำ Sci-Fi เมื่อเปิดธีมนั้น |
| `outline` | Clear filters และ Sign out | พื้น `--card` ขอบ `--border` และ hover `--muted` |
| `quiet` | สลับธีม ล้างค้นหา และลิงก์ Wallet | รูปทรง pill พื้นโปร่ง และ hover `--muted` |
| `filter` | หมวดไอเทม | มุมเหลี่ยม ตัวอักษร `12px` แล้วเพิ่มเป็น `14px` ที่ `≥640px` เมื่อเลือกจะมีขีดล่าง `2px` และใช้สีเขียวใน Sci-Fi |

- ปุ่มพื้นฐานสูงอย่างน้อย `44px` gap `8px` ตัวอักษร `14px` น้ำหนัก `600` สถานะ disabled ใช้ opacity `50%` และสถานะ focus ใช้ขอบ `2px` offset `4px`
- `size="default"` ใช้ padding แนวนอน `16px` แนวตั้ง `8px` `compact` ใช้แนวนอน `4px` และเพิ่มเป็น `16px` ที่ `≥640px` `icon` ใช้ `44 × 44px` `text` ใช้แนวตั้ง `8px` และแนวนอน `0`
- ช่องค้นหาใช้ `input type="search"` มี label ตามเกม `Search items in {game}` และ placeholder `Search items` ใช้ปุ่ม `Clear search` เมื่อมีคำค้น และคืน focus ให้ช่องค้นหาเมื่อกดล้าง

### Game Spotlight และ Item Store

- ใช้ Radix `Tabs` แนวนอนสำหรับเลือกเกม โดยเริ่มที่ **Warframe** การคลิกหรือใช้แป้นลูกศรเปลี่ยนภาพ ชื่อเกม และคำอธิบาย ใช้ `h1` สำหรับ Game Spotlight แบบซ่อนไว้ให้โปรแกรมอ่านหน้าจอ และ `h2` สำหรับชื่อเกมที่แสดง
- ลิงก์ **Browse game items** ไปที่ `#marketplace` หัวร้านมี **Item Store** และชื่อเกมที่เลือกบนพื้นเรียบ ตัวเลือกเกมเป็นแถบข้อความ
- เปลี่ยนเกมแล้วให้เปิด **All items** ของเกมใหม่พร้อมล้างคำค้น หมวดใช้ Radix `ToggleGroup` แบบเลือกได้ทีละค่า และรายชื่อหมวดมาจาก `game.itemTypes` ของเกมนั้น
- ค้นจากชื่อและประเภทไอเทมของเกมปัจจุบัน ใช้จำนวนผลแบบ `role="status"` และแสดง **Clear filters** เมื่อผลว่าง
- ลำดับข้อมูลในการ์ดคือ ภาพไอเทม → ชื่อและประเภท → ราคา ETH ป้าย **Sample listings** ใช้ระบุรายการสาธิต
- หน้า Wallet ใช้ป้ายสถานะ `Waiting for MetaMask…` ระหว่างรอ ใช้ `role="alert"` กับข้อผิดพลาด และใช้สี `--destructive`

## ภาพและ motion

| ภาพ | วิธีใช้ |
| --- | --- |
| Spotlight จอกว้าง | `<slug>-spotlight.webp` ขนาดอ้างอิง `2880 × 930px` หรือ `1920 × 620px` สำหรับ Team Fortress 2 อัตราส่วนประมาณ `3.10:1` |
| Spotlight มือถือ | `<slug>-spotlight-mobile.webp` ครอปแยก ขนาดอ้างอิง `850 × 924px` หรือ `570 × 620px` สำหรับ Team Fortress 2 |
| การแสดงภาพ Spotlight | ใช้ `<picture>` และ `getImageProps` ภาพมือถือใช้ที่ `≤539px` ภาพกว้างใช้ `sizes="(max-width: 899px) 1280px, 100vw"` และภาพมือถือใช้ `sizes="100vw"` ตั้ง `object-fit: cover` และ `object-position: center 30%` ให้ภาพต่อเนื่องใต้แถบเลือกเกม |
| ภาพไอเทม | ใช้ Next.js `Image` แบบ `fill` ในกรอบอัตราส่วน `1.36:1` ใช้ `object-fit: cover` และ `sizes="(min-width: 1360px) 430px, (min-width: 640px) 32vw, 50vw"` |

ใช้ภาพ WebP ใน [public/marketplace](public/marketplace/) และจับคู่ไฟล์ที่ [src/app/page.tsx](src/app/page.tsx) โหลดภาพ Spotlight ของเกมที่แสดงด้วย `eager` และ `fetchPriority="high"` ส่วนภาพสินค้าใช้การโหลดตามค่าเริ่มต้นของ Next.js ภาพตกแต่งที่มีชื่อเกมหรือชื่อไอเทมกำกับใช้ `alt=""` ใช้ alt ที่อธิบายข้อมูลสำหรับภาพที่สื่อความหมายด้วยตัวเอง

| การตอบสนอง | ค่า |
| --- | --- |
| เปลี่ยนเกมใน Spotlight | ข้อความเข้าจาก opacity `0.55 → 1` และ `translateY(0.2rem → 0)` ใน `200ms ease-out` |
| Hover ปุ่ม Spotlight | ลูกศรขยับ `0.2rem` ใน `180ms ease` |
| Hover ภาพสินค้า | ขยาย `1.04` ใน `220ms ease-out` |
| สถานะลิงก์หัวเว็บและแถบเกม | เปลี่ยนสีหรือขอบใน `160ms ease` |
| Reduced motion | ใช้การเคลื่อนไหวด้านบนเมื่อผู้ใช้อนุญาต motion และลด animation/transition เป็น `0.01ms` เมื่อเปิด `prefers-reduced-motion: reduce` |

## เกณฑ์ตรวจ UI ก่อนส่งงาน

- เปิดหน้าใน **Dark และ Sci-Fi** ที่ `320px`, `375px`, `768px`, `900px` และ `1440px` เพื่อตรวจความกว้าง แถบเกม จำนวนคอลัมน์ และการตัดข้อความ
- ตรวจ contrast ของข้อความปกติอย่างน้อย `4.5:1` และข้อความขนาดใหญ่อย่างน้อย `3:1` ให้ตรวจบนภาพจริงของแต่ละเกมและในสถานะ hover, focus และ selected
- ใช้ focus ที่เห็นชัด ปุ่มไอคอนมีชื่อ และสถานะเลือกมีขีดล่างหรือสัญญาณอื่นประกอบสี ตรวจ `Skip to content`, การใช้ Tab/ลูกศร และ reduced motion
- ลองสลับเกมแล้วตรวจภาพ หมวด คำค้น จำนวนผล สถานะผลว่าง และลิงก์ไปยังร้าน ตรวจว่าไอคอนตรงธีมก่อนและหลังรีเฟรช
- รัน `npm run typecheck` และ `npm run test:e2e` ตาม [README](README.md#ทดสอบ) โดยใช้ [ชุดทดสอบหน้าเว็บ](tests/e2e/foundation.spec.ts) เป็นจุดอ้างอิงของพฤติกรรมร่วม


## Staff console — Developer 3

- ใช้ภาษาอังกฤษและธีมเดียวกับหน้าร้าน ไม่เพิ่มธีมใหม่หรือภาพพื้นหลังที่รบกวนการตรวจหลักฐาน
- ใช้ `.page-width` เดิม ที่จอ `1100px` ขึ้นไปแบ่งเมนูซ้าย `13rem` กับเนื้อหา เมนูมี `aria-current="page"` และขอบร่วมกับสีเพื่อระบุหน้าปัจจุบัน
- ต่ำกว่า `640px` เมนูเป็นกริดไอคอน/ข้อความ แตะได้อย่างน้อย `44px` ส่วนแผงข้อมูลใช้ขอบ `--border` พื้น `--card` มุม `12px`; ปุ่มและตัวเลือกใช้มุม `8px`
- หัวข้อหน้าใช้ `clamp(1.8rem, 3vw, 2.5rem)` น้ำหนัก `600` และ tracking `-0.045em` ข้อมูลเงินใช้ tabular numbers และ `--price` ใน Sci-Fi
- คิวงานมีสรุปจากข้อมูลจริง แท็บ In review / Overdue / Resolved และค้นหาภายในคิวที่เลือก สถานะว่างอธิบายว่าจะมีข้อมูลเมื่อใด ไม่มีปุ่มที่ยังไม่ทำงาน
- หน้าตรวจออเดอร์แยกเหตุผล หลักฐาน ข้อตกลง แชท และ timeline ออกจากแผงตัดสิน มีลิงก์ข้ามส่วนสำหรับมือถือ ข้อมูล hash/IDs เปิดดูได้เมื่อจำเป็น
- คำตัดสินมีสองขั้น: เลือกผลและเขียนเหตุผล → ทบทวน → Confirm in MetaMask ย้อนกลับไปแก้ได้โดยข้อความไม่หาย การกด Review decision ยังไม่เรียก API หรือส่งธุรกรรม
- หลักฐานยังต้องกดเพื่อเปิด private URL แสดงกำลังโหลด ตรวจ hash และข้อผิดพลาดแยกแต่ละไฟล์ พร้อมขอลิงก์ใหม่ได้เมื่อรูปหมดอายุ ไม่แสดงรูปส่วนตัวอัตโนมัติ
- หน้า Super Admin แยกสถานะที่อ่านสด สถานะจาก indexer และกรณียืนยันสถานะไม่ได้ ไม่แสดงว่าเปิดรับฝากเมื่อไม่มีข้อมูลยืนยัน
- หน้า Admin อัปเดตทุก 15 วินาทีเมื่อหน้า visible และคงปุ่ม Refresh ไว้ การอัปเดตต้องรักษาข้อความร่างและแท็บที่ผู้ใช้กำลังเปิด
- Conversation แสดงล่าสุดหน้าละ 50 ข้อความ มี Load earlier messages และเปิดรูปแนบผ่านสิทธิ์ staff พร้อม audit
- หลังฝากสำเร็จให้แสดงช่วงกำลังซิงก์ออเดอร์ก่อนเปิด Evidence/Dispute พร้อมข้อความว่าไม่ต้องฝากซ้ำ
- ธุรกรรมผู้ดูแลเก็บ hash ข้าม reload และแสดงสถานะกำลังตรวจสอบเมื่อยังยืนยันผลไม่ได้ ปุ่มส่งซ้ำยังปิดระหว่างรอผล
- หน้า Wallet มี Queued payments แสดงยอดเฉพาะ Wallet ที่ลงชื่อเข้าใช้ พร้อม review/cancel ก่อนถอนผ่าน MetaMask และรอผลครบ 3 confirmations
- ใช้ shadcn Card, Badge, Empty, Alert, Field, RadioGroup, Tabs, Input, Textarea และ Skeleton ที่ปรับเข้ากับ semantic tokens เดิม โดยใช้ MarketplaceIcon ชุดเดียวกัน
- มีสถานะ loading และหน้าข้อผิดพลาดพร้อม Try again ตาม API `retry` ของ Next.js ที่ติดตั้ง

ตรวจหน้าที่มีข้อมูลด้วย fixture แยกจากฐานข้อมูลจริง และตรวจหน้าเข้าถึงผ่านระบบจริงแยกกัน ผลตรวจและข้อจำกัดอยู่ใน [รายงาน UI Dev 3](docs/dev3-ui-qa.md).
