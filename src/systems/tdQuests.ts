// Quest chain for the top-down game — pure (online later: the server checks progress and pays the reward).
// Progress is read from the save (kills, stages cleared, level, form, home level, skills cast).
import type { GameState } from '../core/state';
import { addItem } from './inventory';

type Metric = 'kills' | 'clear' | 'level' | 'tier' | 'home' | 'casts' | 'boss' | 'map';
export interface TdQuest { id: string; title: string; metric: Metric; need: number; relative?: boolean; reward: { gold?: number; wood?: number; stone?: number; food?: number; items?: Record<string, number> } }

export const TD_QUESTS: TdQuest[] = [
  { id: 'q1', title: 'ปราบมอนสเตอร์ 5 ตัว', metric: 'kills', need: 5, relative: true, reward: { gold: 60, items: { hp_potion: 3 } } },
  { id: 'q2', title: 'ปราบมอนสเตอร์ 30 ตัว', metric: 'kills', need: 30, relative: true, reward: { gold: 80, wood: 20 } },
  { id: 'q3', title: 'สร้างบ้านของคุณในหมู่บ้าน', metric: 'home', need: 1, reward: { gold: 100, stone: 20 } },
  { id: 'q4', title: 'ถึงเลเวล 5', metric: 'level', need: 5, reward: { gold: 150, items: { mp_potion: 3 } } },
  { id: 'q5', title: 'ใช้สกิล 10 ครั้ง', metric: 'casts', need: 10, relative: true, reward: { gold: 120, items: { mana_shard: 2 } } },
  { id: 'q6', title: 'ไปถึงแผนที่ 5', metric: 'map', need: 5, reward: { gold: 250, wood: 60, stone: 40 } },
  { id: 'q7', title: 'ถึงเลเวล 10', metric: 'level', need: 10, reward: { gold: 300 } },
  { id: 'q8', title: 'เลือกสายอาชีพกับผู้เฒ่า', metric: 'tier', need: 1, reward: { gold: 300, items: { mana_shard: 3 } } },
  { id: 'q9', title: 'ปราบบอสแผนที่ 10 — มารดารากเน่า', metric: 'clear', need: 10, reward: { gold: 600, wood: 120, stone: 100, items: { hp_potion_l: 3 } } },
  { id: 'q10', title: 'อัปเกรดบ้านเป็น Lv2', metric: 'home', need: 2, reward: { gold: 400, items: { wolf_pelt: 4 } } },
  { id: 'q11', title: 'ปราบมอนสเตอร์ 150 ตัว', metric: 'kills', need: 150, relative: true, reward: { gold: 800, items: { mana_shard: 5 } } },
  { id: 'q12', title: 'ปราบบอสแผนที่ 20 — ราชากวางโครงกระดูก', metric: 'clear', need: 20, reward: { gold: 1200, wood: 200, stone: 200, items: { goblin_fang: 5 } } },
  { id: 'q13', title: 'ถึงเลเวล 40', metric: 'level', need: 40, reward: { gold: 1500 } },
  { id: 'q14', title: 'เปลี่ยนเป็นร่างที่ 3', metric: 'tier', need: 2, reward: { gold: 1500, items: { mana_shard: 8 } } },
  { id: 'q15', title: 'ปราบบอสแผนที่ 30 — อสรพิษแก้วดำ', metric: 'clear', need: 30, reward: { gold: 2500, wood: 300, stone: 300, items: { ancient_core: 1 } } },
  { id: 'q16', title: 'อัปเกรดบ้านเป็น Lv4', metric: 'home', need: 4, reward: { gold: 2000, items: { ancient_core: 1 } } },
  { id: 'q17', title: 'ปราบบอสแผนที่ 40 — ผู้คุมเหมันต์', metric: 'clear', need: 40, reward: { gold: 4000, items: { ancient_core: 2, hp_potion_l: 5 } } },
  { id: 'q18', title: 'ถึงเลเวล 80', metric: 'level', need: 80, reward: { gold: 5000 } },
  { id: 'q19', title: 'เปลี่ยนเป็นร่างสุดท้าย', metric: 'tier', need: 3, reward: { gold: 5000, items: { mana_shard: 15 } } },
  { id: 'q20', title: 'ปราบบอสแผนที่ 50 — มงกุฎกลวง ชำระคำสาป!', metric: 'clear', need: 50, reward: { gold: 10000, items: { ancient_core: 3 } } },
];

type QS = GameState & { tdq?: { i: number; base: number }; tdKills?: number; tdCasts?: number; tdCleared?: number };
function metric(s: QS, m: Metric) {
  switch (m) {
    case 'kills': return s.tdKills ?? 0;
    case 'casts': return s.tdCasts ?? 0;
    case 'clear': return s.tdCleared ?? 0;
    case 'map': return (s as QS & { tdMaxMap?: number }).tdMaxMap ?? 0;
    case 'level': return s.level;
    case 'tier': return s.tier ?? 0;
    case 'home': return s.buildings.find(b => b.type === 'home' && !(b.done && Date.now() < b.done))?.level ?? 0;
    case 'boss': return s.bossDefeated ?? 0;
  }
}
function state(s: QS) {
  if (!s.tdq) { const q = TD_QUESTS[0]; s.tdq = { i: 0, base: q.relative ? metric(s, q.metric) : 0 }; }
  return s.tdq;
}
/** current quest + progress, or null when the chain is finished */
export function tdQuest(s: GameState) {
  const qs = state(s as QS), q = TD_QUESTS[qs.i]; if (!q) return null;
  const cur = Math.min(q.need, metric(s as QS, q.metric) - (q.relative ? qs.base : 0));
  return { q, cur: Math.max(0, cur), done: cur >= q.need, index: qs.i, total: TD_QUESTS.length };
}
/** pay the reward and move on; false when not finished */
export function claimTdQuest(s: GameState): TdQuest | null {
  const t = tdQuest(s); if (!t || !t.done) return null;
  const r = t.q.reward;
  s.gold += r.gold ?? 0; s.res.wood += r.wood ?? 0; s.res.stone += r.stone ?? 0; s.res.food += r.food ?? 0;
  for (const [id, n] of Object.entries(r.items ?? {})) addItem(s, id, n);
  const qs = state(s as QS); qs.i++;
  const nx = TD_QUESTS[qs.i]; if (nx) qs.base = nx.relative ? metric(s as QS, nx.metric) : 0;
  return t.q;
}
export function rewardText(r: TdQuest['reward'], name: (id: string) => string) {
  return [r.gold && `${r.gold}G`, r.wood && `ไม้ ${r.wood}`, r.stone && `หิน ${r.stone}`, r.food && `อาหาร ${r.food}`, ...Object.entries(r.items ?? {}).map(([id, n]) => `${name(id)} x${n}`)].filter(Boolean).join(' • ');
}
