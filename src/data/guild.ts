// Guild village & guild war numbers (docs/GUILD_WAR.md). Behind the scenes only: never shown to players as rates.
import { BUILDINGS, type Cost } from './buildings';

/** the guild village opens at this level: before that every player lives in the starter (NPC) village */
export const GUILD_UNLOCK_LV = 20;
export const GUILD_MAX = 10;          // members
export const DEPUTY_MAX = 2;
export const HOUSE_SLOTS = 10;        // house plots on the residential street
/** guild village plot numbers (src/world/villageLayout.ts): 0-8 the craft / production buildings, 9 the guild hall, 10-19 the members' houses */
export const HALL_PLOT = 9, HOUSE_PLOT0 = 10;
export const housePlot = (i: number) => HOUSE_PLOT0 + i;
/** village buildings cost this many times more than the old single-player prices: ten members pay together */
export const GUILD_COST_MULT = 3;
/** village treasury holds this much of each resource (the warehouse raises it) */
export const treasuryCap = (whLv: number) => 20000 + 20000 * whLv;
/** part of the treasury in the vault: raids can't touch it */
export const vaultShare = (whLv: number) => Math.min(0.7, 0.2 + 0.1 * whLv);
/** by stars won (0-3): share of the unprotected treasury the defender loses */
export const RAID_TAKE = [0, 0.08, 0.14, 0.2];
/** the attacker receives this part of what the defender lost (the rest is gone: raids never create resources) */
export const RAID_GAIN = 0.7;
/** stored output in a destroyed production building: the attacker gets this part */
export const RAID_STORED = 0.5;
export const SHIELD_H = [0, 12, 14, 16];
export const RAIDS_PER_DAY = 3;
export const RAID_SECS = 180;
/** rest: kills with +REST_EXP % EXP, earned per real hour after sleeping in your house */
export const REST_PER_HOUR = 10;
export const REST_EXP = 50;
export const restCap = (houseLv: number) => 300 + 150 * houseLv;
export const stashSlots = (houseLv: number) => 10 + 10 * Math.max(0, houseLv);   // (10 slots even before a house — player feedback 14 Nov; +10 per house level)
export const trophySlots = (houseLv: number) => (houseLv > 0 ? Math.min(6, 1 + houseLv) : 0);
/** permanent bonus (%) for each displayed trophy, by rarity (Super Rare and up) */
export const TROPHY_BONUS: Record<number, { atk: number; def: number; hp: number }> = { 3: { atk: 1, def: 0, hp: 1 }, 4: { atk: 2, def: 1, hp: 2 }, 5: { atk: 4, def: 2, hp: 3 } };
/** defense slots that can be used, by guild hall level */
export const defSlots = (hallLv: number) => [0, 4, 6, 8, 11, 14][Math.max(0, Math.min(5, hallLv))];
/** guild points (contribution) per donated unit */
export const CONTRIB = { gold: 0.05, wood: 1, stone: 1.5, food: 1 };
export const itemContrib = (price: number) => Math.max(1, Math.round(price / 10));

