// The ONLY way the game client changes valuable state: act('action', args).
// Now: runs the server handlers in-process (offline build). Online: this becomes a request to the game server
// (websocket/HTTPS), the server answers with the result + the new state, and src/server/ is not shipped in the client.
import { handlers, type Handlers } from '../server/handlers';
import { S } from '../core/events';

export const refused = (r: unknown): r is { refused: string } => !!r && typeof r === 'object' && 'refused' in (r as object) && !!(r as { refused?: string }).refused;
export function act<K extends keyof Handlers>(name: K, args: Parameters<Handlers[K]>[1]): ReturnType<Handlers[K]> {
  const fn = handlers[name] as unknown as (s: unknown, a: unknown, c: unknown) => ReturnType<Handlers[K]>;
  return fn(S(), args, { now: Date.now(), rnd: Math.random });
}
