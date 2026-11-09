// Mining rewards and alchemy — pure rules (server-side when online).
import type { GameState } from '../core/state';
import { RECIPES, type Recipe } from '../data/alchemy';
import { WILD } from '../world/stages';
import { addItem, countItem, removeItem } from './inventory';
import { levelOf } from './settlement';

export interface Vein { ore: string; gem: string; req: number; rare?: boolean; gold?: boolean }
export interface GatherResult { amt: number; ore: string | null; oreQty: number; gem: string | null; gold: number; low?: number }
/** One hit on a tree or rock. mapN: 0 = village, 1-50 = monster maps, WILD = the Deepwild.
 *  Ores, rare gems and gold veins exist only in the Deepwild mine pits (vein = that pit's ore). */
export function gatherReward(s: GameState, kind: 'wood' | 'stone', mapN: number, vein: Vein | null = null, rnd: () => number = Math.random): GatherResult {
  const wild = mapN === WILD, k = wild ? 1.5 + s.level / 30 : 1 + mapN / 12, amt = Math.round((2 + Math.floor(rnd() * 3)) * k);
  const r: GatherResult = { amt, ore: null, oreQty: 0, gem: null, gold: 0 };
  if (vein && s.level < vein.req) return { ...r, amt: 0, low: vein.req };
  if (kind === 'wood') { s.res.wood += amt; return r; }
  if (!vein) { s.res.stone += amt; return r; }
  if (vein.gold) { r.amt = 0; r.gold = Math.round((20 + rnd() * 40) * (1 + s.level / 10)); s.gold += r.gold; return r; }   // gold vein: coins
  if (!vein.rare) s.res.stone += amt; else r.amt = 0;
  if (rnd() < (vein.rare ? 0.9 : 0.45)) { r.oreQty = (vein.rare ? 2 : 1) + (rnd() < 0.3 ? 1 : 0); if (addItem(s, vein.ore, r.oreQty)) r.ore = vein.ore; else r.oreQty = 0; }
  if (rnd() < (vein.rare ? 0.06 : 0.004) && addItem(s, vein.gem, 1)) r.gem = vein.gem;            // rare gems: crystal veins ~6% a hit
  if (!vein.rare && rnd() < 0.03) { r.gold = Math.round(10 + s.level * 2); s.gold += r.gold; }      // a gold nugget now and then
  return r;
}

export type BrewFail = 'kitchen' | 'items' | 'gold' | 'food' | 'bag';
export function canBrew(s: GameState, r: Recipe): BrewFail | null {
  if (levelOf(s, 'kitchen') < r.kitchen) return 'kitchen';
  for (const [id, n] of Object.entries(r.need)) if (countItem(s, id) < n) return 'items';
  if (s.gold < r.gold) return 'gold';
  if (s.res.food < r.food) return 'food';
  return null;
}
export function brew(s: GameState, out: string): BrewFail | 'ok' {
  const r = RECIPES.find(q => q.out === out)!; const f = canBrew(s, r); if (f) return f;
  if (!addItem(s, r.out, r.qty)) return 'bag';
  for (const [id, n] of Object.entries(r.need)) removeItem(s, id, n);
  s.gold -= r.gold; s.res.food -= r.food;
  return 'ok';
}
type ES = GameState & { elixir?: { atk?: number; def?: number; hp?: number; crit?: number; aspd?: number; exp?: number; until: number; name: string } };
export const activeElixir = (s: GameState, now = Date.now()) => { const e = (s as ES).elixir; return e && e.until > now ? e : null; };
