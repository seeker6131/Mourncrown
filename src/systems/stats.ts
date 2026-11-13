import { TROPHY_BONUS } from '../data/guild';
import { setBonus } from '../data/sets';
// Character / Stats / Progression — pure functions over GameState.
import type { GameState, InvItem } from '../core/state';
import { itemDef, upgradeMult, OFF_CLASS_MULT } from '../data/items';
import { rarMult } from './loot';
import { CLASSES, FORM_LEVEL, classSkills, type ClassId } from '../data/classes';

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

export const MAX_LEVEL = 100;

export function expToNext(level: number): number {
  // early levels stay quick; from Lv20 the curve steepens so Lv100 is a long-term goal
  const base = 25 * Math.pow(level, 1.65);
  return Math.round(level > 20 ? base * Math.pow(level / 20, 1.25) : base);
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
    const off = d.cls && s.cls && s.cls !== 'novice' && d.cls !== s.cls ? OFF_CLASS_MULT : 1;   // wrong class line: wearable, weaker
    const m = upgradeMult(it.upg) * rarMult(it) * off;
    g.atk += (d.atk ?? 0) * m; g.matk += (d.matk ?? 0) * m; g.def += (d.def ?? 0) * m; g.hp += (d.hp ?? 0) * m;
    g.mp += d.mp ?? 0; g.crit += d.crit ?? 0; g.aspd += d.aspd ?? 0; g.mf += d.mf ?? 0;
    for (const a of it.aff ?? []) g[a.k] = (g[a.k] ?? 0) + a.v;
  }
  const bl = (t: string) => { const b = s.buildings?.find(q => q.type === t); return b ? (b.done && Date.now() < b.done ? b.level - 1 : b.level) : 0; };
  // trophies displayed in the player's house: small permanent bonuses by rarity (docs/GUILD_WAR.md 5)
  const tro = { atk: 0, def: 0, hp: 0 };
  for (const it of (s as GameState & { home?: { trophies?: { id: string; rar?: number }[] } }).home?.trophies ?? []) { const b = TROPHY_BONUS[Math.min(5, it.rar ?? itemDef(it.id).rarity)]; if (b) { tro.atk += b.atk; tro.def += b.def; tro.hp += b.hp; } }
  const tav = bl('tavern'), tow = bl('tower');
  g.exp += tav * 4;
  const buff = s.buff && s.buff.until > Date.now() ? s.buff : null;
  const starve = (s as { heroHungry?: boolean }).heroHungry ? 0.8 : 1;   // out of supplies on a monster map (supplies.ts)
  if (buff?.stat === 'exp') g.exp += buff.pct;
  const ex = (s as GameState & { elixir?: { atk?: number; def?: number; hp?: number; crit?: number; aspd?: number; exp?: number; until: number } }).elixir;
  const el = ex && ex.until > Date.now() ? ex : null;
  if (el) { g.exp += el.exp ?? 0; g.crit += el.crit ?? 0; g.aspd += el.aspd ?? 0; }
  const sf = setBonus(equippedItems(s).map(i => i.set));   // gear set bonuses
  g.exp += sf.exp ?? 0; g.crit += sf.crit ?? 0; g.aspd += sf.aspd ?? 0; g.mf += sf.mf ?? 0;
  if (((s as GameState & { vipUntil?: number }).vipUntil ?? 0) > Date.now()) g.exp += 50;   // VIP: EXP x1.5
  const cb = CLASSES[s.cls ?? 'novice'].bonus, tf = Math.max(0, activeTier(s));
  g.crit += (cb.crit ?? 0) * tf; g.aspd += (cb.aspd ?? 0) * tf;
  const sb = (s as GameState & { skillBuff?: { atk?: number; def?: number; aspd?: number; until: number } }).skillBuff;
  const sbOn = sb && sb.until > Date.now() ? sb : null;
  g.aspd += sbOn?.aspd ?? 0;
  const ab = starve * (buff && buff.stat === 'atk' ? 1 + buff.pct / 100 : 1) * (1 + (sbOn?.atk ?? 0) / 100) * (1 + (el?.atk ?? 0) / 100) * (1 + (sf.atk ?? 0) / 100) * (1 + tro.atk / 100), hb = buff?.stat === 'hp' ? 1 + buff.pct / 100 : 1;
  const atk = Math.round((8 + L * 2.5 + g.atk) * ab * (1 + (cb.atk ?? 0) * tf / 100));
  const matk = Math.round((6 + L * 2.5 + g.matk) * ab * (1 + (cb.matk ?? 0) * tf / 100));
  const def = Math.round((L * 1 + g.def) * hb * (1 + ((cb.def ?? 0) * tf + (sbOn?.def ?? 0) + tow * 3 + (buff?.stat === 'def' ? buff.pct : 0) + (el?.def ?? 0) + (sf.def ?? 0) + tro.def) / 100));
  const maxHp = Math.round((140 + L * 22 + g.hp) * hb * (1 + (el?.hp ?? 0) / 100) * (1 + (sf.hp ?? 0) / 100) * (1 + ((cb.hp ?? 0) * tf + tow * 2 + tro.hp) / 100));
  const crit = Math.min(0.75, 0.05 + g.crit / 100);
  const attackInterval = Math.max(300, Math.round(700 / (1 + g.aspd / 100)));
  return {
    maxHp, maxMp: Math.round(60 + L * 5 + g.mp), atk, matk, def, crit,
    evade: 0.03,
    attackInterval,
    moveSpeed: Math.min(140, 92 * (1 + g.move / 100)),
    leech: Math.min(0.3, g.leech / 100),
    mf: g.mf,
    expBonus: (1 + g.exp / 100) * (starve < 1 ? 0.7 : 1),
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
    s.skillPts = (s.skillPts ?? 0) + 1;
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

export const SKILL_MAX = 10;
/** Skill damage/heal multiplier from its level (1 + 15% per level above 1). */
export function skillMult(s: GameState, id: string) { return 1 + 0.15 * ((s.skillLv?.[id] ?? 1) - 1); }
export function upSkill(s: GameState, id: string): boolean {
  const lv = s.skillLv[id] ?? 1;
  if (s.skillPts < 1 || lv >= SKILL_MAX) return false;
  s.skillPts--; s.skillLv[id] = lv + 1;
  return true;
}

/** Next form the character can take (or null). */
export function nextForm(s: GameState): number | null {
  const t = s.tier ?? 0;
  if (t >= 3) return null;
  return s.level >= FORM_LEVEL[t + 1] ? t + 1 : null;
}

/** Change class (from villager) or advance to the next form. */
export function advanceClass(s: GameState, cls?: ClassId): boolean {
  const nt = nextForm(s);
  if (nt === null) return false;
  if ((s.tier ?? 0) === 0) { if (!cls || cls === 'novice') return false; s.cls = cls; }
  s.tier = nt; s.useTier = nt;
  // a new form brings new skills: every point spent on the old ones comes back (director: nobody loses points)
  const back = Object.values(s.skillLv ?? {}).reduce((a, lv) => a + Math.max(0, lv - 1), 0);
  s.skillLv = {}; s.skillPts = (s.skillPts ?? 0) + back; lastRefund = back;
  return true;
}
/** skill points given back by the last form change */
export let lastRefund = 0;
/** extra skill points besides levels (director: something to aim for): the first kill of each map's boss, the main
 *  quest chain every 4 quests, every 7th daily login */
export function bonusSkillPt(s: GameState, n = 1) { s.skillPts = (s.skillPts ?? 0) + n; }

/** Form currently worn (chosen in the changing room; can be any unlocked form). */
export function activeTier(s: GameState) { if (s.outfit === 'gather') return 0; return Math.max(0, Math.min(s.useTier ?? s.tier ?? 0, s.tier ?? 0)); }
export function currentSkills(s: GameState) { return classSkills(s.cls ?? 'novice', activeTier(s)); }
