---
name: pixellab-art
description: Make Mourncrown game art with the PixelLab API right the first time — pick the right endpoint, write the prompt from the house style, test ONE sample in the game's own scene, then batch. Use before any PixelLab call (characters, animations, props, buildings, icons, effects, tiles) and whenever the director asks for new art or to fix art.
---

# PixelLab art for Mourncrown — first time right

The director pays per generation and hates re-doing art. Every image goes: **plan → cost → director OK → 1 sample → check in the game → batch → import → audit**. Never skip the sample.

## 0. Before anything
1. `python3 -I tools/pixellab_api.py balance` → note `credits.usd` (and `subscription.generations` left of 2000/month).
2. Tell the director in Thai, short: what you will make, how many images/directions, which endpoint, **estimated $**, and the risk. Wait for "ok / เจน". (Rule in HANDOFF: คุยก่อนเจนภาพทุกครั้ง.)
3. Credit updates 1-2 min late: check balance before and after every batch and report the real spend.

Prices measured on this account (Tier 1): character direction / animation direction ≈ **$0.02**, VFX `lite` ≈ **$0.005**, 48px icon / prop ≈ $0.01-0.02, big boss canvas (128-176px) costs more. Quote a range, round up.

## 1. Pick the endpoint (API spec: https://api.pixellab.ai/v2/openapi.json — re-read it when unsure, it changes)
| Need | Endpoint | Our script (reuse, do not rewrite) |
|---|---|---|
| New hero / monster / NPC with 8 directions | `POST /create-character-v3` (view `low top-down`, n_directions 8) | `tools/gen_chars.py` → `tools/import_chars.py` |
| Walk / attack / any move of an existing character | `POST /characters/animations` — **mode skeleton-v3** moves the standing pose (weapon, cape, face stay); 1 direction per request | `tools/gen_anim.py`, `gen_walk_fix.py`, `gen_attack_fix.py` |
| Props, ruins, furniture, map objects | `POST /map-objects` (view `high top-down`, `color_image` = our palette ref) | `tools/gen_props2.py`, `pixellab_api.map_object` |
| Buildings | `/map-objects` + `color_image` house_1 + symmetry filter, up to 7 tries | `tools/gen_buildings.py` |
| Item icons | `/map-objects` view `side`, 48×48, then crop → 40px webp | `tools/gen_item_icons.py` |
| Animated effects (hits, skills, portals, auras) | `POST /vfx` artist `lite` (pro = "PRO " prefix, costlier); `sprite` = build the effect around one of our objects | `tools/gen_vfx2.py` → `src/assets/td/fx` |
| Ground tiles | `/create-tileset` (Wang, 32px) | see HANDOFF history TL1-8 |
| Small fix on an existing image | `/inpaint-v3` (mask the bad part) — cheaper than regenerating | — |

Known dead ends (do not try again): `/create-room` is refused; PixelLab sounds need Tier 2; ruins/wrecks from PixelLab came out flat or as 3D houses (code-drawn ruins are used); asking several directions at once while another job runs hangs; downloading a character zip while it has a job running = HTTP 423 (scripts wait); image host `backblaze.pixellab.ai` is blocked here — read results from the zip / base64; VFX files come from `api.pixellab.ai/mcp/...` and need `curl`, not urllib.

## 2. The house style (paste, do not paraphrase)
- Characters: `<subject>, top-down pixel art, muted desaturated dark-forest colours, soft shading` · `outline: single color black outline` · `detail: high detail` · view `low top-down`.
- Props: `<subject>, a single object, seen from the front and slightly above like a classic 2D top-down RPG, upright, not isometric, no ground around it, pixel art, muted desaturated dark-forest colours, soft shading` · view `high top-down` · `color_image` = `gen_buildings.CI`.
- Buildings: add `symmetrical front facade facing the viewer, gable end facing the viewer, door in the centre, roof seen from above, not isometric, no corner facing the viewer`.
- Icons: `<subject>, single item icon, pixel art, diagonal pose, no background, game inventory icon`.
- VFX: `<what happens>, <colours>, seamless loop | no loop, about N seconds` + ` Pixel art for a muted, dark-forest fantasy game seen from the front and above; keep it readable at small size.`

