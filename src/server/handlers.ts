// ===== SERVER-SIDE GAME LOGIC =====
// Every action that changes something valuable (EXP, gold, items, diamonds, buildings, quests) is decided HERE.
// The client only sends a request ("I hit node 42", "buy hp_potion") and shows the answer.
// Today this module runs inside the game (net/client.ts calls it directly); when the server exists it runs there
// unchanged (no Phaser, pure rules) with the player's state loaded from the database, and the client copy is deleted.
// Rules here: never trust numbers from the client — only ids; check everything; random rolls happen here.
import type { GameState } from '../core/state';
import { DEV_TOOLS, WILD_ROOM_CAP, MAP_ROOM_CAP } from './config';
import { fillRooms, pickRoom } from '../systems/rooms';
import { startWar, warTick, warHit, warKill, warEnd, warDone } from '../systems/war';
import { buyMount, selectMount, grantMount, hasMount } from '../systems/mounts';
import { DRAGON_BOUNTY, type MountId } from '../data/mounts';
import { bountyOf, markBounty, BOUNTY_HP } from '../systems/bounty';
import { MONSTERS, type MonsterKind } from '../data/monsters';
import { STAGES, WILD, PITS, stageOf, scaleStats, LANDS, DUNGEON, isDungeon, dungeonLand, DUNGEON_NEED, DUNGEON_SECS } from '../world/stages';
import { pickBase, makeGear, rollRarity } from '../systems/loot';
import { LAND_SET } from '../data/sets';
import { dayKey } from '../systems/daily';
import { energy, gatherMult, huntMult, clampRes } from '../systems/economy';
import { applyKill } from '../systems/rewards';
import { gatherReward, brew, type Vein } from '../systems/alchemy';
import { derive } from '../systems/stats';
import { addItem, sellUid, sellJunk, tryUpgrade, dismantle, equip, unequipUid, useItem } from '../systems/inventory';
import { itemDef, SHOP_STOCK, SHOP_SHARD_DAILY } from '../data/items';
import { build, upgrade, collect, craft, cook } from '../systems/settlement';
import {
  guildOf, homeOf, donate, upgradeVillage, collectVillage, setRole, simInvite, kick, defBuild, defUpgrade, defRepair, defRemove, createGuild, joinGuild,
  houseBuild, hireGuard, dismissGuard, sleep, wake, trophyPut, trophyTake, stashPut, stashTake, shopBuy as guildShopBuy, goals, goalProgress, guildTick, rivals,
  rivalStructs, canRaid, raidResult, devGuild, seasonClaim, bldRepair, houseRepair, setFlag, type Rival, type Wreck,
} from '../systems/guild';
import { RAID_SECS, REST_EXP, GUILD_BLD, type DefenseId, type GuildBld, type GuardType } from '../data/guild';
import { gainExp } from '../systems/stats';
import { upSkill, advanceClass } from '../systems/stats';
import { listItem, cancelListing } from '../systems/market';
import { buyDiamondItem, claimVipGift, grantVip, grantDiamonds, vipActive } from '../systems/premium';
import { claimTdQuest } from '../systems/tdQuests';
import { acceptQuest, completeQuest } from '../systems/quests';
import { eatSupplies, heroFed } from '../systems/supplies';
import { giveTestKit, testLevelUp } from '../systems/testKit';
import { invSize } from '../core/state';
import { tutPay, claimLogin } from '../systems/progress';
import { pstats, claimAch, setTitle } from '../data/achievements';
import type { BuildingId, MealId } from '../data/buildings';
import type { ClassId } from '../data/classes';

export interface Ctx { now: number; rnd: () => number }
/** potions a VIP can buy away from the shop */
const VIP_POTIONS = ['hp_potion', 'hp_potion_l', 'mp_potion'];
export type Refused = { refused: string };
const no = (why: string): Refused => ({ refused: why });

