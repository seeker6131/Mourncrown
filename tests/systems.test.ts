import { describe, it, expect, beforeEach } from 'vitest';
import { startNewGame } from '../src/core/save';
import { derive, gainExp, expToNext, calcDamage } from '../src/systems/stats';
import { makeGear, rollRarity } from '../src/systems/loot';
import { addItem, countItem, equip, tryUpgrade, useItem, removeItem } from '../src/systems/inventory';
import { acceptQuest, onKill, completeQuest, nextAvailable, refreshCollect } from '../src/systems/quests';
import type { GameState } from '../src/core/state';

let s: GameState;
beforeEach(() => { s = startNewGame(); });

describe('progression', () => {
  it('starts with equipped gear and full vitals', () => {
    expect(s.equip.weapon).not.toBeNull();
    const d = derive(s);
    expect(s.hp).toBe(d.maxHp);
  });
  it('levels up and raises base power', () => {
    const before = derive(s).maxHp;
    const gained = gainExp(s, expToNext(1) + expToNext(2));
    expect(gained).toBe(2);
    expect(s.level).toBe(3);
    expect(derive(s).maxHp).toBeGreaterThan(before);
  });
  it('rarer gear is stronger and has more affixes', () => {
    const common = makeGear(() => 0.5, 'iron_sword', 0);
    const legend = makeGear(() => 0.5, 'iron_sword', 4);
    expect(common.aff!.length).toBe(0);
    expect(legend.aff!.length).toBe(4);
    s.level = 5;
    addItem(s, 'iron_sword', 1, 0, common); equip(s, s.inventory[s.inventory.length - 1].uid);
    const p1 = derive(s).power;
    addItem(s, 'iron_sword', 1, 0, legend); equip(s, s.inventory[s.inventory.length - 1].uid);
    expect(derive(s).power).toBeGreaterThan(p1);
  });
  it('rarity roll respects floor and magic find', () => {
    expect(rollRarity(() => 0, 0, 3)).toBeGreaterThanOrEqual(3);
    let hi = 0; let r = 1; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 2000; i++) if (rollRarity(rnd, 200) >= 2) hi++;
    expect(hi).toBeGreaterThan(100);
  });
  it('damage respects defence and crit', () => {
    const fixed = () => 0.5;
    const a = calcDamage(100, 0, 1, 0, fixed).dmg;
    const b = calcDamage(100, 50, 1, 0, fixed).dmg;
    expect(b).toBeLessThan(a);
    const c = calcDamage(100, 0, 1, 1, fixed);
    expect(c.crit).toBe(true);
  });
});

describe('inventory', () => {
  it('stacks consumables', () => {
    addItem(s, 'hp_potion', 3);
    expect(countItem(s, 'hp_potion')).toBe(8);
    expect(s.inventory.filter(i => i.id === 'hp_potion').length).toBe(1);
  });
  it('equipping iron sword raises atk', () => {
    const before = derive(s).atk;
    addItem(s, 'iron_sword'); s.level = 5;
    equip(s, s.inventory[s.inventory.length - 1].uid);
    expect(derive(s).atk).toBeGreaterThan(before);
  });
  it('upgrade consumes gold and shards', () => {
    s.gold = 10000; addItem(s, 'mana_shard', 5);
    const uid = s.equip.weapon!;
    expect(tryUpgrade(s, uid, () => 0)).toBe('ok');
    expect(s.inventory.find(i => i.uid === uid)!.upg).toBe(1);
    expect(countItem(s, 'mana_shard')).toBe(4);
  });
  it('potion heals', () => {
    s.hp = 10;
    const pot = s.inventory.find(i => i.id === 'hp_potion')!;
    const r = useItem(s, pot.uid)!;
    expect(r.heal).toBeGreaterThan(0);
    expect(countItem(s, 'hp_potion')).toBe(4);
  });
});

describe('quests', () => {
  it('kill quest flow', () => {
    const q = nextAvailable(s, 'elder')!;
    expect(q.id).toBe('q_slime');
    acceptQuest(s, q.id);
    for (let i = 0; i < 8; i++) onKill(s, 'slime');
    expect(s.quests[0].status).toBe('ready');
    const gold = s.gold;
    expect(completeQuest(s, q.id)).toBeGreaterThanOrEqual(0);
    expect(s.gold).toBeGreaterThan(gold);
    expect(nextAvailable(s, 'elder')!.id).toBe('q_spore');
  });
  it('collect quest consumes items', () => {
    acceptQuest(s, 'q_spore');
    addItem(s, 'spore_cap', 5);
    refreshCollect(s);
    expect(s.quests[0].status).toBe('ready');
    completeQuest(s, 'q_spore');
    expect(countItem(s, 'spore_cap')).toBe(0);
    expect(removeItem(s, 'spore_cap', 1)).toBe(false);
  });
});

import { applyKill } from '../src/systems/rewards';
import { STAGES } from '../src/world/stages';
describe('top-down kill rewards (server-side candidate)', () => {
  it('is deterministic for the same rnd and always gives materials', () => {
    const seq = () => { let x = 7; return () => (x = (x * 16807) % 2147483647) / 2147483647; };
    const a = startNewGame(), b = startNewGame();
    const mon = STAGES[0].land.mobs[0];
    const ra = applyKill(a, 1, mon, false, false, seq()), rb = applyKill(b, 1, mon, false, false, seq());
    expect(ra).toEqual(rb);
    expect(ra.wood).toBeGreaterThan(0); expect(ra.food).toBeGreaterThan(0);
    expect(a.res.wood).toBe(ra.wood); expect(a.gold).toBe(50 + ra.gold);
  });
  it('a boss gives 3 gear drops, counts the boss and clears the stage', () => {
    const s = startNewGame();
    const r = applyKill(s, 10, STAGES[9].land.boss, true, true);
    expect(r.gear.length).toBe(3); expect(s.bossDefeated).toBe(1); expect(r.cleared).toBe(true);
    expect((s as unknown as { tdCleared: number }).tdCleared).toBe(10);
  });
});
