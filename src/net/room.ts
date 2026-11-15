// The map room on the game server (server/worker.ts Room): the players in the same map see each other and talk.
// Sends where the hero is (at most 5 times a second, only when something changed, plus a keep-alive), swings for the
// animation, and chat lines. Reconnects by itself; offline = nothing happens and the game plays on alone.
import type { RaidState, RaidEnd } from '../world/townRaidView';
import { Track } from './interp';
import { SERVER, accountToken } from './cloud';

export interface Pos { x: number; y: number; d: number; f: string; mv: number; hp: number; a: number; r: string; lv: number; /** ⛈ cloud pet out, gold name, black horse skin (systems/cosmetics.ts) */ pe?: number; nc?: number; sk?: number; /** ⚔ weapon circle: 1 = +5, 2 = +10 */ wu?: number; /** 🪽 wings out (data/wings.ts id) */ wg?: string }
export interface Other extends Pos { id: string; name: string; tx: number; ty: number; seen: number; /** the reported spots on the sender's clock (smooth movement: net/interp.ts) */ tr: Track; ts?: number }
export type PDrop = { did: number; x: number; y: number; id?: string; qty?: number; gold?: number; rar?: number };
export type RoomEvent = { t: 'php'; id: string; by: string; dmg: number; hp: number } | { t: 'pkill'; id: string; name: string; by: string; kname: string } | { t: 'pdrop'; a: PDrop[] } | { t: 'pgone'; did: number } | { t: 'bteams'; teams: import('../world/brView').BrTeam[]; started?: boolean; done?: boolean; alive?: string[] } | { t: 'bstart'; teams: import('../world/brView').BrTeam[] } | ({ t: 'bend' } & import('../world/brView').BrEnd) | { t: 'pchint'; id: number } | { t: 'pchest'; id: number; x: number; y: number; until: number } | { t: 'pcopen'; id: number; by: string; name: string } | { t: 'pcstop'; id: number; by: string } | { t: 'pcgone'; id: number; by?: string; name?: string; team?: string; prize?: { kind?: string; mount?: string; stars?: number; rar?: number; id?: string; gold?: number } } | { t: 'hit'; id: string; k: string; d: number; s?: string } | { t: 'c'; id: string; name: string; text: string } | { t: 'bye'; id: string } | { t: 'join'; id: string }
  | RaidState | RaidEnd | { t: 'host'; id: string } | { t: 'ms'; a: MonRow[] } | { t: 'mhp'; sid: number; hp: number; by: string } | { t: 'mdead'; sid: number; sh: Record<string, number>; wb?: number; killer?: string; kname?: string } | { t: 'matk'; sid: number; k: string }
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
    const tx = o.x ?? cur?.tx ?? 0, ty = o.y ?? cur?.ty ?? 0;
    if (cur) { Object.assign(cur, o, { tx, ty, seen: now }); if (o.x !== undefined) cur.tr.add(now, tx, ty, o.ts); }
    else { const tr = new Track(); tr.add(now, tx, ty, o.ts); this.others.set(o.id, { x: 0, y: 0, d: 0, f: 'hero', mv: 0, hp: 100, a: 0, r: '', lv: 1, name: '', ...o, tx, ty, seen: now, tr } as Other); this.on({ t: 'join', id: o.id }); this.lastT = -1e9; }   // (someone new: they get my spot at once)
  }
  private got(m: Record<string, unknown>) {
    if (m.t === 'hi') { this.me = String(m.you); this.host = String(m.host ?? ''); this.others.clear(); for (const p of (m.players as Other[]) ?? []) this.put(p); this.on(m.srv ? { t: 'srv', solo: !!m.solo } : { t: 'host', id: this.host }); }
    else if (m.t === 'host') { this.host = String(m.id); this.on(m as unknown as RoomEvent); }
    else if (m.t === 'ms' || m.t === 'mhp' || m.t === 'mdead' || m.t === 'matk' || m.t === 'mfx' || m.t === 'grid?' || m.t === 'wb' || m.t === 'rs' || m.t === 'rend') this.on(m as unknown as RoomEvent);
    else if (m.t === 'p' && m.id !== this.me) this.put(m as unknown as Other);
    else if (m.t === 'bye') { this.others.delete(String(m.id)); this.on(m as RoomEvent); }
    else if (m.t === 'hit' || m.t === 'c' || m.t === 'php' || m.t === 'pkill' || m.t === 'pdrop' || m.t === 'pgone' || m.t === 'bteams' || m.t === 'bstart' || m.t === 'bend' || m.t === 'pchint' || m.t === 'pchest' || m.t === 'pcopen' || m.t === 'pcstop' || m.t === 'pcgone') this.on(m as unknown as RoomEvent);
  }
  /** the hero's state; sent when it changed (5 a second at most, or every 3 s when alone in the room) */
  pos(p: Pos) {
    if (!this.online) return;
    const now = performance.now(), key = JSON.stringify(p);
    const gap = this.others.size ? 200 : 3000;   // 5 a second when someone can see me (smooth); alone: only a sign of life (the daily quota)
    if ((key === this.last && now - this.lastT < 3000) || now - this.lastT < gap) return;
    this.last = key; this.lastT = now; this.ws!.send(JSON.stringify({ t: 'p', ...p, ts: Math.round(now) }));   // (ts: my clock — the others space my spots by it)
  }
  /** ⚔ PvP: I hit hero `to` (k: 'atk' | 'sk'); I step on battlefield loot */
  pa(to: string, k: 'atk' | 'sk') { if (this.online) this.ws!.send(JSON.stringify({ t: 'pa', to, k })); }
  /** 📦 I start opening the battlefield chest / I held on long enough */
  /** ⚔ team round lobby: make / join / leave a team */
  team(t: 'tcreate' | 'tjoin' | 'tleave', tid?: string) { if (this.online) this.ws!.send(JSON.stringify(tid ? { t, tid } : { t })); }
  pcopen(id: number) { if (this.online) this.ws!.send(JSON.stringify({ t: 'pcopen', id })); }
  pcdone(id: number) { if (this.online) this.ws!.send(JSON.stringify({ t: 'pcdone', id })); }
  ppick(did: number) { if (this.online) this.ws!.send(JSON.stringify({ t: 'ppick', did })); }
  hit(k: string, d: number, s?: string) { if (this.online) this.ws!.send(JSON.stringify(s ? { t: 'hit', k, d, s } : { t: 'hit', k, d })); }
  /** (host) the map's monsters, 5 times a second */
  mons(a: MonRow[]) { if (this.online) this.ws!.send(JSON.stringify({ t: 'ms', a })); }
  /** I hit monster sid for n */
  dmg(sid: number, n: number) { if (this.online) this.ws!.send(JSON.stringify({ t: 'dmg', sid, n: Math.round(n) })); }
  /** (host) monster sid swings at player `to` */
  matk(to: string, sid: number, k = 'hit') { if (this.online) this.ws!.send(JSON.stringify({ t: 'matk', to, sid, k })); }
  /** the map's walls, meadows and gate (the room runs the monsters on them) */
  grid(g: { w: number; h: number; c: number; b: string; hb?: string; cl: { x: number; y: number; r: number; boss?: boolean }[]; gate: { x: number; y: number } }) { if (this.online) this.ws!.send(JSON.stringify({ t: 'grid', ...g })); }
  chat(text: string) { if (this.online && text.trim()) this.ws!.send(JSON.stringify({ t: 'c', text: text.slice(0, 90) })); }
  close() { this.closed = true; try { this.ws?.close(); } catch { /* gone */ } this.ws = null; }
}