// ---- per-player anti-cheat memory (on the server this lives in the player's session) ----
interface Drop { id: string; qty: number; gear?: { rar?: number; aff?: { k: string; v: number }[]; set?: string }; until: number }
/** server-wide news (SL drops) — on the real server this goes to every connected player */
const news: { t: number; name: string; item: string; rar: number }[] = [];
/** the defense battle reports what burned (test op only — online the server runs the battle itself) */
const cleanWreck = (w?: Wreck): Wreck | undefined => {
  if (!w) return undefined;
  const b: Wreck['b'] = {}, k = (x: unknown) => Math.max(0, Math.min(1, Number(x) || 0));
  for (const t of Object.keys(w.b ?? {})) if (GUILD_BLD[t as GuildBld]) b[t as GuildBld] = k(w.b![t as GuildBld]);
  return { b, house: k(w.house) };
};
/** one player's server memory (spawns, drops, damage budget, map...): the game server keeps one per player and swaps it
 *  in before each action (useMem); handlers run synchronously, so this is safe even with many players in one process */
export function newMem() { return { raid: null as null | { rival: Rival; start: number; hp: number }, drops: new Map<number, Drop>(), did: 1, dungeon: null as null | { li: number; start: number; kills: number }, spawns: new Map<number, { key: string; elite: boolean; boss: boolean; bounty?: number }>(), sid: 1, dmg: 0, dmgT: 0, map: 0, supAt: 0, nodes: new Map<number, { hits: number; until: number }>(), rate: new Map<string, number[]>() }; }
export type Mem = ReturnType<typeof newMem>;
let mem: Mem = newMem();
export function useMem(m: Mem) { mem = m; }
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
    if (a.n === 0) { mem.map = 0; heroFed(s); return { ok: true }; }   // home: the hero has eaten
    if (a.n === WILD) { mem.map = WILD; mem.nodes.clear(); return { ok: true }; }
    if (isDungeon(a.n)) {   // daily dungeon: 2 runs a day (VIP 3), land by level
      const li = a.n - DUNGEON; if (li > dungeonLand(s.level)) return no('level');
      const d = dungeonRuns(s, c.now); if (d.used >= d.max) return no('runs');
      d.used++; mem.map = a.n; mem.dungeon = { li, start: c.now, kills: 0 }; mem.dmg = dpsOf(s) * 5; mem.dmgT = c.now;
      return { ok: true };
    }
    const st = STAGES[a.n - 1]; if (!st) return no('map');
    if (s.level < st.req && !(DEV_TOOLS && (s as { tdUnlockAll?: boolean }).tdUnlockAll)) return no('level');
    mem.map = a.n; mem.supAt = c.now; mem.dmg = dpsOf(s) * 5; mem.dmgT = c.now;   // supplies are eaten while here (supplyTick), not paid at the gate
    const sv = s as unknown as { tdMaxMap?: number }; sv.tdMaxMap = Math.max(sv.tdMaxMap ?? 0, a.n);
    return { ok: true };
  },
  /** time on a monster map eats supplies (server clock; a long pause counts as at most 2 minutes) */
  supplyTick(s: GameState, _a: object, c: Ctx) {
    const n = mem.map; if (!n || n === WILD || isDungeon(n) || !STAGES[n - 1]) return { ate: 0, hungry: false, food: s.res.food };
    const ms = Math.min(120_000, c.now - (mem.supAt || c.now)); mem.supAt = c.now;
    return { ...eatSupplies(s, n, ms, c.now), food: s.res.food };
  },
  /** the server owns every spawn: it hands out an id and decides golden monsters (3%, never bosses / animals / the Deepwild) */
  /** today's wandering bounty boss for this player (board + announcements) */
  bountyInfo: (s: GameState, _a: object, c: Ctx) => bountyOf(s, c.now),
  /** on entering the bounty's map the server registers the lord (once per slot, while it is not dead) */
  bountySpawn(s: GameState, a: { n: number }, c: Ctx) {
    const b = bountyOf(s, c.now); if (b.killed || b.n !== a.n || mem.map !== a.n) return no('none');
    for (const v of mem.spawns.values()) if (v.bounty === b.slot) return no('alive');
    const sid = mem.sid++; mem.spawns.set(sid, { key: b.mob.key, elite: false, boss: false, bounty: b.slot });
    return { sid, mob: b.mob, name: b.name, hp: BOUNTY_HP };
  },
  /** (test crowd) another player took this monster: the spawn is gone, nobody here is paid */
  botKill: (_s: GameState, a: { sid: number }) => { mem.spawns.delete(a.sid); return { ok: true }; },
  spawn(_s: GameState, a: { key: string; boss: boolean; animal?: boolean; sid?: number }, c: Ctx) {
    if (mem.spawns.size > 400) mem.spawns.delete(mem.spawns.keys().next().value!);
    // (online the game names the number it already uses; the server keeps its count past it)
    const elite = !a.boss && !a.animal && mem.map !== WILD && c.rnd() < 0.03, sid = a.sid && a.sid > 0 && !mem.spawns.has(a.sid) ? a.sid : mem.sid++;
    mem.sid = Math.max(mem.sid, sid + 1);
    mem.spawns.set(sid, { key: a.key, elite, boss: a.boss });
    return { sid, elite };
  },
  /** a monster / animal died — the server checks it can live on this map and that the hero could deal that much damage */
  /** (shared map) a monster the room's host spawned: known here too, so its kill can be paid */
  mirror(_s: GameState, a: { sid: number; key: string; boss: boolean; elite: boolean }) { mem.spawns.set(a.sid, { key: a.key, elite: !!a.elite, boss: !!a.boss }); mem.sid = Math.max(mem.sid, a.sid + 1); return { ok: true }; },   // (new spawns never reuse a mirrored number)
  kill(s: GameState, a: { sid: number; kind: MonsterKind; key: string; name: string; size: number; boss: boolean; share?: number }, c: Ctx) {
    const n = mem.map, base = MONSTERS[a.kind]; if (!n || !base) return no('map');
    const sp = mem.spawns.get(a.sid); if (!sp || sp.key !== a.key || sp.boss !== a.boss) return no('spawn');   // must be a live monster the server spawned
    if (!rateOk('kill', 25, c.now)) return no('rate');   // area skills can drop a whole pack at once
    if (n === WILD) { if (!base.animal) return no('kind'); }
    else if (isDungeon(n)) { const L = LANDS[n - DUNGEON]; if (base.animal || ![...L.mobs, L.boss].some(m => m.kind === a.kind && m.key === a.key && (m === L.boss) === a.boss)) return no('kind'); }
    else { const L = STAGES[n - 1].land; if (base.animal || ![...L.mobs, ...(STAGES[n - 1].boss ? [L.boss] : [])].some(m => m.kind === a.kind && m.key === a.key && (m === L.boss) === a.boss)) return no('kind'); }
    const st = stageOf(n, s.level), hp = scaleStats(base, st.level, a.boss).hp * (sp.elite ? 5 : sp.bounty !== undefined ? BOUNTY_HP : 1), dps = dpsOf(s);
    mem.dmg = Math.min(dps * 20 * 8, mem.dmg + (c.now - mem.dmgT) / 1000 * dps * 8); mem.dmgT = c.now;
    const part = hp * Math.max(0.03, Math.min(1, a.share ?? 1));   // shared map: only my part of the damage counts
    if (!DEV_TOOLS && mem.dmg < part) return no('dps');
    mem.dmg = Math.max(0, mem.dmg - part); mem.spawns.delete(a.sid);
    // loot falls on the ground (server keeps it): the first player to reach it picks it up
    const drops: { did: number; id: string; qty: number; rar: number; set?: string }[] = [];
    const give = (id: string, qty: number, gear?: Drop['gear']) => { const did = mem.did++; mem.drops.set(did, { id, qty, gear, until: c.now + 60000 }); drops.push({ did, id, qty, rar: gear?.rar ?? itemDef(id).rarity, set: gear?.set }); return true; };
    const bounty = sp.bounty !== undefined && bountyOf(s, c.now).slot === sp.bounty;
    const r = applyKill(s, n, { key: a.key, kind: a.kind, name: a.name, size: a.size }, a.boss || bounty, a.boss && !isDungeon(n), c.rnd, sp.elite, give);
    if (bounty) {
      const b = bountyOf(s, c.now); s.gold += b.gold; give('ancient_core', 1); markBounty(s, b.slot);
      const dragon = !hasMount(s, 'dragon') && c.rnd() < DRAGON_BOUNTY && grantMount(s, 'dragon');   // the limited dragon: very rare, never shown as a rate
      (r as { bounty?: { gold: number; name: string; dragon?: boolean } }).bounty = { gold: b.gold, name: b.name, dragon };
    }
    if (isDungeon(n) && mem.dungeon) mem.dungeon.kills++;
    if (base.animal) {   // meat and hides follow the daily hunting energy
      const hm = huntMult(s, c.now); energy(s, c.now).hunt++;
      const cut = r.food - Math.round(r.food * hm); s.res.food -= cut; r.food -= cut;
      if (hm < 1) for (let i = drops.length - 1; i >= 0; i--) if (c.rnd() > hm) { mem.drops.delete(drops[i].did); drops.splice(i, 1); }
    }
    const ps = pstats(s); if (base.animal) ps.animals++; else { ps.kills++; ps.kinds[a.kind] = (ps.kinds[a.kind] ?? 0) + 1; if (sp.elite) ps.golden++; }
    // rested in your own bed: extra EXP for a number of kills (docs/GUILD_WAR.md 5)
    let restExp = 0; const hm0 = homeOf(s);
    if (!base.animal && hm0.rest > 0 && r.exp > 0) { restExp = Math.round(r.exp * REST_EXP / 100); hm0.rest--; r.levels += gainExp(s, restExp); }
    goalProgress(s, base.animal ? 'animal' : 'kill', 1, c.now);
    return { ...r, drops, restExp };   // (VIP auto-sell removed — director 2026-11-12)
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
    const m = gatherMult(s, c.now); if (m === 0) return no('tired');   // daily energy used up
    const r = gatherReward(s, a.kind, WILD, vein, c.rnd, m);
    if (r.low) return { ...r, refused: 'level' };
    energy(s, c.now).gather += a.rare ? 3 : 1;
    { const ps = pstats(s); ps.ore += r.oreQty; if (r.gem) ps.gems++; }
    goalProgress(s, a.kind, r.amt ?? 0, c.now); if (r.oreQty) goalProgress(s, 'ore', r.oreQty, c.now);
    nd.hits++; const max = a.rare ? 6 : 4;
    if (nd.hits >= max) { nd.hits = 0; nd.until = c.now + (a.rare ? 240000 : 45000) - 1500; }
    mem.nodes.set(a.node, nd);
    return r;
  },
  /** Deepwild rooms: 100 players each; until online the counts are simulated */
  /** the Deepwild: the system puts the player in the fullest room with space (no picking). `bots` = test players */
  wildRooms(s: GameState, a: { bots?: number }, c: Ctx) {
    const hour = Math.floor(c.now / 600000);
    const counts = a.bots ? fillRooms(a.bots + 1, WILD_ROOM_CAP) : Array.from({ length: 6 }, (_, i) => Math.min(WILD_ROOM_CAP - 1, Math.round(((Math.sin(hour * 1.7 + i * 2.3) + 1) / 2) * 90 + (i === 0 ? 10 : 0))));
    const sv = s as unknown as { wildRoom?: number };
    const room = a.bots ? 1 : (sv.wildRoom && counts[sv.wildRoom - 1] < WILD_ROOM_CAP ? sv.wildRoom : pickRoom(counts, WILD_ROOM_CAP) + 1);
    if (!a.bots && room > counts.length) counts.push(0);
    if (!a.bots) counts[room - 1]++;
    sv.wildRoom = room;
    return { rooms: counts.map((count, i) => ({ id: i + 1, count })), room, cap: WILD_ROOM_CAP, players: counts[room - 1] };
  },
  /** monster map rooms (cap MAP_ROOM_CAP): the hero arrives first, test bots fill rooms after */
  mapRoom(_s: GameState, a: { n: number; bots?: number }) {
    const counts = fillRooms((a.bots ?? 0) + 1, MAP_ROOM_CAP);
    return { room: 1, rooms: counts.length, players: counts[0], cap: MAP_ROOM_CAP, total: (a.bots ?? 0) + 1 };
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
  /** VIP perk: buy a potion when out, by itself (the player's choice in the potion settings) */
  autoPotion(s: GameState, a: { id?: string }, c: Ctx) {
    const id = VIP_POTIONS.includes(a?.id ?? '') ? a.id! : 'hp_potion', price = itemDef(id).price;
    if (!vipActive(s, c.now) || s.gold < price || !addItem(s, id, 1)) return no('vip'); s.gold -= price; return { ok: true };
  },
  /** VIP perk: buy potions anywhere (no trip home) — shop price, up to 20 at a time */
  vipBuyPotion(s: GameState, a: { id: string; qty: number }, c: Ctx) {
    if (!vipActive(s, c.now)) return no('vip');
    if (!VIP_POTIONS.includes(a.id)) return no('item');
    const qty = Math.max(1, Math.min(20, Math.floor(a.qty) || 1)), cost = itemDef(a.id).price * qty;
    if (s.gold < cost) return no('gold');
    if (!addItem(s, a.id, qty)) return no('bag');
    s.gold -= cost; return { ok: true, qty, cost };
  },
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
  // ---------------- guild (docs/GUILD_WAR.md) ----------------
  /** entering the village: catch up the simulated members / incoming raids, then the guild data for the UI */
  guildSync(s: GameState, _a: object, c: Ctx) {
    const g = guildOf(s); if (!g) return no('guild');
    guildTick(s, c.now, c.rnd); goals(s, c.now); rivals(s, c.now);
    return { unread: g.unread.splice(0) };
  },
  guildCreate: (s: GameState, a: { name: string }, c: Ctx) => createGuild(s, a.name, c.now, c.rnd),
  guildJoin: (s: GameState, a: { id: string }, c: Ctx) => joinGuild(s, a.id, c.now, c.rnd),
  guildUpgrade: (s: GameState, a: { type: GuildBld }, c: Ctx) => upgradeVillage(s, a.type, c.now),
  guildCollect: (s: GameState, a: { type: GuildBld }, c: Ctx) => collectVillage(s, a.type, c.now),
  /** mounts: buy the horse with gold, choose what you ride (the dragon only comes from playing) */
  mountBuy: (s: GameState, a: { id: MountId }) => buyMount(s, a.id),
  mountSelect: (s: GameState, a: { id: MountId | null }) => selectMount(s, a.id),
  /** guild war (mixed): the server runs the whole war; heroes add hits / kills (systems/war.ts) */
  warStart(s: GameState, a: { id: string }, c: Ctx) { const r = startWar(s, a.id, c.now); if (!('refused' in r)) { mem.dmg = dpsOf(s) * 5; mem.dmgT = c.now; } return r; },
  warSync: (s: GameState, _a: object, c: Ctx) => ({ war: warTick(s, c.now) }),
  warHit(s: GameState, a: { id: string; dmg: number }, c: Ctx) {
    const dps = dpsOf(s), dmg = Math.max(0, Number(a.dmg) || 0);
    mem.dmg = Math.min(dps * 20 * 8, mem.dmg + (c.now - mem.dmgT) / 1000 * dps * 8); mem.dmgT = c.now;   // a hero can only hit so hard per second
    if (!DEV_TOOLS && mem.dmg < dmg) return no('dps');
    mem.dmg = Math.max(0, mem.dmg - dmg);
    return warHit(s, String(a.id), dmg, c.now);
  },
  warKill(s: GameState, _a: object, c: Ctx) { if (!rateOk('warKill', 6, c.now)) return no('rate'); return warKill(s, c.now); },
  warEnd: (s: GameState, _a: object, c: Ctx) => ({ war: warEnd(s, c.now) }),
  warDone: (s: GameState, _a: object) => ({ over: warDone(s) }),
  /** repair a burnt guild building from the treasury (any member) / your own house from your own stock */
  bldRepair: (s: GameState, a: { t: GuildBld }, c: Ctx) => GUILD_BLD[a.t] ? bldRepair(s, a.t, c.now) : no('building'),
  houseRepair: (s: GameState, _a: object) => houseRepair(s),
  guildFlag: (s: GameState, a: { px: string }, c: Ctx) => setFlag(s, a.px, c.now),
  houseBuild: (s: GameState, _a: object, c: Ctx) => houseBuild(s, c.now),
  seasonClaim: (s: GameState, _a: object, c: Ctx) => seasonClaim(s, c.now),
  hireGuard: (s: GameState, a: { type: GuardType }, c: Ctx) => hireGuard(s, a.type, c.now),
  dismissGuard: (s: GameState, a: { type: GuardType }) => dismissGuard(s, a.type),
  donate: (s: GameState, a: { gold?: number; wood?: number; stone?: number; food?: number; item?: string; qty?: number }, c: Ctx) => (rateOk('donate', 4, c.now) ? donate(s, a, c.now) : no('rate')),
  guildRole: (s: GameState, a: { id: string; role: 'leader' | 'deputy' | 'member' }, c: Ctx) => setRole(s, a.id, a.role, c.now),
  guildInvite: (s: GameState, _a: object, c: Ctx) => simInvite(s, c.now, c.rnd),
  guildKick: (s: GameState, a: { id: string }, c: Ctx) => kick(s, a.id, c.now),
  guildShop: (s: GameState, a: { id: string }, c: Ctx) => guildShopBuy(s, a.id, c.now),
  defBuild: (s: GameState, a: { slot: number; type: DefenseId }, c: Ctx) => defBuild(s, a.slot, a.type, c.now),
  defUpgrade: (s: GameState, a: { slot: number }, c: Ctx) => defUpgrade(s, a.slot, c.now),
  defRepair: (s: GameState, a: { slot: number }) => defRepair(s, a.slot),
  defRemove: (s: GameState, a: { slot: number }) => defRemove(s, a.slot),
  /** your bed: HP / MP full now, rest builds up while you are away */
  sleep(s: GameState, _a: object, c: Ctx) { const r = sleep(s, c.now); if (!('refused' in r)) { const d = derive(s); s.hp = d.maxHp; s.mp = d.maxMp; } return r; },
  wake: (s: GameState, _a: object, c: Ctx) => wake(s, c.now),
  trophyPut: (s: GameState, a: { uid: number }) => trophyPut(s, a.uid),
  trophyTake: (s: GameState, a: { i: number }) => trophyTake(s, a.i),
  stashPut: (s: GameState, a: { uid: number }) => stashPut(s, a.uid),
  stashTake: (s: GameState, a: { i: number }) => stashTake(s, a.i),
  /** start a raid on one of today's matched villages: the server keeps the village and its HP; the client gets the layout */
  raidStart(s: GameState, a: { id: string }, c: Ctx) {
    const r = canRaid(s, a.id, c.now); if ('refused' in r) return r;
    const structs = rivalStructs(r.rival);
    mem.raid = { rival: r.rival, start: c.now, hp: structs.reduce((x, q) => x + q.hp, 0) };
    mem.map = -1; mem.dmg = 0; mem.dmgT = c.now;
    return { rival: r.rival, structs, secs: RAID_SECS };
  },
  /** raid over: the server checks the time and that the hero could deal that much damage, then pays out */
  raidEnd(s: GameState, a: { destroyed: string[] }, c: Ctx) {
    const R = mem.raid; if (!R) return no('raid');
    mem.raid = null; mem.map = 0;
    const secs = (c.now - R.start) / 1000; if (secs > RAID_SECS + 20) return no('time');
    const structs = rivalStructs(R.rival), ids = [...new Set(a.destroyed ?? [])].filter(id => structs.some(q => q.id === id));
    const hp = structs.filter(q => ids.includes(q.id)).reduce((x, q) => x + q.hp, 0);
    if (!DEV_TOOLS && hp > dpsOf(s) * secs * 8 + 500) return no('dps');
    return raidResult(s, R.rival, ids, c.now);
  },
  upSkill: (s: GameState, a: { id: string }) => upSkill(s, a.id),
  /** class change; from villager the new line gets a free starter weapon (equipped) */
  advanceClass(s: GameState, a: { cls?: ClassId }) {
    const wasVillager = (s.tier ?? 0) === 0;
    if (!advanceClass(s, a.cls)) return { ok: false, weapon: null as string | null };
    let weapon: string | null = null;
    if (wasVillager) { const w = ({ sword: 'wood_sword', archer: 'short_bow', mage: 'apprentice_wand', cleric: 'iron_mace' } as Record<string, string>)[s.cls]; if (w && addItem(s, w, 1)) { equip(s, s.inventory[s.inventory.length - 1].uid); weapon = w; } }
    return { ok: true, weapon };
  },
  /** list an item on the market: in the village — VIP anywhere (director) */
  marketList: (s: GameState, a: { uid: number; qty: number; price: number }, c: Ctx) => (mem.map !== 0 && !vipActive(s, c.now) ? 'away' as const : listItem(s, a.uid, a.qty, a.price, c.now)),
  marketCancel: (s: GameState, a: { id: string }) => cancelListing(s, a.id),
  /** the players' market lives on the game server (server/worker.ts Player): offline there is nothing to browse or buy */
  marketBrowse: (_s: GameState, _a: { type: number; rar: number; page: number }) => no('offline') as Refused | { list: import('../systems/market').Listing[]; total: number },
  marketBuy: (_s: GameState, _a: { id: string }) => no('offline') as Refused | { ok: true; id: string; qty: number; price: number },
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
      const rar = Math.max(2, Math.min(5, rollRarity(c.rnd, st.mf, 2))), b = pickBase(c.rnd, rar, s.cls);
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
  dev(s: GameState, a: { op: 'kit' | 'level' | 'vip' | 'diamonds' | 'guildFill' | 'guildTime' | 'guildAttack' | 'guildDefend' | 'mountDragon'; n?: number; name?: string; wreck?: Wreck }, c: Ctx): Refused | { got: string[] } {
    if (!DEV_TOOLS) return no('dev');
    if (a.op === 'mountDragon') { grantMount(s, 'dragon'); return { got: ['🐉 ได้มังกรเพลิง (ทดสอบ)'] }; }
    if (a.op === 'guildFill' || a.op === 'guildTime' || a.op === 'guildAttack' || a.op === 'guildDefend') return { got: devGuild(s, a.op, c.now, c.rnd, a.n, a.name, a.op === 'guildDefend' ? cleanWreck(a.wreck) : undefined) };
    if (a.op === 'kit') return { got: giveTestKit(s, 5, c.rnd) };
    if (a.op === 'level') testLevelUp(s, a.n ?? 10);
    else if (a.op === 'vip') grantVip(s, a.n ?? 3, c.now);
    else grantDiamonds(s, a.n ?? 1000);
    return { got: [] };
  },
};
// every handler ends with the warehouse cap (wood / stone / food never pile up past it)
for (const k of Object.keys(handlers) as (keyof typeof handlers)[]) {
  const fn = handlers[k] as unknown as (s: GameState, a: unknown, c: Ctx) => unknown;
  (handlers as Record<string, unknown>)[k] = (s: GameState, a: unknown, c: Ctx) => { const r = fn(s, a, c); clampRes(s); return r; };
}
export type Handlers = typeof handlers;
