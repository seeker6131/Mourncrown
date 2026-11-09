// ===== SERVER-SIDE GAME LOGIC =====
// Every action that changes something valuable (EXP, gold, items, diamonds, buildings, quests) is decided HERE.
// The client only sends a request ("I hit node 42", "buy hp_potion") and shows the answer.
// Today this module runs inside the game (net/client.ts calls it directly); when the server exists it runs there
// unchanged (no Phaser, pure rules) with the player's state loaded from the database, and the client copy is deleted.
// Rules here: never trust numbers from the client — only ids; check everything; random rolls happen here.
import type { GameState } from '../core/state';
import { DEV_TOOLS, WILD_ROOM_CAP } from './config';
import { MONSTERS, type MonsterKind } from '../data/monsters';
import { STAGES, WILD, PITS, stageOf, scaleStats, LANDS, DUNGEON, isDungeon, dungeonLand, DUNGEON_NEED, DUNGEON_SECS } from '../world/stages';
import { pickBase, makeGear, rollRarity } from '../systems/loot';
import { LAND_SET } from '../data/sets';
import { dayKey } from '../systems/daily';
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
import { tutPay, claimLogin } from '../systems/progress';
import { pstats, claimAch, setTitle } from '../data/achievements';
import type { BuildingId, MealId } from '../data/buildings';
import type { ClassId } from '../data/classes';

export interface Ctx { now: number; rnd: () => number }
export type Refused = { refused: string };
const no = (why: string): Refused => ({ refused: why });

// ---- per-player anti-cheat memory (on the server this lives in the player's session) ----
interface Drop { id: string; qty: number; gear?: { rar?: number; aff?: { k: string; v: number }[]; set?: string }; until: number }
/** server-wide news (SL drops) — on the real server this goes to every connected player */
const news: { t: number; name: string; item: string; rar: number }[] = [];
const mem = { drops: new Map<number, Drop>(), did: 1, dungeon: null as null | { li: number; start: number; kills: number }, spawns: new Map<number, { key: string; elite: boolean; boss: boolean }>(), sid: 1, dmg: 0, dmgT: 0, map: 0, nodes: new Map<number, { hits: number; until: number }>(), rate: new Map<string, number[]>() };
/** too many requests of one kind per second = bot / speed hack */
function rateOk(key: string, perSec: number, now: number) {
  const q = (mem.rate.get(key) ?? []).filter(t => now - t < 1000); q.push(now); mem.rate.set(key, q); return q.length <= perSec;
}
/** damage budget: the hero can only deal so much damage per second (generous: crits, skills, area hits) */
function dpsOf(s: GameState) { const d = derive(s); return Math.max(d.atk, d.matk) * (1 + d.crit) * (1000 / d.attackInterval) * 2.5; }

function dungeonRuns(s: GameState, now: number) {
  const t = s as GameState & { dng?: { day: string; used: number } }, day = dayKey(now);
  if (t.dng?.day !== day) t.dng = { day, used: 0 };
  return Object.assign(t.dng, { max: vipActive(s, now) ? 3 : 2 }) as { day: string; used: number; max: number };
}

