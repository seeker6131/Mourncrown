// Kill rewards for the top-down stages — pure (no Phaser), randomness comes in as rnd.
// When the game goes online this runs on the SERVER: the client only reports "I killed monster X in stage N",
// the server checks it and applies the result. Never trust reward numbers sent by the client.
import type { GameState } from '../core/state';
import { MONSTERS } from '../data/monsters';
import { itemDef } from '../data/items';
import { stageOf, scaleStats, WILD, type StageMon } from '../world/stages';
import { derive, gainExp } from './stats';
import { addItem } from './inventory';
import { pickBase, rollRarity, makeGear, isGear } from './loot';

export interface KillResult {
  gold: number; exp: number; levels: number; wood: number; stone: number; food: number;
  mats: { id: string; qty: number }[];
  gear: { id: string; rar: number }[];
  cleared: boolean;
}

const between = (rnd: () => number, a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));

/** Apply the rewards for killing `mon` in stage `stageN`. `lastOfStage` = it was the last monster alive. */
export function applyKill(s: GameState, stageN: number, mon: StageMon, boss: boolean, lastOfStage: boolean, rnd: () => number = Math.random): KillResult {
  const st = stageOf(stageN, s.level), base = MONSTERS[mon.kind], sc = scaleStats(base, st.level, boss), d = derive(s);
  const animal = !!base.animal;
  const vip = ((s as GameState & { vipUntil?: number }).vipUntil ?? 0) > Date.now();
  const gold = animal ? 0 : Math.round(between(rnd, sc.gold[0], sc.gold[1]) * (vip ? 1.3 : 1)), exp = Math.round(sc.exp * d.expBonus * (base.animal ? 0.5 : 1));
  s.gold += gold;
  (s as GameState & { tdKills?: number }).tdKills = ((s as GameState & { tdKills?: number }).tdKills ?? 0) + 1;
  const levels = gainExp(s, exp);
  // village materials: wood and stone from every kill, food by size
  const k = stageN === WILD ? 1 + s.level / 25 : 1 + stageN / 12;
  const wood = animal ? 0 : Math.round(between(rnd, 1, 3) * k * (boss ? 15 : 1)), stone = animal ? 0 : Math.round(between(rnd, 0, 2) * k * (boss ? 15 : 1));
  const food = animal ? Math.round(between(rnd, base.meat?.[0] ?? 2, base.meat?.[1] ?? 6) * k * 1.5) : boss ? Math.round(10 * k) : rnd() < 0.35 ? 1 : 0;
  s.res.wood += wood; s.res.stone += stone; s.res.food += food;
  // crafting materials from the monster's drop table
  const mats: KillResult['mats'] = [];
  if (animal && rnd() < 0.35 && addItem(s, 'wolf_pelt', 1)) mats.push({ id: 'wolf_pelt', qty: 1 });   // hides for building upgrades
  for (const dr of base.drops) {
    if (isGear(itemDef(dr.id)) || rnd() >= dr.chance) continue;
    const qty = dr.min ? between(rnd, dr.min, dr.max ?? dr.min) : 1;
    if (addItem(s, dr.id, qty)) mats.push({ id: dr.id, qty });
  }
  // gear: rarity floor and magic find grow with the stage
  const gear: KillResult['gear'] = [];
  const n = animal ? 0 : boss ? 3 : rnd() < 0.04 + stageN * 0.0006 ? 1 : 0;
  for (let i = 0; i < n; i++) {
    const b = pickBase(rnd, st.level, s.cls), rar = rollRarity(rnd, st.mf + d.mf, boss ? Math.max(st.minRar, 2) : st.minRar);
    if (addItem(s, b.id, 1, 0, makeGear(rnd, b.id, rar))) gear.push({ id: b.id, rar });
  }
  if (boss) s.bossDefeated = (s.bossDefeated ?? 0) + 1;
  let cleared = false;
  if (lastOfStage) { const sv = s as unknown as { tdCleared?: number }; cleared = true; sv.tdCleared = Math.max(sv.tdCleared ?? 0, stageN); }
  return { gold, exp, levels, wood, stone, food, mats, gear, cleared };
}
