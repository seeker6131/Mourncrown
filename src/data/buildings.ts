// Village buildings — built and upgraded with materials earned by hunting. Each one makes the hero stronger.
export type ResKey = 'wood' | 'stone' | 'food';
export interface Cost { gold?: number; wood?: number; stone?: number; food?: number; items?: Record<string, number> }
export type BuildingId = 'forge' | 'kitchen' | 'warehouse' | 'lumber' | 'quarry' | 'barn' | 'tavern' | 'market' | 'tower' | 'home';
/** the starter village's buildings, run by NPCs (already standing in a new game); the player only builds their own 'home'.
 *  (the guild village has its own buildings: src/data/guild.ts GUILD_BLD) */
export const NPC_BUILDINGS: BuildingId[] = ['forge', 'barn', 'lumber', 'tavern', 'kitchen', 'market', 'warehouse', 'quarry', 'tower'];

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
      { gold: 400, wood: 120, stone: 80 },
      { gold: 1200, wood: 240, stone: 200, items: { slime_gel: 10 } },
      { gold: 2800, wood: 480, stone: 400, items: { wolf_pelt: 8 } },
      { gold: 6000, wood: 800, stone: 720, items: { goblin_fang: 8, wisp_essence: 5 } },
      { gold: 12000, wood: 1200, stone: 1200, items: { ancient_core: 3 } },
    ],
    effect: lv => `หลอมของขั้น ${Math.min(4, lv)} • การันตีความแรร์ขั้นต่ำ ${['ธรรมดา', 'ธรรมดา', 'ดี', 'หายาก', 'หายาก'][lv - 1]}`,
  },
  kitchen: {
    id: 'kitchen', icon: '🍲', name: 'ครัว', desc: 'ทำอาหารบัฟก่อนออกล่า (ใช้อาหารจากการล่า)', rate: 0, maxLevel: 5,
    costs: [
      { gold: 320, wood: 120, stone: 40 },
      { gold: 1000, wood: 240, stone: 120, items: { spore_cap: 8 } },
      { gold: 2400, wood: 400, stone: 240, items: { wolf_pelt: 6 } },
      { gold: 4800, wood: 640, stone: 480, items: { wisp_essence: 6 } },
      { gold: 10000, wood: 1000, stone: 800, items: { ancient_core: 2 } },
    ],
    effect: lv => `บัฟแรงขึ้น +${8 + lv * 4}% นาน ${5 + lv * 2} นาที`,
  },
  warehouse: {
    id: 'warehouse', icon: '📦', name: 'โกดัง', desc: 'ขยายกระเป๋า และคลังเก็บไม้ หิน อาหาร ได้มากขึ้น (เต็มแล้วจะล้นทิ้ง)', rate: 0, maxLevel: 4,
    costs: [
      { gold: 240, wood: 160, stone: 40 },
      { gold: 800, wood: 320, stone: 160 },
      { gold: 2000, wood: 560, stone: 360, items: { goblin_fang: 5 } },
      { gold: 4800, wood: 880, stone: 640, items: { ancient_core: 1 } },
    ],
    effect: lv => `กระเป๋า +${lv * 5} ช่อง`,
  },
  lumber: {
    id: 'lumber', icon: '🪵', name: 'โรงไม้', desc: 'คนตัดไม้ผลิตไม้ให้เรื่อยๆ (แม้ออฟไลน์) • Lv2 กลายเป็นโรงเลื่อยกังหันน้ำ', produces: 'wood', rate: 1.2, maxLevel: 5,
    costs: [
      { gold: 200, wood: 80, stone: 40 },
      { gold: 600, wood: 160, stone: 80 },
      { gold: 1400, wood: 320, stone: 160, items: { wolf_pelt: 4 } },
      { gold: 3000, wood: 560, stone: 280, items: { goblin_fang: 5 } },
      { gold: 6000, wood: 880, stone: 440, items: { ancient_core: 1 } },
    ],
    effect: lv => `ผลิตไม้ ${(1.2 * (1 + (lv - 1) * 0.6)).toFixed(1)}/นาที`,
  },
  quarry: {
    id: 'quarry', icon: '🪨', name: 'เหมืองหิน', desc: 'คนงานสกัดหินให้เรื่อยๆ (ช้ากว่าไม้ เพราะหินหายากกว่า)', produces: 'stone', rate: 0.8, maxLevel: 5,
    costs: [
      { gold: 280, wood: 140, stone: 20 },
      { gold: 840, wood: 280, stone: 40 },
      { gold: 1960, wood: 560, stone: 80, items: { wolf_pelt: 4 } },
      { gold: 4200, wood: 980, stone: 140, items: { goblin_fang: 5 } },
      { gold: 8400, wood: 1540, stone: 220, items: { ancient_core: 1 } },
    ],
    effect: lv => `ผลิตหิน ${(0.8 * (1 + (lv - 1) * 0.6)).toFixed(1)}/นาที`,
  },
  barn: {
    id: 'barn', icon: '🐄', name: 'คอกสัตว์', desc: 'เลี้ยงวัว แกะ ไก่ หมู — อาหารส่วนหนึ่งของหมู่บ้าน (แต่ไม่พอเลี้ยงทั้งหมู่บ้าน ต้องออกล่าสัตว์ด้วย)', produces: 'food', rate: 0.35, maxLevel: 5,
    costs: [
      { gold: 480, wood: 200, stone: 80, food: 120 },
      { gold: 1440, wood: 400, stone: 160, food: 240 },
      { gold: 3360, wood: 800, stone: 320, food: 480, items: { wolf_pelt: 4 } },
      { gold: 7200, wood: 1400, stone: 560, food: 840, items: { goblin_fang: 5 } },
      { gold: 14400, wood: 2200, stone: 880, food: 1320, items: { ancient_core: 1 } },
    ],
    effect: lv => `ผลิตอาหาร ${(1.8 * (1 + (lv - 1) * 0.6)).toFixed(1)}/นาที`,
  },
  tavern: {
    id: 'tavern', icon: '🍺', name: 'โรงเตี๊ยม', desc: 'นักผจญภัยมาแลกเรื่องเล่า — ได้ EXP จากทุกอย่างเพิ่มขึ้น', rate: 0, maxLevel: 5,
    costs: [
      { gold: 600, wood: 240, stone: 120, food: 80 },
      { gold: 1800, wood: 480, stone: 240, food: 160 },
      { gold: 4200, wood: 960, stone: 480, food: 320, items: { wolf_pelt: 4 } },
      { gold: 9000, wood: 1680, stone: 840, food: 560, items: { goblin_fang: 5 } },
      { gold: 18000, wood: 2640, stone: 1320, food: 880, items: { ancient_core: 1 } },
    ],
    effect: lv => `EXP +${lv * 4}%`,
  },
  market: {
    id: 'market', icon: '💰', name: 'ตลาด', desc: 'พ่อค้าเร่มาตั้งแผง เก็บภาษีเป็นทองให้หมู่บ้าน', produces: 'gold', rate: 2, maxLevel: 5,
    costs: [
      { gold: 800, wood: 200, stone: 120 },
      { gold: 2400, wood: 400, stone: 240 },
      { gold: 5600, wood: 800, stone: 480, items: { wolf_pelt: 4 } },
      { gold: 12000, wood: 1400, stone: 840, items: { goblin_fang: 5 } },
      { gold: 24000, wood: 2200, stone: 1320, items: { ancient_core: 1 } },
    ],
    effect: lv => `ทอง ${(2 * (1 + (lv - 1) * 0.6)).toFixed(1)}/นาที`,
  },
  tower: {
    id: 'tower', icon: '🏰', name: 'หอป้องกัน', desc: 'ป้องกันหมู่บ้าน • ทหารฝึกให้เราแกร่งขึ้น (DEF/HP)', rate: 0, maxLevel: 5,
    costs: [
      { gold: 720, wood: 160, stone: 240 },
      { gold: 2160, wood: 320, stone: 480 },
      { gold: 5040, wood: 640, stone: 960, items: { wolf_pelt: 4 } },
      { gold: 10800, wood: 1120, stone: 1680, items: { goblin_fang: 5 } },
      { gold: 21600, wood: 1760, stone: 2640, items: { ancient_core: 1 } },
    ],
    effect: lv => `DEF +${lv * 3}%  HP +${lv * 2}%`,
  },
  home: {
    id: 'home', icon: '🏠', name: 'บ้านของฉัน', desc: 'บ้านของคุณเอง (สร้าง/อัปด้วยของส่วนตัว) — พักฟื้นเร็วขึ้น • ข้างในมีเตียงพักผ่อน (ล่ามอนได้ EXP เพิ่ม) ตู้โชว์ของแรร์ (บัฟถาวร) หีบเก็บของส่วนตัว', rate: 0, maxLevel: 5,
    costs: [
      { gold: 320, wood: 120, stone: 60 },
      { gold: 1200, wood: 320, stone: 200 },
      { gold: 3200, wood: 640, stone: 440, items: { wolf_pelt: 4 } },
      { gold: 7200, wood: 1040, stone: 800, items: { goblin_fang: 5 } },
      { gold: 14400, wood: 1680, stone: 1360, items: { ancient_core: 1 } },
    ],
    effect: lv => `ฟื้น HP ในหมู่บ้าน x${(1 + lv * 0.5).toFixed(1)} • หีบ ${10 + lv * 10} ช่อง • ตู้โชว์ ${Math.min(6, 1 + lv)} ชิ้น • พักผ่อนสะสมได้ ${300 + 150 * lv} ตัว • กระเป๋า +${lv * 2} ช่อง`,
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
