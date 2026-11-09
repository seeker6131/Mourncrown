// ===== SERVER-SIDE GAME LOGIC =====
// Every action that changes something valuable (EXP, gold, items, diamonds, buildings, quests) is decided HERE.
// The client only sends a request ("I hit node 42", "buy hp_potion") and shows the answer.
// Today this module runs inside the game (net/client.ts calls it directly); when the server exists it runs there
// unchanged (no Phaser, pure rules) with the player's state loaded from the database, and the client copy is deleted.
// Rules here: never trust numbers from the client — only ids; check everything; random rolls happen here.
import type { GameState } from '../core/state';
import { DEV_TOOLS, WILD_ROOM_CAP } from './config';
import { MONSTERS, type MonsterKind } from '../data/monsters';
import { STAGES, WILD, PITS, stageOf, scaleStats } from '../world/stages';
import { applyKill } from '../systems/rewards';
import { gatherReward, brew, type Vein } from '../systems/alchemy';
import { derive } from '../systems/stats';
import { addItem, sellUid, sellJunk, tryUpgrade, dismantle, equip, unequipUid, useItem } from '../systems/inventory';
import { itemDef, SHOP_STOCK, SHOP_SHARD_DAILY } from '../data/items';
import { build, upgrade, collect, craft, cook } from '../systems/settlement';
import { upSkill, advanceClass } from '../systems/stats';
import { listItem, cancelListing } from '../systems/market';
import { buyDiamondItem, claimVipGift, grantVip, grantDiamonds, vipActive } from '../systems/premium';
import { claimTdQuest } from '../systems/tdQuests';
import { acceptQuest, completeQuest } from '../systems/quests';
import { payStage } from '../systems/supplies';
import { giveTestKit, testLevelUp } from '../systems/testKit';
import { invSize } from '../core/state';
import type { BuildingId, MealId } from '../data/buildings';
import type { ClassId } from '../data/classes';

export interface Ctx { now: number; rnd: () => number }
export type Refused = { refused: string };
const no = (why: string): Refused => ({ refused: why });

// ---- per-player anti-cheat memory (on the server this lives in the player's session) ----
const mem = { dmg: 0, dmgT: 0, map: 0, nodes: new Map<number, { hits: number; until: number }>(), rate: new Map<string, number[]>() };
/** too many requests of one kind per second = bot / speed hack */
function rateOk(key: string, perSec: number, now: number) {
  const q = (mem.rate.get(key) ?? []).filter(t => now - t < 1000); q.push(now); mem.rate.set(key, q); return q.length <= perSec;
}
/** damage budget: the hero can only deal so much damage per second (generous: crits, skills, area hits) */
function dpsOf(s: GameState) { const d = derive(s); return Math.max(d.atk, d.matk) * (1 + d.crit) * (1000 / d.attackInterval) * 2.5; }

