// Guild village & guild war — pure rules (server side; see docs/GUILD_WAR.md).
// Every player starts in the starter (NPC) village. At GUILD_UNLOCK_LV they found a guild or join one and move to the
// guild village: no NPC villagers, only the essential buildings (owned by the guild, starting at Lv1), a house plot for
// each member (built with personal resources), defenses and hired guards paid by the treasury the members fill.
// Until the game is online the other members, the guilds you can join and the rival villages are SIMULATED here
// (marked `sim`): on the real server they are other players' data and the sim part is removed.
import type { GameState, InvItem } from '../core/state';
import { invSize } from '../core/state';
import { BUILDINGS, levelCost, type Cost } from '../data/buildings';
import { isFlag } from '../data/flag';
import {
  GUILD_UNLOCK_LV, GUILD_MAX, DEPUTY_MAX, HOUSE_SLOTS, treasuryCap, vaultShare, RAID_TAKE, RAID_GAIN, RAID_STORED, SHIELD_H, RAIDS_PER_DAY,
  REST_PER_HOUR, restCap, stashSlots, trophySlots, defSlots, CONTRIB, itemContrib, DEFENSES, DEF_ORDER, defStat, GUILD_SHOP, GOAL_POOL,
  SIM_NAMES, RIVAL_NAMES, GUILD_COST_MULT, GUILD_BLD, GUILD_BLD_ORDER, gbRate, gbStoreCap, GUARDS, guardCap, GUARD_FOOD_H,
  type DefenseId, type GoalKind, type GuildBld, type GuardType,
} from '../data/guild';
import { itemDef } from '../data/items';
import { addItem, isEquipped } from './inventory';
import { pay } from './settlement';
import { dayKey } from './daily';

export type Role = 'leader' | 'deputy' | 'member';
export interface GMember { id: string; name: string; role: Role; pts: number; house: number; houseLv: number; houseDone?: number; houseDmg?: number; cls: string; lv: number; sim?: boolean; joined: number }
export interface GDefense { slot: number; type: DefenseId; level: number; hp: number; done?: number }
export interface GBuilding { type: GuildBld; level: number; stored: number; last: number; done?: number; /** fire damage 0..1 after a raid (1 = burnt to a ruin) */ dmg?: number }
export interface Treasury { gold: number; wood: number; stone: number; food: number; items: Record<string, number> }
export interface GLog { t: number; kind: 'donate' | 'upgrade' | 'defense' | 'raid' | 'defend' | 'goal' | 'join' | 'role' | 'guard'; text: string }
export interface Goal { kind: GoalKind; need: number; have: number; mine: number; done: boolean }
export interface RivalStruct { id: string; kind: 'hall' | 'building' | 'defense'; type: string; level: number; hp: number; stored?: number; res?: string; slot?: number }
export interface Rival { id: string; name: string; hall: number; wh: number; barracks: number; guards: number; treasury: { gold: number; wood: number; stone: number; food: number }; buildings: { type: GuildBld; level: number; stored: number }[]; defenses: { slot: number; type: DefenseId; level: number }[]; houses: number[] }
export interface GuildState {
  id: string; name: string; me: string;
  treasury: Treasury; members: GMember[]; buildings: GBuilding[]; defenses: GDefense[]; guards: Record<GuardType, number>;
  shieldUntil: number; raids: { day: string; used: number }; log: GLog[];
  goals: { day: string; list: Goal[] }; shop: { day: string; bought: Record<string, number> };
  simAt: number; incomingAt: number; rivals: { day: string; list: Rival[] }; unread: string[]; hungry?: boolean;
  /** the guild flag: 256 hex pixels (data/flag.ts); missing = one the game makes from the name */
  flag?: string;
  /** weekly guild war season: points this week, last week's result, the week whose reward was claimed */
  season?: { week: number; score: number; prev?: { week: number; score: number }; claimed?: number };
}
export interface HomeState { rest: number; sleptAt: number; stash: InvItem[]; trophies: InvItem[] }
export interface GuildOffer { id: string; name: string; members: number; hall: number; leader: string }
type GS = GameState & { guild?: GuildState; home?: HomeState };
type R = { refused: string };
const no = (why: string): R => ({ refused: why });
const RES = ['gold', 'wood', 'stone', 'food'] as const;
const ICON: Record<string, string> = { gold: '💰', wood: '🪵', stone: '🪨', food: '🍖' };
const buildTime = (level: number) => [0, 20, 60, 180, 420, 900][level] * 1000;

/** seeded random (the same lists all day long) */
function srnd(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hashStr = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };

export const guildOf = (s: GameState) => (s as GS).guild;
export const guildUnlocked = (s: GameState) => s.level >= GUILD_UNLOCK_LV;
export function homeOf(s: GameState): HomeState { const g = s as GS; return (g.home ??= { rest: 0, sleptAt: 0, stash: [], trophies: [] }); }
export const meOf = (s: GameState) => { const g = guildOf(s); return g?.members.find(m => m.id === g.me); };
export const isOfficer = (s: GameState) => { const r = meOf(s)?.role; return r === 'leader' || r === 'deputy'; };
export const gb = (s: GameState, t: GuildBld) => guildOf(s)?.buildings.find(b => b.type === t);
/** a guild building's working level (one less while it is being upgraded) */
export const gbLv = (s: GameState, t: GuildBld, now = Date.now()) => { const b = gb(s, t); return b ? (b.done && now < b.done ? b.level - 1 : b.level) : 0; };
export const hallLv = (s: GameState, now = Date.now()) => Math.max(1, gbLv(s, 'hall', now));
export const whLv = (s: GameState, now = Date.now()) => gbLv(s, 'warehouse', now);
export const barracksLv = (s: GameState, now = Date.now()) => gbLv(s, 'barracks', now);
export const tCap = (s: GameState) => treasuryCap(whLv(s));
/** my house in the guild village (0 = empty lot) */
export const guildHouseLv = (s: GameState, now = Date.now()) => { const m = meOf(s); return m ? (m.houseDone && now < m.houseDone ? m.houseLv - 1 : m.houseLv) : 0; };
/** the house the bed / chest / trophy shelf belong to: the guild house, or the old one in the starter village */
export const houseLv = (s: GameState, now = Date.now()) => { const b = s.buildings.find(q => q.type === 'home'); const old = b ? (b.done && now < b.done ? b.level - 1 : b.level) : 0; return Math.max(old, guildHouseLv(s, now)); };
const log = (g: GuildState, kind: GLog['kind'], text: string, now: number) => { g.log.unshift({ t: now, kind, text }); if (g.log.length > 40) g.log.length = 40; };

