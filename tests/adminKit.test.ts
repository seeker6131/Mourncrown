import { describe, it, expect } from 'vitest';
import { startNewGame } from '../src/core/save';
import { grantAdminKit, adminForm } from '../src/systems/adminKit';
import { ITEMS } from '../src/data/items';
import { invSize } from '../src/core/state';
import { handlers, useMem, newMem } from '../src/server/handlers';

describe("the director's account (no test buttons in the game)", () => {
  it('gets everything once: level 100, last form, gold, one of every item, all maps, mounts', () => {
    const s = startNewGame();
    expect(grantAdminKit(s)).toBe(true);
    expect(s.level).toBe(100); expect(s.tier).toBe(3); expect(s.gold).toBeGreaterThanOrEqual(99_000_000);
    for (const id of Object.keys(ITEMS)) expect(s.inventory.some(i => i.id === id)).toBe(true);
    expect(s.inventory.length).toBeLessThanOrEqual(invSize(s));
    expect(s.equip.weapon).toBeTruthy();
    expect(grantAdminKit(s)).toBe(false);   // once
  });
  it('class / form switch works only for the admin account', () => {
    const s = startNewGame(); grantAdminKit(s); useMem(newMem());
    expect(handlers.adminForm(s, { cls: 'mage', tier: 2 }, { now: 0, rnd: Math.random })).toEqual({ refused: 'admin' });
    expect(handlers.adminForm(s, { cls: 'mage', tier: 2 }, { now: 0, rnd: Math.random, admin: true })).toEqual({ ok: true });
    expect(s.cls).toBe('mage'); expect(s.tier).toBe(2);
    void adminForm;
  });
});
