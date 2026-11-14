// Guild war, the mixed way (director's choice): the SYSTEM fights the whole war — our members' squad storms the enemy
// village while the enemy squad storms ours, both at once — and everyone can watch either side live. Players may jump in:
// a hero's hits on enemy buildings add damage, a hero's kills among the raiders thin the enemy squad. When time runs out
// (or a village falls) the side with more of its village left standing wins.
// The server owns the numbers (this file); the two battle views (world/raid.ts, world/defense.ts) only show them.
import type { GameState } from '../core/state';
import {
  guildOf, meOf, hallLv, barracksLv, isRuin, bldHp, defensePower, guardsTotal, canRaid, rivalStructs, raidResult, raidOutcome, seasonAdd, guildLog,
  type Rival, type Wreck,
} from './guild';
import { DEFENSES, defStat, GUILD_BLD, type DefenseId, type GuildBld } from '../data/guild';

export const WAR_SECS = 240;
/** share of a village an even, untouched squad wrecks over the whole war (with losses on the way it ends near half) */
const PUSH = 0.6;
export interface WarBld { id: string; kind: 'hall' | 'building' | 'defense'; name: string; hp: number; max: number }
export interface WarSide { blds: WarBld[]; troops: number; troops0: number; atk: number; def: number }
export interface War {
  rival: Rival; start: number; end: number; last: number; ours: WarSide; theirs: WarSide;
  hero: { dmg: number; kills: number }; feed: { t: number; text: string; us: boolean }[];
  over?: { win: boolean; ours: number; theirs: number; stars: number; got: string[] };
}
type R = { refused: string };
const no = (why: string): R => ({ refused: why });

export const pctLeft = (side: WarSide) => { const m = side.blds.reduce((a, b) => a + b.max, 0); return m ? side.blds.reduce((a, b) => a + Math.max(0, b.hp), 0) / m : 1; };
const total = (side: WarSide) => side.blds.reduce((a, b) => a + b.max, 0);
/** what gets hit first: defenses (the weakest first), then buildings, the hall last */
const nextTarget = (side: WarSide) => side.blds.filter(b => b.hp > 0).sort((a, b) => (a.kind === 'defense' ? 0 : a.kind === 'hall' ? 2 : 1) - (b.kind === 'defense' ? 0 : b.kind === 'hall' ? 2 : 1) || a.hp - b.hp)[0];

function rivalDefense(r: Rival) {
  let p = r.hall * 100 + r.guards * 160 * (1 + 0.15 * (r.barracks - 1));
  for (const q of r.defenses) { const d = DEFENSES[q.type], st = defStat(d, q.level); p += st.dmg * 6 + st.hp * 0.08 + (d.spawn ?? 0) * 80 + (d.buff ?? 0) * 6; }
  return p;
}

