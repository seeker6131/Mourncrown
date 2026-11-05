import { describe, it, expect } from 'vitest';
import { startNewGame } from '../src/core/save';
import { build, upgrade, tick, collect, craft, buildingAt } from '../src/systems/settlement';
import { addItem } from '../src/systems/inventory';

describe('settlement', () => {
  it('builds, produces offline and collects', () => {
    const s = startNewGame();
    s.gold = 1000; s.res = { wood: 500, stone: 500, food: 500 };
    expect(build(s, 0, 'lumber', 0)).toBe(true);
    expect(build(s, 0, 'farm', 0)).toBe(false); // plot taken
    tick(s, 10 * 60000);
    const r = collect(s, 0)!;
    expect(r.res).toBe('wood');
    expect(r.amount).toBe(60);
    expect(upgrade(s, 0)).toBe(true);
    expect(buildingAt(s, 0)!.level).toBe(2);
  });
  it('cannot build without resources', () => {
    const s = startNewGame();
    s.gold = 0;
    expect(build(s, 1, 'quarry')).toBe(false);
  });
  it('forge crafts gear with guaranteed rarity at higher levels', () => {
    const s = startNewGame();
    s.gold = 99999; s.res = { wood: 9999, stone: 9999, food: 9999 };
    expect(craft(s, 'weapon').ok).toBe(false);
    build(s, 2, 'forge');
    for (let i = 0; i < 3; i++) upgrade(s, 2);
    addItem(s, 'mana_shard', 20);
    const r = craft(s, 'weapon', () => 0.4);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.rar).toBeGreaterThanOrEqual(2);
  });
});
