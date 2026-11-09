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
  /** consumables: timed buff, food added to the village store, or teleport home */
  buff?: { stat: 'atk' | 'def' | 'exp'; pct: number; mins: number };
  food?: number;
  recall?: boolean;
  /** alchemy elixir: strong timed bonuses in % (one elixir active at a time, separate from food/tonic buffs) */
  elixir?: { atk?: number; def?: number; hp?: number; crit?: number; aspd?: number; exp?: number; mins: number };
  /** class line this gear is made for (sword / archer / mage / cleric); unset = any class */
  cls?: 'sword' | 'archer' | 'mage' | 'cleric';
}

// Rarity drives power: Common, Uncommon, Rare, Super Rare, Legend, SL (Supreme Legend)
export const RARITY_COLORS = [0xd8d4c8, 0x6fe07a, 0x5aa8ff, 0xc77dff, 0xffa53a, 0xff4a5a];
export const RARITY_NAMES = ['Common', 'Uncommon', 'Rare', 'Super Rare', 'Legend', 'SL'];
/** SL (index 5) is by far the strongest: ~2x Legend, 6 affixes rolled at the top of their range */
export const RARITY_MULT = [1, 1.35, 1.8, 2.5, 3.6, 7.0];
/** Gear made for one class line; other classes can wear it at reduced power. */
export const OFF_CLASS_MULT = 0.6;

