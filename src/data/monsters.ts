export type MonsterKind = 'slime' | 'shroom' | 'wolf' | 'goblin' | 'wisp' | 'treant' | 'deer' | 'boar'
  | 'rat' | 'skeleton' | 'skarcher' | 'ghost' | 'spider' | 'imp' | 'golem' | 'salamander' | 'icewolf' | 'yeti'
  | 'stag' | 'dragon' | 'frostgiant' | 'skking' | 'jailer';

export interface Drop { id: string; chance: number; min?: number; max?: number }

export interface MonsterDef {
  kind: MonsterKind;
  name: string;
  level: number;
  hp: number;
  atk: number;
  def: number;
  exp: number;
  gold: [number, number];
  speed: number;
  aggro: number; // px
  attackRange: number;
  attackCooldown: number; // ms
  ranged?: boolean;
  boss?: boolean;
  bodyRadius: number;
  drops: Drop[];
  /** wild animal (resource map): no gear/gold, meat instead */
  animal?: boolean;
  /** runs away when hit instead of fighting */
  flee?: boolean;
  /** chance that a landed hit stuns the hero */
  stun?: number;
  /** meat (food) dropped, random amount */
  meat?: [number, number];
}

export const MONSTERS = <Record<MonsterKind, MonsterDef>><unknown>{
  slime: {
    kind: 'slime', name: 'สไลม์เขียว', level: 1, hp: 40, atk: 7, def: 1, exp: 9, gold: [2, 6], speed: 34, aggro: 70,
    attackRange: 18, attackCooldown: 1400, bodyRadius: 7,
    drops: [{ id: 'slime_gel', chance: 0.6 }, { id: 'hp_potion', chance: 0.08 }, { id: 'mana_shard', chance: 0.03 }],
  },
  shroom: {
    kind: 'shroom', name: 'เห็ดพิษ', level: 3, hp: 75, atk: 12, def: 3, exp: 17, gold: [4, 10], speed: 38, aggro: 80,
    attackRange: 18, attackCooldown: 1300, bodyRadius: 7,
    drops: [{ id: 'spore_cap', chance: 0.55 }, { id: 'mp_potion', chance: 0.08 }, { id: 'mana_shard', chance: 0.05 }],
  },
  wolf: {
    kind: 'wolf', name: 'หมาป่าเงา', level: 6, hp: 150, atk: 22, def: 6, exp: 34, gold: [8, 18], speed: 70, aggro: 110,
    attackRange: 22, attackCooldown: 1100, bodyRadius: 9,
    drops: [{ id: 'wolf_pelt', chance: 0.5 }, { id: 'hp_potion', chance: 0.1 }, { id: 'mana_shard', chance: 0.07 }, { id: 'leather_armor', chance: 0.02 }],
  },
  goblin: {
    kind: 'goblin', name: 'ก็อบลินพราน', level: 8, hp: 190, atk: 26, def: 8, exp: 46, gold: [12, 26], speed: 46, aggro: 140,
    attackRange: 110, attackCooldown: 1800, ranged: true, bodyRadius: 7,
    drops: [{ id: 'goblin_fang', chance: 0.5 }, { id: 'mana_shard', chance: 0.09 }, { id: 'copper_ring', chance: 0.03 }, { id: 'iron_sword', chance: 0.03 }],
  },
  wisp: {
    kind: 'wisp', name: 'วิญญาณพงไพร', level: 11, hp: 240, atk: 34, def: 10, exp: 70, gold: [18, 34], speed: 40, aggro: 130,
    attackRange: 100, attackCooldown: 2000, ranged: true, bodyRadius: 7,
    drops: [{ id: 'wisp_essence', chance: 0.5 }, { id: 'mp_potion', chance: 0.15 }, { id: 'mana_shard', chance: 0.12 }, { id: 'sage_pendant', chance: 0.02 }],
  },
  treant: {
    kind: 'treant', name: 'ผู้พิทักษ์ธอร์นวูด', level: 15, hp: 4200, atk: 48, def: 16, exp: 900, gold: [400, 600], speed: 34, aggro: 170,
    attackRange: 40, attackCooldown: 1600, boss: true, bodyRadius: 20,
    drops: [{ id: 'heart_of_forest', chance: 1 }, { id: 'ancient_core', chance: 1, min: 2, max: 3 }, { id: 'flame_saber', chance: 0.5 }, { id: 'knight_plate', chance: 0.5 }, { id: 'mana_shard', chance: 1, min: 3, max: 6 }, { id: 'hp_potion_l', chance: 1, min: 2, max: 3 }],
  },
  deer: {
    kind: 'deer', name: 'กวางป่า', level: 2, hp: 95, atk: 9, def: 2, exp: 7, gold: [0, 0], speed: 64, aggro: 0,
    attackRange: 22, attackCooldown: 1400, bodyRadius: 8, drops: [],
    animal: true, flee: true, stun: 0.25, meat: [2, 6],
  },
  boar: {
    kind: 'boar', name: 'หมูป่าเขี้ยวตัน', level: 5, hp: 190, atk: 15, def: 5, exp: 13, gold: [0, 0], speed: 56, aggro: 0,
    attackRange: 22, attackCooldown: 1300, bodyRadius: 9, drops: [],
    animal: true, stun: 0.3, meat: [4, 11],
  },
};