// ---------------------------------------------------------------- founding / joining
function newGuild(id: string, name: string, now: number): GuildState {
  return {
    id, name, me: 'me', treasury: { gold: 0, wood: 0, stone: 0, food: 0, items: {} }, members: [],
    buildings: GUILD_BLD_ORDER.map(t => ({ type: t, level: 1, stored: 0, last: now })), defenses: [], guards: { spear: 0, archer: 0 },
    shieldUntil: now + 3 * 86400000,   // a new village is protected for its first 3 days
    raids: { day: dayKey(now), used: 0 }, log: [], goals: { day: '', list: [] }, shop: { day: '', bought: {} },
    simAt: now, incomingAt: now, rivals: { day: '', list: [] }, unread: [],
  };
}
const meMember = (s: GameState, role: Role, house: number, now: number): GMember => ({ id: 'me', name: s.name || 'ผู้เล่น', role, pts: 0, house, houseLv: 0, cls: s.cls, lv: s.level, joined: now });
function simMember(i: number, lv: number, rnd: () => number, now: number, house: number): GMember {
  const cls = ['sword', 'archer', 'mage', 'cleric'][Math.floor(rnd() * 4)];
  return { id: 'sim' + i + '_' + Math.floor(rnd() * 1e6).toString(36), name: SIM_NAMES[Math.floor(rnd() * SIM_NAMES.length)], role: 'member', pts: Math.floor(rnd() * 400), house, houseLv: Math.floor(rnd() * 4), cls, lv: Math.max(GUILD_UNLOCK_LV, Math.round(lv + (rnd() - 0.5) * 12)), sim: true, joined: now };
}
/** found your own guild: you are the leader, the village is new (Lv1 buildings, empty plots, a small grant in the treasury) */
export function createGuild(s: GameState, name: string, now = Date.now(), rnd: () => number = Math.random): R | { ok: true } {
  const gs = s as GS; if (gs.guild) return no('member');
  if (!guildUnlocked(s)) return no('level');
  const nm = (name || '').trim().slice(0, 24); if (nm.length < 2) return no('name');
  const g = newGuild('g' + Math.floor(rnd() * 1e9).toString(36), nm, now);
  g.members.push(meMember(s, 'leader', 0, now));
  g.treasury = { gold: 3000, wood: 2000, stone: 1500, food: 1200, items: {} };   // founding grant
  log(g, 'join', `${s.name || 'ผู้เล่น'} ก่อตั้ง${nm}`, now);
  gs.guild = g; return { ok: true };
}
/** (simulated until online) guilds looking for members, matched to the player's level */
export function guildOffers(s: GameState, now = Date.now()): GuildOffer[] {
  const r = srnd(hashStr('offers' + dayKey(now) + Math.floor(s.level / 10)));
  return [0, 1, 2].map(i => ({ id: `o${dayKey(now)}:${i}`, name: RIVAL_NAMES[Math.floor(r() * RIVAL_NAMES.length)], members: 3 + Math.floor(r() * 6), hall: 1 + Math.floor(r() * 3), leader: SIM_NAMES[Math.floor(r() * SIM_NAMES.length)] }));
}
export function joinGuild(s: GameState, id: string, now = Date.now(), rnd: () => number = Math.random): R | { ok: true } {
  void rnd;
  const gs = s as GS; if (gs.guild) return no('member');
  if (!guildUnlocked(s)) return no('level');
  const o = guildOffers(s, now).find(q => q.id === id); if (!o) return no('target');
  const g = newGuild('g' + hashStr(o.id + o.name).toString(36), o.name, now - 86400000 * 5);
  const r = srnd(hashStr(o.id));
  for (let i = 0; i < o.members; i++) g.members.push(simMember(i, s.level, r, now, i));
  g.members[0].role = 'leader'; g.members[0].name = o.leader; if (o.members > 3) g.members[1].role = 'deputy';
  g.members.push(meMember(s, 'member', o.members, now));
  for (const b of g.buildings) { b.level = Math.max(1, o.hall - Math.floor(r() * 2)); b.last = now; }
  g.buildings.find(b => b.type === 'hall')!.level = o.hall;
  g.treasury = { gold: 4000 * o.hall, wood: 3000 * o.hall, stone: 2500 * o.hall, food: 2000 * o.hall, items: {} };
  const types = DEF_ORDER.filter(t => DEFENSES[t].hall <= o.hall);
  for (let i = 0; i < Math.round(defSlots(o.hall) * 0.6); i++) { const t = types[Math.floor(r() * types.length)]; g.defenses.push({ slot: i, type: t, level: 1, hp: defStat(DEFENSES[t], 1).hp }); }
  g.guards = { spear: Math.min(guardCap(o.hall), 1 + Math.floor(r() * 2)), archer: Math.floor(r() * 2) };
  g.shieldUntil = now + 86400000; g.simAt = now; g.incomingAt = now;
  log(g, 'join', `${s.name || 'ผู้เล่น'} เข้าร่วมกิลด์`, now);
  gs.guild = g; return { ok: true };
}

