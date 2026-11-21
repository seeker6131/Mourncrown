// The player's own game on the server (server/worker.ts Player): every action goes there; the server's answer brings
// what changed in the valuable fields (level, gold, items, resources...), which replaces this device's copy.
// Online: actions with dice (a kill's loot, gathering, upgrades, crafting) are decided ONLY there.
import { SERVER, accountToken, freezeCloud } from './cloud';
import { runtime, bus, EV } from '../core/events';
import { setTownView, type TownView } from './townView';
import { newGameState } from '../core/state';
import { saveGame } from '../core/save';

type Out = { r: unknown; own: Record<string, unknown> };
class PlayLink {
  /** the server is at its cap (director's money limit): 'full' = too many online now, 'day' = today's hours used up */
  full: { why: string; n: number; max: number; at: number; msg?: string } | null = null;
  ws: WebSocket | null = null; ready = false; kicked = false; private last: WebSocket | null = null; private q = 1; private wait = new Map<number, (o: Out) => void>(); private delay = 1000; private started = false;
  get online() { return this.ready && !!this.ws && this.ws.readyState === WebSocket.OPEN; }
  start() {
    if (this.started) return; this.started = true; this.open();
    setInterval(() => { if (this.online) { try { this.ws!.send('{"t":"hb"}'); } catch { /* closing */ } } }, 120000);   // still here (the minutes played count toward the server's daily cap)
  }
  private open() {
    const t = accountToken(); if (!t || typeof WebSocket === 'undefined') { setTimeout(() => this.open(), 5000); return; }
    const ws = new WebSocket(SERVER.replace(/^http/, 'ws') + '/play?t=' + encodeURIComponent(t)); this.ws = ws; this.last = ws;
    ws.onmessage = e => {
      let m: { t: string; q?: number; has?: boolean } & Partial<Out> & { sid?: number }; try { m = JSON.parse(String(e.data)); } catch { return; }
      if (m.t === 'full') { const f = m as unknown as { why: string; n: number; max: number; msg?: string }; this.full = { why: f.why, n: f.n, max: f.max, at: Date.now(), msg: f.msg }; return; }
      if (m.t === 'hi') { this.full = null; this.wiped(m.own); this.apply(m.own); this.ready = !!m.has; this.delay = 1000; if (!m.has) setTimeout(() => this.retry(), 4000); return; }   // (no save on the server yet: the first upload seeds it)
      if (m.t === 'r') { this.apply(m.own); const f = this.wait.get(m.q!); this.wait.delete(m.q!); f?.({ r: m.r, own: m.own ?? {} }); return; }
      if (m.t === 'on') { bus.emit('net:online', Number((m as { n?: number }).n) || 0); return; }   // how many are playing now
      if ((m as { t: string }).t === 'ann') { bus.emit('net:ann', m); return; }   // 📢 the admin's announcement
      if ((m as { t: string }).t === 'town') { setTownView(m as unknown as TownView); return; }   // 🏘 the central buildings + the next raid
      if (m.t === 'pay') { this.apply(m.own); bus.emit('net:pay', { sid: m.sid, r: m.r }); }
      if (m.t === 'note') { this.apply(m.own); const text = (m as { text?: string }).text; if (text) bus.emit(EV.TOAST, text, '#ffd84a'); }   // e.g. something sold on the market
    };
    ws.onclose = e => { if (this.ws === ws) { this.ws = null; this.ready = false; } for (const f of this.wait.values()) f({ r: { refused: 'offline' }, own: {} }); this.wait.clear(); if (e.code === 4002) { setTimeout(() => this.open(), 60000); return; }   // (the cap: try again in a minute)
      if (e.code === 4000 && this.ws === null && this.last === ws) { this.kicked = true; freezeCloud(); bus.emit('net:kicked'); return; }   // another device opened this hero: stop here (no tug of war between the two)
      setTimeout(() => this.open(), this.delay); this.delay = Math.min(15000, this.delay * 2); };
  }
  /** 🧹 the server's character is from a newer wipe (OBT day) than this device's copy: start this copy over too — only the
   *  device's own settings and name stay (the server sends everything else), so no old item lingers on the screen */
  private wiped(own?: Record<string, unknown>) {
    const s = runtime.state as unknown as Record<string, unknown> | null, at = Number(own?.obtAt) || 0;
    if (!s || !at || Number(s.obtAt) === at) return;
    const keep: Record<string, unknown> = {}; for (const k of ['name', 'look', 'uiOpt', 'music', 'sfx', 'pot', 'lootOpt', 'introSeen']) if (s[k] !== undefined) keep[k] = s[k];
    for (const k of Object.keys(s)) delete s[k];
    Object.assign(s, newGameState(), keep, own);
    try { saveGame(s as never); } catch { /* storage blocked */ }
    setTimeout(() => location.reload(), 400);   // (start in the village with the new character — not on a map it may not enter)
  }
  private retry() { try { this.ws?.close(); } catch { /* gone */ } }
  /** the server's values replace this device's copy */
  private apply(own?: Record<string, unknown>) {
    const s = runtime.state as unknown as Record<string, unknown> | null; if (!s || !own) return;
    let n = 0; for (const [k, v] of Object.entries(own)) { s[k] = v; n++; }
    if (n) bus.emit(EV.STATE_CHANGED);
  }
  private syncT = 0;
  /** the device did something the server refused (the server had less wood, say): ask for the server's whole copy now —
   *  otherwise the device shows a house the server never built, and it vanishes at the next reload / update */
  resync() {
    if (!this.online || Date.now() - this.syncT < 3000) return; this.syncT = Date.now();
    try { this.ws!.send('{"t":"sync"}'); } catch { /* closing */ }
  }
  send(name: string, args: unknown): Promise<Out> {
    if (!this.online) return Promise.resolve({ r: { refused: 'offline' }, own: {} });
    const q = this.q++; this.ws!.send(JSON.stringify({ t: 'act', q, name, args }));
    return new Promise(res => { this.wait.set(q, res); setTimeout(() => { if (this.wait.delete(q)) res({ r: { refused: 'timeout' }, own: {} }); }, 8000); });
  }
}
export const play = new PlayLink();
