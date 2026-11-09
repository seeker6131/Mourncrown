# HANDOFF — Eldergrove Saga (อ่านไฟล์นี้ก่อนเริ่มงานต่อ)

> 💰 **ผู้พัฒนาต้องขายของในเกมได้** (ร้านเติมเงิน/แผงแอดมิน) → docs/GAME_DESIGN.md หัวข้อ 10
> ⚠️ **เกมนี้จะเป็นออนไลน์ในอนาคต (ผู้ใช้ย้ำ)** — เขียนตรรกะใน `src/systems/*` แบบ pure, การสุ่มรับ rnd, state เป็น JSON มี version → ดู docs/GAME_DESIGN.md หัวข้อ 9
> ✅ ทิศทางยืนยันแล้ว: ล่าเป็นหลัก + หมู่บ้าน + คำสาป + ชาวบ้าน→4 สาย×3 ร่าง (docs/GAME_DESIGN.md 8-12)

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
- **Prompt Book v2 (2026-11-07)** โล๊ะเล่มเก่าตามคำสั่ง ผู้กำกับติว่าแมพไม่ตรง concept (ส่ง screenshot 5 ภาพ: หมู่บ้าน ป่าล่าสัตว์ โรงตีเหล็กลาวา คุกใต้ดิน โรงเตี๊ยม) → ทางใหม่: แมพเป็นภาพวาดผืนใหญ่ (plate 1536x1024 ต่อกันเป็นกริด) + อาคาร 3 ระดับพร้อมลาน + ห้องคุก + FX. 73 prompt: VL1-6 (หมู่บ้าน 3x2), BD1-13, HT1-4, HF1-4, LV1-4, SN1-4, DG1-4, IN1-2, FX1-5, CH1-10 (T2/M3d/M4k/M4d), MD1-17 (ท่าตายมอน). แหล่งเดียว `tools/prompts.py` → `docs/PROMPTS.md` + https://claude.ai/artifact/WWGB1uemxynAXSALo2427k. ได้ VL2 (ทำก่อน) + VL1 แล้วใน art-source/plates/. GPT วาดขอบซ้อนกับชิ้นข้างๆ ~424px → ต่อด้วยหา offset (VL1 x=1112 ทับ VL2 x=0, oy=0, scale 1.0) + feather blend ช่วงซ้อน ผลเนียน ไม่มีเงาซ้อน. TODO เมื่อได้ภาพ: ระบบ plate map (ภาพเป็นพื้น + walk mask + จุดแปลงอาคาร), เกลี่ยรอยต่อ plate, vignette ขอบจอมืด, แสงอุ่น, ไอคอนลอยเหนืออาคาร (FX5)
- **เฟส 1 กำลังทำ (commit WIP, ยังไม่ deploy)**: `data/buildings.ts`, `systems/settlement.ts` (+tests), state.res/buildings,
  mapgen PLOTS (6 ที่ดินใต้หมู่บ้าน) + PATH3, WorldScene: ตัดไม้/ขุดหิน (nodes, hitNode, regrow), buildPlots/drawBuilding/updateSettlement (ฟองเก็บของ),
  อาหารจากมอนสเตอร์, AUTO ตัดไม้เมื่อไม่มีมอน
  → **ยังขาด UI**: แถบทรัพยากรบน HUD, panel 'plot' (สร้าง/อัปเกรด/เก็บ/หลอม) ฟัง EV.PLOT, ปุ่มคุยแสดง "🔨" เมื่อใกล้ที่ดิน, ช่างตีเหล็กเปิดหลอม

## v0.7 (ล่าสุด)
- หมู่บ้าน: ที่ดิน 6 แปลง (3 แรกเปิด, อีก 3 ปลดเมื่อปราบบอส), อาคาร โรงหลอม/ครัว/โกดัง สร้าง+อัปเกรดด้วยทรัพยากร+วัตถุดิบมอน
  panel 'plot' ใน panels.ts, ปุ่ม 🔨 เมื่อใกล้ที่ดิน, แถบทรัพยากรบน HUD, ตัดไม้/ขุดหิน, อาหารจากมอน
- เลเวลมีความหมาย: แต้มสกิล (+15%/เลเวลสกิล), อุปกรณ์ต้องมีเลเวล (reqLevel), ย่อยของ→ผลึก/แก่นโบราณ
- คลาส: `data/classes.ts`, state.cls/tier, advanceClass/nextForm/currentSkills, panel 'job' (ผู้เฒ่า), สกิลใหม่ bash/multishot/arrowrain/warcry,
  นักธนูยิงธนู/จอมเวท+นักบวชยิงลูกเวท, สีชุดเปลี่ยนตามสาย (heroStrip) — ภาพจริงแต่ละร่างรอผู้ใช้เจน (prompt หมวด forms)
- intro เรื่องคำสาปตอนเริ่มเกม

## ภาพร่างตัวละคร (กำลังสะสม — ผู้ใช้สั่ง "รอจนกว่าจะบอกครบ" ห้าม import ก่อน)
- เก็บที่ `art-source/forms/<รหัส>.png`: ได้แล้ว L1-5, H1-2, W1-2, V0, S2, S3, S4, A2, A3, A4 (ครบชุดละ 7), M2/M2w
- W1/W2 หันซ้าย (ต้อง flip), ภาพอื่นหันขวา
- ⚠️ ผู้ใช้ติ: รอบก่อน "ขอบขาวติดมาบางเฟรม" → ตอน import ต้อง defringe: ลบช่องขาวปิดล้อม (holes เล็กลง), กัดขอบ alpha 1px ที่สีใกล้ขาว, ลดสีขาวที่ขอบ (unpremultiply/decontaminate), แล้วตรวจด้วยการวางบนพื้นสีเข้มทุกเฟรม

