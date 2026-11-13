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
/** the buff a new one would replace (slot 'buff' = food / tonic, 'elixir' = alchemy), as text — null when the slot is free
 *  or nearly over (under a minute: nothing worth asking about) */
export function buffClash(s: GameState, slot: 'buff' | 'elixir', now = Date.now()): string | null {
  const c = activeBuffs(s, now).find(q => q.key === slot);
  return c && c.left >= 60000 ? `${c.text} (เหลือ ${clock(c.left)})` : null;
}
