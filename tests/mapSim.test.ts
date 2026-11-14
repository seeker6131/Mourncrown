import { describe, it, expect } from 'vitest';
import { MapSim, gridOk, mapOfRoom, WB, WB_KEYS, wbStats, type Grid, type SimPlayer } from '../src/server/mapSim';
import { STAGES, WILD } from '../src/world/stages';

let seed = 3; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
/** an open 2048x1408 map with a wall band at x 1000-1040 and meadows; a boss meadow on the right */
function grid(boss = false): Grid {
  const c = 8, w = 256, h = 176, bits = new Uint8Array(Math.ceil(w * h / 8));
  for (let j = 0; j < h; j++) for (let i = 125; i < 130; i++) { const k = j * w + i; bits[k >> 3] |= 1 << (k & 7); }
  return { w, h, c, bits, clear: [{ x: 400, y: 400, r: 90 }, { x: 600, y: 900, r: 90 }, ...(boss ? [{ x: 1700, y: 700, r: 120, boss: true }] : [])], gate: { x: 46, y: 700 } };
}
const T0 = 1_000_000;
const me = (x: number, y: number, hp = 100): SimPlayer => ({ id: 'A', x, y, hp, lv: 10 });

describe('server-run monsters (the room moves them; nobody steers them)', () => {
  it('room names and walls are checked', () => {
    expect(mapOfRoom('m12')).toBe(12); expect(mapOfRoom('m12-3')).toBe(12); expect(mapOfRoom('w')).toBe(WILD); expect(mapOfRoom('v')).toBe(0); expect(mapOfRoom('g-abc')).toBe(0);
    expect(gridOk(grid())).toBe(true);
    expect(gridOk({ ...grid(), bits: new Uint8Array(10) })).toBe(false);
  });
  it('the map fills up with its monsters, away from the gate and never inside walls', () => {
    const s = new MapSim('m1', grid(), rnd);
    for (let t = 0; t < 40; t++) s.run(T0 + t * 200, [me(100, 700)]);
    const st = STAGES[0], mons = [...s.mons.values()];
    expect(mons.length).toBeGreaterThanOrEqual(st.count);
    for (const m of mons) { expect(s.free(m.x, m.y)).toBe(true); expect(Math.hypot(m.x - 46, m.y - 700)).toBeGreaterThan(200); expect(st.land.mobs.some(q => q.key === m.mob.key)).toBe(true); }
  });
  it('peaceful until hit; then it chases the one who hit it and strikes them, never walking through the wall', () => {
    const s = new MapSim('m1', grid(), rnd); s.run(T0, [me(100, 700)]);
    const m = [...s.mons.values()][0]; m.x = m.hx = 700; m.y = m.hy = 600;
    let p = me(760, 600); const atks: string[] = [];
    for (let t = 1; t < 15; t++) s.run(T0 + t * 200, [p]);
    expect(Math.hypot(m.x - 700, m.y - 600)).toBeLessThan(120);   // only wandered near home
    s.hit(m.sid, 'A', T0 + 3000, [p]);
    for (let t = 16; t < 60; t++) { const ev = s.run(T0 + t * 200, [p]); for (const a of ev.atk) atks.push(a.to + ':' + a.k); }
    expect(Math.hypot(m.x - p.x, m.y - p.y)).toBeLessThan(70);
    expect(atks.length).toBeGreaterThan(0); expect(atks.every(a => a.startsWith('A:'))).toBe(true);
    // the player runs behind the wall: the monster stays on its side
    p = me(1200, m.y); s.hit(m.sid, 'A', T0 + 12000, [p]);
    for (let t = 61; t < 120; t++) s.run(T0 + t * 200, [p]);
    expect(m.x).toBeLessThan(1000);
  });
  it('a player who gets far away is let go; it walks home', () => {
    const s = new MapSim('m1', grid(), rnd); s.run(T0, [me(100, 700)]);
    const m = [...s.mons.values()][0]; m.x = m.hx = 500; m.y = m.hy = 400;
    s.hit(m.sid, 'A', T0 + 100, [me(540, 400)]);
    for (let t = 1; t < 80; t++) s.run(T0 + t * 200, [me(900, 1300)]);
    expect(m.hitT).toBe(0); expect(Math.hypot(m.x - 500, m.y - 400)).toBeLessThan(130);
  });
  it('a dead monster comes back after a while; no land boss any more', () => {
    const s = new MapSim('m10', grid(true), rnd); for (let t = 0; t < 30; t++) s.run(T0 - 6000 + t * 200, [me(100, 700)]);
    expect([...s.mons.values()].some(m => m.boss)).toBe(false);
    const n0 = s.mons.size, one = [...s.mons.values()][0];
    s.died(one.sid, T0 + 100, 1); expect(s.mons.size).toBe(n0 - 1);
    for (let t = 1; t < 100; t++) s.run(T0 + 100 + t * 200, [me(100, 700)]);
    expect(s.mons.size).toBe(n0);
  });
  it('a roaming boss: warned a minute ahead, comes on any map, scaled to the players there, leaves if nobody fights it', () => {
    const s = new MapSim('m3', grid(), rnd), P = [me(100, 700), { id: 'B', x: 120, y: 700, hp: 100, lv: 30 }];
    const ev: string[] = []; let t = T0;
    for (let i = 0; i < 12000 && !ev.includes('spawn'); i++, t += 200) for (const w of s.run(t, P).wb) ev.push(w.k);
    expect(ev[0]).toBe('warn'); expect(ev).toContain('spawn');
    const b = [...s.mons.values()].find(m => m.wb)!;
    expect(WB_KEYS).toContain(b.mob.key); expect(b.boss).toBe(true);
    const w = wbStats(STAGES[2].level, [10, 30], b.mob); expect(b.lv).toBe(w.lv); expect(b.max).toBe(w.hp);
    expect(wbStats(STAGES[2].level, [10, 10], b.mob).hp / wbStats(STAGES[2].level, [10], b.mob).hp).toBeCloseTo(1 + WB.perPlayer, 2);   // each more player: +70% HP
    for (let i = 0; i < (WB.life / 200) + 10; i++, t += 200) for (const x of s.run(t, P).wb) ev.push(x.k);
    expect(ev).toContain('leave'); expect([...s.mons.values()].some(m => m.wb)).toBe(false);
  });
  it('a roaming boss blasts the ground where its attacker stands: everyone inside is hit, others are not', () => {
    const s = new MapSim('m10', grid(true), rnd); const A = { id: 'A', x: 1700, y: 760, hp: 100, lv: 50 }, B = { id: 'B', x: 1710, y: 765, hp: 100, lv: 50 }, C = { id: 'C', x: 1500, y: 700, hp: 100, lv: 50 };
    let t = T0; s.run(t, [A, B, C]); s.wbAt = t + 1;
    for (let i = 0; i < 400 && ![...s.mons.values()].some(m => m.wb); i++) s.run(t += 200, [A, B, C]);
    const b = [...s.mons.values()].find(m => m.wb)!; b.x = b.hx = 1700; b.y = b.hy = 700;
    s.hit(b.sid, 'A', t, [A, B, C]);
    const hits: string[] = [], fx: string[] = [];
    for (let i = 1; i < 20; i++) { const ev = s.run(t + i * 200, [A, B, C]); for (const a of ev.atk) hits.push(a.to + ':' + a.k); for (const f of ev.fx) fx.push(f.k); }
    expect(fx).toContain('special');
    expect(hits).toContain('A:special'); expect(hits).toContain('B:special'); expect(hits.some(h => h.startsWith('C:'))).toBe(false);
  });
  it('golden monsters are the server\'s roll (about 3%), with 5x HP; never on bosses or in the Deepwild', () => {
    let gold = 0, all = 0;
    for (let k = 0; k < 30; k++) { const s = new MapSim('m3', grid(), rnd); s.run(T0, [me(100, 700)]); for (const m of s.mons.values()) { all++; if (m.elite) { gold++; expect(m.boss).toBe(false); } } }
    expect(gold).toBeGreaterThan(0); expect(gold / all).toBeLessThan(0.08);
    const w = new MapSim('w', { ...grid(), w: 320, h: 224, bits: new Uint8Array(Math.ceil(320 * 224 / 8)) }, rnd); w.run(T0, [me(100, 700)]);
    for (const m of w.mons.values()) { expect(m.elite).toBe(false); expect(m.animal).toBe(true); }
  });
});

