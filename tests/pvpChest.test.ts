import { it, expect } from 'vitest';
import { startNewGame } from '../src/core/save';
import { openChest } from '../src/systems/pvpChest';
import { warBag } from '../src/systems/pvp';
import { invSize } from '../src/core/state';

let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
it('battlefield chests: mostly gold / Super Rare, Legend sometimes, SL rarely, Limited very rarely', () => {
  const n = 40000, c = { gold: 0, 3: 0, 4: 0, 5: 0, ltd: 0 } as Record<string, number>;
  for (let i = 0; i < n; i++) {
    const s = startNewGame(); s.level = 50; s.cls = 'sword';
    const p = openChest(s, rnd);
    if (p.kind === 'gold') c.gold++; else if (p.kind === 'gear') c[p.rar]++; else if (p.kind === 'ltd') c.ltd++;
  }
  expect(c.ltd / n).toBeGreaterThan(0.001); expect(c.ltd / n).toBeLessThan(0.006);
  expect(c[5] / n).toBeGreaterThan(0.008); expect(c[5] / n).toBeLessThan(0.025);
  expect(c[4] / n).toBeGreaterThan(0.05); expect(c[4] / n).toBeLessThan(0.11);
  expect(c.gold / n).toBeGreaterThan(0.6);
});
it('gold and gear go into the war bag; a Limited prize is kept for good; a full bag gets gold', () => {
  for (let i = 0; i < 3000; i++) {
    const s = startNewGame(); s.level = 50; s.cls = 'mage';
    const p = openChest(s, rnd), bag = warBag(s);
    if (p.kind === 'gear') expect(bag.items.some(b => b.uid === p.uid)).toBe(true);
    if (p.kind === 'gold') expect(bag.gold).toBe(p.gold);
    if (p.kind === 'ltd') expect(bag.items.length + bag.gold).toBe(0);
  }
  const s = startNewGame(); while (s.inventory.length < invSize(s)) s.inventory.push({ uid: s.nextUid++, id: 'hp_potion', qty: 1, upg: 0 });
  for (let i = 0; i < 200; i++) expect(openChest(s, rnd).kind).not.toBe('gear');
});
