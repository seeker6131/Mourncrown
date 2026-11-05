// Settlement: resources, building, upgrading, production and forge crafting — pure logic.
import type { GameState } from '../core/state';
import { BUILDINGS, levelCost, ratePerMin, storageCap, forgeRecipe, type BuildingId, type Cost, type ResKey } from '../data/buildings';
import { addItem, countItem, removeItem } from './inventory';
import { GEAR_BASES, baseTier, rollRarity, makeGear } from './loot';
import { itemDef } from '../data/items';

export function canAfford(s: GameState, c: Cost): boolean {
  for (const [k, v] of Object.entries(c)) {
    const have = k === 'gold' ? s.gold : s.res[k as ResKey];
    if (have < (v ?? 0)) return false;
  }
  return true;
}

export function pay(s: GameState, c: Cost): boolean {
  if (!canAfford(s, c)) return false;
  for (const [k, v] of Object.entries(c)) { if (k === 'gold') s.gold -= v!; else s.res[k as ResKey] -= v!; }
  return true;
}

export function buildingAt(s: GameState, plot: number) { return s.buildings.find(b => b.plot === plot) ?? null; }

export function build(s: GameState, plot: number, type: BuildingId, now = Date.now()): boolean {
  if (buildingAt(s, plot)) return false;
  if (type === 'forge' && s.buildings.some(b => b.type === 'forge')) return false;
  if (!pay(s, levelCost(BUILDINGS[type], 1))) return false;
  s.buildings.push({ plot, type, level: 1, stored: 0, last: now });
  return true;
}

export function upgrade(s: GameState, plot: number): boolean {
  const b = buildingAt(s, plot);
  if (!b) return false;
  const d = BUILDINGS[b.type as BuildingId];
  if (b.level >= d.maxLevel) return false;
  if (!pay(s, levelCost(d, b.level + 1))) return false;
  b.level++;
  return true;
}

/** Accumulate production up to now (works offline too). */
export function tick(s: GameState, now = Date.now()) {
  for (const b of s.buildings) {
    const d = BUILDINGS[b.type as BuildingId];
    if (!d.produces) { b.last = now; continue; }
    const mins = Math.max(0, (now - b.last) / 60000);
    b.stored = Math.min(storageCap(d, b.level), b.stored + ratePerMin(d, b.level) * mins);
    b.last = now;
  }
}

/** Collect whole units from a building; returns amount and resource. */
export function collect(s: GameState, plot: number): { res: ResKey; amount: number } | null {
  const b = buildingAt(s, plot);
  if (!b) return null;
  const d = BUILDINGS[b.type as BuildingId];
  if (!d.produces) return null;
  const amount = Math.floor(b.stored);
  if (amount < 1) return null;
  b.stored -= amount;
  s.res[d.produces] += amount;
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
