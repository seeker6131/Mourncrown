import { describe, it, expect } from 'vitest';
import { startNewGame } from '../src/core/save';
import { supCount, supTierOf, supTier, supPaid, supSet, supSeasonOn, supNext, plateOf, SUP_TIERS } from '../src/systems/supporter';

describe('👑 supporter tiers', () => {
  it('tiers come from the total paid', () => {
    expect(supTierOf(0)).toBe(0); expect(supTierOf(98)).toBe(0); expect(supTierOf(99)).toBe(1);
    expect(supTierOf(700)).toBe(3); expect(supTierOf(10000)).toBe(7); expect(supTierOf(99999)).toBe(7);
  });
  it('a payment adds up, unlocks every tier passed, gives the titles once', () => {
    const s = startNewGame();
    const r = supCount(s, 1500, 0);
    expect(r.after).toBe(4); expect(r.got).toEqual([1, 2, 3, 4]); expect(supPaid(s)).toBe(1500);
    expect((s as { titles?: string[] }).titles).toContain('sup1');
    supCount(s, 8500, 0); expect(supTier(s)).toBe(7);
    expect((s as { titles?: string[] }).titles!.filter(t => t === 'sup1').length).toBe(1);
    expect((s as { titles?: string[] }).titles).toContain('sup7');
  });
  it('the diamond bonus uses the tier held before the payment, and only on diamond packs', () => {
    const s = startNewGame();
    expect(supCount(s, 299, 1000).bonus).toBe(0);      // (no tier yet: no bonus on the first payment)
    expect(supCount(s, 299, 1000).bonus).toBe(100);    // (tier 2 now: +10%)
    expect(supCount(s, 1000, 0).bonus).toBe(0);        // (a VIP card: no diamonds, no bonus)
  });
  it('the tier never goes down from payments; the admin can lower it by hand', () => {
    const s = startNewGame(); supCount(s, 3000, 0); expect(supTier(s)).toBe(5);
    supSet(s, 300); expect(supTier(s)).toBe(2); expect(supPaid(s)).toBe(300);
  });
  it('the season: nothing counts outside it', () => {
    expect(supSeasonOn(null, 5)).toBe(false);
    expect(supSeasonOn({ from: 10, to: 20 }, 5)).toBe(false);
    expect(supSeasonOn({ from: 10, to: 20 }, 15)).toBe(true);
    expect(supSeasonOn({ from: 10, to: 20 }, 20)).toBe(false);
  });
  it('the next tier and the plates', () => {
    const s = startNewGame(); expect(supNext(s)?.tier.n).toBe(1); supCount(s, 10000, 0); expect(supNext(s)).toBeNull();
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(plateOf)).toEqual([0, 1, 1, 2, 2, 3, 3, 4]);
    expect(SUP_TIERS.map(t => t.n)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});
