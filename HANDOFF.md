# HANDOFF — Mourncrown (ป่าต้องสาป) · อ่านไฟล์นี้ก่อนเริ่มงาน

อัปเดต: 2026-11-09 · branch **`ccr-dcfcac78-b3qj60`** (push ที่นี่เท่านั้น) · เว็บ: https://seeker6131.github.io/RPG-Newgame/
ประวัติงานเก่าทั้งหมด (ละเอียด แต่บางส่วนล้าสมัย): `docs/HANDOFF_HISTORY.md` · ดีไซน์: `docs/GAME_DESIGN.md` · ความเสี่ยงออนไลน์: `docs/ONLINE_RISKS.md`

---
## 1. ผู้ใช้ (Game Director) — กฎที่ต้องทำตามเสมอ
- คุยภาษาไทย (สั้น ตรง) · ใช้ Android เป็นหลัก · **ไม่เขียนโค้ด** → เราทำทุกอย่าง แก้ commit push เอง แล้วสรุปผลแบบคนไม่เขียนโค้ดอ่านรู้เรื่อง
- **รายงานโควต้า PixelLab ทุกครั้งที่ตอบ** (`python3 tools/pixellab_api.py balance`) — ณ ตอนนี้ **เหลือ 8 / 2000**
- **ทุกอย่างที่เสี่ยงโกง → ฝั่งเซิร์ฟ** (ดูข้อ 4) และ **แจ้งความเสี่ยงออนไลน์ก่อน OBT เสมอ** (อัปเดต `docs/ONLINE_RISKS.md`)
- ห้ามสั่นจอ · เพชรได้จากเติมเงินจริงเท่านั้น · ห้าม pay-to-win · VIP 3/7/15 วัน
- **ห้ามโชว์อัตรา/เปอร์เซ็นต์โอกาสใดๆ ให้ผู้เล่น** (รู้แค่หลังบ้าน) · เรทของแรร์ต้องยาก (SL ~1/12,000 + การันตี 15,000)
- ทรัพยากรห้ามเฟ้อ (มีเทสล็อก `tests/economy.test.ts`) · มอน ≠ ทรัพยากร (แผนที่มอนให้ EXP/ทอง/ของ, ทรัพยากรมาจากป่าดงดิบเท่านั้น)
- ออโต้ = ตีมอนเท่านั้น (ป่าดงดิบต้องเก็บเอง)
- เงา: โทนเดิม ไม่มีกลางวัน/กลางคืน เงาทอดไปทิศใต้ทางเดียว (เงาวงรีถูกยกเลิก)
- ไม่มีเพลงพื้นหลัง (เอาออกแล้วตามสั่ง) — มีแค่เสียงเอฟเฟกต์
- เกมต้องเล่นเต็มจอได้ทุกแพลตฟอร์ม · ภาษาเริ่มต้นอังกฤษ สลับไทยได้ → **ข้อความไทยใหม่ทุกอันต้องเพิ่มคำแปลใน `src/core/i18n.ts`** (ห้าม key ซ้ำ → TS1117)
- ห้ามคัดลอกเกมอื่น (ชื่อ/ภาพ/ของ) — รูปอ้างอิงที่ผู้ใช้ส่งมาใช้แค่ "แนวคิดการจัดวาง"

## 2. รันเกม / ทดสอบ / Deploy
```bash
npm ci
npm test                    # vitest 65 เทส (ต้องผ่านก่อน push — CI รันด้วย)
npx tsc --noEmit -p .       # type check
npm run build               # dist/
npx vite --port 5173        # dev server (ทดสอบด้วย Playwright ที่ติดตั้งในเครื่องแล้ว)
```
- push branch → `.github/workflows/deploy.yml` test+build → `gh-pages` → GitHub Pages อัปเดตเอง (~2-3 นาที)
- ทดสอบในเบราว์เซอร์: `window.__game` (Phaser), `window.__tdS()` (state ผู้เล่น), ฉาก `TopDown` (`scene.start('TopDown', { stage: n })`), `TdUI` (HUD, `.panels.open('ชื่อ')`)
  - stage: `0` หมู่บ้าน · `1-50` แผนที่มอน · `100` ป่าดงดิบ (WILD) · `200-204` ดันเจี้ยน (DUNGEON+ดินแดน)
  - หยุดฉากก่อน start ใหม่ (`getScenes(true).forEach(s=>s.scene.stop())` รอ 300ms) ไม่งั้นค้าง
- ⚠️ อย่าทิ้งภาพทดสอบไว้ที่รากโปรเจกต์ (`/*.png` ถูก ignore แล้ว) — ใช้ scratchpad

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
| `src/world/pfx.ts` | **เอฟเฟกต์สกิล pixelfx** — `SKILL_PFX` (สกิล→เอฟเฟกต์), `ensurePfx` โหลดเฉพาะสกิลปัจจุบัน, `playPfx` |
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
- ตอนนี้ handlers รันในเครื่องผู้เล่น (ยังโกงได้) → ขั้นต่อไป: ย้าย `src/server` + `systems` ไปรันบน **Cloudflare Workers + Durable Objects** (1 ห้องป่าดงดิบ = 1 DO), เซฟใน D1, ล็อกอิน Google, ตรวจใบเสร็จ Google Play ที่เซิร์ฟ — ผู้ใช้ต้องสมัคร Cloudflare ก่อน (ให้ใส่ token ผ่าน request_credential ห้ามวางในแชต)
- ก่อน OBT: `DEV_TOOLS=false`, ตั้ง repo เป็น private (อัตราดรอปอยู่ในโค้ด), ลบ `window.__tdS`/`__game` debug

