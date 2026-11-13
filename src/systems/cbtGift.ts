// CBT gift (director): every CBT player claims VIP 7 days now, once per account, plus a small pack and a testers' title.
// OBT gives nothing: everything from the CBT is wiped at OBT, except the limited items the director names later.
// No diamonds (they only come from real money) and no power items (no pay-to-win) — mounts are kept for events later.
// The server hands it out (server/worker.ts Player.cbt); the mark `cbtGot` lives in the account's one character.
import type { GameState } from '../core/state';
import { addItem } from './inventory';
import { grantVip } from './premium';
import { titlesOf, SPECIAL_TITLES } from '../data/achievements';

/** true while the CBT runs; set false (one server deploy) on OBT day, when the CBT data is wiped */
export const CBT_ACTIVE = true;
export const CBT_VIP_DAYS = 7;
/** the CBT testers' title */
export const CBT_TITLE = { id: 'cbt', title: SPECIAL_TITLES.cbt };
export const CBT_PACK = { gold: 5000, potL: 20, scroll: 10 };

export const cbtGot = (s: GameState) => !!(s as GameState & { cbtGot?: number }).cbtGot;
export const cbtReady = (s: GameState) => CBT_ACTIVE && !cbtGot(s);
/** give the gift once (the server calls this; offline the game cannot) */
export function grantCbt(s: GameState, now = Date.now()): 'over' | 'claimed' | true {
  if (!CBT_ACTIVE) return 'over';
  if (cbtGot(s)) return 'claimed';
  grantVip(s, CBT_VIP_DAYS, now);
  s.gold += CBT_PACK.gold;
  addItem(s, 'hp_potion_l', CBT_PACK.potL); addItem(s, 'scroll_return', CBT_PACK.scroll);
  const ts = titlesOf(s); if (!ts.includes(CBT_TITLE.id)) ts.push(CBT_TITLE.id);
  (s as GameState & { title?: string | null }).title = CBT_TITLE.id;
  (s as GameState & { cbtGot?: number }).cbtGot = now;
  return true;
}
