// ⚔ The village raid (มอนบุกหมู่บ้าน, docs/VILLAGE_RAID.md): every small monster of every land storms the central village
// for 3 minutes. Some go for the five shared buildings, the others for the heroes. The game server's map room runs it
// (src/server/mapSim.ts); this file holds the numbers both sides use. Director (2026-11-14): all hit equally hard, not so
// hard that heroes drop fast; no healing potions and endless mana — in this event only; a fallen hero only watches.
import { scaleStats } from '../world/stages';
import { MONSTERS } from '../data/monsters';
import { expToNext, gainExp } from './stats';
import { addItem } from './inventory';
import type { GameState } from '../core/state';
import type { TownBld } from './town';

export const RAID_SECS = 180;
/** the raid map's size and where the five central buildings stand on it (the same on the server and in every game) */
export const RAID_W = 1536, RAID_H = 1024;
export const RAID_BLD: { bid: TownBld; x: number; y: number }[] = [
  { bid: 'tavern', x: 768, y: 500 }, { bid: 'forge', x: 560, y: 380 }, { bid: 'kitchen', x: 976, y: 380 },
  { bid: 'lumber', x: 560, y: 680 }, { bid: 'barn', x: 976, y: 680 },
];
/** where the monsters come from: the four edges of the map */
export const RAID_GATES = [{ x: 70, y: 512 }, { x: 1466, y: 512 }, { x: 768, y: 70 }, { x: 768, y: 960 }];
/** monsters in the whole raid for this many defenders (director: few players → fewer and weaker) — 1 ≈ 15 … 8+ ≈ 78 */
export const raidCount = (defenders: number) => Math.min(80, 15 + 9 * (Math.max(1, Math.min(8, defenders)) - 1));
/** their HP: weaker when few defend */
export const raidHpMult = (defenders: number) => defenders <= 1 ? 0.6 : defenders <= 2 ? 0.75 : defenders <= 4 ? 0.9 : 1;
/** the waves: the raid's monsters come in this many groups, this far apart */
export const RAID_WAVES = 4, RAID_WAVE_GAP = 30000;
/** a share of them go for the buildings (the rest for the heroes) */
export const RAID_BLD_SHARE = 0.55;
/** a building's HP: each blow at a building takes 1 — enough that a defended village loses 0–1, an undefended one most */
export const raidBldHp = (count: number) => Math.max(60, Math.round(count * 9));
/** every raider hits a hero this hard (the same for every kind): ~0.45 of a normal monster of that level */
export const raidAtk = (lv: number) => Math.max(4, Math.round(scaleStats(MONSTERS.wolf, Math.max(1, lv), false).atk * 0.45));
/** a raider's HP at this level */
export const raidHp = (kind: keyof typeof MONSTERS, lv: number, defenders: number) => Math.max(1, Math.round(scaleStats(MONSTERS[kind], Math.max(1, lv), false).hp * raidHpMult(defenders)));
/** kills needed for the defender's chest */
export const RAID_MIN_KILLS = 5;

/** a defender's chest at the end: gold, a slice of a level, mana shards, potions (MVP 1–3: twice; the raid lost: half) */
export function raidChest(level: number, mvp: boolean, won: boolean) {
  const m = (mvp ? 2 : 1) * (won ? 1 : 0.5);
  return {
    gold: Math.round((150 + level * 25) * m), exp: Math.round(expToNext(level) * 0.04 * m),
    items: [{ id: 'mana_shard', qty: Math.max(1, Math.round(3 * m)) }, { id: 'hp_potion_l', qty: Math.max(1, Math.round(2 * m)) }],
  };
}

/** hand the chest over (on the server, into the character) */
export function giveRaidChest(s: GameState, mvp: boolean, won: boolean) {
  const c = raidChest(s.level, mvp, won); s.gold += c.gold; const levels = gainExp(s, c.exp);
  for (const it of c.items) addItem(s, it.id, it.qty);
  return { ...c, levels };
}
/** (this game) the hero is in the raid now: no healing potions, skills cost no mana */
export const raidFlag = { on: false };
/** the raid's time, from the server (null = none planned) */
export interface RaidPlan { at: number }
export const raidLive = (p: RaidPlan | null, now: number) => !!p && now >= p.at && now < p.at + RAID_SECS * 1000;
/** the warning before it (the gold bar + the join button): 5 minutes */
export const RAID_WARN_MS = 5 * 60000;
