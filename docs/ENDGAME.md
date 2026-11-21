# 🔜 Lv100 endgame plan (director 16 Nov 2026: build before OBT): ideas only, nothing built yet

Why: `MAX_LEVEL = 100` (`src/systems/stats.ts`). At 100, `gainExp` stops counting, skill points stop, and gear is already capped at
+10 (`MAX_UPGRADE`, `src/data/items.ts`). A capped player has nothing to grow. Live (16 Nov): one hero at Lv100 (admin) and one at 87, so
the problem arrives at OBT.

**Ask the director which items to build before starting.** Recommended order: A → B → C. D–F come later.
Follow the house rules in HANDOFF §1: Thai, short replies; no deploy until "อัพ"; never show rates; server is authoritative.

---

## A. ⭐ Glory stars (Paragon): EXP keeps working after 100 (smallest job, do first)
- Rules file: new `src/systems/paragon.ts`. State: `s.para = { lv, exp, pts: {atk, hp, def, crit} }` (optional fields, old saves = 0).
- In `gainExp`: when `s.level >= MAX_LEVEL`, add the EXP to `para.exp` instead. Each star needs `PARA_EXP = expToNext(99) * 1.0`, a flat
  cost so stars come at a steady pace. Each star gives 1 point.
- Point spend (small, capped): ATK +0.3%, HP +0.4%, DEF +0.3%, crit +0.1% per point. **Cap 200 stars** (max about +60% of one stat) so
  newcomers in PvP aren't left behind forever. PvP (`pvpDamage`) and guild war use only half the bonus.
- Apply in `deriveStats` (the same place gear stats are summed). The server handler `paraSpend` runs through `act()`, and the server
  replays it, so the stats can't be faked. Reset costs gold (e.g. 50,000).
- UI: a "⭐ ดาวเกียรติยศ" section in the stats panel under the skills, with a small star number next to the level in the HUD ("Lv100 ⭐12").
- Tests: `tests/paragon.test.ts`: EXP at 100 goes into stars, cap 200, spending can't exceed points, PvP halving.

## B. 🗼 Abyss Tower: endless floors and a weekly ranking (main content)
- A solo instance map (like the dungeon, `dungeonHpK`), Lv100 only (or Lv80+). Floor n: a small room, kill everything within 3 minutes
  to go up. Monster level = 100 + n/2, HP and ATK grow ×1.04 per floor. Every 10th floor is a boss (reuse the bounty/roaming boss art).
- Entry: 3 times a day (free) and +2 more with diamonds. Keep `bestFloor` and `weekBest`.
- **The server decides**: the client sends `towerStart` → the server notes the floor, start time and run id. `towerClear` succeeds only
  when the server's kill count for that run matches and the time isn't impossibly short (same idea as the econ kill check). Rewards are
  paid only by the server handler.
- Rewards per floor: gold, mana shards, and from floor 30+ an "Abyss crystal" (`abyss_shard`, new item, used by C).
  First clear of each 10th floor pays once more (`towerFirst` set).
- Weekly ranking (Monday 00:00 Bangkok): top 10 get a title and wing/mount-effect stars; put it in the leaderboard window as a new tab.
  Store the board in the Room/KV (e.g. kv `tower:<week>`), never let the client write it.
- Art: reuse the existing dungeon tiles. Optional single PixelLab sample (talk to the director before generating any image).

## C. 💠 Awakening SL gear: +11 to +15 (gives gold and crystal a sink)
- Only for SL (rar 5) gear and Lv100 heroes. Raise `MAX_UPGRADE` per item: `maxUpg(it) = it.rar >= 5 && level >= 100 ? 15 : 10`
  (`inventory.ts:118` uses `MAX_UPGRADE` now, so change it to use the function).
- Each step costs `abyss_shard` (from B) plus gold, with a low success chance. On failure the level **does not drop** (players hate losing
  progress), only the materials are used. Never show the chance as a number; show "ยาก / ยากมาก" words only.
- Stat per step above 10: +4% (smaller than steps 1–10) so it can't run away. Name glow colour changes at +11 and +15
  (`Panels.upgradeCard` shows it).
- Tests: rar < 5 or level < 100 can't go past 10; failure keeps the level; stat curve.

## D. 🐲 Weekly world boss (later)
- Saturday 20:00, one huge boss in a map everyone joins (mapSim, like the roaming boss but HP scales with the number of heroes).
  Rewards by damage share (the top 3 get extra); everyone who hit it gets a chest. Make sure it doesn't clash with the PvP hours (20–22):
  **put it at 19:00 or Sunday.**

## E. 📖 Monster codex / collections (later, low risk)
- Kill N of each kind → page done → small permanent stat (+0.5% each, cap +10%). Gives Lv100 heroes a reason to visit the old maps.

## F. 🔄 Rebirth (only if the director wants it, highest risk)
- Go back to Lv1 and keep gear (locked until the level comes back) plus a permanent +5% and a title. Big balance risk and a
  long build. **Not recommended before OBT.**

---
## Anti-inflation checklist (for every item)
- Every reward is paid by a server handler only. Add the new fields to the server's save check/allow-list.
- Daily limits (tower entries) are counted on the server in Bangkok days, like the tonic limit (`economy.ts`).
- Show no chances/percentages for upgrades or drops (director rule).
- PvP and guild war: halve or ignore the new bonuses, so a Lv100 whale doesn't one-shot new players.
- Write the news (`news` id) only for what the director approves, and leave secret balance numbers out.
- Before deploy: `npx tsc --noEmit -p .`, the server tsc (see HANDOFF §2), `npm test`, `npm run build`, and a Playwright test in the
  real game. Deploy only when the director types "อัพ".
