// Village buildings — built and upgraded with materials earned by hunting. Each one makes the hero stronger.
export type ResKey = 'wood' | 'stone' | 'food';
export interface Cost { gold?: number; wood?: number; stone?: number; food?: number; items?: Record<string, number> }
export type BuildingId = 'forge' | 'kitchen' | 'warehouse';

export interface BuildingDef {
  id: BuildingId;
  name: string;
  desc: string;
  produces?: ResKey;
  rate: number;
  maxLevel: number;
  /** cost for level i+1 (index 0 = build) */
  costs: Cost[];
  effect: (lv: number) => string;
}

export const RES_NAMES: Record<ResKey | 'gold', string> = { wood: 'ไม้', stone: 'หิน', food: 'อาหาร', gold: 'ทอง' };

export const BUILDINGS: Record<BuildingId, BuildingDef> = {
  forge: {
    id: 'forge', name: 'โรงหลอม', desc: 'หลอมอาวุธ เกราะ เครื่องประดับ — ยิ่งเลเวลสูงยิ่งได้ของแรร์', rate: 0, maxLevel: 5,
    costs: [
      { gold: 100, wood: 30, stone: 20 },
      { gold: 300, wood: 60, stone: 50, items: { slime_gel: 10 } },
      { gold: 700, wood: 120, stone: 100, items: { wolf_pelt: 8 } },
      { gold: 1500, wood: 200, stone: 180, items: { goblin_fang: 8, wisp_essence: 5 } },
      { gold: 3000, wood: 300, stone: 300, items: { ancient_core: 3 } },
    ],
    effect: lv => `หลอมของขั้น ${Math.min(4, lv)} • การันตีความแรร์ขั้นต่ำ ${['ธรรมดา', 'ธรรมดา', 'ดี', 'หายาก', 'หายาก'][lv - 1]}`,
  },
  kitchen: {
    id: 'kitchen', name: 'ครัว', desc: 'ทำอาหารบัฟก่อนออกล่า (ใช้อาหารจากการล่า)', rate: 0, maxLevel: 5,
    costs: [
      { gold: 80, wood: 30, stone: 10 },
      { gold: 250, wood: 60, stone: 30, items: { spore_cap: 8 } },
      { gold: 600, wood: 100, stone: 60, items: { wolf_pelt: 6 } },
      { gold: 1200, wood: 160, stone: 120, items: { wisp_essence: 6 } },
      { gold: 2500, wood: 250, stone: 200, items: { ancient_core: 2 } },
    ],
    effect: lv => `บัฟแรงขึ้น +${8 + lv * 4}% นาน ${5 + lv * 2} นาที`,
  },
  warehouse: {
    id: 'warehouse', name: 'โกดัง', desc: 'ขยายกระเป๋า เก็บของดรอปได้มากขึ้น', rate: 0, maxLevel: 4,
    costs: [
      { gold: 60, wood: 40, stone: 10 },
      { gold: 200, wood: 80, stone: 40 },
      { gold: 500, wood: 140, stone: 90, items: { goblin_fang: 5 } },
      { gold: 1200, wood: 220, stone: 160, items: { ancient_core: 1 } },
    ],
    effect: lv => `กระเป๋า +${lv * 5} ช่อง`,
  },
};

export function levelCost(d: BuildingDef, level: number): Cost { return d.costs[level - 1] ?? d.costs[d.costs.length - 1]; }
export function ratePerMin(d: BuildingDef, level: number) { return d.rate * (1 + (level - 1) * 0.6); }
export function storageCap(d: BuildingDef, level: number) { return Math.round(ratePerMin(d, level) * 120); }

/** Plots unlock as the curse is cleansed (boss kills). */
export function unlockedPlots(bossDefeated: number) { return Math.min(6, 3 + (bossDefeated > 0 ? 3 : 0)); }

/** Forge recipes: cost and guaranteed minimum rarity scale with forge level. */
export function forgeRecipe(forgeLevel: number, slot: 'weapon' | 'armor' | 'accessory') {
  const base: Cost = slot === 'weapon' ? { gold: 80, wood: 30, stone: 40 } : slot === 'armor' ? { gold: 80, wood: 20, stone: 50 } : { gold: 120, stone: 30, food: 20 };
  const m = 1 + (forgeLevel - 1) * 0.8;
  const cost: Cost = {};
  for (const [k, v] of Object.entries(base)) (cost as Record<string, number>)[k] = Math.round((v as number) * m);
  return { cost, shards: forgeLevel, minRarity: [0, 0, 1, 2, 2][forgeLevel - 1] ?? 2, tier: Math.min(4, forgeLevel), mf: forgeLevel * 40 };
}

export type MealId = 'hunter_stew' | 'knight_bread';
export const MEALS: Record<MealId, { name: string; desc: string; food: number; stat: 'atk' | 'hp'; minLv: number }> = {
  hunter_stew: { name: 'สตูว์นักล่า', desc: 'เพิ่ม ATK/MATK', food: 15, stat: 'atk', minLv: 1 },
  knight_bread: { name: 'ขนมปังอัศวิน', desc: 'เพิ่ม HP สูงสุด และ DEF', food: 15, stat: 'hp', minLv: 2 },
};
export function mealPower(kitchenLv: number) { return { pct: 8 + kitchenLv * 4, mins: 5 + kitchenLv * 2, food: 10 + kitchenLv * 5 }; }
