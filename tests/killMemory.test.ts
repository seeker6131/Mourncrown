import { describe, it, expect } from 'vitest';
import { startNewGame } from '../src/core/save';
import { handlers, useMem, newMem } from '../src/server/handlers';
import { STAGES } from '../src/world/stages';

const ctx = { now: 1_800_000_000_000, rnd: () => 0.5, admin: false };
const mob = (n: number) => STAGES[n - 1].land.mobs[0];
const killArgs = (n: number, sid = 77, boss = false) => ({ sid, kind: mob(n).kind, key: mob(n).key, name: mob(n).name, size: mob(n).size, boss, share: 1, n });
const refused = (r: unknown) => !!r && typeof r === 'object' && 'refused' in (r as object) ? (r as { refused: string }).refused : null;

describe('a kill still counts after the server forgot this player (its object slept / the server restarted)', () => {
  it('a plain monster on a map the hero may be on: paid', () => {
    useMem(newMem()); const s = startNewGame(); s.level = 5;
    const r = handlers.kill(s, killArgs(1), ctx);
    expect(refused(r)).toBeNull(); expect((r as { exp: number }).exp).toBeGreaterThan(0);
  });
  it('a map above the hero\'s level is not taken; a boss or an unknown map is not either', () => {
    useMem(newMem()); const s = startNewGame(); s.level = 1;
    expect(refused(handlers.kill(s, killArgs(40), ctx))).toBe('map');
    useMem(newMem()); expect(refused(handlers.kill(s, { ...killArgs(1), boss: true }, ctx))).toBe('spawn');
    useMem(newMem()); expect(refused(handlers.kill(s, { ...killArgs(1), n: 0 }, ctx))).toBe('map');
  });
  it('a forgotten monster counts once; a number newer than the restart must have been registered', () => {
    useMem(newMem()); const s = startNewGame(); s.level = 5;
    handlers.spawn(s, { key: mob(1).key, boss: false, sid: 500 }, ctx);   // (the first monster after the restart)
    expect(refused(handlers.kill(s, killArgs(1, 120), ctx))).toBeNull();          // spawned before: paid
    expect(refused(handlers.kill(s, killArgs(1, 120), ctx))).toBe('spawn');       // the same one again: no
    expect(refused(handlers.kill(s, killArgs(1, 9999), ctx))).toBe('spawn');      // invented, newer than the restart: no
    expect(refused(handlers.kill(s, killArgs(1, 500), ctx))).toBeNull();          // registered: paid
  });
  it('a monster of another land on this map is refused', () => {
    useMem(newMem()); const s = startNewGame(); s.level = 5;
    const other = STAGES[45].land.mobs[0];
    expect(refused(handlers.kill(s, { ...killArgs(1), kind: other.kind, key: other.key }, ctx))).toBe('kind');
  });
  it('gathering in the Deepwild still works after the server forgot (the energy a day still limits it)', () => {
    useMem(newMem()); const s = startNewGame(); s.level = 5;
    expect(refused(handlers.gather(s, { node: 3, kind: 'wood', pit: -1 }, ctx))).toBe('map');
    useMem(newMem());
    expect(refused(handlers.gather(s, { node: 3, kind: 'wood', pit: -1, w: 1 }, ctx))).toBeNull();
  });
});
