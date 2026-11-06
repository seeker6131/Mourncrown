// Village buildings — built and upgraded with materials earned by hunting. Each one makes the hero stronger.
export type ResKey = 'wood' | 'stone' | 'food';
export interface Cost { gold?: number; wood?: number; stone?: number; food?: number; items?: Record<string, number> }
export type BuildingId = 'forge' | 'kitchen' | 'warehouse' | 'lumber' | 'quarry' | 'farm' | 'barn' | 'tavern' | 'market' | 'tower';

export interface BuildingDef {
  id: BuildingId;
  name: string;
  desc: string;
  produces?: ResKey | 'gold';
  /** short icon for picker cards */
  icon: string;
  rate: number;
  maxLevel: number;
  /** cost for level i+1 (index 0 = build) */
  costs: Cost[];
  effect: (lv: number) => string;
}

export const RES_NAMES: Record<ResKey | 'gold', string> = { wood: 'ไม้', stone: 'หิน', food: 'อาหาร', gold: 'ทอง' };

export const BUILDINGS: Record<BuildingId, BuildingDef> = {
  forge: {
    id: 'forge', icon: '⚒', name: 'โรงหลอม', desc: 'หลอมอาวุธ เกราะ เครื่องประดับ — ยิ่งเลเวลสูงยิ่งได้ของแรร์', rate: 0, maxLevel: 5,
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
    id: 'kitchen', icon: '🍲', name: 'ครัว', desc: 'ทำอาหารบัฟก่อนออกล่า (ใช้อาหารจากการล่า)', rate: 0, maxLevel: 5,
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
    id: 'warehouse', icon: '📦', name: 'โกดัง', desc: 'ขยายกระเป๋า เก็บของดรอปได้มากขึ้น', rate: 0, maxLevel: 4,
    costs: [
      { gold: 60, wood: 40, stone: 10 },
      { gold: 200, wood: 80, stone: 40 },
      { gold: 500, wood: 140, stone: 90, items: { goblin_fang: 5 } },
      { gold: 1200, wood: 220, stone: 160, items: { ancient_core: 1 } },
    ],
    effect: lv => `กระเป๋า +${lv * 5} ช่อง`,
  },
  lumber: {
    id: 'lumber', icon: '🪵', name: 'โรงไม้', desc: 'คนตัดไม้ผลิตไม้ให้เรื่อยๆ (แม้ออฟไลน์) • Lv2 กลายเป็นโรงเลื่อยกังหันน้ำ', produces: 'wood', rate: 1.2, maxLevel: 5,
    costs: [
      { gold: 50, wood: 20, stone: 10 },
      { gold: 150, wood: 40, stone: 20 },
      { gold: 350, wood: 80, stone: 40, items: { wolf_pelt: 4 } },
      { gold: 750, wood: 140, stone: 70, items: { goblin_fang: 5 } },
      { gold: 1500, wood: 220, stone: 110, items: { ancient_core: 1 } },
    ],
    effect: lv => `ผลิตไม้ ${(1.2 * (1 + (lv - 1) * 0.6)).toFixed(1)}/นาที`,
  },
  quarry: {
    id: 'quarry', icon: '🪨', name: 'เหมืองหิน', desc: 'คนงานสกัดหินให้เรื่อยๆ (ช้ากว่าไม้ เพราะหินหายากกว่า)', produces: 'stone', rate: 0.8, maxLevel: 5,
    costs: [
      { gold: 70, wood: 35, stone: 5 },
      { gold: 210, wood: 70, stone: 10 },
      { gold: 490, wood: 140, stone: 20, items: { wolf_pelt: 4 } },
      { gold: 1050, wood: 245, stone: 35, items: { goblin_fang: 5 } },
      { gold: 2100, wood: 385, stone: 55, items: { ancient_core: 1 } },
    ],
    effect: lv => `ผลิตหิน ${(0.8 * (1 + (lv - 1) * 0.6)).toFixed(1)}/นาที`,
  },
  farm: {
    id: 'farm', icon: '🌾', name: 'ไร่ผัก', desc: 'ปลูกผักเป็นอาหาร ใช้ทำอาหารบัฟ/สร้างอาคาร', produces: 'food', rate: 1, maxLevel: 5,
    costs: [
      { gold: 40, wood: 25, stone: 5 },
      { gold: 120, wood: 50, stone: 10 },
      { gold: 280, wood: 100, stone: 20, items: { wolf_pelt: 4 } },
      { gold: 600, wood: 175, stone: 35, items: { goblin_fang: 5 } },
      { gold: 1200, wood: 275, stone: 55, items: { ancient_core: 1 } },
    ],
    effect: lv => `ผลิตอาหาร ${(1 * (1 + (lv - 1) * 0.6)).toFixed(1)}/นาที`,
  },
  barn: {
    id: 'barn', icon: '🐄', name: 'คอกสัตว์', desc: 'เลี้ยงวัว แกะ ไก่ หมู — ได้อาหารมากกว่าไร่ แต่สร้างแพง', produces: 'food', rate: 1.8, maxLevel: 5,
    costs: [
      { gold: 120, wood: 50, stone: 20, food: 30 },
      { gold: 360, wood: 100, stone: 40, food: 60 },
      { gold: 840, wood: 200, stone: 80, food: 120, items: { wolf_pelt: 4 } },
      { gold: 1800, wood: 350, stone: 140, food: 210, items: { goblin_fang: 5 } },
      { gold: 3600, wood: 550, stone: 220, food: 330, items: { ancient_core: 1 } },
    ],
    effect: lv => `ผลิตอาหาร ${(1.8 * (1 + (lv - 1) * 0.6)).toFixed(1)}/นาที`,
  },
  tavern: {
    id: 'tavern', icon: '🍺', name: 'โรงเตี๊ยม', desc: 'นักผจญภัยมาแลกเรื่องเล่า — ได้ EXP จากทุกอย่างเพิ่มขึ้น', rate: 0, maxLevel: 5,
    costs: [
      { gold: 150, wood: 60, stone: 30, food: 20 },
      { gold: 450, wood: 120, stone: 60, food: 40 },
      { gold: 1050, wood: 240, stone: 120, food: 80, items: { wolf_pelt: 4 } },
      { gold: 2250, wood: 420, stone: 210, food: 140, items: { goblin_fang: 5 } },
      { gold: 4500, wood: 660, stone: 330, food: 220, items: { ancient_core: 1 } },
    ],
    effect: lv => `EXP +${lv * 4}%`,
  },
  market: {
    id: 'market', icon: '💰', name: 'ตลาด', desc: 'พ่อค้าเร่มาตั้งแผง เก็บภาษีเป็นทองให้หมู่บ้าน', produces: 'gold', rate: 2, maxLevel: 5,
    costs: [
      { gold: 200, wood: 50, stone: 30 },
      { gold: 600, wood: 100, stone: 60 },
      { gold: 1400, wood: 200, stone: 120, items: { wolf_pelt: 4 } },
      { gold: 3000, wood: 350, stone: 210, items: { goblin_fang: 5 } },
      { gold: 6000, wood: 550, stone: 330, items: { ancient_core: 1 } },
    ],
    effect: lv => `ทอง ${(2 * (1 + (lv - 1) * 0.6)).toFixed(1)}/นาที`,
  },
  tower: {
    id: 'tower', icon: '🏰', name: 'หอป้องกัน', desc: 'ป้องกันหมู่บ้าน (สงครามปล้นหมู่บ้านในโหมดออนไลน์) • ทหารฝึกให้เราแกร่งขึ้น', rate: 0, maxLevel: 5,
    costs: [
      { gold: 180, wood: 40, stone: 60 },
      { gold: 540, wood: 80, stone: 120 },
      { gold: 1260, wood: 160, stone: 240, items: { wolf_pelt: 4 } },
      { gold: 2700, wood: 280, stone: 420, items: { goblin_fang: 5 } },
      { gold: 5400, wood: 440, stone: 660, items: { ancient_core: 1 } },
    ],
    effect: lv => `DEF +${lv * 3}%  HP +${lv * 2}%`,
  },
};

export function levelCost(d: BuildingDef, level: number): Cost { return d.costs[level - 1] ?? d.costs[d.costs.length - 1]; }
export function ratePerMin(d: BuildingDef, level: number) { return d.rate * (1 + (level - 1) * 0.6); }
export function storageCap(d: BuildingDef, level: number) { return Math.round(ratePerMin(d, level) * 120); }

/** Plots unlock as the curse is cleansed (boss kills). */
export function unlockedPlots(bossDefeated: number) { return 3 + (bossDefeated > 0 ? 3 : 0) + (bossDefeated >= 3 ? 3 : 0); }

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
