// Item database. Icons are generated in art/iconArt.ts using `icon` keys.

export type ItemType = 'weapon' | 'armor' | 'accessory' | 'consumable' | 'material';
export type EquipSlot = 'weapon' | 'armor' | 'accessory';

export interface ItemDef {
  id: string;
  name: string;
  type: ItemType;
  icon: string;
  desc: string;
  price: number; // buy price (sell = 40%)
  rarity: number; // shop/base rarity (instances roll their own)
  atk?: number;
  matk?: number;
  def?: number;
  hp?: number;
  mp?: number;
  crit?: number; // percent
  aspd?: number; // attack speed %
  mf?: number; // magic find % (better drop rarity)
  /** equipment base tier 1..5 (drop level band) */
  tier?: number;
  heal?: number; // consumable HP
  mana?: number; // consumable MP
  /** visual tier for hero sprite (weapon/armor look) */
  look?: number;
  stack?: boolean;
}

// Rarity drives power: Common, Uncommon, Rare, Epic, Legendary
export const RARITY_COLORS = [0xe8e2d0, 0x7ee08a, 0x6fb6ff, 0xd48cff, 0xffa53a];
export const RARITY_NAMES = ['ธรรมดา', 'ดี', 'หายาก', 'มหากาพย์', 'ตำนาน'];
export const RARITY_MULT = [1, 1.35, 1.8, 2.5, 3.6];

