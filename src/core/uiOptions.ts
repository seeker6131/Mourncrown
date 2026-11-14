// Player UI preferences (stored in the save so they follow the account when online).
import type { GameState } from './state';
/** vol: sound effects volume 0..1 (0 = silent) */
export interface UiOpt { /** frames a second: 60, or 30 for weak phones (director) */ fps: number; /** low graphics: no weather particles, chimney smoke, extra effect layer, other players' auras / pets / skill effects */ low: boolean; scale: number; btn: number; alpha: number; names: boolean; vol: number; /** camera zoom on top of the screen's own (pinch / mouse wheel / slider) */ zoom: number; /** 2 = saved after the UI got 10% smaller (older saves shrink once) */ v?: number }
export const UI_SCALES = [0.85, 1, 1.15, 1.3];
export const BTN_SCALES = [0.85, 1, 1.2];
export const ALPHAS = [1, 0.8, 0.6];
export function uiOpt(s: GameState): UiOpt {
  const o = (s as GameState & { uiOpt?: Partial<UiOpt> }).uiOpt ?? {};
  return { scale: o.v === 2 ? o.scale ?? 0.9 : Math.round((o.scale ?? 1) * 0.9 * 100) / 100, btn: o.btn ?? 1, alpha: o.alpha ?? 1, names: o.names ?? true, vol: o.vol ?? 0.8, zoom: o.zoom ?? 1, fps: o.fps === 30 ? 30 : 60, low: !!o.low };
}
export function setUiOpt(s: GameState, patch: Partial<UiOpt>) {
  (s as GameState & { uiOpt?: UiOpt }).uiOpt = { ...uiOpt(s), ...patch, v: 2 };
}
export const cycle = (arr: number[], v: number) => arr[(arr.indexOf(v) + 1) % arr.length] ?? arr[0];
/** slider ranges (settings window): UI size, battle buttons, top bar opacity */
export const RANGES = { zoom: [0.75, 2], scale: [0.7, 1.3], btn: [0.8, 1.4], alpha: [0.4, 1], vol: [0, 1] } as const;
/** (this device) the graphics switches the drawing code reads */
export const gfx = { low: false };
/** apply the frame cap + low graphics now (the game loop is re-armed so the new cap takes effect at once) */
export function applyGfx(game: { loop: unknown }, o: UiOpt) {
  gfx.low = o.low;
  const L = game.loop as { fpsLimit: number; hasFpsLimit: boolean; _limitRate: number; sleep(): void; wake(seamless?: boolean): void };
  const want = o.fps === 30 ? 30 : 0;
  if (L.fpsLimit === want) return;
  L.fpsLimit = want; L.hasFpsLimit = want > 0; L._limitRate = want > 0 ? 1000 / want : 0;
  L.sleep(); L.wake(true);
}
