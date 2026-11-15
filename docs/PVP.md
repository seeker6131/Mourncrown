# ⚔ Team Battlefield (director 15 Nov — replaced the open PvP map before it ever went live)
Rules: `src/systems/br.ts` · room: `Room.brGet/brTeamMsg/brTick/brOut/brFinish` in `server/worker.ts` · screen: `src/world/brView.ts` · tests: `tests/br.test.ts`, `tests/brRoom.test.ts`.
- Lv20+ (40 until 15 Nov late), rounds only in PVP_HOURS (13-14, 20-22 Bangkok), one every 20 min: 3 min lobby → 15 min fight → 2 min results. Room per round: `m400-<roundId>`. Enter only in the lobby (server `enterMap`), fee 5,000 once per round (`brPaid`).
- Lobby: make / join / leave a team of ≤4 (`tcreate/tjoin/tleave`); no team = solo. Fight start locks the roster; < 2 teams → called off, fee back (`/brrefund`).
- Hits only between living heroes of different teams during the fight (room checks; damage = `pvpDamage`). Fallen = out (watch or go home), nothing lost. Disconnected / left > 30 s = out.
- Safe zone `brZone` shrinks every 3 min (holds 2, shrinks 1); outside: 5% max HP/s, dealt by the room.
- Ends when ≤1 team has anyone alive, or at 15 min: most alive, then kills. Winners: 15,000 gold + 12% of a level's EXP each; MVP (kills, then damage): +10,000 + 8% (`/brreward`).
- 3 hidden chests a round (1, 5, 9 min): all told, seen within 300 px, 5 s unhurt to open; the team earns one roll per member per chest, paid only if the team has someone alive at the end (`brRoll`: Legend ~30%, SL ~3%, golden dragon ~0.1%, else gold — never shown).

---
(older notes below: the open battlefield design — war bag / drops on death are no longer used)

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
- Prize (rates never shown; `src/systems/pvpChest.ts`): Legend ~55%, SL ~8%, gold 5-10k ~37%, Limited golden dragon ~0.2% (owned → ⭐80). Hidden: everyone in the map is told one exists, seen within 300 px; needs 2+ heroes in the map. Gold and gear go into the war bag; the dragon is kept at once.
