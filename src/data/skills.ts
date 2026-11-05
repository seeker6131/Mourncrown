export type SkillId = 'bash' | 'cyclone' | 'flame' | 'thunder' | 'heal' | 'multishot' | 'arrowrain' | 'warcry';

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
  kind: 'phys' | 'magic' | 'heal' | 'buff';
}

export const SKILLS: SkillDef[] = [
  { id: 'bash', name: 'ฟาดแรง', icon: 'sk_cyclone', desc: 'ฟาดเป้าหมายตรงหน้าแรงๆ 250% ATK', mp: 5, cooldown: 2500, unlockLevel: 1, range: 36, power: 2.5, kind: 'phys' },
  { id: 'cyclone', name: 'พายุดาบหมุน', icon: 'sk_cyclone', desc: 'หมุนตัวฟันศัตรูรอบตัว 180% ATK', mp: 8, cooldown: 4000, unlockLevel: 1, range: 44, power: 1.8, kind: 'phys' },
  { id: 'flame', name: 'ลูกไฟอัคคี', icon: 'sk_flame', desc: 'ยิงลูกไฟระเบิดวงกว้าง 220% MATK', mp: 10, cooldown: 3000, unlockLevel: 1, range: 150, power: 2.2, kind: 'magic' },
  { id: 'thunder', name: 'สายฟ้าพิโรธ', icon: 'sk_thunder', desc: 'ฟาดสายฟ้าใส่ศัตรูสูงสุด 5 ตัว 170% MATK', mp: 18, cooldown: 8000, unlockLevel: 1, range: 130, power: 1.7, kind: 'magic' },
  { id: 'heal', name: 'แสงศักดิ์สิทธิ์', icon: 'sk_heal', desc: 'ฟื้นฟู HP 30% + 80% MATK', mp: 15, cooldown: 12000, unlockLevel: 1, range: 0, power: 0.3, kind: 'heal' },
  { id: 'multishot', name: 'ยิงกระจาย', icon: 'sk_cyclone', desc: 'ยิงธนู 5 ดอกเป็นรูปพัด ดอกละ 120% ATK', mp: 8, cooldown: 3500, unlockLevel: 1, range: 120, power: 1.2, kind: 'phys' },
  { id: 'arrowrain', name: 'ฝนธนู', icon: 'sk_thunder', desc: 'ธนูตกใส่ศัตรูสูงสุด 6 ตัว 160% ATK', mp: 16, cooldown: 8000, unlockLevel: 1, range: 130, power: 1.6, kind: 'phys' },
  { id: 'warcry', name: 'เสียงคำราม', icon: 'sk_heal', desc: 'เพิ่มพลังโจมตี 25% นาน 12 วินาที', mp: 12, cooldown: 25000, unlockLevel: 1, range: 0, power: 0.25, kind: 'buff' },
];

export const SKILL_BY_ID: Record<SkillId, SkillDef> = Object.fromEntries(SKILLS.map(s => [s.id, s])) as Record<SkillId, SkillDef>;
