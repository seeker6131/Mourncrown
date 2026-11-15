// ⚔ Team battlefield, last team standing (director 15 Nov — replaces the open PvP map). Run by the map room on the server.
// - Rounds only in the open hours (PVP_HOURS, Bangkok): every 20 minutes = 3 min lobby (enter, make / join a team of up
//   to 4 — or go alone) → 15 min fight → 2 min results. Nobody enters once the fight has started.
// - A round needs at least 2 teams, else it is called off and the entry fee is paid back.
// - Teammates cannot hurt each other. A fallen hero is out of the round (nothing farmed is lost). Leaving the map or
//   dropping off for 30 s during the fight = out (no dodging a fight).
// - The safe zone shrinks every 3 minutes; outside it you lose HP every second, so the teams have to meet.
// - The last team with anyone alive wins; at the 15-minute mark: most heroes alive, then most kills.
// - Treasure chests (3 a round, hidden): the team that opens one earns one prize roll per chest for EVERY member —
//   paid only if someone of the team is still alive when the round ends. Rates are never shown.
// - Winners: gold + EXP each; the MVP (most kills, then most damage): more gold + EXP.
import type { GameState, InvItem } from '../core/state';
import { invSize } from '../core/state';
import { PVP_HOURS } from './pvp';
import { pickBase, makeGear } from './loot';
import { grantMount, hasMount } from './mounts';
import { expToNext, gainExp } from './stats';

export const BR_LOBBY = 3 * 60000, BR_FIGHT = 15 * 60000, BR_END = 2 * 60000, BR_ROUND = BR_LOBBY + BR_FIGHT + BR_END;
export const BR_TEAM_MAX = 4, BR_MIN_TEAMS = 2;
/** dropped off during the fight this long = out */
export const BR_DC_MS = 30000;
/** when the round's chests appear (ms into the fight) */
export const BR_CHESTS = [60000, 5 * 60000, 9 * 60000];
/** outside the safe zone: this share of max HP a second */
export const BR_ZONE_DMG = 0.05;

export type BrPhase = 'lobby' | 'fight' | 'end';
export interface BrRound { id: number; phase: BrPhase; start: number; fightAt: number; fightEnd: number; end: number }
/** the round running at `now` (null: closed, or too late in the opening for a whole round) */
export function brRound(now = Date.now()): BrRound | null {
  const day = Math.floor((now + 7 * 3600000) / 86400000) * 86400000 - 7 * 3600000;   // (Bangkok midnight, in UTC ms)
  for (const [a, b] of PVP_HOURS) {
    const w0 = day + a * 3600000, w1 = day + b * 3600000; if (now < w0 || now >= w1) continue;
    const start = w0 + Math.floor((now - w0) / BR_ROUND) * BR_ROUND; if (start + BR_ROUND > w1) return null;
    const fightAt = start + BR_LOBBY, fightEnd = fightAt + BR_FIGHT;
    return { id: Math.round(start / 60000), phase: now < fightAt ? 'lobby' : now < fightEnd ? 'fight' : 'end', start, fightAt, fightEnd, end: start + BR_ROUND };
  }
  return null;
}
/** the round with this id (the room knows its round by its name) */
export function brRoundById(id: number): BrRound {
  const start = id * 60000, fightAt = start + BR_LOBBY, fightEnd = fightAt + BR_FIGHT, now = Date.now();
  return { id, phase: now < fightAt ? 'lobby' : now < fightEnd ? 'fight' : 'end', start, fightAt, fightEnd, end: start + BR_ROUND };
}
/** ms until the next round's lobby opens (0 = a lobby is open now) */
export function brNext(now = Date.now()) {
  const r = brRound(now); if (r?.phase === 'lobby') return 0;
  for (let t = now + 60000; t < now + 26 * 3600000; t += 60000) { const q = brRound(t); if (q && q.phase === 'lobby' && q.start > now) return q.start - now; }
  return 0;
}

