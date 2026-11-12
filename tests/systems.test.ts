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
  it('each item has one fixed rarity; rarer items are stronger and have more affixes', () => {
    const common = makeGear(() => 0.5, 'wood_sword', 5), legend = makeGear(() => 0.5, 'dawn_blade', 0);
    expect(common.rar).toBe(0); expect(legend.rar).toBe(4);            // the asked rarity is ignored
    expect(common.aff!.length).toBe(0); expect(legend.aff!.length).toBe(4);
    const line = ['wood_sword', 'iron_sword', 'knight_blade', 'flame_saber', 'dawn_blade', 'oblivion_blade'];
    const pw = line.map(id => { const t = startNewGame(); addItem(t, id, 1, 0, makeGear(() => 0.5, id)); equip(t, t.inventory[t.inventory.length - 1].uid); return derive(t).atk; });
    for (let i = 1; i < pw.length; i++) expect(pw[i]).toBeGreaterThan(pw[i - 1]);
  });
  it('wrong class line gear works with reduced stats', () => {
    const a = startNewGame(), b = startNewGame(); a.cls = b.cls = 'sword';
    addItem(a, 'knight_blade', 1, 0, makeGear(() => 0.5, 'knight_blade')); equip(a, a.inventory[a.inventory.length - 1].uid);
    addItem(b, 'elven_bow', 1, 0, makeGear(() => 0.5, 'elven_bow')); equip(b, b.inventory[b.inventory.length - 1].uid);
    expect(derive(b).atk).toBeLessThan(derive(a).atk); expect(derive(b).atk).toBeGreaterThan(derive(startNewGame()).atk - 5);
  });
  it('rarity roll respects floor and magic find', () => {
    expect(rollRarity(() => 0, 0, 3)).toBeGreaterThanOrEqual(3);
    let r = 1; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
    // magic find helps
    const rare = (mf: number) => { let n = 0; for (let i = 0; i < 20000; i++) if (rollRarity(rnd, mf) >= 2) n++; return n; };
    expect(rare(200)).toBeGreaterThan(rare(0));
    // director: hard but not hopeless — last maps (floor Rare, MF 150): Legend ~1 in 150, SL ~1 in 12,000
    const N = 400000, cnt = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < N; i++) cnt[rollRarity(rnd, 150, 2)]++;
    expect(cnt[4] / N).toBeGreaterThan(0.004); expect(cnt[4] / N).toBeLessThan(0.01);
    expect(cnt[5] / N).toBeGreaterThan(0.00002); expect(cnt[5] / N).toBeLessThan(0.00025);
    // map 1: Rare or better ~1.5%
    let m1 = 0; for (let i = 0; i < 100000; i++) if (rollRarity(rnd, 3) >= 2) m1++;
    expect(m1 / 100000).toBeLessThan(0.025);
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
  it('is deterministic for the same rnd; monsters give gold + EXP, never resources', () => {
    const seq = () => { let x = 7; return () => (x = (x * 16807) % 2147483647) / 2147483647; };
    const a = startNewGame(), b = startNewGame();
    const mon = STAGES[0].land.mobs[0];
    const ra = applyKill(a, 1, mon, false, false, seq()), rb = applyKill(b, 1, mon, false, false, seq());
    expect(ra).toEqual(rb);
    expect(ra.wood).toBe(0); expect(ra.stone).toBe(0); expect(ra.food).toBe(0);
    expect(ra.gold).toBeGreaterThan(0); expect(ra.exp).toBeGreaterThan(0); expect(a.gold).toBe(50 + ra.gold);
  });
  it('a boss gives 3 gear drops, counts the boss and clears the stage', () => {
    const s = startNewGame();
    const r = applyKill(s, 10, STAGES[9].land.boss, true, true);
    expect(r.gear.length).toBe(3); expect(s.bossDefeated).toBe(1); expect(r.cleared).toBe(true);
    expect((s as unknown as { tdCleared: number }).tdCleared).toBe(10);
  });
});

import { tdQuest, claimTdQuest } from '../src/systems/tdQuests';
describe('top-down quest chain', () => {
  it('counts kills from when the quest started and pays once', () => {
    const s = startNewGame();
    (s as unknown as { tdKills: number }).tdKills = 3;
    expect(tdQuest(s)!.cur).toBe(0);
    (s as unknown as { tdKills: number }).tdKills = 8;
    expect(tdQuest(s)!.done).toBe(true);
    const g = s.gold; expect(claimTdQuest(s)!.id).toBe('q1'); expect(s.gold).toBe(g + 60);
    expect(claimTdQuest(s)).toBeNull();          // q2 (clear stage 1) not done yet
    expect(tdQuest(s)!.q.id).toBe('q2');
  });
});

