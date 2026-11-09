// Kill rewards for the top-down stages — pure (no Phaser), randomness comes in as rnd.
// When the game goes online this runs on the SERVER: the client only reports "I killed monster X in stage N",
// the server checks it and applies the result. Never trust reward numbers sent by the client.
import type { GameState } from '../core/state';
import { MONSTERS } from '../data/monsters';
import { itemDef } from '../data/items';
import { stageOf, scaleStats, WILD, DUNGEON, isDungeon, type StageMon } from '../world/stages';
import { derive, gainExp } from './stats';
import { addItem } from './inventory';
import { pickBase, rollRarity, makeGear, isGear } from './loot';
import { LAND_SET } from '../data/sets';

export interface KillResult {
  elite?: boolean;
  gold: number; exp: number; levels: number; wood: number; stone: number; food: number;
  mats: { id: string; qty: number }[];
  gear: { id: string; rar: number; set?: string }[];
  cleared: boolean;
}

/** guaranteed SL after this many gear drops without one */
export const SL_PITY = 15000;
const between = (rnd: () => number, a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));

/** Apply the rewards for killing `mon` in stage `stageN`. `lastOfStage` = it was the last monster alive. */
/** elite = a golden monster (5x HP): 5x gold, 3x EXP, a sure gear drop one rarity higher, 15% chance it is a set piece */
/** give = where loot goes (default: straight into the bag; the server drops it on the ground instead) */
export type Give = (id: string, qty: number, gear?: { rar?: number; aff?: { k: string; v: number }[]; set?: string }) => boolean;
export function applyKill(s: GameState, stageN: number, mon: StageMon, boss: boolean, lastOfStage: boolean, rnd: () => number = Math.random, elite = false, give: Give = (id, q, g) => addItem(s, id, q, 0, g)): KillResult {
  const st = stageOf(stageN, s.level), base = MONSTERS[mon.kind], sc = scaleStats(base, st.level, boss), d = derive(s);
  const animal = !!base.animal;
  const vip = ((s as GameState & { vipUntil?: number }).vipUntil ?? 0) > Date.now();
  const gold = animal ? 0 : Math.round(between(rnd, sc.gold[0], sc.gold[1]) * (vip ? 1.3 : 1) * (elite ? 5 : 1)), exp = Math.round(sc.exp * d.expBonus * (base.animal ? 0.5 : 1) * (elite ? 3 : 1));
  s.gold += gold;
  (s as GameState & { tdKills?: number }).tdKills = ((s as GameState & { tdKills?: number }).tdKills ?? 0) + 1;
  const levels = gainExp(s, exp);
  const effN = isDungeon(stageN) ? (stageN - DUNGEON) * 10 + 5 : stageN === WILD ? 1 : stageN;   // map tier for drop rates
  const k = stageN === WILD ? 1 + s.level / 25 : 1 + effN / 12;
  // monsters ≠ resources: wood / stone / meat come only from the Deepwild (animals + gathering); monsters give EXP, gold and items
  const wood = 0, stone = 0;
  const food = animal ? Math.round(between(rnd, base.meat?.[0] ?? 2, base.meat?.[1] ?? 6) * k * 1.5) : 0;
  s.res.wood += wood; s.res.stone += stone; s.res.food += food;
  // crafting materials from the monster's drop table
  const mats: KillResult['mats'] = [];
  if (animal && rnd() < 0.35 && give('wolf_pelt', 1)) mats.push({ id: 'wolf_pelt', qty: 1 });   // hides for building upgrades
  for (const dr of base.drops) {
    if (isGear(itemDef(dr.id)) || rnd() >= dr.chance) continue;
    const qty = dr.min ? between(rnd, dr.min, dr.max ?? dr.min) : 1;
    if (give(dr.id, qty)) mats.push({ id: dr.id, qty });
  }
  // gear: rarity floor and magic find grow with the stage
  const gear: KillResult['gear'] = [];
  const n = animal ? 0 : boss ? 3 : elite ? 1 : rnd() < 0.04 + effN * 0.0006 ? 1 : 0;
  const setId = LAND_SET[st.land.id];
  for (let i = 0; i < n; i++) {
    let rar = Math.min(5, rollRarity(rnd, st.mf + d.mf, boss ? Math.max(st.minRar, 2) : elite ? st.minRar + 1 : st.minRar));
    // SL pity: no SL in SL_PITY gear drops -> the next one is SL
    const pv = s as GameState & { slPity?: number }; pv.slPity = rar === 5 ? 0 : (pv.slPity ?? 0) + 1;
    if (pv.slPity >= SL_PITY) { rar = 5; pv.slPity = 0; }
    const b = pickBase(rnd, st.level, s.cls);
    const set = (boss && i === 0) || (elite && rnd() < 0.15) ? setId : undefined;
    if (give(b.id, 1, { ...makeGear(rnd, b.id, rar), ...(set ? { set } : {}) })) gear.push({ id: b.id, rar, set });
  }
  if (boss) s.bossDefeated = (s.bossDefeated ?? 0) + 1;
  let cleared = false;
  if (lastOfStage) { const sv = s as unknown as { tdCleared?: number }; cleared = true; sv.tdCleared = Math.max(sv.tdCleared ?? 0, stageN); }
  return { elite, gold, exp, levels, wood, stone, food, mats, gear, cleared };
}
