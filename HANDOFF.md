# HANDOFF — Mourncrown (ป่าต้องสาป) · อ่านไฟล์นี้ก่อนเริ่มงาน

> ใช้ได้กับ AI ทุกตัว (Claude / ChatGPT-Codex / อื่นๆ). ผู้ทำต่อต้องมีสิทธิ์ push ที่ repo `seeker6131/RPG-Newgame` และรัน `npm`, `python3`, Playwright ได้

อัปเดต: 2026-11-09 · branch **`ccr-dcfcac78-b3qj60`** (push ที่นี่เท่านั้น) · เว็บ: https://seeker6131.github.io/RPG-Newgame/
ประวัติงานเก่าทั้งหมด (ละเอียด แต่บางส่วนล้าสมัย): `docs/HANDOFF_HISTORY.md` · ดีไซน์: `docs/GAME_DESIGN.md` · ความเสี่ยงออนไลน์: `docs/ONLINE_RISKS.md`

---
## 1. ผู้ใช้ (Game Director) — กฎที่ต้องทำตามเสมอ
- คุยภาษาไทย (สั้น ตรง) · ใช้ Android เป็นหลัก · **ไม่เขียนโค้ด** → เราทำทุกอย่าง แก้ commit push เอง แล้วสรุปผลแบบคนไม่เขียนโค้ดอ่านรู้เรื่อง
- **รายงานโควต้า PixelLab ทุกครั้งที่ตอบ** (`python3 tools/pixellab_api.py balance`) — โควต้ารายเดือน **0 / 2000** แต่ผู้ใช้ **เติมเครดิต $10** แล้ว (2026-11-11) — API ใช้เครดิตได้เลย; ยังไม่รู้ราคาต่อครั้ง (เจนไป 1 ครั้ง ยอดยังโชว์ $10.00) ให้เช็คยอดก่อน/หลังทุกชุด
- **ทุกอย่างที่เสี่ยงโกง → ฝั่งเซิร์ฟ** (ดูข้อ 4) และ **แจ้งความเสี่ยงออนไลน์ก่อน OBT เสมอ** (อัปเดต `docs/ONLINE_RISKS.md`)
- ห้ามสั่นจอ · เพชรได้จากเติมเงินจริงเท่านั้น · ห้าม pay-to-win · VIP 3/7/15 วัน
- **ห้ามโชว์อัตรา/เปอร์เซ็นต์โอกาสใดๆ ให้ผู้เล่น** (รู้แค่หลังบ้าน) · เรทของแรร์ต้องยาก (SL ~1/12,000 + การันตี 15,000)
- ทรัพยากรห้ามเฟ้อ (มีเทสล็อก `tests/economy.test.ts`) · มอน ≠ ทรัพยากร (แผนที่มอนให้ EXP/ทอง/ของ, ทรัพยากรมาจากป่าดงดิบเท่านั้น)
- ออโต้ = ตีมอนเท่านั้น (ป่าดงดิบต้องเก็บเอง)
- **ของทุกชิ้นมีระดับความแรร์ตายตัว** (ดาบไม้ = Common เสมอ … ดาบอวสานคำสาป = SL) ไม่มีเลเวลขั้นต่ำ ใครใส่อะไรก็ได้ ของผิดสายได้ค่า 60% (`OFF_CLASS_MULT`) · ค่าพลังมาจากตาราง `GEAR_T/GEAR_D/GEAR_H` ใน `data/items.ts` · ดรอป = สุ่มระดับ (`rollRarity`) แล้วเลือกของระดับนั้น (`pickBase(rnd, rarity, cls, slot)`) · ไอคอน Legend/SL = ย้อมสีจาก Super Rare (`tools/make_tier_icons.py`) จนกว่าจะมีโควต้าเจนจริง
- เงา: โทนเดิม ไม่มีกลางวัน/กลางคืน เงาทอดไปทิศใต้ทางเดียว (เงาวงรีถูกยกเลิก)
- ไม่มีเพลงพื้นหลัง (เอาออกแล้วตามสั่ง) — มีแค่เสียงเอฟเฟกต์
- เกมต้องเล่นเต็มจอได้ทุกแพลตฟอร์ม · ภาษาเริ่มต้นอังกฤษ สลับไทยได้ → **ข้อความไทยใหม่ทุกอันต้องเพิ่มคำแปลใน `src/core/i18n.ts`** (ห้าม key ซ้ำ → TS1117)
- ห้ามคัดลอกเกมอื่น (ชื่อ/ภาพ/ของ) — รูปอ้างอิงที่ผู้ใช้ส่งมาใช้แค่ "แนวคิดการจัดวาง"

