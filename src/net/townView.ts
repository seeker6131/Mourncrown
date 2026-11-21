// 🏘 The central village as the server last told this game (every hello, ≤ 1 min old; fresh after a donation):
// which shared buildings are broken (the rules read townBroken) and when the next village raid comes.
import { bus } from '../core/events';
import { townBroken, type TownBld } from '../systems/town';
import type { RaidPlan } from '../systems/townRaid';

export interface TownRowView { bid: TownBld; broken: number; at: number; need: number; prog: number; top: { n: string; p: number }[] }
export interface TownView { now: number; plan: RaidPlan | null; rows: TownRowView[] }
/** the last view + this device's clock minus the server's */
export const TOWN: { view: TownView | null; skew: number } = { view: null, skew: 0 };
export function setTownView(v: TownView) {
  TOWN.view = v; TOWN.skew = Date.now() - v.now;
  townBroken.clear(); for (const r of v.rows) if (r.broken) townBroken.add(r.bid);
  bus.emit('town:view', v);
}
/** the raid's start on this device's clock (null = none) */
export const raidAtLocal = () => TOWN.view?.plan ? TOWN.view.plan.at + TOWN.skew : null;
