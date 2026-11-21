// 📦 Battlefield treasure chests (director 15 Nov): now and then a chest is hidden somewhere on the PvP map (everyone
// there is told one exists; you see it only when close — go and find it). Stand by it
// for a few seconds without being hit to open it — any hero who strikes you stops it. Inside: mostly gold or a Super Rare
// Mostly Legend gear, SL fairly often, now and then gold; very rarely the Limited golden dragon. The rates are never shown.
// Gold and gear go into the war bag (lost if you fall before you leave); the dragon is yours at once.
import type { GameState, InvItem } from '../core/state';
import { addItem } from './inventory';
import { invSize } from '../core/state';
import { pickBase, makeGear } from './loot';
import { warBag } from './pvp';
import { grantMount, hasMount } from './mounts';

/** a new chest comes this long after the last one was opened / went away (ms) */
export const CHEST_GAP: [number, number] = [4 * 60000, 7 * 60000];
/** a chest nobody opens goes away after this long */
export const CHEST_LIFE = 3 * 60000;
/** standing still by it this long opens it (a hit from a hero stops it) */
export const CHEST_OPEN_MS = 5000;
/** hidden: a hero sees the chest only this close (px) — everyone in the map is told one is somewhere (director) */
export const CHEST_SIGHT = 300;
/** no chest while fewer heroes than this are on the battlefield (a near-empty map is no free treasure hunt) */
export const CHEST_MIN_PLAYERS = 2;
/** how close (px) you must stand */
export const CHEST_REACH = 44;

/** per 10,000 chests (never shown to players). Director 15 Nov: mostly Legend / SL gear; the Limited prize is the golden
 *  dragon only, and hard to get (~30 chests a day server-wide → about one dragon every couple of weeks) */
const P = { ltd: 20, sl: 800, legend: 5500 };

export type ChestPrize = { kind: 'ltd'; mount?: string; stars?: number } | { kind: 'gear'; rar: number; id: string; uid: number } | { kind: 'gold'; gold: number } | { kind: 'bag' };

/** the server opens a chest for this hero */
export function openChest(s: GameState, rnd: () => number): ChestPrize {
  let r = rnd() * 10000;
  if ((r -= P.ltd) < 0) {   // 🐉 the golden dragon (already owned → star coins)
    if (hasMount(s, 'gdragon')) { const p = s as { stars?: number }; p.stars = (p.stars ?? 0) + 80; return { kind: 'ltd', stars: 80 }; }
    grantMount(s, 'gdragon'); return { kind: 'ltd', mount: 'gdragon' };
  }
  const rar = (r -= P.sl) < 0 ? 5 : (r -= P.legend) < 0 ? 4 : -1;
  if (rar < 0) { const gold = Math.round(5000 + rnd() * 5000); s.gold += gold; warBag(s).gold += gold; return { kind: 'gold', gold }; }
  if (s.inventory.length >= invSize(s)) { const gold = 6000; s.gold += gold; warBag(s).gold += gold; return { kind: 'gold', gold }; }   // (a full bag: gold instead)
  const slot = (['weapon', 'armor', 'accessory'] as const)[Math.floor(rnd() * 3)], b = pickBase(rnd, rar, s.cls, slot), g = makeGear(rnd, b.id);
  const it = { ...g, uid: s.nextUid++, qty: 1, upg: 0 } as InvItem; s.inventory.push(it);
  warBag(s).items.push({ id: it.id, qty: 1, uid: it.uid });
  return { kind: 'gear', rar: g.rar ?? rar, id: it.id, uid: it.uid };
}
