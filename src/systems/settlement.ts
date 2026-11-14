// Settlement: resources, building, upgrading, production and forge crafting — pure logic.
import type { GameState } from '../core/state';
import { BUILDINGS, NPC_BUILDINGS, levelCost, ratePerMin, storageCap, forgeRecipe, unlockedPlots, MEALS, mealPower, type BuildingId, type Cost, type ResKey, type MealId } from '../data/buildings';
import { addItem, countItem, removeItem } from './inventory';
import { villageUpkeep } from './supplies';
import { buffCap, buffFull, sameBuff, stackUntil } from './buffs';
import { rollRarity, makeGear, pickBase } from './loot';
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

/** the home village's plots: each NPC building's plot, and the player's home plot (shared with the server: world/villageLayout is the guild village) */
export const VILLAGE_PLOT_OF: Record<string, number> = { forge: 0, barn: 1, lumber: 2, tavern: 3, kitchen: 4, market: 5, warehouse: 6, quarry: 7, tower: 8 };
export const VILLAGE_HOME_PLOT = 9;
/** the home village as it should stand (the server runs this too — the NPC buildings must exist there, or building on /
 *  collecting from them is refused and the device's copy loses them after a reload); true = something was added */
export function ensureHomeVillage(s: GameState, now = Date.now()) { const n = s.buildings.length; ensureNpcVillage(s, VILLAGE_PLOT_OF, VILLAGE_HOME_PLOT, now); return s.buildings.length !== n; }
/** Top-down village: every NPC building stands from the start (level 1) at its own plot; only the home plot is the player's.
 *  Also repairs older saves (missing types are added, the first free plot is used if theirs is taken). */
export function ensureNpcVillage(s: GameState, plotOf: Record<string, number>, homePlot: number, now = Date.now()) {
  const taken = new Set(s.buildings.map(b => b.plot));
  for (const t of NPC_BUILDINGS) {
    if (s.buildings.some(b => b.type === t)) continue;
    let p = plotOf[t];
    if (taken.has(p)) p = Object.values(plotOf).find(q => !taken.has(q)) ?? -1;
    if (p < 0) continue;
    s.buildings.push({ plot: p, type: t, level: 1, stored: 0, last: now }); taken.add(p);
  }
  // a home that ended up on an NPC plot moves to the home plot
  const h = s.buildings.find(b => b.type === 'home');
  if (h && h.plot !== homePlot && !taken.has(homePlot)) h.plot = homePlot;
}

/** the lost-house bug (13 Nov 2026): until that day the NPC buildings lived on the device only, so wood from them never
 *  reached the server, the server refused the home the device showed, and every update took the house (and the quests
 *  after it) away. Heroes stuck like that (Lv6+, no home, quest chain at "build your home") get the home Lv1 from the
 *  server, once — only until HOME_FIX_UNTIL. 0 = nothing to do, 1 = checked (marked), 2 = the house was given */
export const HOME_FIX_UNTIL = Date.UTC(2026, 10, 17);
export function homeFix(s: GameState, now = Date.now()): 0 | 1 | 2 {
  const t = s as GameState & { homeFix?: number; tdq?: { i: number } };
  if (t.homeFix || now >= HOME_FIX_UNTIL) return 0;
  t.homeFix = now;
  if (s.level < 6 || (t.tdq?.i ?? 0) > 2 || s.buildings.some(b => b.type === 'home') || buildingAt(s, VILLAGE_HOME_PLOT)) return 1;
  s.buildings.push({ plot: VILLAGE_HOME_PLOT, type: 'home', level: 1, stored: 0, last: now });
  return 2;
}

export function build(s: GameState, plot: number, type: BuildingId, now = Date.now()): boolean {
  if (buildingAt(s, plot)) return false;
  if (type !== 'home' && plot >= unlockedPlots(s.bossDefeated)) return false;
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
  const half = villageUpkeep(s, now) ? 0.5 : 1;   // hungry villagers work at half speed
  for (const b of s.buildings) {
    const d = BUILDINGS[b.type as BuildingId];
    if (!d.produces || underConstruction(b, now)) { b.last = now; continue; }
    const mins = Math.max(0, (now - b.last) / 60000);
    b.stored = Math.min(storageCap(d, b.level), b.stored + ratePerMin(d, b.level) * mins * (d.produces === 'food' ? 1 : half));
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
  const rar = Math.min(4, rollRarity(rnd, r.mf, r.minRarity));   // the forge never makes SL (drops only)
  const base = pickBase(rnd, rar, s.cls, slot);
  if (!addItem(s, base.id, 1, 0, makeGear(rnd, base.id, rar))) return { ok: false, reason: 'bag_full' };
  pay(s, r.cost);
  removeItem(s, 'mana_shard', r.shards);
  const it = s.inventory[s.inventory.length - 1];
  return { ok: true, uid: it.uid, rar, id: itemDef(base.id).id };
}

export function levelOf(s: GameState, type: BuildingId) { const b = s.buildings.find(q => q.type === type); return b ? (underConstruction(b) ? b.level - 1 : b.level) : 0; }

export function cook(s: GameState, meal: MealId, now = Date.now()): 'ok' | 'no_kitchen' | 'no_food' | 'locked' | 'full' {
  const lv = levelOf(s, 'kitchen');
  if (!lv) return 'no_kitchen';
  if (lv < MEALS[meal].minLv) return 'locked';
  const p = mealPower(lv);
  const inc = { slot: 'buff' as const, stat: MEALS[meal].stat, pct: p.pct, meal: true };
  if (buffFull(s, inc, now)) return 'full';   // (⏳ the same meal adds its time, up to 1 h / VIP 3 h)
  if (s.res.food < p.food) return 'no_food';
  s.res.food -= p.food;
  s.buff = { stat: MEALS[meal].stat, pct: p.pct, until: stackUntil(s.buff?.until, sameBuff(s, inc, now), p.mins * 60000, buffCap(s, now), now), meal: true };   // a meal also halves what the hero eats on the maps (supplies.ts)
  return 'ok';
}