// ---------------------------------------------------------------- treasury
/** donate personal resources / materials to the village treasury → guild points */
export function donate(s: GameState, a: { gold?: number; wood?: number; stone?: number; food?: number; item?: string; qty?: number }, now = Date.now()): R | { pts: number } {
  const g = guildOf(s); if (!g) return no('guild');
  const cap = tCap(s); let pts = 0; const parts: string[] = [];
  for (const k of RES) {
    const n = Math.floor(a[k] ?? 0); if (!n) continue;
    if (n < 0 || !Number.isFinite(n)) return no('amount');
    const have = k === 'gold' ? s.gold : s.res[k]; if (n > have) return no('amount');
    if (g.treasury[k] + n > cap) return no('cap');
  }
  const q = Math.floor(a.qty ?? 1);
  if (a.item) {
    const d = itemDef(a.item); if (q <= 0 || !d || d.type !== 'material') return no('item');
    const have = s.inventory.filter(i => i.id === a.item && !isEquipped(s, i.uid)).reduce((x, i) => x + i.qty, 0); if (q > have) return no('amount');
  }
  for (const k of RES) {
    const n = Math.floor(a[k] ?? 0); if (!n) continue;
    if (k === 'gold') s.gold -= n; else s.res[k] -= n;
    g.treasury[k] += n; pts += n * CONTRIB[k]; parts.push(`${ICON[k]}${n}`);
  }
  if (a.item) {
    let left = q; const d = itemDef(a.item);
    for (const it of [...s.inventory]) { if (left <= 0) break; if (it.id !== a.item || isEquipped(s, it.uid)) continue; const take = Math.min(left, it.qty); it.qty -= take; left -= take; if (it.qty <= 0) s.inventory.splice(s.inventory.indexOf(it), 1); }
    g.treasury.items[a.item] = (g.treasury.items[a.item] ?? 0) + q; pts += itemContrib(d.price) * q; parts.push(`${d.name} x${q}`);
  }
  if (!parts.length) return no('amount');
  pts = Math.round(pts); const me = meOf(s)!; me.pts += pts;
  log(g, 'donate', `${me.name} บริจาค ${parts.join(' ')}`, now);
  return { pts };
}
function tCanPay(g: GuildState, c: Cost) {
  for (const k of RES) if ((c[k] ?? 0) > g.treasury[k]) return false;
  for (const [id, n] of Object.entries(c.items ?? {})) if ((g.treasury.items[id] ?? 0) < n) return false;
  return true;
}
function tPay(g: GuildState, c: Cost) {
  if (!tCanPay(g, c)) return false;
  for (const k of RES) g.treasury[k] -= c[k] ?? 0;
  for (const [id, n] of Object.entries(c.items ?? {})) g.treasury.items[id] -= n;
  return true;
}
const scaled = (c: Cost, m: number): Cost => ({ gold: Math.round((c.gold ?? 0) * m), wood: Math.round((c.wood ?? 0) * m), stone: Math.round((c.stone ?? 0) * m), food: Math.round((c.food ?? 0) * m), items: c.items });
/** the treasury pays this for the next level of a guild building */
export const villageCost = (t: GuildBld, toLevel: number) => { const cs = GUILD_BLD[t].costs; return scaled(cs[toLevel - 1] ?? cs[cs.length - 1], t === 'hall' ? 1 : GUILD_COST_MULT); };

/** leader / deputy upgrades a guild building with the treasury (buildings can't pass the guild hall's level) */
export function upgradeVillage(s: GameState, t: GuildBld, now = Date.now()): R | { level: number } {
  const g = guildOf(s); if (!g) return no('guild');
  if (!isOfficer(s)) return no('role');
  const b = g.buildings.find(q => q.type === t); if (!b) return no('building');
  if (b.done && now < b.done) return no('busy');
  if (isRuin(b)) return no('ruin');
  if (b.level >= 5) return no('max');
  if (t !== 'hall' && b.level + 1 > hallLv(s, now)) return no('hall');
  produce(s, now);
  if (!tPay(g, villageCost(t, b.level + 1))) return no('treasury');
  b.level++; b.done = now + buildTime(b.level);
  log(g, 'upgrade', `${meOf(s)!.name} อัป${GUILD_BLD[t].name} → Lv${b.level}`, now);
  return { level: b.level };
}
/** production buildings make resources for the treasury (also while nobody plays) */
export function produce(s: GameState, now = Date.now()) {
  const g = guildOf(s); if (!g) return;
  for (const b of g.buildings) {
    const d = GUILD_BLD[b.type];
    if (!d.produces || (b.done && now < b.done) || isRuin(b)) { b.last = now; continue; }   // a ruin makes nothing until repaired
    const mins = Math.max(0, (now - b.last) / 60000);
    b.stored = Math.min(gbStoreCap(d, b.level), b.stored + gbRate(d, b.level) * mins); b.last = now;
  }
}
/** walk up to a production building: what it made goes into the treasury */
export function collectVillage(s: GameState, t: GuildBld, now = Date.now()): R | { res: string; amount: number } {
  const g = guildOf(s); if (!g) return no('guild');
  const b = g.buildings.find(q => q.type === t); const d = GUILD_BLD[t]; if (!b || !d.produces) return no('building');
  produce(s, now);
  const room = tCap(s) - g.treasury[d.produces];
  const amount = Math.min(Math.floor(b.stored), Math.max(0, room)); if (amount < 1) return no(room <= 0 ? 'cap' : 'empty');
  b.stored -= amount; g.treasury[d.produces] += amount;
  return { res: d.produces, amount };
}

// ---------------------------------------------------------------- members
export function setRole(s: GameState, id: string, role: Role, now = Date.now()): R | { ok: true } {
  const g = guildOf(s); if (!g) return no('guild');
  if (meOf(s)?.role !== 'leader') return no('role');
  const m = g.members.find(q => q.id === id); if (!m || m.id === g.me) return no('member');
  if (role === 'deputy' && g.members.filter(q => q.role === 'deputy').length >= DEPUTY_MAX) return no('full');
  if (role === 'leader') meOf(s)!.role = 'deputy';
  m.role = role; log(g, 'role', `${m.name} เป็น${role === 'leader' ? 'หัวหน้า' : role === 'deputy' ? 'รองหัวหน้า' : 'สมาชิก'}`, now);
  return { ok: true };
}
/** (simulation only, until online) another player joins */
export function simInvite(s: GameState, now = Date.now(), rnd: () => number = Math.random): R | { name: string } {
  const g = guildOf(s); if (!g) return no('guild');
  if (!isOfficer(s)) return no('role');
  if (g.members.length >= GUILD_MAX) return no('full');
  const used = new Set(g.members.map(m => m.house)); const house = Array.from({ length: HOUSE_SLOTS }, (_, i) => i).find(i => !used.has(i));
  if (house === undefined) return no('full');
  const m = simMember(g.members.length, s.level, rnd, now, house); m.houseLv = 0; m.pts = 0;
  g.members.push(m); log(g, 'join', `${m.name} เข้ากิลด์`, now);
  return { name: m.name };
}
export function kick(s: GameState, id: string, now = Date.now()): R | { ok: true } {
  const g = guildOf(s); if (!g) return no('guild');
  if (!isOfficer(s)) return no('role');
  const m = g.members.find(q => q.id === id); if (!m || m.id === g.me || m.role === 'leader') return no('member');
  g.members.splice(g.members.indexOf(m), 1); log(g, 'join', `${m.name} ออกจากกิลด์`, now);
  return { ok: true };
}

