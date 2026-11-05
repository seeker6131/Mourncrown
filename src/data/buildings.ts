// Settlement buildings: produce resources over time, unlock crafting.
export type ResKey = 'wood' | 'stone' | 'food';
export type Cost = Partial<Record<ResKey | 'gold', number>>;
export type BuildingId = 'lumber' | 'quarry' | 'farm' | 'forge';

export interface BuildingDef {
  id: BuildingId;
  name: string;
  desc: string;
  produces?: ResKey;
  rate: number; // units per minute at level 1
  cost: Cost; // level-1 cost; upgrades scale
  maxLevel: number;
}

export const RES_NAMES: Record<ResKey | 'gold', string> = { wood: 'ไม้', stone: 'หิน', food: 'อาหาร', gold: 'ทอง' };

export const BUILDINGS: Record<BuildingId, BuildingDef> = {
  lumber: { id: 'lumber', name: 'โรงเลื่อยไม้', desc: 'คนตัดไม้ผลิตไม้ให้อัตโนมัติ', produces: 'wood', rate: 6, cost: { gold: 40, wood: 20 }, maxLevel: 10 },
  quarry: { id: 'quarry', name: 'เหมืองหิน', desc: 'ขุดหินให้อัตโนมัติ', produces: 'stone', rate: 4, cost: { gold: 60, wood: 40 }, maxLevel: 10 },
  farm: { id: 'farm', name: 'ฟาร์ม', desc: 'ปลูกผักเลี้ยงสัตว์ ผลิตอาหาร', produces: 'food', rate: 5, cost: { gold: 50, wood: 30, stone: 10 }, maxLevel: 10 },
  forge: { id: 'forge', name: 'โรงหลอมอาวุธ', desc: 'หลอมอาวุธ/เกราะ ยิ่งเลเวลสูงยิ่งได้ของแรร์', rate: 0, cost: { gold: 150, wood: 80, stone: 60 }, maxLevel: 5 },
};

/** Cost to reach `level` (1 = build). */
export function levelCost(d: BuildingDef, level: number): Cost {
  const m = Math.pow(1.75, level - 1);
  const out: Cost = {};
  for (const [k, v] of Object.entries(d.cost)) out[k as keyof Cost] = Math.round(v! * m);
  if (level >= 3) out.food = Math.round(20 * Math.pow(1.6, level - 3));
  return out;
}

export function ratePerMin(d: BuildingDef, level: number) { return d.rate * (1 + (level - 1) * 0.6); }
/** Storage cap = 2 hours of production. */
export function storageCap(d: BuildingDef, level: number) { return Math.round(ratePerMin(d, level) * 120); }

/** Forge recipes: cost and guaranteed minimum rarity scale with forge level. */
export function forgeRecipe(forgeLevel: number, slot: 'weapon' | 'armor' | 'accessory') {
  const base: Cost = slot === 'weapon' ? { gold: 80, wood: 30, stone: 40 } : slot === 'armor' ? { gold: 80, wood: 20, stone: 50 } : { gold: 120, stone: 30, food: 20 };
  const m = 1 + (forgeLevel - 1) * 0.8;
  const cost: Cost = {};
  for (const [k, v] of Object.entries(base)) cost[k as keyof Cost] = Math.round(v! * m);
  return { cost, shards: forgeLevel, minRarity: Math.min(3, Math.floor((forgeLevel - 1) / 1.5)), tier: Math.min(4, forgeLevel), mf: forgeLevel * 40 };
}
