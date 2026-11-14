// Data-driven skills. Every class form has its OWN 3 skills (no repeats between forms or classes).
// `kind` picks the behaviour in WorldScene.castSkill; parameters tune it.
export type SkillKind =
  | 'strike'    // one heavy melee hit in front
  | 'spin'      // melee hit all around
  | 'dash'      // charge forward, hitting everything on the path
  | 'leap'      // jump onto the target, area impact
  | 'shot'      // projectile(s): count + spread; arrow or orb
  | 'pierce'    // piercing projectile through a line
  | 'rain'      // things fall on up to N targets near the hero (arrows / bolts / meteors)
  | 'nova'      // magic burst around the hero
  | 'buff'      // self buff (atk/def/aspd)
  | 'heal'      // self heal
  | 'shield';   // damage absorb

export interface SkillDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  mp: number;
  cooldown: number;
  kind: SkillKind;
  stat: 'atk' | 'matk';
  power: number;        // damage multiplier per hit
  range: number;        // auto-battle usage range
  count?: number;       // projectiles / targets / hits
  spread?: number;      // radians between projectiles
  radius?: number;      // area radius
  proj?: 'arrow' | 'orb' | 'dark' | 'fire';
  fall?: 'arrow' | 'bolt' | 'meteor' | 'blade';
  color?: number;
  buff?: { atk?: number; def?: number; aspd?: number; dur: number };
}

const S = (d: SkillDef) => d;