export const handlers = {
  /** entering a map (server remembers where the player is) */
  enterMap(s: GameState, a: { n: number }, c: Ctx) {
    if (a.n === 0) { mem.map = 0; return { ok: true }; }
    if (a.n === WILD) { mem.map = WILD; mem.nodes.clear(); return { ok: true }; }
    const st = STAGES[a.n - 1]; if (!st) return no('map');
    if (s.level < st.req && !(DEV_TOOLS && (s as { tdUnlockAll?: boolean }).tdUnlockAll)) return no('level');
    if (!payStage(s, a.n)) return no('food');
    mem.map = a.n; mem.dmg = dpsOf(s) * 5; mem.dmgT = c.now;
    const sv = s as unknown as { tdMaxMap?: number }; sv.tdMaxMap = Math.max(sv.tdMaxMap ?? 0, a.n);
    return { ok: true };
  },
  /** a monster / animal died — the server checks it can live on this map and that the hero could deal that much damage */
  kill(s: GameState, a: { kind: MonsterKind; key: string; name: string; size: number; boss: boolean }, c: Ctx) {
    const n = mem.map, base = MONSTERS[a.kind]; if (!n || !base) return no('map');
    if (!rateOk('kill', 8, c.now)) return no('rate');
    if (n === WILD) { if (!base.animal) return no('kind'); }
    else { const L = STAGES[n - 1].land; if (base.animal || ![...L.mobs, ...(STAGES[n - 1].boss ? [L.boss] : [])].some(m => m.kind === a.kind && m.key === a.key && (m === L.boss) === a.boss)) return no('kind'); }
    const st = stageOf(n, s.level), hp = scaleStats(base, st.level, a.boss).hp, dps = dpsOf(s);
    mem.dmg = Math.min(dps * 20 * 8, mem.dmg + (c.now - mem.dmgT) / 1000 * dps * 8); mem.dmgT = c.now;
    if (!DEV_TOOLS && mem.dmg < hp) return no('dps');
    mem.dmg = Math.max(0, mem.dmg - hp);
    const r = applyKill(s, n, { key: a.key, kind: a.kind, name: a.name, size: a.size }, a.boss, a.boss, c.rnd);
    const junk = vipActive(s, c.now) && s.inventory.length >= invSize(s) - 2 ? sellJunk(s, 1) : null;   // VIP auto-sell
    return { ...r, junk };
  },
  /** one hit on a tree / rock in the Deepwild: the client sends only the node id and which pit; the ore is decided here */
  gather(s: GameState, a: { node: number; kind: 'wood' | 'stone'; pit: number; rare?: boolean; gold?: boolean }, c: Ctx) {
    if (mem.map !== WILD) return no('map');
    if (!rateOk('gather', 3, c.now)) return no('rate');
    const nd = mem.nodes.get(a.node) ?? { hits: 0, until: 0 };
    if (nd.until > c.now) return no('empty');
    const P = a.pit >= 0 ? PITS[a.pit] : null; if (a.pit >= 0 && !P) return no('pit');
    const vein: Vein | null = P ? { ore: P.ore, gem: P.gem, req: P.req, rare: !!a.rare, gold: !!a.gold } : null;
    const r = gatherReward(s, a.kind, WILD, vein, c.rnd);
    if (r.low) return { ...r, refused: 'level' };
    nd.hits++; const max = a.rare ? 6 : 4;
    if (nd.hits >= max) { nd.hits = 0; nd.until = c.now + (a.rare ? 240000 : 45000) - 1500; }
    mem.nodes.set(a.node, nd);
    return r;
  },
  /** Deepwild rooms: 100 players each; until online the counts are simulated */
  wildRooms(s: GameState, a: { pick?: number }, c: Ctx) {
    const hour = Math.floor(c.now / 600000);
    const rooms = Array.from({ length: 6 }, (_, i) => ({ id: i + 1, count: Math.min(WILD_ROOM_CAP, Math.round(((Math.sin(hour * 1.7 + i * 2.3) + 1) / 2) * 90 + (i === 0 ? 10 : 0))) }));
    const sv = s as unknown as { wildRoom?: number };
    let room = a.pick ?? sv.wildRoom ?? (rooms.find(r => r.count < WILD_ROOM_CAP)?.id ?? 1);
    if (rooms[room - 1].count >= WILD_ROOM_CAP) { if (a.pick) return { refused: 'full', rooms, room: sv.wildRoom ?? 1, cap: WILD_ROOM_CAP }; room = rooms.find(r => r.count < WILD_ROOM_CAP)?.id ?? 1; }
    sv.wildRoom = room;
    return { rooms, room, cap: WILD_ROOM_CAP };
  },
  brew: (s: GameState, a: { out: string }) => brew(s, a.out),
  shopBuy(s: GameState, a: { id: string }, c: Ctx) {
    if (!SHOP_STOCK.includes(a.id)) return no('item');
    const def = itemDef(a.id), sd = s as unknown as { shopDay?: { d: string; shards: number } }, today = new Date(c.now).toDateString();
    if (sd.shopDay?.d !== today) sd.shopDay = { d: today, shards: 0 };
    if (a.id === 'mana_shard' && sd.shopDay.shards >= SHOP_SHARD_DAILY) return no('cap');
    if (s.gold < def.price) return no('gold');
    if (!addItem(s, a.id, 1)) return no('bag');
    s.gold -= def.price; if (a.id === 'mana_shard') sd.shopDay.shards++;
    return { ok: true };
  },
  /** VIP perk: buy a potion automatically when low */
  autoPotion(s: GameState, _a: object, c: Ctx) { if (!vipActive(s, c.now) || s.gold < 25 || !addItem(s, 'hp_potion', 1)) return no('vip'); s.gold -= 25; return { ok: true }; },
  sell: (s: GameState, a: { uid: number; qty: number }) => sellUid(s, a.uid, Math.max(1, Math.floor(a.qty))),
  sellJunk: (s: GameState, a: { maxRar: number }) => sellJunk(s, Math.min(2, a.maxRar)),
  upgradeItem: (s: GameState, a: { uid: number }, c: Ctx) => tryUpgrade(s, a.uid, c.rnd),
  dismantle: (s: GameState, a: { uid: number }) => dismantle(s, a.uid),
  equip: (s: GameState, a: { uid: number }) => equip(s, a.uid),
  unequip: (s: GameState, a: { uid: number }) => unequipUid(s, a.uid),
  useItem: (s: GameState, a: { uid: number }, c: Ctx) => useItem(s, a.uid, c.now),
  craft: (s: GameState, a: { slot: 'weapon' | 'armor' | 'accessory' }, c: Ctx) => craft(s, a.slot, c.rnd),
  cook: (s: GameState, a: { meal: MealId }, c: Ctx) => cook(s, a.meal, c.now),
  build: (s: GameState, a: { plot: number; id: BuildingId }, c: Ctx) => build(s, a.plot, a.id, c.now),
  upgradeBuilding: (s: GameState, a: { plot: number }) => upgrade(s, a.plot),
  collect: (s: GameState, a: { plot: number }) => collect(s, a.plot),
  upSkill: (s: GameState, a: { id: string }) => upSkill(s, a.id),
  /** class change; from villager the new line gets a free starter weapon (equipped) */
  advanceClass(s: GameState, a: { cls?: ClassId }) {
    const wasVillager = (s.tier ?? 0) === 0;
    if (!advanceClass(s, a.cls)) return { ok: false, weapon: null as string | null };
    let weapon: string | null = null;
    if (wasVillager) { const w = ({ sword: 'iron_sword', archer: 'short_bow', mage: 'apprentice_wand', cleric: 'iron_mace' } as Record<string, string>)[s.cls]; if (w && addItem(s, w, 1)) { equip(s, s.inventory[s.inventory.length - 1].uid); weapon = w; } }
    return { ok: true, weapon };
  },
  marketList: (s: GameState, a: { uid: number; qty: number; price: number }, c: Ctx) => listItem(s, a.uid, a.qty, a.price, c.now),
  marketCancel: (s: GameState, a: { id: string }) => cancelListing(s, a.id),
  buyDiamond: (s: GameState, a: { id: string }, c: Ctx) => buyDiamondItem(s, a.id, c.now),
  vipGift: (s: GameState, _a: object, c: Ctx) => claimVipGift(s, c.now),
  claimTdQuest: (s: GameState, _a: object) => claimTdQuest(s),
  acceptQuest: (s: GameState, a: { id: string }) => acceptQuest(s, a.id),
  completeQuest: (s: GameState, a: { id: string }) => completeQuest(s, a.id),
  /** test buttons — refused when DEV_TOOLS is off (must be off for OBT) */
  dev(s: GameState, a: { op: 'kit' | 'level' | 'vip' | 'diamonds'; n?: number }, c: Ctx): Refused | { got: string[] } {
    if (!DEV_TOOLS) return no('dev');
    if (a.op === 'kit') return { got: giveTestKit(s, 5, c.rnd) };
    if (a.op === 'level') testLevelUp(s, a.n ?? 10);
    else if (a.op === 'vip') grantVip(s, a.n ?? 3, c.now);
    else grantDiamonds(s, a.n ?? 1000);
    return { got: [] };
  },
};
export type Handlers = typeof handlers;
