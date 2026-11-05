import { describe, it, expect, beforeEach } from 'vitest';
import { startNewGame } from '../src/core/save';
import { derive, gainExp, expToNext, allocate, calcDamage } from '../src/systems/stats';
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
  it('levels up and grants stat points', () => {
    const pts = s.statPoints;
    const gained = gainExp(s, expToNext(1) + expToNext(2));
    expect(gained).toBe(2);
    expect(s.level).toBe(3);
    expect(s.statPoints).toBe(pts + 8);
  });
  it('allocates stats and changes derived values', () => {
    const before = derive(s).atk;
    expect(allocate(s, 'str', 3)).toBe(true);
    expect(derive(s).atk).toBeGreaterThan(before);
    expect(allocate(s, 'str', 99)).toBe(false);
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
    addItem(s, 'iron_sword');
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
