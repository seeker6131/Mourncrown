// The map room on the game server (server/worker.ts Room): the players in the same map see each other and talk.
// Sends where the hero is (at most 5 times a second, only when something changed, plus a keep-alive), swings for the
// animation, and chat lines. Reconnects by itself; offline = nothing happens and the game plays on alone.
import { SERVER, accountToken } from './cloud';

export interface Pos { x: number; y: number; d: number; f: string; mv: number; hp: number; a: number; r: string; lv: number }
export interface Other extends Pos { id: string; name: string; tx: number; ty: number; seen: number }
export type RoomEvent = { t: 'hit'; id: string; k: string; d: number } | { t: 'c'; id: string; name: string; text: string } | { t: 'bye'; id: string } | { t: 'join'; id: string }
  | { t: 'host'; id: string } | { t: 'ms'; a: MonRow[] } | { t: 'mhp'; sid: number; hp: number; by: string } | { t: 'mdead'; sid: number; sh: Record<string, number>; wb?: number; killer?: string; kname?: string } | { t: 'matk'; sid: number; k: string }
  | { t: 'mfx'; sid: number; k: 'special' | 'charge'; x: number; y: number } | { t: 'srv'; solo?: boolean } | { t: 'grid?' }
  | { t: 'wb'; k: 'warn' | 'spawn' | 'leave'; sid: number; key: string; name: string; x: number; y: number };
/** one monster in the host's list: sid, key, kind, boss, elite, x, y, dir, moving, attacking, max HP, (from the room) HP */
export type MonRow = [number, string, string, number, number, number, number, number, number, number, number, number?, number?, number?];

export class RoomLink {
  ws: WebSocket | null = null; me = ''; host = ''; others = new Map<string, Other>(); closed = false;
  /** this game moves the map's monsters (the room's longest-staying player) */
  get isHost() { return this.online && !!this.me && this.host === this.me; }
  private last = ''; private lastT = 0; private wait = 1000;
  /** the map's base room; full rooms send us on to base-2, base-3 ... (30 players a room) */
  private shard = 1;
  constructor(public base: string, private on: (e: RoomEvent) => void) { this.open(); }
  get room() { return this.shard > 1 ? `${this.base}-${this.shard}` : this.base; }
  get online() { return !!this.ws && this.ws.readyState === WebSocket.OPEN; }
  private open() {
    const t = accountToken(); if (!t || this.closed || typeof WebSocket === 'undefined') return;
    const ws = new WebSocket(SERVER.replace(/^http/, 'ws') + '/room/' + this.room + '?t=' + encodeURIComponent(t)); this.ws = ws;
    ws.onopen = () => { this.wait = 1000; this.last = ''; };
    ws.onmessage = e => { try { this.got(JSON.parse(String(e.data))); } catch { /* bad line */ } };
    ws.onclose = e => {
      if (this.ws === ws) this.ws = null; if (this.closed) return;
      if (e.code === 4001 && this.shard < 50) { this.shard++; this.open(); return; }   // full: the next room of this map
      if (e.code === 4002) { setTimeout(() => this.open(), 60000); return; }   // the server's cap (director's money limit): try again in a minute
      setTimeout(() => this.open(), this.wait); this.wait = Math.min(15000, this.wait * 2);
    };
  }
  private put(o: Partial<Other> & { id: string }) {
    const cur = this.others.get(o.id), now = performance.now();
    if (cur) Object.assign(cur, o, { tx: o.x ?? cur.tx, ty: o.y ?? cur.ty, seen: now });
    else { this.others.set(o.id, { x: 0, y: 0, d: 0, f: 'hero', mv: 0, hp: 100, a: 0, r: '', lv: 1, name: '', ...o, tx: o.x ?? 0, ty: o.y ?? 0, seen: now } as Other); this.on({ t: 'join', id: o.id }); }
  }
  private got(m: Record<string, unknown>) {
    if (m.t === 'hi') { this.me = String(m.you); this.host = String(m.host ?? ''); this.others.clear(); for (const p of (m.players as Other[]) ?? []) this.put(p); this.on(m.srv ? { t: 'srv', solo: !!m.solo } : { t: 'host', id: this.host }); }
    else if (m.t === 'host') { this.host = String(m.id); this.on(m as unknown as RoomEvent); }
    else if (m.t === 'ms' || m.t === 'mhp' || m.t === 'mdead' || m.t === 'matk' || m.t === 'mfx' || m.t === 'grid?' || m.t === 'wb') this.on(m as unknown as RoomEvent);
    else if (m.t === 'p' && m.id !== this.me) this.put(m as unknown as Other);
    else if (m.t === 'bye') { this.others.delete(String(m.id)); this.on(m as RoomEvent); }
    else if (m.t === 'hit' || m.t === 'c') this.on(m as unknown as RoomEvent);
  }
  /** the hero's state; sent when it changed (2.5 a second at most, or every 3 s when alone in the room) */
  pos(p: Pos) {
    if (!this.online) return;
    const now = performance.now(), key = JSON.stringify(p);
    const gap = this.others.size ? 400 : 3000;   // (nobody else here: only a sign of life — saves the server's daily quota)
    if ((key === this.last && now - this.lastT < 3000) || now - this.lastT < gap) return;
    this.last = key; this.lastT = now; this.ws!.send(JSON.stringify({ t: 'p', ...p }));
  }
  hit(k: string, d: number) { if (this.online) this.ws!.send(JSON.stringify({ t: 'hit', k, d })); }
  /** (host) the map's monsters, 5 times a second */
  mons(a: MonRow[]) { if (this.online) this.ws!.send(JSON.stringify({ t: 'ms', a })); }
  /** I hit monster sid for n */
  dmg(sid: number, n: number) { if (this.online) this.ws!.send(JSON.stringify({ t: 'dmg', sid, n: Math.round(n) })); }
  /** (host) monster sid swings at player `to` */
  matk(to: string, sid: number, k = 'hit') { if (this.online) this.ws!.send(JSON.stringify({ t: 'matk', to, sid, k })); }
  /** the map's walls, meadows and gate (the room runs the monsters on them) */
  grid(g: { w: number; h: number; c: number; b: string; cl: { x: number; y: number; r: number; boss?: boolean }[]; gate: { x: number; y: number } }) { if (this.online) this.ws!.send(JSON.stringify({ t: 'grid', ...g })); }
  chat(text: string) { if (this.online && text.trim()) this.ws!.send(JSON.stringify({ t: 'c', text: text.slice(0, 90) })); }
  close() { this.closed = true; try { this.ws?.close(); } catch { /* gone */ } this.ws = null; }
}
