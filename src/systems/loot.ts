// Loot / rarity / random affixes — power comes from gear, not stat points.
import { ITEMS, itemDef, type ItemDef } from '../data/items';
import type { InvItem } from '../core/state';

export type AffixKey = 'atk' | 'matk' | 'def' | 'hp' | 'crit' | 'aspd' | 'move' | 'leech' | 'mf' | 'exp';
export interface Affix { k: AffixKey; v: number }

export const AFFIX_NAMES: Record<AffixKey, string> = {
  atk: 'ATK', matk: 'MATK', def: 'DEF', hp: 'HP', crit: 'คริติคอล %', aspd: 'ความเร็วโจมตี %',
  move: 'ความเร็วเดิน %', leech: 'ดูดเลือด %', mf: '🍀 โชค', exp: 'EXP %',
};
const AFFIX_PCT: Record<AffixKey, boolean> = { atk: false, matk: false, def: false, hp: false, crit: true, aspd: true, move: true, leech: true, mf: true, exp: true };

/** Base value per tier (flat stats scale with tier, % stats mildly). */
const AFFIX_BASE: Record<AffixKey, number> = { atk: 4, matk: 4, def: 3, hp: 25, crit: 2, aspd: 3, move: 2, leech: 1, mf: 6, exp: 4 };

export function baseTier(d: ItemDef): number {
  return d.tier ?? (d.price < 100 ? 1 : d.price < 400 ? 2 : d.price < 1500 ? 3 : 4);
}

export function isGear(d: ItemDef) { return d.type === 'weapon' || d.type === 'armor' || d.type === 'accessory'; }

export const GEAR_BASES = Object.values(ITEMS).filter(isGear);

/** Roll a rarity 0..5 (SL); `mf` = magic find %, `min` = floor. */
export function rollRarity(rnd: () => number, mf = 0, min = 0): number {
  const boost = 1 + mf / 100;
  // director: rare gear must be hard, but never hopeless. Per gear drop on the last maps (floor Rare): Super Rare ~7%,
  // Legend ~1 in 150, SL ~1 in 12,000 (~5-6 days of 24 h auto). A pity counter (rewards.ts) guarantees SL at 15,000.
  const w = [100, 12 * boost, 1.5 * boost ** 1.3, 0.08 * boost ** 1.6, 0.0055 * boost ** 1.9, 0.00005 * boost ** 2.2];
  for (let i = 0; i < min; i++) w[i] = 0;
  const tot = w.reduce((a, b) => a + b, 0);
  let r = rnd() * tot;
  for (let i = 0; i < w.length; i++) { if (w[i] > 0 && r < w[i]) return i; r -= w[i]; }
  return w.length - 1;
}

export function rollAffixes(rnd: () => number, d: ItemDef, rarity: number): Affix[] {
  const pool: AffixKey[] = d.type === 'weapon' ? ['atk', 'matk', 'crit', 'aspd', 'leech', 'mf', 'exp']
    : d.type === 'armor' ? ['def', 'hp', 'move', 'aspd', 'mf', 'exp', 'crit']
      : ['atk', 'matk', 'hp', 'crit', 'leech', 'mf', 'exp', 'move'];
  const n = rarity >= 5 ? 6 : rarity; // common 0 ... legend 4, SL 6
  const tier = baseTier(d);
  const out: Affix[] = [];
  const left = [...pool];
  for (let i = 0; i < n && left.length; i++) {
    const k = left.splice(Math.floor(rnd() * left.length), 1)[0];
    const base = AFFIX_BASE[k] * (AFFIX_PCT[k] ? 1 + tier * 0.35 : tier);
    const roll = rarity >= 5 ? 1.1 + rnd() * 0.2 : 0.7 + rnd() * 0.6;      // SL always rolls high
    const v = Math.max(1, Math.round(base * roll * (rarity >= 5 ? 2.2 : 1 + rarity * 0.15)));
    out.push({ k, v });
  }
  return out;
}

/** Pick the item of a given rarity (each item has one fixed rarity). Weapons favour the hero's own class line. */
export function pickBase(rnd: () => number, rarity: number, cls?: string, slot?: string): ItemDef {
  const pool = GEAR_BASES.filter(d => d.rarity === rarity && (!slot || d.type === slot));
  let d = pool[Math.floor(rnd() * pool.length)] ?? GEAR_BASES[0];
  if (cls && cls !== 'novice' && d.cls && d.cls !== cls && rnd() < 0.7) {
    const own = pool.filter(q => q.type === 'weapon' && q.cls === cls);
    if (own.length) d = own[Math.floor(rnd() * own.length)];
  }
  return d;
}

export function makeGear(rnd: () => number, id: string, _rarity?: number): Pick<InvItem, 'id' | 'rar' | 'aff'> {
  const d = itemDef(id), rarity = d.rarity;   // the item's own rarity, always
  return { id, rar: rarity, aff: rollAffixes(rnd, d, rarity) };
}

export function rarOf(it: InvItem): number { return itemDef(it.id).rarity; }

/** stats are already set per rarity in the item table */
export function rarMult(_it: InvItem): number { return 1; }

export function affixText(a: Affix) { return `${AFFIX_NAMES[a.k]} +${a.v}`; }
