// Settlement: resources, building, upgrading, production and forge crafting — pure logic.
import type { GameState } from '../core/state';
import { BUILDINGS, levelCost, ratePerMin, storageCap, forgeRecipe, unlockedPlots, MEALS, mealPower, type BuildingId, type Cost, type ResKey, type MealId } from '../data/buildings';
import { addItem, countItem, removeItem } from './inventory';
import { GEAR_BASES, baseTier, rollRarity, makeGear } from './loot';
import { itemDef } from '../data/items';

export function canAfford(s: GameState, c: Cost): boolean {
  if ((c.gold ?? 0) > s.gold) return false;
  for (const k of ['wood', 'stone', 'food'] as ResKey[]) if ((c[k] ?? 0) > s.res[k]) return false;
  for (const [id, n] of Object.entries(c.items ?? {})) if (countItem(s, id) < n) return false;
  return true;
}

export function pay(s: GameState, c: Cost): boolean {
  if (!canAfford(s, c)) return false;
  s.gold -= c.gold ?? 0;
  for (const k of ['wood', 'stone', 'food'] as ResKey[]) s.res[k] -= c[k] ?? 0;
  for (const [id, n] of Object.entries(c.items ?? {})) removeItem(s, id, n);
  return true;
}

/** Construction time (scaffolding shown, production paused) in ms. */
export function buildTime(level: number) { return [0, 20, 60, 180, 420, 900][level] * 1000; }
export function underConstruction(b: { done?: number }, now = Date.now()) { return !!b.done && now < b.done; }

export function buildingAt(s: GameState, plot: number) { return s.buildings.find(b => b.plot === plot) ?? null; }

export function build(s: GameState, plot: number, type: BuildingId, now = Date.now()): boolean {
  if (buildingAt(s, plot)) return false;
  if (plot >= unlockedPlots(s.bossDefeated)) return false;
  if (s.buildings.some(b => b.type === type)) return false; // one of each
  if (!pay(s, levelCost(BUILDINGS[type], 1))) return false;
  s.buildings.push({ plot, type, level: 1, stored: 0, last: now, done: now + buildTime(1) });
  return true;
}

export function upgrade(s: GameState, plot: number): boolean {
  const b = buildingAt(s, plot);
  if (!b) return false;
  const d = BUILDINGS[b.type as BuildingId];
  if (b.level >= d.maxLevel) return false;
  if (!pay(s, levelCost(d, b.level + 1))) return false;
  b.level++;
  b.done = Date.now() + buildTime(b.level);
  return true;
}

/** Accumulate production up to now (works offline too). */
export function tick(s: GameState, now = Date.now()) {
  for (const b of s.buildings) {
    const d = BUILDINGS[b.type as BuildingId];
    if (!d.produces || underConstruction(b, now)) { b.last = now; continue; }
    const mins = Math.max(0, (now - b.last) / 60000);
    b.stored = Math.min(storageCap(d, b.level), b.stored + ratePerMin(d, b.level) * mins);
    b.last = now;
  }
}

/** Collect whole units from a building; returns amount and resource. */
export function collect(s: GameState, plot: number): { res: ResKey | 'gold'; amount: number } | null {
  const b = buildingAt(s, plot);
  if (!b) return null;
  const d = BUILDINGS[b.type as BuildingId];
  if (!d.produces) return null;
  const amount = Math.floor(b.stored);
  if (amount < 1) return null;
  b.stored -= amount;
  if (d.produces === 'gold') s.gold += amount; else s.res[d.produces] += amount;
  return { res: d.produces, amount };
}

export function forgeLevel(s: GameState) { return s.buildings.find(b => b.type === 'forge')?.level ?? 0; }

export type CraftResult = { ok: true; uid: number; rar: number; id: string } | { ok: false; reason: 'no_forge' | 'no_res' | 'no_shard' | 'bag_full' };

export function craft(s: GameState, slot: 'weapon' | 'armor' | 'accessory', rnd: () => number = Math.random): CraftResult {
  const lv = forgeLevel(s);
  if (!lv) return { ok: false, reason: 'no_forge' };
  const r = forgeRecipe(lv, slot);
  if (countItem(s, 'mana_shard') < r.shards) return { ok: false, reason: 'no_shard' };
  if (!canAfford(s, r.cost)) return { ok: false, reason: 'no_res' };
  const pool = GEAR_BASES.filter(d => d.type === slot && baseTier(d) <= r.tier && baseTier(d) >= Math.max(1, r.tier - 1));
  const base = pool[Math.floor(rnd() * pool.length)] ?? GEAR_BASES.find(d => d.type === slot)!;
  const rar = rollRarity(rnd, r.mf, r.minRarity);
  if (!addItem(s, base.id, 1, 0, makeGear(rnd, base.id, rar))) return { ok: false, reason: 'bag_full' };
  pay(s, r.cost);
  removeItem(s, 'mana_shard', r.shards);
  const it = s.inventory[s.inventory.length - 1];
  return { ok: true, uid: it.uid, rar, id: itemDef(base.id).id };
}

export function levelOf(s: GameState, type: BuildingId) { const b = s.buildings.find(q => q.type === type); return b ? (underConstruction(b) ? b.level - 1 : b.level) : 0; }

export function cook(s: GameState, meal: MealId, now = Date.now()): 'ok' | 'no_kitchen' | 'no_food' | 'locked' {
  const lv = levelOf(s, 'kitchen');
  if (!lv) return 'no_kitchen';
  if (lv < MEALS[meal].minLv) return 'locked';
  const p = mealPower(lv);
  if (s.res.food < p.food) return 'no_food';
  s.res.food -= p.food;
  s.buff = { stat: MEALS[meal].stat, pct: p.pct, until: now + p.mins * 60000 };
  return 'ok';
}
