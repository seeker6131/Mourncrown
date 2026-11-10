import { it, expect } from 'vitest';
// Balance guard: a hero of the stage's level with typical gear vs that stage's monsters.
import { startNewGame } from '../src/core/save';
import { derive, calcDamage } from '../src/systems/stats';
import { STAGES, scaleStats } from '../src/world/stages';
import { MONSTERS } from '../src/data/monsters';
import { addItem, equip } from '../src/systems/inventory';
import { pickBase, makeGear } from '../src/systems/loot';
it('every stage stays balanced (normal ~3 hits, boss ~120 hits, survivable)', () => {
  const rows: string[] = [];
  for (const n of [1, 5, 9, 10, 15, 20, 25, 30, 35, 40, 45, 50]) {
    const st = STAGES[n - 1], s = startNewGame();
    s.level = st.level; s.cls = n >= 4 ? 'sword' : 'novice'; s.tier = st.level >= 80 ? 3 : st.level >= 40 ? 2 : st.level >= 10 ? 1 : 0; s.useTier = s.tier;
    // typical gear a player of that level wears (items have one fixed rarity, no level requirement): Common → Super Rare
    const typical = (L: number) => (L < 15 ? 0 : L < 35 ? 1 : L < 60 ? 2 : 3);
    let seed = n; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (const slot of ['weapon', 'armor', 'accessory']) {
      for (let k = 0; k < 40; k++) { const b = pickBase(rnd, typical(st.level), 'sword', slot); if (b.cls && b.cls !== 'sword') continue; addItem(s, b.id, 1, 0, makeGear(rnd, b.id)); equip(s, s.inventory[s.inventory.length - 1].uid); break; }
    }
    const d = derive(s); s.hp = d.maxHp;
    const mon = st.boss ? st.land.boss : st.land.mobs[0], base = MONSTERS[mon.kind], ms = scaleStats(base, st.level, st.boss);
    const avg = (f: () => number) => { let t = 0; for (let i = 0; i < 400; i++) t += f(); return t / 400; };
    const heroHit = avg(() => calcDamage(d.atk, ms.def, 1, d.crit).dmg), monHit = avg(() => calcDamage(ms.atk, d.def, 1, 0.05, Math.random, d.evade).dmg);
    const hitsToKill = ms.hp / heroHit, secToKill = hitsToKill * d.attackInterval / 1000;
    const monCd = (base as unknown as { attackCooldown: number }).attackCooldown / 1000, secToDie = d.maxHp / monHit * monCd;
    if (st.boss) { expect(hitsToKill).toBeGreaterThan(55); expect(hitsToKill).toBeLessThan(180); expect(secToDie).toBeGreaterThan(15); }
    else { expect(hitsToKill).toBeGreaterThan(1); expect(hitsToKill).toBeLessThan(5); expect(secToDie).toBeGreaterThan(25); }
    rows.push(`stage ${n}${st.boss ? ' BOSS' : ''} mobLv ${st.level} | hero HP ${d.maxHp} ATK ${d.atk} DEF ${d.def} | mon HP ${ms.hp} ATK ${ms.atk} DEF ${ms.def} | kill ${secToKill.toFixed(1)}s (${hitsToKill.toFixed(1)} hits) | die in ${secToDie.toFixed(0)}s vs 1 mon`);
  }
  if ((globalThis as { SIM?: boolean }).SIM) console.log(rows.join('\n'));
});
