// Auto farming in the Deepwild (director 2026-11-12: "auto gather by choosing what and how much — e.g. wood 50, meat 50,
// ore 30, then start"). Replaces the old rule "gathering is always by hand"; the daily ⚡ energy still caps how much
// anyone (bot or not) can gather in a day, so it does not inflate resources. VIP only (director): it saves time, the
// same daily energy applies, so it is comfort, not power.
import type { GameState } from '../core/state';

export type FarmKey = 'wood' | 'stone' | 'ore' | 'food';
export type FarmGoal = Record<FarmKey, number>;
export const FARM_KEYS: FarmKey[] = ['wood', 'stone', 'ore', 'food'];
export const FARM_STEPS = [0, 20, 50, 100, 200];
export const FARM_NAMES: Record<FarmKey, string> = { wood: '🪵 ไม้', stone: '🪨 หิน', ore: '⛏ แร่', food: '🍖 เนื้อ' };
export const FARM_DEFAULT: FarmGoal = { wood: 50, stone: 0, ore: 0, food: 50 };

type FS = GameState & { farm?: Partial<FarmGoal> };
export const farmGoal = (s: GameState): FarmGoal => ({ ...FARM_DEFAULT, ...((s as FS).farm ?? {}) });
export function setFarmGoal(s: GameState, ch: Partial<FarmGoal>) { (s as FS).farm = { ...farmGoal(s), ...ch }; }
/** what is still wanted this session (goal minus what was gathered since it started) */
export function farmLeft(goal: FarmGoal, got: FarmGoal): FarmGoal {
  return { wood: Math.max(0, goal.wood - got.wood), stone: Math.max(0, goal.stone - got.stone), ore: Math.max(0, goal.ore - got.ore), food: Math.max(0, goal.food - got.food) };
}
export const farmDone = (left: FarmGoal) => FARM_KEYS.every(k => left[k] <= 0);
