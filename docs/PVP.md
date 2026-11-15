# ⚔ PvP battlefield (สมรภูมิเลือด) — director 15 Nov 2026

- Map `PVP = 400` (`src/world/stages.ts`: `PVP_LAND`, `pvpStage`) — lava ground + war props `pp_war_*` (PixelLab, `tools/gen_props2.py`).
- Rules `src/systems/pvp.ts`: Lv40+, open `PVP_HOURS` (Bangkok 13–14, 20–22), entry fee `PVP_FEE` 5,000 gold per visit,
  3-minute lock-out after a fall, 10 s spawn shield. Rooms by level band `m400b0/1/2` (40-59 / 60-79 / 80+).
- Monsters: the later lands at the hero's level, HP x1.3, hit x0.6 (`PVP_MON_HP/ATK`; HP x1.3 since 15 Nov — normal monsters got the gear HP), Rare+ drops, gold x2.
- War bag: gold + items farmed on the battlefield this visit (`warBag`, server-written in `kill` / `pickup`). Leaving through
  a gate keeps it; a fall to a player drops it (`loseWarBag`, Player `/pvpdie`) on the ground for anyone (Room `pdrop` →
  `ppick` → Player `/pvpgain`, which puts it in the taker's own war bag). Worn / brought gear, VIP, diamonds, wings, mounts never drop.
- No return scroll, no mounts, no wing / cloud / VIP speed on the battlefield.
- Hero-vs-hero damage is the ROOM's (`Room.pvpMsg`, `pvpDamage`): a share of the target's HP — 1/12 at equal combat power
  (≈10-15 hits), x sqrt(power ratio), at least 6 hits, at most 30; class factor, ranged falloff past 110 px, melee take 15% less. Range and
  attack speed checked; the room keeps its own HP count (never above what the game reports).
- Not done yet: red names / bounties for killers, the treasure chest, weekly ranking.

## 📦 Treasure chests (15 Nov)
- One at a time, every 4-7 min (first 1-2 min after the room wakes), away from the heroes; goes after 3 min unopened.
- Stand within 44 px for 5 s; a hit from a hero stops it (room: `pcopen`/`pcdone`/`pcstop`/`pcgone`, Player `/pvpchest`).
- Prize (rates never shown; `src/systems/pvpChest.ts`): gold 3-8k ~66%, Super Rare ~24%, Legend ~8%, SL ~1.5%, Limited wing / golden dragon ~0.3%. Gold and gear go into the war bag; a Limited prize is kept at once.
