// Kill rewards for the top-down stages — pure (no Phaser), randomness comes in as rnd.
// When the game goes online this runs on the SERVER: the client only reports "I killed monster X in stage N",
// the server checks it and applies the result. Never trust reward numbers sent by the client.
import type { GameState } from '../core/state';
import { MONSTERS } from '../data/monsters';
import { itemDef } from '../data/items';
import { STAGES, scaleStats, type StageMon } from '../world/stages';
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
  const st = STAGES[stageN - 1], base = MONSTERS[mon.kind], sc = scaleStats(base, st.level, boss), d = derive(s);
  const gold = between(rnd, sc.gold[0], sc.gold[1]), exp = Math.round(sc.exp * d.expBonus);
  s.gold += gold;
  const levels = gainExp(s, exp);
  // village materials: wood and stone from every kill, food by size
  const k = 1 + stageN / 12;
  const wood = Math.round(between(rnd, 1, 3) * k * (boss ? 15 : 1)), stone = Math.round(between(rnd, 0, 2) * k * (boss ? 15 : 1));
  const food = Math.max(1, Math.round((mon.size / 24) * k * (boss ? 10 : 1)));
  s.res.wood += wood; s.res.stone += stone; s.res.food += food;
  // crafting materials from the monster's drop table
  const mats: KillResult['mats'] = [];
  for (const dr of base.drops) {
    if (isGear(itemDef(dr.id)) || rnd() >= dr.chance) continue;
    const qty = dr.min ? between(rnd, dr.min, dr.max ?? dr.min) : 1;
    if (addItem(s, dr.id, qty)) mats.push({ id: dr.id, qty });
  }
  // gear: rarity floor and magic find grow with the stage
  const gear: KillResult['gear'] = [];
  const n = boss ? 3 : rnd() < 0.16 + stageN * 0.002 ? 1 : 0;
  for (let i = 0; i < n; i++) {
    const b = pickBase(rnd, st.level), rar = rollRarity(rnd, st.mf + d.mf, boss ? Math.max(st.minRar, 2) : st.minRar);
    if (addItem(s, b.id, 1, 0, makeGear(rnd, b.id, rar))) gear.push({ id: b.id, rar });
  }
  if (boss) s.bossDefeated = (s.bossDefeated ?? 0) + 1;
  let cleared = false;
  if (lastOfStage) { const sv = s as unknown as { tdCleared?: number }; cleared = true; sv.tdCleared = Math.max(sv.tdCleared ?? 0, stageN); }
  return { gold, exp, levels, wood, stone, food, mats, gear, cleared };
}