## 2. รันเกม / ทดสอบ / Deploy
```bash
npm ci
npm test                    # vitest 66 เทส (ต้องผ่านก่อน push — CI รันด้วย)
npx tsc --noEmit -p .       # type check
npm run build               # dist/
npx vite --port 5173        # dev server (ทดสอบด้วย Playwright ที่ติดตั้งในเครื่องแล้ว)
```
- push branch → `.github/workflows/deploy.yml` test+build → `gh-pages` → GitHub Pages อัปเดตเอง (~2-3 นาที)
- ทดสอบในเบราว์เซอร์: `window.__game` (Phaser), `window.__tdS()` (state ผู้เล่น), ฉาก `TopDown` (`scene.start('TopDown', { stage: n })`), `TdUI` (HUD, `.panels.open('ชื่อ')`)
  - stage: `0` หมู่บ้าน · `1-50` แผนที่มอน · `100` ป่าดงดิบ (WILD) · `200-204` ดันเจี้ยน (DUNGEON+ดินแดน)
  - หยุดฉากก่อน start ใหม่ (`getScenes(true).forEach(s=>s.scene.stop())` รอ 300ms) ไม่งั้นค้าง
- ⚠️ อย่าทิ้งภาพทดสอบไว้ที่รากโปรเจกต์ (`/*.png` ถูก ignore แล้ว) — ใช้โฟลเดอร์ชั่วคราวนอก repo

## 3. โครงสร้างโค้ด
| ที่ | อะไร |
|---|---|
| `src/scenes/BootScene` `TitleScene` | โหลด + หน้าแรก (ปก `src/assets/title/keyart.jpg` ครอปให้เห็นตัวละคร+โลโก้) |
| `src/scenes/TopDownScene.ts` | โลกเกมทั้งหมด: หมู่บ้าน/แผนที่มอน/ป่าดงดิบ/ดันเจี้ยน, พื้น (Wang tiles), วางของ, เงา, ออโต้ (A* `world/pathfind.ts`), เก็บทรัพยากร, สอนเล่น, ประตู, มินิแมพ `mapInfo()` |
| `src/scenes/TdUIScene.ts` | HUD (HP/MP/EXP, ทรัพยากร, ภารกิจ, ปุ่มเมนู, สกิล, AUTO), แถบสอนเล่น, ป๊อปอัพของแรร์, แถบประกาศเซิร์ฟ, แตะรูป = โปรไฟล์ |
| `src/ui/panels.ts` | หน้าต่างทั้งหมด (bag stats quest menu shop smith job forms wardrobe stages premium market alchemy rooms login collection dungeon profile uiopt plot dialog) |
| `src/ui/minimap.ts` `lootPopup.ts` `kit.ts` `skin.ts` | มินิแมพ, ป๊อปอัพแรร์ + ticker, ปุ่ม/ข้อความ, กรอบ UI |
| `src/world/tdCombat.ts` | มอน, การต่อสู้, สกิล (`castSkill`), ของตกพื้น (`dropLoot/pickLoot`), มอนทอง, ดันเจี้ยนเป็นคลื่น |
| `src/world/vfx.ts` | เอฟเฟกต์โค้ด + ภาพ PixelLab (`art()`) |
| `src/world/pfx.ts` | **เอฟเฟกต์สกิล pixelfx** — `SKILL_PFX` (สกิล→เอฟเฟกต์), `ensurePfx` โหลดเฉพาะสกิลปัจจุบัน, `playPfx` · มอนตีเรา: `tdCombat.ts` `BOSS_FX` (ท่าพิเศษบอสตามดินแดน), `MONSTER_PFX`, `HEAVY`, `RANGED_COL` (มอนยิงไกลยิงกระสุนจริง) · มอน/บอสหยุดเดินตอนโจมตี (`busy`) |
| `src/world/stages.ts` | 50 แผนที่/5 ดินแดน, WILD, DUNGEON, PITS (เหมือง), `scaleStats` (บาลานซ์มอน) |
| `src/world/chars.ts` `npcs.ts` `crowd.ts` | ตัวละคร PixelLab (manifest `src/assets/td/chars.json`), ชาวบ้าน, ผู้เล่นจำลองในป่า |
| `src/systems/*` | กติกาเกม pure (ไม่มี Phaser) — rewards loot stats inventory settlement alchemy economy progress premium market daily quests tdQuests supplies skillCast testKit |
| `src/server/handlers.ts` `config.ts` | **ชั้นเซิร์ฟ** — ทุกการกระทำที่ได้ของมีค่า (ดูข้อ 4) · `DEV_TOOLS` (ปุ่มทดสอบ) · `WILD_ROOM_CAP=100` |
| `src/net/client.ts` | `act('ชื่อ', args)` = ทางเดียวที่ UI/ฉากเปลี่ยนของมีค่า |
| `src/data/*` | ไอเทม สกิล มอน คลาส อาคาร สูตรยา เซ็ต ความสำเร็จ ภารกิจ |
| `src/core/*` | state/save (localStorage), i18n, fullscreen, uiOptions, wait overlay |
| `src/audio/sfx.ts` `skillSfx.ts` | เสียง Kenney (CC0) + เสียงสกิลสังเคราะห์ |

