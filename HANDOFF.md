# HANDOFF — Eldergrove Saga (อ่านไฟล์นี้ก่อนเริ่มงานต่อ)

> ⚠️ **เกมนี้จะเป็นออนไลน์ในอนาคต (ผู้ใช้ย้ำ)** — เขียนตรรกะใน `src/systems/*` แบบ pure, การสุ่มรับ rnd, state เป็น JSON มี version → ดู docs/GAME_DESIGN.md หัวข้อ 9
> ⏸ **สถานะ: ผู้ใช้สั่ง "อย่าเพิ่งทำ"** — กำลังปรึกษาทิศทาง (ล่าเป็นหลัก+หมู่บ้านเป็นเป้าหมาย, เรื่องคำสาป) รอยืนยันก่อนเขียนโค้ดต่อ

อัปเดตล่าสุด: 2026-11-05 · branch `ccr-dcfcac78-b3qj60` (push ที่นี่เท่านั้น)

## ผู้ใช้ / บทบาท
- ผู้ใช้ = Game Director ใช้ Android อย่างเดียว ไม่เขียนโค้ด ไม่จัดการไฟล์ สื่อสารภาษาไทย
- เราทำทุกอย่าง: โค้ด, ภาพ, build, deploy แล้วส่งลิงก์ให้ลองเล่น
- อยากได้สไตล์ **Isometric pixel art โทนอุ่น ละเอียด** (ภาพอ้างอิงจากโฆษณาเกมมือถือ — ห้ามคัดลอก)

## ลิงก์ / Deploy
- GitHub Pages: https://seeker6131.github.io/RPG-Newgame/ (Pages ตั้งเป็น branch `gh-pages` /root แล้ว)
- Workflow `.github/workflows/deploy.yml`: push branch นี้ → test → build → peaceiris push `dist` ไป `gh-pages` → GitHub "pages build and deployment" อัตโนมัติ
- Artifact สำรอง (ไฟล์เดียว): https://claude.ai/artifact/7XwQPwMHyCd66SJPrJmxkM
  - สร้างจาก `npm run build:single` → ตัด `<html><head><body>`/meta charset/viewport ออก (สคริปต์ python ในประวัติ) → publish ด้วย Artifact tool ไปที่ URL เดิม
- github.io เข้าจาก container ไม่ได้ (proxy 403) ตรวจสถานะด้วย `gh api repos/seeker6131/RPG-Newgame/actions/runs?per_page=1`

## Tech
- Phaser 3.90 + TypeScript + Vite 6, vitest (tests/systems.test.ts 10 tests)
- คำสั่ง: `npm test`, `npm run build`, `npm run build:single`, `npx vite --port 5173`
- ทดสอบด้วย Playwright (Pixel 7 landscape) สคริปต์อยู่ใน scratchpad (play.cjs/play2/3/4) — ถ้าหาย ให้เขียนใหม่: เปิดหน้า, tap ปุ่มเริ่ม (กลางจอ y=165/360), ใช้ `window.__game`, `window.__dbg.boss()/info()/save()`, `window.__dbgState()`

## โครงสร้างโค้ด (src/)
- `core/` state (GameState + save v1, `mapVer:2`), save.ts, events.ts (bus/EV), debug.ts (__dbg)
- `systems/` stats, inventory (equip/upgrade), quests — pure logic + unit tests
- `data/` items, skills (4), monsters (5 + boss treant), quests (6)
- `world/mapgen.ts` แผนที่ 110×76 tile, **isometric 2:1** (`iso()`, `unIso()`, ISO_HW=16, ISO_HH=8), โซน, spawn, หีบ (CHEST_SPOTS/LOOT), กำแพง, ค่ายก็อบลิน
- `art/` procedural pixel art: pixel.ts, heroArt, monsterArt, worldArt, iconArt, isoArt (พื้น iso + บ้าน/รั้ว/กำแพง/หีบ), textures.ts
- `art/aiAssets.ts` **ใหม่**: โหลดภาพ AI จาก `src/assets/ai/*.png` (import.meta.glob) แล้ว `applyAiArt()` แทนที่ texture เดิม (alias)
- `scenes/` Boot (preload AI + generate), Title, World (เกมหลัก/combat/VFX/กลางวันกลางคืน/หีบ), UI (HUD/จอย/ปุ่ม), Preview (`?preview`)
- `ui/` kit (ดำทอง), panels (กระเป๋า/สเตตัส/เควสต์/เมนู/คุย NPC/ร้าน/ตีบวก)