## v0.8 ร่างตัวละครจริง (ภาพผู้ใช้ 76 แผ่น)
- `tools/import_forms.py` → `src/assets/forms/<CODE>_<anim>.png` (R=3 px/world px, HERO_H=32, defringe, scale เดียวต่อร่าง, ยึดเท้า) ~4.5MB
- `art/formAssets.ts`: anim `f_<CODE>_<idle|walk|walkup|attack|skill|die>`, fallback: T* → S* ย้อมสีเหล็ก, ขาด skill→attack, ขาด die→หมุนล้ม
- Hero.formPose(); hero.casual = ในหมู่บ้าน/เขตก่อสร้าง หรือ state.outfit='gather' → ใช้ชุดชาวบ้าน V0
- ปุ่ม ⚔/⛏ เปลี่ยนชุด: ⛏ เก็บไม้/หิน x2 แต่ตีมอน -40%
- สกิลใหม่ data-driven `data/skills.ts` (kind: strike/spin/dash/leap/shot/pierce/rain/nova/buff/heal/shield), ร่างละ 3 สกิลไม่ซ้ำ (เทสต์ยืนยัน), นักดาบไม่มีสกิลระยะไกล/เวท
- เมนู → 🧪 ทดสอบสลับร่าง (13 ร่าง) — เอาออกก่อนเปิดให้คนอื่นเล่น
- กล้องซูมออก (h/320), UI VH=400
- ยังขาดภาพ: T2-T4 ทั้งชุด, M3d, M4k, M4d (+ ภาพ L/H/W เก่าไม่ได้ใช้เพราะเป็นตัวละครชุดเก่า)

## v0.8.1
- มอนไม่ตีก่อน (passive) — โกรธเมื่อโดนตี + พวกเดียวกันใกล้ๆ เข้าช่วย (`Monster.provoke`); ลูกน้องบอสยังบุกเอง
- ห้องแต่งตัว (เต็นท์ม่วง tile 18,44): เลือกชุด ล่ามอน/หาทรัพยากร + เลือกร่างที่ปลดแล้ว (state.useTier, `activeTier()`) — เอาปุ่มชุดบน HUD ออก
- ล็อกหัว/ลำตัวทุกเฟรม idle/walk/skill (`register()` ใน import_forms.py) แก้ธนูร่าง 4 ส่ายซ้ายขวา
- Prompt Book หมวดใหม่ 'terrain' M1-M9 (หน้าผา ภูเขา ทางขึ้น เนิน ภูเขาพื้นหลัง น้ำตก สะพาน ริมน้ำ ต้นไม้บังหน้า) → เมื่อได้ภาพ: ทำระบบความสูง (height map ใน mapgen + วาดหน้าผาตามขอบ + ทางลาด)

## v0.8.2 (2026-11-06 ก่อนผู้ใช้ไปนอน)
- แก้ขอบขาว: `defringe_rgba()` ใน tools/sprite_tools.py ใช้ทั้ง import_ai_assets / import_anims (ผู้ใช้ติขอบขาวที่บ้าน/NPC) — import ใหม่แล้ว
  **กฎ: ภาพจาก GPT ดีแล้ว ห้ามทำเสีย** ทุกการ import ใหม่ต้องเทียบภาพก่อน/หลังบนพื้นเข้ม
- ขัดเกลาหมู่บ้าน: ลานหินแบบหินแผ่นไม่สม่ำเสมอ (Voronoi) + ขอบลาน/ทางเดินโค้งเนียน (`surfaceAt()` ใน mapgen), หญ้าละเอียดขึ้น,
  NPC ขนาดเท่าฮีโร่ (scale 0.5*34/44), รั้วหันตามแนวเพื่อนบ้าน, ป้ายเควสต์ใหม่ (fx_qmark/qdone โล่), ไอคอน HUD วาดใหม่ (fx_ui_*),
  เงาฐานอาคาร, ห้องแต่งตัวย้ายไป tile (11,37) ใช้แผงร้านหลังคาม่วง (`wardrobeTexture()`)
- ชุดหาทรัพยากร = ร่างชาวบ้านจริง: activeTier()=0 ตอน gather → สกิลชาวบ้าน, ไม่มีโบนัสสาย, ตีมอน x0.35, AUTO เก็บไม้/หิน ไม่ล่ามอน (สู้กลับเมื่อโดนตีเท่านั้น)
  ท่าตัด/ขุด: ใช้ภาพ W1/W2 ของผู้ใช้ (copy เป็น art-source/forms/V0c.png, V0m.png) → f_V0_chop / f_V0_mine
  **กฎผู้ใช้: ตัดไม้/ขุดหินได้เฉพาะร่างหาทรัพยากร (WorldScene.canGather: outfit gather หรือ activeTier 0) — ร่างนักรบตัดไม่ได้เลย (มี toast บอก). ท่าขวาน/จอบขึ้นเฉพาะตอนฟันต้นไม้/หิน เดิน/วิ่งถือดาบตามปกติ**
- ภารกิจประจำวัน `systems/daily.ts` (3 งาน/วัน: ล่ามอน เก็บไม้ เก็บหิน หลอม ปราบบอส) แสดงในหน้าเควสต์
- Prompt Book 271 ชิ้น เพิ่มหมวด: ui (ชุด UI ดำทอง), pets/mounts, raid (สงครามหมู่บ้าน), life (ชีวิตหมู่บ้าน/เฟอร์นิเจอร์/เทศกาล), misc (ตกปลา/แร่/หีบ/วาร์ป),
  V0c/V0m/V0g/V0i (ชาวบ้านตัดไม้/ขุดหิน/แบกตะกร้า ไม่มีดาบ)

## รอภาพจากผู้ใช้ (เรียงความสำคัญ)
1. (V0c/V0m ได้แล้วจาก W1/W2) V0g, V0i — ชาวบ้านแบกตะกร้า (ไม่บังคับ)
2. T2–T4 แทงค์ครบชุด, M3d, M4k, M4d
3. M1, M3 (หน้าผา + ทางขึ้นลง) → ทำระบบความสูงในแมพ; M5, M9 ให้ฉากลึก
4. U1–U8 ชุด UI ดำทอง → แทน UI วาดด้วยโค้ด
เมื่อได้ภาพ: ใส่ใน art-source/forms (ตัวละคร) แล้ว `python3 tools/import_forms.py`; ภาพฉาก/UI ต้องเขียน importer เพิ่มตามแบบ import_ai_assets.py