## 4. ชั้นเซิร์ฟ (สำคัญมาก)
- UI/ฉาก **ห้าม** import ฟังก์ชันที่เปลี่ยนค่าจาก `systems/*` ตรงๆ → เรียก `act()` เท่านั้น → `server/handlers.ts` ตัดสิน (เช็คเลเวล แผนที่ มอนต้อง spawn จริง ดาเมจต่อวินาที อัตราการกด สุ่มของที่เซิร์ฟ)
- ตอนนี้ handlers รันในเครื่องผู้เล่น (ยังโกงได้) → ขั้นต่อไป: ย้าย `src/server` + `systems` ไปรันบน **Cloudflare Workers + Durable Objects** (1 ห้องป่าดงดิบ = 1 DO), เซฟใน D1, ล็อกอิน Google, ตรวจใบเสร็จ Google Play ที่เซิร์ฟ — ผู้ใช้ต้องสมัคร Cloudflare ก่อน (API token ใส่เป็น secret/env ของเครื่องที่รัน ห้ามให้วางในแชตและห้าม commit)
- ก่อน OBT: `DEV_TOOLS=false`, ตั้ง repo เป็น private (อัตราดรอปอยู่ในโค้ด), ลบ `window.__tdS`/`__game` debug

## 5. ระบบที่มีแล้ว (ย่อ)
หมู่บ้าน (อาคาร NPC 9 + บ้านผู้เล่น, ผลิตของ, อัปเกรด) · 50 แผนที่มอน (ปลดตามเลเวล, มอนไม่ตีก่อน, บอสทุก 10) · 5 สาย × 4 ร่าง 37 สกิล · อุปกรณ์ 6 ระดับ + ตีบวก + หลอม + เซ็ต 5 ชุด · ของตกพื้น/วิ่งเข้าตัว/แย่งได้ + ป๊อปอัพตามความแรร์ + ประกาศ SL · มอนทอง 3% · ป่าดงดิบ (ห้อง 100 คน, 5 เหมือง, ผลึกเรืองแสง, สัตว์หนี/ถีบ, ตอไม้ + เวลาเกิดใหม่, แรงรายวัน) · ปรุงยาจากแร่ (ยาเทพชั่วคราว) · ดันเจี้ยนรายวัน · ภารกิจต่อเนื่อง + รายวัน · ล็อกอิน 7 วัน · สอนเล่น 9 ขั้น · ความสำเร็จ/ฉายา/สมุดมอน · โปรไฟล์ · VIP/ร้านเพชร (ยังไม่เปิดเงินจริง) · ตลาดกลาง (ยังเป็นตัวอย่าง) · มินิแมพ · เต็มจอ (Android/iPad API, iPhone ผ่าน Add to Home Screen + manifest)

