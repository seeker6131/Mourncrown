import { describe, it, expect } from 'vitest';
import { startNewGame } from '../src/core/save';
import {
  createGuild, joinGuild, guildOffers, donate, upgradeVillage, collectVillage, produce, setRole, defBuild, defUpgrade, defRepair, sleep, wake, trophyPut, trophyTake,
  stashPut, stashTake, shopBuy, goalProgress, goals, rivals, rivalStructs, raidResult, canRaid, simIncoming, meOf, hallLv, villageCost, defensePower,
  hireGuard, dismissGuard, feedGuards, guildTick, houseBuild, houseLv, guildOf, gb, type GuildState,
} from '../src/systems/guild';
import { addItem } from '../src/systems/inventory';
import { derive } from '../src/systems/stats';
import { makeGear } from '../src/systems/loot';
import { handlers } from '../src/server/handlers';
import { GUILD_UNLOCK_LV, RAIDS_PER_DAY, RAID_GAIN, vaultShare, RAID_TAKE, GUARDS, guardCap } from '../src/data/guild';
import { NPC_BUILDINGS } from '../src/data/buildings';

const T0 = new Date(2026, 10, 11, 12).getTime();
let seed = 1; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
function village() {
  const s = startNewGame(); NPC_BUILDINGS.forEach((t, i) => s.buildings.push({ plot: i, type: t, level: 1, stored: 0, last: T0 })); s.level = GUILD_UNLOCK_LV; s.gold = 50000; s.res = { wood: 9000, stone: 9000, food: 9000 };
  expect(createGuild(s, 'กิลด์ทดสอบ', T0, rnd)).toEqual({ ok: true });
  const g = guildOf(s) as GuildState;
  return { s, g };
}
const rich = (g: GuildState) => { g.treasury = { gold: 1e6, wood: 1e6, stone: 1e6, food: 1e6, items: { slime_gel: 99, wolf_pelt: 99, goblin_fang: 99, ancient_core: 99, wisp_essence: 99, spore_cap: 99 } }; };

describe('guild unlock', () => {
  it('everyone starts in the starter NPC village; the guild unlocks at the guild level', () => {
    const s = startNewGame();
    expect(guildOf(s)).toBeUndefined();
    expect(createGuild(s, 'เร็วไป', T0, rnd)).toEqual({ refused: 'level' });
    s.level = GUILD_UNLOCK_LV;
    expect(createGuild(s, 'ก', T0, rnd)).toEqual({ refused: 'name' });
    expect(createGuild(s, 'หมาป่า', T0, rnd)).toEqual({ ok: true });
    expect(createGuild(s, 'อีกกิลด์', T0, rnd)).toEqual({ refused: 'member' });
  });
  it('a new guild village: player leads, every building Lv1, empty house lot, a founding grant, a 3-day shield', () => {
    const { s, g } = village();
    expect(meOf(s)?.role).toBe('leader');
    expect(g.buildings.length).toBe(10); for (const b of g.buildings) expect(b.level).toBe(1);
    expect(meOf(s)!.houseLv).toBe(0);
    expect(g.treasury.gold).toBeGreaterThan(0);
    expect(g.shieldUntil).toBeGreaterThan(T0 + 2 * 86400000);
    expect(s.buildings.some(b => (b.type as string) === 'hall')).toBe(false);   // the starter village is not touched
  });
  it('joining a guild looking for members puts you in as a member with your own empty lot', () => {
    const s = startNewGame(); s.level = GUILD_UNLOCK_LV + 5;
    const o = guildOffers(s, T0)[0];
    expect(joinGuild(s, 'nope', T0)).toEqual({ refused: 'target' });
    expect(joinGuild(s, o.id, T0)).toEqual({ ok: true });
    const g = guildOf(s)!;
    expect(meOf(s)!.role).toBe('member'); expect(g.members.length).toBe(o.members + 1);
    expect(new Set(g.members.map(m => m.house)).size).toBe(g.members.length);
    expect(meOf(s)!.houseLv).toBe(0);
  });
});

