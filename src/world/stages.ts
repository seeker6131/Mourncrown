// 50 stages in 5 lands. Monster level, numbers and loot rarity scale with the stage; every 10th stage is a boss.
import type { MonsterKind } from '../data/monsters';
import { expToNext } from '../systems/stats';

export interface StageMon { key: string; kind: MonsterKind; name: string; size: number }
export interface Land { id: string; name: string; ground: 'forest' | 'haunt' | 'lava' | 'snow' | 'dung'; mobs: StageMon[]; boss: StageMon }
/** a farming map: monsters respawn forever; `req` = hero level needed to enter (unlock by level, not by clearing) */
export interface Stage { n: number; land: Land; level: number; req: number; count: number; boss: boolean; minRar: number; mf: number }

const M = (key: string, kind: MonsterKind, name: string, size = 48): StageMon => ({ key, kind, name, size });
export const LANDS: Land[] = [
  { id: 'forest', name: 'ป่าเอลเดอร์โกรฟ', ground: 'forest', boss: M('bs1', 'treant', 'มารดารากเน่า', 128),
    mobs: [M('mo1', 'slime', 'ก้อนโคลนกลืนกิน', 32), M('mo2', 'shroom', 'ซากเห็ดเน่า'), M('mo3', 'wolf', 'หมาป่ากลวงโหว่'), M('mo4', 'goblin', 'ภูตหนามสวมหน้ากาก'), M('mo5', 'wisp', 'ผีเสื้อกลางคืนหน้ากะโหลก')] },
  { id: 'haunt', name: 'ป่าผีสิง', ground: 'haunt', boss: M('bs2', 'stag', 'ราชากวางโครงกระดูก', 128),
    mobs: [M('mo6', 'rat', 'หนูแทะซาก', 32), M('mo7', 'skeleton', 'อัศวินเปลือกกลวง'), M('mo8', 'skarcher', 'นักธนูกระดูกเขากวาง'), M('mo9', 'ghost', 'วิญญาณผ้าคลุมหน้า'), M('mo10', 'spider', 'แมงมุมปากคน')] },
  { id: 'lava', name: 'ดินแดนลาวา', ground: 'lava', boss: M('bs3', 'dragon', 'อสรพิษแก้วดำ', 128),
    mobs: [M('mo11', 'imp', 'ปีศาจเถ้าถ่าน', 32), M('mo12', 'golem', 'ยักษ์ตะกรันโซ่ตรวน', 64), M('mo13', 'salamander', 'กิ้งก่าแมกมาหกขา')] },
  { id: 'snow', name: 'ภูเขาหิมะนิรันดร์', ground: 'snow', boss: M('bs4', 'frostgiant', 'ผู้คุมเหมันต์', 128),
    mobs: [M('mo14', 'icewolf', 'นักล่าเหมันต์'), M('mo15', 'yeti', 'ยักษ์หน้ากากน้ำแข็ง', 64)] },
  { id: 'dung', name: 'คุกใต้ดินเหวลึก', ground: 'dung', boss: M('bs5', 'skking', 'มงกุฎกลวง', 128),
    mobs: [M('mo6', 'rat', 'หนูแทะซาก', 32), M('mo7', 'skeleton', 'อัศวินเปลือกกลวง'), M('mo9', 'ghost', 'วิญญาณผ้าคลุมหน้า'), M('mo10', 'spider', 'แมงมุมปากคน'), M('mo18', 'jailer', 'ผู้คุมคุกโซ่ตรวน')] },
];
export const STAGES: Stage[] = Array.from({ length: 50 }, (_, i) => {
  const n = i + 1, land = LANDS[Math.floor(i / 10)], boss = n % 10 === 0;
  const level = Math.round(1 + (n - 1) * 2.05);
  return { n, land, level, req: Math.max(1, level - 2), count: 26 + Math.floor(n / 2), boss,
           minRar: n >= 41 ? 2 : n >= 21 ? 1 : 0, mf: n * 3 + (boss ? 60 : 0) };
});
/** The Deepwild (ป่าดงดิบ): one big shared jungle for the whole server — no monsters, only game animals, trees,
 *  mine pits and rare ore veins. Animals scale to the hero's level. Entered from the map select (free, any level). */
