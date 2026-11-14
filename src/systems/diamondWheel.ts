// 💎 The diamond wheel (director): spun with diamonds (real money only). No pay-to-win: no gear, no elixirs, no mana shards.
// CBT edition: the 🔒 prizes carry over to OBT (dragon, the storm-cloud pet, the black horse skin, the storm title + gold name);
// the rest are CBT-only. Every spin also gives a ⭐ star coin; 150 stars trade for the dragon or the cloud (they carry over too).
// The server rolls. The odds CAN be shown (real money — app stores require it; DIAMOND_ODDS_SHOWN).
import type { GameState } from '../core/state';
import { invSize } from '../core/state';
import { addItem } from './inventory';
import { grantMount, hasMount } from './mounts';
import { titlesOf } from '../data/achievements';

/** open to players? (closed until real-money top-up works and the director approves; the admin can try it) */
export const DWHEEL_OPEN = true;   // (opened 2026-11-14, director — with real-money top-up)
/** show each prize's chance on the wheel (recommended for real money) */
export const DIAMOND_ODDS_SHOWN = false;   // (director 2026-11-14: no rates on any wheel)
export const DWHEEL_PRICE = 30, DWHEEL_PRICE10 = 270, STAR_TRADE = 150;
export const DWHEEL_SEGS = [
  { key: 'dragon', label: '🐉 มังกรเพลิงนิรันดร์', item: '', color: 0xd03a1a, w: 3, keep: true },
  { key: 'potion', label: 'ยาใหญ่ x10', item: 'hp_potion_l', color: 0x6a2a3a, w: 304 },
  { key: 'cloud', label: '⛈ เมฆพายุ (เร็ว +5% • นำทางบอส)', item: '', color: 0x4a3a7a, w: 10, keep: true },
  { key: 'fx', label: '⚔ เอฟเฟกต์ดาบ', item: '', color: 0x8a3aaa, w: 100 },
  { key: 'horse', label: '🐎 ม้าดำนิล (เร็ว +35%)', item: '', color: 0x2a2a3a, w: 40, keep: true },
  { key: 'bag', label: '🎒 กระเป๋า +5 ช่อง', item: '', color: 0x6a4a1a, w: 100 },
  { key: 'title', label: '🏷 ฉายา "ผู้บุกเบิกพายุ" + ชื่อสีทอง', item: '', color: 0xb08a20, w: 60, keep: true },
  { key: 'aura', label: '✨ ออร่าพายุ 30 วัน', item: '', color: 0x3a6aaa, w: 80 },
  { key: 'scroll', label: 'ม้วนกลับบ้าน x10', item: 'scroll_return', color: 0x4a3a6a, w: 303 },
] as const;
export type DKey = typeof DWHEEL_SEGS[number]['key'];
export const STORM_TITLE = 'storm';
type DS = GameState & { diamonds?: number; stars?: number; pets?: string[]; skins?: string[]; nameColors?: string[]; nameColor?: string; auraLtd?: number; bagPlus?: number; fxOwned?: string[]; fx?: string; title?: string | null };
export interface DPrize { seg: number; key: DKey; text: string; stars?: number }
const FXS = ['fx_gold', 'fx_void', 'fx_frost', 'fx_blood'];

