import { describe, it, expect, beforeEach } from 'vitest';
import { startNewGame } from '../src/core/save';
import { handlers } from '../src/server/handlers';
import { WILD, STAGES } from '../src/world/stages';
import type { GameState } from '../src/core/state';

let s: GameState; let t = 1_800_000_000_000;
const c = () => ({ now: (t += 1000), rnd: () => 0.5 });
beforeEach(() => { s = startNewGame(); handlers.enterMap(s, { n: 0 }, c()); });
const deer = { kind: 'deer' as const, key: 'mo16', name: 'กวางป่า', size: 48, boss: false };

describe('server checks', () => {
  it('refuses a map above your level', () => {
    expect(handlers.enterMap(s, { n: 30 }, c())).toEqual({ refused: 'level' });
  });
  it('monsters only count on their own map; animals only in the Deepwild', () => {
    handlers.enterMap(s, { n: 1 }, c());
    expect(handlers.kill(s, deer, c())).toEqual({ refused: 'kind' });
    const other = STAGES[20].land.mobs[0];
    expect(handlers.kill(s, { kind: other.kind, key: other.key, name: other.name, size: other.size, boss: false }, c())).toEqual({ refused: 'kind' });
    const mine = STAGES[0].land.mobs[0];
    expect('gold' in handlers.kill(s, { kind: mine.kind, key: mine.key, name: mine.name, size: mine.size, boss: false }, c())).toBe(true);
    handlers.enterMap(s, { n: WILD }, c());
    const r = handlers.kill(s, deer, c()); expect('food' in r && r.food > 0).toBe(true);
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