export type DefenseId = 'spikes' | 'palisade' | 'archer' | 'cannon' | 'ballista' | 'bunker' | 'banner';
export interface DefenseDef {
  id: DefenseId; name: string; desc: string; icon: string; art: string;
  /** guild hall level needed */
  hall: number;
  hp: number; dmg: number; range: number;
  /** ms between shots / hits (0 = does not attack) */
  rate: number;
  aoe?: number; slow?: number; spawn?: number; buff?: number;
  shot?: 'arrow' | 'ball' | 'bolt';
  costs: Cost[];
}
const lvCosts = (g: number, w: number, st: number): Cost[] => [1, 2.4, 5, 10, 18].map(m => ({ gold: Math.round(g * m), wood: Math.round(w * m), stone: Math.round(st * m) }));
export const DEFENSES: Record<DefenseId, DefenseDef> = {
  spikes: { id: 'spikes', name: 'รั้วหนาม', icon: '🌵', art: 'def_spikes', hall: 1, hp: 500, dmg: 6, range: 26, rate: 600, slow: 0.45, desc: 'ชะลอศัตรูที่เดินผ่าน และทิ่มเลือดซิบๆ', costs: lvCosts(300, 400, 100) },
  palisade: { id: 'palisade', name: 'กำแพงไม้', icon: '🪵', art: 'def_palisade', hall: 1, hp: 1600, dmg: 0, range: 0, rate: 0, desc: 'ขวางทาง ต้องฟันให้พังก่อนผ่าน', costs: lvCosts(200, 600, 200) },
  archer: { id: 'archer', name: 'ป้อมนักธนู', icon: '🏹', art: 'def_archer', hall: 1, hp: 900, dmg: 22, range: 170, rate: 900, shot: 'arrow', desc: 'ยิงไกล ยิงเร็ว', costs: lvCosts(600, 500, 300) },
  cannon: { id: 'cannon', name: 'ปืนใหญ่', icon: '💣', art: 'def_cannon', hall: 2, hp: 1200, dmg: 60, range: 140, rate: 2600, aoe: 46, shot: 'ball', desc: 'ยิงช้า แต่ระเบิดโดนทั้งกลุ่ม', costs: lvCosts(1200, 400, 900) },
  ballista: { id: 'ballista', name: 'ป้อมหน้าไม้ยักษ์', icon: '🎯', art: 'def_ballista', hall: 3, hp: 1400, dmg: 110, range: 200, rate: 2200, shot: 'bolt', desc: 'ยิงทีละนัด แรงมาก ไกลที่สุด', costs: lvCosts(2000, 900, 1100) },
  bunker: { id: 'bunker', name: 'บังเกอร์', icon: '🛡', art: 'def_bunker', hall: 2, hp: 2200, dmg: 0, range: 120, rate: 0, spawn: 2, desc: 'ทหารวิ่งออกมาสู้เมื่อศัตรูเข้าใกล้', costs: lvCosts(1500, 600, 1400) },
  banner: { id: 'banner', name: 'ธงศึกกิลด์', icon: '🚩', art: 'def_banner', hall: 3, hp: 700, dmg: 0, range: 150, rate: 0, buff: 15, desc: 'ป้อมและทหารรอบธงแรงขึ้น', costs: lvCosts(2500, 300, 300) },
};
export const DEF_ORDER: DefenseId[] = ['spikes', 'palisade', 'archer', 'cannon', 'bunker', 'ballista', 'banner'];
/** stats grow with the defense's level (1-5) */
export const defStat = (d: DefenseDef, lv: number) => ({ hp: Math.round(d.hp * (1 + 0.5 * (lv - 1))), dmg: Math.round(d.dmg * (1 + 0.4 * (lv - 1))), range: d.range, rate: d.rate });

/** guild shop: spend guild points */
export const GUILD_SHOP: { id: string; pts: number; daily: number }[] = [
  { id: 'hp_potion_l', pts: 30, daily: 10 }, { id: 'scroll_return', pts: 40, daily: 5 }, { id: 'mana_shard', pts: 60, daily: 5 },
  { id: 'tonic_exp', pts: 120, daily: 3 }, { id: 'elix_iron', pts: 150, daily: 2 }, { id: 'ancient_core', pts: 900, daily: 1 },
];

/** daily guild goals (the whole guild works on them together) */
export type GoalKind = 'wood' | 'stone' | 'kill' | 'animal' | 'ore';
export const GOAL_POOL: { kind: GoalKind; name: string; per: number; reward: Cost; pts: number }[] = [
  { kind: 'wood', name: 'ตัดไม้', per: 300, reward: { gold: 600, stone: 300 }, pts: 40 },
  { kind: 'stone', name: 'ขุดหิน', per: 250, reward: { gold: 600, wood: 300 }, pts: 40 },
  { kind: 'kill', name: 'ล่ามอน', per: 60, reward: { gold: 900, food: 200 }, pts: 40 },
  { kind: 'animal', name: 'ล่าสัตว์', per: 40, reward: { gold: 500, food: 400 }, pts: 30 },
  { kind: 'ore', name: 'ส่งแร่', per: 15, reward: { gold: 800, stone: 400 }, pts: 50 },
];

