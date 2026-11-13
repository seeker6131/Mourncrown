// Daily tasks: 3 small goals that reset every day, so there's always a reason to log in.
import type { GameState } from '../core/state';
import { addItem } from './inventory';

export type DailyKind = 'kill' | 'wood' | 'stone' | 'boss' | 'craft';
export interface DailyTask { kind: DailyKind; need: number; got: number; done: boolean; gold: number; shards: number }

const POOL: Omit<DailyTask, 'got' | 'done'>[] = [
  { kind: 'kill', need: 30, gold: 150, shards: 2 },
  { kind: 'kill', need: 60, gold: 300, shards: 3 },
  { kind: 'wood', need: 60, gold: 120, shards: 1 },
  { kind: 'stone', need: 40, gold: 120, shards: 1 },
  { kind: 'craft', need: 1, gold: 200, shards: 2 },
  { kind: 'boss', need: 1, gold: 600, shards: 5 },
];
export const DAILY_NAMES: Record<DailyKind, string> = { kill: 'ล่ามอนสเตอร์', wood: 'เก็บไม้', stone: 'เก็บหิน', boss: 'ปราบบอส', craft: 'หลอมอุปกรณ์' };

/** the game's day, in Thai time for everyone (the server runs on UTC and phones on their own clock: a day key made from
 *  the local clock made the server and the game disagree between midnight and 7 am, so the login gift showed again and
 *  again — director) */
export function dayKey(now = Date.now()) { const d = new Date(now + 7 * 3600000); return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`; }

type WithDaily = GameState & { daily?: { day: string; tasks: DailyTask[] } };

export function ensureDaily(s: GameState, now = Date.now()) {
  const st = s as WithDaily;
  const day = dayKey(now);
  if (st.daily?.day === day) return st.daily;
  let seed = day.split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  const pool = [...POOL];
  const tasks: DailyTask[] = [];
  while (tasks.length < 3 && pool.length) {
    const t = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
    if (tasks.some(q => q.kind === t.kind)) continue;
    tasks.push({ ...t, got: 0, done: false });
  }
  st.daily = { day, tasks };
  return st.daily;
}

/** Record progress; returns tasks that just completed. */
export function dailyProgress(s: GameState, kind: DailyKind, n = 1, now = Date.now()): DailyTask[] {
  const d = ensureDaily(s, now);
  const out: DailyTask[] = [];
  for (const t of d.tasks) {
    if (t.kind !== kind || t.done) continue;
    t.got = Math.min(t.need, t.got + n);
    if (t.got >= t.need) { t.done = true; s.gold += t.gold; addItem(s, 'mana_shard', t.shards); out.push(t); }
  }
  return out;
}
