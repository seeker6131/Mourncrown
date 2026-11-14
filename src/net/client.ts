// The ONLY way the game client changes valuable state: act('action', args).
// Offline: the server rules (src/server/handlers.ts) run here on this device.
// Online (net/play.ts): the same rules run on the game server with its own dice — the device runs them too only to
// show the result at once, and the server's answer replaces the valuable fields. Actions with dice are decided ONLY by
// the server: call actServer() for those (a kill's loot, gathering, upgrades, crafting, picking up loot).
import { TEST_HOOKS } from '../core/testHooks';
import { handlers, type Handlers } from '../server/handlers';
import { S, bus, EV } from '../core/events';
import { tr } from '../core/i18n';
import { play } from './play';
import { isAdmin } from './cloud';

export const refused = (r: unknown): r is { refused: string } => !!r && typeof r === 'object' && 'refused' in (r as object) && !!(r as { refused?: string }).refused;
const local = (name: string, args: unknown) => (handlers as unknown as Record<string, (s: unknown, a: unknown, c: unknown) => unknown>)[name](S(), args, { now: Date.now(), rnd: Math.random, admin: TEST_HOOKS || isAdmin() })   // (the server checks the admin for real; this only lets the device show the same result);
/** actions the server alone decides when online (they roll dice or hand out loot) */
export const SERVER_ONLY = new Set(['kill', 'gather', 'upgradeItem', 'craft', 'pickup', 'dungeonClear', 'marketCancel', 'marketBuy', 'marketBrowse', 'marketHistory', 'wheelSpin', 'openPick', 'dwheelSpin', 'starTrade', 'guildCreate', 'guildBrowse', 'guildJoinReal', 'guildLeave', 'cbtClaim', 'dungeonTicket']);
export const isOnline = () => play.online;
/** an answer that means "not done" */
const failed = (r: unknown) => r === false || r === null || refused(r);
/** actions often refused in normal play (no toast — the resync alone fixes the screen) */
const QUIET = new Set(['spawn', 'hit', 'kill', 'gather', 'pickup', 'move', 'pot', 'potion']);

export function act<K extends keyof Handlers>(name: K, args: Parameters<Handlers[K]>[1], then?: (r: ReturnType<Handlers[K]>) => void): ReturnType<Handlers[K]> {
  const r = local(name, args) as ReturnType<Handlers[K]>;
  if (play.online) {   // the server runs it too (its dice, its clock); its answer corrects this device
    const sent = name === 'spawn' && r && typeof r === 'object' && 'sid' in (r as object) ? { ...(args as object), sid: (r as { sid: number }).sid } : args;   // same monster number on both sides
    play.send(name, sent).then(o => {
      if (failed(o.r) && !failed(r) && !(refused(o.r) && ['offline', 'timeout'].includes(o.r.refused))) {   // worked here, not on the server: show the truth now
        play.resync(); if (QUIET.has(name)) { /* (happens in normal play) */ } else bus.emit(EV.TOAST, tr('⚠ เซิร์ฟเวอร์ไม่รับ — ปรับข้อมูลให้ตรงกับเซิร์ฟแล้ว'), '#ff8a8a');
      }
      then?.(o.r as ReturnType<Handlers[K]>);
    });
  }
  return r;
}
/** an action decided by the server (online) — offline it runs here */
export async function actServer<K extends keyof Handlers>(name: K, args: Parameters<Handlers[K]>[1]): Promise<ReturnType<Handlers[K]>> {
  if (!play.online) return local(name, args) as ReturnType<Handlers[K]>;
  return (await play.send(name, args)).r as ReturnType<Handlers[K]>;
}
