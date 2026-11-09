import { describe, it, expect, beforeEach } from 'vitest';
import { startNewGame } from '../src/core/save';
import { handlers } from '../src/server/handlers';
import { WILD, STAGES } from '../src/world/stages';
import type { GameState } from '../src/core/state';

let s: GameState; let t = 1_800_000_000_000;
const c = () => ({ now: (t += 1000), rnd: () => 0.5 });
beforeEach(() => { s = startNewGame(); handlers.enterMap(s, { n: 0 }, c()); });
const deerB = { kind: 'deer' as const, key: 'mo16', name: 'กวางป่า', size: 48, boss: false };
const sp = <T extends { key: string; boss: boolean }>(m: T) => ({ ...m, sid: handlers.spawn(s, { key: m.key, boss: m.boss }, c()).sid });

describe('server checks', () => {
  it('refuses a map above your level', () => {
    expect(handlers.enterMap(s, { n: 30 }, c())).toEqual({ refused: 'level' });
  });
  it('monsters only count on their own map; animals only in the Deepwild', () => {
    handlers.enterMap(s, { n: 1 }, c());
    expect(handlers.kill(s, sp(deerB), c())).toEqual({ refused: 'kind' });
    const other = STAGES[20].land.mobs[0];
    expect(handlers.kill(s, sp({ kind: other.kind, key: other.key, name: other.name, size: other.size, boss: false }), c())).toEqual({ refused: 'kind' });
    const mine = STAGES[0].land.mobs[0];
    expect('gold' in handlers.kill(s, sp({ kind: mine.kind, key: mine.key, name: mine.name, size: mine.size, boss: false }), c())).toBe(true);
    // a kill without a live spawn id (replayed / invented) is refused
    expect(handlers.kill(s, { sid: 999999, kind: mine.kind, key: mine.key, name: mine.name, size: mine.size, boss: false }, c())).toEqual({ refused: 'spawn' });
    handlers.enterMap(s, { n: WILD }, c());
    const r = handlers.kill(s, sp(deerB), c()); expect('food' in r && r.food > 0).toBe(true);
  });
  it('gathering only works in the Deepwild and a node runs dry', () => {
    expect(handlers.gather(s, { node: 1, kind: 'stone', pit: 0 }, c())).toEqual({ refused: 'map' });
    handlers.enterMap(s, { n: WILD }, c());
    for (let i = 0; i < 4; i++) expect('refused' in handlers.gather(s, { node: 1, kind: 'stone', pit: 0 }, c())).toBe(false);
    expect(handlers.gather(s, { node: 1, kind: 'stone', pit: 0 }, c())).toEqual({ refused: 'empty' });
  });
  it('the client cannot pick the ore: a locked pit stays locked', () => {
    handlers.enterMap(s, { n: WILD }, c());
    expect((handlers.gather(s, { node: 9, kind: 'stone', pit: 4, rare: true }, c()) as { refused?: string }).refused).toBe('level');
  });
  it('too many hits per second are refused', () => {
    handlers.enterMap(s, { n: WILD }, c());
    const now = t; const r = [0, 1, 2, 3, 4].map(i => handlers.gather(s, { node: 100 + i, kind: 'wood', pit: -1 }, { now, rnd: () => 0.5 }));
    expect(r.some(x => 'refused' in x && x.refused === 'rate')).toBe(true);
  });
  it('shop: only stock items, gold checked', () => {
    expect(handlers.shopBuy(s, { id: 'flame_saber' }, c())).toEqual({ refused: 'item' });
    s.gold = 0; expect(handlers.shopBuy(s, { id: 'hp_potion' }, c())).toEqual({ refused: 'gold' });
  });
  it('Deepwild rooms hold 100 players', () => {
    const r = handlers.wildRooms(s, {}, c());
    expect(r.cap).toBe(100); expect(r.rooms.every(q => q.count <= 100)).toBe(true);
  });
});

describe('daily dungeon', () => {
  const D = 200;
  it('2 runs a day, land must match your level', () => {
    expect(handlers.enterMap(s, { n: D + 3 }, c())).toEqual({ refused: 'level' });
    expect(handlers.enterMap(s, { n: D }, c())).toEqual({ ok: true });
    expect(handlers.enterMap(s, { n: D }, c())).toEqual({ ok: true });
    expect(handlers.enterMap(s, { n: D }, c())).toEqual({ refused: 'runs' });
  });
  it('the chest opens only after every wave died', async () => {
    const { LANDS, DUNGEON_WAVES } = await import('../src/world/stages');
    handlers.enterMap(s, { n: D }, c());
    expect(handlers.dungeonClear(s, {}, c())).toEqual({ refused: 'waves' });
    const L = LANDS[0], mobs = DUNGEON_WAVES.reduce((a, b) => a + b, 0);
    for (let i = 0; i < mobs; i++) { const m = L.mobs[i % L.mobs.length]; handlers.kill(s, sp({ kind: m.kind, key: m.key, name: m.name, size: m.size, boss: false }), c()); }
    handlers.kill(s, sp({ kind: L.boss.kind, key: L.boss.key, name: L.boss.name, size: L.boss.size, boss: true }), c());
    const r = handlers.dungeonClear(s, {}, c()) as { gear: { set?: string }[] };
    expect(r.gear.length).toBeGreaterThan(0); expect(r.gear[0].set).toBe('root');
    expect(handlers.dungeonClear(s, {}, c())).toEqual({ refused: 'map' });   // only once
  });
});

describe('loot on the ground', () => {
  it('drops wait on the ground, first pickup wins, SL is announced', () => {
    handlers.enterMap(s, { n: 1 }, c());
    const bs = STAGES[0].land.mobs[0];
    let drops: { did: number; id: string }[] = [];
    for (let i = 0; i < 300 && !drops.length; i++) { const r = handlers.kill(s, sp({ kind: bs.kind, key: bs.key, name: bs.name, size: bs.size, boss: false }), { now: (t += 1000), rnd: Math.random }); if ('drops' in r) drops = r.drops; }
    expect(drops.length).toBeGreaterThan(0);
    const before = s.inventory.length, d = drops[0];
    expect(s.inventory.length).toBe(before);                            // nothing in the bag yet
    const p = handlers.pickup(s, { did: d.did }, c());
    expect('id' in p && p.id).toBe(d.id);
    expect(handlers.pickup(s, { did: d.did }, c())).toEqual({ refused: 'gone' });   // already taken
  });
  it('drops vanish after 60 s', () => {
    handlers.enterMap(s, { n: 1 }, c());
    const bs = STAGES[0].land.mobs[0]; let did = 0;
    for (let i = 0; i < 300 && !did; i++) { const r = handlers.kill(s, sp({ kind: bs.kind, key: bs.key, name: bs.name, size: bs.size, boss: false }), { now: (t += 1000), rnd: Math.random }); if ('drops' in r && r.drops.length) did = r.drops[0].did; }
    t += 61000; expect(handlers.pickup(s, { did }, c())).toEqual({ refused: 'gone' });
  });
});
