// Economy guard: a full day of 24 h auto play must not flood the game with resources or gold.
import { describe, it, expect } from 'vitest';
import { startNewGame } from '../src/core/save';
import { handlers } from '../src/server/handlers';
import { applyKill } from '../src/systems/rewards';
import { STAGES, WILD } from '../src/world/stages';
import { BUILDINGS, type BuildingId } from '../src/data/buildings';
import { resCap } from '../src/systems/economy';

const day0 = Date.UTC(2026, 10, 9, 17, 0, 1);   // just after midnight, Thai time (the game's day)
describe('no inflation', () => {
  it('a day of non-stop gathering yields a bounded amount', () => {
    const s = startNewGame(); s.level = 30; s.res.wood = s.res.stone = 0;
    let t = day0; const c = () => ({ now: (t += 900), rnd: Math.random });
    handlers.enterMap(s, { n: WILD }, c());
    for (let i = 0; i < 90000; i++) handlers.gather(s, { node: i % 400, kind: i % 2 ? 'wood' : 'stone', pit: -1 }, c());   // ~22 h of hits
    const got = s.res.wood + s.res.stone;
    console.log('gathered in a day (Lv30):', got);
    expect(got).toBeLessThan(3600);   // (15 Nov: energy comes back +60 an hour — while tired that is a quarter yield, so only ~+25% a day)
  });
  it('maxing every building takes weeks, not hours', () => {
    let wood = 0, stone = 0, gold = 0;
    for (const id of Object.keys(BUILDINGS) as BuildingId[]) for (const c of BUILDINGS[id].costs) { wood += c.wood ?? 0; stone += c.stone ?? 0; gold += c.gold ?? 0; }
    const perDay = 3000 / 2;   // ≤ ~1,500 of each resource a day from gathering (see above) + some from production
    console.log('all buildings:', { wood, stone, gold }, 'days of wood ≈', (wood / perDay).toFixed(1));
    expect(wood / perDay).toBeGreaterThan(14);
  });
  it('monster gold for a day of auto farming stays in the range of what upgrades cost', () => {
    const s = startNewGame(); s.level = 50; const g0 = s.gold;
    for (let i = 0; i < 1300 * 24; i++) applyKill(s, 25, STAGES[24].land.mobs[0], false, false, Math.random, false, () => true);
    const perDay = s.gold - g0;
    console.log('monster gold per 24 h auto (Lv50, map 25):', perDay);
    expect(perDay).toBeLessThan(250000);
  });
  it('selling a day of loot to NPCs does not flood gold either', async () => {
    const { sellPrice } = await import('../src/systems/inventory');
    const s = startNewGame(); s.level = 50; let sell = 0;
    for (let i = 0; i < 1300 * 24; i++) applyKill(s, 25, STAGES[24].land.mobs[0], false, false, Math.random, false, (id, q, g) => { sell += sellPrice({ uid: 0, id, qty: q, upg: 0, ...(g ?? {}) }) * q; return true; });
    console.log('NPC sell value of a day of loot:', sell);
    expect(sell).toBeLessThan(500000);
  });
  it('resources stop at the warehouse cap', () => {
    const s = startNewGame(); s.res.wood = 999999; handlers.enterMap(s, { n: 0 }, { now: day0, rnd: Math.random });
    expect(s.res.wood).toBe(resCap(s));
  });
});

import { energy, energyLeft, restoreEnergy, BED_REGEN } from '../src/systems/economy';
import { useItem, addItem } from '../src/systems/inventory';
import { describe as d2, it as it2, expect as ex2 } from 'vitest';
d2('⚡ energy comes back (player feedback 15 Nov)', () => {
  it2('by itself every hour, a stamina tonic 3 a day, the bed faster', () => {
    const s = startNewGame(), t0 = Date.UTC(2026, 10, 16, 3);
    energy(s, t0).gather = 1200; ex2(energyLeft(s, t0)).toBe(0);
    ex2(energyLeft(s, t0 + 3600000)).toBe(60);
    addItem(s, 'tonic_stamina', 5);
    for (let i = 0; i < 3; i++) { const it = s.inventory.find(q => q.id === 'tonic_stamina')!; ex2((useItem(s, it.uid, t0 + 3600000) as { stamina?: number }).stamina).toBeGreaterThan(0); }
    const it = s.inventory.find(q => q.id === 'tonic_stamina')!; ex2((useItem(s, it.uid, t0 + 3600000) as { tired?: string }).tired).toBe('day');
    ex2(s.inventory.find(q => q.id === 'tonic_stamina')!.qty).toBe(2);
    energy(s, t0 + 3600000).gather = 1200; restoreEnergy(s, 8 * BED_REGEN, 0, t0 + 3600000); ex2(energyLeft(s, t0 + 3600000)).toBe(960);
  });
});
