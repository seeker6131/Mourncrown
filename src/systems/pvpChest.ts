// 📦 Battlefield treasure chests (director 15 Nov): now and then a chest appears somewhere on the PvP map. Stand by it
// for a few seconds without being hit to open it — any hero who strikes you stops it. Inside: mostly gold or a Super Rare
// piece, sometimes Legend, rarely SL, very rarely a Limited wing or the golden dragon. The rates are never shown.
// Gold and gear go into the war bag (lost if you fall before you leave); a Limited wing / mount is yours at once.
import type { GameState, InvItem } from '../core/state';
import { addItem } from './inventory';
import { invSize } from '../core/state';
import { pickBase, makeGear } from './loot';
import { warBag } from './pvp';
import { WINGS } from '../data/wings';
import { grantMount, hasMount } from './mounts';

/** a new chest comes this long after the last one was opened / went away (ms) */
export const CHEST_GAP: [number, number] = [4 * 60000, 7 * 60000];
/** a chest nobody opens goes away after this long */
export const CHEST_LIFE = 3 * 60000;
/** standing still by it this long opens it (a hit from a hero stops it) */
export const CHEST_OPEN_MS = 5000;
/** how close (px) you must stand */
export const CHEST_REACH = 44;

/** per 10,000 chests (never shown to players) */
const P = { ltd: 30, sl: 150, legend: 800, sr: 2400, gold: 6620 };

export type ChestPrize = { kind: 'ltd'; wing?: string; mount?: string; stars?: number } | { kind: 'gear'; rar: number; id: string; uid: number } | { kind: 'gold'; gold: number } | { kind: 'bag' };

/** the server opens a chest for this hero */
export function openChest(s: GameState, rnd: () => number): ChestPrize {
  let r = rnd() * 10000;
  if ((r -= P.ltd) < 0) {   // a Limited wing (one you lack) or the golden dragon; all owned → star coins
    const lack = WINGS.filter(w => w.tier === 'X' && !(s as { wings?: string[] }).wings?.includes(w.id)).map(w => w.id);
    const dragon = !hasMount(s, 'gdragon');
    const pool = [...lack.map(id => ({ wing: id })), ...(dragon ? [{ mount: 'gdragon' }] : [])];
    if (!pool.length) { const p = s as { stars?: number }; p.stars = (p.stars ?? 0) + 80; return { kind: 'ltd', stars: 80 }; }
    const g = pool[Math.floor(rnd() * pool.length)];
    if ('wing' in g) ((s as { wings?: string[] }).wings ??= []).push(g.wing); else grantMount(s, 'gdragon');
    return { kind: 'ltd', ...g };
  }
  const rar = (r -= P.sl) < 0 ? 5 : (r -= P.legend) < 0 ? 4 : (r -= P.sr) < 0 ? 3 : -1;
  if (rar < 0) { const gold = Math.round(3000 + rnd() * 5000); s.gold += gold; warBag(s).gold += gold; return { kind: 'gold', gold }; }
  if (s.inventory.length >= invSize(s)) { const gold = 4000; s.gold += gold; warBag(s).gold += gold; return { kind: 'gold', gold }; }   // (a full bag: gold instead)
  const slot = (['weapon', 'armor', 'accessory'] as const)[Math.floor(rnd() * 3)], b = pickBase(rnd, rar, s.cls, slot), g = makeGear(rnd, b.id);
  const it = { ...g, uid: s.nextUid++, qty: 1, upg: 0 } as InvItem; s.inventory.push(it);
  warBag(s).items.push({ id: it.id, qty: 1, uid: it.uid });
  return { kind: 'gear', rar: g.rar ?? rar, id: it.id, uid: it.uid };
}
