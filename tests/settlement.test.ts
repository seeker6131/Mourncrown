import { describe, it, expect } from 'vitest';
import { startNewGame } from '../src/core/save';
import { build, upgrade, craft, buildingAt, cook, tick, collect } from '../src/systems/settlement';
import { addItem, equip, dismantle, countItem } from '../src/systems/inventory';
import { derive, gainExp, upSkill, skillMult } from '../src/systems/stats';
import { invSize } from '../src/core/state';
import { makeGear } from '../src/systems/loot';

const rich = () => { const s = startNewGame(); s.gold = 99999; s.res = { wood: 9999, stone: 9999, food: 9999 }; return s; };

describe('village', () => {
  it('builds one of each type on unlocked plots', () => {
    const s = rich();
    expect(build(s, 0, 'warehouse')).toBe(true);
    expect(build(s, 1, 'warehouse')).toBe(false);
    expect(build(s, 5, 'forge')).toBe(false); // locked until the boss is beaten
    s.bossDefeated = 1;
    expect(build(s, 5, 'forge')).toBe(true);
  });
  it('warehouse grows the bag', () => {
    const s = rich();
    const base = invSize(s);
    build(s, 0, 'warehouse');
    expect(invSize(s)).toBe(base + 5);
  });
  it('upgrades need monster materials', () => {
    const s = rich();
    build(s, 0, 'forge');
    expect(upgrade(s, 0)).toBe(false); // needs slime gel
    addItem(s, 'slime_gel', 10);
    expect(upgrade(s, 0)).toBe(true);
    expect(buildingAt(s, 0)!.level).toBe(2);
  });
  it('forge crafts gear', () => {
    const s = rich();
    expect(craft(s, 'weapon').ok).toBe(false);
    build(s, 0, 'forge');
    addItem(s, 'mana_shard', 5);
    expect(craft(s, 'weapon', () => 0.4).ok).toBe(true);
  });
  it('kitchen buff raises atk', () => {
    const s = rich();
    const a = derive(s).atk;
    build(s, 1, 'kitchen');
    expect(cook(s, 'hunter_stew')).toBe('no_kitchen'); // still under construction
    s.buildings[0].done = 0;
    expect(cook(s, 'hunter_stew')).toBe('ok');
    expect(derive(s).atk).toBeGreaterThan(a);
  });
});

describe('village production', () => {
  it('lumber produces wood after construction, market produces gold', () => {
    const s = rich(); const t0 = 1_000_000;
    build(s, 0, 'lumber', t0); build(s, 1, 'market', t0);
    tick(s, t0 + 10_000); expect(s.buildings[0].stored).toBe(0); // scaffolding: no output yet
    for (const b of s.buildings) b.done = 0;
    tick(s, t0 + 10 * 60_000);
    expect(s.buildings[0].stored).toBeGreaterThan(5);
    const g = s.gold; expect(collect(s, 1)?.res).toBe('gold'); expect(s.gold).toBeGreaterThan(g);
  });
});

describe('levels matter', () => {
  it('no level requirement: a level 1 hero can wear SL gear', () => {
    const s = startNewGame();
    addItem(s, 'oblivion_blade', 1, 0, makeGear(Math.random, 'oblivion_blade'));
    expect(equip(s, s.inventory[s.inventory.length - 1].uid)).toBe(true);
  });
  it('level up gives skill points that power up skills', () => {
    const s = startNewGame();
    gainExp(s, 1000);
    expect(s.skillPts).toBeGreaterThan(0);
    expect(upSkill(s, 'flame')).toBe(true);
    expect(skillMult(s, 'flame')).toBeCloseTo(1.15);
  });
  it('dismantle gives shards and cores for rare gear', () => {
    const s = startNewGame();
    addItem(s, 'flame_saber', 1, 0, makeGear(Math.random, 'flame_saber'));
    const r = dismantle(s, s.inventory[s.inventory.length - 1].uid)!;
    expect(r.cores).toBe(1);
    expect(countItem(s, 'ancient_core')).toBe(1);
  });
});