import { giveTestKit } from '../src/systems/testKit';
describe('SL is the strongest rarity', () => {
  it('an SL weapon beats a Legend one of the same base by far', () => {
    let seed = 5; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const atkWith = (rar: number) => { const s = startNewGame(); s.cls = 'sword'; s.tier = 1; s.level = 20; addItem(s, 'flame_saber', 1, 0, makeGear(rnd, 'flame_saber', rar)); equip(s, s.inventory[s.inventory.length - 1].uid); return derive(s).atk; };
    const base = atkWith(0), legend = atkWith(4), sl = atkWith(5);
    expect(sl - base).toBeGreaterThan((legend - base) * 1.8);
  });
  it('the test kit equips a full SL set for the class', () => {
    const s = startNewGame(); s.cls = 'archer'; s.tier = 1;
    const got = giveTestKit(s);
    expect(got.length).toBe(3);
    expect(s.inventory.filter(i => i.rar === 5).length).toBe(3);
    expect(derive(s).atk).toBeGreaterThan(200);
  });
});

import { stageFood, eatSupplies, supplyPerHour, heroHungry, villageUpkeep, upkeepPerHour } from '../src/systems/supplies';
import { cook } from '../src/systems/settlement';
describe('food: supplies and village upkeep', () => {
  it('the hero eats every 5 minutes on monster maps: maps 1-2 free, far maps more', () => {
    expect(stageFood(1)).toBe(0); expect(stageFood(3)).toBe(1); expect(stageFood(10)).toBe(2); expect(stageFood(45)).toBe(5); expect(stageFood(50)).toBe(5);
    const s = startNewGame(); s.res.food = 100; const now = 1_000_000;
    expect(eatSupplies(s, 2, 3600000, now).ate).toBe(0);
    expect(eatSupplies(s, 25, 3600000, now)).toEqual({ ate: 36, hungry: false });   // 3 every 5 min
    expect(s.res.food).toBe(64);
  });
  it('out of food = hungry (weaker, less EXP) but never thrown out; food again = fed', () => {
    const s = startNewGame(); s.res.food = 2; const now = 1_000_000;
    const atk0 = derive(s).atk, exp0 = derive(s).expBonus;
    expect(eatSupplies(s, 40, 600000, now).hungry).toBe(true);   // needs 10, had 2
    expect(heroHungry(s)).toBe(true); expect(s.res.food).toBe(0);
    expect(derive(s).atk).toBeLessThan(atk0); expect(derive(s).expBonus).toBeLessThan(exp0);
    s.res.food = 50; expect(eatSupplies(s, 40, 60000, now).hungry).toBe(false);
    expect(derive(s).atk).toBe(atk0);
  });
  it('VIP eats 30% less (not free); a kitchen meal halves it', () => {
    const s = startNewGame(), now = 1_000_000;
    expect(supplyPerHour(s, 30, now)).toBe(48);
    (s as unknown as { vipUntil: number }).vipUntil = now + 1e9; expect(supplyPerHour(s, 30, now)).toBeCloseTo(33.6);
    (s as unknown as { vipUntil: number }).vipUntil = 0;
    s.buildings.push({ type: 'kitchen', level: 1 } as never); s.res.food = 999;
    expect(cook(s, 'hunter_stew', now)).toBe('ok'); expect(supplyPerHour(s, 30, now)).toBe(24);
  });
  it('villagers eat every hour and go hungry when the larder is empty', () => {
    const s = startNewGame(); s.res.food = 10; const t0 = 1_000_000;
    villageUpkeep(s, t0);
    expect(villageUpkeep(s, t0 + 3600000)).toBe(false);
    expect(s.res.food).toBe(10 - Math.floor(upkeepPerHour(s)));
    expect(villageUpkeep(s, t0 + 3600000 * 5)).toBe(true);
    expect(s.res.food).toBe(0);
  });
  it('wild animals give meat and no gold', () => {
    const s = startNewGame(); const g = s.gold;
    const r = applyKill(s, 5, { key: 'mo16', kind: 'deer', name: 'กวาง', size: 48 }, false, false);
    expect(r.food).toBeGreaterThan(0); expect(s.gold).toBe(g); expect(r.wood).toBe(0);
  });
});

import { sellUid, sellJunk } from '../src/systems/inventory';
describe('selling to the NPC', () => {
  it('removes the item and pays gold; stacks sell by quantity; equipped items are refused', () => {
    const s = startNewGame();
    addItem(s, 'hp_potion', 9); const pot = s.inventory.find(i => i.id === 'hp_potion')!;
    const before = pot.qty, g0 = s.gold;
    const got = sellUid(s, pot.uid, 3);
    expect(got).toBeGreaterThan(0); expect(s.gold).toBe(g0 + got);
    expect(s.inventory.find(i => i.uid === pot.uid)!.qty).toBe(before - 3);
    const eq = s.inventory.find(i => s.equip.weapon === i.uid)!;
    expect(sellUid(s, eq.uid, 1)).toBe(0); expect(s.inventory.includes(eq)).toBe(true);
    let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 4; i++) addItem(s, 'cloth_tunic', 1, 0, makeGear(rnd, 'cloth_tunic'));
    const r = sellJunk(s, 0);
    expect(r.count).toBeGreaterThanOrEqual(4); expect(s.inventory.filter(i => i.id === 'cloth_tunic' && s.equip.armor !== i.uid).length).toBe(0);
  });
});
