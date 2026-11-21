// Back to where the player was after the game reloads itself for an update (director): same map, same spot, auto
// (and the VIP Deepwild farm) still on. The map scene says where the hero is; the note lives in this tab only
// (sessionStorage) and is good for a few minutes.
export interface Resume { stage: number; room?: number; guild?: boolean; inside?: number; x: number; y: number; farm?: boolean; at: number }
/** busy = in a dungeon run / a raid / a war: the reload waits until it ends (it would be lost) */
type Where = { busy: boolean; at: Resume };
const KEY = 'mcResume', FRESH = 5 * 60000;
let where: (() => Where) | null = null;
/** the map scene tells how to find the hero (and saves the game when asked) */
export const resumeFrom = (f: () => Where) => { where = f; };
export const resumeBusy = () => !!where?.().busy;
/** write the note just before the reload */
export function keepResume() {
  const w = where?.(); if (!w || w.busy) return;
  try { sessionStorage.setItem(KEY, JSON.stringify(w.at)); } catch { /* private mode: the game starts at the title */ }
}
/** the note left by the last reload (taken once) */
export function takeResume(): Resume | null {
  try {
    const raw = sessionStorage.getItem(KEY); sessionStorage.removeItem(KEY); if (!raw) return null;
    const r = JSON.parse(raw) as Resume; return Date.now() - r.at < FRESH ? r : null;
  } catch { return null; }
}
export const hasResume = () => { try { const raw = sessionStorage.getItem(KEY); return !!raw && Date.now() - (JSON.parse(raw) as Resume).at < FRESH; } catch { return false; } };
