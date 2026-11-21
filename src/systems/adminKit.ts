// The director's own account (server/cf.json admins): everything in the game, given once by the server when the account
// connects (no test buttons in the game any more — director). Nobody else can get this: the server checks the account.
import type { GameState } from '../core/state';
import { ITEMS } from '../data/items';
import { addItem } from './inventory';
import { makeGear, isGear } from './loot';
import { grantMount } from './mounts';
import { grantVip, grantDiamonds } from './premium';
import { FORM_LEVEL, type ClassId } from '../data/classes';
import { derive } from './stats';

/** raise when the kit grows: the next connection tops the account up again */
export const ADMIN_KIT_V = 1;
type AS = GameState & { adminKit?: number; tdUnlockAll?: boolean; bagPlus?: number };

export function grantAdminKit(s: GameState, now = Date.now(), rnd: () => number = Math.random) {
  const a = s as AS; if ((a.adminKit ?? 0) >= ADMIN_KIT_V) return false;
  if (s.cls === 'novice') s.cls = 'sword';
  s.level = 100; s.exp = 0; s.tier = 3; s.useTier = 3; s.skillPts = Math.max(s.skillPts ?? 0, 120);
  s.gold = Math.max(s.gold, 99_000_000); s.res.wood = Math.max(s.res.wood, 99_999); s.res.stone = Math.max(s.res.stone, 99_999); s.res.food = Math.max(s.res.food, 99_999);
  grantDiamonds(s, 99_999); grantVip(s, 365, now); grantMount(s, 'horse'); grantMount(s, 'dragon');
  a.tdUnlockAll = true; a.bagPlus = Math.max(a.bagPlus ?? 0, 260);   // every map open; a bag for one of everything
  const have = new Set(s.inventory.map(i => i.id));
  for (const d of Object.values(ITEMS)) {
    if (have.has(d.id)) continue;
    if (isGear(d)) addItem(s, d.id, 1, 0, makeGear(rnd, d.id, d.rarity));
    else addItem(s, d.id, d.stack ? 99 : 1);
  }
  // wear the best of each for this class
  const best = (t: string) => s.inventory.filter(i => { const d = ITEMS[i.id]; return d?.type === t && (t !== 'weapon' || d.cls === s.cls); }).sort((x, y) => (ITEMS[y.id].rarity - ITEMS[x.id].rarity) || (ITEMS[y.id].price - ITEMS[x.id].price))[0];
  for (const t of ['weapon', 'armor', 'accessory'] as const) { const it = best(t); if (it) s.equip[t] = it.uid; }
  const d = derive(s); s.hp = d.maxHp; s.mp = d.maxMp;
  a.adminKit = ADMIN_KIT_V;
  return true;
}
/** (admin) wear any class and form */
export function adminForm(s: GameState, cls: ClassId, tier: number) {
  s.cls = cls; s.tier = Math.max(0, Math.min(3, tier)); s.useTier = s.tier; s.level = Math.max(s.level, FORM_LEVEL[s.tier]);
  const best = s.inventory.filter(i => ITEMS[i.id]?.type === 'weapon' && ITEMS[i.id].cls === cls).sort((x, y) => ITEMS[y.id].rarity - ITEMS[x.id].rarity)[0];
  if (best) s.equip.weapon = best.uid;
  const d = derive(s); s.hp = d.maxHp; s.mp = d.maxMp;
  return { ok: true as const };
}
