import { describe, it, expect } from 'vitest';
import { startNewGame } from '../src/core/save';
import { handlers } from '../src/server/handlers';
import { spinWheel, openPick, pickChoices, WHEEL_PRICE, WHEEL_SEGS, WHEEL_OPEN } from '../src/systems/wheel';
import { invSize } from '../src/core/state';
import { useItem, addItem } from '../src/systems/inventory';
import { listItem } from '../src/systems/market';
import { ITEMS } from '../src/data/items';

let seed = 1; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const rich = () => { const s = startNewGame(); s.gold = 10_000_000; s.level = 30; s.inventory = []; return s; };

describe('🎡 the gold wheel', () => {
  it('pays first, needs gold and a free bag slot per spin, spins 1 or 10', () => {
    const s = rich(), g0 = s.gold;
    expect(typeof spinWheel(s, 1, rnd)).toBe('object'); expect(s.gold).toBe(g0 - WHEEL_PRICE);
    expect(spinWheel(s, 3, rnd)).toBe('n');
    const poor = startNewGame(); poor.gold = WHEEL_PRICE - 1; expect(spinWheel(poor, 1, rnd)).toBe('gold');
    const full = rich(); while (full.inventory.length < invSize(full) - 5) full.inventory.push({ uid: 9000 + full.inventory.length, id: 'hp_potion', qty: 1, upg: 0 } as never);
    expect(spinWheel(full, 10, rnd)).toBe('bag'); expect(full.gold).toBe(10_000_000);   // (nothing taken)
  });
  it('gear prizes are selector chests; Legend is about 1 in 1000 spins; no guarantee', () => {
    const s = rich(); s.gold = 1e12; const N = 100000, got: Record<string, number> = {};
    for (let i = 0; i < N; i++) {
      if (s.inventory.length + 1 > invSize(s)) s.inventory = [];
      const r = spinWheel(s, 1, rnd) as { prizes: { seg: number }[] };
      for (const p of r.prizes) got[WHEEL_SEGS[p.seg].key] = (got[WHEEL_SEGS[p.seg].key] ?? 0) + 1;
    }
    console.log(Object.fromEntries(Object.entries(got).map(([k, n]) => [k, (100 * n / N).toFixed(2) + '%'])));
    expect(got.legend / N).toBeGreaterThan(0.0006); expect(got.legend / N).toBeLessThan(0.0015);
    expect(WHEEL_SEGS.reduce((t, q) => t + q.w, 0)).toBe(1000);
    expect(s.inventory.some(i => i.id.startsWith('pick_')) || got.rare > 0).toBe(true);
  });
  it('a selector chest becomes the chosen gear of its rarity — not another rarity; never used up by "use"; not for the market', () => {
    const s = rich(); s.cls = 'mage'; addItem(s, 'pick_legend', 2);
    const ch = s.inventory.find(i => i.id === 'pick_legend')!;
    expect(useItem(s, ch.uid)).toBeNull(); expect(ch.qty).toBe(2);                         // ("use" does nothing)
    expect(listItem(s, ch.uid, 1, 1000)).toBe('missing');                                  // (no selling)
    const choices = pickChoices(4, 'mage'); expect(choices.length).toBeGreaterThan(0); expect(choices.every(d => d.rarity === 4)).toBe(true);
    expect(!choices[0].cls || choices[0].cls === 'mage').toBe(true);                       // (own class first)
    const wrong = Object.values(ITEMS).find(d => d.rarity === 3 && choices.every(c => c.id !== d.id) && ['weapon', 'armor', 'accessory'].includes(d.type))!;
    expect(openPick(s, ch.uid, wrong.id, rnd)).toBe('wrong');
    const r = openPick(s, ch.uid, choices[0].id, rnd) as { id: string; rar: number };
    expect(r.id).toBe(choices[0].id); expect(r.rar).toBe(4); expect(ch.qty).toBe(1); expect(s.inventory.some(i => i.id === choices[0].id)).toBe(true);
  });
  it('closed to players until the director opens it (the admin can try it)', () => {
    const s = rich(), ctx = { now: Date.now(), rnd, admin: false };
    if (!WHEEL_OPEN) expect((handlers.wheelSpin(s, { n: 1 }, ctx) as { refused?: string }).refused).toBe('closed');
    expect((handlers.wheelSpin(s, { n: 1 }, { ...ctx, admin: true }) as { prizes?: unknown[] }).prizes?.length).toBe(1);
  });
});