/** declare war on one of today's matched rivals (uses one of the day's raids; leader / deputy) */
export function startWar(s: GameState, id: string, now = Date.now()): R | { war: War } {
  const g = guildOf(s); if (!g) return no('guild');
  if (g.war && !g.war.over) return no('war');
  const c = canRaid(s, id, now); if ('refused' in c) return c;
  const rv = c.rival;
  const ours: WarSide = { blds: [], troops: 0, troops0: 0, atk: 0, def: 0 };
  for (const b of g.buildings) { if (isRuin(b)) continue; const max = bldHp(b.type, b.level); ours.blds.push({ id: 'b:' + b.type, kind: b.type === 'hall' ? 'hall' : 'building', name: `${GUILD_BLD[b.type].icon} ${GUILD_BLD[b.type].name}`, hp: max * (1 - (b.dmg ?? 0)), max }); }
  for (const q of g.defenses) { const d = DEFENSES[q.type]; ours.blds.push({ id: 'd:' + q.slot, kind: 'defense', name: d.name, hp: q.hp, max: defStat(d, q.level).hp }); }
  const theirs: WarSide = { blds: rivalStructs(rv).map(q => ({ id: q.id, kind: q.kind, name: q.kind === 'defense' ? DEFENSES[q.type as DefenseId].name : `${GUILD_BLD[q.type as GuildBld].icon} ${GUILD_BLD[q.type as GuildBld].name}`, hp: q.hp, max: q.hp })), troops: 0, troops0: 0, atk: 0, def: 0 };
  // squads: our members + hired guards; theirs from their hall, guards and houses (bot guild)
  ours.troops = ours.troops0 = 10;   // squads are counted in tenths: their strength is in atk / def
  ours.atk = hallLv(s, now) * 120 + guardsTotal(g) * 160 * (1 + 0.15 * (Math.max(1, barracksLv(s, now)) - 1)) + g.members.reduce((a, m) => a + m.lv * 3, 0);
  ours.def = defensePower(s);
  const homes = rv.houses.filter(h => h > 0).length;
  theirs.troops = theirs.troops0 = 10;
  theirs.atk = rv.hall * 120 + rv.guards * 160 + homes * 90;
  theirs.def = rivalDefense(rv);
  g.raids.used++;   // a war is one of the day's raids
  g.war = { rival: rv, start: now, end: now + WAR_SECS * 1000, last: now, ours, theirs, hero: { dmg: 0, kills: 0 }, feed: [] };
  guildLog(g, 'raid', `⚔ ${meOf(s)!.name} ประกาศสงครามกับ ${rv.name}`, now);
  return { war: g.war };
}

/** one side's squad hits the other side's village for `dt` seconds; the defenders thin the squad meanwhile */
function push(a: WarSide, b: WarSide, dt: number, feed: War['feed'], now: number, us: boolean) {
  if (a.troops <= 0) return;
  const ratio = Math.max(0.75, Math.min(1.3, Math.sqrt(a.atk / Math.max(1, b.def))));   // stronger squads hit harder, but no war is decided before it starts
  let dmg = (a.troops / a.troops0) * ratio * (total(b) * PUSH / WAR_SECS) * dt;
  while (dmg > 0) {
    const t = nextTarget(b); if (!t) break;
    const d = Math.min(dmg, t.hp); t.hp -= d; dmg -= d;
    if (t.hp <= 0) { t.hp = 0; feed.unshift({ t: now, us, text: us ? `🔥 กองทัพเราทำลาย ${t.name} ของศัตรู!` : `💥 ศัตรูทำลาย ${t.name} ของเรา!` }); }
  }
  // the defenders (towers, guards) kill attackers; standing defenses matter
  const defLeft = b.blds.filter(q => q.kind === 'defense').length ? b.blds.filter(q => q.kind === 'defense' && q.hp > 0).length / b.blds.filter(q => q.kind === 'defense').length : 0.5;
  a.troops = Math.max(0, a.troops - dt * Math.max(0.35, b.def * (0.5 + defLeft) / (b.def + a.atk)) * a.troops0 / (WAR_SECS * 1.1));   // every squad wears down
}

/** catch the war up to `now` (one-second steps); ends it when time is up or a village has fallen */
export function warTick(s: GameState, now = Date.now()): War | null {
  const w = guildOf(s)?.war; if (!w) return null;
  if (w.over) return w;
  const to = Math.min(now, w.end);
  while (w.last + 1000 <= to) { w.last += 1000; push(w.ours, w.theirs, 1, w.feed, w.last, true); push(w.theirs, w.ours, 1, w.feed, w.last, false); }
  if (w.feed.length > 30) w.feed.length = 30;
  if (now >= w.end || pctLeft(w.ours) <= 0 || pctLeft(w.theirs) <= 0) settle(s, now);
  return w;
}

