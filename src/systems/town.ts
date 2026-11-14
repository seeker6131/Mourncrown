// 🏘 The shared village's buildings (docs/VILLAGE_RAID.md): the village raid can break them; a broken one cannot be used by
// anybody on the server (in their own village too) until it is repaired — everyone may donate resources / gold to fill the
// repair bar, and it also mends itself in 2 hours. The server keeps the truth (D1 `town`); this module holds the copy the
// rules read (`townBroken`), refreshed by the server's Player object and by the game.
export const TOWN_BLDS = ['lumber', 'kitchen', 'forge', 'barn', 'tavern'] as const;
export type TownBld = typeof TOWN_BLDS[number];
export const TOWN_NAME: Record<TownBld, string> = { lumber: '🪵 โรงไม้', kitchen: '🍲 โรงครัว', forge: '⚒ โรงหลอม', barn: '🐄 คอกสัตว์', tavern: '🍺 โรงเตี๊ยม' };
/** what a broken building stops, for the message */
export const TOWN_STOPS: Record<TownBld, string> = { lumber: 'เก็บไม้จากโรงไม้', kitchen: 'ทำอาหาร / ปรุงยา', forge: 'หลอมของ / ตีบวก', barn: 'เก็บอาหารจากคอกสัตว์', tavern: 'โบนัส EXP ของโรงเตี๊ยม' };
/** a broken building mends itself in this long (director: 2 h) */
export const SELF_REPAIR_MS = 2 * 3600000;
/** the repair bar: not harsh (director) — grows a little with the players online */
export const repairNeed = (online: number) => 300 + 60 * Math.max(0, Math.min(50, online));
/** repair points a donation gives: 1 per wood / stone / food, 1 per 10 gold */
export const repairPoints = (d: { wood?: number; stone?: number; food?: number; gold?: number }) =>
  Math.max(0, Math.floor(d.wood ?? 0)) + Math.max(0, Math.floor(d.stone ?? 0)) + Math.max(0, Math.floor(d.food ?? 0)) + Math.floor(Math.max(0, d.gold ?? 0) / 10);

export interface TownRow { bid: TownBld; broken: number; at: number; donated: number; need: number }
/** how far the repair is (donations + time), 0..need */
export const repairProgress = (r: TownRow, now: number) => r.broken ? Math.min(r.need, r.donated + Math.floor((now - r.at) / SELF_REPAIR_MS * r.need)) : r.need;
export const isRepaired = (r: TownRow, now: number) => !r.broken || repairProgress(r, now) >= r.need;

/** the broken buildings right now (the rules read this; empty = all fine) */
export const townBroken = new Set<TownBld>();
export function setTown(rows: TownRow[], now = Date.now()) {
  townBroken.clear(); for (const r of rows) if (!isRepaired(r, now)) townBroken.add(r.bid);
}
/** the building type of a village plot action, when it is one of the shared ones */
export const plotTown = (type: string | undefined): TownBld | null => (TOWN_BLDS as readonly string[]).includes(type ?? '') ? type as TownBld : null;