## ด่าน/ดินแดน — เกมยาว เลเวล 100 (ผู้ใช้สั่ง)
- **MAX_LEVEL=100, FORM_LEVEL=[1,10,40,80]** (ทำแล้ว), EXP ชันขึ้นหลัง Lv20; แผน 12 ดินแดน + ระบบหลัง 100 → docs/GAME_DESIGN.md หัวข้อ 14
- เสนอแผนผูกด่านกับเลเวล/ร่างแล้ว → docs/GAME_DESIGN.md หัวข้อ 13 (รอผู้ใช้เลือกว่าจะทำดินแดนไหนก่อน; แนะนำ ป่าผีสิง Lv15–20 + ด่านทดสอบ Lv20)

## ไอเดียถัดไป (หลัง v0.3)
- APK ด้วย Capacitor + GitHub Actions (ผู้ใช้สนใจ)
- Character creator / map editor ในเกม, ระบบนำเข้าภาพจากผู้ใช้
- ขอภาพ GPT เพิ่ม: ท่าเดิน/โจมตีมอนสเตอร์, NPC 3 ตัว, ไอคอนสกิล 4, เต็นท์/ค่ายก็อบลิน, VFX
- Prompt ที่ใช้ได้ผล: ต้องมี "TRUE ISOMETRIC 2:1 ... 26.5 degrees ... front corner points straight down ... object only, no ground, plain pure white background"

## กฎ
- ห้ามสร้าง PR จนกว่าผู้ใช้สั่ง, commit message ลงท้าย Co-Authored-By + Claude-Session ตาม system reminder
- อย่าอ้างว่าทดสอบบนมือถือจริง (ทดสอบได้แค่ Playwright), รายงานตามจริง

## รูปที่ได้รับรอบล่าสุด (ผู้ใช้: "ท่าครบจะบอก ส่งเรื่อยๆก่อน" → เก็บไว้ ยังไม่ import)
- T3 ครบ 7 ไฟล์ (idle/w/u/a/k/d/P) และ T4 ครบ 7 ไฟล์ → art-source/forms/T3*.png, T4*.png (ยังไม่รัน import_forms.py)
- นักธนูเอลฟ์หญิง (ยังไม่รู้ว่าเป็นร่างไหน/สกินหญิง) → art-source/pending/FA2*.png (idle,w,u,a,d — ยังขาด k สกิล, P portrait)
- ยังขาด: T2 ทั้งชุด, M3d, M4k, M4d
- รอบ 2 (ยังไม่ import): art-source/pending/npc (คนตัดไม้/คนขุดแร่/พ่อครัว/ช่างตีเหล็ก — ท่าทำงาน 4 เฟรมพร้อมพร็อพ, สาวเสิร์ฟ idle4, ยาม idle4, สาวชาวนาถือตะกร้า walk6),
  animals (แกะ/วัว/ไก่/หมู walk4, กวาง/หมูป่า walk6), monsters (แถวบน walk4 + แถวล่าง attack4: โครงกระดูกดาบ, โครงกระดูกธนู, ผีตะเกียง, อิมป์ไฟ, โกเลมลาวา, ซาลาแมนเดอร์ไฟ, หมาป่าน้ำแข็ง)
  แผนใช้: NPC ทำงานในหมู่บ้านตามอาคาร (ป่าไม้/เหมือง/ครัว/โรงตีเหล็ก), สัตว์เดินในหมู่บ้าน/ฟาร์ม, กวาง/หมูป่า = มอนทุ่ง Lv1-10, โครงกระดูก+ผี = ป่าผีสิง/คุกใต้ดิน, อิมป์/โกเลม/ซาลาแมนเดอร์ = ดินแดนลาวา, หมาป่าน้ำแข็ง = ภูเขาหิมะ
- รอบ 3 (ยังไม่ import): monsters/ yeti, poison_spider, giant_rat (walk4+attack4)
  bosses/ (แต่ละตัว 2 ไฟล์: walk4+attack5 / skill4+die5): cursed_stag (ป่าผีสิง Lv20-30), skeleton_king (คุก Lv80-90), lava_dragon (ลาวา Lv50-60), frost_giant (หิมะ Lv60-70)
  buildings/ อาคารอัปเลเวลได้: townhall lv2/lv3, house hut lv1/lv2, lumber lv1/lv2 sawmill(มีกังหันน้ำ), quarry lv1/lv2, farm lv1
  แผน: อาคารเปลี่ยนรูปตามเลเวลอัป (หน้าตาเปลี่ยนจริง), สร้างระบบ ป่าไม้/เหมือง/ฟาร์ม = ผลิตทรัพยากรอัตโนมัติ
- รอบ 4 (ยังไม่ import): buildings/ farm_lv2, barn lv1(คอก)/lv2(โรงนา+ไซโล), kitchen lv1(กองไฟหม้อ)/lv2, forge lv1/lv2, tavern lv1/lv2, warehouse lv1/lv2, market lv1/lv2, tower lv1 ไม้/lv2 หิน(หน้าไม้ยักษ์), construction(นั่งร้าน=ระหว่างสร้าง), empty_plot(ที่ดินว่างมีป้าย)
  walls_sheet_wood_stone (6 ชิ้น: ไม้ตรง/มุม/ประตู, หิน ตรง/มุม/ประตู = กำแพงอัปเลเวล), props/haunted_autumn_sheet (8: ต้นไม้ตาย, เมเปิ้ล, ต้นไม้อีกา, หลุมศพ, เกวียนพัง, ฟักทอง, หุ่นไล่กาฟักทอง, ขอนเห็ด), props/lava_sheet (8: หินลาวา, คริสตัลแดง, บ่อลาวา, ต้นไม้ไหม้, โครงกระดูกมังกร, ปล่องควัน, แร่เงิน, เสาหักลาวา)
  แผนอาคาร: ที่ดินว่าง → นั่งร้าน(รอเวลาสร้าง) → Lv1 → Lv2 (→ Lv3 ใช้ tint/ของประดับเพิ่ม จนกว่าจะมีรูป)
