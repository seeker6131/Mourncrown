// Why food matters (pure rules; server-side later):
//  1) Supplies — going out to hunt costs food; the further the stage, the more you need (stages 1-2 are free).
//  2) Village upkeep — the villagers eat every hour; with an empty larder they go hungry and buildings make half as much.
//  The barn raises some food, but hunting wild animals in the stages is the main source.
import type { GameState } from '../core/state';

export const stageFood = (n: number) => (n <= 2 ? 0 : 2 + Math.floor(n / 5));

export function payStage(s: GameState, n: number): boolean {
  if (((s as GameState & { vipUntil?: number }).vipUntil ?? 0) > Date.now()) return true;   // VIP: free entry
  const c = stageFood(n);
  if (s.res.food < c) return false;
  s.res.food -= c;
  return true;
}

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
