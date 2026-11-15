import { it, expect, vi, afterEach } from 'vitest';
import { Room } from '../server/worker';
import { brRound, BR_DC_MS } from '../src/systems/br';

// a fake Durable Object world: sockets, storage and the Player objects (only what the room asks for)
function world() {
  const socks: FakeWS[] = [], calls: { path: string; id: string; body: string }[] = [], store = new Map<string, unknown>();
  const state = { getWebSockets: (tag?: string) => socks.filter(w => !w.closed && (!tag || w.att?.id === tag)), acceptWebSocket() {}, waitUntil() {}, storage: { get: async (k: string) => store.get(k), put: async (k: string, v: unknown) => { store.set(k, JSON.parse(JSON.stringify(v))); }, setAlarm: async () => {} } };
  const stat = { pw: 3000, atk: 500, matk: 500, def: 100, hp: 6000, crit: 0, iv: 700, cls: 'sword', lv: 50 };
  const env = { PLAYER: { idFromName: (x: string) => x, get: (id: string) => ({ fetch: async (r: Request) => { const u = new URL(r.url); calls.push({ path: u.pathname, id, body: r.method === 'POST' ? await r.text() : '' }); return new Response(JSON.stringify(u.pathname === '/pvpstat' ? stat : { ok: 1 })); } }) }, ROOM: { idFromName: (x: string) => x, get: () => ({ fetch: async () => new Response('{}') }) } };
  return { socks, calls, store, room: new Room(state as never, env as never) };
}
class FakeWS { att: Record<string, unknown> | undefined; out: Record<string, unknown>[] = []; closed = false;
  send(t: string) { this.out.push(JSON.parse(t)); } serializeAttachment(a: Record<string, unknown>) { this.att = JSON.parse(JSON.stringify(a)); } deserializeAttachment() { return this.att; } close() { this.closed = true; }
  got(t: string) { return this.out.filter(m => m.t === t); } }
afterEach(() => vi.useRealTimers());

it('a whole team round on the server: teams, the fight, no friendly fire, a knock-out, the winners paid', async () => {
  const lobby = Date.UTC(2026, 10, 15, 13, 21); vi.useFakeTimers(); vi.setSystemTime(lobby);
  const R = brRound(lobby)!, room = `m400-${R.id}`, w = world();
  const join = (id: string, x: number) => { const s = new FakeWS(); s.att = { id, room, name: 'P' + id, n: 0, win: 0, chatT: 0, join: lobby - 60000, bud: 0, budT: lobby }; w.socks.push(s); return s; };
  const msg = (s: FakeWS, m: Record<string, unknown>) => { s.att!.n = 0; return w.room.webSocketMessage(s as never, JSON.stringify(m)); };
  const pos = (s: FakeWS, x: number, y: number) => msg(s, { t: 'p', x, y, d: 0, hp: 100, lv: 50 });
  const a = join('A', 100), b = join('B', 120), c = join('C', 140);
  for (const s of [a, b, c]) await pos(s, 500, 500);
  expect(a.got('bteams').length).toBe(1);
  await msg(a, { t: 'tcreate' }); await msg(b, { t: 'tjoin', tid: 'tA' });
  const teams = (c.got('bteams').slice(-1)[0]!.teams as { tid: string; m: { id: string }[] }[]); expect(teams.find(t => t.tid === 'tA')!.m.map(m => m.id)).toEqual(['A', 'B']);
  // hits before the fight do nothing
  await msg(a, { t: 'pa', to: 'C', k: 'atk' }); expect(c.got('php').length).toBe(0);
  // the fight starts: C (no team) plays alone
  vi.setSystemTime(R.fightAt + 1000); await (w.room as unknown as { brTick(n: number): Promise<void> }).brTick(Date.now());
  expect(a.got('bstart').length).toBe(1);
  // no friendly fire
  await msg(a, { t: 'pa', to: 'B', k: 'atk' }); expect(b.got('php').length).toBe(0);
  // A beats C (C reports full HP each time; the room keeps the real count)
  for (let i = 0; i < 40 && !c.got('pkill').length; i++) { vi.setSystemTime(Date.now() + 800); await pos(c, 510, 500); await msg(a, { t: 'pa', to: 'C', k: 'atk' }); }
  expect(c.got('pkill').slice(-1)[0]).toMatchObject({ id: 'C', by: 'A' });
  // C is out: cannot hit any more
  const before = a.got('php').length; vi.setSystemTime(Date.now() + 5000); await msg(c, { t: 'pa', to: 'A', k: 'atk' }); expect(a.got('php').length).toBe(before);
  // one team left → the end: A and B paid as winners, A the MVP
  await (w.room as unknown as { brTick(n: number): Promise<void> }).brTick(Date.now());
  const end = a.got('bend').slice(-1)[0]!; expect(end.win).toBe('tA'); expect(end.mvp).toBe('PA');
  const pays = w.calls.filter(q => q.path === '/brreward'); expect(pays.map(p => p.id).sort()).toEqual(['A', 'B']);
  expect(JSON.parse(pays.find(p => p.id === 'A')!.body)).toMatchObject({ win: true, mvp: true });
});