// ---------------------------------------------------------------- my house in the guild village (personal resources)
export const houseCost = (toLevel: number) => levelCost(BUILDINGS.home, toLevel);
export function houseBuild(s: GameState, now = Date.now()): R | { level: number } {
  const g = guildOf(s); if (!g) return no('guild');
  const me = meOf(s)!; if (me.houseDone && now < me.houseDone) return no('busy');
  if (me.houseLv >= BUILDINGS.home.maxLevel) return no('max');
  if ((me.houseDmg ?? 0) >= 1) return no('ruin');
  if (!pay(s, houseCost(me.houseLv + 1))) return no('cost');
  me.houseLv++; me.houseDone = now + buildTime(me.houseLv);
  return { level: me.houseLv };
}

// ---------------------------------------------------------------- the guild flag
/** leader / deputy set the flag (from a template, a random roll or their own drawing — all the same pixels) */
export function setFlag(s: GameState, px: string, now = Date.now()): R | { ok: true } {
  const g = guildOf(s); if (!g) return no('guild');
  if (!isOfficer(s)) return no('role');
  if (!isFlag(px)) return no('flag');
  if (new Set(px).size < 2) return no('blank');   // a flag needs at least two colours
  g.flag = px; log(g, 'role', `🚩 ${meOf(s)!.name} เปลี่ยนธงกิลด์`, now);
  return { ok: true };
}

// ---------------------------------------------------------------- fire damage & repairs (docs/GUILD_WAR.md 13.3)
/** a guild building's toughness in a fight */
export const bldHp = (t: GuildBld, lv: number) => t === 'hall' ? 2500 + 1500 * lv : 700 + 500 * lv;
export const isRuin = (b: { dmg?: number }) => (b.dmg ?? 0) >= 1;
/** repairing a guild building: wood + stone from the guild treasury for the burnt part (the forge makes it cheaper) */
export function bldRepairCost(s: GameState, b: GBuilding): Cost {
  const miss = (b.dmg ?? 0) * bldHp(b.type, b.level), m = 0.3 * (1 - 0.1 * (Math.max(1, gbLv(s, 'forge')) - 1));
  return { wood: Math.ceil(miss * m), stone: Math.ceil(miss * m * 0.8) };
}
/** any member may repair: the treasury is what everyone gathered together */
export function bldRepair(s: GameState, t: GuildBld, now = Date.now()): R | { ok: true } {
  const g = guildOf(s); if (!g) return no('guild');
  const b = g.buildings.find(q => q.type === t); if (!b || !(b.dmg ?? 0)) return no('full');
  if (!tPay(g, bldRepairCost(s, b))) return no('treasury');
  b.dmg = 0; b.last = now;
  log(g, 'upgrade', `🔧 ${meOf(s)!.name} ซ่อม${GUILD_BLD[t].name}`, now);
  return { ok: true };
}
/** your own house: you repair it yourself, with your own wood and stone */
export function houseRepairCost(s: GameState): Cost {
  const me = meOf(s); if (!me) return {};
  const base = 150 + 120 * me.houseLv, d = me.houseDmg ?? 0;
  return { wood: Math.ceil(d * base), stone: Math.ceil(d * base * 0.7) };
}
export function houseRepair(s: GameState): R | { ok: true } {
  const me = meOf(s); if (!me) return no('guild');
  if (!(me.houseDmg ?? 0)) return no('full');
  if (!pay(s, houseRepairCost(s))) return no('cost');
  me.houseDmg = 0; return { ok: true };
}
/** what burned in a raid on our village: share of each building's toughness lost (0..1), and our own house */
export interface Wreck { b?: Partial<Record<GuildBld, number>>; house?: number }
function applyWreck(s: GameState, w: Wreck) {
  const g = guildOf(s)!, me = meOf(s)!;
  for (const b of g.buildings) { const x = w.b?.[b.type]; if (x && x > 0) b.dmg = Math.min(1, Math.round(((b.dmg ?? 0) + x) * 100) / 100); }
  if (w.house && me.houseLv > 0) me.houseDmg = Math.min(1, Math.round(((me.houseDmg ?? 0) + w.house) * 100) / 100);
}
/** a raid nobody watched (offline): fire where the enemy got through — more stars, more burning */
function simWreck(stars: number, rnd: () => number): Wreck {
  const w: Wreck = { b: {} };
  if (!stars) return w;
  for (const t of GUILD_BLD_ORDER) if (t !== 'hall' && rnd() < 0.2 * stars) w.b![t] = stars >= 3 && rnd() < 0.4 ? 1 : 0.2 + rnd() * 0.3 * stars;
  if (stars >= 3) w.b!.hall = 0.5;
  if (rnd() < 0.15 * stars) w.house = 0.3 + rnd() * 0.4;
  return w;
}

