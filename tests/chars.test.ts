import { describe, it, expect } from 'vitest';
import { startNewGame } from '../src/core/save';
import { charList, createChar, switchChar, buySlot, slotCount, activeSlot, SLOT_PRICE, giveToChar } from '../src/systems/chars';
import { addItem } from '../src/systems/inventory';
import { homeOf } from '../src/systems/guild';

const fresh = () => { const s = startNewGame() as ReturnType<typeof startNewGame> & Record<string, unknown>; s.name = 'Toey'; s.level = 40; s.cls = 'sword'; s.tier = 1; s.gold = 5000; s.diamonds = 700; return s; };

describe('several characters on one account', () => {
  it('a second character: its own level / class / bag; gold, diamonds, village and the house chest stay shared', () => {
    const s = fresh(); addItem(s, 'iron_sword', 1); const bag1 = s.inventory.length, b0 = s.buildings.length;
    expect(createChar(s, 'Mage2')).toEqual({ ok: true, slot: 2 });
    expect(charList(s).map(c => [c.slot, c.name, c.active])).toEqual([[1, 'Toey', true], [2, 'Mage2', false]]);
    expect(switchChar(s, 2)).toEqual({ ok: true });
    expect(activeSlot(s)).toBe(2); expect(s.name).toBe('Mage2'); expect(s.level).toBe(1); expect(s.cls).toBe('novice'); expect((s as { tut?: number }).tut).toBe(99);
    expect(s.gold).toBe(5000); expect(s.diamonds).toBe(700); expect(s.buildings.length).toBe(b0);
    expect(s.inventory.some(i => i.id === 'iron_sword')).toBe(false);
    // the house chest: put on one, take on the other
    homeOf(s).stash.push({ uid: 999, id: 'hp_potion_l', qty: 3, upg: 0 });
    s.gold += 100; s.level = 5;
    expect(switchChar(s, 1)).toEqual({ ok: true });
    expect(s.name).toBe('Toey'); expect(s.level).toBe(40); expect(s.cls).toBe('sword'); expect(s.inventory.length).toBe(bag1);
    expect(s.gold).toBe(5100); expect(homeOf(s).stash.some(i => i.id === 'hp_potion_l')).toBe(true);
    expect(charList(s).find(c => c.slot === 2)?.level).toBe(5);
  });
  it('a new character\'s items get numbers the account has not used', () => {
    const s = fresh(); const mine = new Set(s.inventory.map(i => i.uid)); createChar(s, 'Alt');
    const alt = (s as unknown as { alts: Record<string, { inventory: { uid: number }[]; equip: Record<string, number | null> }> }).alts['2'];
    expect(alt.inventory.length).toBeGreaterThan(0); for (const it of alt.inventory) expect(mine.has(it.uid)).toBe(false);
    for (const u of Object.values(alt.equip)) if (u != null) expect(alt.inventory.some(i => i.uid === u)).toBe(true);
  });
  it('2 slots free; more for diamonds up to 4', () => {
    const s = fresh(); expect(slotCount(s)).toBe(2);
    createChar(s, 'Two'); expect(createChar(s, 'Three')).toEqual({ refused: 'slots' });
    s.diamonds = 400; expect(buySlot(s)).toEqual({ ok: true, slots: 3 }); expect(s.diamonds).toBe(400 - SLOT_PRICE);
    expect(createChar(s, 'Three')).toEqual({ ok: true, slot: 3 });
    expect(buySlot(s)).toEqual({ refused: 'diamonds' });
    s.diamonds = 1000; expect(buySlot(s)).toEqual({ ok: true, slots: 4 }); expect(buySlot(s)).toEqual({ refused: 'max' });
  });
  it('switching to yourself or an empty slot is refused', () => {
    const s = fresh(); expect(switchChar(s, 1)).toEqual({ refused: 'same' }); expect(switchChar(s, 2)).toEqual({ refused: 'slot' });
  });
  it('📤 send an item straight into another character\'s bag', () => {
    const s = fresh(); createChar(s, 'Alt');
    addItem(s, 'iron_sword', 1); addItem(s, 'hp_potion_l', 5);
    const sword = s.inventory.find(i => i.id === 'iron_sword')!, pot = s.inventory.find(i => i.id === 'hp_potion_l')!;
    expect(giveToChar(s, sword.uid, 2)).toEqual({ ok: true, name: 'Alt' });
    expect(giveToChar(s, pot.uid, 2, 2)).toEqual({ ok: true, name: 'Alt' }); expect(pot.qty).toBe(3);
    expect(giveToChar(s, 12345, 2)).toEqual({ refused: 'item' }); expect(giveToChar(s, pot.uid, 3)).toEqual({ refused: 'slot' });
    switchChar(s, 2);
    expect(s.inventory.find(i => i.id === 'iron_sword')).toBeTruthy(); expect(s.inventory.find(i => i.id === 'hp_potion_l')?.qty).toBe(2);
  });
});