export const handlers = {
  /** entering a map (server remembers where the player is) */
  enterMap(s: GameState, a: { n: number }, c: Ctx) {
    mem.spawns.clear(); mem.drops.clear();
    if (a.n === 0) { mem.map = 0; return { ok: true }; }
    if (a.n === WILD) { mem.map = WILD; mem.nodes.clear(); return { ok: true }; }
    if (isDungeon(a.n)) {   // daily dungeon: 2 runs a day (VIP 3), land by level
      const li = a.n - DUNGEON; if (li > dungeonLand(s.level)) return no('level');
      const d = dungeonRuns(s, c.now); if (d.used >= d.max) return no('runs');
      d.used++; mem.map = a.n; mem.dungeon = { li, start: c.now, kills: 0 }; mem.dmg = dpsOf(s) * 5; mem.dmgT = c.now;
      return { ok: true };
    }
    const st = STAGES[a.n - 1]; if (!st) return no('map');
    if (s.level < st.req && !(DEV_TOOLS && (s as { tdUnlockAll?: boolean }).tdUnlockAll)) return no('level');
    if (!payStage(s, a.n)) return no('food');
    mem.map = a.n; mem.dmg = dpsOf(s) * 5; mem.dmgT = c.now;
    const sv = s as unknown as { tdMaxMap?: number }; sv.tdMaxMap = Math.max(sv.tdMaxMap ?? 0, a.n);
    return { ok: true };
  },
  /** the server owns every spawn: it hands out an id and decides golden monsters (3%, never bosses / animals / the Deepwild) */
  spawn(_s: GameState, a: { key: string; boss: boolean; animal?: boolean }, c: Ctx) {
    if (mem.spawns.size > 400) mem.spawns.delete(mem.spawns.keys().next().value!);
    const elite = !a.boss && !a.animal && mem.map !== WILD && c.rnd() < 0.03, sid = mem.sid++;
    mem.spawns.set(sid, { key: a.key, elite, boss: a.boss });
    return { sid, elite };
  },
  /** a monster / animal died — the server checks it can live on this map and that the hero could deal that much damage */
  kill(s: GameState, a: { sid: number; kind: MonsterKind; key: string; name: string; size: number; boss: boolean }, c: Ctx) {
    const n = mem.map, base = MONSTERS[a.kind]; if (!n || !base) return no('map');
    const sp = mem.spawns.get(a.sid); if (!sp || sp.key !== a.key || sp.boss !== a.boss) return no('spawn');   // must be a live monster the server spawned
    if (!rateOk('kill', 25, c.now)) return no('rate');   // area skills can drop a whole pack at once
    if (n === WILD) { if (!base.animal) return no('kind'); }
    else if (isDungeon(n)) { const L = LANDS[n - DUNGEON]; if (base.animal || ![...L.mobs, L.boss].some(m => m.kind === a.kind && m.key === a.key && (m === L.boss) === a.boss)) return no('kind'); }
    else { const L = STAGES[n - 1].land; if (base.animal || ![...L.mobs, ...(STAGES[n - 1].boss ? [L.boss] : [])].some(m => m.kind === a.kind && m.key === a.key && (m === L.boss) === a.boss)) return no('kind'); }
    const st = stageOf(n, s.level), hp = scaleStats(base, st.level, a.boss).hp * (sp.elite ? 5 : 1), dps = dpsOf(s);
    mem.dmg = Math.min(dps * 20 * 8, mem.dmg + (c.now - mem.dmgT) / 1000 * dps * 8); mem.dmgT = c.now;
    if (!DEV_TOOLS && mem.dmg < hp) return no('dps');
    mem.dmg = Math.max(0, mem.dmg - hp); mem.spawns.delete(a.sid);
    // loot falls on the ground (server keeps it): the first player to reach it picks it up
    const drops: { did: number; id: string; qty: number; rar: number; set?: string }[] = [];
    const give = (id: string, qty: number, gear?: Drop['gear']) => { const did = mem.did++; mem.drops.set(did, { id, qty, gear, until: c.now + 60000 }); drops.push({ did, id, qty, rar: gear?.rar ?? itemDef(id).rarity, set: gear?.set }); return true; };
    const r = applyKill(s, n, { key: a.key, kind: a.kind, name: a.name, size: a.size }, a.boss, a.boss && !isDungeon(n), c.rnd, sp.elite, give);
    if (isDungeon(n) && mem.dungeon) mem.dungeon.kills++;
    const ps = pstats(s); if (base.animal) ps.animals++; else { ps.kills++; ps.kinds[a.kind] = (ps.kinds[a.kind] ?? 0) + 1; if (sp.elite) ps.golden++; }
    const junk = vipActive(s, c.now) && s.inventory.length >= invSize(s) - 2 ? sellJunk(s, 1) : null;   // VIP auto-sell
    return { ...r, junk, drops };
  },
  /** pick up a drop from the ground (first come, first served) */
  pickup(s: GameState, a: { did: number }, c: Ctx) {
    const d = mem.drops.get(a.did); if (!d || d.until < c.now) { mem.drops.delete(a.did); return no('gone'); }
    if (!rateOk('pickup', 30, c.now)) return no('rate');
    if (!addItem(s, d.id, d.qty, 0, d.gear)) return no('bag');
    mem.drops.delete(a.did);
    const rar = d.gear?.rar ?? itemDef(d.id).rarity;
    if (rar >= 5) { news.push({ t: c.now, name: s.name || 'ผู้เล่น', item: d.id, rar }); if (news.length > 50) news.shift(); }
    return { id: d.id, qty: d.qty, rar, set: d.gear?.set };
  },
  /** (offline simulation only) another player took a drop — online this is just their own pickup */
  dropLost(_s: GameState, a: { did: number }) { return { ok: mem.drops.delete(a.did) }; },
  /** server-wide announcements newer than `since` */
  news: (_s: GameState, a: { since: number }) => news.filter(q => q.t > a.since),
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
    { const ps = pstats(s); ps.ore += r.oreQty; if (r.gem) ps.gems++; }
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
  brew(s: GameState, a: { out: string }) { const r = brew(s, a.out); if (r === 'ok') pstats(s).brews++; return r; },
  achClaim: (s: GameState, a: { id: string }) => claimAch(s, a.id),
  setTitle: (s: GameState, a: { id: string | null }) => setTitle(s, a.id),
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
  /** dungeon cleared: the server checks every wave died in a believable time, then opens the chest */
  dungeonClear(s: GameState, _a: object, c: Ctx) {
    const d = mem.dungeon; if (!d || !isDungeon(mem.map)) return no('map');
    const secs = (c.now - d.start) / 1000;
    if (d.kills < DUNGEON_NEED) return no('waves');
    if (!DEV_TOOLS && secs < 40) return no('fast');
    if (secs > DUNGEON_SECS + 30) return no('time');
    mem.dungeon = null; pstats(s).dungeons++;
    const st = stageOf(DUNGEON + d.li, s.level), set = LAND_SET[LANDS[d.li].id], gear: { id: string; rar: number; set?: string }[] = [];
    for (let i = 0; i < (c.rnd() < 0.3 ? 2 : 1); i++) {   // set pieces: Rare or better
      const b = pickBase(c.rnd, st.level, s.cls), rar = Math.max(2, Math.min(5, rollRarity(c.rnd, st.mf, 2)));
      if (addItem(s, b.id, 1, 0, { ...makeGear(c.rnd, b.id, rar), set })) { gear.push({ id: b.id, rar, set }); if (rar >= 5) news.push({ t: c.now, name: s.name || 'ผู้เล่น', item: b.id, rar }); }
    }
    const gold = Math.round(200 + st.level * 40), shards = 3 + Math.floor(c.rnd() * 3);
    s.gold += gold; addItem(s, 'mana_shard', shards);
    return { gold, shards, gear };
  },
  dungeonInfo: (s: GameState, _a: object, c: Ctx) => ({ ...dungeonRuns(s, c.now), li: dungeonLand(s.level) }),
  /** tutorial finished (or skipped): one-time starter reward */
  tutorialDone: (s: GameState, _a: object) => (tutPay(s) ? { ok: true } : no('paid')),
  /** daily login calendar: one claim per day */
  loginClaim: (s: GameState, _a: object, c: Ctx) => claimLogin(s, c.now) ?? no('claimed'),
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
