// Owning and choosing a mount (server rules). Riding itself is a picture + walking speed on the client.
import type { GameState } from '../core/state';
import { MOUNTS, type MountId } from '../data/mounts';

type R = { refused: string };
const no = (why: string): R => ({ refused: why });
type MS = GameState & { mounts?: MountId[]; mount?: MountId | null; mountLast?: MountId };
export const mountsOf = (s: GameState) => ((s as MS).mounts ??= []);
export const mountOn = (s: GameState): MountId | null => { const m = (s as MS).mount; return m && mountsOf(s).includes(m) ? m : null; };
export const hasMount = (s: GameState, id: MountId) => mountsOf(s).includes(id);

/** the horse is sold for gold; limited mounts are never for sale */
export function buyMount(s: GameState, id: MountId): R | { ok: true } {
  const d = MOUNTS[id]; if (!d) return no('mount');
  if (hasMount(s, id)) return no('owned');
  if (!d.price) return no('limited');
  if (s.level < d.price.lv) return no('level');
  if (s.gold < d.price.gold) return no('gold');
  s.gold -= d.price.gold; mountsOf(s).push(id); (s as MS).mount = id;
  return { ok: true };
}
/** given by the game (a bounty lord, the season, a test kit) */
export function grantMount(s: GameState, id: MountId) { if (!hasMount(s, id)) { mountsOf(s).push(id); return true; } return false; }
/** pick the mount you ride (or none) */
export function selectMount(s: GameState, id: MountId | null): R | { mount: MountId | null } {
  if (id && !hasMount(s, id)) return no('mount');
  (s as MS).mount = id; if (id) (s as MS).mountLast = id; return { mount: id };
}
/** the ride button: off when riding, otherwise back on the last mount ridden (or the first owned) */
export const nextRide = (s: GameState): MountId | null => mountOn(s) ? null : ((s as MS).mountLast && hasMount(s, (s as MS).mountLast!) ? (s as MS).mountLast! : mountsOf(s)[0] ?? null);
