// The player's own game on the server (server/worker.ts Player): every action goes there; the server's answer brings
// what changed in the valuable fields (level, gold, items, resources...), which replaces this device's copy.
// Online: actions with dice (a kill's loot, gathering, upgrades, crafting) are decided ONLY there.
import { SERVER, accountToken } from './cloud';
import { runtime, bus, EV } from '../core/events';

type Out = { r: unknown; own: Record<string, unknown> };
class PlayLink {
  /** the server is at its cap (director's money limit): 'full' = too many online now, 'day' = today's hours used up */
  full: { why: string; n: number; max: number; at: number } | null = null;
  ws: WebSocket | null = null; ready = false; private q = 1; private wait = new Map<number, (o: Out) => void>(); private delay = 1000; private started = false;
  get online() { return this.ready && !!this.ws && this.ws.readyState === WebSocket.OPEN; }
  start() {
    if (this.started) return; this.started = true; this.open();
    setInterval(() => { if (this.online) { try { this.ws!.send('{"t":"hb"}'); } catch { /* closing */ } } }, 120000);   // still here (the minutes played count toward the server's daily cap)
  }
  private open() {
    const t = accountToken(); if (!t || typeof WebSocket === 'undefined') { setTimeout(() => this.open(), 5000); return; }
    const ws = new WebSocket(SERVER.replace(/^http/, 'ws') + '/play?t=' + encodeURIComponent(t)); this.ws = ws;
    ws.onmessage = e => {
      let m: { t: string; q?: number; has?: boolean } & Partial<Out> & { sid?: number }; try { m = JSON.parse(String(e.data)); } catch { return; }
      if (m.t === 'full') { const f = m as unknown as { why: string; n: number; max: number }; this.full = { why: f.why, n: f.n, max: f.max, at: Date.now() }; return; }
      if (m.t === 'hi') { this.full = null; this.apply(m.own); this.ready = !!m.has; this.delay = 1000; if (!m.has) setTimeout(() => this.retry(), 4000); return; }   // (no save on the server yet: the first upload seeds it)
      if (m.t === 'r') { this.apply(m.own); const f = this.wait.get(m.q!); this.wait.delete(m.q!); f?.({ r: m.r, own: m.own ?? {} }); return; }
      if (m.t === 'pay') { this.apply(m.own); bus.emit('net:pay', { sid: m.sid, r: m.r }); }
      if (m.t === 'note') { this.apply(m.own); const text = (m as { text?: string }).text; if (text) bus.emit(EV.TOAST, text, '#ffd84a'); }   // e.g. something sold on the market
    };
    ws.onclose = e => { if (this.ws === ws) { this.ws = null; this.ready = false; } for (const f of this.wait.values()) f({ r: { refused: 'offline' }, own: {} }); this.wait.clear(); if (e.code === 4002) { setTimeout(() => this.open(), 60000); return; }   // (the cap: try again in a minute)
      setTimeout(() => this.open(), this.delay); this.delay = Math.min(15000, this.delay * 2); };
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
