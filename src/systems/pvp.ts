// ⚔ PvP battlefield rules (director 15 Nov): Lv40+, open at set hours (Bangkok), an entry fee in gold. Dying to a player
// drops only what was farmed on the battlefield this visit (the "war bag": its gold and items) — gear worn or brought
// in, VIP, diamonds, wings and mounts never drop. Damage between heroes is worked out by the map room (server).
import type { GameState } from '../core/state';

export const PVP_REQ = 40;
export const PVP_FEE = 5000;
/** open hours (Bangkok, [from, to)) */
export const PVP_HOURS: [number, number][] = [[13, 14], [20, 22]];
/** a hero hits another hero this share of a monster hit */
export const PVP_MULT = 0.35;
/** after a fall: back in after this long */
export const PVP_OUT_MS = 3 * 60000;
/** just arrived: nobody can hurt you for this long */
export const PVP_SHIELD_MS = 10000;
/** monsters here: gold x2 */
export const PVP_GOLD = 2;

const bkk = (now: number) => { const d = new Date(now + 7 * 3600000); return d.getUTCHours() + d.getUTCMinutes() / 60; };
export const pvpOpen = (now = Date.now()) => { const h = bkk(now); return PVP_HOURS.some(([a, b]) => h >= a && h < b); };
/** ms until the next opening (0 = open now) */
export function pvpNext(now = Date.now()) {
  if (pvpOpen(now)) return 0;
  const h = bkk(now); let best = 99;
  for (const [a] of PVP_HOURS) { const d = (a - h + 24) % 24; if (d < best) best = d; }
  return Math.round(best * 3600000);
}
export interface WarBag { gold: number; items: { id: string; qty: number; uid?: number }[] }
type PS = GameState & { warBag?: WarBag; pvpOut?: number };
export const warBag = (s: GameState): WarBag => ((s as PS).warBag ??= { gold: 0, items: [] });
export const clearWarBag = (s: GameState) => { (s as PS).warBag = { gold: 0, items: [] }; };
export const pvpOutLeft = (s: GameState, now = Date.now()) => Math.max(0, ((s as PS).pvpOut ?? 0) - now);
/** fell to a player: what was farmed here leaves the hero (what is still in the bag); returned for the ground */
export function loseWarBag(s: GameState, now = Date.now()): WarBag {
  const b = warBag(s), out: WarBag = { gold: Math.min(b.gold, s.gold), items: [] };
  s.gold -= out.gold;
  for (const it of b.items) {
    const i = it.uid !== undefined ? s.inventory.findIndex(q => q.uid === it.uid) : s.inventory.findIndex(q => q.id === it.id);
    if (i < 0) continue;
    const inv = s.inventory[i], take = Math.min(it.qty, inv.qty ?? 1);
    if (it.uid !== undefined || take >= (inv.qty ?? 1)) { s.inventory.splice(i, 1); out.items.push({ ...it, qty: take, ...(it.uid !== undefined ? { gear: inv } : {}) } as WarBag['items'][number]); }
    else { inv.qty -= take; out.items.push({ id: it.id, qty: take }); }
  }
  clearWarBag(s); (s as PS).pvpOut = now + PVP_OUT_MS;
  return out;
}