- รอบ 5 (ยังไม่ import): props/snow_sheet(8), dungeon_sheet(8: เสาคบไฟ ประตูกรง กองกะโหลก โต๊ะแผนที่ โครงกระดูกล่ามโซ่ หีบทอง กับดักหนาม บันไดลง), village_props12
  tiles/ (4 ชุด x4 ช่อง: ป่าใบไม้/โคลน/หินมอส/หญ้าเข้ม, ลาวา/เถ้า/แม็กม่า/void, หิมะ/น้ำแข็ง/ทะเลสาบแข็ง/หินหิมะ, ดันเจี้ยน หิน/มอส/ไม้/น้ำ)
  terrain/ = ระบบความสูง M1-M9: dungeon_walls, earth_ledge(ขอบดิน 8), rock_cliff(หน้าผา 8 + ถ้ำ + น้ำตก), stairs_ramps(6), grass_hills(เนิน 6), parallax_bg(ฉากหลัง 3 ชั้น), waterfall_4f(น้ำตก 4 เฟรม), bridges(4 รวมสะพานพัง), shore_edges(ริมน้ำ 8 รวมท่าเรือตกปลา), canopy_overhang(กิ่งไม้บังหน้า 4)
  ui/ panel_9slice (กรอบมังกรทอง), buttons6 (น้ำตาล/ส้ม/เทา/เขียว/แดง/ม่วง), frames_rings (กรอบรูปโปรไฟล์, ช่องสกิล, ปุ่มกลม)

## ผู้ใช้: "ครบ ลุย ทำให้ครบ ทำให้เทพ" (2026-11-06) — ตัดสินใจแล้ว
- เอลฟ์หญิง FA2* = NPC (พรานเอลฟ์ในหมู่บ้าน) • แมวส้ม = แมวเดินเล่นในหมู่บ้าน • เด็กวิ่ง = NPC เด็กในหมู่บ้าน
- ลำดับทำ: (1) T3/T4 (2) UI kit ใหม่ทั้งชุด (bars, panel 9-slice, buttons, slots rarity, icons) (3) VFX sheets (4) อาคารเปลี่ยนรูปตามเลเวล + NPC ทำงาน + สัตว์ + แมว/เด็ก/เอลฟ์ (5) ภูมิประเทศสูงต่ำ/น้ำตก/สะพาน/ริมน้ำ (6) ดินแดนใหม่ทีละแห่ง เริ่มป่าผีสิง+บอสกวาง
- **ผู้ใช้สั่งเพิ่ม (ระหว่างทำ):** แมพหาทรัพยากรแยก = ล่าสัตว์ + ขุดแร่ + ตัดไม้ อยู่แมพเดียวกัน **ไม่มีมอนผสม** แต่สัตว์ต้อง **สตั้นผู้เล่นได้บ้าง** (ไม่ให้ล่าง่ายเกิน), **หินขุดนานกว่าไม้**, รางวัลสุ่ม ไม่ง่ายไม่ยากเกิน
- ผู้ใช้แก้: 'รางวัลสุ่ม' หมายถึง **จำนวนดรอป ไม้/หิน/เนื้อ น้อยบ้างเยอะบ้าง** (ไม่ใช่ของสุ่ม)