## 6. งานภาพ / ไลบรารีภายนอก
- **PixelLab** (`tools/pixellab_api.py`, token อยู่ใน env ของ proxy): ตัวละคร `tools/gen_chars.py`+`import_chars.py`, ของ `gen_jungle.py`/`gen_props.py`+`import_td_objs.py`, ไอคอน `gen_item_icons.py`, เอฟเฟกต์ `gen_vfx.py`+`import_vfx.py`
  - ⚠️ `import_chars.py` แก้ภาพที่โดนตัดขอบอัตโนมัติ และบอส (`bs*`) ใช้ท่าเดินชุดเก่า (แม่แบบ walking ทำบอสเพี้ยน) — ถ้าจะ import แค่บางตัว ให้ build ทีละ key แล้ว merge `chars.json` (ดูประวัติ) อย่ารันทั้งชุดทับถ้าไม่จำเป็น
  - ✅ มังกร bs3 เจนใหม่แล้ว (`tools/gen_dragon2.py`, zip `chars/bs3b.zip`, canvas 176/240): idle 8 ทิศ + เดิน S/E/N (W = กลับด้าน E). ⚠️ ยังไม่มีท่าโจมตี/ท่าพิเศษ/ท่าตายของตัวใหม่ (ใช้ท่าเดิน + พุ่ง + เอฟเฟกต์แทน) — ถ้าเติมโควต้า: `python3 -I tools/gen_dragon2.py anim attack south|east|north` แล้ว zip + import ใหม่ · ขนาดในเกมย่อด้วย `SPRITE_SCALE` ใน tdCombat.ts
