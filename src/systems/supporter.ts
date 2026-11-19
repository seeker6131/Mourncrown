// 👑 Supporter tiers "ผู้ร่วมสร้างตำนาน" (docs/SUPPORTER.md; director 18-19 Nov, for the OBT launch).
// Counted from REAL payments only (a slip the server verified), per account, inside the season the admin sets (back office →
// D1 kv `sup_season`). Reaching a tier unlocks it and every tier below; tiers never go down. Rewards are looks + a diamond
// bonus on diamond packs — no power (diamonds only buy looks / comfort). Nothing here is random, so nothing is hidden.
import type { GameState } from '../core/state';

export interface SupTier { n: number; thb: number; bonus: number; title?: string; rewards: string[] }
/** draft numbers (director sets the final ones) */
export const SUP_TIERS: SupTier[] = [
  { n: 1, thb: 99, bonus: 5, title: 'sup1', rewards: ['ฉายา「ผู้ร่วมสร้างตำนาน」', 'ป้ายชื่อผู้สนับสนุนบนหัว', 'ชื่อบนกำแพงผู้สนับสนุน'] },
  { n: 2, thb: 299, bonus: 10, rewards: ['👑 มงกุฎเล็กหน้าชื่อ'] },
  { n: 3, thb: 699, bonus: 15, rewards: ['ป้ายชื่อขั้นเงิน', 'ออร่าผู้สนับสนุน'] },
  { n: 4, thb: 1500, bonus: 20, rewards: ['ชื่อสลักบนอนุสาวรีย์ในหมู่บ้าน'] },
  { n: 5, thb: 3000, bonus: 25, rewards: ['ป้ายชื่อขั้นทอง มีแสงเรือง', 'ชื่อสีทอง'] },
  { n: 6, thb: 5000, bonus: 30, rewards: ['เลือกสีฉายาได้'] },
  { n: 7, thb: 10000, bonus: 35, title: 'sup7', rewards: ['ฉายา「ผู้ค้ำจุนแห่ง Mourncrown」', 'ป้ายชื่อขั้นสูงสุด (ปีก + มงกุฎ)', 'ตั้งชื่อ NPC 1 ตัว (แอดมินอนุมัติ)'] },
];
export const SUP_TITLES: Record<string, string> = { sup1: 'ผู้ร่วมสร้างตำนาน', sup7: 'ผู้ค้ำจุนแห่ง Mourncrown' };
/** the window in the menu: closed until OBT (the admin sees it now, to check) — the counting itself follows the server's season */
export const SUP_OPEN = false;

/** the season the payments count in (ms; from the back office). No season = nothing counts. */
export interface SupSeason { from: number; to: number }
export const supSeasonOn = (z: SupSeason | null | undefined, now: number) => !!z && z.from > 0 && now >= z.from && now < z.to;

type SS = GameState & { supPaid?: number; supTier?: number; titles?: string[]; supHide?: boolean; supWall?: boolean };
/** the tier a total reaches (0 = none) */
export const supTierOf = (paid: number) => SUP_TIERS.filter(t => paid >= t.thb).reduce((a, t) => Math.max(a, t.n), 0);
export const supTier = (s: GameState) => (s as SS).supTier ?? 0;
export const supPaid = (s: GameState) => (s as SS).supPaid ?? 0;
/** the diamond bonus (%) of a tier */
export const supBonus = (tier: number) => SUP_TIERS.find(t => t.n === tier)?.bonus ?? 0;
/** the next tier and how much more it needs (null at the top) */
export function supNext(s: GameState) { const t = SUP_TIERS.find(q => q.thb > supPaid(s)); return t ? { tier: t, more: t.thb - supPaid(s) } : null; }

/** (server, a verified payment inside the season) count it: the bonus diamonds of a diamond pack come from the tier held
 *  BEFORE this payment; newly reached tiers hand out their titles. Returns what to tell the player. */
export function supCount(s: GameState, thb: number, packDia: number) {
  const p = s as SS, before = supTier(s), bonus = packDia > 0 ? Math.floor(packDia * supBonus(before) / 100) : 0;
  p.supPaid = (p.supPaid ?? 0) + Math.max(0, thb);
  const after = Math.max(before, supTierOf(p.supPaid));   // (never goes down)
  p.supTier = after;
  const got: number[] = [];
  for (const t of SUP_TIERS) if (t.n > before && t.n <= after) { got.push(t.n); if (t.title) p.titles = [...new Set([...(p.titles ?? []), t.title])]; }
  return { bonus, before, after, got };
}
/** (back office) lower the total after a refund — the tier follows it down only by hand (the admin sets both) */
export function supSet(s: GameState, paid: number) { const p = s as SS; p.supPaid = Math.max(0, Math.floor(paid)); p.supTier = supTierOf(p.supPaid); }

/** the name plate a tier shows over the head (0 = none) — 3 looks: copper (1-2), silver (3-4), gold (5-6), the top one (7) */
export const plateOf = (tier: number) => tier >= 7 ? 4 : tier >= 5 ? 3 : tier >= 3 ? 2 : tier >= 1 ? 1 : 0;
