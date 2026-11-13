// Skill rules for the top-down game — pure (no Phaser). The scene only draws the effects.
// Online later: the server runs these (MP, cooldown, heal/shield amounts, damage) and the client just shows them.
import type { GameState } from '../core/state';
import { SKILL_BY_ID, type SkillDef } from '../data/skills';
import { derive, skillMult, calcDamage, currentSkills } from './stats';

export type CastFail = 'cooldown' | 'mp' | 'locked';
/** (device) skills cast since the last kill sent to the server — the server counts casts from the kill (quest "use skills
 *  10 times": casting runs on the device only, so the server never saw them and the quest chain stuck there) */
export const castQ = { n: 0 };
/** Check and pay for a skill. `readyAt` = per-skill cooldown end times (ms, scene clock). */
export function beginCast(s: GameState, id: string, now: number, readyAt: Record<string, number>): SkillDef | CastFail {
  if (!currentSkills(s).includes(id)) return 'locked';
  const sk = SKILL_BY_ID[id];
  if ((readyAt[id] ?? 0) > now) return 'cooldown';
  if ((s.mp ?? 0) < sk.mp) return 'mp';
  s.mp -= sk.mp;
  readyAt[id] = now + sk.cooldown;
  (s as GameState & { tdCasts?: number }).tdCasts = ((s as GameState & { tdCasts?: number }).tdCasts ?? 0) + 1;
  return sk;
}
/** Self effects: buff (stored on the save like the old game), heal amount, shield amount. */
export function selfEffect(s: GameState, sk: SkillDef, nowMs = Date.now()): { heal?: number; shield?: number } {
  const d = derive(s), m = skillMult(s, sk.id);
  if (sk.kind === 'buff') { (s as GameState & { skillBuff?: unknown }).skillBuff = { ...sk.buff, until: nowMs + (sk.buff?.dur ?? 10000) }; return {}; }
  if (sk.kind === 'heal') {
    const amt = Math.round((d.maxHp * sk.power + (sk.stat === 'matk' ? d.matk * 0.8 : 0)) * m);
    const real = Math.max(0, Math.min(amt, d.maxHp - s.hp)); s.hp += real; return { heal: real };
  }
  if (sk.kind === 'shield') return { shield: Math.round(d.maxHp * sk.power * m) };
  return {};
}
/** Damage of one skill hit on a monster with `def`. */
export function skillHit(s: GameState, sk: SkillDef, def: number, rnd: () => number = Math.random) {
  const d = derive(s);
  return calcDamage(sk.stat === 'matk' ? d.matk : d.atk, def, sk.power * skillMult(s, sk.id), d.crit, rnd);
}
