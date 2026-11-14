import { describe, it, expect } from 'vitest';
import { MapSim, type Grid, type SimPlayer } from '../src/server/mapSim';
import { RAID, RAID_LAND } from '../src/world/stages';
import { raidTotal, RAID_SECS, raidChest, RAID_W, RAID_H, RAID_ALIVE_MAX, raidWaveHp, raidAtk, raidHpMult, RAID_EXP_MULT, nextRaid } from '../src/systems/townRaid';
import { STAGES } from '../src/world/stages';
import { handlers, useMem, newMem } from '../src/server/handlers';
import { startNewGame } from '../src/core/save';
import { addItem } from '../src/systems/inventory';

const grid = (): Grid => ({ w: RAID_W / 8, h: RAID_H / 8, c: 8, bits: new Uint8Array(Math.ceil(RAID_W / 8 * RAID_H / 8 / 8)), clear: [], gate: { x: 0, y: 0 } });
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const run = (sim: MapSim, from: number, secs: number, players: SimPlayer[], each?: (now: number) => void) => {
  const atk: string[] = [];
  for (let t = from; t <= from + secs * 1000; t += 200) { const ev = sim.run(t, players); for (const a of ev.atk) atk.push(a.to); each?.(t); if (sim.raid?.done) break; }
  return atk;
};