/** simulated guild members until the game is online (names shown with a small "จำลอง" mark) */
export const SIM_NAMES = ['Kaito', 'น้องมิ้น', 'Arden', 'ลุงหมี', 'Vexa', 'พี่ต้น', 'Mira_99', 'Thorn', 'ฟ้าใส', 'Grimm', 'Lyra', 'มะปราง'];
export const RIVAL_NAMES = ['กิลด์หมาป่าเงา', 'ทัพเขี้ยวเหล็ก', 'ภราดรเปลวเพลิง', 'สมาคมกาดำ', 'อัศวินจันทร์ซีด', 'กองโจรหนองน้ำ', 'พันธมิตรใบไม้แดง', 'ป้อมหินผา'];

// ---------------------------------------------------------------- guild village buildings (owned by the guild, start at Lv1)
export type GuildBld = 'hall' | 'forge' | 'kitchen' | 'tavern' | 'market' | 'warehouse' | 'lumber' | 'quarry' | 'barn' | 'barracks';
export interface GuildBldDef { id: GuildBld; name: string; icon: string; desc: string; produces?: 'gold' | 'wood' | 'stone' | 'food'; rate?: number; effect: (lv: number) => string; costs: Cost[] }
const fromStarter = (id: keyof typeof BUILDINGS) => BUILDINGS[id].costs;
/** the guild hall exists only in the guild village (paid by the treasury as is, no x3) */
const HALL_COSTS: Cost[] = [
  { gold: 0 },
  { gold: 6000, wood: 3000, stone: 3000, food: 1000 },
  { gold: 15000, wood: 7000, stone: 7000, food: 2500, items: { wolf_pelt: 20 } },
  { gold: 36000, wood: 15000, stone: 15000, food: 5000, items: { goblin_fang: 20, ancient_core: 2 } },
  { gold: 80000, wood: 30000, stone: 30000, food: 10000, items: { ancient_core: 6 } },
];
export const GUILD_BLD: Record<GuildBld, GuildBldDef> = {
  hall: { id: 'hall', name: 'หอกิลด์', icon: '🏛', desc: 'หัวใจของหมู่บ้าน: หีบบริจาค กระดานภารกิจกิลด์ ร้านกิลด์ โต๊ะวางแผนปล้น • ถ้าโดนทำลายตอนถูกปล้น = แพ้', costs: HALL_COSTS,
    effect: lv => `อาคาร/ป้อมอัปได้ถึง Lv${lv} • ช่องป้อม ${[0, 4, 6, 8, 11, 14][lv]} ช่อง` },
  warehouse: { id: 'warehouse', name: 'โกดัง & ห้องนิรภัย', icon: '📦', desc: 'เก็บคลังหมู่บ้าน — ส่วนที่อยู่ในห้องนิรภัยปล้นไม่ได้', costs: fromStarter('warehouse'),
    effect: lv => `คลังเก็บได้ ${(20000 + 20000 * lv).toLocaleString()}/อย่าง • ห้องนิรภัยกัน ${Math.round(Math.min(0.7, 0.2 + 0.1 * lv) * 100)}%` },
  barracks: { id: 'barracks', name: 'ค่ายทหาร', icon: '⚔', desc: 'จ้างทหาร NPC มาเฝ้าหมู่บ้าน (จ่ายค่าจ้างและเสบียงจากคลัง) — ยิ่งเลเวลสูงยิ่งจ้างได้มากและทหารแกร่ง', costs: fromStarter('tower'),
    effect: lv => `จ้างทหารได้ ${Math.min(10, lv * 2)} นาย • ทหารแกร่ง +${(lv - 1) * 15}%` },
  forge: { id: 'forge', name: 'โรงหลอมกิลด์', icon: '⚒', desc: 'ตีบวก หลอมของ • ซ่อมป้อมถูกลงตามเลเวล', costs: fromStarter('forge'),
    effect: lv => `ค่าซ่อมป้อม -${(lv - 1) * 10}%` },
  kitchen: { id: 'kitchen', name: 'ครัวกิลด์', icon: '🍲', desc: 'ทำอาหารบัฟ ปรุงยา • ทำเสบียงทหาร (ทหารกินน้อยลง)', costs: fromStarter('kitchen'),
    effect: lv => `เสบียงทหารประหยัด ${(lv - 1) * 10}%` },
  tavern: { id: 'tavern', name: 'โรงเตี๊ยมกิลด์', icon: '🍺', desc: 'กระดานภารกิจกิลด์ได้รางวัลมากขึ้น • Lv3 เปิดภารกิจที่ 4', costs: fromStarter('tavern'),
    effect: lv => `รางวัลภารกิจกิลด์ +${(lv - 1) * 10}%${lv >= 3 ? ' • ภารกิจ 4 อย่าง' : ''}` },
  market: { id: 'market', name: 'ตลาดกิลด์', icon: '💰', desc: 'เก็บภาษีเป็นทองเข้าคลัง • ซื้อขายของ', produces: 'gold', rate: 2, costs: fromStarter('market'),
    effect: lv => `ทองเข้าคลัง ${(2 * (1 + (lv - 1) * 0.6)).toFixed(1)}/นาที` },
  lumber: { id: 'lumber', name: 'โรงไม้กิลด์', icon: '🪵', desc: 'ผลิตไม้เข้าคลังหมู่บ้าน', produces: 'wood', rate: 1.2, costs: fromStarter('lumber'),
    effect: lv => `ไม้เข้าคลัง ${(1.2 * (1 + (lv - 1) * 0.6)).toFixed(1)}/นาที` },
  quarry: { id: 'quarry', name: 'เหมืองหินกิลด์', icon: '🪨', desc: 'ผลิตหินเข้าคลังหมู่บ้าน', produces: 'stone', rate: 0.8, costs: fromStarter('quarry'),
    effect: lv => `หินเข้าคลัง ${(0.8 * (1 + (lv - 1) * 0.6)).toFixed(1)}/นาที` },
  barn: { id: 'barn', name: 'คอกสัตว์กิลด์', icon: '🐄', desc: 'ผลิตอาหารเข้าคลัง (เลี้ยงทหาร)', produces: 'food', rate: 1.8, costs: fromStarter('barn'),
    effect: lv => `อาหารเข้าคลัง ${(1.8 * (1 + (lv - 1) * 0.6)).toFixed(1)}/นาที` },
};
export const GUILD_BLD_ORDER: GuildBld[] = ['hall', 'warehouse', 'barracks', 'forge', 'kitchen', 'tavern', 'market', 'lumber', 'quarry', 'barn'];
export const gbRate = (d: GuildBldDef, lv: number) => (d.rate ?? 0) * (1 + (lv - 1) * 0.6);
export const gbStoreCap = (d: GuildBldDef, lv: number) => Math.round(gbRate(d, lv) * 240);

// ---------------------------------------------------------------- hired guards
export type GuardType = 'spear' | 'archer';
export const GUARDS: Record<GuardType, { name: string; key: string; hire: Cost; hp: number; atk: number; range: number; rate: number }> = {
  spear: { name: 'ทหารหอก', key: 'np8', hire: { gold: 800, food: 300 }, hp: 900, atk: 34, range: 30, rate: 1300 },
  archer: { name: 'นักธนูเฝ้าเมือง', key: 'np10', hire: { gold: 1000, wood: 200, food: 300 }, hp: 600, atk: 26, range: 150, rate: 1500 },
};
export const guardCap = (barracksLv: number) => Math.min(10, barracksLv * 2);
/** food each guard eats per hour from the treasury (the guild kitchen cuts it) */
export const GUARD_FOOD_H = 3;
