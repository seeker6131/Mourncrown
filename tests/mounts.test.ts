import { describe, it, expect } from 'vitest';
import { startNewGame } from '../src/core/save';
import { buyMount, selectMount, grantMount, mountOn, hasMount, nextRide } from '../src/systems/mounts';
import { MOUNTS } from '../src/data/mounts';

describe('mounts', () => {
  it('the horse is bought with gold at its level; the dragon is never for sale', () => {
    const s = startNewGame(); s.level = 10; s.gold = 99999;
    expect(buyMount(s, 'horse')).toEqual({ refused: 'level' });
    s.level = MOUNTS.horse.price!.lv;
    expect(buyMount(s, 'horse')).toEqual({ ok: true }); expect(s.gold).toBe(99999 - MOUNTS.horse.price!.gold); expect(mountOn(s)).toBe('horse');
    expect(buyMount(s, 'horse')).toEqual({ refused: 'owned' });
    expect(buyMount(s, 'dragon')).toEqual({ refused: 'limited' });
  });
  it('the dragon is faster than the horse, and only comes from playing', () => {
    expect(MOUNTS.dragon.speed).toBeGreaterThan(MOUNTS.horse.speed); expect(MOUNTS.horse.speed).toBeGreaterThan(1);
    expect(MOUNTS.dragon.price).toBeUndefined();
    const s = startNewGame(); expect(grantMount(s, 'dragon')).toBe(true); expect(grantMount(s, 'dragon')).toBe(false); expect(hasMount(s, 'dragon')).toBe(true);
  });
  it('choose what to ride; the ride button toggles back to the last mount', () => {
    const s = startNewGame(); expect(selectMount(s, 'dragon')).toEqual({ refused: 'mount' });
    grantMount(s, 'dragon'); grantMount(s, 'horse');
    selectMount(s, 'dragon'); expect(mountOn(s)).toBe('dragon'); expect(nextRide(s)).toBeNull();
    selectMount(s, null); expect(mountOn(s)).toBeNull(); expect(nextRide(s)).toBe('dragon');
  });
});
