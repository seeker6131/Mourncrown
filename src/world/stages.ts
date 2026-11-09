// 50 stages in 5 lands. Monster level, numbers and loot rarity scale with the stage; every 10th stage is a boss.
import type { MonsterKind } from '../data/monsters';

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
/** scale a monster's base stats to the stage level */
export function scaleStats(base: { level: number; hp: number; atk: number; def: number; exp: number; gold: [number, number] }, level: number, boss: boolean) {
  const k = Math.pow(1.11, level - base.level), b = boss ? 1 : 0;
  return { hp: Math.round(base.hp * k * (b ? 14 : 1)), atk: Math.round(base.atk * Math.pow(1.085, level - base.level) * (b ? 1.6 : 1)),
           def: Math.round(base.def + level * 0.9), exp: Math.round(base.exp * Math.pow(1.1, level - base.level) * (b ? 12 : 1)),
           gold: [Math.round(base.gold[0] * k * (b ? 10 : 1)), Math.round(base.gold[1] * k * (b ? 10 : 1))] as [number, number] };
}
