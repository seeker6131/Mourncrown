// Player UI preferences (stored in the save so they follow the account when online).
import type { GameState } from './state';
/** vol: sound effects volume 0..1 (0 = silent) */
export interface UiOpt { scale: number; btn: number; alpha: number; names: boolean; vol: number; /** 2 = saved after the UI got 10% smaller (older saves shrink once) */ v?: number }
export const UI_SCALES = [0.85, 1, 1.15, 1.3];
export const BTN_SCALES = [0.85, 1, 1.2];
export const ALPHAS = [1, 0.8, 0.6];
export function uiOpt(s: GameState): UiOpt {
  const o = (s as GameState & { uiOpt?: Partial<UiOpt> }).uiOpt ?? {};
  return { scale: o.v === 2 ? o.scale ?? 0.9 : Math.round((o.scale ?? 1) * 0.9 * 100) / 100, btn: o.btn ?? 1, alpha: o.alpha ?? 1, names: o.names ?? true, vol: o.vol ?? 0.8 };
}
export function setUiOpt(s: GameState, patch: Partial<UiOpt>) {
  (s as GameState & { uiOpt?: UiOpt }).uiOpt = { ...uiOpt(s), ...patch, v: 2 };
}
export const cycle = (arr: number[], v: number) => arr[(arr.indexOf(v) + 1) % arr.length] ?? arr[0];
/** slider ranges (settings window): UI size, battle buttons, top bar opacity */
export const RANGES = { scale: [0.7, 1.3], btn: [0.8, 1.4], alpha: [0.4, 1], vol: [0, 1] } as const;