## สถานะล่าสุด (รอบ "ครบ ลุย") — ทำแล้ว
- T3/T4 แทงค์ import แล้ว (T2 ใช้ T3 tint ทองอ่อน จนกว่าจะมีรูป)
- tools/import_anims.py ส่วน batch-2: มอน 10, บอส 4 (move/attack/cast/die), สัตว์ 6+แมว, ชาวบ้าน 8 + เอลฟ์ (vil_*), VFX fx2_* 12 ชุด; ขนาดตามสัดส่วนจริง (ฮีโร่ 32px ≈ 1.7m) — ผู้ใช้สั่ง "สัดส่วนต้องสมจริง บอสต้องเบิ้ม"
- tools/import_pending.py: อาคาร → src/assets/ai/bld_<type>_<lv>.webp (+ bld_empty, bld_construction, townhall, house)
- **tools/to_webp.py ต้องรันหลัง importer ทุกตัว** (แปลง png→webp lossless ตรวจพิกเซลตรงกัน)
- single build (artifact) ตัดอาร์ตมอน/บอสดินแดนที่ยังไม่เปิด (glob ใน animAssets.ts) — ตอนนี้ 14.5MB/16MB เต็มแล้ว! ดินแดนใหม่ต้องตัดอย่างอื่นหรือเล่นบน GitHub Pages เป็นหลัก
- แมพหาทรัพยากร src/world/maps.ts 'gather' (ป่าพรานไพร): ไม่มีมอน, กวาง(หนี+เตะมึน) หมูป่า(สู้+ชนมึน) stun 0.95s กันซ้ำ 3.5s, ดรอปเนื้อสุ่ม (12% ★ ล็อตใหญ่), ไม้ 5 ครั้ง/ต้น หิน 8-12 ครั้ง, ดรอปไม้/หินสุ่ม 1-3(+0-2 ชุดหาทรัพย์) +8% ★
- portal: หมู่บ้าน (26,51) ↔ ค่ายพราน (5,38); เข้าแมพหาทรัพยากร → สวมชุด gather อัตโนมัติ กลับมาคืนชุดเดิม; s.map, s.mapPos, s.prevOutfit
- อาคาร 10 ชนิด (buildings.ts) + ก่อสร้างมีเวลา (buildTime) นั่งร้าน, 9 แปลง (unlock 3/6/9 ตามบอส 0/1/3), tavern EXP, tower DEF/HP, market ผลิตทอง
- ชีวิตในหมู่บ้าน spawnLife()/updateLife(): ช่างต่างๆ, ยาม, สาวเสิร์ฟ, เอลฟ์, สาวชาวนา, เด็กวิ่ง, แมว(วิ่งหนีฮีโร่), สัตว์ฟาร์ม
- MONSTERS เพิ่มนิยามมอนดินแดนใหม่ + บอส 4 (ยังไม่วางในแมพ)
## ยังเหลือ (ลำดับ)
1 UI kit ใหม่ (ui/ bars, panel 9-slice, buttons6, slots rarity, hud_icons10, res_icons8, skill_icons8, banners) 2 VFX fx2 ใส่สกิล/ตัดไม้/ขุด/เหรียญ 3 ภูมิประเทศสูงต่ำ/น้ำตก/สะพาน/ริมน้ำ/canopy/parallax 4 ดินแดนใหม่: ป่าผีสิง+บอสกวาง (tiles/props/concept haunted พร้อม) → ลาวา → หิมะ → ดันเจี้ยน 5 หอป้องกัน/กับดัก/อาวุธล้อม (ระบบปล้นออนไลน์) 6 เด็ก/แมววิ่ง ใส่แล้ว; ท่าตายมอนตัวเล็กยังไม่มี (ใช้ fade)
- UI kit ใหม่ใส่แล้ว: tools/import_ui.py → src/assets/ui (panel 9-slice + ui_leather tile, ปุ่ม 6 สี 3-slice, แถบ HP/MP/EXP/บอส แบบภาพ, slot ตามความแรร์, ไอคอน hud/res/skill, ring, banner) — src/ui/skin.ts; kit.ts ใช้ skin อัตโนมัติถ้ามี texture
- ขอบขาว: sprite_tools.clean_edges (ลอกพิกเซลสว่างที่ติดเส้นขอบดำ ไม่กินขนขาว/น้ำแข็งจริง) ใช้ในทุก importer; ตรวจด้วย tools/fringe_check.py (เหลือ 14 ไฟล์ = น้ำแข็ง/ขนขาวจริง)
- ฐานอาคารกลืนพื้น: ดินเหยียบรอบแปลง (surfaceAt), groundSkirt() เงา+หญ้า/ดอกไม้/หินรอบฐาน (ทั้งบ้านเดิมและอาคารแปลง)
- **ดินแดน 4 แห่งเปิดแล้ว** (maps.ts generateRegion): haunt Lv20 บอสกวาง, lava Lv50 มังกร, snow Lv60 ยักษ์น้ำแข็ง, dung Lv80 ราชาโครงกระดูก; ต่อกันด้วยประตู (หมู่บ้าน: ประตูที่ 2 ตะวันออกของวิหาร (103,47)); พื้นตามธีม (isoArt THEMES + themeDetail), props pr_* (import_pending.py ส่วน sheet()), boss ทั่วไป bossGeneric() วงเตือน+เอฟเฟกต์ fx2
- VFX fx2 ใส่แล้ว: ห่าธนู, nova (poison/ice/rage), buff rage, heal holy, shield, ตัดไม้/ขุดหิน chips, เหรียญตอนมอนตาย
- artifact build: ดินแดนใหม่ปิด (toast บอกให้เล่นบน GitHub Pages) เพราะเกิน 16MB
- **terrainDecor.ts** (TerrainDecor): สะพานอัตโนมัติบนจุดข้ามน้ำ, น้ำตก 4 เฟรมต้นแม่น้ำ, ท่าเรือ/กก/หินริมน้ำ, เนินหญ้า, สันเขาขอบดิน+บันไดหิน (สวนมนตราเหนือ), หน้าผา+ถ้ำ+บันไดเชือก (ป่าพรานไพร), กลุ่มหิน/ซากกำแพง (หิมะ/คุก), กิ่งไม้บังหน้าจางลงเมื่อเดินใต้, ฉากหลัง parallax 3 ชั้น (main/haunt/snow พื้นนอกแมพโปร่งใส), ค่ายก็อบลินมีเครื่องล้อมเมือง, ของตกแต่งหมู่บ้าน 12 ชิ้น
- หมู่บ้านโต villageGrowth(): บอส 1/2/3 ตัว → บ้านใหม่ (หาที่โล่งอัตโนมัติ), ศาลากลาง Lv2 (บอส≥1) Lv3 (บอส≥3) แทนหอผู้เฒ่า; หอป้องกัน Lv1-5 → ป้อมไม้/ปืนใหญ่/คริสตัล, กับดัก, ประตูไม้→ประตูหิน
- เข้าดินแดนมีภาพ concept art เต็มจอ + ชื่อ + เลเวลแนะนำ (regionSplash) ; ชื่อโซนขึ้นบนป้ายไม้ banner1
- artifact build ตัด splash/parallax/canopy/siege/def/wall/cliff/hill/props ดินแดน ออก (16.69MB ใกล้เพดานมาก)
- ยังไม่มีรูป: ร่าง 2 แทงค์ (T2), M3 ท่าตาย, M4 สกิล/ตาย, ท่าตายมอนตัวเล็ก

