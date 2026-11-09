// Player UI preferences (stored in the save so they follow the account when online).
import type { GameState } from './state';
export interface UiOpt { scale: number; btn: number; alpha: number; names: boolean }
export const UI_SCALES = [0.85, 1, 1.15, 1.3];
export const BTN_SCALES = [0.85, 1, 1.2];
export const ALPHAS = [1, 0.8, 0.6];
export function uiOpt(s: GameState): UiOpt {
  const o = (s as GameState & { uiOpt?: Partial<UiOpt> }).uiOpt ?? {};
  return { scale: o.scale ?? 1, btn: o.btn ?? 1, alpha: o.alpha ?? 1, names: o.names ?? true };
}
export function setUiOpt(s: GameState, patch: Partial<UiOpt>) {
  (s as GameState & { uiOpt?: UiOpt }).uiOpt = { ...uiOpt(s), ...patch };
}
export const cycle = (arr: number[], v: number) => arr[(arr.indexOf(v) + 1) % arr.length] ?? arr[0];