// ---------------------------------------------------------------- defenses & hired guards
export function defBuild(s: GameState, slot: number, type: DefenseId, now = Date.now()): R | { ok: true } {
  const g = guildOf(s); if (!g) return no('guild');
  if (!isOfficer(s)) return no('role');
  const d = DEFENSES[type]; if (!d) return no('type');
  if (slot < 0 || slot >= defSlots(hallLv(s, now))) return no('slot');
  if (g.defenses.some(q => q.slot === slot)) return no('taken');
  if (hallLv(s, now) < d.hall) return no('hall');
  if (!tPay(g, d.costs[0])) return no('treasury');
  g.defenses.push({ slot, type, level: 1, hp: defStat(d, 1).hp, done: now + buildTime(1) });
  log(g, 'defense', `${meOf(s)!.name} สร้าง${d.name}`, now);
  return { ok: true };
}
export function defUpgrade(s: GameState, slot: number, now = Date.now()): R | { level: number } {
  const g = guildOf(s); if (!g) return no('guild');
  if (!isOfficer(s)) return no('role');
  const q = g.defenses.find(x => x.slot === slot); if (!q) return no('slot');
  const d = DEFENSES[q.type]; if (q.level >= 5) return no('max');
  if (q.level + 1 > hallLv(s, now)) return no('hall');
  if (q.done && now < q.done) return no('busy');
  if (!tPay(g, d.costs[q.level])) return no('treasury');
  q.level++; q.hp = defStat(d, q.level).hp; q.done = now + buildTime(q.level);
  log(g, 'defense', `${meOf(s)!.name} อัป${d.name} → Lv${q.level}`, now);
  return { level: q.level };
}
/** repair after a raid: wood + stone for the missing HP (the guild forge makes it cheaper) */
export const repairCost = (q: GDefense, forgeLv = 1): Cost => { const max = defStat(DEFENSES[q.type], q.level).hp, miss = Math.max(0, max - q.hp), m = 0.3 * (1 - 0.1 * (forgeLv - 1)); return { wood: Math.ceil(miss * m), stone: Math.ceil(miss * m) }; };
export function defRepair(s: GameState, slot: number): R | { ok: true } {
  const g = guildOf(s); if (!g) return no('guild');
  const q = g.defenses.find(x => x.slot === slot); if (!q) return no('slot');
  const c = repairCost(q, Math.max(1, gbLv(s, 'forge'))); if (!c.wood) return no('full');
  if (!tPay(g, c)) return no('treasury');
  q.hp = defStat(DEFENSES[q.type], q.level).hp;
  return { ok: true };
}
export function defRemove(s: GameState, slot: number): R | { ok: true } {
  const g = guildOf(s); if (!g) return no('guild');
  if (!isOfficer(s)) return no('role');
  const i = g.defenses.findIndex(x => x.slot === slot); if (i < 0) return no('slot');
  g.defenses.splice(i, 1); return { ok: true };
}
export const guardsTotal = (g: GuildState) => g.guards.spear + g.guards.archer;
/** hire an NPC guard (wage + supplies from the treasury); the barracks level limits how many */
export function hireGuard(s: GameState, type: GuardType, now = Date.now()): R | { n: number } {
  const g = guildOf(s); if (!g) return no('guild');
  if (!isOfficer(s)) return no('role');
  if (!GUARDS[type]) return no('type');
  if (guardsTotal(g) >= guardCap(barracksLv(s, now))) return no('full');
  if (!tPay(g, GUARDS[type].hire)) return no('treasury');
  g.guards[type]++; log(g, 'guard', `${meOf(s)!.name} จ้าง${GUARDS[type].name}`, now);
  return { n: g.guards[type] };
}
export function dismissGuard(s: GameState, type: GuardType): R | { n: number } {
  const g = guildOf(s); if (!g) return no('guild');
  if (!isOfficer(s)) return no('role');
  if (!g.guards[type]) return no('none');
  g.guards[type]--; return { n: g.guards[type] };
}
/** food the guards eat per hour (the guild kitchen saves some) */
export const guardFoodH = (s: GameState) => { const g = guildOf(s); return g ? Math.ceil(guardsTotal(g) * GUARD_FOOD_H * (1 - 0.1 * (Math.max(1, gbLv(s, 'kitchen')) - 1))) : 0; };
/** guards eat from the treasury every hour; with an empty larder they go hungry (half strength) */
export function feedGuards(s: GameState, hours: number) {
  const g = guildOf(s); if (!g || hours <= 0) return;
  const need = Math.ceil(guardFoodH(s) * hours);
  const eat = Math.min(need, g.treasury.food); g.treasury.food -= eat; g.hungry = eat < need;
}

// ---------------------------------------------------------------- the player's house (bed / chest / trophies)
export function sleep(s: GameState, now = Date.now()): R | { ok: true } {
  if (houseLv(s, now) < 1) return no('house');
  homeOf(s).sleptAt = now;
  return { ok: true };
}
export function wake(s: GameState, now = Date.now()): { rest: number; gained: number } {
  const h = homeOf(s); if (!h.sleptAt) return { rest: h.rest, gained: 0 };
  const gained = Math.floor((now - h.sleptAt) / 3600000 * REST_PER_HOUR);
  h.rest = Math.min(restCap(houseLv(s, now)), h.rest + gained); h.sleptAt = 0;
  return { rest: h.rest, gained };
}
export function trophyPut(s: GameState, uid: number): R | { ok: true } {
  const h = homeOf(s), it = s.inventory.find(i => i.uid === uid); if (!it) return no('item');
  if (isEquipped(s, uid)) return no('equipped');
  const rar = it.rar ?? itemDef(it.id).rarity; if (rar < 3 || !['weapon', 'armor', 'accessory'].includes(itemDef(it.id).type)) return no('rarity');
  if (h.trophies.length >= trophySlots(houseLv(s))) return no('full');
  s.inventory.splice(s.inventory.indexOf(it), 1); h.trophies.push(it);
  return { ok: true };
}
export function trophyTake(s: GameState, i: number): R | { ok: true } {
  const h = homeOf(s), it = h.trophies[i]; if (!it) return no('item');
  if (s.inventory.length >= invSize(s)) return no('bag');
  h.trophies.splice(i, 1); s.inventory.push(it);
  return { ok: true };
}
export function stashPut(s: GameState, uid: number): R | { ok: true } {
  const h = homeOf(s), it = s.inventory.find(i => i.uid === uid); if (!it) return no('item');
  if (isEquipped(s, uid)) return no('equipped');
  const same = itemDef(it.id).stack ? h.stash.find(x => x.id === it.id) : undefined;
  if (!same && h.stash.length >= stashSlots(houseLv(s))) return no('full');
  s.inventory.splice(s.inventory.indexOf(it), 1);
  if (same) same.qty += it.qty; else h.stash.push(it);
  return { ok: true };
}
export function stashTake(s: GameState, i: number): R | { ok: true } {
  const h = homeOf(s), it = h.stash[i]; if (!it) return no('item');
  if (itemDef(it.id).stack) { if (!addItem(s, it.id, it.qty)) return no('bag'); }
  else { if (s.inventory.length >= invSize(s)) return no('bag'); s.inventory.push(it); }
  h.stash.splice(i, 1);
  return { ok: true };
}