## 3. Prompt rules that stop re-dos
1. **One subject, concrete nouns, colours named** ("a rusted iron lantern on a short post, warm orange glow"), never moods alone.
2. Say what must NOT happen in the positive text the model understands: `no ground around it`, `not isometric`, `no text`, `single object`. Use `negative_description` where the endpoint has it.
3. Fix the camera every time (`view`, `direction`) — mixed angles were the #1 reject (buildings came out diagonal).
4. Keep a **seed** for the approved sample and reuse it for the rest of the set → same look across the batch.
5. Consistency with existing art: pass `color_image` (palette) and, for edits, `init_image` + `init_image_strength` 300-500 instead of describing the old look.
6. Size = the size it is shown in the game (heroes 48-80px canvas, icons 48, props 64-192). Bigger is not better: it gets shrunk and blurs.
7. Animations: start from the character's own standing pose (skeleton-v3 / `keep_first_frame`), name the motion plainly ("swing the sword from right shoulder down to the left, 6 frames"), staff casters use the `CAST2` text (no staff swinging — it melts).
8. Never put effects into character frames (separate `/vfx`).

## 4. Check the ONE sample in the game before paying for the rest
- Objects / icons: open it next to the real neighbours at game scale (Playwright screenshot of the scene, `deviceScaleFactor: 1`, zoom 3) — look for angle, outline weight, palette, size.
- Characters / animations: first look at all 8 rotations side by side — `south` straight at the viewer, `east` a clean profile (else regenerate); import, then `python3 -I tools/audit_dirs.py <out.png> <key> walk,attack 2` (all 8 directions on one ground line) — floating, missing weapon, size jumps show at once. Also run the feet check: every direction's lowest pixels sit on the same line (see commit "Every hero form stands on the ground").
- Show the director the screenshot (SendUserFile) with the price of the full batch; batch only after "ok".

## 4b. Mounts and anything a hero sits on / wears (lessons of 14 Nov — the director rejected every riding picture)
1. **Check the facing of every rotation by eye BEFORE anything else** (`tools/mount_grid.py`): the `south` picture must look
   straight at the viewer, `east` must be a clean right profile. Four-legged characters often come out turned half a step
   (no picture is straight on) — then NO renaming fixes it (the animal and the rider face different ways). Regenerate
   that mount (another seed; say "standing facing the viewer, symmetrical front view"); don't try to rescue it in code.
2. A picture made by pasting a hero on an animal is NOT a preview. Only show the director what the game itself draws:
   import, add the def, ride it in the game (Playwright), screenshot every direction with 3 forms (small / caped / big
   armour). `tools/mount_preview.py` is only for my own first check.
3. Before sending, run the checklist on every frame and fix what fails: the animal faces where the rider faces · the hips
   sit IN the saddle dip (not on the rump, not in the air) · the near-side head / neck / rump covers the legs it should ·
   rider size vs animal looks like a real rider (scale the animal, never the hero) · same outline weight and light.
4. Saddles: read the seat point by eye on the grid (`tools/mount_seats_manual.json`); colour guessing (`mount_seats.py`)
   mistakes saddle cloths and fur for the seat.
5. One honest sentence about what is still wrong goes with every picture — never "looks good" unless it passes 1-3.

## 5. Batch, import, audit
- Run batches with ≤3 parallel workers (429 → the client backs off), 1 direction per request.
- Keep raw files under `art-source/pixellab/...`; game files under `src/assets/...` (webp lossless).
- Importers have rules — do not change them blindly (HANDOFF §6): heroes/NPC `normalise()`; monsters centred on the canvas; `retime()` heroes only; `hit_frame()` writes `hit`.
- After import: `npx tsc --noEmit -p . && npm test && npm run build`, a screenshot in the game, then report: what was made, real $ spent (balance before − after), what is left.
