// Single source of truth for persistent player progress. Serialised by save.ts.
import type { EquipSlot } from '../data/items';

export type StatKey = 'str' | 'agi' | 'vit' | 'int' | 'luk';
export const STAT_KEYS: StatKey[] = ['str', 'agi', 'vit', 'int', 'luk'];
export const STAT_NAMES: Record<StatKey, string> = { str: 'STR', agi: 'AGI', vit: 'VIT', int: 'INT', luk: 'LUK' };
export const STAT_DESC: Record<StatKey, string> = {
  str: 'พลังโจมตีกายภาพ',
  agi: 'ความเร็วโจมตี/เคลื่อนที่ หลบหลีก',
  vit: 'HP สูงสุด และพลังป้องกัน',
  int: 'MP สูงสุด และพลังเวท',
  luk: 'โอกาสคริติคอล และดรอปไอเทม',
};

export interface InvItem { uid: number; id: string; qty: number; upg: number; rar?: number; aff?: { k: string; v: number }[]; set?: string }

export interface QuestProgress { id: string; progress: number; status: 'active' | 'ready' | 'done' }

export interface GameState {
  version: number;
  name: string;
  level: number;
  exp: number;
  statPoints: number;
  base: Record<StatKey, number>;
  hp: number;
  mp: number;
  gold: number;
  inventory: InvItem[];
  equip: Record<EquipSlot, number | null>; // uid of item in inventory
  quests: QuestProgress[];
  kills: Record<string, number>;
  pos: { x: number; y: number };
  auto: boolean;
  music: boolean;
  sfx: boolean;
  nextUid: number;
  playTime: number;
  bossDefeated: number;
  chests: number[];
  mapVer: number;
  res: { wood: number; stone: number; food: number };
  buildings: { plot: number; type: string; level: number; stored: number; last: number; done?: number }[];
  skillPts: number;
  skillLv: Record<string, number>;
  buff: { stat: string; pct: number; until: number } | null;
  introSeen: boolean;
  cls: 'novice' | 'sword' | 'archer' | 'mage' | 'cleric';
  tier: number;
  outfit: 'hunt' | 'gather';
  /** look of the first (villager) form: m = the male villager, f = the female villager 'heroF' (wardrobe, free) */
  look?: 'm' | 'f';
  useTier?: number;
  dayTime: number;
  map?: string;
  mapPos?: Record<string, { x: number; y: number }>;
  prevOutfit?: 'hunt' | 'gather';
}

export const SAVE_VERSION = 1;
export const INV_SIZE = 30;
/** Bag size grows with the warehouse. */
export function invSize(s: { buildings: { type: string; level: number }[] }) {
  const p = s as { bagPlus?: number; vipUntil?: number };
  return INV_SIZE + 5 * (s.buildings.find(b => b.type === 'warehouse')?.level ?? 0) + 2 * (s.buildings.find(b => b.type === 'home')?.level ?? 0) + (p.bagPlus ?? 0) + ((p.vipUntil ?? 0) > Date.now() ? 20 : 0);
}

export function newGameState(): GameState {
  const s: GameState = {
    version: SAVE_VERSION,
    name: 'Aren',
    level: 1,
    exp: 0,
    statPoints: 3,
    base: { str: 5, agi: 4, vit: 5, int: 4, luk: 3 },
    hp: 1, mp: 1,
    gold: 50,
    inventory: [],
    equip: { weapon: null, armor: null, accessory: null },
    quests: [],
    kills: {},
    pos: { x: -1, y: -1 },
    auto: false,
    music: true,
    sfx: true,
    nextUid: 1,
    playTime: 0,
    bossDefeated: 0,
    chests: [],
    mapVer: 2,
    res: { wood: 0, stone: 0, food: 0 },
    buildings: [],
    skillPts: 0,
    skillLv: {},
    buff: null,
    introSeen: false,
    cls: 'novice',
    tier: 0,
    outfit: 'hunt',
    dayTime: 0.15,
  };
  return s;
}
