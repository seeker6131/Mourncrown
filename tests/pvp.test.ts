import { describe, it, expect } from 'vitest';
import { startNewGame } from '../src/core/save';
import { handlers, useMem, newMem } from '../src/server/handlers';
import { PVP } from '../src/world/stages';
import { PVP_FEE, pvpDamage, loseWarBag, warBag, pvpOpen } from '../src/systems/pvp';

const open = Date.UTC(2026, 10, 15, 13, 30);   // 20:30 Bangkok
const ctx = { now: open, rnd: () => 0.5, admin: false };
const refused = (r: unknown) => (r as { refused?: string })?.refused ?? null;
describe('⚔ PvP battlefield (director 15 Nov)', () => {
  it('Lv40+, open hours, entry fee once per visit', () => {
    useMem(newMem()); const s = startNewGame(); s.level = 39; s.gold = 20000;
    expect(refused(handlers.enterMap(s, { n: PVP }, ctx))).toBe('level');
    s.level = 45; expect(refused(handlers.enterMap(s, { n: PVP }, { ...ctx, now: Date.UTC(2026, 10, 15, 3) }))).toBe('closed');
    expect(pvpOpen(open)).toBe(true);
    expect(refused(handlers.enterMap(s, { n: PVP }, ctx))).toBeNull(); expect(s.gold).toBe(20000 - PVP_FEE);
    handlers.enterMap(s, { n: PVP }, ctx); expect(s.gold).toBe(20000 - PVP_FEE);   // (the same visit: no second fee)
  });
  it('a fall drops only the war bag; worn / brought gear stays; then out for a while', () => {
    useMem(newMem()); const s = startNewGame(); s.level = 45; s.gold = 20000;
    handlers.enterMap(s, { n: PVP }, ctx); const keep = s.inventory.length;
    s.inventory.push({ uid: 900, id: 'hp_potion_l', qty: 3 } as never); warBag(s).items.push({ id: 'hp_potion_l', qty: 3 }); s.gold += 1200; warBag(s).gold += 1200;
    const out = loseWarBag(s, open); expect(out.gold).toBe(1200); expect(out.items.length).toBe(1);
    expect(s.inventory.length).toBe(keep); expect(s.gold).toBe(20000 - PVP_FEE);
    expect(refused(handlers.enterMap(s, { n: PVP }, { ...ctx, now: open + 60000 }))).toBe('out');
  });
  it('no one-shots: a hit is at most 12% of the target (skills 18%), whatever the gear', () => {
    const big = { atk: 99999, matk: 99999, cls: 'sword', lv: 100 }, tgt = { def: 10, hp: 5000, cls: 'archer', lv: 60 };
    expect(pvpDamage(big, tgt, { skill: false, dist: 30, crit: true })).toBe(600);
    expect(pvpDamage(big, tgt, { skill: true, dist: 30, crit: true })).toBe(900);
  });
  it('the classes stay close: same gear power, sword vs mage vs archer within ~25% per hit', () => {
    const t = { def: 200, hp: 50000, cls: 'cleric', lv: 60 };
    const hit = (cls: string) => pvpDamage({ atk: 1500, matk: 1500, cls, lv: 60 }, t, { skill: false, dist: 90, crit: false });
    const v = ['sword', 'archer', 'mage'].map(hit), lo = Math.min(...v), hi = Math.max(...v);
    expect(hi / lo).toBeLessThan(1.25);
  });
});