export const ITEMS: Record<string, ItemDef> = {
  // Weapons
  wood_sword: { id: 'wood_sword', cls: 'sword', name: 'ดาบไม้ฝึกหัด', type: 'weapon', icon: 'sword0', desc: 'ดาบไม้สำหรับนักผจญภัยมือใหม่', price: 20, rarity: 0, atk: 4, look: 0 },
  iron_sword: { id: 'iron_sword', cls: 'sword', name: 'ดาบเหล็กกล้า', type: 'weapon', icon: 'sword1', desc: 'ดาบเหล็กคมกริบจากช่างตีเหล็ก', price: 180, rarity: 1, atk: 12, look: 1 },
  knight_blade: { id: 'knight_blade', cls: 'sword', name: 'ดาบอัศวินเงิน', type: 'weapon', icon: 'sword2', desc: 'ดาบเงินของอัศวินแห่งเอลเดอร์โกรฟ', price: 650, rarity: 2, atk: 24, crit: 3, look: 2 },
  flame_saber: { id: 'flame_saber', cls: 'sword', name: 'ดาบเพลิงอัคคี', type: 'weapon', icon: 'sword3', desc: 'ดาบที่ลุกโชนด้วยไฟนิรันดร์ เพิ่มพลังเวท', price: 2400, rarity: 3, atk: 40, matk: 20, crit: 5, look: 3 },
  oak_staff: { id: 'oak_staff', cls: 'mage', name: 'คทาไม้โอ๊ค', type: 'weapon', icon: 'staff0', desc: 'คทาเวทที่ขยายพลังเวทมนตร์', price: 220, rarity: 1, atk: 5, matk: 18, look: 4 },
  apprentice_wand: { id: 'apprentice_wand', cls: 'mage', name: 'ไม้กายสิทธิ์ฝึกหัด', type: 'weapon', icon: 'wand0', desc: 'ไม้กายสิทธิ์อันแรกของจอมเวท', price: 50, rarity: 0, matk: 8, look: 4 },
  moon_staff: { id: 'moon_staff', cls: 'mage', name: 'คทาจันทราปราชญ์', type: 'weapon', icon: 'staff2', desc: 'คทาประดับจันทร์เสี้ยว เพิ่มพลังเวทและมานา', price: 720, rarity: 2, atk: 6, matk: 34, mp: 40, look: 4 },
  void_staff: { id: 'void_staff', cls: 'mage', name: 'คทาหัวกะโหลกทมิฬ', type: 'weapon', icon: 'staff3', desc: 'คทาอัญมณีม่วงจากเหวลึก พลังเวทมหาศาล', price: 2600, rarity: 3, atk: 8, matk: 58, crit: 4, look: 4 },
  short_bow: { id: 'short_bow', cls: 'archer', name: 'ธนูสั้นไม้ยู', type: 'weapon', icon: 'bow0', desc: 'ธนูเบาสำหรับนักธนูมือใหม่', price: 60, rarity: 0, atk: 5, crit: 3, look: 0 },
  hunter_bow: { id: 'hunter_bow', cls: 'archer', name: 'ธนูพรานโค้งกลับ', type: 'weapon', icon: 'bow1', desc: 'ธนูโค้งกลับของพรานป่า ยิงแรงและแม่น', price: 200, rarity: 1, atk: 13, crit: 5, look: 1 },
  elven_bow: { id: 'elven_bow', cls: 'archer', name: 'ธนูยาวเอลฟ์เงิน', type: 'weapon', icon: 'bow2', desc: 'ธนูยาวสีเงินของเอลฟ์ ยิงเร็วขึ้น', price: 700, rarity: 2, atk: 25, crit: 8, aspd: 6, look: 2 },
  emerald_bow: { id: 'emerald_bow', cls: 'archer', name: 'ธนูวิญญาณมรกต', type: 'weapon', icon: 'bow3', desc: 'ธนูที่วิญญาณพงไพรสถิต คริติคอลสูงมาก', price: 2500, rarity: 3, atk: 42, crit: 12, aspd: 8, look: 3 },
  iron_mace: { id: 'iron_mace', cls: 'cleric', name: 'กระบองเหล็ก', type: 'weapon', icon: 'mace0', desc: 'กระบองหนักของผู้พิทักษ์ เพิ่มความทนทาน', price: 70, rarity: 0, atk: 4, def: 3, hp: 20, look: 0 },
  war_hammer: { id: 'war_hammer', cls: 'cleric', name: 'ค้อนศึก', type: 'weapon', icon: 'hammer1', desc: 'ค้อนศึกหัวเหล็ก ทุบแรงและป้องกันดี', price: 210, rarity: 1, atk: 10, def: 6, hp: 60, look: 1 },
  bulwark_hammer: { id: 'bulwark_hammer', cls: 'cleric', name: 'ค้อนป้อมเหล็กกล้า', type: 'weapon', icon: 'hammer2', desc: 'ค้อนหนักของอัศวินเหล็กกล้า เกราะหนาขึ้นมาก', price: 680, rarity: 2, atk: 20, def: 12, hp: 140, look: 2 },
  titan_maul: { id: 'titan_maul', cls: 'cleric', name: 'ค้อนยักษ์ไททัน', type: 'weapon', icon: 'hammer3', desc: 'ค้อนยักษ์จารึกอักษรรูน ทั้งแรงทั้งทน', price: 2500, rarity: 3, atk: 34, def: 20, hp: 260, look: 3 },
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
  scroll_return: { id: 'scroll_return', name: 'ม้วนกลับหมู่บ้าน', type: 'consumable', icon: 'scroll_return', desc: 'วาร์ปกลับหมู่บ้านทันทีจากทุกแผนที่', price: 60, rarity: 0, recall: true, stack: true },
  ration: { id: 'ration', name: 'ถุงเสบียง', type: 'consumable', icon: 'ration', desc: 'เติมอาหารเข้าคลังหมู่บ้าน +20 (แพงกว่าล่าเอง)', price: 90, rarity: 0, food: 20, stack: true },
  tonic_atk: { id: 'tonic_atk', name: 'ยาเพิ่มพลัง', type: 'consumable', icon: 'tonic_atk', desc: 'ATK +10% นาน 30 นาที', price: 150, rarity: 1, buff: { stat: 'atk', pct: 10, mins: 30 }, stack: true },
  tonic_def: { id: 'tonic_def', name: 'ยาเกราะเหล็ก', type: 'consumable', icon: 'tonic_def', desc: 'DEF +15% นาน 30 นาที', price: 150, rarity: 1, buff: { stat: 'def', pct: 15, mins: 30 }, stack: true },
  tonic_exp: { id: 'tonic_exp', name: 'ยาปัญญา', type: 'consumable', icon: 'tonic_exp', desc: 'EXP +10% นาน 30 นาที', price: 250, rarity: 1, buff: { stat: 'exp', pct: 10, mins: 30 }, stack: true },
  // ---- ores (mining) — common ore per land + a rare gem; used by alchemy ----
  ore_iron: { id: 'ore_iron', name: 'แร่เหล็ก', type: 'material', icon: 'ore_iron', desc: 'แร่จากเหมืองเหล็กในป่าดงดิบ ใช้ปรุงยาเหล็กกล้า', price: 8, rarity: 0, stack: true },
  ore_silver: { id: 'ore_silver', name: 'แร่เงิน', type: 'material', icon: 'ore_silver', desc: 'แร่จากเหมืองเงินในป่าดงดิบ ใช้ปรุงยาเงินบริสุทธิ์', price: 14, rarity: 0, stack: true },
  ore_obsidian: { id: 'ore_obsidian', name: 'ออบซิเดียน', type: 'material', icon: 'ore_obsidian', desc: 'แก้วภูเขาไฟจากเหมืองออบซิเดียนในป่าดงดิบ ใช้ปรุงยาหินดำ', price: 22, rarity: 0, stack: true },
  ore_frost: { id: 'ore_frost', name: 'คริสตัลน้ำแข็ง', type: 'material', icon: 'ore_frost', desc: 'ผลึกจากเหมืองคริสตัลในป่าดงดิบ ใช้ปรุงยาลมหนาว', price: 30, rarity: 0, stack: true },
  ore_mithril: { id: 'ore_mithril', name: 'แร่มิธริล', type: 'material', icon: 'ore_mithril', desc: 'แร่เรืองแสงจากเหมืองมิธริลในป่าดงดิบ ใช้ปรุงยามิธริล', price: 40, rarity: 1, stack: true },
  gem_emerald: { id: 'gem_emerald', name: 'มรกตพงไพร', type: 'material', icon: 'gem_emerald', desc: 'แร่หายากจากผลึกเรืองแสงในเหมืองเหล็ก (โอกาสต่ำ) ปรุงยาเทพได้', price: 400, rarity: 3, stack: true },
  gem_soul: { id: 'gem_soul', name: 'ผลึกวิญญาณ', type: 'material', icon: 'gem_soul', desc: 'แร่หายากจากผลึกเรืองแสงในเหมืองเงิน (โอกาสต่ำ) ปรุงยาเทพได้', price: 600, rarity: 3, stack: true },
  gem_magma: { id: 'gem_magma', name: 'หัวใจลาวา', type: 'material', icon: 'gem_magma', desc: 'แร่หายากจากผลึกเรืองแสงในเหมืองออบซิเดียน (โอกาสต่ำ) ปรุงยาเทพได้', price: 800, rarity: 3, stack: true },
  gem_frosttear: { id: 'gem_frosttear', name: 'น้ำตาเหมันต์', type: 'material', icon: 'gem_frosttear', desc: 'แร่หายากจากผลึกเรืองแสงในเหมืองคริสตัล (โอกาสต่ำ) ปรุงยาเทพได้', price: 1000, rarity: 3, stack: true },
  gem_crown: { id: 'gem_crown', name: 'เศษมงกุฎกลวง', type: 'material', icon: 'gem_crown', desc: 'แร่หายากที่สุดจากผลึกเรืองแสงในเหมืองมิธริล ปรุงยาสุดยอดได้', price: 1500, rarity: 4, stack: true },
  // ---- elixirs (alchemy at the kitchen) ----
  elix_iron: { id: 'elix_iron', name: 'ยาเหล็กกล้า', type: 'consumable', icon: 'elix_iron', desc: 'ATK/MATK +15% นาน 20 นาที', price: 60, rarity: 1, elixir: { atk: 15, mins: 20 }, stack: true },
  elix_silver: { id: 'elix_silver', name: 'ยาเงินบริสุทธิ์', type: 'consumable', icon: 'elix_silver', desc: 'คริติคอล +10% นาน 20 นาที', price: 90, rarity: 1, elixir: { crit: 10, mins: 20 }, stack: true },
  elix_obsidian: { id: 'elix_obsidian', name: 'ยาหินดำ', type: 'consumable', icon: 'elix_obsidian', desc: 'DEF +30% นาน 20 นาที', price: 120, rarity: 1, elixir: { def: 30, mins: 20 }, stack: true },
  elix_frost: { id: 'elix_frost', name: 'ยาลมหนาว', type: 'consumable', icon: 'elix_frost', desc: 'ความเร็วโจมตี +20% นาน 20 นาที', price: 150, rarity: 2, elixir: { aspd: 20, mins: 20 }, stack: true },
  elix_mithril: { id: 'elix_mithril', name: 'ยามิธริล', type: 'consumable', icon: 'elix_mithril', desc: 'HP +30% DEF +15% นาน 20 นาที', price: 200, rarity: 2, elixir: { hp: 30, def: 15, mins: 20 }, stack: true },
  elix_emerald: { id: 'elix_emerald', name: 'ยาเทพพงไพร', type: 'consumable', icon: 'elix_emerald', desc: 'ATK/MATK +45% นาน 10 นาที', price: 900, rarity: 3, elixir: { atk: 45, mins: 10 }, stack: true },
  elix_soul: { id: 'elix_soul', name: 'ยาเทพวิญญาณ', type: 'consumable', icon: 'elix_soul', desc: 'คริติคอล +30% ATK +20% นาน 10 นาที', price: 1200, rarity: 3, elixir: { crit: 30, atk: 20, mins: 10 }, stack: true },
  elix_magma: { id: 'elix_magma', name: 'ยาเทพเพลิงลาวา', type: 'consumable', icon: 'elix_magma', desc: 'ATK/MATK +35% ความเร็วโจมตี +35% นาน 10 นาที', price: 1600, rarity: 3, elixir: { atk: 35, aspd: 35, mins: 10 }, stack: true },
  elix_frosttear: { id: 'elix_frosttear', name: 'ยาเทพเหมันต์', type: 'consumable', icon: 'elix_frosttear', desc: 'DEF +70% HP +40% นาน 10 นาที', price: 2000, rarity: 3, elixir: { def: 70, hp: 40, mins: 10 }, stack: true },
  elix_god: { id: 'elix_god', name: 'ยาสุดยอดมงกุฎกลวง', type: 'consumable', icon: 'elix_god', desc: 'ทุกค่าพลัง +40% คริ +20% ตีเร็ว +25% EXP +100% นาน 15 นาที', price: 6000, rarity: 4, elixir: { atk: 40, def: 40, hp: 40, crit: 20, aspd: 25, exp: 100, mins: 15 }, stack: true },
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

/** the NPC shop sells supplies, not gear (gear comes from drops, the forge and the player market) */
export const SHOP_STOCK = ['hp_potion', 'hp_potion_l', 'mp_potion', 'scroll_return', 'ration', 'tonic_atk', 'tonic_def', 'tonic_exp', 'mana_shard'];
/** mana crystals the shop sells per day */
export const SHOP_SHARD_DAILY = 5;

export const MAX_UPGRADE = 10;
/** Success chance for upgrading from +n to +n+1 */
export function upgradeChance(n: number): number {
  return [1, 1, 1, 0.85, 0.7, 0.55, 0.45, 0.35, 0.25, 0.15][n] ?? 0;
}
export function upgradeCost(n: number, def: ItemDef): { gold: number; shards: number } {
  // grows fast: the main gold sink for high upgrades
  return { gold: Math.round((def.price * 0.4 + 40) * Math.pow(1.65, n)), shards: 1 + Math.floor(n / 2) + Math.floor(n / 6) * 2 };
}
/** Upgrade multiplier applied to main stat of the item */
export function upgradeMult(n: number): number { return 1 + n * 0.12; }