// ---------------------------------------------------------------- guild shop & daily goals
export function shopBuy(s: GameState, id: string, now = Date.now()): R | { ok: true } {
  const g = guildOf(s); if (!g) return no('guild');
  const e = GUILD_SHOP.find(q => q.id === id); if (!e) return no('item');
  const day = dayKey(now); if (g.shop.day !== day) g.shop = { day, bought: {} };
  if ((g.shop.bought[id] ?? 0) >= e.daily) return no('daily');
  const me = meOf(s)!; if (me.pts < e.pts) return no('pts');
  if (!addItem(s, id, 1)) return no('bag');
  me.pts -= e.pts; g.shop.bought[id] = (g.shop.bought[id] ?? 0) + 1;
  return { ok: true };
}
export function goals(s: GameState, now = Date.now()) {
  const g = guildOf(s)!; const day = dayKey(now);
  if (g.goals.day !== day) {
    const r = srnd(hashStr(g.id + day)), pool = [...GOAL_POOL], list: Goal[] = [], n = gbLv(s, 'tavern', now) >= 3 ? 4 : 3;
    for (let i = 0; i < n && pool.length; i++) { const e = pool.splice(Math.floor(r() * pool.length), 1)[0]; list.push({ kind: e.kind, need: e.per * Math.max(3, g.members.length), have: 0, mine: 0, done: false }); }
    g.goals = { day, list };
  }
  return g.goals.list;
}
/** my farming moves the guild goals (called by the server after a kill / gather) */
export function goalProgress(s: GameState, kind: GoalKind, n: number, now = Date.now()) {
  const g = guildOf(s); if (!g || n <= 0) return;
  for (const q of goals(s, now)) if (q.kind === kind && !q.done) { q.have += n; q.mine += n; finishGoal(s, g, q, now); }
}
function finishGoal(s: GameState, g: GuildState, q: Goal, now: number) {
  if (q.done || q.have < q.need) return;
  q.done = true; const e = GOAL_POOL.find(x => x.kind === q.kind)!; const cap = tCap(s), m = 1 + 0.1 * (Math.max(1, gbLv(s, 'tavern', now)) - 1);
  for (const k of RES) g.treasury[k] = Math.max(g.treasury[k], Math.min(cap, g.treasury[k] + Math.round((e.reward[k] ?? 0) * m)));
  if (q.mine > 0) meOf(s)!.pts += e.pts;
  log(g, 'goal', `ภารกิจกิลด์ "${e.name}" สำเร็จ! ของเข้าคลัง`, now);
}

// ---------------------------------------------------------------- defense power (raids against my village)
export function defensePower(s: GameState) {
  const g = guildOf(s)!; const bl = barracksLv(s); let p = hallLv(s) * 100;
  const gm = (g.hungry ? 0.5 : 1) * (1 + 0.15 * (Math.max(1, bl) - 1));
  p += (g.guards.spear * 170 + g.guards.archer * 150) * gm;
  for (const q of g.defenses) { const d = DEFENSES[q.type], st = defStat(d, q.level), alive = q.hp / st.hp; p += alive * (st.dmg * 6 + st.hp * 0.08 + (d.spawn ?? 0) * 80 + (d.buff ?? 0) * 6); }
  return p;
}

// ---------------------------------------------------------------- time passing: production, guards' food, simulated members
/** catch up the guild village to `now`: production, guard food, simulated members (donations, upgrades), incoming raids */
export function guildTick(s: GameState, now = Date.now(), rnd: () => number = Math.random) {
  const g = guildOf(s); if (!g) return;
  produce(s, now);
  const hours = Math.min(12, Math.max(0, (now - g.simAt) / 3600000)); if (hours < 0.02) return;
  g.simAt = now; feedGuards(s, hours);
  const cap = tCap(s);
  for (const m of g.members) {
    if (!m.sim) continue;
    const a = 0.4 + rnd() * 0.6, give = { gold: 40, wood: 15, stone: 10, food: 10 };
    for (const k of RES) { const n = Math.round(give[k] * a * hours); const add = Math.max(0, Math.min(n, cap - g.treasury[k])); g.treasury[k] += add; m.pts += Math.round(add * CONTRIB[k]); }
    if (m.houseLv < 4 && rnd() < hours * 0.02) m.houseLv++;
    for (const q of goals(s, now)) if (!q.done) { const e = GOAL_POOL.find(x => x.kind === q.kind)!; q.have += Math.round(e.per / 8 * a * hours); finishGoal(s, g, q, now); }
  }
  // a simulated leader runs the village when the player is not the leader
  const lead = g.members.find(m => m.role === 'leader');
  if (lead?.sim && rnd() < Math.min(1, hours)) {
    for (const t of ['hall', 'warehouse', 'barracks', 'lumber', 'quarry', 'barn', 'market', 'forge', 'kitchen', 'tavern'] as GuildBld[]) {
      const b = g.buildings.find(q => q.type === t)!; if (b.level >= 5 || (b.done && now < b.done) || (t !== 'hall' && b.level + 1 > hallLv(s, now))) continue;
      if (tPay(g, villageCost(t, b.level + 1))) { b.level++; b.done = now + buildTime(b.level); log(g, 'upgrade', `${lead.name} อัป${GUILD_BLD[t].name} → Lv${b.level}`, now); break; }
    }
    if (guardsTotal(g) < guardCap(barracksLv(s, now)) && tPay(g, GUARDS.spear.hire)) { g.guards.spear++; log(g, 'guard', `${lead.name} จ้าง${GUARDS.spear.name}`, now); }
  }
  simIncoming(s, now, rnd);
}
/** a simulated rival attacks when the shield is down (at most once every 10 hours) */
export function simIncoming(s: GameState, now: number, rnd: () => number) {
  const g = guildOf(s)!; if (now < g.shieldUntil || now - g.incomingAt < 10 * 3600000) return null;
  g.incomingAt = now;
  if (rnd() > 0.5) return null;
  const atk = (hallLv(s) * 420 + 300) * (0.7 + rnd() * 0.7), def = defensePower(s), ratio = atk / Math.max(1, def);
  const stars = ratio > 2.2 ? 3 : ratio > 1.4 ? 2 : ratio > 0.9 ? 1 : 0;
  const name = RIVAL_NAMES[Math.floor(rnd() * RIVAL_NAMES.length)];
  return raidOutcome(s, stars, name, now, simWreck(stars, rnd));
}
/** what an enemy raid on our village costs (or earns, when it was beaten off) */
export function raidOutcome(s: GameState, stars: number, name: string, now: number, wreck?: Wreck) {
  const g = guildOf(s)!;
  if (wreck) applyWreck(s, wreck);
  const burnt = g.buildings.filter(b => (b.dmg ?? 0) > 0).length;
  if (burnt) g.unread.push(`🔥 อาคารถูกเผาเสียหาย ${burnt} หลัง${g.buildings.some(isRuin) ? ' (บางหลังพังเป็นซาก — หยุดทำงานจนกว่าจะซ่อม)' : ''} • ซ่อมด้วยของในคลังกิลด์ที่แท็บสร้าง`);
  if ((meOf(s)!.houseDmg ?? 0) > 0) g.unread.push('🏠 บ้านของคุณโดนไฟไหม้ — ซ่อมเองด้วยไม้/หินของคุณ (เดินไปที่บ้าน หรือแท็บหน้าหลักกิลด์)');
  if (!stars) seasonAdd(s, 8, now);   // beating a raid off counts for the season too
  if (!stars) { meOf(s)!.pts += 20; log(g, 'defend', `🛡 ${name} บุกแต่ป้องกันได้! (+20 แต้มบุญ)`, now); g.unread.push(`🛡 ${name} บุกหมู่บ้าน แต่ป้อมและทหารป้องกันไว้ได้!`); g.shieldUntil = now + 4 * 3600000; return { stars }; }
  const take = RAID_TAKE[stars], free = 1 - vaultShare(whLv(s)); const lost: string[] = [];
  for (const k of RES) { const n = Math.floor(g.treasury[k] * free * take); g.treasury[k] -= n; if (n) lost.push(`${ICON[k]}${n}`); }
  for (const q of g.defenses) q.hp = Math.max(1, Math.round(q.hp * (1 - 0.25 * stars)));
  const fallen = Math.min(guardsTotal(g), stars - 1); for (let i = 0; i < fallen; i++) { if (g.guards.spear) g.guards.spear--; else g.guards.archer--; }
  g.shieldUntil = now + SHIELD_H[stars] * 3600000;
  log(g, 'defend', `⚔ ${name} ปล้นหมู่บ้าน ${'⭐'.repeat(stars)} เสีย ${lost.join(' ')}`, now);
  g.unread.push(`⚔ ${name} ปล้นหมู่บ้านได้ ${'⭐'.repeat(stars)} — เสีย ${lost.join(' ')}${fallen ? ` • ทหารเสียชีวิต ${fallen}` : ''} • ป้อมเสียหาย ซ่อมได้ที่หน้าต่างกิลด์ • ได้โล่ ${SHIELD_H[stars]} ชม.`);
  return { stars };
}

