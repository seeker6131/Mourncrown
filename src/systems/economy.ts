// Economy guard (server-side): resources must stay scarce — no inflation from 24 h auto play.
//  • Daily energy: gathering and hunting give full yield for the first part of the day, a quarter after that, then nothing.
//  • Storage cap: wood / stone / food can't pile up past what the warehouse holds.
// Numbers are behind the scenes only (never shown as rates to players; the HUD shows the energy left).
import type { GameState } from '../core/state';
import { dayKey } from './daily';

export const GATHER_FULL = 600, GATHER_TAIL = 600;      // hits per day (a glowing vein costs 3)
export const HUNT_FULL = 250, HUNT_TAIL = 250;          // animals per day that give meat / hides
type ES = GameState & { energy?: { day: string; gather: number; hunt: number; t?: number; tonic?: number } };
/** ⚡ energy comes back by itself, a little every hour (player feedback 15 Nov: only waiting for midnight was sad) */
export const GATHER_REGEN = 60, HUNT_REGEN = 25;   // per hour
/** sleeping in your own house bed: this much more back per hour slept (systems/guild.ts wake) */
export const BED_REGEN = 120;
/** 🧪 the stamina tonic: energy back, a few a day (a gold sink — not too easy, director) */
export const TONIC_GATHER = 300, TONIC_HUNT = 100, TONIC_DAY = 3;
export function energy(s: GameState, now = Date.now()) {
  const e = s as ES, day = dayKey(now);
  if (e.energy?.day !== day) e.energy = { day, gather: 0, hunt: 0, t: now, tonic: 0 };
  const en = e.energy, h = Math.max(0, now - (en.t ?? now)) / 3600000;
  if (h > 0) { en.gather = Math.max(0, en.gather - h * GATHER_REGEN); en.hunt = Math.max(0, en.hunt - h * HUNT_REGEN); }
  en.t = now;
  return en;
}
/** give energy back (the bed, a tonic) */
export function restoreEnergy(s: GameState, gather: number, hunt: number, now = Date.now()) {
  const en = energy(s, now); en.gather = Math.max(0, en.gather - gather); en.hunt = Math.max(0, en.hunt - hunt); return en;
}
const mult = (used: number, full: number, tail: number) => (used < full ? 1 : used < full + tail ? 0.25 : 0);
export const gatherMult = (s: GameState, now = Date.now()) => mult(energy(s, now).gather, GATHER_FULL, GATHER_TAIL);
export const huntMult = (s: GameState, now = Date.now()) => mult(energy(s, now).hunt, HUNT_FULL, HUNT_TAIL);
export const energyLeft = (s: GameState, now = Date.now()) => Math.max(0, Math.floor(GATHER_FULL + GATHER_TAIL - energy(s, now).gather));
export const huntLeft = (s: GameState, now = Date.now()) => Math.max(0, Math.floor(HUNT_FULL + HUNT_TAIL - energy(s, now).hunt));

/** warehouse holds 3,000 of each resource + 3,000 per level */
export function resCap(s: GameState) {
  const w = s.buildings.find(b => b.type === 'warehouse'); const lv = w ? (w.done && Date.now() < w.done ? w.level - 1 : w.level) : 0;
  return 3000 + lv * 3000;
}
/** cut resources back to the cap; returns how much spilled */
export function clampRes(s: GameState) {
  const cap = resCap(s); let lost = 0;
  for (const k of ['wood', 'stone', 'food'] as const) if (s.res[k] > cap) { lost += s.res[k] - cap; s.res[k] = cap; }
  return lost;
}
