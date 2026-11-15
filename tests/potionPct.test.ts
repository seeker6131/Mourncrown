import { it, expect } from 'vitest';
import { startNewGame } from '../src/core/save';
import { derive } from '../src/systems/stats';
import { addItem, useItem } from '../src/systems/inventory';
it('potions heal a share of max HP / MP on top (director 15 Nov: potions must matter at every level)', () => {
  const s = startNewGame(); s.level = 50; const d = derive(s);
  s.hp = 1; addItem(s, 'hp_potion', 1); const it = s.inventory.find(i => i.id === 'hp_potion')!;
  const r = useItem(s, it.uid, Date.now()) as { heal: number };
  expect(r.heal).toBe(Math.min(120 + Math.round(d.maxHp * 0.08), d.maxHp - 1));
  s.mp = 0; addItem(s, 'mp_potion', 1); const m = s.inventory.find(i => i.id === 'mp_potion')!;
  const r2 = useItem(s, m.uid, Date.now() + 5000) as { mana: number };
  expect(r2.mana).toBe(Math.min(60 + Math.round(d.maxMp * 0.1), d.maxMp));
});
