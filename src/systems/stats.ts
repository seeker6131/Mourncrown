// Character / Stats / Progression — pure functions over GameState.
import type { GameState, InvItem } from '../core/state';
import { itemDef, upgradeMult } from '../data/items';
import { rarMult } from './loot';

export interface Derived {
  maxHp: number; maxMp: number;
  atk: number; matk: number; def: number;
  crit: number; // 0..1
  evade: number; // 0..1
  attackInterval: number; // ms
  moveSpeed: number; // px/s
  leech: number; // 0..1 of damage dealt healed
  mf: number; // magic find %
  expBonus: number; // multiplier
  power: number; // combat power score
}

export const MAX_LEVEL = 60;

export function expToNext(level: number): number {
  return Math.round(25 * Math.pow(level, 1.65));
}

export function equippedItems(s: GameState) {
  const out = [] as InvItem[];
  for (const slot of ['weapon', 'armor', 'accessory'] as const) {
    const uid = s.equip[slot];
    if (uid == null) continue;
    const it = s.inventory.find(i => i.uid === uid);
    if (it) out.push(it);
  }
  return out;
}

/** Character power = small level growth + equipment (rarity, upgrades, affixes). */
export function derive(s: GameState): Derived {
  const L = s.level;
  const g = { atk: 0, matk: 0, def: 0, hp: 0, mp: 0, crit: 0, aspd: 0, move: 0, leech: 0, mf: 0, exp: 0 } as Record<string, number>;
  for (const it of equippedItems(s)) {
    const d = itemDef(it.id);
    const m = upgradeMult(it.upg) * rarMult(it);
    g.atk += (d.atk ?? 0) * m; g.matk += (d.matk ?? 0) * m; g.def += (d.def ?? 0) * m; g.hp += (d.hp ?? 0) * m;
    g.mp += d.mp ?? 0; g.crit += d.crit ?? 0; g.aspd += d.aspd ?? 0; g.mf += d.mf ?? 0;
    for (const a of it.aff ?? []) g[a.k] = (g[a.k] ?? 0) + a.v;
  }
  const atk = Math.round(8 + L * 1.5 + g.atk);
  const matk = Math.round(6 + L * 1.5 + g.matk);
  const def = Math.round(L * 0.6 + g.def);
  const maxHp = Math.round(140 + L * 16 + g.hp);
  const crit = Math.min(0.75, 0.05 + g.crit / 100);
  const attackInterval = Math.max(300, Math.round(700 / (1 + g.aspd / 100)));
  return {
    maxHp, maxMp: Math.round(60 + L * 5 + g.mp), atk, matk, def, crit,
    evade: 0.03,
    attackInterval,
    moveSpeed: Math.min(140, 92 * (1 + g.move / 100)),
    leech: Math.min(0.3, g.leech / 100),
    mf: g.mf,
    expBonus: 1 + g.exp / 100,
    power: Math.round(atk * 2 + matk * 1.5 + def * 3 + maxHp / 5 + crit * 400 + (1000 / attackInterval) * 40),
  };
}

/** Adds exp; returns number of levels gained. */
export function gainExp(s: GameState, amount: number): number {
  let gained = 0;
  s.exp += Math.round(amount);
  while (s.level < MAX_LEVEL && s.exp >= expToNext(s.level)) {
    s.exp -= expToNext(s.level);
    s.level++;
    gained++;
  }
  if (gained) {
    const d = derive(s);
    s.hp = d.maxHp; s.mp = d.maxMp;
  }
  return gained;
}

export interface DamageResult { dmg: number; crit: boolean; miss: boolean }

export function calcDamage(atk: number, def: number, mult: number, critChance: number, rnd: () => number = Math.random, evade = 0): DamageResult {
  if (rnd() < evade) return { dmg: 0, crit: false, miss: true };
  const crit = rnd() < critChance;
  const base = atk * mult * (0.9 + rnd() * 0.2);
  // diminishing defence formula
  let dmg = base * (100 / (100 + def * 3));
  if (crit) dmg *= 1.8;
  return { dmg: Math.max(1, Math.round(dmg)), crit, miss: false };
}
