// Quest logic — pure functions over GameState.
import type { GameState } from '../core/state';
import { QUESTS, QUEST_BY_ID } from '../data/quests';
import { addItem, countItem, removeItem } from './inventory';
import { gainExp } from './stats';
import { itemDef } from '../data/items';
import { isGear, makeGear } from './loot';

export function activeQuest(s: GameState) {
  return s.quests.find(q => q.status !== 'done') ?? null;
}

/** Next quest the giver can offer, or null. */
export function nextAvailable(s: GameState, giver: string) {
  if (activeQuest(s)) return null;
  for (const q of QUESTS) {
    if (q.giver !== giver) continue;
    if (s.quests.find(p => p.id === q.id)) continue;
    return q;
  }
  return null;
}

export function acceptQuest(s: GameState, id: string) {
  if (s.quests.find(q => q.id === id)) return;
  s.quests.push({ id, progress: 0, status: 'active' });
  refreshCollect(s);
}

export function onKill(s: GameState, kind: string) {
  s.kills[kind] = (s.kills[kind] ?? 0) + 1;
  for (const p of s.quests) {
    if (p.status !== 'active') continue;
    const d = QUEST_BY_ID[p.id];
    if (d.kind === 'kill' && d.target === kind) {
      p.progress = Math.min(d.count, p.progress + 1);
      if (p.progress >= d.count) p.status = 'ready';
    }
  }
}

export function refreshCollect(s: GameState) {
  for (const p of s.quests) {
    if (p.status === 'done') continue;
    const d = QUEST_BY_ID[p.id];
    if (d.kind === 'collect') {
      p.progress = Math.min(d.count, countItem(s, d.target));
      p.status = p.progress >= d.count ? 'ready' : 'active';
    }
  }
}

/** Turn in; returns levels gained or -1 if not ready. */
export function completeQuest(s: GameState, id: string): number {
  const p = s.quests.find(q => q.id === id);
  if (!p || p.status !== 'ready') return -1;
  const d = QUEST_BY_ID[id];
  if (d.kind === 'collect' && !removeItem(s, d.target, d.count)) return -1;
  p.status = 'done';
  s.gold += d.reward.gold;
  for (const it of d.reward.items ?? []) {
    const def = itemDef(it.id);
    if (isGear(def)) addItem(s, it.id, it.qty, 0, makeGear(Math.random, it.id, 2));
    else addItem(s, it.id, it.qty);
  }
  return gainExp(s, d.reward.exp);
}