## 5. ระบบที่มีแล้ว (ย่อ)
หมู่บ้าน (อาคาร NPC 9 + บ้านผู้เล่น, ผลิตของ, อัปเกรด) · 50 แผนที่มอน (ปลดตามเลเวล, มอนไม่ตีก่อน, บอสทุก 10) · 5 สาย × 4 ร่าง 37 สกิล · อุปกรณ์ 6 ระดับ + ตีบวก + หลอม + เซ็ต 5 ชุด · ของตกพื้น/วิ่งเข้าตัว/แย่งได้ + ป๊อปอัพตามความแรร์ + ประกาศ SL · มอนทอง 3% · ป่าดงดิบ (ห้อง 100 คน, 5 เหมือง, ผลึกเรืองแสง, สัตว์หนี/ถีบ, ตอไม้ + เวลาเกิดใหม่, แรงรายวัน) · ปรุงยาจากแร่ (ยาเทพชั่วคราว) · ดันเจี้ยนรายวัน · ภารกิจต่อเนื่อง + รายวัน · ล็อกอิน 7 วัน · สอนเล่น 9 ขั้น · ความสำเร็จ/ฉายา/สมุดมอน · โปรไฟล์ · VIP/ร้านเพชร (ยังไม่เปิดเงินจริง) · ตลาดกลาง (ยังเป็นตัวอย่าง) · มินิแมพ · เต็มจอ (Android/iPad API, iPhone ผ่าน Add to Home Screen + manifest)

## 6. งานภาพ / ไลบรารีภายนอก
- **PixelLab** (`tools/pixellab_api.py`, token อยู่ใน env ของ proxy): ตัวละคร `tools/gen_chars.py`+`import_chars.py`, ของ `gen_jungle.py`/`gen_props.py`+`import_td_objs.py`, ไอคอน `gen_item_icons.py`, เอฟเฟกต์ `gen_vfx.py`+`import_vfx.py`
  - ⚠️ `import_chars.py` แก้ภาพที่โดนตัดขอบอัตโนมัติ และบอส (`bs*`) ใช้ท่าเดินชุดเก่า (แม่แบบ walking ทำบอสเพี้ยน) — ถ้าจะ import แค่บางตัว ให้ build ทีละ key แล้ว merge `chars.json` (ดูประวัติ) อย่ารันทั้งชุดทับถ้าไม่จำเป็น
  - ❌ **มังกร bs3 ปีกขาดตั้งแต่ตอนเจน** (วาดบน 128px ปีกโดนตัด) แก้ด้วยโค้ดไม่ได้ ต้องเจนใหม่บนกระดาษใหญ่ (~20 โควต้า) — รอผู้ใช้ตัดสินใจ (เติมโควต้า / ใช้ 8 ที่เหลือทำบางท่า / ตัดปลายปีกให้ดูขาดรุ่ย)
- **pixelfx** (MIT, https://github.com/patch-gg/pixelfx): clone แล้ว `node tools/render.mjs <หมวด/ชื่อ> --sheet --no-actor --out RAW` → `python3 -I tools/import_pfx.py RAW` (ตัดความยาว/START/หา peak) → `src/assets/pfx/*.webp + pfx.json` → ผูกสกิลใน `src/world/pfx.ts SKILL_PFX` · ใบอนุญาต `src/assets/pfx/LICENSE.txt` (ห้ามลบ) · ฟอนต์ของ pixelfx ไม่ใช่ MIT ห้ามใช้
- **Kenney RPG Audio** (CC0) ใน `src/assets/sfx/` · ปกเกมจากผู้ใช้ `art-source/title/cover_mourncrown.jpg`
- คู่มือโปรโมทล่าสุดทำจาก HTML + Playwright (ภาพในเกมจริง, ฟอนต์ Kanit) — สคริปต์ไม่ได้อยู่ใน repo

## 7. ค้าง / ถัดไป
1. **มังกรปีกขาด** (ข้อ 6) — รอผู้ใช้
2. **เซิร์ฟจริง** (ข้อ 4) → แชต, ปาร์ตี้, กิลด์, บอสโลก, ตลาดจริง, PvP, จุติหลัง Lv100
3. เพลงพื้นหลัง: ผู้ใช้สั่งเอาออก (อย่าใส่กลับเองโดยไม่ถาม)
4. ชื่ออังกฤษบอส "Hollow Crown" ซ้ำกับชื่อเกมอื่นที่ pixelfx อ้างถึง — แจ้งผู้ใช้แล้ว ยังไม่ตัดสินใจ
5. iPhone เต็มจอยังไม่ได้ทดสอบบนเครื่องจริง