// ---------------------------------------------------------------- raids (my guild attacks)
/** today's 3 matched targets (the server picks them; nobody chooses a victim freely) */
export function rivals(s: GameState, now = Date.now()): Rival[] {
  const g = guildOf(s)!; const day = dayKey(now);
  if (g.rivals.day !== day) {
    const r = srnd(hashStr(g.id + 'rv' + day)), my = hallLv(s), list: Rival[] = [];
    for (let i = 0; i < 3; i++) {
      const hall = Math.max(1, Math.min(5, my + [-1, 0, 0, 1][Math.floor(r() * 4)])), wh = Math.max(0, hall - 1 + Math.floor(r() * 2)), barracks = Math.max(1, hall - Math.floor(r() * 2));
      const cap = treasuryCap(wh), fill = () => 0.25 + r() * 0.4;
      const buildings = GUILD_BLD_ORDER.map(t => { const level = t === 'hall' ? hall : Math.max(1, Math.min(hall, hall - Math.floor(r() * 2))); const d = GUILD_BLD[t]; return { type: t, level, stored: d.produces ? Math.round(gbStoreCap(d, level) * (0.3 + r() * 0.6)) : 0 }; });
      const types = DEF_ORDER.filter(t => DEFENSES[t].hall <= hall), n = Math.round(defSlots(hall) * (0.6 + r() * 0.3));
      const defenses = Array.from({ length: n }, (_, k) => ({ slot: k, type: types[Math.floor(r() * types.length)], level: Math.max(1, Math.min(5, hall - Math.floor(r() * 2))) }));
      const houses = Array.from({ length: HOUSE_SLOTS }, () => (r() < 0.75 ? 1 + Math.floor(r() * 4) : 0));
      list.push({ id: `${day}:${i}`, name: RIVAL_NAMES[Math.floor(r() * RIVAL_NAMES.length)], hall, wh, barracks, guards: Math.min(guardCap(barracks), 1 + Math.floor(r() * guardCap(barracks))), treasury: { gold: Math.round(cap * fill() * 1.5), wood: Math.round(cap * fill()), stone: Math.round(cap * fill()), food: Math.round(cap * fill() * 0.6) }, buildings, defenses, houses });
    }
    g.rivals = { day, list };
  }
  return g.rivals.list;
}
/** HP of everything that can be destroyed in a rival village */
export function rivalStructs(r: Rival): RivalStruct[] {
  const out: RivalStruct[] = [];
  for (const b of r.buildings) out.push({ id: 'b:' + b.type, kind: b.type === 'hall' ? 'hall' : 'building', type: b.type, level: b.level, hp: b.type === 'hall' ? 2500 + 1500 * b.level : 700 + 500 * b.level, stored: b.stored, res: GUILD_BLD[b.type].produces });
  for (const q of r.defenses) out.push({ id: 'd:' + q.slot, kind: 'defense', type: q.type, level: q.level, hp: defStat(DEFENSES[q.type], q.level).hp, slot: q.slot });
  return out;
}
export function canRaid(s: GameState, id: string, now = Date.now()): R | { rival: Rival } {
  const g = guildOf(s); if (!g) return no('guild');
  if (!isOfficer(s)) return no('role');
  const day = dayKey(now); if (g.raids.day !== day) g.raids = { day, used: 0 };
  if (g.raids.used >= RAIDS_PER_DAY) return no('daily');
  const rv = rivals(s, now).find(x => x.id === id); if (!rv) return no('target');
  if (rv.hall < hallLv(s, now) - 1) return no('weak');
  return { rival: rv };
}
/** raid result: stars from what was destroyed; loot = part of the rival's unprotected treasury + stored output */
export function raidResult(s: GameState, rv: Rival, destroyed: string[], now = Date.now()) {
  const g = guildOf(s)!; const all = rivalStructs(rv), set = new Set(destroyed.filter(id => all.some(q => q.id === id)));
  const pct = set.size / all.length, hall = set.has('b:hall');
  const stars = pct >= 1 ? 3 : hall && pct >= 0.5 ? 2 : hall || pct >= 0.5 ? 1 : 0;
  const free = 1 - vaultShare(rv.wh), take = RAID_TAKE[stars], gain = { gold: 0, wood: 0, stone: 0, food: 0 } as Record<'gold' | 'wood' | 'stone' | 'food', number>;
  for (const k of RES) gain[k] = Math.floor(rv.treasury[k] * free * take * RAID_GAIN);
  for (const q of all) if (set.has(q.id) && q.res && q.stored) gain[q.res as 'gold'] += Math.floor(q.stored * RAID_STORED);
  const cap = tCap(s);
  for (const k of RES) { gain[k] = Math.max(0, Math.min(gain[k], cap - g.treasury[k])); g.treasury[k] += gain[k]; }
  g.raids.used++; g.shieldUntil = Math.min(g.shieldUntil, now);   // attacking drops your own shield
  seasonAdd(s, stars * 10 + set.size, now);
  g.rivals.list = g.rivals.list.filter(x => x.id !== rv.id);
  const pts = Math.round((gain.gold * CONTRIB.gold + gain.wood + gain.stone * 1.5 + gain.food) / 10) + stars * 30; meOf(s)!.pts += pts;
  log(g, 'raid', `${meOf(s)!.name} ปล้น${rv.name} ${'⭐'.repeat(stars) || 'ไม่ได้ดาว'} ได้ 💰${gain.gold} 🪵${gain.wood} 🪨${gain.stone} 🍖${gain.food}`, now);
  return { stars, gain, pts, destroyed: set.size, total: all.length };
}
/** test buttons (DEV_TOOLS only, refused by the server for OBT): fill the treasury, skip 12 hours, an enemy raid right now */
export function devGuild(s: GameState, op: 'guildFill' | 'guildTime' | 'guildAttack' | 'guildDefend', now = Date.now(), rnd: () => number = Math.random, n?: number, name?: string, wreck?: Wreck): string[] {
  const g = guildOf(s); if (!g) return ['ยังไม่มีกิลด์'];
  if (op === 'guildDefend') {   // the defense battle in the village ended: n = stars the enemy got (0 = beaten off)
    raidOutcome(s, Math.max(0, Math.min(3, Math.floor(n ?? 0))), name ?? RIVAL_NAMES[0], now, wreck);
    return g.unread.splice(0);
  }
  if (op === 'guildFill') {
    const cap = tCap(s); for (const k of RES) g.treasury[k] = cap;
    const ids = new Set<string>(); for (const d of [...Object.values(GUILD_BLD).map(b => b.costs), ...Object.values(DEFENSES).map(d => d.costs)]) for (const c of d) for (const id of Object.keys(c.items ?? {})) ids.add(id);
    for (const id of ids) g.treasury.items[id] = 99;
    return ['เติมคลังหมู่บ้านเต็ม + วัตถุดิบอัปขั้นสูง'];
  }
  if (op === 'guildTime') {
    const H = 12 * 3600000;
    for (const b of g.buildings) { b.done = undefined; b.last -= H; }
    for (const q of g.defenses) q.done = undefined;
    const me = meOf(s); if (me) me.houseDone = undefined;
    g.simAt -= H; guildTick(s, now, rnd);
    return ['ข้ามเวลา 12 ชม. — สร้างเสร็จหมด อาคารผลิตของ สมาชิกช่วยบริจาค ทหารกินอาหาร', ...g.unread.splice(0)];
  }
  g.shieldUntil = 0; g.incomingAt = 0; let first = true;
  simIncoming(s, now, () => { if (first) { first = false; return 0.1; } return rnd(); });
  return g.unread.splice(0);
}
// ---------------------------------------------------------------- weekly guild war season
const WEEK = 7 * 86400000, WEEK0 = Date.UTC(2026, 0, 5);   // weeks start on Monday 00:00 UTC
export const weekOf = (now: number) => Math.floor((now - WEEK0) / WEEK);
export const weekEnd = (now: number) => WEEK0 + (weekOf(now) + 1) * WEEK;
/** this week's season record (rolls the old week into `prev` when a new week starts) */
export function season(s: GameState, now = Date.now()) {
  const g = guildOf(s)!, w = weekOf(now);
  const se = (g.season ??= { week: w, score: 0 });
  if (se.week !== w) { se.prev = se.week === w - 1 ? { week: se.week, score: se.score } : { week: w - 1, score: 0 }; se.week = w; se.score = 0; }
  return se;
}
export function seasonAdd(s: GameState, pts: number, now = Date.now()) { if (guildOf(s) && pts > 0) season(s, now).score += Math.round(pts); }
/** (simulated until online) the other guilds' season points: each has its own pace over the week */
function botScore(name: string, week: number, frac: number) { const r = srnd(hashStr(name + ':' + week)); return Math.round((30 + r() * 230) * Math.min(1, Math.max(0, frac)) ** (0.8 + r() * 0.4)); }
export function seasonBoard(s: GameState, now = Date.now(), week = weekOf(now), myScore?: number) {
  const g = guildOf(s)!, se = season(s, now), frac = week < weekOf(now) ? 1 : (now - (WEEK0 + week * WEEK)) / WEEK;
  const list = RIVAL_NAMES.filter(n => n !== g.name).map(name => ({ name, score: botScore(name, week, frac), me: false }));
  list.push({ name: g.name, score: myScore ?? se.score, me: true });
  return list.sort((a, b) => b.score - a.score);
}
export const SEASON_REWARD = [
  { pts: 600, cores: 3, gold: 10000 }, { pts: 400, cores: 2, gold: 6000 }, { pts: 300, cores: 1, gold: 4000 },
  { pts: 150, cores: 0, gold: 2000 }, { pts: 150, cores: 0, gold: 2000 }, { pts: 150, cores: 0, gold: 2000 },
];
/** last week's reward, once: guild points + ancient cores for you, gold for the treasury (rank against the other guilds) */
export function seasonClaim(s: GameState, now = Date.now()): R | { rank: number; pts: number; cores: number; gold: number } {
  const g = guildOf(s); if (!g) return no('guild');
  const se = season(s, now); if (!se.prev || se.prev.score <= 0) return no('none');
  if (se.claimed === se.prev.week) return no('claimed');
  const rank = seasonBoard(s, now, se.prev.week, se.prev.score).findIndex(e => e.me) + 1;
  const rw = SEASON_REWARD[rank - 1] ?? { pts: 60, cores: 0, gold: 500 };
  meOf(s)!.pts += rw.pts; if (rw.cores) addItem(s, 'ancient_core', rw.cores);
  g.treasury.gold = Math.min(tCap(s), g.treasury.gold + rw.gold);
  se.claimed = se.prev.week;
  log(g, 'goal', `🏆 ฤดูกาลกิลด์วอร์จบ: อันดับ ${rank} — แต้มบุญ +${rw.pts}`, now);
  return { rank, ...rw };
}
export const raidsLeft = (s: GameState, now = Date.now()) => { const g = guildOf(s)!; return g.raids.day === dayKey(now) ? Math.max(0, RAIDS_PER_DAY - g.raids.used) : RAIDS_PER_DAY; };