## สิ่งที่เสร็จแล้ว
- v0.1 เกมเล่นได้ครบ: Manual/Auto, 4 สกิล, EXP/stat, กระเป๋า/อุปกรณ์/ตีบวก, ร้าน, 6 เควสต์, บอส 2 เฟส, เซฟ/โหลด
- v0.2 isometric + ตลิ่งน้ำ, บ้าน iso, กลางวัน/กลางคืน (6 นาที), กำแพงหิน/รั้วไม้, หีบ 8 ใบ, เงา, วงแหวนเป้า
- **v0.3** นำเข้าภาพ AI ที่ผู้ใช้สร้างด้วย GPT (ผู้ใช้สร้างเองจาก prompt ที่เราให้):
  - ต้นฉบับ `art-source/01..14.png` → `python3 tools/import_ai_assets.py` → `src/assets/ai/` (71 ไฟล์ ~0.86MB + meta.json)
  - 01 บ้านหลังคาฟาง, 02 บ้านกระเบื้องแดง, 03 โรงตีเหล็ก, 04 แผงร้าน, 05 หอคอยผู้เฒ่า, 06 ต้นไม้ 6, 07 ของตกแต่ง 12,
    08 ซากวิหาร 8, 09 พื้น 8, 10 ฮีโร่ 8 ท่า, 11 มอนสเตอร์ 5, 12 ไอคอน 16, 13 บอส 3 ท่า, 14 ภาพหน้าเปิด (keyart.jpg)
  - ทำแล้ว: loader + applyAiArt (ไอคอน 32px, ต้นไม้, ของตกแต่ง, ซากวิหาร, บ้าน, monster/boss anims แบบเฟรมเดียว), Boot preload,
    mapgen เพิ่ม `building` (โรงตีเหล็ก 6,41 / หอคอย 12,32), haystack, statue, stairs, arch, ต้นไม้ตาย v5,
    WorldScene วางวัตถุ AI (บ้านใช้ origin ล่าง-กลาง ตาม footprint), ไอคอน UI ลดสเกลครึ่ง (เพราะ 32px), ไฟเตาไฟ/ประกายไฟ

## v0.3 เสร็จแล้ว (commit ล่าสุด)
- Monster AI art + การขยับด้วยโค้ด (`aiMotion`), หันทิศถูก (`AI_FACES_LEFT`), บอส 3 ท่า, flash ตอนโดนตีของบอสเป็นสีแดงอ่อน
- Hero AI art 8 ท่า + เปลี่ยนสีชุดตามเกราะ (`recolorHero`), portrait ใน HUD/กระเป๋า ใช้ `hero.portrait()`
- เงาทอดแบบ pixel (silhouette เฉียงไปขวาล่าง) ของทุกวัตถุ/NPC/ฮีโร่/มอนสเตอร์ (`castShadow`, `followShadow`), จางลงตอนกลางคืน
- หน้าเปิดใช้ keyart
- ยังไม่ได้ทำ: พื้นจาก tile AI (พื้นวาดด้วยโค้ดดูเข้ากันอยู่แล้ว), NPC/ไอคอนสกิล/เต็นท์ยังเป็นภาพโค้ด → ส่ง prompt ให้ผู้ใช้แล้ว

## v0.4 (ล่าสุด)
- AI art นำเข้าที่ 2x (`R=2` ใน import script) วาดที่ scale 0.5 → คมขึ้น; `resOf(key)` ใน aiAssets, `fit()` ใน WorldScene
- ธรรมชาติขยับ: `animateNature()` ลมพัดเป็นระลอก (ต้นไม้/หญ้า/ดอกไม้/พุ่ม), หญ้าแหวกเมื่อเดินผ่าน, พุ่มไหว, ผีเสื้อกลางวัน,
  ควันปล่องไฟ (`addChimney`), ฝุ่นเท้า (`dust`) ฮีโร่+มอนสเตอร์, ใบบัวลอย, ไฟกองไฟสั่น