describe('monsters never stay stuck on a corner', () => {
  it('a chase that runs into a wall is given up after a few seconds, and it gets home', () => {
    const s = new MapSim('m1', grid(), rnd); s.run(T0, [me(100, 700)]);
    const m = [...s.mons.values()][0]; m.x = m.hx = 990; m.y = m.hy = 600;   // right at the wall (x 1000-1040)
    const p = me(1060, 600);   // the player just behind the wall
    s.hit(m.sid, 'A', T0 + 100, [p]);
    for (let t = 1; t < 30; t++) s.run(T0 + 100 + t * 200, [p]);
    expect(m.hitT).toBe(0); expect(m.tgt).toBeUndefined();
    expect(m.x).toBeLessThan(1000);
  });
  it('a monster notices a hero walking close by and comes (player feedback) — not one far away', () => {
    const s = new MapSim('m1', grid(), rnd); s.run(T0, [me(100, 700)]);
    const m = [...s.mons.values()].find(q => !q.boss && !q.animal)!; m.x = m.hx = 500; m.y = m.hy = 500;
    s.run(T0 + 200, [me(800, 500)]); expect(m.tgt).toBeUndefined();
    s.run(T0 + 400, [me(560, 500)]); expect(m.tgt).toBe('A'); expect(m.hitT).toBeGreaterThan(0);
  });
  it('one that strayed far from its spot walks back (or is put back if it cannot)', () => {
    const s = new MapSim('m1', grid(), rnd); s.run(T0, [me(100, 700)]);
    const m = [...s.mons.values()][0]; m.hx = 700; m.hy = 600; m.x = 990; m.y = 600;
    for (let t = 1; t < 80; t++) s.run(T0 + t * 200, [me(100, 700)]);
    expect(Math.hypot(m.x - 700, m.y - 600)).toBeLessThan(150);
  });
});

