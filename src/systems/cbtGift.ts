// Thank-you gift for the CBT testers (director): VIP 7 days for everyone who played, an exclusive title that can never be
// earned again, and a starter pack that grows with the level reached in the CBT. No diamonds (they only come from real
// money) and no power items (no pay-to-win) — mounts are kept for events later.
// How it works: the CBT characters are wiped at OBT. Just before the wipe, the highest level of every account is copied
// into the D1 table `cbt` (docs/ONLINE_RISKS.md "OBT day"). After the wipe the gift opens: each account claims it once on
// its fresh character (the claim is marked in D1, so it cannot be taken twice). During the CBT the window only shows
// which tier the player is on the way to.
import type { GameState } from '../core/state';
import { addItem } from './inventory';
import { grantVip } from './premium';
import { titlesOf, SPECIAL_TITLES } from '../data/achievements';

/** false during the CBT; set true (one server deploy) on OBT day, after the levels were copied and the saves wiped */
export const CBT_GIFT_OPEN = false;
export const CBT_VIP_DAYS = 7;
/** an exclusive title: only CBT testers ever get it */
export const CBT_TITLE = { id: 'cbt', title: SPECIAL_TITLES.cbt };
export interface CbtTier { lv: number; name: string; gold: number; potL: number; scroll: number }
/** reach Lv10 in the CBT to get the gift; higher levels get a bigger starter pack */
export const CBT_TIERS: CbtTier[] = [
  { lv: 10, name: 'ทองแดง', gold: 5000, potL: 20, scroll: 10 },
  { lv: 30, name: 'เงิน', gold: 15000, potL: 40, scroll: 20 },
  { lv: 50, name: 'ทอง', gold: 30000, potL: 60, scroll: 30 },
];
export const cbtTier = (lv: number): CbtTier | null => [...CBT_TIERS].reverse().find(t => lv >= t.lv) ?? null;

/** give the gift for the CBT level `lv` (the server has already checked and marked the claim) */
export function grantCbt(s: GameState, lv: number, now = Date.now()): CbtTier | null {
  const t = cbtTier(lv); if (!t) return null;
  grantVip(s, CBT_VIP_DAYS, now);
  s.gold += t.gold;
  addItem(s, 'hp_potion_l', t.potL); addItem(s, 'scroll_return', t.scroll);
  const ts = titlesOf(s); if (!ts.includes(CBT_TITLE.id)) ts.push(CBT_TITLE.id);
  (s as GameState & { title?: string | null }).title = CBT_TITLE.id;
  (s as GameState & { cbtGot?: number }).cbtGot = now;
  return t;
}
export const cbtGot = (s: GameState) => !!(s as GameState & { cbtGot?: number }).cbtGot;
