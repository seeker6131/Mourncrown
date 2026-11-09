// 50 stages in 5 lands. Monster level, numbers and loot rarity scale with the stage; every 10th stage is a boss.
import type { MonsterKind } from '../data/monsters';
import { expToNext } from '../systems/stats';

export interface StageMon { key: string; kind: MonsterKind; name: string; size: number }
export interface Land { id: string; name: string; ground: 'forest' | 'haunt' | 'lava' | 'snow' | 'dung'; mobs: StageMon[]; boss: StageMon }
export interface Stage { n: number; land: Land; level: number; count: number; boss: boolean; minRar: number; mf: number }

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
    mobs: [M('mo6', 'rat', 'หนูแทะซาก', 32), M('mo7', 'skeleton', 'อัศวินเปลือกกลวง'), M('mo9', 'ghost', 'วิญญาณผ้าคลุมหน้า'), M('mo10', 'spider', 'แมงมุมปากคน')] },
];
export const STAGES: Stage[] = Array.from({ length: 50 }, (_, i) => {
  const n = i + 1, land = LANDS[Math.floor(i / 10)], boss = n % 10 === 0;
  return { n, land, level: Math.round(1 + (n - 1) * 2.05), count: boss ? 6 : 8 + Math.floor((n % 10) * 0.8), boss,
           minRar: n >= 41 ? 2 : n >= 21 ? 1 : 0, mf: n * 3 + (boss ? 60 : 0) };
});
/** Monster stats for a stage level, tuned against a reference hero of the same level (typical gear):
 *  ATK ≈ 10+5L, HP ≈ 150+43L, DEF ≈ 1.7L (checked with tests/sim). Targets: a normal monster dies in ~3 hits and
 *  alone would kill the hero in ~55 s; a boss takes ~120 hits (about a minute with skills) and kills in ~28 s.
 *  Each monster keeps its own character via kind factors (tougher / harder-hitting than average). */
export function scaleStats(base: { level: number; hp: number; atk: number; def: number; exp: number; gold: [number, number]; attackCooldown?: number }, level: number, boss: boolean) {
  const L = level, refAtk = 10 + 5 * L, refHp = 150 + 43 * L, refDef = 1.7 * L;
  const kf = Math.min(1.6, Math.max(0.6, base.hp / (60 * Math.pow(Math.max(1, base.level), 1.35))));
  const ka = Math.min(1.4, Math.max(0.7, base.atk / (7 + base.level * 2.6)));
  const def = Math.round(2 + L * 0.9);
  const heroHit = refAtk * 100 / (100 + def * 3) * 1.08;
  const hp = Math.round(heroHit * (boss ? 120 : 3 * kf));
  const cd = (base.attackCooldown ?? 1400) / 1000;
  const want = refHp * cd / (boss ? 28 : 55) * ka;
  const atk = Math.round(want * (100 + refDef * 3) / 100);
  const exp = Math.round(expToNext(L) * (boss ? 1.5 : (0.8 + 0.4 * kf) / 7));
  const g = (k: number) => Math.round(k * (boss ? 15 : 1));
  return { hp, atk, def, exp, gold: [g(3 + L * 1.5), g(6 + L * 2.5)] as [number, number] };
}