- **pixelfx** (MIT, https://github.com/patch-gg/pixelfx): clone แล้ว `node tools/render.mjs <หมวด/ชื่อ> --sheet --no-actor --out RAW` → `python3 -I tools/import_pfx.py RAW` (ตัดความยาว/START/หา peak) → `src/assets/pfx/*.webp + pfx.json` → ผูกสกิลใน `src/world/pfx.ts SKILL_PFX` · ใบอนุญาต `src/assets/pfx/LICENSE.txt` (ห้ามลบ) · ฟอนต์ของ pixelfx ไม่ใช่ MIT ห้ามใช้
- **Kenney RPG Audio** (CC0) ใน `src/assets/sfx/` · ปกเกมจากผู้ใช้ `art-source/title/cover_mourncrown.jpg`
- คู่มือโปรโมทล่าสุดทำจาก HTML + Playwright (ภาพในเกมจริง, ฟอนต์ Kanit) — สคริปต์ไม่ได้อยู่ใน repo

## 7. ค้าง / ถัดไป
0. **อ่านข้อ 8.5 ก่อน** (งานภาพ/ท่าทางที่ทำค้าง)
1. มังกรใหม่ยังขาดท่าโจมตีเฉพาะ (ข้อ 8.5)
2. **เซิร์ฟจริง** (ข้อ 4) → แชต, ปาร์ตี้, กิลด์, บอสโลก, ตลาดจริง, PvP, จุติหลัง Lv100
3. เพลงพื้นหลัง: ผู้ใช้สั่งเอาออก (อย่าใส่กลับเองโดยไม่ถาม)
4. ชื่ออังกฤษบอส "Hollow Crown" ซ้ำกับชื่อเกมอื่นที่ pixelfx อ้างถึง — แจ้งผู้ใช้แล้ว ยังไม่ตัดสินใจ
5. iPhone เต็มจอยังไม่ได้ทดสอบบนเครื่องจริง

## 8. งานล่าสุด (2026-11-10)
- ระบบของ: **ของทุกชิ้นมีระดับตายตัว** + ไม่มีเลเวลขั้นต่ำ (ดูข้อ 1) · ของ Legend/SL ใหม่ 12 ชิ้น + สร้อย Common
- หน้า **Armory** (แกลเลอรีไอเทมสำหรับโปรโมท) อยู่บน claude.ai ของผู้ใช้: https://claude.ai/artifact/N82NxPEDjdAFToMbYYg1nG — แก้ได้เฉพาะผ่าน Claude; AI อื่นให้สร้าง HTML ใหม่จากข้อมูล `src/data/items.ts` + ไอคอน `src/assets/icons/*.webp` (ฝังเป็น data URI) แล้วส่งไฟล์ให้ผู้ใช้
- เอฟเฟกต์สกิล/มอนตีเรา = pixelfx (ข้อ 6) · บอสใช้ท่าเดินชุดเก่า + มังกรใหม่ · เงาต้นไม้ = เงาพุ่มใบชิดโคน

## 8.5 ⏩ งานที่ทำค้างตอนเคลียร์แชท (2026-11-11) — ทำต่อจากตรงนี้
ผู้ใช้สั่งล่าสุด: **"ทำเกมที่เหลือให้สวย ทุกอย่างที่ไม่ดีทำเลย · ตัดไม้/ขุดแร่/ล่าสัตว์ ท่าทางแยกชัดเจน · ทำบอสให้สมบูรณ์ · ท่าทางฮีโร่ยังผิดพลาดเยอะ · ทำท่าให้เนียนมากๆ"** (อนุญาตใช้เครดิต PixelLab แล้ว)

**ทำเสร็จและ push แล้วในรอบนี้**
- บัคติดชิดต้นไม้: สกิลกระโดด/พุ่งลงได้เฉพาะจุดที่ยืนได้ (`TopDownScene.canStand / canLand / landing`, `PathGrid.flood/near/rescue`) + กันเหนียวดึงตัวออกเอง
- ⚠️ บั๊กที่ผมทำเอง (แก้แล้ว): กฎ "ทิ้งทิศที่มีเฟรมโดนตัดขอบ" ใน `import_chars.py` ทำให้ฮีโร่/มอนเสียท่าไปหลายทิศ → เอากฎออก ทุกตัวกลับมาครบ 8 ทิศ (**ห้ามทิ้งทิศอีก**)
- `import_chars.py normalise()`: ฮีโร่ + NPC ทุกท่า **ขนาดเท่าท่ายืน และเท้า/ลำตัวตรงตำแหน่งท่ายืนของทิศนั้น** (แก้อาการเดินแล้วตัวหด 10-15%, เริ่มตีแล้วตัวลอย)
- เครื่องมือใหม่: `python3 -I tools/reimport_chars.py <key...>` (นำเข้าเฉพาะตัว) · `python3 -I tools/audit_chars.py out.png hr2,hr7` (ดูภาพเทียบ ยืน/เดิน/ตี บนเส้นพื้นเดียวกัน)

**งานถัดไป เรียงตามลำดับ**
1. **ท่าเดินที่ของหาย** (แม่แบบ walking-8-frames ของ PixelLab ทำของในมือหาย) → เจนท่าเดินใหม่แบบ pixminimax (ข้อความ เช่น "walking forward with a clear stride, holding the staff") 8 ทิศ แล้ว `reimport_chars.py`:
   - `hr7` (จอมเวทร่าง 1): ไม้เท้าหายทิศ S, E, N, NW, W
   - `hr10` (ผู้พิทักษ์ร่าง 1): กระบองหายเกือบทุกทิศ โล่หายบางทิศ
   - `hr2` (อัศวิน): ทิศ NE, N, NW ผ้าคลุมแดง/ดาบหาย
   - ยังไม่ได้ตรวจครบ 8 ทิศ (ตรวจแค่ S/E ผ่าน): hero, hr1, hr3, hr4, hr5, hr6, hr9, hr11, hr12 → ใช้ `audit_chars.py` + ดูชีต walk ทุกทิศ
   - วิธีเจน: ดู `tools/gen_gather.py` (`POST /characters/animations` mode pixminimax, `animation_name`, `directions`), cid อยู่ใน `art-source/pixellab/chars/state.json`; ถ้าชื่อ animation ซ้ำ 'walking' ตัวนำเข้าจะเลือกโฟลเดอร์ `walking` ก่อน `walk` (ดู `frames_of`) — ตั้งชื่อใหม่แล้วแก้ `norm()`/ลำดับให้ใช้ชุดใหม่
2. **ชาวบ้านเก็บของ `hg`**: ท่าตัดไม้ (`chop`) มีตอไม้โผล่ในเฟรม → เจนใหม่ "swinging a wood axe sideways, no tree, no stump"; เพิ่มท่า **ล่าสัตว์ `hunt`** (หอก/มีดล่า) 8 ทิศ แล้วแก้ `TopDownScene.get swing()` ให้ตีสัตว์ใช้ `hunt` (ตอนนี้ใช้ `chop`) · ท่าขุด `mine` ใช้ได้
3. **บอส**: มังกรใหม่ `bs3b` — เจนท่าโจมตีทิศ **south ไว้แล้ว** (อยู่บน PixelLab, group id ใน state.json `attack_g`, ยังไม่ได้โหลด) เหลือ `python3 -I tools/gen_dragon2.py anim attack east` / `north` แล้ว `zip` · ยังไม่มี special/die ของตัวใหม่ · นำเข้า bs3 ต้องทำแบบพิเศษ: build จาก `chars/bs3b.zip`, ทิศ west = กลับด้าน east, ท่าที่ไม่มีให้คัดลอกจาก walk, ขนาดในเกมย่อด้วย `SPRITE_SCALE.bs3 = 0.62` (tdCombat.ts) — ดูโค้ดใน commit "Obsidian Serpent remade" · `bs5` ท่าเดินมีแค่ 2 ทิศ → เจนเพิ่ม north/west · ตรวจบอสทุกตัวทุกท่าด้วย audit
4. **ไอคอน Legend/SL** ตอนนี้เป็นรูปย้อมสี (`tools/make_tier_icons.py`) → เจนรูปจริงด้วย `tools/gen_item_icons.py` (ชื่อ icon: sword4/5, staff4/5, bow4/5, hammer4/5, armor4/5, gem4/5, ring_c)
5. มอนสเตอร์ยังไม่ได้ผ่าน normalise (เฉพาะฮีโร่/NPC) — ถ้าจะทำ ให้ดูผลทีละตัวก่อน (รูปร่างไม่ใช่คน)
6. ทุกครั้งที่แก้ภาพ: ดูด้วยตาผ่าน audit ก่อน commit และทดสอบในเกม (ทุกร่างเล่นท่าได้ครบ 8 ทิศ ไม่มี error)

## 9. Prompt เริ่มงาน (ก๊อปวางให้ AI ตัวใหม่)
```
คุณคือผู้พัฒนาเกม Mourncrown (Phaser 3 + TypeScript + Vite) ใน repo seeker6131/RPG-Newgame
branch ccr-dcfcac78-b3qj60 (ทำงานและ push ที่ branch นี้เท่านั้น)
1) อ่าน HANDOFF.md ให้ครบก่อนแก้อะไร แล้วทำตามกฎในข้อ 1 ทุกข้อ
2) ผู้ใช้คือ Game Director ไม่เขียนโค้ด คุยภาษาไทย สั้น ตรง — คุณแก้โค้ด รันเทส commit push เองทั้งหมด
3) ก่อน push ทุกครั้ง: npx tsc --noEmit -p . && npm test && npm run build ต้องผ่าน
4) ข้อความไทยใหม่ต้องเพิ่มคำแปลใน src/core/i18n.ts · ตรรกะที่ให้ของมีค่าต้องผ่าน act() → src/server/handlers.ts
5) หลังทำเสร็จสรุปให้ผู้ใช้เป็นภาษาไทยแบบคนไม่เขียนโค้ดอ่านรู้เรื่อง และอัปเดต HANDOFF.md ข้อ 7–8
```