- ส่ง prompt ชุดแอนิเมชันให้ผู้ใช้แล้ว (A1-A6 ฮีโร่, B มอนสเตอร์ 2 แถว move/attack, C บอส 3 แถว, D NPC, E VFX พื้นดำ, F ฉาก, G ไอคอนสกิล)
  → เมื่อได้ภาพ: ต้องแก้ import script ให้ตัดเฟรมตามแถว/ช่อง แล้วสร้าง anims หลายเฟรมแทน single-frame + aiMotion

## ทิศทางเกม (ผู้ใช้กำหนด 2026-11-05) — สำคัญ
- **ไม่ใช่แนวแจกแต้มสเตตัส** → แนว "ตีมอน → ดรอปของ → ใส่ของ → ยิ่งแรร์ยิ่งแรง"
- อนาคต: **สร้างบ้าน, สร้างเมือง, สร้างกิลด์** (กิลด์/ผู้เล่นหลายคนต้องมีเซิร์ฟเวอร์ — ตอนนี้ยังเป็นออฟไลน์ localStorage)

## v0.5 ระบบของแรร์ (ทำแล้ว)
- `systems/loot.ts`: rarity 0-4 (ธรรมดา/ดี/หายาก/มหากาพย์/ตำนาน, RARITY_MULT 1/1.35/1.8/2.5/3.6), affix สุ่มจำนวน = rarity
  (atk, matk, def, hp, crit, aspd, move, leech, mf, exp), `pickBase` ตามเลเวลมอน, `rollRarity` (+mf), `makeGear`
- InvItem มี `rar`, `aff`; derive() คำนวณจากเลเวล(เล็กน้อย)+อุปกรณ์ + `power` (พลังรบ) — ลบ allocate/statPoints ออกจาก UI
- มอนดรอปอุปกรณ์ ~16%+, บอสดรอป 3 ชิ้น (มหากาพย์ขึ้นไป 1 ชิ้น), ของ rare+ มีลำแสง+ป้ายชื่อสี, epic+ มีเสียง/แฟลช
- กระเป๋าแสดงสีกรอบตามแรร์, ค่าสุ่ม ✦, เทียบพลังรบ ▲/▼ ก่อนใส่; หน้า "ตัวละคร" แทนหน้าสเตตัส; HUD แสดงพลัง
- ถัดไป: ช่องอุปกรณ์เพิ่ม (หมวก รองเท้า แหวน สร้อย), ย่อยของ→ผลึก, ล็อกไอเทม, จัดเรียงกระเป๋า, ระบบบ้าน/เมือง

## v0.5.1 เอฟเฟกต์ล้อมตัว
- `surround()` ใน WorldScene: วงแหวนพื้น + ม่านแสงทรงกระบอก (fx_aura_back หลังตัว / fx_aura_front หน้าตัว) + วงแหวนลอย + ประกายหมุนรอบที่สลับ depth หน้า/หลัง
- ใช้กับ ฮีล, เลเวลอัป, พายุดาบ, สายฟ้า (สายฟ้าวาดหลังเป้าหมาย)
- ตัดสินใจ: เอฟเฟกต์ทำด้วยโค้ด ไม่ต้องให้ GPT วาด prompt ชุด E (ภาพแบนแปะทับจะไม่ล้อมตัว)

## v0.6 แอนิเมชันหลายเฟรมจริง (ภาพจากผู้ใช้ 22 แผ่น)
- ต้นฉบับ `art-source/anim/*.png` → `python3 tools/import_anims.py` → `src/assets/anim/*.png` + meta.json (strip, 2x, pivot ที่เท้า)
- `art/animAssets.ts`: preload spritesheet, ตั้ง customPivot ทุกเฟรม, สร้าง anim: ฮีโร่ h{armor}_idle/walk/walkup/attack/cast/die (เปลี่ยนสีตามเกราะ),
  มอนสเตอร์ move/attack, บอส move/attack/cast/die, NPC idle, fxa_slash/fireball/explode/bolt/heal/lvlup/smoke/hit, env_campfire/lamp/smoke/flag, ไอคอนสกิล
