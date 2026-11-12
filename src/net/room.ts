// The map room on the game server (server/worker.ts Room): the players in the same map see each other and talk.
// Sends where the hero is (at most 5 times a second, only when something changed, plus a keep-alive), swings for the
// animation, and chat lines. Reconnects by itself; offline = nothing happens and the game plays on alone.
import { SERVER, accountToken } from './cloud';

export interface Pos { x: number; y: number; d: number; f: string; mv: number; hp: number; a: number; r: string; lv: number }
export interface Other extends Pos { id: string; name: string; tx: number; ty: number; seen: number }
export type RoomEvent = { t: 'hit'; id: string; k: string; d: number } | { t: 'c'; id: string; name: string; text: string } | { t: 'bye'; id: string } | { t: 'join'; id: string };

export class RoomLink {
  ws: WebSocket | null = null; me = ''; others = new Map<string, Other>(); closed = false;
  private last = ''; private lastT = 0; private wait = 1000;
  constructor(public room: string, private on: (e: RoomEvent) => void) { this.open(); }
  get online() { return !!this.ws && this.ws.readyState === WebSocket.OPEN; }
  private open() {
    const t = accountToken(); if (!t || this.closed || typeof WebSocket === 'undefined') return;
    const ws = new WebSocket(SERVER.replace(/^http/, 'ws') + '/room/' + this.room + '?t=' + encodeURIComponent(t)); this.ws = ws;
    ws.onopen = () => { this.wait = 1000; this.last = ''; };
    ws.onmessage = e => { try { this.got(JSON.parse(String(e.data))); } catch { /* bad line */ } };
    ws.onclose = () => { if (this.ws === ws) this.ws = null; if (!this.closed) { setTimeout(() => this.open(), this.wait); this.wait = Math.min(15000, this.wait * 2); } };
  }
  private put(o: Partial<Other> & { id: string }) {
    const cur = this.others.get(o.id), now = performance.now();
    if (cur) Object.assign(cur, o, { tx: o.x ?? cur.tx, ty: o.y ?? cur.ty, seen: now });
    else { this.others.set(o.id, { x: 0, y: 0, d: 0, f: 'hero', mv: 0, hp: 100, a: 0, r: '', lv: 1, name: '', ...o, tx: o.x ?? 0, ty: o.y ?? 0, seen: now } as Other); this.on({ t: 'join', id: o.id }); }
  }
  private got(m: Record<string, unknown>) {
    if (m.t === 'hi') { this.me = String(m.you); this.others.clear(); for (const p of (m.players as Other[]) ?? []) this.put(p); }
    else if (m.t === 'p' && m.id !== this.me) this.put(m as unknown as Other);
    else if (m.t === 'bye') { this.others.delete(String(m.id)); this.on(m as RoomEvent); }
    else if (m.t === 'hit' || m.t === 'c') this.on(m as unknown as RoomEvent);
  }
  /** the hero's state; sent when it changed (5 a second at most) or every 3 s */
  pos(p: Pos) {
    if (!this.online) return;
    const now = performance.now(), key = JSON.stringify(p);
    if ((key === this.last && now - this.lastT < 3000) || now - this.lastT < 200) return;
    this.last = key; this.lastT = now; this.ws!.send(JSON.stringify({ t: 'p', ...p }));
  }
  hit(k: string, d: number) { if (this.online) this.ws!.send(JSON.stringify({ t: 'hit', k, d })); }
  chat(text: string) { if (this.online && text.trim()) this.ws!.send(JSON.stringify({ t: 'c', text: text.slice(0, 90) })); }
  close() { this.closed = true; try { this.ws?.close(); } catch { /* gone */ } this.ws = null; }
}