describe('guild village', () => {
  it('donations move personal resources to the treasury and earn guild points; the treasury has a cap', () => {
    const { s, g } = village(); const t0 = g.treasury.wood;
    const r = donate(s, { wood: 500, stone: 200 }, T0);
    expect('pts' in r && r.pts).toBe(500 + 300);
    expect(s.res.wood).toBe(8500); expect(g.treasury.wood).toBe(t0 + 500);
    expect(donate(s, { wood: 99999 }, T0)).toEqual({ refused: 'amount' });
    s.res.wood = 999999; expect(donate(s, { wood: 900000 }, T0)).toEqual({ refused: 'cap' });
    addItem(s, 'wolf_pelt', 5); const rp = donate(s, { item: 'wolf_pelt', qty: 3 }, T0);
    expect('pts' in rp).toBe(true); expect(g.treasury.items.wolf_pelt).toBe(3);
  });
  it('only the leader / deputies upgrade guild buildings, paid by the treasury, never above the guild hall', () => {
    const { s, g } = village(); rich(g);
    const gold = s.gold;
    expect(upgradeVillage(s, 'forge', T0)).toEqual({ refused: 'hall' });        // forge Lv2 needs hall Lv2
    expect('level' in upgradeVillage(s, 'hall', T0)).toBe(true);
    expect(upgradeVillage(s, 'forge', T0 + 1)).toEqual({ refused: 'hall' });    // hall still under construction
    expect('level' in upgradeVillage(s, 'forge', T0 + 600000)).toBe(true);
    expect(s.gold).toBe(gold);                                                   // personal gold untouched
    meOf(s)!.role = 'member';
    expect(upgradeVillage(s, 'kitchen', T0 + 600000)).toEqual({ refused: 'role' });
  });
  it('guild buildings cost more than the starter village prices', () => {
    expect(villageCost('forge', 2).gold).toBeGreaterThan(1200);
  });
  it('production buildings fill up over time and go to the treasury, not the player', () => {
    const { s, g } = village(); const w = g.treasury.wood, pw = s.res.wood;
    produce(s, T0 + 30 * 60000);
    const r = collectVillage(s, 'lumber', T0 + 30 * 60000);
    expect('amount' in r && r.amount).toBeGreaterThan(30);
    expect(g.treasury.wood).toBeGreaterThan(w); expect(s.res.wood).toBe(pw);
    expect(collectVillage(s, 'forge', T0)).toEqual({ refused: 'building' });
  });
  it('my house in the guild village is built with personal resources', () => {
    const { s, g } = village(); const tg = g.treasury.gold, wood = s.res.wood;
    expect(houseLv(s, T0)).toBe(0);
    expect(houseBuild(s, T0)).toEqual({ level: 1 });
    expect(s.res.wood).toBeLessThan(wood); expect(g.treasury.gold).toBe(tg);
    expect(houseBuild(s, T0 + 1)).toEqual({ refused: 'busy' });
    expect(houseLv(s, T0 + 600000)).toBe(1);
  });
  it('leader names deputies (2 at most)', () => {
    const s = startNewGame(); s.level = GUILD_UNLOCK_LV; createGuild(s, 'กิลด์', T0, rnd);
    for (let i = 0; i < 3; i++) handlers.guildInvite(s, {}, { now: T0, rnd });
    const sims = guildOf(s)!.members.filter(m => m.sim);
    expect(setRole(s, sims[0].id, 'deputy', T0)).toEqual({ ok: true });
    expect(setRole(s, sims[1].id, 'deputy', T0)).toEqual({ ok: true });
    expect(setRole(s, sims[2].id, 'deputy', T0)).toEqual({ refused: 'full' });
  });
});

describe('hired guards', () => {
  it('officers hire guards with the treasury up to the barracks limit; guards eat treasury food', () => {
    const { s, g } = village(); rich(g); const gold = g.treasury.gold;
    for (let i = 0; i < guardCap(1); i++) expect('n' in hireGuard(s, 'spear', T0)).toBe(true);
    expect(hireGuard(s, 'archer', T0)).toEqual({ refused: 'full' });
    expect(g.treasury.gold).toBe(gold - guardCap(1) * GUARDS.spear.hire.gold!);
    const p = defensePower(s);
    const f = g.treasury.food; feedGuards(s, 2); expect(g.treasury.food).toBeLessThan(f);
    g.treasury.food = 0; feedGuards(s, 1); expect(g.hungry).toBe(true); expect(defensePower(s)).toBeLessThan(p);
    expect(dismissGuard(s, 'spear')).toEqual({ n: guardCap(1) - 1 });
    meOf(s)!.role = 'member'; expect(hireGuard(s, 'spear', T0)).toEqual({ refused: 'role' });
  });
  it('time passing: simulated members donate, sim leaders upgrade, production builds up', () => {
    const s = startNewGame(); s.level = GUILD_UNLOCK_LV; joinGuild(s, guildOffers(s, T0)[1].id, T0);
    const g = guildOf(s)!; const t = g.treasury.wood + g.treasury.gold;
    guildTick(s, T0 + 6 * 3600000, () => 0.3);
    expect(g.treasury.wood + g.treasury.gold).not.toBe(t);
    expect(gb(s, 'lumber')!.stored).toBeGreaterThan(0);
  });
});

