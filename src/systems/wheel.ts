// 🎡 The lucky wheel (director): spun with GOLD — a gold sink (gold is inflating). The rarest prize is a Legend item; the
// rest are things from the game. The server rolls (its dice); the odds are never shown (director's rule on drop rates).
// Gear prizes come as SELECTOR CHESTS of that rarity: the player opens one and picks the piece that fits their class.
// Hard to win on purpose (director: the 24-hour farmers must not feel cheated); no guarantee.
import type { GameState } from '../core/state';
import { invSize } from '../core/state';
import { addItem } from './inventory';
import { makeGear, GEAR_BASES } from './loot';
import { ITEMS } from '../data/items';

/** open to players? (director: not until approved — the admin account can already try it) */
export const WHEEL_OPEN = true;   // (opened 2026-11-14, director)
export const WHEEL_PRICE = 2000;
/** the wheel's segments (what is drawn: `item` = whose icon, '' = gear of that rarity / resources); `w` = the weight out of 1000 (never shown) */
export const WHEEL_SEGS = [
  { key: 'legend', label: 'หีบ Legend', item: 'pick_legend', color: 0xffa020, w: 1 },
  { key: 'tonic', label: 'ยาบัพ', item: 'tonic_atk', color: 0x8a3a3a, w: 100 },
  { key: 'sr', label: 'หีบ Super Rare', item: 'pick_sr', color: 0xa050ff, w: 10 },
  { key: 'shard', label: 'ผลึกมานา x5', item: 'mana_shard', color: 0x3a5a8a, w: 130 },
  { key: 'rare', label: 'หีบ Rare', item: 'pick_rare', color: 0x3a8aff, w: 60 },
  { key: 'potion', label: 'ยาใหญ่ x5', item: 'hp_potion_l', color: 0x6a2a3a, w: 140 },
  { key: 'core', label: 'แก่นโบราณ', item: 'ancient_core', color: 0x6a4a1a, w: 30 },
  { key: 'scroll', label: 'ม้วนกลับบ้าน x3', item: 'scroll_return', color: 0x4a3a6a, w: 120 },
  { key: 'elixir', label: 'ยาแร่', item: 'elix_iron', color: 0x2a6a5a, w: 40 },
  { key: 'res', label: 'ทรัพยากร x120', item: '', color: 0x3a5a2a, w: 369 },
] as const;
export type WheelKey = typeof WHEEL_SEGS[number]['key'];
export interface WheelPrize { seg: number; id?: string; qty: number; rar?: number; set?: string; res?: 'wood' | 'stone' | 'food' }

/** (director 16 Nov: "10 spins all the same looks rigged") in a 10-spin a segment comes at most SAME_MAX times */
export const SAME_MAX = 3;
function roll(rnd: () => number, skip: (i: number) => boolean = () => false) {
  const ok: number[] = WHEEL_SEGS.map((q, i) => skip(i) ? 0 : q.w), tot = ok.reduce((t, w) => t + w, 0) || 1;
  let r = rnd() * tot;
  for (let i = 0; i < WHEEL_SEGS.length; i++) { r -= ok[i]; if (r < 0 && ok[i]) return i; }
  return WHEEL_SEGS.length - 1;
}
const GOOD_SEG = new Set<WheelKey>(['legend', 'sr', 'rare', 'core', 'elixir']);
/** n spins: no segment more than SAME_MAX times; a 10-spin holds at least one chest / core / elixir */
export function rollSpins(n: number, rnd: () => number) {
  const segs: number[] = [], cnt = new Map<number, number>();
  for (let k = 0; k < n; k++) { const i = roll(rnd, j => n > 1 && (cnt.get(j) ?? 0) >= SAME_MAX); segs.push(i); cnt.set(i, (cnt.get(i) ?? 0) + 1); }
  if (n === 10 && !segs.some(i => GOOD_SEG.has(WHEEL_SEGS[i].key))) segs[segs.length - 1] = WHEEL_SEGS.findIndex(q => q.key === 'rare');
  return segs;
}
function give(s: GameState, seg: number, rnd: () => number): WheelPrize {
  const k = WHEEL_SEGS[seg].key, pick = <T,>(l: readonly T[]) => l[Math.floor(rnd() * l.length)];
  if (k === 'legend' || k === 'sr' || k === 'rare') { const id = WHEEL_SEGS[seg].item, rar = k === 'legend' ? 4 : k === 'sr' ? 3 : 2; addItem(s, id, 1); return { seg, id, qty: 1, rar }; }   // (a selector chest)
  if (k === 'res') { const res = pick(['wood', 'stone', 'food'] as const); s.res[res] += 120; return { seg, qty: 120, res }; }
  const [id, qty] = k === 'tonic' ? [pick(['tonic_atk', 'tonic_def', 'tonic_exp']), 2] : k === 'shard' ? ['mana_shard', 5] : k === 'potion' ? ['hp_potion_l', 5]
    : k === 'core' ? ['ancient_core', 1] : k === 'scroll' ? ['scroll_return', 3] : [pick(['elix_iron', 'elix_silver', 'elix_obsidian']), 1];
  addItem(s, id as string, qty as number); return { seg, id: id as string, qty: qty as number };
}
/** spin 1 or 10 times: pays first, then the prizes go straight into the bag / storage */
export function spinWheel(s: GameState, n: number, rnd: () => number): 'gold' | 'bag' | 'n' | { prizes: WheelPrize[]; cost: number } {
  if (n !== 1 && n !== 10) return 'n';
  const cost = WHEEL_PRICE * n;
  if (s.gold < cost) return 'gold';
  if (s.inventory.length + n > invSize(s)) return 'bag';   // (every spin may need a slot)
  const segs = rollSpins(n, rnd);
  s.gold -= cost;
  return { prizes: segs.map(i => give(s, i, rnd)), cost };
}

/** the gear a selector chest of rarity `rar` can become: that rarity, the hero's class first (others too, marked) */
export function pickChoices(rar: number, cls?: string | null) {
  return GEAR_BASES.filter(d => d.rarity === rar).sort((a, b) => Number(!!a.cls && a.cls !== cls) - Number(!!b.cls && b.cls !== cls) || a.type.localeCompare(b.type));
}
/** open a selector chest: the chosen gear (same rarity) goes into the bag; random bonus stats like any drop */
export function openPick(s: GameState, uid: number, id: string, rnd: () => number): 'missing' | 'wrong' | 'bag' | { id: string; rar: number } {
  const ch = s.inventory.find(i => i.uid === uid), cd = ch ? ITEMS[ch.id] : undefined, d = ITEMS[id];
  if (!ch || !cd || cd.pick === undefined) return 'missing';
  if (!d || d.rarity !== cd.pick || !GEAR_BASES.includes(d)) return 'wrong';
  if (s.inventory.length >= invSize(s) && ch.qty > 1) return 'bag';
  if (ch.qty > 1) ch.qty--; else s.inventory.splice(s.inventory.indexOf(ch), 1);
  const gear = makeGear(rnd, id, d.rarity); addItem(s, id, 1, 0, gear);
  return { id, rar: gear.rar ?? d.rarity };
}
