// Special looks (the diamond wheel's 🔒 prizes, src/systems/diamondWheel.ts): the storm-cloud pet, the black horse skin,
// the gold name and the 30-day storm aura. Owned lists are server-written; each can be turned off (on by default once owned).
// The storm cloud: floats behind the hero, +5% walking speed, and a lightning guide to the roaming boss (no pay-to-win:
// the boss is not moved, the owner only learns where it is sooner — director 2026-11-14).
import type { GameState } from '../core/state';

type CS = GameState & { pets?: string[]; skins?: string[]; nameColors?: string[]; petOn?: string; nameColor?: string; horseSkin?: string; auraLtd?: number };
export type CosKind = 'pet' | 'name' | 'horse';
/** walking speed with the storm cloud out */
export const CLOUD_SPEED = 1.05;
/** the black horse skin runs a little faster than the plain horse (still slower than the dragon) — director */
export const BLACK_HORSE_BONUS = 0.05;
/** a mount's speed with its skin */
export const rideSpeed = (base: number, skin: string | null) => base + (skin === 'horse_black' ? BLACK_HORSE_BONUS : 0);
/** the storm aura's colour index in VIP_AURA (premium.ts) */
export const STORM_AURA = 4;

const own = (l: string[] | undefined, id: string) => (l ?? []).includes(id);
/** the pet floating with the hero ('cloud' or null) */
export const activePet = (s: GameState): string | null => { const p = s as CS; return own(p.pets, 'cloud') && p.petOn !== 'none' ? 'cloud' : null; };
/** the name colour ('gold' or null) */
export const activeNameColor = (s: GameState): string | null => { const p = s as CS; return own(p.nameColors, 'gold') && p.nameColor !== 'none' ? 'gold' : null; };
/** the horse's skin ('horse_black' or null) */
export const activeHorseSkin = (s: GameState): string | null => { const p = s as CS; return own(p.skins, 'horse_black') && p.horseSkin !== 'none' ? 'horse_black' : null; };
/** the 30-day storm aura still running */
export const stormAuraLeft = (s: GameState, now = Date.now()) => Math.max(0, ((s as CS).auraLtd ?? 0) - now);
/** what each looks like on/off, for the settings rows */
export const cosOwned = (s: GameState, k: CosKind) => { const p = s as CS; return k === 'pet' ? own(p.pets, 'cloud') : k === 'name' ? own(p.nameColors, 'gold') : own(p.skins, 'horse_black'); };
export const cosOn = (s: GameState, k: CosKind) => (k === 'pet' ? activePet(s) : k === 'name' ? activeNameColor(s) : activeHorseSkin(s)) !== null;
/** turn one on / off (only an owned one) */
export function setCosmetic(s: GameState, k: CosKind, on: boolean): { ok: true } | { refused: string } {
  if (k !== 'pet' && k !== 'name' && k !== 'horse') return { refused: 'kind' };
  if (!cosOwned(s, k)) return { refused: 'owned' };
  const p = s as CS, v = on ? undefined : 'none';
  if (k === 'pet') p.petOn = v; else if (k === 'name') p.nameColor = v; else p.horseSkin = v;
  if (v === undefined) { if (k === 'pet') delete p.petOn; else if (k === 'name') delete p.nameColor; else delete p.horseSkin; }
  return { ok: true };
}
/** the aura colour to show: the storm aura while it lasts, otherwise the VIP card's (0 = none / turned off) */
export function auraOf(s: GameState, vipTier: number, now = Date.now()) {
  if ((s as { auraOff?: boolean }).auraOff) return 0;
  return stormAuraLeft(s, now) > 0 ? STORM_AURA : vipTier;
}