describe('defenses', () => {
  it('builds in the slots the hall allows, unlocks by hall level, upgrades and repairs from the treasury', () => {
    const { s, g } = village(); rich(g);
    expect(defBuild(s, 0, 'archer', T0)).toEqual({ ok: true });
    expect(defBuild(s, 0, 'spikes', T0)).toEqual({ refused: 'taken' });
    expect(defBuild(s, 1, 'cannon', T0)).toEqual({ refused: 'hall' });
    expect(defBuild(s, 9, 'spikes', T0)).toEqual({ refused: 'slot' });   // hall Lv1: 4 slots
    expect(defUpgrade(s, 0, T0 + 600000)).toEqual({ refused: 'hall' });
    const before = defensePower(s); g.defenses[0].hp = 10;
    expect(defensePower(s)).toBeLessThan(before);
    expect(defRepair(s, 0)).toEqual({ ok: true }); expect(defensePower(s)).toBeCloseTo(before);
  });
});

describe('player house', () => {
  it('rest builds up per real hour after sleeping and adds EXP to kills (cap by house level)', () => {
    const { s } = village();
    expect(sleep(s, T0)).toEqual({ refused: 'house' });
    expect(houseBuild(s, T0)).toEqual({ level: 1 }); meOf(s)!.houseDone = 0;
    expect(sleep(s, T0)).toEqual({ ok: true });
    expect(wake(s, T0 + 60000).gained).toBe(0);              // a nap gives nothing
    sleep(s, T0); expect(wake(s, T0 + 8 * 3600000).rest).toBe(80);
    sleep(s, T0); expect(wake(s, T0 + 100 * 3600000).rest).toBe(450);   // cap 300 + 150 x Lv1
  });
  it('trophies (Super Rare and up) give permanent bonuses; stash keeps items at home', () => {
    const { s } = village(); s.level = 60; houseBuild(s, T0); meOf(s)!.houseDone = 0;
    addItem(s, 'flame_saber', 1, 0, makeGear(rnd, 'flame_saber', 3)); const it = s.inventory[s.inventory.length - 1];
    addItem(s, 'wood_sword', 1, 0, makeGear(rnd, 'wood_sword', 0)); const junk = s.inventory[s.inventory.length - 1];
    const atk = derive(s).atk;
    expect(trophyPut(s, junk.uid)).toEqual({ refused: 'rarity' });
    expect(trophyPut(s, it.uid)).toEqual({ ok: true });
    expect(derive(s).atk).toBeGreaterThan(atk);
    expect(trophyTake(s, 0)).toEqual({ ok: true }); expect(derive(s).atk).toBe(atk);
    const n = s.inventory.length;
    expect(stashPut(s, junk.uid)).toEqual({ ok: true }); expect(s.inventory.length).toBe(n - 1);
    expect(stashTake(s, 0)).toEqual({ ok: true }); expect(s.inventory.length).toBe(n);
  });
});

describe('guild goals and shop', () => {
  it('goals finish with treasury rewards and points for those who helped', () => {
    const { s, g } = village(); const list = goals(s, T0); const q = list[0];
    const pts = meOf(s)!.pts, gold = g.treasury.gold;
    goalProgress(s, q.kind, q.need, T0);
    expect(q.done).toBe(true); expect(g.treasury.gold).toBeGreaterThan(gold); expect(meOf(s)!.pts).toBeGreaterThan(pts);
  });
  it('shop spends guild points with daily limits', () => {
    const { s } = village(); meOf(s)!.pts = 10000;
    for (let i = 0; i < 5; i++) expect(shopBuy(s, 'scroll_return', T0)).toEqual({ ok: true });
    expect(shopBuy(s, 'scroll_return', T0)).toEqual({ refused: 'daily' });
    meOf(s)!.pts = 0; expect(shopBuy(s, 'hp_potion_l', T0)).toEqual({ refused: 'pts' });
  });
});

