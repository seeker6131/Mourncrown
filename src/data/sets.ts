// Gear sets: one per land. Set pieces drop from that land's boss, golden monsters and the daily dungeon chest.
// Wear 2 pieces (any of weapon / armour / accessory) for the first bonus, all 3 for the full bonus. Bonuses are %.
export interface SetFx { atk?: number; def?: number; hp?: number; crit?: number; aspd?: number; exp?: number; mf?: number }
export interface GearSet { id: string; name: string; land: string; b2: SetFx; b3: SetFx; col: number }
export const SETS: Record<string, GearSet> = {
  root: { id: 'root', name: 'เซ็ตรากเน่า', land: 'forest', b2: { hp: 10 }, b3: { atk: 10, hp: 15 }, col: 0x7ad88a },
  soul: { id: 'soul', name: 'เซ็ตวิญญาณ', land: 'haunt', b2: { crit: 5 }, b3: { crit: 10, atk: 8 }, col: 0xc89cff },
  glass: { id: 'glass', name: 'เซ็ตแก้วดำ', land: 'lava', b2: { atk: 10 }, b3: { atk: 15, aspd: 10 }, col: 0xff8a5a },
  frost: { id: 'frost', name: 'เซ็ตเหมันต์', land: 'snow', b2: { def: 15 }, b3: { def: 25, hp: 15 }, col: 0x9ad8ff },
  crown: { id: 'crown', name: 'เซ็ตมงกุฎกลวง', land: 'dung', b2: { atk: 8, def: 8 }, b3: { atk: 12, def: 12, hp: 12, exp: 10 }, col: 0xffd84a },
};
export const LAND_SET: Record<string, string> = { forest: 'root', haunt: 'soul', lava: 'glass', snow: 'frost', dung: 'crown' };
const FX_TH: Record<keyof SetFx, string> = { atk: 'ATK/MATK', def: 'DEF', hp: 'HP', crit: 'คริ', aspd: 'ตีเร็ว', exp: 'EXP', mf: 'โชค' };
export const fxText = (f: SetFx) => (Object.entries(f) as [keyof SetFx, number][]).map(([k, v]) => `${FX_TH[k]} +${v}%`).join(' ');
/** total bonus from the sets the hero wears */
export function setBonus(sets: (string | undefined)[]): SetFx {
  const n: Record<string, number> = {}; for (const id of sets) if (id && SETS[id]) n[id] = (n[id] ?? 0) + 1;
  const out: SetFx = {};
  for (const [id, c] of Object.entries(n)) {
    const add = (f: SetFx) => { for (const [k, v] of Object.entries(f) as [keyof SetFx, number][]) out[k] = (out[k] ?? 0) + v; };
    if (c >= 3) add(SETS[id].b3); else if (c >= 2) add(SETS[id].b2);
  }
  return out;
}