import { advanceClass, currentSkills, nextForm } from '../src/systems/stats';
describe('classes', () => {
  it('villager -> class at Lv10 -> next forms at Lv40/80', () => {
    const s = startNewGame();
    expect(currentSkills(s)).toEqual(['v_bash']);
    expect(advanceClass(s, 'archer')).toBe(false);
    s.level = 10;
    expect(advanceClass(s, 'archer')).toBe(true);
    expect(s.tier).toBe(1);
    expect(currentSkills(s)).toContain('a2_fan');
    expect(nextForm(s)).toBeNull();
    s.level = 40;
    expect(advanceClass(s)).toBe(true);
    expect(s.tier).toBe(2);
    expect(currentSkills(s)).toContain('a3_rain');
    expect(currentSkills(s)).not.toContain('a2_fan');
  });
  it('class bonus raises power', () => {
    const s = startNewGame(); s.level = 10;
    const a = derive(s).matk;
    advanceClass(s, 'mage');
    expect(derive(s).matk).toBeGreaterThan(a);
  });
});

import { CLASSES } from '../src/data/classes';
import { SKILL_BY_ID } from '../src/data/skills';
describe('skills are unique per form', () => {
  it('no skill repeats across any form, all exist, swordsman has no ranged skills', () => {
    const all: string[] = [];
    for (const c of Object.values(CLASSES)) for (const t of c.skills) all.push(...t);
    expect(new Set(all).size).toBe(all.length);
    for (const id of all) expect(SKILL_BY_ID[id]).toBeTruthy();
    for (const id of CLASSES.sword.skills.flat()) expect(['shot', 'pierce', 'nova']).not.toContain(SKILL_BY_ID[id].kind);
    for (const id of CLASSES.sword.skills.flat()) expect(SKILL_BY_ID[id].stat).toBe('atk');
  });
});

import { ensureDaily, dailyProgress } from '../src/systems/daily';
describe('daily tasks', () => {
  it('three distinct tasks per day that pay out once', () => {
    const s = startNewGame();
    const now = Date.UTC(2026, 10, 6, 12);
    const d = ensureDaily(s, now);
    expect(d.tasks.length).toBe(3);
    expect(new Set(d.tasks.map(t => t.kind)).size).toBe(3);
    const t = d.tasks[0];
    const g = s.gold;
    dailyProgress(s, t.kind, t.need + 5, now);
    expect(t.done).toBe(true);
    expect(s.gold).toBe(g + t.gold);
    dailyProgress(s, t.kind, 10, now);
    expect(s.gold).toBe(g + t.gold);
  });
});

describe('skill points (director: nobody loses points; more ways to earn them)', () => {
  it('a new form gives back every point spent on the old skills', async () => {
    const { startNewGame } = await import('../src/core/save');
    const { advanceClass, upSkill, currentSkills } = await import('../src/systems/stats');
    const s = startNewGame(); s.level = 10; s.skillPts = 5;
    const id = currentSkills(s)[0]; expect(upSkill(s, id)).toBe(true); expect(upSkill(s, id)).toBe(true); expect(upSkill(s, id)).toBe(true);
    expect(s.skillPts).toBe(2);
    expect(advanceClass(s, 'sword')).toBe(true);
    expect(s.skillPts).toBe(5); expect(s.skillLv).toEqual({});
  });
  it('the first kill of a map boss, every 4th main quest and every 7th login give a point', async () => {
    const { startNewGame } = await import('../src/core/save');
    const { handlers, useMem, newMem } = await import('../src/server/handlers');
    const s = startNewGame(); useMem(newMem()); const c = { now: Date.UTC(2026, 10, 13, 12), rnd: () => 0.5 };
    // 7 daily logins
    let pts = s.skillPts;
    for (let d = 0; d < 7; d++) { const r = handlers.loginClaim(s, {}, { ...c, now: c.now + d * 86400000 }) as { skillPt?: number }; if (d < 6) expect(r.skillPt).toBe(0); else expect(r.skillPt).toBe(1); }
    expect(s.skillPts).toBe(pts + 1);
  });
});

describe('the home village stands on the server too (its NPC buildings used to exist on the device only)', () => {
  it('a fresh hero gets every NPC building at its plot, once; the home plot stays free for the player', async () => {
    const { ensureHomeVillage, VILLAGE_PLOT_OF, VILLAGE_HOME_PLOT } = await import('../src/systems/settlement');
    const { NPC_BUILDINGS } = await import('../src/data/buildings');
    const { startNewGame } = await import('../src/core/save');
    const s = startNewGame(); s.buildings = [];
    expect(ensureHomeVillage(s)).toBe(true);
    for (const t of NPC_BUILDINGS) expect(s.buildings.find(b => b.type === t)?.plot).toBe(VILLAGE_PLOT_OF[t]);
    expect(s.buildings.some(b => b.plot === VILLAGE_HOME_PLOT)).toBe(false);
    expect(ensureHomeVillage(s)).toBe(false);   // (nothing more the second time)
  });
});
