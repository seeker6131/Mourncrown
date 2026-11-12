// The ONLY way the game client changes valuable state: act('action', args).
// Offline: the server rules (src/server/handlers.ts) run here on this device.
// Online (net/play.ts): the same rules run on the game server with its own dice — the device runs them too only to
// show the result at once, and the server's answer replaces the valuable fields. Actions with dice are decided ONLY by
// the server: call actServer() for those (a kill's loot, gathering, upgrades, crafting, picking up loot).
import { handlers, type Handlers } from '../server/handlers';
import { S } from '../core/events';
import { play } from './play';

export const refused = (r: unknown): r is { refused: string } => !!r && typeof r === 'object' && 'refused' in (r as object) && !!(r as { refused?: string }).refused;
const local = (name: string, args: unknown) => (handlers as unknown as Record<string, (s: unknown, a: unknown, c: unknown) => unknown>)[name](S(), args, { now: Date.now(), rnd: Math.random });
/** actions the server alone decides when online (they roll dice or hand out loot) */
export const SERVER_ONLY = new Set(['kill', 'gather', 'upgradeItem', 'craft', 'pickup', 'dungeonClear', 'marketCancel', 'marketBuy', 'marketBrowse', 'guildCreate', 'guildBrowse', 'guildJoinReal', 'guildLeave']);
export const isOnline = () => play.online;

export function act<K extends keyof Handlers>(name: K, args: Parameters<Handlers[K]>[1], then?: (r: ReturnType<Handlers[K]>) => void): ReturnType<Handlers[K]> {
  const r = local(name, args) as ReturnType<Handlers[K]>;
  if (play.online) {   // the server runs it too (its dice, its clock); its answer corrects this device
    const sent = name === 'spawn' && r && typeof r === 'object' && 'sid' in (r as object) ? { ...(args as object), sid: (r as { sid: number }).sid } : args;   // same monster number on both sides
    play.send(name, sent).then(o => then?.(o.r as ReturnType<Handlers[K]>));
  }
  return r;
}
/** an action decided by the server (online) — offline it runs here */
export async function actServer<K extends keyof Handlers>(name: K, args: Parameters<Handlers[K]>[1]): Promise<ReturnType<Handlers[K]>> {
  if (!play.online) return local(name, args) as ReturnType<Handlers[K]>;
  return (await play.send(name, args)).r as ReturnType<Handlers[K]>;
}