## Plate map (หมู่บ้านใบไม้แดง ทดลอง) — 2026-11-07
- แมพภาพวาด: `art-source/plates/VL*.png` → `tools/plate_reg.py` หา offset (GPT วาดขอบซ้อนกับชิ้นข้างๆ) → `EXPORT=1 python3 tools/plate_build.py` สร้าง `src/assets/plates/town.webp` (2860x2042 lossless), `town.json` (walk/occ mask 8px cells RLE + meta อาคาร), `pb_<type>_<0..2>.webp`
- ต่อแล้ว: VL1 VL2 VL4 VL5 VL6. VL3 และ VL7 (ภาพที่ 7 สะพาน+ไร่) ไม่มีส่วนซ้อน → ยังไม่ได้ใช้ (เก็บสำรอง)
- เกม: map id 'town' (`src/world/plateTown.ts`), เข้า: ประตูมิติในหมู่บ้านเดิม (tile 26,46) หรือ URL `?map=town`. โหลดภาพตอนเข้า (scene restart). ไม่มีใน single build
- เดินได้ = พื้นดิน/หินปู (จำแนกสี) + ทางเสริมมือ WALK_ADD; ของสูง (บ้าน ต้นไม้ รั้ว โคม) = occluder ตัดเป็นแท่งกว้าง 16px แต่ละแท่ง depth = ขอบล่าง → บังตัวละครถูกต้อง
- อาคาร BD1 ศาลากลาง (ตามบอสที่ฆ่า), BD2 บ้าน, BD3 โรงเลื่อย (ตามเลเวลอาคาร) วางบนแปลง PLATE_LOTS; บล็อกครึ่งหลังของลาน
- ข้อจำกัด: พื้นที่ใต้พุ่มไม้/หลังหลังคาที่ภาพวาดบังไว้ เดินไม่ได้ (mask ดูจากสีที่เห็น). ยังไม่มี NPC/สัตว์/ชาวบ้านเดินในแมพนี้, ยังไม่มีเงาเรืองตอนถูกบัง, ยังไม่เชื่อมระบบสร้างอาคารเข้ากับแปลงใหม่
- **ผู้กำกับติ (2026-11-07):** ตัวละครติด ขอบบังเป็นสี่เหลี่ยม ไม่เนียน → เปลี่ยนแนวทาง: พื้นแมพ = ground only (ต่ำกว่าเข่า) + ของสูงทุกชิ้นเป็น sprite แยก (มี foot point / footprint เอง) แบบเกมทั่วไป.
  Prompt Book: GV1-6 = แมพหมู่บ้านออกแบบใหม่ (ไม่ใช้ VL เก่า ตามคำสั่ง) พื้นอย่างเดียว 3x2 มีที่ราบสูง+หน้าผา+บันได+น้ำตก (GV1), แม่น้ำ+สะพานโค้ง (GV3), ริมน้ำ (GV6); OB1-8 = ชีตของแยกชิ้น. ลำดับแนบ: GV1,GV3,GV5 แนบ GV2; GV4,GV6 แนบ GV5. VL composite ยังใช้ใน prototype town จนกว่าจะได้ GV
- **ตัดระบบเกษตร (2026-11-07):** ลบอาคาร 'farm' (ไร่ผัก) ออกจาก BUILDINGS; เซฟเก่าที่มี farm → แปลงเป็น barn อัตโนมัติ (save.ts). อาหารมาจากคอกสัตว์ + ล่าสัตว์. Prompt ไม่มีไร่/ข้าวสาลี/หุ่นไล่กาแล้ว
- **Prompt อาคารใหม่:** ฐานเพชร iso ขนาดคงที่ 420x210 px (ศาลากลาง 480x240) ทุกเลเวล ไม่มีพื้นติด → วางลงแปลงดินในแมพ + เงาฐานจากโค้ด. แปลงในพื้นแมพสั่งขนาดเดียวกัน
- **หน้าผา/เนิน/สะพาน:** อยู่ในภาพพื้น. TODO ฝั่งเกม: ไฟล์ข้อมูลภูมิประเทศต่อแมพ (วาดมือ: polygon เดินได้/ห้ามเดิน, ขอบหน้าผา, บันได/ทางลาด, เส้นทางสะพาน + ความสูงโค้ง → ยกตัวละครขึ้นตามโค้ง, ราวสะพานหน้าเป็น occluder polygon)
- **ชุดก๊อปรวดเดียว (⓪):** ชุด A (GV 6 รูป), B (OB 8), C (BD 12) — วางใน ChatGPT แชทใหม่ + แนบ concept 1 รูป แล้วพิมพ์ "ต่อ"; ชิ้นแมพอ้างภาพที่ GPT ทำไว้ก่อนในแชทเดียวกัน (ไม่ต้องแนบซ้ำ)
- Gemini API: ผู้ใช้อยากใช้ (ฟรี) แต่แอป Claude มือถือเวอร์ชันเก่าแสดงหน้าต่าง create_environment ไม่ได้ (ต้องเปิดทาง generativelanguage.googleapis.com + request_credential header x-goog-api-key). ผู้ใช้เคยวาง key ในแชท → แนะนำให้ลบทิ้ง ห้ามใช้
- **Gemini ทดสอบแล้ว (2026-11-07):** session ย้ายไป environment "RPG-Newgame" (เปิด generativelanguage.googleapis.com) + เก็บ key แบบ Bearer → ใช้ได้ผ่าน OpenAI-compat (`/v1beta/openai/...`; native endpoint ไม่รับ Bearer API key). แต่โมเดลภาพทุกตัว (gemini-2.5-flash-image, 3.1-flash-image(-preview), lite-image, nano-banana-2.1) ตอบ 429 free tier limit 0 → ฟรีเจนภาพไม่ได้ ต้องเปิด billing ถ้าจะใช้
- ผู้ใช้ไม่มีงบจ่าย API ใดๆ (จ่ายแค่ Claude) → ใช้ ChatGPT/Gemini แอปฟรี; เพิ่ม 'ชุดเล็ก' 7 รูป (GV2 GV1 GV3 OB1 OB3 OB4 BD2) ใน ⓪