// ---- later regions (art imported; regions are built step by step) ----
const R = (kind: MonsterKind, name: string, level: number, o: Partial<MonsterDef> = {}): MonsterDef => ({
  kind, name, level, hp: Math.round(60 * Math.pow(level, 1.35)), atk: Math.round(7 + level * 2.6), def: Math.round(level * 0.9),
  exp: Math.round(9 * Math.pow(level, 1.25)), gold: [level * 2, level * 4], speed: 44, aggro: 0, attackRange: 20, attackCooldown: 1300,
  bodyRadius: 8, drops: [{ id: 'mana_shard', chance: 0.1 }, { id: 'hp_potion', chance: 0.1 }], ...o,
});
Object.assign(MONSTERS, {
  rat: R('rat', 'หนูยักษ์ตาแดง', 4, { speed: 60, bodyRadius: 6 }),
  skeleton: R('skeleton', 'โครงกระดูกนักรบ', 22),
  skarcher: R('skarcher', 'โครงกระดูกพลธนู', 24, { ranged: true, attackRange: 110, attackCooldown: 1900 }),
  ghost: R('ghost', 'วิญญาณถือตะเกียง', 27, { ranged: true, attackRange: 100, attackCooldown: 2000 }),
  spider: R('spider', 'แมงมุมพิษ', 33, { speed: 58, bodyRadius: 10 }),
  imp: R('imp', 'อิมป์ไฟ', 52, { ranged: true, attackRange: 105, bodyRadius: 6 }),
  salamander: R('salamander', 'ซาลาแมนเดอร์ไฟ', 55, { bodyRadius: 11 }),
  golem: R('golem', 'โกเลมลาวา', 58, { speed: 30, bodyRadius: 14 }),
  icewolf: R('icewolf', 'หมาป่าน้ำแข็ง', 63, { speed: 72, bodyRadius: 11 }),
  yeti: R('yeti', 'เยติ', 67, { speed: 36, bodyRadius: 13 }),
  jailer: R('jailer', 'ผู้คุมคุกโซ่ตรวน', 85, { speed: 34, bodyRadius: 12 }),
  stag: R('stag', 'กวางยักษ์คำสาป', 30, { boss: true, hp: 26000, speed: 40, attackRange: 50, bodyRadius: 26, exp: 6000, gold: [1500, 2500] }),
  dragon: R('dragon', 'มังกรลาวา', 60, { boss: true, hp: 160000, speed: 34, attackRange: 70, bodyRadius: 40, exp: 40000, gold: [8000, 12000] }),
  frostgiant: R('frostgiant', 'ยักษ์น้ำแข็ง', 70, { boss: true, hp: 240000, speed: 30, attackRange: 60, bodyRadius: 30, exp: 60000, gold: [10000, 15000] }),
  skking: R('skking', 'ราชาโครงกระดูก', 90, { boss: true, hp: 520000, speed: 36, attackRange: 56, bodyRadius: 26, exp: 150000, gold: [20000, 30000] }),
});
