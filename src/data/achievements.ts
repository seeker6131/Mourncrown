// Collection & titles: reach a goal -> claim gold + unlock a title shown above the hero.
import type { GameState } from '../core/state';
import { LANDS } from '../world/stages';

export interface PStats { kills: number; golden: number; ore: number; gems: number; animals: number; brews: number; dungeons: number; kinds: Record<string, number> }
export const pstats = (s: GameState): PStats => {
  const t = s as GameState & { stats2?: PStats };
  return (t.stats2 ??= { kills: 0, golden: 0, ore: 0, gems: 0, animals: 0, brews: 0, dungeons: 0, kinds: {} });
};
/** every monster kind of every land (codex) */
export const CODEX = [...new Map(LANDS.flatMap(l => [...l.mobs, l.boss]).map(m => [m.kind, m])).values()];
type Metric = (s: GameState) => number;
const M: Record<string, Metric> = {
  kills: s => pstats(s).kills, golden: s => pstats(s).golden, ore: s => pstats(s).ore, gems: s => pstats(s).gems,
  animals: s => pstats(s).animals, brews: s => pstats(s).brews, dungeons: s => pstats(s).dungeons,
  boss: s => s.bossDefeated ?? 0, level: s => s.level, codex: s => CODEX.filter(m => (pstats(s).kinds[m.kind] ?? 0) > 0).length,
};
export interface Ach { id: string; title: string; desc: string; metric: keyof typeof M; need: number; gold: number }
export const ACHS: Ach[] = [
  { id: 'k1', title: 'นักล่ามือใหม่', desc: 'ปราบมอนสเตอร์ 100 ตัว', metric: 'kills', need: 100, gold: 300 },
  { id: 'k2', title: 'นักล่า', desc: 'ปราบมอนสเตอร์ 2,000 ตัว', metric: 'kills', need: 2000, gold: 2000 },
  { id: 'k3', title: 'ผู้สังหารหมื่นศพ', desc: 'ปราบมอนสเตอร์ 20,000 ตัว', metric: 'kills', need: 20000, gold: 15000 },
  { id: 'g1', title: 'ตาทองคำ', desc: 'ปราบมอนทอง 1 ตัว', metric: 'golden', need: 1, gold: 300 },
  { id: 'g2', title: 'นักล่าทองคำ', desc: 'ปราบมอนทอง 50 ตัว', metric: 'golden', need: 50, gold: 5000 },
  { id: 'b1', title: 'ผู้ปราบบอส', desc: 'ปราบบอส 1 ตัว', metric: 'boss', need: 1, gold: 500 },
  { id: 'b2', title: 'ราชันบอส', desc: 'ปราบบอส 50 ตัว', metric: 'boss', need: 50, gold: 10000 },
  { id: 'o1', title: 'คนงานเหมือง', desc: 'ขุดแร่ได้ 200 ก้อน', metric: 'ore', need: 200, gold: 500 },
  { id: 'o2', title: 'เจ้าแห่งเหมือง', desc: 'ขุดแร่ได้ 3,000 ก้อน', metric: 'ore', need: 3000, gold: 5000 },
  { id: 'e1', title: 'ผู้พบแร่หายาก', desc: 'พบแร่หายาก 1 ก้อน', metric: 'gems', need: 1, gold: 500 },
  { id: 'e2', title: 'นักล่าอัญมณี', desc: 'พบแร่หายาก 25 ก้อน', metric: 'gems', need: 25, gold: 8000 },
  { id: 'a1', title: 'พรานป่า', desc: 'ล่าสัตว์ 100 ตัว', metric: 'animals', need: 100, gold: 600 },
  { id: 'a2', title: 'พรานในตำนาน', desc: 'ล่าสัตว์ 1,500 ตัว', metric: 'animals', need: 1500, gold: 6000 },
  { id: 'p1', title: 'นักปรุงยา', desc: 'ปรุงยา 5 ขวด', metric: 'brews', need: 5, gold: 500 },
  { id: 'p2', title: 'จอมเวทยาเทพ', desc: 'ปรุงยา 100 ขวด', metric: 'brews', need: 100, gold: 6000 },
  { id: 'd1', title: 'นักสำรวจถ้ำ', desc: 'ผ่านดันเจี้ยน 1 ครั้ง', metric: 'dungeons', need: 1, gold: 500 },
  { id: 'd2', title: 'ผู้พิชิตถ้ำเงา', desc: 'ผ่านดันเจี้ยน 60 ครั้ง', metric: 'dungeons', need: 60, gold: 8000 },
  { id: 'l1', title: 'ผู้กล้า', desc: 'ถึงเลเวล 50', metric: 'level', need: 50, gold: 3000 },
  { id: 'l2', title: 'ตำนานแห่งมอนคราว', desc: 'ถึงเลเวล 100', metric: 'level', need: 100, gold: 30000 },
  { id: 'c1', title: 'นักสะสมมอน', desc: 'ปราบมอนครบทุกชนิดในสมุดมอน', metric: 'codex', need: CODEX.length, gold: 10000 },
];
export const achProgress = (s: GameState, a: Ach) => Math.min(a.need, M[a.metric](s));
type TS = GameState & { titles?: string[]; title?: string | null };
export const titlesOf = (s: GameState) => ((s as TS).titles ??= []);
/** titles given by events, not by a goal (the CBT testers' title — src/systems/cbtGift.ts) */
export const SPECIAL_TITLES: Record<string, string> = { cbt: 'ผู้บุกเบิก' };
export const titleOf = (s: GameState) => { const id = (s as TS).title; return id ? ACHS.find(a => a.id === id)?.title ?? SPECIAL_TITLES[id] ?? null : null; };
/** goal titles won (event titles not counted) */
export const achDone = (s: GameState) => titlesOf(s).filter(id => ACHS.some(a => a.id === id)).length;
export function claimAch(s: GameState, id: string) {
  const a = ACHS.find(q => q.id === id); if (!a) return 'missing';
  const t = titlesOf(s); if (t.includes(id)) return 'claimed';
  if (achProgress(s, a) < a.need) return 'locked';
  t.push(id); s.gold += a.gold; if (!(s as TS).title) (s as TS).title = id;
  return a;
}
export function setTitle(s: GameState, id: string | null) { if (id && !titlesOf(s).includes(id)) return false; (s as TS).title = id; return true; }
