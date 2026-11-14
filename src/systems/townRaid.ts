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

/** director (2026-11-14, after the first test): 6 waves × 100, fast, tougher every wave — 5 minutes to hold */
export const RAID_SECS = 180;   // (director: 3 minutes)
/** the raid map's size and where the five central buildings stand on it (the same on the server and in every game) */
export const RAID_W = 1536, RAID_H = 1024;
export const RAID_BLD: { bid: TownBld; x: number; y: number }[] = [
  { bid: 'tavern', x: 768, y: 500 }, { bid: 'forge', x: 560, y: 380 }, { bid: 'kitchen', x: 976, y: 380 },
  { bid: 'lumber', x: 560, y: 680 }, { bid: 'barn', x: 976, y: 680 },
];
/** where the monsters come from: the four edges of the map */
export const RAID_GATES = [{ x: 70, y: 512 }, { x: 1466, y: 512 }, { x: 768, y: 70 }, { x: 768, y: 960 }];
/** the waves: this many, this many monsters each (director: 6 × 100) */
export const RAID_WAVES = 6, RAID_WAVE_SIZE = 100, RAID_WAVE_GAP = 25000;   // (6 waves inside 3 minutes: the last at 2:05)
export const raidTotal = () => RAID_WAVES * RAID_WAVE_SIZE;
/** a wave walks in as groups of 25, 2 seconds apart, each from one edge (director) */
export const RAID_GROUP = 25, RAID_GROUP_GAP = 2000;
/** at most this many on the map at once (phones + the room's message); the rest wait at the edges and come as room frees */
export const RAID_ALIVE_MAX = 120;
/** toughness by wave (1st ×1.6 … 6th ×4.1 of a normal monster's HP) */
export const raidWaveHp = (wave: number) => (2 + 0.6 * Math.max(0, wave)) * 0.95;   // (director: −5%)
/** run speed: much faster than a normal monster, a little faster each wave */
export const raidSpeed = (base: number, wave: number) => (base + 30) * 1.6 + wave * 6;
/** their HP grows with the defenders (more heroes = more damage): 1 hero ×0.6 … 10+ heroes ×2.5 */
export const raidHpMult = (defenders: number) => Math.min(2.5, 0.6 + 0.2 * (Math.max(1, defenders) - 1));
/** director: everyone in ONE room, no level bands — the monsters are at the strongest hero's level and hit everyone as
 *  hard as monsters of that level do: "the weak just fall first" */
/** EXP from raid kills and chests is cut (director: the raid is not an EXP farm) */
export const RAID_EXP_MULT = 0.25;
/** a share of them go for the buildings (the rest for the heroes) */
export const RAID_BLD_SHARE = 0.55;
/** a building's HP: each blow at a building takes 1 — enough that a defended village loses 0–1, an undefended one most */
export const raidBldHp = (_count: number) => 1300;   // (measured ~12 blows/s on an undefended outer building with the map full: it falls in about 2 minutes)
/** every raider hits this hard (the same for every kind) — as a normal monster of the raid's level, harder each wave */
export const raidAtk = (lv: number, wave = 0) => Math.max(4, Math.round(scaleStats(MONSTERS.wolf, Math.max(1, Math.min(100, lv)), false).atk * (0.9 + 0.15 * Math.max(0, wave)) * 0.95 * 0.95));   // (harder each wave: 0.9× … 1.65×, then −5% and −5% again — director, 14 Nov)
/** a raider's HP at this level */
export const raidHp = (kind: keyof typeof MONSTERS, lv: number, defenders: number, wave = 0) => Math.max(1, Math.round(scaleStats(MONSTERS[kind], Math.max(1, lv), false).hp * raidHpMult(defenders) * raidWaveHp(wave)));
/** (this device) a hero who fell in this raid (its start time) — they may not come back to help until it ends (director) */
export const RAID_FALLEN_KEY = 'mcRaidFallen';
/** kills needed for the defender's chest */
export const RAID_MIN_KILLS = 5;

/** a defender's chest at the end: gold, a slice of a level, mana shards, potions (MVP 1–3: twice; the raid lost: half) */
export function raidChest(level: number, mvp: boolean, won: boolean) {
  const m = (mvp ? 2 : 1) * (won ? 1 : 0.5);
  return {
    gold: Math.round((150 + level * 25) * m), exp: Math.round(expToNext(level) * 0.02 * m),
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
export const raidFlag = { on: false, wave: 0 };
/** the raid's time, from the server (null = none planned) */
export interface RaidPlan { at: number }
export const raidLive = (p: RaidPlan | null, now: number) => !!p && now >= p.at && now < p.at + RAID_SECS * 1000;
/** the daily raids (director: 3 a day at set times) — Thai time */
export const RAID_HOURS = [12, 18, 21];
/** the raid now or next: a time the admin set (still to come or under way) wins, otherwise the next daily slot */
export function nextRaid(now: number, set: RaidPlan | null = null): RaidPlan {
  if (set && set.at + RAID_SECS * 1000 > now) return set;
  const TH = 7 * 3600000, day = Math.floor((now + TH) / 86400000) * 86400000 - TH;   // (midnight in Thailand)
  for (let d = 0; d < 2; d++) for (const h of RAID_HOURS) { const at = day + d * 86400000 + h * 3600000; if (at + RAID_SECS * 1000 > now) return { at }; }
  return { at: day + 86400000 + RAID_HOURS[0] * 3600000 };
}
/** the warning before it (the gold bar + the join button): 5 minutes */
export const RAID_WARN_MS = 5 * 60000;
