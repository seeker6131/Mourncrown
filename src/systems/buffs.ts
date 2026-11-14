// Active buffs, for the 🧪 chips on the game screen (director / players: "which buff is on, how long is left, will a new
// one replace it?"). Two long slots: food / tonic (`buff`: one at a time — a meal replaces a tonic and back) and the
// alchemy elixir (`elixir`), plus the short skill buff and hunger. A new buff in a slot REPLACES the old one (no stacking,
// no added time) — the game asks first (buffClash).
import type { GameState } from '../core/state';

const STAT: Record<string, string> = { atk: 'ATK', def: 'DEF', hp: 'HP', exp: 'EXP', crit: 'CRI', aspd: 'SPD', matk: 'MATK' };
export interface BuffChip { key: string; text: string; left: number }
type BS = GameState & {
  buff?: { stat: string; pct: number; until: number; meal?: boolean } | null;
  elixir?: { until: number; name?: string; [k: string]: unknown } | null;
  skillBuff?: { until: number; atk?: number; def?: number; aspd?: number } | null;
  heroHungry?: boolean;
};
/** 29:59 / 0:09 */
export const clock = (ms: number) => { const t = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
const fx = (o: Record<string, unknown>) => Object.entries(o).filter(([k, v]) => STAT[k] && typeof v === 'number' && v).map(([k, v]) => `${STAT[k]}+${v}%`).join(' ');

export function activeBuffs(s: GameState, now = Date.now()): BuffChip[] {
  const b = s as BS, out: BuffChip[] = [];
  if (b.buff && b.buff.until > now) out.push({ key: 'buff', left: b.buff.until - now, text: `${b.buff.meal ? '🍖' : '🧪'} ${STAT[b.buff.stat] ?? b.buff.stat}+${b.buff.pct}%` });
  if (b.elixir && b.elixir.until > now) { const { until: _u, name, ...rest } = b.elixir; out.push({ key: 'elixir', left: b.elixir.until - now, text: `⚗ ${fx(rest) || name || ''}` }); }
  if (b.skillBuff && b.skillBuff.until > now) { const { until: _u, ...rest } = b.skillBuff; out.push({ key: 'skill', left: b.skillBuff.until - now, text: `✨ ${fx(rest) || 'สกิล'}` }); }
  if (b.heroHungry) out.push({ key: 'hungry', left: -1, text: '😫 หิว ATK−20% EXP−30%' });
  return out;
}
// ⏳ the SAME buff taken again adds its time (players asked; director: everyone up to 1 hour, VIP up to 3 hours) — a different
// buff in the slot still replaces it (one slot: no stacking of effects, director: "แยกช่อง กินพร้อม ขอไม่ทำ")
export const BUFF_CAP_MIN = 60, BUFF_CAP_VIP_MIN = 180;
/** the longest a buff can be stacked to, in ms (VIP: 3 hours) */
export const buffCap = (s: GameState, now = Date.now()) => ((((s as GameState & { vipUntil?: number }).vipUntil ?? 0) > now) ? BUFF_CAP_VIP_MIN : BUFF_CAP_MIN) * 60000;
/** what is being taken: a food / tonic buff (stat, pct, meal) or an alchemy elixir (its name) */
export type Incoming = { slot: 'buff'; stat: string; pct: number; meal?: boolean } | { slot: 'elixir'; name: string };
/** the buff now in that slot is the same one (it would add time instead of replacing) */
export function sameBuff(s: GameState, inc: Incoming, now = Date.now()) {
  const b = s as BS;
  if (inc.slot === 'buff') return !!b.buff && b.buff.until > now && b.buff.stat === inc.stat && b.buff.pct === inc.pct && !!b.buff.meal === !!inc.meal;
  return !!b.elixir && b.elixir.until > now && b.elixir.name === inc.name;
}
/** the end time after taking a dose of `addMs`: the same buff adds on (up to the cap), anything else starts now */
export function stackUntil(curUntil: number | undefined, same: boolean, addMs: number, cap: number, now = Date.now()) {
  const base = same && curUntil && curUntil > now ? curUntil : now;
  return Math.min(base + addMs, now + Math.max(cap, addMs));
}
/** the same buff is already (nearly) at the cap: taking more would waste it */
export function buffFull(s: GameState, inc: Incoming, now = Date.now()) {
  if (!sameBuff(s, inc, now)) return false;
  const b = s as BS, until = inc.slot === 'buff' ? b.buff!.until : b.elixir!.until;
  return until - now >= buffCap(s, now) - 60000;
}
/** the buff a new one would REPLACE (a different one in the same slot), as text — null when the slot is free, nearly over
 *  (under a minute) or holds the same buff (that one just adds time) */
export function buffClash(s: GameState, inc: Incoming, now = Date.now()): string | null {
  if (sameBuff(s, inc, now)) return null;
  const c = activeBuffs(s, now).find(q => q.key === inc.slot);
  return c && c.left >= 60000 ? `${c.text} (เหลือ ${clock(c.left)})` : null;
}
