// TESTING ONLY — gives a full SL set for the current class plus resources. Must be removed/disabled before open beta
// (see docs/ONLINE_RISKS.md 1.7): on the online server this would be an admin-only command.
import type { GameState } from '../core/state';
import { ITEMS } from '../data/items';
import { addItem } from './inventory';
import { makeGear, baseTier } from './loot';

export function giveTestKit(s: GameState, rarity = 5, rnd: () => number = Math.random) {
  const cls = s.cls === 'novice' ? 'sword' : s.cls;
  const best = (pred: (d: typeof ITEMS[string]) => boolean) => Object.values(ITEMS).filter(pred).sort((a, b) => baseTier(b) - baseTier(a) || b.price - a.price)[0];
  const picks = [best(d => d.type === 'weapon' && d.cls === cls), best(d => d.type === 'armor'), best(d => d.type === 'accessory')];
  const got: string[] = [];
  for (const d of picks) {
    if (!d) continue;
    if (!addItem(s, d.id, 1, 0, makeGear(rnd, d.id, rarity))) continue;
    s.equip[d.type as 'weapon' | 'armor' | 'accessory'] = s.inventory[s.inventory.length - 1].uid; got.push(d.name);   // test kit ignores the level requirement
  }
  s.gold += 50000; s.res.wood += 5000; s.res.stone += 5000; s.res.food += 2000;
  addItem(s, 'mana_shard', 50); addItem(s, 'hp_potion_l', 20); addItem(s, 'mp_potion', 20);
  for (const id of ['slime_gel', 'spore_cap', 'wolf_pelt', 'goblin_fang', 'wisp_essence', 'ancient_core']) addItem(s, id, 20);
  return got;
}