export const WILD = 100;
/** the Deepwild's game (deer, boar) */
export const WILD_GAME: StageMon[] = [{ key: 'mo16', kind: 'deer', name: 'กวางป่า', size: 48 }, { key: 'mo17', kind: 'boar', name: 'หมูป่า', size: 48 }];
export const wildStage = (level: number): Stage => ({ n: WILD, land: LANDS[0], level: Math.max(1, level), req: 1, count: 0, boss: false, minRar: 0, mf: 0 });
/** Daily dungeon (ถ้ำเงา): map id DUNGEON + land index. Waves of the land's monsters at the hero's level, then its boss. */
export const DUNGEON = 200;
export const isDungeon = (n: number) => n >= DUNGEON && n < DUNGEON + LANDS.length;
export const DUNGEON_WAVES = [6, 8, 10];          // + the land boss as the last wave
export const DUNGEON_NEED = DUNGEON_WAVES.reduce((a, b) => a + b, 0) + 1;
export const DUNGEON_SECS = 300;
/** the best land a hero of this level may enter */
export const dungeonLand = (level: number) => { let li = 0; LANDS.forEach((_, i) => { if (level >= STAGES[i * 10].req) li = i; }); return li; };
export const dungeonStage = (li: number, level: number): Stage => { const f = STAGES[li * 10]; return { n: DUNGEON + li, land: LANDS[li], level: Math.max(f.level, level), req: f.req, count: 0, boss: false, minRar: Math.max(1, f.minRar), mf: 40 + li * 20 }; };
export const stageOf = (n: number, level: number): Stage => n === WILD ? wildStage(level) : isDungeon(n) ? dungeonStage(n - DUNGEON, level) : STAGES[n - 1];
/** mine pits of the Deepwild: each pit has its own ore, rare gem and the level needed to dig there */
export const PITS = [
  { ore: 'ore_iron', gem: 'gem_emerald', req: 1, name: 'เหมืองเหล็ก' },
  { ore: 'ore_silver', gem: 'gem_soul', req: 20, name: 'เหมืองเงิน' },
  { ore: 'ore_obsidian', gem: 'gem_magma', req: 40, name: 'เหมืองออบซิเดียน' },
  { ore: 'ore_frost', gem: 'gem_frosttear', req: 60, name: 'เหมืองคริสตัล' },
  { ore: 'ore_mithril', gem: 'gem_crown', req: 80, name: 'เหมืองมิธริล' },
];
/** Monster stats for a stage level, tuned against a reference hero of the same level (typical gear):
 *  ATK ≈ 10+5L, HP ≈ 150+43L, DEF ≈ 1.7L (checked with tests/sim). Targets: a normal monster dies in ~3 hits and
 *  alone would kill the hero in ~55 s; a boss takes ~120 hits (about a minute with skills) and kills in ~28 s.
 *  Each monster keeps its own character via kind factors (tougher / harder-hitting than average). */
/** 0 below monster level 65, rising to 1 at level 84 and up (the late-game toughness — scaleStats) */
export const lateGame = (L: number) => Math.max(0, Math.min(1, (L - 64) / 20));
export function scaleStats(base: { level: number; hp: number; atk: number; def: number; exp: number; gold: [number, number]; attackCooldown?: number }, level: number, boss: boolean) {
  const L = level, refAtk = 10 + 5 * L, refHp = 150 + 43 * L, refDef = 1.7 * L;
  const kf = Math.min(1.6, Math.max(0.6, base.hp / (60 * Math.pow(Math.max(1, base.level), 1.35))));
  const ka = Math.min(1.4, Math.max(0.7, base.atk / (7 + base.level * 2.6)));
  const def = Math.round(2 + L * 0.9);
  const heroHit = refAtk * 100 / (100 + def * 3) * 1.08;
  // director: a brand-new hero (first form, starter sword: ATK ≈ 18.5 + 2.5L) needs 3-4 hits per monster, never 1-2 —
  // a floor on normal monsters' HP (only binds at low levels, where the real hero out-hits the reference)
  const newHit = (18.5 + 2.5 * L) * 100 / (100 + def * 3);
  const hp = Math.round(boss ? heroHit * 120 : Math.max(heroHit * 3 * kf, newHit * 3.5));
  const cd = (base.attackCooldown ?? 1400) / 1000;
  const want = refHp * cd / (boss ? 28 : 55) * ka;
  const atk = Math.round(want * (100 + refDef * 3) / 100);
  // MMO pace (target: Lv100 in about one month of 24 h auto farming, ~1300 kills/h):
  // a level takes about 12 + 1.2·L^2.2 kills on a map of your level → Lv10 ≈ 200 kills (10 min), Lv50 ≈ 6 500 (5 h), Lv90 ≈ 24 000 (18 h)
  const killsPerLevel = 12 + 1.2 * Math.pow(L, 2.2);
  const one = expToNext(L) * (0.8 + 0.4 * kf) / (1.2 * killsPerLevel);
  const exp = Math.max(1, Math.round(boss ? one * 60 : one));
  const g = (k: number) => Math.round(k * (boss ? 15 : 1));
  // gold is scarce (director: no inflation) — and only ~40% of kills drop any (rewards.ts)
  // ⚔ the late game (director 2026-11-14): from monster level 65 normal monsters get tougher step by step (HP up to x4,
  // attack up to x3 at level 84+) so gear upgrades (+1..+10) clearly matter. EXP stays the same: the late levels take
  // longer on purpose (director: a game that lasts — Lv100 should not come in 2–3 days). Bosses keep their own numbers.
  const f = boss ? 0 : lateGame(L);
  return { hp: Math.round(hp * (1 + 3 * f)), atk: Math.round(atk * (1 + 2 * f)), def, exp, gold: [g(1 + L * 0.2), g(2 + L * 0.4)] as [number, number] };
}
