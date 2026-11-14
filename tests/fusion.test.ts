import { describe, it, expect } from 'vitest';
import { startNewGame } from '../src/core/save';
import { addItem, equip } from '../src/systems/inventory';
import { fuseSlots, fuseBonus, fodderList, FUSE_CAP } from '../src/systems/fusion';
import { handlers } from '../src/server/handlers';

const setup = (forgeLv: number) => {
  const s = startNewGame(); s.gold = 1e6; addItem(s, 'mana_shard', 99);
  const f = s.buildings.find(b => b.type === 'forge'); if (f) f.level = forgeLv; else s.buildings.push({ plot: 0, type: 'forge', level: forgeLv, stored: 0, last: 0 });
  addItem(s, 'flame_saber', 1); const target = s.inventory[s.inventory.length - 1]; target.upg = 9;
  const add = (id: string) => { addItem(s, id, 1); return s.inventory[s.inventory.length - 1].uid; };
  return { s, target, add };
};
describe('fusion luck at the forge', () => {
  it('slots by forge level', () => { expect(fuseSlots(setup(1).s)).toBe(1); expect(fuseSlots(setup(3).s)).toBe(2); expect(fuseSlots(setup(5).s)).toBe(3); });
  it('Rare / SR / Legend add luck up to the cap; common gear, worn or the target itself cannot be used', () => {
    const { s, target, add } = setup(5);
    const r = add('chain_mail'), sr = add('knight_plate'), l = add('dragonscale'), c = add('cloth_tunic');
    expect(fuseBonus(s, [r], target.uid)).toBe(3); expect(fuseBonus(s, [r, sr], target.uid)).toBe(9); expect(fuseBonus(s, [r, sr, l], target.uid)).toBe(FUSE_CAP);
    expect(fodderList(s, [c], target.uid)).toBeNull(); expect(fodderList(s, [target.uid], target.uid)).toBeNull();
    equip(s, r); expect(fodderList(s, [r], target.uid)).toBeNull();
  });
  it('the sacrificed pieces are gone whatever the result; more than the slots is refused', () => {
    const { s, target, add } = setup(1);
    const a = add('chain_mail'), b = add('ruby_amulet');
    expect(handlers.upgradeItem(s, { uid: target.uid, fodder: [a, b] }, { now: 0, rnd: () => 0.99, admin: false } as never)).toBe('invalid');
    expect(handlers.upgradeItem(s, { uid: target.uid, fodder: [a] }, { now: 0, rnd: () => 0.99, admin: false } as never)).toBe('fail');
    expect(s.inventory.some(i => i.uid === a)).toBe(false); expect(s.inventory.some(i => i.uid === b)).toBe(true);
    // +9 → +10 is 15%; with a Legend (+12) a roll of 0.2 succeeds
    const l = add('dragonscale');
    expect(handlers.upgradeItem(s, { uid: target.uid, fodder: [l] }, { now: 0, rnd: () => 0.2, admin: false } as never)).toBe('ok'); expect(target.upg).toBe(10);
  });
});
