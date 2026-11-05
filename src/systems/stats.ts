// Character / Stats / Progression — pure functions over GameState.
import type { GameState, StatKey } from '../core/state';
import { STAT_KEYS } from '../core/state';
import { itemDef, upgradeMult } from '../data/items';

export interface Derived {
  str: number; agi: number; vit: number; int: number; luk: number;
  maxHp: number; maxMp: number;
  atk: number; matk: number; def: number;
  crit: number; // 0..1
  evade: number; // 0..1
  attackInterval: number; // ms
  moveSpeed: number; // px/s
  dropBonus: number; // multiplier
}

export const POINTS_PER_LEVEL = 4;
export const MAX_LEVEL = 50;

export function expToNext(level: number): number {
  return Math.round(25 * Math.pow(level, 1.65));
}

export function equippedItems(s: GameState) {
  const out = [] as { def: ReturnType<typeof itemDef>; upg: number }[];
  for (const slot of ['weapon', 'armor', 'accessory'] as const) {
    const uid = s.equip[slot];
    if (uid == null) continue;
    const it = s.inventory.find(i => i.uid === uid);
    if (it) out.push({ def: itemDef(it.id), upg: it.upg });
  }
  return out;
}

export function derive(s: GameState): Derived {
  const st: Record<StatKey, number> = { ...s.base };
  let atk = 0, matk = 0, def = 0, hp = 0, mp = 0, crit = 0;
  for (const { def: d, upg } of equippedItems(s)) {
    const m = upgradeMult(upg);
    atk += (d.atk ?? 0) * m;
    matk += (d.matk ?? 0) * m;
    def += (d.def ?? 0) * m;
    hp += (d.hp ?? 0) * m;
    mp += d.mp ?? 0;
    crit += d.crit ?? 0;
    for (const k of STAT_KEYS) st[k] += d[k] ?? 0;
  }
  const L = s.level;
  return {
    ...st,
    maxHp: Math.round(90 + st.vit * 14 + L * 12 + hp),
    maxMp: Math.round(30 + st.int * 7 + L * 4 + mp),
    atk: Math.round(6 + st.str * 2.2 + L * 1.2 + atk),
    matk: Math.round(4 + st.int * 2.6 + L * 1.2 + matk),
    def: Math.round(st.vit * 1.2 + L * 0.5 + def),
    crit: Math.min(0.75, 0.05 + st.luk * 0.006 + st.agi * 0.002 + crit / 100),
    evade: Math.min(0.4, st.agi * 0.004 + st.luk * 0.001),
    attackInterval: Math.max(320, 760 - st.agi * 9),
    moveSpeed: Math.min(130, 78 + st.agi * 0.8),
    dropBonus: 1 + st.luk * 0.012,
  };
}

/** Adds exp; returns number of levels gained. */
export function gainExp(s: GameState, amount: number): number {
  let gained = 0;
  s.exp += Math.round(amount);
  while (s.level < MAX_LEVEL && s.exp >= expToNext(s.level)) {
    s.exp -= expToNext(s.level);
    s.level++;
    s.statPoints += POINTS_PER_LEVEL;
    gained++;
  }
  if (gained) {
    const d = derive(s);
    s.hp = d.maxHp; s.mp = d.maxMp;
  }
  return gained;
}

export function allocate(s: GameState, k: StatKey, n = 1): boolean {
  if (s.statPoints < n) return false;
  s.statPoints -= n;
  s.base[k] += n;
  return true;
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