export const SKILL_LIST: SkillDef[] = [
  // villager
  S({ id: 'v_bash', name: 'ฟาดไม้', icon: 'sk_cyclone', desc: 'ฟาดดาบไม้แรงๆ 220% ATK', mp: 4, cooldown: 2500, kind: 'strike', stat: 'atk', power: 2.2, range: 34, color: 0xd8c090 }),
  // ---- Swordsman line (melee only) ----
  S({ id: 's2_cleave', name: 'ฟันผ่าหิน', icon: 'sk_cyclone', desc: 'ฟันหนักข้างหน้า 300% ATK', mp: 6, cooldown: 3000, kind: 'strike', stat: 'atk', power: 3.0, range: 36, color: 0xbfe8ff }),
  S({ id: 's2_whirl', name: 'ดาบวงพายุ', icon: 'sk_cyclone', desc: 'หมุนฟันรอบตัว 2 ครั้ง ครั้งละ 110% ATK', mp: 9, cooldown: 4500, kind: 'spin', stat: 'atk', power: 1.1, count: 2, radius: 42, range: 40, color: 0xbfe8ff }),
  S({ id: 's2_guard', name: 'ตั้งการ์ด', icon: 'sk_heal', desc: 'DEF +40% นาน 10 วินาที', mp: 8, cooldown: 18000, kind: 'buff', stat: 'atk', power: 0, range: 0, buff: { def: 40, dur: 10000 }, color: 0x9ad8ff }),
  S({ id: 's3_charge', name: 'พุ่งทะลวง', icon: 'sk_cyclone', desc: 'พุ่งไปข้างหน้า ชนทุกตัวในเส้นทาง 220% ATK', mp: 10, cooldown: 4500, kind: 'dash', stat: 'atk', power: 2.2, range: 90, radius: 80, color: 0xffe080 }),
  S({ id: 's3_crusade', name: 'คมดาบอัศวิน', icon: 'sk_thunder', desc: 'ฟันกากบาท 2 ครั้ง ครั้งละ 200% ATK', mp: 12, cooldown: 5000, kind: 'strike', stat: 'atk', power: 2.0, count: 2, range: 38, color: 0xffd860 }),
  S({ id: 's3_valor', name: 'ใจกล้าอัศวิน', icon: 'sk_heal', desc: 'ATK +30% และตีเร็วขึ้น 20% นาน 12 วินาที', mp: 14, cooldown: 22000, kind: 'buff', stat: 'atk', power: 0, range: 0, buff: { atk: 30, aspd: 20, dur: 12000 }, color: 0xffb040 }),
  S({ id: 's4_judgment', name: 'คำพิพากษาสวรรค์', icon: 'sk_thunder', desc: 'กระโดดฟาดลงพื้น ระเบิดแสงวงกว้าง 320% ATK', mp: 16, cooldown: 6000, kind: 'leap', stat: 'atk', power: 3.2, radius: 52, range: 110, color: 0xfff0a0 }),
  S({ id: 's4_blades', name: 'พายุดาบศักดิ์สิทธิ์', icon: 'sk_cyclone', desc: 'หมุนดาบแสงรอบตัว 4 ครั้ง ครั้งละ 190% ATK (ประชิดตัว)', mp: 22, cooldown: 8000, kind: 'spin', stat: 'atk', power: 1.9, count: 4, radius: 58, range: 50, color: 0x9ad8ff }),   // director: the knight has no ranged skills
  S({ id: 's4_aegis', name: 'โล่ทองคำ', icon: 'sk_heal', desc: 'โล่ดูดซับดาเมจ 40% ของ HP สูงสุด', mp: 18, cooldown: 25000, kind: 'shield', stat: 'atk', power: 0.4, range: 0, color: 0xffd860 }),
  // ---- Archer line ----
  S({ id: 'a2_double', name: 'ยิงคู่', icon: 'sk_flame', desc: 'ยิงธนู 2 ดอกติดกัน ดอกละ 150% ATK', mp: 5, cooldown: 2500, kind: 'shot', stat: 'atk', power: 1.5, count: 2, spread: 0.06, proj: 'arrow', range: 130 }),
  S({ id: 'a2_fan', name: 'ธนูกระจาย', icon: 'sk_cyclone', desc: 'ยิงธนู 5 ดอกเป็นรูปพัด ดอกละ 110% ATK', mp: 8, cooldown: 4000, kind: 'shot', stat: 'atk', power: 1.1, count: 5, spread: 0.18, proj: 'arrow', range: 110 }),
  S({ id: 'a2_focus', name: 'สมาธินักล่า', icon: 'sk_heal', desc: 'ตีเร็วขึ้น 30% นาน 10 วินาที', mp: 8, cooldown: 18000, kind: 'buff', stat: 'atk', power: 0, range: 0, buff: { aspd: 30, dur: 10000 }, color: 0x9aff8a }),
  S({ id: 'a3_pierce', name: 'ธนูทะลวงใจ', icon: 'sk_thunder', desc: 'ธนูทะลุทุกตัวในแนวตรง 280% ATK', mp: 10, cooldown: 4000, kind: 'pierce', stat: 'atk', power: 2.8, proj: 'arrow', range: 160, color: 0xc8ff8a }),
  S({ id: 'a3_rain', name: 'ห่าธนู', icon: 'sk_thunder', desc: 'ธนูตกใส่ศัตรู 6 ตัว ตัวละ 180% ATK', mp: 14, cooldown: 7000, kind: 'rain', stat: 'atk', power: 1.8, count: 6, radius: 140, fall: 'arrow', range: 130 }),
  S({ id: 'a3_trap', name: 'กับดักเถาวัลย์', icon: 'sk_heal', desc: 'เถาวัลย์ระเบิดรอบตัว 160% ATK ผลักศัตรูออก', mp: 12, cooldown: 9000, kind: 'nova', stat: 'atk', power: 1.6, radius: 50, range: 45, color: 0x7ad04a }),
  S({ id: 'a4_spirit', name: 'ศรวิญญาณพงไพร', icon: 'sk_flame', desc: 'ยิงศรแสง 3 ดอกทะลุแนว ดอกละ 260% ATK', mp: 16, cooldown: 5000, kind: 'pierce', stat: 'atk', power: 2.6, count: 3, spread: 0.12, proj: 'arrow', range: 170, color: 0x9aff6a }),
  S({ id: 'a4_storm', name: 'พายุศรมรกต', icon: 'sk_thunder', desc: 'ศรมรกตตกใส่ศัตรู 8 ตัว ตัวละ 260% ATK', mp: 22, cooldown: 9000, kind: 'rain', stat: 'atk', power: 2.6, count: 8, radius: 150, fall: 'arrow', range: 140, color: 0x7aff5a }),
  S({ id: 'a4_wind', name: 'วายุราชันย์', icon: 'sk_heal', desc: 'ATK +35% ตีเร็ว +25% นาน 12 วินาที', mp: 16, cooldown: 22000, kind: 'buff', stat: 'atk', power: 0, range: 0, buff: { atk: 35, aspd: 25, dur: 12000 }, color: 0x9aff8a }),
  // ---- Mage line ----
  S({ id: 'm2_bolt', name: 'ศรน้ำแข็ง', icon: 'sk_flame', desc: 'ยิงลูกเวทน้ำแข็ง 230% MATK', mp: 6, cooldown: 2200, kind: 'shot', stat: 'matk', power: 2.3, count: 1, proj: 'orb', range: 140, color: 0x8ad8ff }),
  S({ id: 'm2_fire', name: 'ลูกไฟอัคคี', icon: 'sk_flame', desc: 'ลูกไฟระเบิดวงกว้าง 220% MATK', mp: 10, cooldown: 3500, kind: 'shot', stat: 'matk', power: 2.2, count: 1, proj: 'fire', radius: 34, range: 150 }),
  S({ id: 'm2_heal', name: 'แสงเยียวยา', icon: 'sk_heal', desc: 'ฟื้นฟู HP 30% + 80% MATK', mp: 14, cooldown: 12000, kind: 'heal', stat: 'matk', power: 0.3, range: 0, color: 0x5cff8a }),
  S({ id: 'm3_chain', name: 'สายฟ้าลูกโซ่', icon: 'sk_thunder', desc: 'สายฟ้าฟาดศัตรู 5 ตัว ตัวละ 190% MATK', mp: 16, cooldown: 6000, kind: 'rain', stat: 'matk', power: 1.9, count: 5, radius: 130, fall: 'bolt', range: 130 }),
  S({ id: 'm3_arcane', name: 'ระเบิดดวงดาว', icon: 'sk_cyclone', desc: 'ระเบิดเวทรอบตัว 240% MATK', mp: 14, cooldown: 5000, kind: 'nova', stat: 'matk', power: 2.4, radius: 56, range: 50, color: 0xd08aff }),
  S({ id: 'm3_volley', name: 'ห่ากระสุนเวท', icon: 'sk_flame', desc: 'ยิงกระสุนเวท 4 ลูก ลูกละ 150% MATK', mp: 12, cooldown: 4000, kind: 'shot', stat: 'matk', power: 1.5, count: 4, spread: 0.14, proj: 'orb', range: 140, color: 0xd08aff }),
  S({ id: 'm4_meteor', name: 'อุกกาบาตโลหิต', icon: 'sk_flame', desc: 'อุกกาบาตเลือดถล่มศัตรู 6 ตัว ตัวละ 300% MATK', mp: 26, cooldown: 9000, kind: 'rain', stat: 'matk', power: 3.0, count: 6, radius: 150, fall: 'meteor', range: 140, color: 0xff3a4a }),
  S({ id: 'm4_void', name: 'หอกแห่งความว่างเปล่า', icon: 'sk_thunder', desc: 'หอกเวทดำทะลุทุกตัวในแนว 340% MATK', mp: 18, cooldown: 4500, kind: 'pierce', stat: 'matk', power: 3.4, proj: 'dark', range: 170, color: 0xff3a5a }),
  S({ id: 'm4_dread', name: 'คลื่นมรณะ', icon: 'sk_cyclone', desc: 'คลื่นพลังมืดรอบตัว 280% MATK ดูดเลือด', mp: 20, cooldown: 7000, kind: 'nova', stat: 'matk', power: 2.8, radius: 64, range: 56, color: 0xc0203a }),
  // ---- Tank line ----
  S({ id: 't2_slam', name: 'ทุบโล่', icon: 'sk_cyclone', desc: 'กระแทกโล่ข้างหน้า 240% ATK ผลักกระเด็น', mp: 6, cooldown: 3000, kind: 'strike', stat: 'atk', power: 2.4, range: 34, color: 0xd0d0e0 }),
  S({ id: 't2_wall', name: 'กำแพงเหล็ก', icon: 'sk_heal', desc: 'DEF +60% นาน 10 วินาที', mp: 8, cooldown: 16000, kind: 'buff', stat: 'atk', power: 0, range: 0, buff: { def: 60, dur: 10000 }, color: 0xb0b8d0 }),
  S({ id: 't2_recover', name: 'ตั้งหลัก', icon: 'sk_heal', desc: 'ฟื้นฟู HP 25%', mp: 10, cooldown: 14000, kind: 'heal', stat: 'atk', power: 0.25, range: 0, color: 0x9aff9a }),
  S({ id: 't3_quake', name: 'ค้อนแผ่นดินไหว', icon: 'sk_thunder', desc: 'ทุบพื้นรอบตัว 220% ATK', mp: 12, cooldown: 5000, kind: 'nova', stat: 'atk', power: 2.2, radius: 52, range: 45, color: 0xc8a070 }),
  S({ id: 't3_ram', name: 'พุ่งชนเหล็กกล้า', icon: 'sk_cyclone', desc: 'พุ่งชนทุกตัวในเส้นทาง 200% ATK', mp: 10, cooldown: 5000, kind: 'dash', stat: 'atk', power: 2.0, range: 80, radius: 70, color: 0xd0d0e0 }),
  S({ id: 't3_bulwark', name: 'ป้อมโล่', icon: 'sk_heal', desc: 'โล่ดูดซับดาเมจ 35% ของ HP สูงสุด', mp: 14, cooldown: 20000, kind: 'shield', stat: 'atk', power: 0.35, range: 0, color: 0xb0c8ff }),
  S({ id: 't4_titan', name: 'ไททันกระแทก', icon: 'sk_thunder', desc: 'กระโดดทุบพื้น 300% ATK วงกว้าง', mp: 18, cooldown: 6500, kind: 'leap', stat: 'atk', power: 3.0, radius: 60, range: 100, color: 0xffa040 }),
  S({ id: 't4_fortress', name: 'ป้อมปราการ', icon: 'sk_heal', desc: 'DEF +80% ATK +20% นาน 12 วินาที', mp: 16, cooldown: 22000, kind: 'buff', stat: 'atk', power: 0, range: 0, buff: { def: 80, atk: 20, dur: 12000 }, color: 0xffa040 }),
  S({ id: 't4_lion', name: 'คำรามสิงห์', icon: 'sk_cyclone', desc: 'หมุนค้อนรอบตัว 3 ครั้ง ครั้งละ 150% ATK', mp: 18, cooldown: 6000, kind: 'spin', stat: 'atk', power: 1.5, count: 3, radius: 50, range: 46, color: 0xffa040 }),
];

export type SkillId = string;
export const SKILL_BY_ID: Record<string, SkillDef> = Object.fromEntries(SKILL_LIST.map(s => [s.id, s]));
export const SKILLS = SKILL_LIST;
