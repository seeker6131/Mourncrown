export type MonsterKind = 'slime' | 'shroom' | 'wolf' | 'goblin' | 'wisp' | 'treant';

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
}

export const MONSTERS: Record<MonsterKind, MonsterDef> = {
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
};
