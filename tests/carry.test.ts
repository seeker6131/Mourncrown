import { it, expect } from 'vitest';
import { startNewGame } from '../src/core/save';
import { handlers, useMem, newMem, WB_EXP_CAP } from '../src/server/handlers';
import { expToNext } from '../src/systems/stats';
import { LANDS } from '../src/world/stages';

it('a roaming boss far above the hero pays at most 30% of a level (no carrying new accounts to Lv30)', () => {
  const now = Date.UTC(2026, 10, 16, 6); useMem(newMem());
  const s = startNewGame(); s.level = 5; handlers.enterMap(s, { n: 1 }, { now, rnd: () => 0.5 });
  const b = LANDS[4].boss, lv0 = s.level, e0 = s.exp;
  const r = handlers.wbKill(s, { sid: 1, key: b.key, kind: b.kind, lv: 85, share: 0.5, killer: false }, { now, rnd: () => 0.5, admin: true }) as { exp: number };
  expect(r.exp).toBeLessThanOrEqual(Math.round(expToNext(lv0) * WB_EXP_CAP));
  expect(s.level).toBe(lv0); expect(s.exp).toBeGreaterThan(e0);
  // a hero of the boss's level is paid as before (no cap reached)
  useMem(newMem()); const h = startNewGame(); h.level = 80; handlers.enterMap(h, { n: 40 }, { now, rnd: () => 0.5 });
  const r2 = handlers.wbKill(h, { sid: 2, key: b.key, kind: b.kind, lv: 82, share: 0.2, killer: false }, { now: now + 5000, rnd: () => 0.5, admin: true }) as { exp: number };
  expect(r2.exp).toBeGreaterThan(0);
});
