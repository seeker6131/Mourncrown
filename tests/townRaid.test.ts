import { describe, it, expect } from 'vitest';
import { MapSim, type Grid, type SimPlayer } from '../src/server/mapSim';
import { RAID, RAID_LAND } from '../src/world/stages';
import { raidCount, RAID_SECS, raidChest, RAID_W, RAID_H } from '../src/systems/townRaid';
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
  it('nobody defends: monsters come in waves (15 for one hero), break buildings, it ends in 3 minutes', () => {
    const sim = new MapSim('m' + RAID, grid(), rnd), at = 1_000_000;
    const me: SimPlayer = { id: 'a', x: 1500, y: 1000, hp: 100, lv: 30 };   // (far in a corner)
    sim.startRaid(at, [me]); run(sim, at, RAID_SECS + 1, [me]);
    const r = sim.raid!;
    expect(r.total).toBe(raidCount(1)); expect(r.spawned).toBe(r.total); expect(r.done).toBe(true); expect(r.won).toBe(false);
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
  it('more defenders: more monsters (up to 80); hero-hunters go for the heroes', () => {
    expect(raidCount(1)).toBe(15); expect(raidCount(5)).toBe(51); expect(raidCount(20)).toBe(78);
    const sim = new MapSim('m' + RAID, grid(), rnd), at = 1_000_000;
    const ps: SimPlayer[] = [0, 1, 2].map(i => ({ id: 'p' + i, x: 760 + i * 10, y: 590, hp: 100, lv: 20 }));
    sim.startRaid(at, ps); const hits = run(sim, at, 40, ps);
    expect(sim.raid!.total).toBe(raidCount(3)); expect(hits.length).toBeGreaterThan(0);
    expect([...sim.mons.values()].every(m => RAID_LAND.mobs.includes(m.mob) && !m.boss)).toBe(true);   // small monsters only, no bosses
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