it('too few teams: called off and the fee paid back; dropping off during the fight = out', async () => {
  const lobby = Date.UTC(2026, 10, 15, 13, 41); vi.useFakeTimers(); vi.setSystemTime(lobby);
  const R = brRound(lobby)!, room = `m400-${R.id}`, w = world();
  const mk = (id: string) => { const s = new FakeWS(); s.att = { id, room, name: id, n: 0, win: 0, chatT: 0, join: lobby - 60000, bud: 0, budT: lobby }; w.socks.push(s); return s; };
  const a = mk('A'), b = mk('B');
  for (const s of [a, b]) await w.room.webSocketMessage(s as never, JSON.stringify({ t: 'p', x: 300, y: 300, hp: 100, lv: 50 }));
  a.att!.n = 0; await w.room.webSocketMessage(a as never, JSON.stringify({ t: 'tcreate' })); b.att!.n = 0; await w.room.webSocketMessage(b as never, JSON.stringify({ t: 'tjoin', tid: 'tA' }));
  vi.setSystemTime(R.fightAt + 500); await (w.room as unknown as { brTick(n: number): Promise<void> }).brTick(Date.now());
  expect(a.got('bend').slice(-1)[0]).toMatchObject({ cancelled: true });
  for (let i = 0; i < 10; i++) await Promise.resolve();
  expect(w.calls.filter(q => q.path === '/brrefund').length).toBe(2);

  // a second round with two solo heroes: B drops off → out after BR_DC_MS → A wins
  const lobby2 = lobby + 20 * 60000; vi.setSystemTime(lobby2); const R2 = brRound(lobby2)!, w2 = world();
  const mk2 = (id: string) => { const s = new FakeWS(); s.att = { id, room: `m400-${R2.id}`, name: id, n: 0, win: 0, chatT: 0, join: lobby2 - 60000, bud: 0, budT: lobby2 }; w2.socks.push(s); return s; };
  const a2 = mk2('A'), b2 = mk2('B');
  for (const s of [a2, b2]) await w2.room.webSocketMessage(s as never, JSON.stringify({ t: 'p', x: 300, y: 300, hp: 100, lv: 50 }));
  vi.setSystemTime(R2.fightAt + 500); const tick = (w2.room as unknown as { brTick(n: number): Promise<void> }); await tick.brTick(Date.now());
  b2.closed = true; vi.setSystemTime(Date.now() + 2000); await tick.brTick(Date.now());
  expect(a2.got('bend').length).toBe(0);
  vi.setSystemTime(Date.now() + BR_DC_MS + 1000); await tick.brTick(Date.now()); await tick.brTick(Date.now());
  expect(a2.got('pkill').slice(-1)[0]).toMatchObject({ id: 'B' }); expect(a2.got('bend').slice(-1)[0]).toMatchObject({ win: 'sA' });
});

it('a chest opened by a team: a prize roll for every member who is on a team still alive at the end', async () => {
  const lobby = Date.UTC(2026, 10, 15, 14, 1); vi.useFakeTimers(); vi.setSystemTime(lobby);
  const R = brRound(lobby)!, room = `m400-${R.id}`, w = world();
  const mk = (id: string) => { const s = new FakeWS(); s.att = { id, room, name: id, n: 0, win: 0, chatT: 0, join: lobby - 60000, bud: 0, budT: lobby }; w.socks.push(s); return s; };
  const msg = (s: FakeWS, m: Record<string, unknown>) => { s.att!.n = 0; return w.room.webSocketMessage(s as never, JSON.stringify(m)); };
  const a = mk('A'), b = mk('B'), c = mk('C');
  for (const s of [a, b, c]) await msg(s, { t: 'p', x: 300, y: 300, hp: 100, lv: 50 });
  await msg(a, { t: 'tcreate' }); await msg(b, { t: 'tjoin', tid: 'tA' });
  const tick = w.room as unknown as { brTick(n: number): Promise<void>; chest: { id: number; x: number; y: number } | null };
  vi.setSystemTime(R.fightAt + 61000); await tick.brTick(Date.now()); await msg(a, { t: 'p', x: 300, y: 300, hp: 100, lv: 50 });
  const ch = tick.chest!; expect(ch).toBeTruthy(); expect(a.got('pchint').length).toBe(1);
  await msg(a, { t: 'p', x: ch.x, y: ch.y, hp: 100, lv: 50 }); expect(a.got('pchest').length).toBe(1);
  await msg(a, { t: 'pcopen', id: ch.id }); vi.setSystemTime(Date.now() + 5200); await msg(a, { t: 'p', x: ch.x, y: ch.y, hp: 100, lv: 50 }); await msg(a, { t: 'pcdone', id: ch.id });
  expect(c.got('pcgone').slice(-1)[0]).toMatchObject({ team: 'tA' });
  vi.setSystemTime(R.fightEnd + 10); await tick.brTick(Date.now());
  const pays = w.calls.filter(q => q.path === '/brreward').map(q => ({ id: q.id, ...JSON.parse(q.body) }));
  expect(pays.filter(p => p.rolls === 1).map(p => p.id).sort()).toEqual(['A', 'B']);
});
