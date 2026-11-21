// Why food matters (pure rules; server-side later):
//  1) Supplies — the hero eats while out on a monster map: food every 5 minutes, more on the far maps (maps 1-2 free).
//     Auto fighting is allowed on monster maps, so this is what ties it to hunting by hand in the Deepwild
//     (director: balance the whole game — about 1 minute of hunting per 6 of fighting). Out of food = 'hungry'
//     (ATK -20%, EXP -30%), never thrown out. A kitchen meal halves what the hero eats; VIP eats 30% less (not free).
//  2) Village upkeep — the villagers eat every hour; with an empty larder they go hungry and buildings make half as much.
//  The barn raises some food, but hunting wild animals in the stages is the main source.
import type { GameState } from '../core/state';

export const SUPPLY_MINS = 5;
/** food the hero eats every 5 minutes on monster map n (maps 1-2 free): 3-9 → 1, 10-19 → 2, ... 40-50 → 5 */
export const stageFood = (n: number) => (n <= 2 ? 0 : Math.min(5, 1 + Math.floor(n / 10)));
/** a kitchen meal is on (cook() marks its buff) */
export const mealOn = (s: GameState, now = Date.now()) => !!s.buff && s.buff.until > now && !!(s.buff as { meal?: boolean }).meal;
/** food eaten per hour on map n by this hero */
export function supplyPerHour(s: GameState, n: number, now = Date.now()) {
  let r = stageFood(n) * (60 / SUPPLY_MINS);
  if (((s as GameState & { vipUntil?: number }).vipUntil ?? 0) > now) r *= 0.7;
  if (mealOn(s, now)) r *= 0.5;
  return r;
}
type HS = GameState & { supDebt?: number; heroHungry?: boolean };
/** charge `ms` of time spent on map n: whole portions come out of the larder; nothing left = hungry */
export function eatSupplies(s: GameState, n: number, ms: number, now = Date.now()): { ate: number; hungry: boolean } {
  const u = s as HS;
  u.supDebt = (u.supDebt ?? 0) + supplyPerHour(s, n, now) * Math.max(0, ms) / 3600000;
  const ate = Math.min(Math.floor(u.supDebt), s.res.food);
  s.res.food -= ate; u.supDebt -= ate;
  u.heroHungry = u.supDebt >= 1;
  if (u.heroHungry) u.supDebt = 1;   // hunger does not pile up a debt
  return { ate, hungry: u.heroHungry };
}
export const heroHungry = (s: GameState) => !!(s as HS).heroHungry;
/** back in the village the hero has eaten */
export function heroFed(s: GameState) { (s as HS).heroHungry = false; }
/** minutes the larder lasts on map n (Infinity when free) */
export function supplyMinutes(s: GameState, n: number, now = Date.now()) { const r = supplyPerHour(s, n, now); return r ? s.res.food / r * 60 : Infinity; }

type US = GameState & { upkeepAt?: number; foodDebt?: number; hungry?: boolean };
/** food the village eats per hour: grows with the buildings' total level */
export function upkeepPerHour(s: GameState) { return 4 + s.buildings.reduce((a, b) => a + b.level, 0) * 0.5; }

/** Charge the village's meals up to `now` (works offline). Returns true while the village is hungry. */
export function villageUpkeep(s: GameState, now = Date.now()): boolean {
  const u = s as US;
  if (!u.upkeepAt) { u.upkeepAt = now; u.foodDebt = 0; u.hungry = false; return false; }
  const hours = Math.max(0, (now - u.upkeepAt) / 3600000);
  u.upkeepAt = now;
  u.foodDebt = (u.foodDebt ?? 0) + hours * upkeepPerHour(s);
  const eat = Math.min(Math.floor(u.foodDebt), s.res.food);
  s.res.food -= eat; u.foodDebt -= eat;
  u.hungry = u.foodDebt >= 1;
  if (u.hungry) u.foodDebt = Math.min(u.foodDebt, 1);   // hunger does not pile up a debt
  return u.hungry;
}
export const isHungry = (s: GameState) => !!(s as US).hungry;
