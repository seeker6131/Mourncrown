import { describe, it, expect } from 'vitest';
import { startNewGame } from '../src/core/save';
import { activePet, activeNameColor, activeHorseSkin, setCosmetic, auraOf, rideSpeed, STORM_AURA, cosOn } from '../src/systems/cosmetics';
import { spinDiamond } from '../src/systems/diamondWheel';
import { MOUNTS } from '../src/data/mounts';

describe('diamond wheel looks', () => {
  it('nothing until owned; on by default once owned; can be turned off and on', () => {
    const s = startNewGame() as ReturnType<typeof startNewGame> & Record<string, unknown>;
    expect(activePet(s)).toBeNull(); expect(setCosmetic(s, 'pet', true)).toEqual({ refused: 'owned' });
    s.pets = ['cloud']; s.nameColors = ['gold']; s.skins = ['horse_black'];
    expect(activePet(s)).toBe('cloud'); expect(activeNameColor(s)).toBe('gold'); expect(activeHorseSkin(s)).toBe('horse_black');
    setCosmetic(s, 'pet', false); expect(activePet(s)).toBeNull(); expect(cosOn(s, 'pet')).toBe(false);
    setCosmetic(s, 'pet', true); expect(activePet(s)).toBe('cloud'); expect('petOn' in s).toBe(false);
  });
  it('the storm aura wins over the VIP card while it lasts; aura off hides both', () => {
    const s = startNewGame() as ReturnType<typeof startNewGame> & Record<string, unknown>, now = 1e12;
    expect(auraOf(s, 2, now)).toBe(2);
    s.auraLtd = now + 1000; expect(auraOf(s, 2, now)).toBe(STORM_AURA); expect(auraOf(s, 0, now)).toBe(STORM_AURA);
    expect(auraOf(s, 2, now + 2000)).toBe(2);
    s.auraOff = true; expect(auraOf(s, 2, now)).toBe(0);
  });
  it('the black horse: faster than the horse, slower than the dragon', () => {
    const b = rideSpeed(MOUNTS.horse.speed, 'horse_black');
    expect(b).toBeGreaterThan(MOUNTS.horse.speed); expect(b).toBeLessThan(MOUNTS.dragon.speed); expect(rideSpeed(MOUNTS.horse.speed, null)).toBe(MOUNTS.horse.speed);
  });
  it('winning the cloud on the wheel turns it on', () => {
    const s = startNewGame() as ReturnType<typeof startNewGame> & Record<string, unknown>; s.diamonds = 30;
    // (a roll landing on the cloud segment: dragon 3 + potion 304 = 307 → 307..317 of 1000)
    const r = spinDiamond(s, 1, () => 0.31);
    expect(typeof r).toBe('object'); expect(activePet(s)).toBe('cloud');
  });
});
