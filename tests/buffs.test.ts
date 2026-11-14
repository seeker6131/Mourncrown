import { describe, it, expect } from 'vitest';
import { activeBuffs, buffClash, clock } from '../src/systems/buffs';
import { startNewGame } from '../src/core/save';

describe('buff chips (what is on, time left) and the replace warning', () => {
  it('lists the food/tonic, elixir and skill buffs with time left; asks before replacing a long one', () => {
    const now = 1_000_000, s = startNewGame() as ReturnType<typeof startNewGame> & Record<string, unknown>;
    expect(activeBuffs(s, now)).toEqual([]);
    expect(buffClash(s, { slot: 'buff', stat: 'def', pct: 15 }, now)).toBeNull();
    s.buff = { stat: 'atk', pct: 10, until: now + 12 * 60000 + 30000, meal: true };
    s.elixir = { atk: 20, crit: 5, until: now + 5 * 60000, name: 'ยาอายุวัฒนะ' };
    s.skillBuff = { atk: 30, until: now + 8000 };
    const b = activeBuffs(s, now);
    expect(b.map(q => q.key)).toEqual(['buff', 'elixir', 'skill']);
    expect(b[0].text).toBe('🍖 ATK+10%'); expect(b[1].text).toBe('⚗ ATK+20% CRI+5%'); expect(clock(b[2].left)).toBe('0:08');
    expect(buffClash(s, { slot: 'buff', stat: 'def', pct: 15 }, now)).toBe('🍖 ATK+10% (เหลือ 12:30)');
    expect(buffClash(s, { slot: 'buff', stat: 'atk', pct: 10, meal: true }, now)).toBeNull();   // (the same meal: adds time, no question)
    expect(buffClash(s, { slot: 'buff', stat: 'def', pct: 15 }, now + 12 * 60000)).toBeNull();   // (under a minute left: no question)
    expect(activeBuffs(s, now + 13 * 60000).map(q => q.key)).toEqual([]);   // (all over)
  });
});

describe('⏳ the same buff adds its time: up to 1 hour, VIP 3 hours; a different one replaces', () => {
  it('tonics stack up to the cap; full = nothing used; a different tonic starts fresh', async () => {
    const { useItem, addItem } = await import('../src/systems/inventory');
    const now = Date.now(), s = startNewGame() as ReturnType<typeof startNewGame> & { vipUntil?: number; buff?: { until: number; stat: string } };
    addItem(s, 'tonic_atk', 5); addItem(s, 'tonic_def', 1);
    const uid = () => s.inventory.find(i => i.id === 'tonic_atk')!.uid, qty = () => s.inventory.find(i => i.id === 'tonic_atk')?.qty ?? 0;
    let r = useItem(s, uid(), now)!; expect(r.left).toBe(30 * 60000); expect(r.stacked).toBe(false);
    r = useItem(s, uid(), now)!; expect(r.left).toBe(60 * 60000); expect(r.stacked).toBe(true);
    const q = qty(); r = useItem(s, uid(), now)!; expect(r.full).toBe(true); expect(qty()).toBe(q);   // (1 hour: full, nothing used)
    s.vipUntil = now + 86400000;
    r = useItem(s, uid(), now)!; expect(r.left).toBe(90 * 60000);                                     // (VIP: up to 3 hours)
    r = useItem(s, s.inventory.find(i => i.id === 'tonic_def')!.uid, now)!; expect(r.left).toBe(30 * 60000); expect(s.buff!.stat).toBe('def');   // (different: replaces)
  });
  it('meals stack the same way (the same meal and power)', async () => {
    const { cook, ensureHomeVillage } = await import('../src/systems/settlement');
    const now = Date.now(), s = startNewGame() as ReturnType<typeof startNewGame> & { buff?: { until: number } };
    s.buildings = []; ensureHomeVillage(s, now); s.res.food = 10000;
    expect(cook(s, 'hunter_stew', now)).toBe('ok'); const one = s.buff!.until - now;
    expect(cook(s, 'hunter_stew', now)).toBe('ok'); expect(s.buff!.until - now).toBe(Math.min(60 * 60000, one * 2));
    while (cook(s, 'hunter_stew', now) === 'ok') { /* to the cap */ }
    expect(s.buff!.until - now).toBeLessThanOrEqual(60 * 60000); expect(cook(s, 'hunter_stew', now)).toBe('full');
  });
});
