export type SkillId = 'cyclone' | 'flame' | 'thunder' | 'heal';

export interface SkillDef {
  id: SkillId;
  name: string;
  icon: string;
  desc: string;
  mp: number;
  cooldown: number; // ms
  unlockLevel: number;
  range: number; // px, auto-battle usage range
  power: number; // multiplier
  kind: 'phys' | 'magic' | 'heal';
}

export const SKILLS: SkillDef[] = [
  { id: 'cyclone', name: 'พายุดาบหมุน', icon: 'sk_cyclone', desc: 'หมุนตัวฟันศัตรูรอบตัว 180% ATK', mp: 8, cooldown: 4000, unlockLevel: 1, range: 44, power: 1.8, kind: 'phys' },
  { id: 'flame', name: 'ลูกไฟอัคคี', icon: 'sk_flame', desc: 'ยิงลูกไฟระเบิดวงกว้าง 220% MATK', mp: 10, cooldown: 3000, unlockLevel: 2, range: 150, power: 2.2, kind: 'magic' },
  { id: 'thunder', name: 'สายฟ้าพิโรธ', icon: 'sk_thunder', desc: 'ฟาดสายฟ้าใส่ศัตรูสูงสุด 5 ตัว 170% MATK', mp: 18, cooldown: 8000, unlockLevel: 3, range: 130, power: 1.7, kind: 'magic' },
  { id: 'heal', name: 'แสงศักดิ์สิทธิ์', icon: 'sk_heal', desc: 'ฟื้นฟู HP 30% + INT×4', mp: 15, cooldown: 12000, unlockLevel: 4, range: 0, power: 0.3, kind: 'heal' },
];

export const SKILL_BY_ID: Record<SkillId, SkillDef> = Object.fromEntries(SKILLS.map(s => [s.id, s])) as Record<SkillId, SkillDef>;
