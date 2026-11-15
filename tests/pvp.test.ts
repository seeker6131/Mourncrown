import { describe, it, expect } from 'vitest';
import { startNewGame } from '../src/core/save';
import { handlers, useMem, newMem } from '../src/server/handlers';
import { PVP } from '../src/world/stages';
import { PVP_FEE, pvpDamage, loseWarBag, warBag, pvpOpen } from '../src/systems/pvp';

const open = Date.UTC(2026, 10, 15, 13, 30);   // 20:30 Bangkok
const ctx = { now: open, rnd: () => 0.5, admin: false };
const refused = (r: unknown) => (r as { refused?: string })?.refused ?? null;
describe('⚔ PvP battlefield (director 15 Nov)', () => {
  it('Lv40+, only in a team round\'s lobby, the entry fee once per round', () => {
    const lobby = Date.UTC(2026, 10, 15, 13, 21), fight = Date.UTC(2026, 10, 15, 13, 25);   // (20:21 / 20:25 Bangkok)
    useMem(newMem()); const s = startNewGame(); s.level = 39; s.gold = 20000;
    expect(refused(handlers.enterMap(s, { n: PVP }, { ...ctx, now: lobby }))).toBe('level');
    s.level = 45; expect(refused(handlers.enterMap(s, { n: PVP }, { ...ctx, now: Date.UTC(2026, 10, 15, 3) }))).toBe('closed');
    expect(refused(handlers.enterMap(s, { n: PVP }, { ...ctx, now: fight }))).toBe('closed');   // (the fight started: no way in)
    expect(refused(handlers.enterMap(s, { n: PVP }, { ...ctx, now: lobby }))).toBeNull(); expect(s.gold).toBe(20000 - PVP_FEE);
    handlers.enterMap(s, { n: 0 }, { ...ctx, now: lobby + 1000 }); handlers.enterMap(s, { n: PVP }, { ...ctx, now: lobby + 2000 }); expect(s.gold).toBe(20000 - PVP_FEE);   // (back in the same lobby: no second fee)
  });
  it('long fights: equal power ≈ 12 hits (10-15), better gear fewer, never under 6 or one-shot', () => {
    const t = { pw: 3000, hp: 6000, cls: 'archer' }, hits = (pw: number, cls = 'sword', crit = false) => Math.ceil(t.hp / pvpDamage({ pw, cls }, t, { skill: false, dist: 30, crit }));
    expect(hits(3000)).toBeGreaterThanOrEqual(10); expect(hits(3000)).toBeLessThanOrEqual(15);
    expect(hits(12000)).toBeLessThan(hits(3000)); expect(hits(1e9, 'sword', true)).toBe(6);
  });
  it('the classes stay close at equal power (within ~25% per hit)', () => {
    const t = { pw: 3000, hp: 6000, cls: 'cleric' };
    const v = ['sword', 'archer', 'mage'].map(cls => pvpDamage({ pw: 3000, cls }, t, { skill: false, dist: 90, crit: false })), lo = Math.min(...v), hi = Math.max(...v);
    expect(hi / lo).toBeLessThan(1.25);
  });
});
