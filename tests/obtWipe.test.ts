import { describe, it, expect } from 'vitest';
import { wipeSave, wipeSummary, KEEP_OPTS } from '../src/systems/obtWipe';

const old = {
  name: 'Tester', look: 'f', level: 80, exp: 999, gold: 188150, diamonds: 320, vipTier: 2, vipUntil: Date.now() + 86400000,
  inventory: [{ uid: 1, id: 'sword_sl', qty: 1 }], equip: { weapon: 1 }, res: { wood: 9 }, buildings: [{ plot: 1 }], cls: 'archer', tier: 3,
  wings: ['ltd', 'legend', 'x_cosmos'], wingOn: 'legend', mounts: ['horse', 'dragon', 'wolf'], mountLast: 'dragon',
  titles: ['cbt', 'k1', 'storm'], title: 'k1', pets: ['cloud'], stars: 130, guild: { id: 'g1' }, guildId: 'g1',
  payRefs: ['slip1'], topups: 1, topupThb: 99, supPaid: 99, supTier: 1, uiOpt: { scale: 0.9 }, slotsBought: 1, mail: [{ title: 'x' }],
};
const def = KEEP_OPTS.filter(o => o.def).map(o => o.id);

describe('🧹 OBT wipe', () => {
  it('starts every character over: level, gold, items, village, class all gone', () => {
    const n = wipeSave(old, def, 5);
    expect(n.level).toBe(1); expect(n.gold).not.toBe(188150); expect(n.cls).toBe('novice'); expect(n.tier ?? 0).toBe(0);
    expect((n.inventory as { id: string }[]).some(i => i.id === 'sword_sl')).toBe(false);
    expect(n.buildings).toEqual([]); expect(n.guildId).toBeUndefined(); expect(n.mail ?? []).toEqual([]); expect(n.obtAt).toBe(5);
  });
  it('the default ticks keep the paid things and the Limited ones only', () => {
    const n = wipeSave(old, def, 5);
    expect(n.name).toBe('Tester'); expect(n.diamonds).toBe(320); expect(n.vipTier ?? 0).toBe(0); expect(n.vipUntil ?? 0).toBe(0); expect(n.pets).toEqual(['cloud']); expect(n.stars).toBe(130);
    expect(n.wings).toEqual(['ltd', 'x_cosmos']); expect(n.wingOn).toBeUndefined();   // (the worn wing was not Limited)
    expect(n.mounts).toEqual(['dragon']); expect(n.mountLast).toBe('dragon');
    expect(n.titles).toEqual(['cbt', 'storm']); expect(n.title).toBeUndefined();
    expect(n.slotsBought).toBe(1); expect(n.uiOpt).toEqual({ scale: 0.9 });
  });
  it('the money records and the diamonds stay whatever is ticked', () => {
    const n = wipeSave(old, [], 5);
    expect(n.payRefs).toEqual(['slip1']); expect(n.topupThb).toBe(99); expect(n.supPaid).toBe(99);
    expect(n.diamonds).toBe(320); expect(n.wings).toBeUndefined(); expect(n.name).toBeUndefined();
  });
  it('"all wings / all mounts / all titles / guild" keep everything of that kind', () => {
    const n = wipeSave(old, ['wingAll', 'mounts', 'titleAll', 'guild'], 5);
    expect(n.wings).toEqual(old.wings); expect(n.wingOn).toBe('legend'); expect(n.mounts).toEqual(old.mounts); expect(n.titles).toEqual(old.titles); expect(n.guildId).toBe('g1');
  });
  it('the dry run counts what stays and goes', () => {
    const s = wipeSummary([old, { level: 3, gold: 50 }], def);
    expect(s.players).toBe(2); expect(s.diaKept).toBe(320); expect(s.wingsKept).toBe(2); expect(s.goldGone).toBe(188200); expect(s.topLevel).toBe(80);
  });
});
describe('🧹 OBT wipe start kit', () => {
  it('a wiped character starts like a new player: wooden sword + tunic worn, a few potions, full HP', () => {
    const n = wipeSave({ level: 50 }, [], 1) as { inventory: { id: string }[]; equip: { weapon: number | null }; hp: number };
    expect(n.inventory.map(i => i.id)).toEqual(['wood_sword', 'cloth_tunic', 'hp_potion', 'mp_potion']); expect(n.equip.weapon).not.toBeNull(); expect(n.hp).toBeGreaterThan(1);
  });
});
