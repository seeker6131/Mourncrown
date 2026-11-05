// Character classes: villager -> class (form 2) -> advanced (form 3) -> master (form 4).
import type { SkillId } from './skills';

export type ClassId = 'novice' | 'sword' | 'archer' | 'mage' | 'cleric';

export interface ClassDef {
  id: ClassId;
  forms: string[];       // names per tier (index 1..3 used for classes, 0 for villager)
  desc: string;
  ranged: false | 'arrow' | 'orb';
  bonus: { atk?: number; matk?: number; hp?: number; crit?: number; aspd?: number }; // % per tier
  skills: SkillId[][];   // skills gained at each tier (cumulative)
  cloth: { h: number; s: number; v: number } | null; // tunic recolour (HSV)
}

/** Level needed for each form. */
export const FORM_LEVEL = [1, 5, 20, 35];

export const CLASSES: Record<ClassId, ClassDef> = {
  novice: { id: 'novice', forms: ['ชาวบ้าน'], desc: 'ชาวบ้านธรรมดากับดาบไม้', ranged: false, bonus: {}, skills: [['bash']], cloth: { h: 0.08, s: 0.45, v: 0.85 } },
  sword: { id: 'sword', forms: ['', 'นักดาบ', 'อัศวิน', 'ลอร์ดอัศวิน'], desc: 'สายประชิด เลือดหนา ฟันรอบตัว', ranged: false, bonus: { atk: 12, hp: 15 }, skills: [[], ['bash', 'cyclone'], ['warcry'], []], cloth: null },
  archer: { id: 'archer', forms: ['', 'นักธนู', 'พรานป่า', 'เรนเจอร์ราชันย์'], desc: 'สายระยะไกล ยิงไว คริติคอลสูง', ranged: 'arrow', bonus: { atk: 10, crit: 6, aspd: 12 }, skills: [[], ['multishot', 'arrowrain'], ['warcry'], []], cloth: { h: 0.3, s: 0.6, v: 0.8 } },
  mage: { id: 'mage', forms: ['', 'จอมเวท', 'ปราชญ์เวท', 'อาร์คเมจ'], desc: 'สายเวท ระเบิดวงกว้าง พลังเวทสูงมาก', ranged: 'orb', bonus: { matk: 25 }, skills: [[], ['flame', 'thunder'], ['heal'], []], cloth: { h: 0.76, s: 0.55, v: 0.75 } },
  cleric: { id: 'cleric', forms: ['', 'นักบวช', 'นักบุญ', 'ไฮพรีสต์'], desc: 'สายสนับสนุน ฮีลตัวเอง ทนทาน สายฟ้าศักดิ์สิทธิ์', ranged: 'orb', bonus: { matk: 12, hp: 12 }, skills: [[], ['heal', 'thunder'], ['bash'], []], cloth: { h: 0.13, s: 0.25, v: 1.15 } },
};

export function classSkills(cls: ClassId, tier: number): SkillId[] {
  const out: SkillId[] = [];
  CLASSES[cls].skills.slice(0, tier + 1).forEach(l => l.forEach(k => { if (!out.includes(k)) out.push(k); }));
  return out;
}

export function formName(cls: ClassId, tier: number) { return cls === 'novice' ? 'ชาวบ้าน' : CLASSES[cls].forms[tier]; }
