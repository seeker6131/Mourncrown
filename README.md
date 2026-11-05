# Eldergrove Saga — Fantasy Pixel Action RPG (v0.2)

เกม Pixel Action RPG แนวนอนสำหรับ Android (เล่นผ่าน Chrome) สร้างด้วย **Phaser 3 + TypeScript + Vite**

## เล่นเกม
- GitHub Pages: https://seeker6131.github.io/RPG-Newgame/ (หลังเปิด Pages จาก branch `gh-pages`)

## เนื้อหาเวอร์ชันแรก
- แผนที่ป่าแฟนตาซี 110×76 ช่อง: หมู่บ้าน, ทุ่งหญ้า, ป่าเงาจันทร์, สวนมนตรา, ซากวิหารบอส
- ฮีโร่ 1 ตัว (3 ทิศ + กลับด้าน, เดิน/โจมตี/ร่ายเวท/บาดเจ็บ/ตาย) ชุดเกราะ 4 แบบ อาวุธ 5 แบบ เปลี่ยนภาพตามอุปกรณ์จริง
- มอนสเตอร์ 5 ชนิด (สไลม์, เห็ดพิษ, หมาป่าเงา, ก็อบลินพรานยิงธนู, วิญญาณพงไพรยิงเวทติดตาม) + บอส "ผู้พิทักษ์ธอร์นวูด" 2 เฟส
- Manual / Auto Battle, สกิล 4 อย่าง, EXP/Level, STR AGI VIT INT LUK แจกแต้ม
- กระเป๋า 30 ช่อง, สวมอุปกรณ์, ร้านค้า ซื้อ/ขาย, ช่างตีเหล็ก ตีบวก +10
- เควสต์ต่อเนื่อง 6 เควสต์, เซฟอัตโนมัติ + เซฟ/โหลดในเมนู (localStorage)

## v0.2
- มุมมอง Isometric 2.5D ทั้งแผนที่, แม่น้ำ/บ่อจมลงมีตลิ่ง, บ้านไม้ครึ่งปูน 3 มิติ
- ระบบกลางวัน/กลางคืน (1 วัน = 6 นาที) ตะเกียง/หน้าต่างสว่างตอนกลางคืน
- กำแพงหินรอบซากวิหาร, รั้วไม้ล้อมค่ายก็อบลิน, หีบสมบัติ 8 จุด
- เงาใต้ต้นไม้/บ้าน, วงแหวนใต้ฮีโร่และเป้าหมาย, รายละเอียดตัวละครเพิ่ม (ผ้าพันคอ ไฮไลต์ผม กระเป๋าคาดเอว)

## งานภาพ
ภาพทั้งหมด (ตัวละคร มอนสเตอร์ ฉาก ไอคอน เอฟเฟกต์) **สร้างด้วยโค้ดแบบ procedural pixel art** ใน `src/art/` ไม่มีไฟล์ภาพจากภายนอก ไม่มีการคัดลอก asset จากเกมอื่น
เสียงสังเคราะห์ด้วย WebAudio (`src/audio/sfx.ts`)

## โครงสร้าง
| โฟลเดอร์ | หน้าที่ |
|---|---|
| `src/core` | state, save/load, event bus, rng |
| `src/systems` | stats/progression, inventory/equipment/upgrade, quests (pure logic, มี unit test) |
| `src/data` | ไอเทม สกิล มอนสเตอร์ เควสต์ |
| `src/entities` | Hero, Monster (AI/Boss) |
| `src/world` | การสร้างแผนที่ โซน จุดเกิดมอนสเตอร์ |
| `src/art` | pixel art engine + sprite/animation/VFX generator |
| `src/scenes` | Boot, Title, World (combat/VFX), UI (HUD/touch controls) |
| `src/ui` | UI kit ดำทอง และหน้าต่างต่าง ๆ |
| `src/audio` | SFX/เพลง |

## พัฒนา
```
npm install
npm run dev      # เปิดเซิร์ฟเวอร์ทดสอบ
npm test         # unit tests
npm run build    # build -> dist/
npm run build:single  # build ไฟล์ HTML ไฟล์เดียว -> dist-single/
```
เปิด `?preview` เพื่อดูแกลเลอรีภาพทั้งหมด

ควบคุมบนคอม: WASD/ลูกศร เดิน, Space โจมตี, 1-4 สกิล, Q ยา, E คุย