## ทิศทางศิลป์ใหม่ (2026-11-08) — มองจากบน (top-down 3/4) โทนป่าหม่น
- ผู้กำกับเจอเกมที่ชอบโทน (indie top-down pixel MMO บนเว็บ ใช้ PixelLab + Aseprite + video AI ทำแอนิเมชัน) → ขอแรงบันดาลใจ/โทน/เครื่องมือแบบนั้น (ห้ามลอกภาพ/ดีไซน์ ไม่แนบภาพเกมเขาให้ AI)
- ลองแล้วไม่เอา: อาคาร CC0 HoangLong256/pixel-buildings (ผู้กำกับว่า "ขี้เหร่"); Gemini API ฟรีไม่มีโควต้าภาพ; ผู้ใช้ไม่มีงบจ่ายอะไรนอกจาก Claude
- Prompt Book v3 (โล๊ะของเก่าทั้งหมด): `tools/prompts.py` → TL1-8 (PixelLab tileset a=Lower b=Upper), HR0-12 ร่างฮีโร่, MO1-17, BS1-5 (+GBS ChatGPT), NP/AN, BD1-12 (ChatGPT 3 ระดับ ฐาน 128x96), OB1-16 + GO1-4, AM1-10 ท่า Animate; ⓪ = 13 ภาพแรก
- TODO เมื่อได้ภาพ: (1) `tools/pixelize.py` แปลงภาพ GPT → พิกเซลแท้ (downscale ลงกริด + quantize ชุดสีกลาง) (2) เปลี่ยนโปรเจกชันเกมจาก iso → orthographic top-down (iso()/unIso() เป็น grid ตรง), แมพเป็น tilemap autotile จาก tileset PixelLab (Wang) + วัตถุ y-sort + collision footprint (3) หมู่บ้าน town (plate) และ VL/BD เก่าเลิกใช้เมื่อพร้อม
- **ต้นแบบมองจากบน (2026-11-08):** `src/scenes/TopDownScene.ts` เปิดด้วย `?td` — พื้นวาดต่อพิกเซลจาก distance field (หญ้า ทางดิน ลานหิน แม่น้ำ+สะพานไม้ บ่อ) โทนหม่น, ของ placeholder วาดด้วยโค้ด (ต้นไม้ สน พุ่ม หิน รั้ว โคม+แสง), ชนกริด 4px, y-sort, vignette, จอยสติ๊ก (UI กล้องแยกไม่ซูม). ฮีโร่ = PixelLab villager 8 ทิศ (`tools/import_td.py <zip> <key>` → `src/assets/td/<key>_idle.webp` แถวเดียว 8 ทิศ 48px, `<key>_walking.webp` 8 แถว×8 เฟรม 68px; idle origin y 46/48, walk 56/68). ต้นฉบับ zip: art-source/pixellab/
  ปัญหาที่รู้: โหลดพื้น ~10 วิบนมือถือจำลอง (วาด 1M พิกเซลด้วย JS) — ควรวาดล่วงหน้าเป็นไฟล์ภาพเมื่อแมพนิ่ง; ดาบในท่าเดินหันหน้า/หันข้างยังส่ายเล็กน้อย
