// 🔥 Fusion luck (director 2026-11-14): at the forge, spare gear can be sacrificed when upgrading (+1..+10) to raise the
// chance — it burns the Rare surplus without making anything new. The sacrificed pieces are gone whatever the result.
// Slots grow with the forge's level; the bonus has a cap; the numbers are never shown to players (only a luck meter).
import type { GameState } from '../core/state';
import { itemDef, upgradeChance } from '../data/items';
import { isEquipped } from './inventory';
import { rarOf } from './loot';

/** added chance (percentage points) for one sacrificed piece, by rarity: Rare, Super Rare, Legend */
export const FUSE_PCT: Record<number, number> = { 2: 3, 3: 6, 4: 12 };
export const FUSE_CAP = 15;
/** sacrifice slots by the forge's level: Lv1–2 → 1, Lv3–4 → 2, Lv5 → 3 */
export const fuseSlots = (s: GameState) => { const lv = s.buildings.find(b => b.type === 'forge')?.level ?? 0; return lv <= 0 ? 0 : lv >= 5 ? 3 : lv >= 3 ? 2 : 1; };
/** can this piece be sacrificed for that target: gear, Rare–Legend, not worn, not a set piece, not the target */
export function fodderOk(s: GameState, uid: number, target: number) {
  const it = s.inventory.find(i => i.uid === uid); if (!it || uid === target) return false;
  const d = itemDef(it.id); if (d.type !== 'weapon' && d.type !== 'armor' && d.type !== 'accessory') return false;
  return !isEquipped(s, uid) && !it.set && FUSE_PCT[rarOf(it)] !== undefined;
}
/** the bonus (0–FUSE_CAP points) for these pieces — 0 when the step is already sure */
export function fuseBonus(s: GameState, uids: number[], target: number) {
  const t = s.inventory.find(i => i.uid === target); if (!t || upgradeChance(t.upg) >= 1) return 0;
  let p = 0; for (const u of uids) { const it = s.inventory.find(i => i.uid === u); if (it) p += FUSE_PCT[rarOf(it)] ?? 0; }
  return Math.min(FUSE_CAP, p);
}
/** a valid sacrifice list (distinct, allowed, within the slots) or null */
export function fodderList(s: GameState, uids: unknown, target: number): number[] | null {
  const list = Array.isArray(uids) ? [...new Set(uids.map(Number))] : [];
  if (list.length > fuseSlots(s)) return null;
  return list.every(u => fodderOk(s, u, target)) ? list : null;
}