function roll(rnd: () => number) { let r = rnd() * DWHEEL_SEGS.reduce((t, q) => t + q.w, 0); for (let i = 0; i < DWHEEL_SEGS.length; i++) { r -= DWHEEL_SEGS[i].w; if (r < 0) return i; } return DWHEEL_SEGS.length - 1; }
/** a prize already owned turns into star coins (never a wasted spin) */
const dup = (p: DS, seg: number, key: DKey, n: number, what: string): DPrize => { p.stars = (p.stars ?? 0) + n; return { seg, key, text: `${what} (มีแล้ว → ⭐ ${n})`, stars: n }; };
function give(s: GameState, seg: number, rnd: () => number, now: number): DPrize {
  const p = s as DS, key = DWHEEL_SEGS[seg].key;
  switch (key) {
    case 'dragon': return hasMount(s, 'dragon') ? dup(p, seg, key, 60, 'มังกร') : (grantMount(s, 'dragon'), { seg, key, text: '🐉 มังกรเพลิงนิรันดร์!' });
    case 'cloud': if ((p.pets ??= []).includes('cloud')) return dup(p, seg, key, 30, 'เมฆพายุ'); p.pets.push('cloud'); return { seg, key, text: '⛈ เมฆพายุ!' };
    case 'horse': if ((p.skins ??= []).includes('horse_black')) return dup(p, seg, key, 10, 'สกินม้าดำนิล'); p.skins.push('horse_black'); return { seg, key, text: '🐎 สกินม้าดำนิล' };
    case 'title': { const t = titlesOf(s); if (t.includes(STORM_TITLE) && (p.nameColors ?? []).includes('gold')) return dup(p, seg, key, 5, 'ฉายาพายุ'); if (!t.includes(STORM_TITLE)) t.push(STORM_TITLE); (p.nameColors ??= []).includes('gold') || p.nameColors.push('gold'); return { seg, key, text: '🏷 ฉายา "ผู้บุกเบิกพายุ" + ชื่อสีทอง' }; }
    case 'aura': p.auraLtd = Math.max(p.auraLtd ?? 0, now) + 30 * 86400000; return { seg, key, text: '✨ ออร่าพายุ 30 วัน' };
    case 'fx': { const left = FXS.filter(f => !(p.fxOwned ?? []).includes(f)); if (!left.length) return dup(p, seg, key, 3, 'เอฟเฟกต์ดาบ'); const f = left[Math.floor(rnd() * left.length)]; p.fxOwned = [...(p.fxOwned ?? []), f]; p.fx = f; return { seg, key, text: `⚔ เอฟเฟกต์ดาบ ${({ fx_gold: 'เปลวทอง', fx_void: 'ม่วงทมิฬ', fx_frost: 'น้ำแข็ง', fx_blood: 'เลือดชาด' } as Record<string, string>)[f]}` }; }
    case 'bag': if ((p.bagPlus ?? 0) >= 50) return dup(p, seg, key, 2, 'กระเป๋าเต็มเพดาน'); p.bagPlus = (p.bagPlus ?? 0) + 5; return { seg, key, text: '🎒 กระเป๋า +5 ช่อง' };
    case 'potion': addItem(s, 'hp_potion_l', 10); return { seg, key, text: 'ยาฟื้นพลังใหญ่ x10' };
    case 'scroll': addItem(s, 'scroll_return', 10); return { seg, key, text: 'ม้วนกลับหมู่บ้าน x10' };
  }
}
/** spin 1 (30 💎) or 10 (270 💎); +1 ⭐ per spin */
export function spinDiamond(s: GameState, n: number, rnd: () => number, now = Date.now()): 'diamonds' | 'bag' | 'n' | { prizes: DPrize[]; cost: number; stars: number } {
  if (n !== 1 && n !== 10) return 'n';
  const p = s as DS, cost = n === 10 ? DWHEEL_PRICE10 : DWHEEL_PRICE;
  if ((p.diamonds ?? 0) < cost) return 'diamonds';
  if (s.inventory.length + 2 > invSize(s)) return 'bag';   // (potions / scrolls need a slot if not stacked yet)
  p.diamonds = (p.diamonds ?? 0) - cost; p.stars = (p.stars ?? 0) + n;
  return { prizes: Array.from({ length: n }, () => give(s, roll(rnd), rnd, now)), cost, stars: p.stars };
}
/** 150 ⭐ → the dragon or the storm cloud */
export function starTrade(s: GameState, what: 'dragon' | 'cloud'): 'stars' | 'owned' | true {
  const p = s as DS;
  if (what === 'dragon' ? hasMount(s, 'dragon') : (p.pets ?? []).includes('cloud')) return 'owned';   // (owned first: the clearer answer)
  if ((p.stars ?? 0) < STAR_TRADE) return 'stars';
  if (what === 'dragon') grantMount(s, 'dragon'); else (p.pets ??= []).push('cloud');
  p.stars = (p.stars ?? 0) - STAR_TRADE; return true;
}
/** each segment's chance in % (for showing the odds) */
export const dChance = (i: number) => DWHEEL_SEGS[i].w / DWHEEL_SEGS.reduce((t, q) => t + q.w, 0) * 100;