- Hero.animPose(), Monster.multi, WorldScene.playFx(); fallback เป็นภาพเดิมถ้าไม่มี anim
- ยังขาด: ฮีโร่ท่าเดินลง-ซ้าย/ขึ้น-ซ้าย ใช้ flip, ไม่มีท่าโดนตีแยก (ใช้เฟรมแรกของ die)

## v0.6.1
- เส้นขอบ (stroke) รอบภาพ ai_/an_ ทั้งหมด (ยกเว้นไอคอน/พื้น/เอฟเฟกต์) `art/stroke.ts` — เปิด/ปิดได้ในเมนู (localStorage `eldergrove_stroke`, ค่าเริ่มต้นเปิด, reload เมื่อสลับ)
- ลบเอฟเฟกต์สั่นจอทั้งหมด (ผู้ใช้ไม่ต้องการ)
- ส่ง prompt L1-L5 (ท่าหันซ้าย) และ H1-H2 (ท่าโดนตี) ให้ผู้ใช้แล้ว → เมื่อได้ภาพ: เพิ่มใน import_anims.py เป็น hero_*left / hero_hurt แล้วใช้แทน flip ใน Hero.animPose

## ทิศทางใหม่ (2026-11-05) — ผู้ใช้ส่งภาพอ้างอิง "สร้างหมู่บ้าน/ล่า/หลอมอาวุธ/ดันเจี้ยน/รับฮีโร่"
- ผู้ใช้ให้เราออกแบบระบบเองทั้งหมด → ดู `docs/GAME_DESIGN.md` (core loop, ทรัพยากร, อาคาร, ทีมฮีโร่, ดินแดน, เฟส 1-7)
- Prompt ภาพทั้งหมด 125 ชิ้น: `tools/prompts.py` (แหล่งเดียว) → `docs/PROMPTS.md` + หน้าเว็บ https://claude.ai/artifact/WWGB1uemxynAXSALo2427k (Prompt Book, มีปุ่มคัดลอก)
- **เฟส 1 กำลังทำ (commit WIP, ยังไม่ deploy)**: `data/buildings.ts`, `systems/settlement.ts` (+tests), state.res/buildings,
  mapgen PLOTS (6 ที่ดินใต้หมู่บ้าน) + PATH3, WorldScene: ตัดไม้/ขุดหิน (nodes, hitNode, regrow), buildPlots/drawBuilding/updateSettlement (ฟองเก็บของ),
  อาหารจากมอนสเตอร์, AUTO ตัดไม้เมื่อไม่มีมอน
  → **ยังขาด UI**: แถบทรัพยากรบน HUD, panel 'plot' (สร้าง/อัปเกรด/เก็บ/หลอม) ฟัง EV.PLOT, ปุ่มคุยแสดง "🔨" เมื่อใกล้ที่ดิน, ช่างตีเหล็กเปิดหลอม

## ไอเดียถัดไป (หลัง v0.3)
- APK ด้วย Capacitor + GitHub Actions (ผู้ใช้สนใจ)
- Character creator / map editor ในเกม, ระบบนำเข้าภาพจากผู้ใช้
- ขอภาพ GPT เพิ่ม: ท่าเดิน/โจมตีมอนสเตอร์, NPC 3 ตัว, ไอคอนสกิล 4, เต็นท์/ค่ายก็อบลิน, VFX
- Prompt ที่ใช้ได้ผล: ต้องมี "TRUE ISOMETRIC 2:1 ... 26.5 degrees ... front corner points straight down ... object only, no ground, plain pure white background"

## กฎ
- ห้ามสร้าง PR จนกว่าผู้ใช้สั่ง, commit message ลงท้าย Co-Authored-By + Claude-Session ตาม system reminder
- อย่าอ้างว่าทดสอบบนมือถือจริง (ทดสอบได้แค่ Playwright), รายงานตามจริง
