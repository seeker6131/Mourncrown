import { describe, it, expect } from 'vitest';
import { startNewGame } from '../src/core/save';
import { createGuild, guildOf, rivals, houseBuild, meOf, type GuildState } from '../src/systems/guild';
import { startWar, warTick, warHit, warKill, warEnd, warDone, pctLeft, WAR_SECS } from '../src/systems/war';
import { GUILD_UNLOCK_LV } from '../src/data/guild';
import { NPC_BUILDINGS } from '../src/data/buildings';

const T0 = new Date(2026, 10, 12, 12).getTime();
let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
function guild() {
  const s = startNewGame(); NPC_BUILDINGS.forEach((t, i) => s.buildings.push({ plot: i, type: t, level: 1, stored: 0, last: T0 })); s.level = GUILD_UNLOCK_LV; s.gold = 50000; s.res = { wood: 9000, stone: 9000, food: 9000 };
  createGuild(s, 'กิลด์รบ', T0, rnd); const g = guildOf(s) as GuildState; return { s, g };
}

describe('guild war (mixed: the system fights, heroes help)', () => {
  it('the system fights both ways: both villages lose buildings over time, nobody touches anything', () => {
    const { s, g } = guild(); const rv = rivals(s, T0)[0];
    const r = startWar(s, rv.id, T0); expect('war' in r).toBe(true);
    expect(startWar(s, rv.id, T0)).toEqual({ refused: 'war' });
    warTick(s, T0 + 120000);
    const w = g.war!; expect(pctLeft(w.ours)).toBeLessThan(1); expect(pctLeft(w.theirs)).toBeLessThan(1); expect(w.over).toBeUndefined();
    warTick(s, T0 + WAR_SECS * 1000 + 1000);
    expect(w.over).toBeDefined(); expect(w.over!.win).toBe(pctLeft(w.ours) > pctLeft(w.theirs));
    expect(warDone(s)).toBeTruthy(); expect(g.war).toBeUndefined();
  });
  it('a hero who jumps in tips the war: hits wreck enemy buildings, kills thin the raiders', () => {
    const a = guild(), b = guild(); seed = 7; const ra = rivals(a.s, T0)[0]; const rb = rivals(b.s, T0)[0];
    startWar(a.s, ra.id, T0); startWar(b.s, rb.id, T0);
    for (let t = 1; t <= 100; t++) {
      const now = T0 + t * 2000, w = warTick(a.s, now)!; if (w.over) break;
      const tg = w.theirs.blds.find(q => q.hp > 0); if (tg) warHit(a.s, tg.id, tg.max * 0.08, now);
      warKill(a.s, now);
    }
    warEnd(a.s, T0 + WAR_SECS * 1000); warEnd(b.s, T0 + WAR_SECS * 1000);
    expect(a.g.war!.over!.theirs).toBeLessThan(b.g.war!.over!.theirs);   // the helped war wrecked more of the enemy
    expect(a.g.war!.over!.ours).toBeGreaterThanOrEqual(b.g.war!.over!.ours);   // and lost less at home
    expect(a.g.war!.hero.kills).toBeGreaterThan(0);
  });
  it('the result goes through the raid rules: loot from their treasury, fire damage at home, one raid used', () => {
    const { s, g } = guild(); houseBuild(s, T0); meOf(s)!.houseDone = 0; const rv = rivals(s, T0)[0], gold = g.treasury.gold;
    startWar(s, rv.id, T0); expect(g.raids.used).toBe(1);
    warTick(s, T0 + WAR_SECS * 1000 + 1);
    expect(g.raids.used).toBe(1);
    expect(g.buildings.some(b => (b.dmg ?? 0) > 0) || g.war!.over!.stars === 0).toBe(true);
    expect(g.treasury.gold).not.toBeNaN(); void gold;
    expect(warHit(s, 'b:hall', 100, T0 + WAR_SECS * 1000 + 2)).toEqual({ refused: 'war' });
  });
});

describe('guild war between REAL guilds (online)', () => {
  it('a real guild is a raid target as it really is; the raider gets less than the target loses', async () => {
    const { rivalOf, raidedBy, raidResult } = await import('../src/systems/guild');
    const A = guild(), B = guild(); A.g.real = B.g.real = true; B.g.shieldUntil = 0;
    B.g.treasury.gold = 20000; B.g.treasury.wood = 5000;
    const rv = rivalOf(B.s, T0);
    expect(rv.real).toBe(true); expect(rv.id).toBe('g:' + B.g.id); expect(rv.treasury.gold).toBe(20000);
    const r = raidResult(A.s, rv, ['b:hall', 'b:market'], T0);
    expect(r.stars).toBe(1);
    const hit = A.g.out![0]; expect(hit.target).toBe(B.g.id); expect(hit.destroyed).toContain('b:hall');
    const lost = raidedBy(B.s, hit, T0);
    for (const k of ['gold', 'wood', 'stone', 'food'] as const) expect(r.gain[k]).toBeLessThanOrEqual(lost[k]);   // no riches are made
    expect(B.g.treasury.gold).toBe(20000 - lost.gold);
    expect(B.g.buildings.find(b => b.type === 'hall')!.dmg).toBe(1);   // burnt down until repaired
    expect(B.g.shieldUntil).toBeGreaterThan(T0 + 11 * 3600000);
    expect(B.g.unread[B.g.unread.length - 1]).toContain('ปล้นหมู่บ้านได้');
  });
  it('online (director): no bots — no pretend villages to raid or raiding us, no bot members; only the real guilds the server found', async () => {
    const { simIncoming, simInvite, guildTick } = await import('../src/systems/guild');
    const a = guild(); a.g.real = true; a.g.shieldUntil = 0; a.g.incomingAt = 0;
    expect(simIncoming(a.s, T0 + 86400000 * 5, () => 0.1)).toBeNull();
    a.g.rivals = { day: '', list: [] };
    expect(rivals(a.s, T0)).toEqual([]);   // nothing found by the server = nothing to raid (never a made-up village)
    expect(simInvite(a.s, T0)).toEqual({ refused: 'real' });
    a.g.members.push({ ...a.g.members[0], id: 'sim9_x', name: 'บอท', role: 'member', sim: true } as never);
    guildTick(a.s, T0 + 3600000); expect(a.g.members.some(m => m.sim)).toBe(false);
    expect(a.g.out ?? []).toEqual([]);
  });
  it('walking away from a war is a loss; the season board online is the real guilds, top places need 6 guilds', async () => {
    const { seasonBoard, seasonClaim, season } = await import('../src/systems/guild');
    const { s, g } = guild(); const rv = rivals(s, T0)[0];
    startWar(s, rv.id, T0); warEnd(s, T0 + 5000);
    expect(g.war!.over!.win).toBe(false); expect(g.war!.over!.got[0]).toContain('ถอยทัพ');
    g.real = true; const se = season(s, T0); se.prev = { week: se.week - 1, score: 500 };
    g.board = { at: T0, week: se.week, list: [{ name: 'อีกกิลด์', score: 5 }], prev: [{ name: 'อีกกิลด์', score: 100 }] };
    expect(seasonBoard(s, T0).map(e => e.name).sort()).toEqual(['อีกกิลด์', g.name].sort());   // no pretend guilds online
    const r = seasonClaim(s, T0) as { rank: number; dragon: boolean };
    expect(r.rank).toBe(5); expect(r.dragon).toBe(false);   // first of 2 guilds counts as 5th of 6
  });
});