- **Prompt Book v4 (2026-11-08, ผู้ใช้จ่าย PixelLab Tier 1 $12/เดือน = 2,000 gen, ภาพ ≤320px, Maps ปลดล็อก):** ทุกข้อมี how-steps (เมนู/ปุ่ม/ค่าที่ตั้ง) + ข้อความวาง; template หน้าเว็บรองรับ field `how`. ตัวละคร: สร้างตัว (Characters → Create character, Low Top-Down, size, Highly detailed, single color black outline) → -W (Add Animation → MODEL PixMiniMax → Walking) → -A/-K/-D (Describe your own → Custom Animation). อาคาร/ของ = เมนู Objects (UI ยังไม่ยืนยัน). แผ่นพื้น = Maps (UI ยังไม่ยืนยัน)
- **มอนออกแบบใหม่ (ผู้ใช้ขอ ดุ น่ากลัว ไม่ซ้ำเกมอื่น):** MO1 ก้อนโคลนกลืนกิน, MO2 ซากเห็ดเน่า, MO3 หมาป่ากลวงโหว่, MO4 ภูตหนามสวมหน้ากาก, MO5 ผีเสื้อกลางคืนหน้ากะโหลก, MO6 หนูแทะซาก, MO7 อัศวินเปลือกกลวง, MO8 นักธนูกระดูกเขากวาง, MO9 วิญญาณผ้าคลุมหน้า, MO10 แมงมุมปากคน, MO11 ปีศาจเถ้าถ่าน, MO12 ยักษ์ตะกรันโซ่ตรวน, MO13 กิ้งก่าแมกมาหกขา, MO14 นักล่าเหมันต์, MO15 ยักษ์หน้ากากน้ำแข็ง; บอส BS1 มารดารากเน่า, BS2 ราชากวางโครงกระดูก, BS3 อสรพิษแก้วดำ, BS4 ผู้คุมเหมันต์, BS5 มงกุฎกลวง. TODO: เปลี่ยนชื่อแสดงผลใน src/data/monsters.ts ให้ตรงเมื่อใส่ภาพ (kind เดิม → ชื่อใหม่)
- ผู้ใช้ทำไปแล้วใน PixelLab: HR0 (เดิน+ฟันดาบ ได้ไฟล์แล้ว), เยติ, ร่างอัศวินทอง (ยังไม่ได้ส่งไฟล์)
- ตัดท่าสกิลฮีโร่ (-K) ตามผู้ใช้: สกิล = ท่าโจมตี + VFX โค้ด; บอสยังมี -K (ท่าพิเศษ ไว้เตือนผู้เล่น)
- HR0 ชาวบ้าน: ผู้กำกับว่าพอแล้ว (ตัว+เดิน+ฟันดาบ) ไม่ต้องทำท่าตาย/สกิล → ท่าตายใช้เอฟเฟกต์โค้ด
- ท่าตายจากโค้ด (TopDownScene.deathFx/burst): กะพริบขาว → กระเด็น+ล้มเอียง → แตกเป็นพิกเซลสีจริงของสไปรต์ → วิญญาณลอยขึ้น (สีเปลี่ยนได้). ใช้กับฮีโร่+มอนทั้งหมด → Prompt Book ตัด -D ของฮีโร่/มอน (บอสยังมี -K -D). ทดสอบ: แตะข้อความมุมซ้ายบนใน ?td
- TL1 Wang (PixelLab, 160x128 = 5x4 ไทล์ 32px, layout มุม TL,TR,BL,BR ใน TopDownScene.wangOverlay) ใช้แล้วใน ?td: วาดทับเซลล์ที่เป็นหญ้า/ดินล้วน, จุดยอดเป็นดินถ้าใกล้ถนน ±10px; พาเลตหญ้า/ดินโค้ดปรับให้ตรงไทล์
- TL2-TL8 Wang ได้ครบ (art-source/pixellab/tl*_wang.png, ทุกชุด layout มุมเดียวกัน U=ลาย(1,1) L=ลาย(1,3)). ใน ?td ใช้ TL3 ริมน้ำ, TL2 ลานหิน (ต้องมี cobble ในเซลล์), TL1 ถนน; หญ้าใน TL2/TL3 ย้อมให้ตรง TL1; ไทล์เต็มหมุน/กลับสุ่มลดลายซ้ำ. TL4 หน้าผา TL5 ป่ามืด TL6 หิมะ TL7 ลาวา TL8 คุก รอใช้กับดินแดนอื่น
- วัตถุ PixelLab 164 ชิ้น (art-source/pixellab/objs/batch1-7.zip) → tools/import_td_objs.py เลือก 106 ชิ้น → src/assets/td/obj/*.png + objs.json (foot). ใช้ใน ?td: อาคาร (townhall/house/forge/lumber/quarry/barn ระดับ 0-2), แผงตลาด, บ่อน้ำ, ต้นไม้, หิน, ตอ, รั้ว, โคม. สะพานที่ได้เป็นมุมข้าง (ใช้เป็นกำแพงไม้ palisade_*) — สะพานจริงยังต้องทำใหม่. ร่าง HR4 นักธนู, HR9 อาร์คเมจ (walk+attack) ใส่แล้ว (frame 64/56)
- พื้น ?td เปลี่ยนเป็น Wang ล้วน: กำหนดภูมิประเทศต่อจุดยอด 32px (g/d/c/w) → ไทล์ต่อกันเนียนทุกขอบ; S ต่อพิกเซลคำนวณจากจุดยอดเดียวกัน (bilinear). ถนนแตะลาน → ปูหิน, ถนนไม่แตะน้ำ (สะพานวาดทับ). น้ำมีคลื่นเคลื่อนตามกระแส + ฟองริมตลิ่ง (animateWater). ซูมกล้อง h/340 (ตัวละครเล็กลง). ผู้กำกับถามเรื่องการจัดวาง: ตอนนี้วางทดลอง ยังไม่ได้ออกแบบ → ต่อไปทำผังหมู่บ้านจริงให้อนุมัติ
- ผู้กำกับว่าถนน/พื้นมั่ว ไม่สมจริง → สาเหตุ: TL1 เป็นร่องมีขอบนูน + ไทล์ 32px ทำทางเป็นขั้นบันได + ถนนชนแม่น้ำแล้วขาด + วางสุ่ม. สั่งชุดใหม่ใน Prompt Book ⓪: FT1-3 (ไทล์ 16px ทางเรียบเสมอหญ้า ขอบนุ่ม, ลานหิน, ริมน้ำ), FD1-8 ของประดับพื้น (decals), FB1 สะพานมองบน. TODO เมื่อได้: ออกแบบผังหมู่บ้านจริง (ถนนโค้งตามผัง กว้าง 2-3 ไทล์) + โรย decal
- FT2 (ลานหิน) FT3 (ริมน้ำ) 16px ใช้แล้ว: พื้น ?td เป็นกริด 16px, หญ้าฐาน = FT2 LLLL (FT3 ลายหญ้าซ้ำเป็นเส้น), ถนนปูหินชั่วคราว (FT1 รอบแรกได้หญ้าล้วน ใช้ไม่ได้ → แก้ prompt FT1b). decals (กก ใบไม้ กรวด ดอกไม้ กอหญ้า) โรยแล้ว; ต้นไม้ขยาย 2x ชั่วคราว (ขอ OB1-3 ที่ 128px); กองไฟมีแสงกะพริบ+ประกายไฟ. สะพาน batch9 ยังเป็นมุมข้าง → ใช้ FB1
- อาคาร PixelLab มุมไม่ตรงกัน (บางหลังเฉียง) → prompt BD ใหม่บังคับ FRONT (หันหน้าตรงลง หลังคาขวาง ไม่ isometric) + ขั้นตอนเลือก Direction South / ใส่ภาพอ้างอิงบ้าน Lv3
- ซูม ?td = max(1.5, round(h/480*2)/2) (ตัวละครเล็กลง เห็นแมพกว้าง)
- สเกลคน/บ้าน: ย่อสไปรต์ด้วยโค้ด (สเกลไม่ลงตัว) เสียพิกเซล → แนวทาง: เจนอาคารใหญ่ขึ้น (Lv1 192/Lv3 224/Lv5 256) ต้นไม้ 160-192 แทนการย่อคน
- ขยายสิ่งปลูกสร้างทั้งหมดใน Prompt Book (คนคงที่ 48px): อาคาร 128/160→192/224/256, ต้นไม้ 64/96→160/192, รั้ว 32→48, โคม/บ่อ 48→64, เกวียน 48→64, ป้าย 32→48, แผงตลาด 64→96, กองซุง 48→64, หินแร่ 48→64, สะพาน 96→128
- PixelLab API ใช้ได้ (token ใน env RPG-Newgame, host api.pixellab.ai). tools/pixellab_api.py (map_object), tools/gen_buildings.py (อาคาร 192px high top-down + color_image จาก house_1, คัดเฉียงด้วยความเรียบของขอบล่าง), tools/gen_props.py (ต้นไม้ 160-192, โคม บ่อ แผง เกวียน ป้าย ซุง สะพาน), tools/gen_chars.py (ตัวละคร create-character-v3 + animations pixminimax walk/attack, state.json กันซ้ำ, ZIP → art-source/pixellab/chars/), tools/import_chars.py → src/assets/td/<key>_{idle,walk,attack}.webp + chars.json, src/world/chars.ts (preload/anim/setIdle/playAnim ใช้ร่วม). import_td_objs.py รวมไฟล์ api/ ทับของเดิม + ตรวจปล่องไฟ (chim) → ควัน. ผังหมู่บ้าน ?td จัดใหม่ (อาคารใหญ่, ต้นไม้ไม่ขึ้นในหมู่บ้าน). ค่าใช้: ตัวละคร 48px = 2 gen, ท่าละ 1 gen/ทิศ, อาคาร 1 gen/รูป
