// 🐎 Mounts from fights (director 16 Nov: "golden monsters can drop them; the roaming boss at a fair rate — don't cheat the
// players"). The same Legend / SL mounts as the slot machine (never the Limited golden dragon). The server rolls; rates are
// never shown in the game. A mount already owned turns into ⭐ star coins, like the machine.
// Pace (16 Nov numbers): an active player kills ~5-7k monsters a day, ~3% golden = ~150-200 golden a day.
import type { GameState } from '../core/state';
import { grantMount, hasMount } from './mounts';
import type { MountId } from '../data/mounts';

export const DROP_MOUNTS: Record<'L' | 'SL', MountId[]> = { L: ['wolf', 'bear'], SL: ['stag', 'panther'] };
/** a golden monster: Legend 1 in 600 (≈ every 3-4 days of hard play), SL 1 in 3,500 */
export const GOLDEN_MOUNT = { L: 1 / 600, SL: 1 / 3500 };
/** the roaming boss, for the one who strikes it down (helpers: times their share of the damage): Legend 3%, SL 0.5% */
export const WB_MOUNT = { L: 0.03, SL: 0.005 };
const DUP = { L: 15, SL: 40 };

export interface MountDrop { mount: MountId; tier: 'L' | 'SL'; stars?: number }
/** roll once; k scales both chances (a helper's share) */
export function rollMountDrop(s: GameState, rnd: () => number, p: { L: number; SL: number }, k = 1): MountDrop | null {
  const r = rnd();
  const tier = r < p.SL * k ? 'SL' : r < (p.SL + p.L) * k ? 'L' : null; if (!tier) return null;
  const list = DROP_MOUNTS[tier], id = list[Math.floor(rnd() * list.length)];
  if (hasMount(s, id)) { const st = DUP[tier], q = s as { stars?: number }; q.stars = (q.stars ?? 0) + st; return { mount: id, tier, stars: st }; }
  grantMount(s, id); return { mount: id, tier };
}