describe('⚔ village raid (the room runs it)', () => {
  it('nobody defends: waves pile up (never more than the cap on the map), buildings break, it ends on time', () => {
    const sim = new MapSim('m' + RAID, grid(), rnd), at = 1_000_000;
    const me: SimPlayer = { id: 'a', x: 1500, y: 1000, hp: 100, lv: 30 };   // (far in a corner)
    sim.startRaid(at, [me]); run(sim, at, RAID_SECS + 1, [me]);
    const r = sim.raid!;
    expect(r.total).toBe(600); expect(r.spawned).toBe(RAID_ALIVE_MAX); expect(r.done).toBe(true); expect(r.won).toBe(false);
    expect(r.blds.filter(b => b.hp <= 0).length).toBeGreaterThanOrEqual(1); expect(r.blds.reduce((a, b) => a + b.max - b.hp, 0)).toBeGreaterThan(r.blds[0].max * 2);   // an undefended village loses buildings
    expect(sim.mons.size).toBe(0);
  });
  it('every monster is killed as it comes: the village holds, nothing breaks, the kills are counted', () => {
    const sim = new MapSim('m' + RAID, grid(), rnd), at = 1_000_000, me: SimPlayer = { id: 'a', x: 768, y: 590, hp: 100, lv: 30 };
    sim.startRaid(at, [me]);
    run(sim, at, RAID_SECS + 1, [me], () => { for (const m of [...sim.mons.values()]) { if (m.alive) { sim.died(m.sid, 0, 1); sim.raidKill({ a: 1 }); } } });
    const r = sim.raid!;
    expect(r.done).toBe(true); expect(r.won).toBe(true); expect(r.blds.every(b => b.hp > 0)).toBe(true); expect(r.kills.a).toBe(r.total);
  });
  it('6 waves × 100, each tougher; hero-hunters go for the heroes', () => {
    expect(raidTotal()).toBe(600); expect(raidWaveHp(5)).toBeGreaterThan(raidWaveHp(0) * 2);
    const sim = new MapSim('m' + RAID, grid(), rnd), at = 1_000_000;
    const ps: SimPlayer[] = [0, 1, 2].map(i => ({ id: 'p' + i, x: 760 + i * 10, y: 590, hp: 100, lv: 20 }));
    sim.startRaid(at, ps); const hits = run(sim, at, 40, ps);
    expect(sim.raid!.total).toBe(600); expect(hits.length).toBeGreaterThan(0);
    expect([...sim.mons.values()].every(m => RAID_LAND.mobs.includes(m.mob) && !m.boss)).toBe(true);   // small monsters only, no bosses
  });
  it('a wave walks in 25 at a time, 2 seconds apart, each group from one edge', () => {
    const sim = new MapSim('m' + RAID, grid(), rnd), at = 1_000_000, me: SimPlayer = { id: 'a', x: 768, y: 590, hp: 100, lv: 20 };
    sim.startRaid(at, [me]);
    sim.run(at, [me]); expect(sim.mons.size).toBe(25);
    sim.run(at + 1000, [me]); expect(sim.mons.size).toBe(25);
    sim.run(at + 2000, [me]); expect(sim.mons.size).toBe(50);
    sim.run(at + 6000, [me]); expect(sim.mons.size).toBe(100);
  });
  it('one room for every level: monsters at the strongest hero\'s level, hitting harder each wave', () => {
    expect(raidAtk(90)).toBeGreaterThan(raidAtk(30) * 2); expect(raidAtk(50, 5)).toBeGreaterThan(raidAtk(50, 0) * 1.7);
    expect(raidHpMult(10)).toBeGreaterThanOrEqual(raidHpMult(1) * 4);
    const sim = new MapSim('m300', grid(), rnd), ps: SimPlayer[] = [{ id: 'a', x: 700, y: 590, hp: 100, lv: 12 }, { id: 'b', x: 760, y: 590, hp: 100, lv: 95 }];
    sim.startRaid(1_000_000, ps); expect(sim.raid!.lv).toBe(95);
  });
  it('raid kills give a quarter of the EXP of the same monster on your own map', () => {
    useMem(newMem()); const s = startNewGame(); s.level = 30; const c = { now: 5_000_000, rnd: () => 0.5, admin: true };
    const st = STAGES.find(q => q.level >= 30)!, m = st.land.mobs[0];
    handlers.enterMap(s, { n: st.n }, c); const sid1 = handlers.spawn(s, { key: m.key, boss: false }, c).sid;
    const e0 = s.exp; handlers.kill(s, { sid: sid1, kind: m.kind, key: m.key, name: m.name, size: m.size, boss: false }, c); const normal = s.exp - e0;
    handlers.enterMap(s, { n: RAID }, c); const sid2 = handlers.spawn(s, { key: m.key, boss: false }, c).sid;
    const e1 = s.exp; handlers.kill(s, { sid: sid2, kind: m.kind, key: m.key, name: m.name, size: m.size, boss: false }, c); const raid = s.exp - e1;
    expect(raid).toBeLessThanOrEqual(Math.ceil(normal * RAID_EXP_MULT * 1.6)); expect(raid).toBeGreaterThan(0);
  });
  it('⏰ 3 raids a day at 12:00 / 18:00 / 21:00 Thai time; a time the admin set comes first', () => {
    const th = (d: number, h: number, m = 0) => Date.UTC(2026, 10, d, h - 7, m);   // (Thai clock → ms)
    expect(nextRaid(th(14, 9)).at).toBe(th(14, 12));
    expect(nextRaid(th(14, 12, 3)).at).toBe(th(14, 12));   // (under way: still this one)
    expect(nextRaid(th(14, 12, 6)).at).toBe(th(14, 18));
    expect(nextRaid(th(14, 19)).at).toBe(th(14, 21));
    expect(nextRaid(th(14, 22)).at).toBe(th(15, 12));
    expect(nextRaid(th(15, 2)).at).toBe(th(15, 12));   // (after midnight)
    expect(nextRaid(th(14, 9), { at: th(14, 10) }).at).toBe(th(14, 10));
    expect(nextRaid(th(14, 11), { at: th(14, 10) }).at).toBe(th(14, 12));   // (an old one is ignored)
  });
  it('a fallen hero (hp 0) is left alone', () => {
    const sim = new MapSim('m' + RAID, grid(), rnd), at = 1_000_000, dead: SimPlayer = { id: 'd', x: 768, y: 590, hp: 0, lv: 20 };
    sim.startRaid(at, [dead]); expect(run(sim, at, 60, [dead])).toEqual([]);
  });
  it('the defender\'s chest: MVP twice, a lost raid half', () => {
    const a = raidChest(40, false, true), b = raidChest(40, true, true), c = raidChest(40, false, false);
    expect(b.gold).toBe(a.gold * 2); expect(c.gold).toBe(Math.round(a.gold / 2));
  });
  it('on the raid map: kills pay like a map of your level; healing potions are refused', () => {
    useMem(newMem()); const s = startNewGame(); s.level = 30; const c = { now: 5_000_000, rnd: () => 0.5, admin: true };
    expect(handlers.enterMap(s, { n: RAID }, c)).toEqual({ ok: true });
    const m = RAID_LAND.mobs[0], sid = handlers.spawn(s, { key: m.key, boss: false }, c).sid;
    const r = handlers.kill(s, { sid, kind: m.kind, key: m.key, name: m.name, size: m.size, boss: false }, c) as { exp: number };
    expect(r.exp).toBeGreaterThan(0);
    addItem(s, 'hp_potion_l', 2); const pot = s.inventory.find(i => i.id === 'hp_potion_l')!; s.hp = 1;
    expect(handlers.useItem(s, { uid: pot.uid }, c)).toBeNull();
  });
});