export const ITEMS: Record<string, ItemDef> = {
  // Weapons
  wood_sword: { id: 'wood_sword', name: 'ดาบไม้ฝึกหัด', type: 'weapon', icon: 'sword0', desc: 'ดาบไม้สำหรับนักผจญภัยมือใหม่', price: 20, rarity: 0, atk: 4, look: 0 },
  iron_sword: { id: 'iron_sword', name: 'ดาบเหล็กกล้า', type: 'weapon', icon: 'sword1', desc: 'ดาบเหล็กคมกริบจากช่างตีเหล็ก', price: 180, rarity: 1, atk: 12, look: 1 },
  knight_blade: { id: 'knight_blade', name: 'ดาบอัศวินเงิน', type: 'weapon', icon: 'sword2', desc: 'ดาบเงินของอัศวินแห่งเอลเดอร์โกรฟ', price: 650, rarity: 2, atk: 24, crit: 3, look: 2 },
  flame_saber: { id: 'flame_saber', name: 'ดาบเพลิงอัคคี', type: 'weapon', icon: 'sword3', desc: 'ดาบที่ลุกโชนด้วยไฟนิรันดร์ เพิ่มพลังเวท', price: 2400, rarity: 3, atk: 40, matk: 20, crit: 5, look: 3 },
  oak_staff: { id: 'oak_staff', name: 'คทาไม้โอ๊ค', type: 'weapon', icon: 'staff0', desc: 'คทาเวทที่ขยายพลังเวทมนตร์', price: 220, rarity: 1, atk: 5, matk: 18, look: 4 },
  // Armors
  cloth_tunic: { id: 'cloth_tunic', name: 'เสื้อผ้าป่าน', type: 'armor', icon: 'armor0', desc: 'เสื้อผ้าธรรมดา', price: 20, rarity: 0, def: 2, hp: 10, look: 0 },
  leather_armor: { id: 'leather_armor', name: 'เกราะหนังพราน', type: 'armor', icon: 'armor1', desc: 'เกราะหนังเบา คล่องตัว', price: 200, rarity: 1, def: 7, hp: 40, aspd: 4, look: 1 },
  chain_mail: { id: 'chain_mail', name: 'เกราะโซ่ถัก', type: 'armor', icon: 'armor2', desc: 'เกราะโซ่ที่แข็งแรง', price: 700, rarity: 2, def: 15, hp: 90, look: 2 },
  knight_plate: { id: 'knight_plate', name: 'เกราะอัศวินทองคำ', type: 'armor', icon: 'armor3', desc: 'เกราะเต็มตัวประดับทอง พร้อมผ้าคลุมแดง', price: 2600, rarity: 3, def: 28, hp: 240, look: 3 },
  // Accessories
  copper_ring: { id: 'copper_ring', name: 'แหวนทองแดง', type: 'accessory', icon: 'ring0', desc: 'เพิ่มโชคเล็กน้อย', price: 120, rarity: 1, crit: 4, mf: 10 },
  ruby_amulet: { id: 'ruby_amulet', name: 'สร้อยทับทิม', type: 'accessory', icon: 'amulet0', desc: 'เพิ่มพลังโจมตีและพลังชีวิต', price: 600, rarity: 2, atk: 10, hp: 60 },
  sage_pendant: { id: 'sage_pendant', name: 'จี้ปราชญ์', type: 'accessory', icon: 'amulet1', desc: 'เพิ่มมานาและพลังเวท', price: 650, rarity: 2, matk: 16, mp: 40 },
  heart_of_forest: { id: 'heart_of_forest', name: 'หัวใจแห่งพงไพร', type: 'accessory', icon: 'gem0', desc: 'อัญมณีจากผู้พิทักษ์ป่า', price: 3000, rarity: 3, atk: 12, matk: 12, hp: 190, crit: 4 },
  // Consumables
  hp_potion: { id: 'hp_potion', name: 'ยาฟื้นพลัง', type: 'consumable', icon: 'potion_hp', desc: 'ฟื้นฟู HP 120', price: 25, rarity: 0, heal: 120, stack: true },
  hp_potion_l: { id: 'hp_potion_l', name: 'ยาฟื้นพลังใหญ่', type: 'consumable', icon: 'potion_hp_l', desc: 'ฟื้นฟู HP 400', price: 90, rarity: 1, heal: 400, stack: true },
  mp_potion: { id: 'mp_potion', name: 'ยามานา', type: 'consumable', icon: 'potion_mp', desc: 'ฟื้นฟู MP 60', price: 30, rarity: 0, mana: 60, stack: true },
  // Materials
  slime_gel: { id: 'slime_gel', name: 'เจลสไลม์', type: 'material', icon: 'gel', desc: 'เจลเหนียวหนืด ขายได้', price: 8, rarity: 0, stack: true },
  spore_cap: { id: 'spore_cap', name: 'หมวกเห็ดสปอร์', type: 'material', icon: 'spore', desc: 'วัตถุดิบเควสต์และยา', price: 12, rarity: 0, stack: true },
  wolf_pelt: { id: 'wolf_pelt', name: 'หนังหมาป่า', type: 'material', icon: 'pelt', desc: 'หนังนุ่มคุณภาพดี', price: 20, rarity: 0, stack: true },
  goblin_fang: { id: 'goblin_fang', name: 'เขี้ยวก็อบลิน', type: 'material', icon: 'fang', desc: 'ของสะสมจากก็อบลิน', price: 22, rarity: 0, stack: true },
  wisp_essence: { id: 'wisp_essence', name: 'แก่นวิญญาณ', type: 'material', icon: 'essence', desc: 'พลังงานเวทบริสุทธิ์', price: 35, rarity: 1, stack: true },
  ancient_core: { id: 'ancient_core', name: 'แก่นโบราณ', type: 'material', icon: 'gem0', desc: 'แกนพลังจากของแรร์/บอส ใช้อัปเกรดอาคารขั้นสูง', price: 300, rarity: 3, stack: true },
  mana_shard: { id: 'mana_shard', name: 'ผลึกมานา', type: 'material', icon: 'shard', desc: 'ใช้ในการตีบวกอุปกรณ์', price: 40, rarity: 1, stack: true },
};

export function itemDef(id: string): ItemDef {
  const d = ITEMS[id];
  if (!d) throw new Error('Unknown item ' + id);
  return d;
}

export const SHOP_STOCK = ['hp_potion', 'hp_potion_l', 'mp_potion', 'mana_shard', 'iron_sword', 'oak_staff', 'knight_blade', 'leather_armor', 'chain_mail', 'copper_ring', 'ruby_amulet', 'sage_pendant'];

export const MAX_UPGRADE = 10;
/** Success chance for upgrading from +n to +n+1 */
export function upgradeChance(n: number): number {
  return [1, 1, 1, 0.85, 0.7, 0.55, 0.45, 0.35, 0.25, 0.15][n] ?? 0;
}
export function upgradeCost(n: number, def: ItemDef): { gold: number; shards: number } {
  return { gold: Math.round((def.price * 0.25 + 30) * (n + 1)), shards: 1 + Math.floor(n / 2) };
}
/** Upgrade multiplier applied to main stat of the item */
export function upgradeMult(n: number): number { return 1 + n * 0.12; }
