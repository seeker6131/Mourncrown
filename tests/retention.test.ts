import { invSize } from '../src/core/state';
import { describe, it, expect, beforeEach } from 'vitest';
import { startNewGame } from '../src/core/save';
import { derive } from '../src/systems/stats';
import { applyKill } from '../src/systems/rewards';
import { STAGES } from '../src/world/stages';
import { setBonus } from '../src/data/sets';
import { claimAch, achProgress, ACHS, pstats, titleOf } from '../src/data/achievements';
import { claimLogin, loginInfo, tutPay } from '../src/systems/progress';
import type { GameState } from '../src/core/state';

let s: GameState;
beforeEach(() => { s = startNewGame(); });

describe('gear sets', () => {
  it('2 pieces give the first bonus, 3 the full one', () => {
    expect(setBonus(['root'])).toEqual({});
    expect(setBonus(['root', 'root'])).toEqual({ hp: 10 });
    expect(setBonus(['root', 'root', 'root'])).toEqual({ atk: 10, hp: 15 });
  });
  it('wearing set pieces raises stats', () => {
    const hp0 = derive(s).maxHp;
    for (const sl of ['weapon', 'armor'] as const) s.inventory.find(i => i.uid === s.equip[sl])!.set = 'root';
    expect(derive(s).maxHp).toBeGreaterThan(hp0);
  });
});
describe('golden monsters', () => {
  it('give 5x gold, 3x EXP and a sure gear drop', () => {
    const mon = STAGES[0].land.mobs[0], a = startNewGame(), b = startNewGame(), r = () => 0.1;   // 0.1: the normal kill drops gold too
    const n = applyKill(a, 1, mon, false, false, r), e = applyKill(b, 1, mon, false, false, r, true);
    expect(e.gold).toBe(n.gold * 5); expect(e.exp).toBe(n.exp * 3); expect(e.gear.length).toBe(1);
  });
  it('a boss always drops one set piece of its land', () => {
    const st = STAGES[9]; const r = applyKill(s, 10, st.land.boss, true, true, () => 0.5);
    expect(r.gear.filter(g => g.set === 'root').length).toBeGreaterThanOrEqual(1);
  });
});
describe('achievements / titles', () => {
  it('claim once when reached, title is set', () => {
    expect(claimAch(s, 'k1')).toBe('locked');
    pstats(s).kills = 100; const g0 = s.gold;
    expect(typeof claimAch(s, 'k1')).toBe('object'); expect(s.gold).toBe(g0 + 300); expect(titleOf(s)).toBe('นักล่ามือใหม่');
    expect(claimAch(s, 'k1')).toBe('claimed');
    expect(achProgress(s, ACHS.find(a => a.id === 'k2')!)).toBe(100);
  });
});
describe('login + tutorial', () => {
  it('one login gift per day, 7-day cycle', () => {
    const d1 = Date.UTC(2026, 10, 9, 12), day = 86400000;
    expect(claimLogin(s, d1)).not.toBeNull(); expect(claimLogin(s, d1 + 1000)).toBeNull();
    for (let i = 1; i < 7; i++) claimLogin(s, d1 + i * day);
    expect(loginInfo(s, d1 + 7 * day).day).toBe(0);
  });
  it('tutorial reward only once', () => { expect(tutPay(s)).toBe(true); expect(tutPay(s)).toBe(false); });
});
describe('SL pity', () => {
  it('the drop after 15,000 without SL is SL', async () => {
    const { SL_PITY } = await import('../src/systems/rewards');
    (s as GameState & { slPity?: number }).slPity = SL_PITY - 1;
    const r = applyKill(s, 1, STAGES[0].land.mobs[0], false, false, () => 0.01, true);   // golden: sure gear drop
    expect(r.gear[0].rar).toBe(5);
  });
  it('a full bag: the day waits (nothing lost), then pays once there is room', () => {
    const s = startNewGame(), d1 = Date.parse('2026-11-14T10:00:00+07:00');
    s.inventory = s.inventory.filter(i => i.id !== 'hp_potion');
    while (s.inventory.length < invSize(s)) s.inventory.push({ uid: s.nextUid++, id: 'wood_sword', qty: 1, upg: 0 });
    const g0 = s.gold; expect(claimLogin(s, d1)).toBe('bag'); expect(s.gold).toBe(g0); expect(loginInfo(s, d1).ready).toBe(true);
    s.inventory.pop(); const r = claimLogin(s, d1); expect(r && r !== 'bag').toBe(true); expect(s.gold).toBe(g0 + 300); expect(claimLogin(s, d1)).toBeNull();
  });
});
