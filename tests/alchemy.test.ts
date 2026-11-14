import { describe, it, expect, beforeEach } from 'vitest';
import { startNewGame } from '../src/core/save';
import { derive } from '../src/systems/stats';
import { addItem, countItem, useItem } from '../src/systems/inventory';
import { gatherReward, brew, activeElixir } from '../src/systems/alchemy';
import { applyKill } from '../src/systems/rewards';
import { WILD, PITS } from '../src/world/stages';
import { RECIPES } from '../src/data/alchemy';
import { itemDef } from '../src/data/items';
import type { GameState } from '../src/core/state';

let s: GameState;
beforeEach(() => { s = startNewGame(); });
const seq = (...v: number[]) => { let i = 0; return () => v[i++ % v.length]; };

describe('Deepwild gathering', () => {
  it('ores only come from Deepwild pit rocks', () => {
    gatherReward(s, 'stone', 5, null, () => 0);            // a rock on a monster map: stone only
    expect(countItem(s, 'ore_iron')).toBe(0);
    const r = gatherReward(s, 'stone', WILD, { ore: 'ore_iron', gem: 'gem_emerald', req: 1 }, seq(0.1, 0.1, 0.5, 0.9, 0.9));
    expect(r.ore).toBe('ore_iron'); expect(countItem(s, 'ore_iron')).toBeGreaterThan(0);
  });
  it('a pit above your level cannot be mined', () => {
    const v = { ore: 'ore_silver', gem: 'gem_soul', req: PITS[1].req };
    const r = gatherReward(s, 'stone', WILD, v, () => 0);
    expect(r.low).toBe(20); expect(countItem(s, 'ore_silver')).toBe(0);
  });
  it('rare gems are rare: ~1.5% per hit on a glowing vein (behind the scenes)', () => {
    let gems = 0; const N = 20000;
    for (let i = 0; i < N; i++) { const t = startNewGame(); const r = gatherReward(t, 'stone', WILD, { ore: 'ore_iron', gem: 'gem_emerald', req: 1, rare: true }); if (r.gem) gems++; }
    expect(gems / N).toBeGreaterThan(0.01); expect(gems / N).toBeLessThan(0.02);
  });
  it('animals in the Deepwild give meat scaled to the hero', () => {
    const r = applyKill(s, WILD, { key: 'mo16', kind: 'deer', name: 'กวางป่า', size: 48 }, false, false, () => 0.5);
    expect(r.food).toBeGreaterThan(0); expect(r.gold).toBe(0);
  });
});

describe('alchemy', () => {
  it('brews at the kitchen from ore and gives a timed elixir', () => {
    s.buildings.push({ type: 'kitchen', level: 2, plot: 9, stored: 0 } as never);
    s.gold = 1000; s.res.food = 50; addItem(s, 'ore_iron', 16); addItem(s, 'gem_emerald', 1);
    expect(brew(s, 'elix_emerald')).toBe('ok');
    expect(countItem(s, 'gem_emerald')).toBe(0); expect(countItem(s, 'ore_iron')).toBe(6);
    const atk0 = derive(s).atk;
    const it = s.inventory.find(i => i.id === 'elix_emerald')!;
    useItem(s, it.uid);
    expect(activeElixir(s)).not.toBeNull();
    expect(derive(s).atk).toBeGreaterThanOrEqual(Math.floor(atk0 * 1.4));
  });
  it('fails without ore or kitchen', () => {
    expect(brew(s, 'elix_iron')).toBe('kitchen');
  });
  it('every recipe uses real items', () => {
    for (const r of RECIPES) { expect(itemDef(r.out).elixir).toBeTruthy(); for (const id of Object.keys(r.need)) expect(itemDef(id).type).toBe('material'); }
  });
});
