// VIP loot settings (players asked, director: VIP only): which GEAR to pick up (a rarity and up — the rest stays on the
// ground) and which gear to dismantle into mana shards on pickup. Materials, potions and other items are always picked up.
// Safety ("อย่าให้เสีย"): auto-dismantle never touches Legend / SL or set gear (at most Super Rare).
import type { GameState } from '../core/state';
import { vipActive } from './premium';

export interface LootOpt { /** smallest gear rarity picked up (0 = all) */ keep: number; /** dismantle gear of this rarity or lower on pickup (-1 = off) */ dis: number }
export const LOOT_DIS_MAX = 3;
const n = (v: unknown, lo: number, hi: number, d: number) => { const x = Math.floor(Number(v)); return Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : d; };
export const lootOpt = (s: GameState): LootOpt => { const o = (s as GameState & { lootOpt?: Partial<LootOpt> }).lootOpt ?? {}; return { keep: n(o.keep, 0, 5, 0), dis: n(o.dis, -1, LOOT_DIS_MAX, -1) }; };
export function setLootOpt(s: GameState, o: Partial<LootOpt>) { const cur = lootOpt(s); (s as GameState & { lootOpt?: LootOpt }).lootOpt = { keep: n(o.keep ?? cur.keep, 0, 5, 0), dis: n(o.dis ?? cur.dis, -1, LOOT_DIS_MAX, -1) }; }
/** (device) leave this drop on the ground: VIP, gear, below the chosen rarity */
export const lootSkip = (s: GameState, gear: boolean, rar: number, now = Date.now()) => gear && vipActive(s, now) && rar < lootOpt(s).keep;
/** (device) the dismantle setting sent with a pickup, or undefined (not VIP / off) */
export const lootDis = (s: GameState, now = Date.now()) => { const d = lootOpt(s).dis; return vipActive(s, now) && d >= 0 ? d : undefined; };
/** what dismantling gives (the same as the bag's dismantle button: by the item's own rarity) */
export const dismantleYield = (defRarity: number, upg = 0) => ({ shards: ([1, 1, 2, 4, 8, 20][defRarity] ?? 1) + upg, cores: defRarity >= 4 ? 2 : defRarity >= 3 ? 1 : 0 });
