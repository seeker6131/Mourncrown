// Loot / rarity / random affixes — power comes from gear, not stat points.
import { ITEMS, itemDef, RARITY_MULT, type ItemDef } from '../data/items';
import type { InvItem } from '../core/state';

export type AffixKey = 'atk' | 'matk' | 'def' | 'hp' | 'crit' | 'aspd' | 'move' | 'leech' | 'mf' | 'exp';
export interface Affix { k: AffixKey; v: number }

export const AFFIX_NAMES: Record<AffixKey, string> = {
  atk: 'ATK', matk: 'MATK', def: 'DEF', hp: 'HP', crit: 'คริติคอล %', aspd: 'ความเร็วโจมตี %',
  move: 'ความเร็วเดิน %', leech: 'ดูดเลือด %', mf: 'โอกาสดรอปของแรร์ %', exp: 'EXP %',
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
  const w = [100, 30 * boost, 10 * boost, 3 * boost, 0.6 * boost, 0.08 * boost];
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
  const n = rarity; // common 0, uncommon 1 ... legendary 4
  const tier = baseTier(d);
  const out: Affix[] = [];
  const left = [...pool];
  for (let i = 0; i < n && left.length; i++) {
    const k = left.splice(Math.floor(rnd() * left.length), 1)[0];
    const base = AFFIX_BASE[k] * (AFFIX_PCT[k] ? 1 + tier * 0.35 : tier);
    const v = Math.max(1, Math.round(base * (0.7 + rnd() * 0.6) * (1 + rarity * 0.15)));
    out.push({ k, v });
  }
  return out;
}

/** Pick an equipment base appropriate for a monster level. */
export function pickBase(rnd: () => number, monLevel: number, cls?: string): ItemDef {
  const maxTier = Math.min(4, 1 + Math.floor(monLevel / 4));
  const pool = GEAR_BASES.filter(d => baseTier(d) <= maxTier && baseTier(d) >= maxTier - 1);
  let d = pool[Math.floor(rnd() * pool.length)] ?? GEAR_BASES[0];
  // weapons for another class line are re-rolled most of the time (each class mostly finds its own weapons)
  if (cls && cls !== 'novice' && d.cls && d.cls !== cls && rnd() < 0.7) {
    const own = pool.filter(q => q.type === 'weapon' && q.cls === cls);
    if (own.length) d = own[Math.floor(rnd() * own.length)];
  }
  return d;
}

export function makeGear(rnd: () => number, id: string, rarity: number): Pick<InvItem, 'id' | 'rar' | 'aff'> {
  const d = itemDef(id);
  return { id, rar: rarity, aff: rollAffixes(rnd, d, rarity) };
}

export function rarOf(it: InvItem): number { return it.rar ?? (isGear(itemDef(it.id)) ? 0 : itemDef(it.id).rarity); }

export function rarMult(it: InvItem): number { return isGear(itemDef(it.id)) ? RARITY_MULT[it.rar ?? 0] : 1; }

export function affixText(a: Affix) { return `${AFFIX_NAMES[a.k]} +${a.v}`; }
