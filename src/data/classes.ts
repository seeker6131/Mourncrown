// Character classes: villager (form 1) -> class (form 2, Lv5) -> advanced (form 3, Lv20) -> master (form 4, Lv35).
// Each form has its own unique 3 skills (they REPLACE the previous form's skills).
export type ClassId = 'novice' | 'sword' | 'archer' | 'mage' | 'cleric';

export interface ClassDef {
  id: ClassId;
  forms: string[];       // names per tier (index 1..3 used for classes, 0 for villager)
  codes: string[];       // art codes per tier (src/assets/forms)
  desc: string;
  ranged: false | 'arrow' | 'orb';
  bonus: { atk?: number; matk?: number; hp?: number; def?: number; crit?: number; aspd?: number }; // % per tier
  skills: string[][];    // skills per tier
  cloth: { h: number; s: number; v: number } | null; // fallback tunic recolour (HSV)
}

/** Level needed for each form. */
export const FORM_LEVEL = [1, 5, 20, 35];

export const CLASSES: Record<ClassId, ClassDef> = {
  novice: { id: 'novice', forms: ['ชาวบ้าน'], codes: ['V0'], desc: 'ชาวบ้านธรรมดากับดาบไม้', ranged: false, bonus: {}, skills: [['v_bash']], cloth: { h: 0.08, s: 0.45, v: 0.85 } },
  sword: { id: 'sword', forms: ['', 'นักดาบ', 'อัศวิน', 'ลอร์ดอัศวิน'], codes: ['V0', 'S2', 'S3', 'S4'], desc: 'สายประชิดล้วน ฟันหนัก พุ่งชน ไม่มีเวท', ranged: false, bonus: { atk: 14, hp: 12 },
    skills: [[], ['s2_cleave', 's2_whirl', 's2_guard'], ['s3_charge', 's3_crusade', 's3_valor'], ['s4_judgment', 's4_blades', 's4_aegis']], cloth: null },
  archer: { id: 'archer', forms: ['', 'นักธนู', 'พรานป่า', 'เรนเจอร์ราชันย์'], codes: ['V0', 'A2', 'A3', 'A4'], desc: 'สายระยะไกล ยิงไว คริติคอลสูง', ranged: 'arrow', bonus: { atk: 10, crit: 6, aspd: 12 },
    skills: [[], ['a2_double', 'a2_fan', 'a2_focus'], ['a3_pierce', 'a3_rain', 'a3_trap'], ['a4_spirit', 'a4_storm', 'a4_wind']], cloth: { h: 0.3, s: 0.6, v: 0.8 } },
  mage: { id: 'mage', forms: ['', 'จอมเวท', 'ปราชญ์เวท', 'อาร์คเมจทมิฬ'], codes: ['V0', 'M2', 'M3', 'M4'], desc: 'สายเวท ระเบิดวงกว้าง พลังเวทสูงมาก แต่ตัวบาง', ranged: 'orb', bonus: { matk: 25 },
    skills: [[], ['m2_bolt', 'm2_fire', 'm2_heal'], ['m3_chain', 'm3_arcane', 'm3_volley'], ['m4_meteor', 'm4_void', 'm4_dread']], cloth: { h: 0.76, s: 0.55, v: 0.75 } },
  // id kept as 'cleric' for save compatibility; the class is the Tank line.
  cleric: { id: 'cleric', forms: ['', 'ผู้พิทักษ์', 'อัศวินเหล็กกล้า', 'ป้อมปราการมนุษย์'], codes: ['V0', 'T2', 'T3', 'T4'], desc: 'สายแทงค์ เลือดหนามาก เกราะหนา ฟื้นตัวเองได้', ranged: false, bonus: { atk: 6, hp: 30, def: 20 },
    skills: [[], ['t2_slam', 't2_wall', 't2_recover'], ['t3_quake', 't3_ram', 't3_bulwark'], ['t4_titan', 't4_fortress', 't4_lion']], cloth: { h: 0.0, s: 0.05, v: 0.7 } },
};

/** Skills of the current form only (each form has its own set). */
export function classSkills(cls: ClassId, tier: number): string[] {
  const c = CLASSES[cls];
  return [...(c.skills[Math.min(tier, c.skills.length - 1)] ?? c.skills[0])];
}

export function formName(cls: ClassId, tier: number) { return cls === 'novice' || tier === 0 ? 'ชาวบ้าน' : CLASSES[cls].forms[tier]; }
export function formCode(cls: ClassId, tier: number) { return tier === 0 ? 'V0' : CLASSES[cls].codes[tier]; }

/** Every playable form for the test switcher. */
export const ALL_FORMS: { cls: ClassId; tier: number }[] = [
  { cls: 'novice', tier: 0 },
  ...(['sword', 'archer', 'mage', 'cleric'] as ClassId[]).flatMap(cls => [1, 2, 3].map(tier => ({ cls, tier }))),
];