/** the safe zone `t` ms into the fight on a W x H map: holds 2 minutes, then shrinks for 1 minute, five times */
export function brZone(t: number, W: number, H: number, seed: number) {
  const R = [1, 0.7, 0.48, 0.32, 0.19, 0.1], R0 = Math.hypot(W, H) / 2 + 40, step = 180000;
  const k = Math.max(0, Math.min(R.length - 1, Math.floor(t / step))), into = t - k * step;
  const f = k >= R.length - 1 ? 0 : Math.max(0, (into - 120000) / 60000);
  const r = R0 * (R[k] + (R[Math.min(R.length - 1, k + 1)] - R[k]) * f);
  const ox = ((seed * 7919) % 11 - 5) / 5 * W * 0.15, oy = ((seed * 104729) % 11 - 5) / 5 * H * 0.15;   // (the final circle is not always the middle)
  return { x: W / 2 + ox, y: H / 2 + oy, r: Math.round(r) };
}

/** a winner's / the MVP's pay */
export const BR_WIN_GOLD = 15000, BR_MVP_GOLD = 10000, BR_WIN_EXP = 0.12, BR_MVP_EXP = 0.08;
export function brPay(s: GameState, o: { win: boolean; mvp: boolean }) {
  let gold = 0, exp = 0;
  if (o.win) { gold += BR_WIN_GOLD; exp += Math.round(expToNext(s.level) * BR_WIN_EXP); }
  if (o.mvp) { gold += BR_MVP_GOLD; exp += Math.round(expToNext(s.level) * BR_MVP_EXP); }
  s.gold += gold; const levels = exp ? gainExp(s, exp) : 0;
  return { gold, exp, levels };
}

/** one prize roll from a team chest, per 10,000 (never shown): Legend ~30%, SL ~3%, the golden dragon ~0.1%, else gold */
const P = { ltd: 10, sl: 300, legend: 3000 };
export type BrPrize = { kind: 'ltd'; mount?: string; stars?: number } | { kind: 'gear'; rar: number; id: string } | { kind: 'gold'; gold: number };
export function brRoll(s: GameState, rnd: () => number): BrPrize {
  let r = rnd() * 10000;
  if ((r -= P.ltd) < 0) {
    if (hasMount(s, 'gdragon')) { const p = s as { stars?: number }; p.stars = (p.stars ?? 0) + 80; return { kind: 'ltd', stars: 80 }; }
    grantMount(s, 'gdragon'); return { kind: 'ltd', mount: 'gdragon' };
  }
  const rar = (r -= P.sl) < 0 ? 5 : (r -= P.legend) < 0 ? 4 : -1;
  if (rar < 0 || s.inventory.length >= invSize(s)) { const gold = Math.round(4000 + rnd() * 4000); s.gold += gold; return { kind: 'gold', gold }; }   // (a full bag: gold)
  const slot = (['weapon', 'armor', 'accessory'] as const)[Math.floor(rnd() * 3)], b = pickBase(rnd, rar, s.cls, slot), g = makeGear(rnd, b.id);
  s.inventory.push({ ...g, uid: s.nextUid++, qty: 1, upg: 0 } as InvItem);
  return { kind: 'gear', rar: g.rar ?? rar, id: b.id };
}

/** the results: rank the teams (most alive, then most kills); the MVP (most kills, then damage) */
export function brResult(teams: Record<string, string[]>, alive: Set<string>, kills: Record<string, number>, dmg: Record<string, number>) {
  const rows = Object.entries(teams).map(([tid, m]) => ({ tid, alive: m.filter(p => alive.has(p)).length, kills: m.reduce((a, p) => a + (kills[p] ?? 0), 0) }));
  rows.sort((a, b) => b.alive - a.alive || b.kills - a.kills);
  const win = rows[0] && rows[0].alive > 0 ? rows[0].tid : null;
  let mvp: string | null = null;
  for (const m of Object.values(teams).flat()) if (!mvp || (kills[m] ?? 0) > (kills[mvp] ?? 0) || ((kills[m] ?? 0) === (kills[mvp] ?? 0) && (dmg[m] ?? 0) > (dmg[mvp] ?? 0))) mvp = m;
  if (mvp && !(kills[mvp] ?? 0) && !(dmg[mvp] ?? 0)) mvp = null;   // (nobody fought: no MVP)
  return { win, mvp, rows };
}
