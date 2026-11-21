// 🪽 Wings (director 14 Nov): a look worn on the back — the hero floats (legs still, the shadow stays on the ground) and
// walks a little faster. Three tiers: Legend (no aura), SL (a thin aura), Limited (a full aura with its own effect — the
// best looking; kept for OBT). Only from the 🎰 wing slot machine (systems/wings.ts). No chances are ever shown.
// Pictures: art-source/pixellab/wings → tools/build_wings.py → src/assets/td/wings/<id>.webp + wings.json.
export type WingTier = 'L' | 'SL' | 'X';
export type WingFx = 'none' | 'thin' | 'storm' | 'cosmos' | 'fallen';
export interface WingDef { id: string; name: string; tier: WingTier; /** aura / glow colour */ col: number; /** a second colour for the effect */ col2: number; fx: WingFx }
export const WINGS: WingDef[] = [
  { id: 'legend', name: 'ปีกนางฟ้าขาว', tier: 'L', col: 0xfff2c8, col2: 0xffd27a, fx: 'none' },
  { id: 'l_hawk', name: 'ปีกเหยี่ยวทอง', tier: 'L', col: 0xd8a060, col2: 0x8a5a2a, fx: 'none' },
  { id: 'l_fairy', name: 'ปีกผีเสื้อมรกต', tier: 'L', col: 0x5ae07a, col2: 0xffe07a, fx: 'none' },
  { id: 'l_bat', name: 'ปีกค้างคาวรัตติกาล', tier: 'L', col: 0x6a5a7a, col2: 0x2a2030, fx: 'none' },
  { id: 'l_leaf', name: 'ปีกใบไม้ร่วง', tier: 'L', col: 0xffa040, col2: 0x7aa040, fx: 'none' },
  { id: 'sl', name: 'ปีกเพลิงชาด', tier: 'SL', col: 0xff5a2a, col2: 0xffd040, fx: 'thin' },
  { id: 's_ice', name: 'ปีกผลึกน้ำแข็ง', tier: 'SL', col: 0x9ae8ff, col2: 0xffffff, fx: 'thin' },
  { id: 's_dragon', name: 'ปีกมังกรมรกต', tier: 'SL', col: 0x3ac0a0, col2: 0xffd060, fx: 'thin' },
  { id: 's_moon', name: 'ปีกแสงจันทร์', tier: 'SL', col: 0xd8c8ff, col2: 0xffffff, fx: 'thin' },
  { id: 's_gold', name: 'ปีกเกราะทองศักดิ์สิทธิ์', tier: 'SL', col: 0xffd84a, col2: 0xfff8d0, fx: 'thin' },
  { id: 'ltd', name: 'ปีกพายุอสนี', tier: 'X', col: 0x6a8aff, col2: 0x8af0ff, fx: 'storm' },
  { id: 'x_cosmos', name: 'ปีกจักรวาล', tier: 'X', col: 0xb06aff, col2: 0xff8ad8, fx: 'cosmos' },
  { id: 'x_fallen', name: 'ปีกเทวาตกสวรรค์', tier: 'X', col: 0xffffff, col2: 0x1a1020, fx: 'fallen' },
];
export const WING_BY_ID: Record<string, WingDef> = Object.fromEntries(WINGS.map(w => [w.id, w]));
/** walking faster with the wings out (not on a mount — a mount uses its own speed): Legend 3%, SL 5%, Limited 10% (director) */
export const WING_SPEED: Record<WingTier, number> = { L: 1.03, SL: 1.05, X: 1.1 };
export const TIER_NAME: Record<WingTier, string> = { L: 'Legend', SL: 'SL', X: 'Limited' };
export const TIER_COL: Record<WingTier, number> = { L: 0xffa53a, SL: 0xff4a5a, X: 0xb06aff };
/** how high a winged hero floats (px) */
export const WING_LIFT = 9;