/** a hero's hit on an enemy building (the server checks how hard the hero can hit before calling this) */
export function warHit(s: GameState, id: string, dmg: number, now = Date.now()): R | { hp: number } {
  const w = warTick(s, now); if (!w || w.over) return no('war');
  const t = w.theirs.blds.find(b => b.id === id); if (!t) return no('target');
  if (t.hp <= 0) return { hp: 0 };
  t.hp = Math.max(0, t.hp - Math.max(0, dmg)); w.hero.dmg += dmg;
  if (t.hp <= 0) w.feed.unshift({ t: now, us: true, text: `🗡 ${meOf(s)!.name} ทำลาย ${t.name} ด้วยมือตัวเอง!` });
  if (pctLeft(w.theirs) <= 0) settle(s, now);
  return { hp: t.hp };
}
/** a hero struck down one of the raiders in our village: their squad gets thinner */
export function warKill(s: GameState, now = Date.now()): R | { troops: number } {
  const w = warTick(s, now); if (!w || w.over) return no('war');
  w.theirs.troops = Math.max(0, w.theirs.troops - w.theirs.troops0 / 24); w.hero.kills++;
  return { troops: w.theirs.troops };
}
/** walk away: the war ends now with what stands */
export function warEnd(s: GameState, now = Date.now()) { const w = warTick(s, now); if (w && !w.over) settle(s, now, true); return w; }

const starsOf = (side: WarSide) => {
  const all = side.blds.length, down = side.blds.filter(b => b.hp <= 0).length, hall = side.blds.some(b => b.kind === 'hall' && b.hp <= 0), p = down / Math.max(1, all);
  return p >= 1 ? 3 : hall && p >= 0.5 ? 2 : hall || p >= 0.5 ? 1 : 0;
};
/** the result: more of the village left standing wins. Loot and losses go through the usual raid rules. */
function settle(s: GameState, now: number, quit = false) {
  const g = guildOf(s)!, w = g.war!; if (w.over) return;
  // walking away before the end is a loss (no locking in an early lead)
  const ours = pctLeft(w.ours), theirs = pctLeft(w.theirs), win = !quit && ours > theirs;
  const before = g.unread.length;
  // what our squad wrecked: loot from their treasury (raid rules, no new resources made)
  const r = raidResult(s, w.rival, w.theirs.blds.filter(b => b.hp <= 0).map(b => b.id), now); g.raids.used--;   // the war already counted its raid
  // what they wrecked at home: fire damage + losses (raid rules), our defenses keep the HP they have left
  const wreck: Wreck = { b: {} };
  for (const b of w.ours.blds) if (b.id.startsWith('b:')) { const t = b.id.slice(2) as GuildBld, gb = g.buildings.find(q => q.type === t)!, lost = Math.max(0, 1 - b.hp / b.max - (gb.dmg ?? 0)); if (lost > 0.04) wreck.b![t] = b.hp <= 0 ? 1 : lost; }
  const stars = starsOf(w.ours);
  raidOutcome(s, stars, w.rival.name, now, wreck);
  for (const b of w.ours.blds) if (b.id.startsWith('d:')) { const q = g.defenses.find(x => 'd:' + x.slot === b.id); if (q) q.hp = Math.max(1, Math.round(b.hp)); }
  seasonAdd(s, win ? 40 : 10, now);
  if (win) meOf(s)!.pts += 60;
  const got = [`${win ? '🏆 ชนะสงคราม!' : quit ? '🏳 ถอยทัพ (นับว่าแพ้)' : '🏳 แพ้สงคราม'} หมู่บ้านเราเหลือ ${Math.round(ours * 100)}% • ${w.rival.name} เหลือ ${Math.round(theirs * 100)}%`,
    `ของเข้าคลัง 💰${r.gain.gold} 🪵${r.gain.wood} 🪨${r.gain.stone} 🍖${r.gain.food} • ฤดูกาล +${win ? 40 : 10}${win ? ' • แต้มบุญ +60' : ''}`, ...g.unread.splice(before)];
  w.over = { win, ours, theirs, stars, got };
  guildLog(g, 'raid', `${win ? '🏆 ชนะ' : '🏳 แพ้'}สงครามกับ ${w.rival.name} (${Math.round(ours * 100)}% ต่อ ${Math.round(theirs * 100)}%)`, now);
}
/** the result has been shown: clear the war */
export function warDone(s: GameState) { const g = guildOf(s); if (g?.war?.over) { const o = g.war.over; g.war = undefined; return o; } return null; }