describe('director "C": the common monsters are each player\'s own; the room runs only roaming bosses', () => {
  it('no common monsters on the server; the room sleeps until a minute before the boss, then the boss comes', () => {
    const s = new MapSim('m3', grid(), rnd); s.regular = false;
    const P = [me(100, 700)]; let t = T0;
    s.run(t, P);
    expect([...s.mons.values()].length).toBe(0);
    const q = s.quietUntil(t); expect(q).toBeGreaterThan(t); expect(q).toBe(s.wbAt - 61000);   // nothing to move: sleep
    t = q + 1000; const ev: string[] = [];
    for (let i = 0; i < 600 && !ev.includes('spawn'); i++, t += 200) for (const w of s.run(t, P).wb) ev.push(w.k);
    expect(ev).toEqual(['warn', 'spawn']);
    expect([...s.mons.values()].filter(m => m.alive).map(m => m.wb)).toEqual([true]);
    expect(s.quietUntil(t)).toBe(0);   // the boss is here: keep ticking
  });
  it('the Deepwild has no boss: the room never needs to tick', () => {
    const w = new MapSim('w', { ...grid(), w: 320, h: 224, bits: new Uint8Array(Math.ceil(320 * 224 / 8)) }, rnd); w.regular = false;
    w.run(T0, [me(100, 700)]); expect(w.mons.size).toBe(0); expect(w.quietUntil(T0)).toBe(Infinity);
  });
});

describe('roaming boss costs little server time: leaves when ignored, the room sleeps when nobody is near', () => {
  const bossUp = () => {
    const s = new MapSim('m3', grid(), rnd); s.regular = false; const P = [me(100, 700)]; let t = T0;
    s.run(t, P); t = s.wbAt + 10;
    for (let i = 0; i < 5 && !s.boss(); i++, t += 200) s.run(t, P);
    return { s, P, t };
  };
  it('after the warning there is nothing to do until it arrives', () => {
    const s = new MapSim('m3', grid(), rnd); s.regular = false; const P = [me(100, 700)]; let t = T0;
    s.run(t, P); t = s.wbAt - 59000; s.run(t, P);
    expect(s.warned).toBe(true); expect(s.quietUntil(t)).toBe(s.wbAt);
  });
  it('nobody near and nobody hit it: not "near" (the room sleeps); after 3 minutes untouched it leaves', () => {
    const { s, P, t } = bossUp(); const b = s.boss()!;
    expect(b).toBeTruthy(); const far = [{ ...P[0], x: b.x + WB.near + 200, y: b.y }];
    expect(s.bossNear(t, far)).toBe(false);
    expect(s.bossNear(t, [{ ...P[0], x: b.x + 50, y: b.y }])).toBe(true);
    const ev: string[] = []; for (const w of s.run(b.join + WB.idle + 1000, far).wb) ev.push(w.k);
    expect(ev).toContain('leave'); expect(s.boss()).toBeNull();
  });
  it('once hit it stays (and counts as near for a few seconds)', () => {
    const { s, P, t } = bossUp(); const b = s.boss()!; const far = [{ ...P[0], x: b.x + WB.near + 200, y: b.y }];
    s.hit(b.sid, 'A', t, far); expect(s.bossNear(t + 1000, far)).toBe(true);
    s.run(b.join + WB.idle + 1000, far); expect(s.boss()).toBeTruthy();
  });
});
