// VIP loot settings (players asked, director: VIP only, tick up to 3 rarities each): which GEAR rarities to pick up (the
// rest stays on the ground) and which to dismantle into mana shards on pickup. Materials, potions and other items are
// always picked up. Safety ("อย่าให้เสีย"): Legend / SL are always picked up and never dismantled; set gear is never dismantled.
import type { GameState } from '../core/state';
import { vipActive } from './premium';

/** the rarities the settings can tick: Common, Uncommon, Rare, Super Rare (Legend / SL: always kept) */
export const LOOT_RARS = [0, 1, 2, 3];
export const LOOT_MAX = 3;
export const LOOT_DIS_MAX = 3;
export interface LootOpt { /** gear rarities picked up ([] = all) */ keep: number[]; /** gear rarities dismantled on pickup ([] = none) */ dis: number[] }
const list = (v: unknown, old: (n: number) => number[]): number[] => {
  if (typeof v === 'number') return old(v);   // (the first version kept one number: "this rarity and up" / "this and lower")
  return Array.isArray(v) ? [...new Set(v.map(Number).filter(n => LOOT_RARS.includes(n)))].sort().slice(0, LOOT_MAX) : [];
};
export const lootOpt = (s: GameState): LootOpt => {
  const o = (s as GameState & { lootOpt?: { keep?: unknown; dis?: unknown } }).lootOpt ?? {};
  return { keep: list(o.keep, k => k <= 0 ? [] : LOOT_RARS.filter(r => r >= k)), dis: list(o.dis, d => LOOT_RARS.filter(r => r <= d)) };
};
/** tick / untick one rarity; false = already 3 ticked */
export function toggleLoot(s: GameState, which: 'keep' | 'dis', rar: number): boolean {
  const o = lootOpt(s), l = o[which], i = l.indexOf(rar);
  if (i >= 0) l.splice(i, 1); else { if (l.length >= LOOT_MAX || !LOOT_RARS.includes(rar)) return false; l.push(rar); l.sort(); }
  (s as GameState & { lootOpt?: LootOpt }).lootOpt = o; return true;
}
/** (device) leave this drop on the ground: VIP, gear, a rarity not ticked (and not to be dismantled) */
export const lootSkip = (s: GameState, gear: boolean, rar: number, now = Date.now()) => {
  if (!gear || rar > 3 || !vipActive(s, now)) return false;
  const o = lootOpt(s); return o.keep.length > 0 && !o.keep.includes(rar) && !o.dis.includes(rar);
};
/** (device) the rarities to dismantle, sent with a pickup — undefined when not VIP / none ticked */
export const lootDis = (s: GameState, now = Date.now()) => { const d = lootOpt(s).dis; return vipActive(s, now) && d.length ? d : undefined; };
/** (server) dismantle a drop of rarity `rar`? `dis` = a list (or the first version's "this and lower" number) */
export const disMatch = (dis: unknown, rar: number) => rar <= LOOT_DIS_MAX && (Array.isArray(dis) ? dis.map(Number).includes(rar) : typeof dis === 'number' && dis >= 0 && rar <= Math.floor(dis));
/** what dismantling gives (the same as the bag's dismantle button: by the item's own rarity) */
export const dismantleYield = (defRarity: number, upg = 0) => ({ shards: ([1, 1, 2, 4, 8, 20][defRarity] ?? 1) + upg, cores: defRarity >= 4 ? 2 : defRarity >= 3 ? 1 : 0 });