describe('raids', () => {
  it('three matched targets a day, never far weaker than us', () => {
    const { s } = village(); const r = rivals(s, T0);
    expect(r.length).toBe(3);
    for (const v of r) expect(v.hall).toBeGreaterThanOrEqual(hallLv(s) - 1);
  });
  it('stars from destruction; the attacker gets less than the defender loses; vault part is safe', () => {
    const { s, g } = village(); const rv = rivals(s, T0)[0];
    g.treasury = { gold: 0, wood: 0, stone: 0, food: 0, items: {} };
    const none = raidResult(s, JSON.parse(JSON.stringify(rv)), [], T0); expect(none.stars).toBe(0);
    const rv2 = rivals(s, T0)[0]; const all2 = rivalStructs(rv2); const full = raidResult(s, rv2, all2.map(q => q.id), T0);
    expect(full.stars).toBe(3);
    const free = 1 - vaultShare(rv2.wh);
    expect(full.gain.wood).toBeLessThanOrEqual(Math.floor(rv2.treasury.wood * free * RAID_TAKE[3] * RAID_GAIN) + all2.reduce((a, q) => a + (q.res === 'wood' ? Math.floor((q.stored ?? 0) * 0.5) : 0), 0));
    expect(full.gain.wood).toBeLessThan(rv2.treasury.wood * free * RAID_TAKE[3]);
  });
  it('limited raids per day; attacking drops the shield', () => {
    const { s, g } = village(); g.shieldUntil = T0 + 1e9;
    for (let i = 0; i < RAIDS_PER_DAY; i++) { const t = rivals(s, T0)[0]; if (!t) break; const c = canRaid(s, t.id, T0); expect('rival' in c).toBe(true); raidResult(s, t, [], T0); }
    expect(g.shieldUntil).toBeLessThanOrEqual(T0);
    expect(canRaid(s, 'x', T0)).toEqual({ refused: 'daily' });
  });
  it('a simulated rival raids only without a shield and at most every 10 hours; losses come from the unprotected part', () => {
    const { s, g } = village(); g.shieldUntil = 0; g.incomingAt = 0;
    g.treasury = { gold: 10000, wood: 10000, stone: 10000, food: 10000, items: {} };
    let hit = null; for (let i = 0; i < 20 && !hit; i++) { g.incomingAt = 0; g.shieldUntil = 0; hit = simIncoming(s, T0 + i, () => 0.1); }
    expect(hit).not.toBeNull();
    expect(g.treasury.wood).toBeGreaterThanOrEqual(10000 * (1 - (1 - vaultShare(1)) * RAID_TAKE[3]));
    expect(g.shieldUntil).toBeGreaterThan(T0);
    expect(simIncoming(s, T0 + 1000, () => 0.1)).toBeNull();
  });
});

describe('guild war season', () => {
  it('raid stars and defenses add season points; last week rolls over and can be claimed once', async () => {
    const { season, seasonBoard, seasonClaim, raidOutcome, weekOf } = await import('../src/systems/guild');
    const { s, g } = village(); const rv = rivals(s, T0)[0];
    raidResult(s, rv, rivalStructs(rv).map(q => q.id), T0);
    expect(season(s, T0).score).toBeGreaterThanOrEqual(30);
    const before = season(s, T0).score; raidOutcome(s, 0, 'บอท', T0); expect(season(s, T0).score).toBe(before + 8);
    expect(seasonBoard(s, T0).some(e => e.me)).toBe(true);
    const next = T0 + 7 * 86400000;
    expect(weekOf(next)).toBe(weekOf(T0) + 1);
    const pts = meOf(s)!.pts, r = seasonClaim(s, next);
    expect('rank' in r).toBe(true); expect(meOf(s)!.pts).toBeGreaterThan(pts);
    expect(seasonClaim(s, next)).toEqual({ refused: 'claimed' });
    void g;
  });
});

describe('bounty boss', () => {
  it('one lord per 20-minute slot near the player level; marked when killed', async () => {
    const { bountyOf, markBounty } = await import('../src/systems/bounty');
    const s = startNewGame(); s.level = 30;
    const b = bountyOf(s, T0);
    expect(b.killed).toBe(false); expect(b.until).toBeGreaterThan(T0);
    expect(bountyOf(s, T0 + 1000).n).toBe(b.n);
    markBounty(s, b.slot); expect(bountyOf(s, T0).killed).toBe(true);
    expect(bountyOf(s, b.until + 1).killed).toBe(false);
  });
});
