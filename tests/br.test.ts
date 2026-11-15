import { it, expect } from 'vitest';
import { brRound, brZone, brResult, brRoll, brPay, BR_ROUND, BR_LOBBY } from '../src/systems/br';
import { startNewGame } from '../src/core/save';

const bkk = (h: number, m = 0) => Date.UTC(2026, 10, 16, h - 7, m);   // (Bangkok time on 16 Nov)
it('rounds: every 20 min in the open hours, lobby → fight → end; no partial round', () => {
  expect(brRound(bkk(12, 59))).toBeNull();
  const r = brRound(bkk(13, 1))!; expect(r.phase).toBe('lobby'); expect(r.start).toBe(bkk(13));
  expect(brRound(bkk(13, 4))!.phase).toBe('fight'); expect(brRound(bkk(13, 19))!.phase).toBe('end');
  expect(brRound(bkk(13, 20))!.start).toBe(bkk(13, 20)); expect(brRound(bkk(13, 59))!.start).toBe(bkk(13, 40));
  expect(brRound(bkk(14, 0))).toBeNull();
  expect(brRound(bkk(21, 45))!.phase).toBe('fight');
  expect(BR_ROUND).toBe(20 * 60000); expect(BR_LOBBY).toBe(3 * 60000);
});
it('the safe zone shrinks step by step and never grows', () => {
  let last = 1e9; for (let t = 0; t <= 15 * 60000; t += 10000) { const z = brZone(t, 3000, 2000, 7); expect(z.r).toBeLessThanOrEqual(last); last = z.r; }
  expect(brZone(0, 3000, 2000, 7).r).toBeGreaterThan(1800); expect(last).toBeLessThan(250);
});
it('results: most alive, then kills; MVP by kills then damage', () => {
  const r = brResult({ a: ['1', '2'], b: ['3'], c: ['4', '5'] }, new Set(['1', '3', '4', '5']), { 3: 4, 1: 1, 4: 2 }, { 1: 900 });
  expect(r.win).toBe('c'); expect(r.mvp).toBe('3');
  expect(brResult({ a: ['1'], b: ['2'] }, new Set(), {}, {}).win).toBeNull();
});
let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
it('team chest rolls: Legend ~30%, SL ~3%, the dragon very rarely; winners get gold + EXP', () => {
  const c: Record<string, number> = {}; const n = 30000;
  for (let i = 0; i < n; i++) { const s = startNewGame(); s.level = 50; const p = brRoll(s, rnd); const k = p.kind === 'gear' ? 'g' + p.rar : p.kind; c[k] = (c[k] ?? 0) + 1; }
  expect(c.g4 / n).toBeGreaterThan(0.26); expect(c.g4 / n).toBeLessThan(0.34);
  expect(c.g5 / n).toBeGreaterThan(0.02); expect(c.g5 / n).toBeLessThan(0.04);
  expect((c.ltd ?? 0) / n).toBeLessThan(0.003);
  const s = startNewGame(); s.level = 40; const g0 = s.gold; const pay = brPay(s, { win: true, mvp: true });
  expect(s.gold - g0).toBe(25000); expect(pay.exp).toBeGreaterThan(0);
});
