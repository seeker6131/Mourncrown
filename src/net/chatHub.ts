// 💬 World chat and guild chat (server/worker.ts /chat/world, /chat/guild — the same chat filter, mute and reports as the
// map's chat). The world opens from Lv5, the guild channel for its members; both reconnect by themselves.
import { SERVER, accountToken } from './cloud';
import { bus, runtime } from '../core/events';

export type ChatCh = 'map' | 'world' | 'guild';
export interface ChatLine { ch: ChatCh; id: string; name: string; text: string; at?: number }
/** 📜 the chat history this game keeps, per channel (director: scroll back like the big games) — the world and guild
 *  channels also bring the server's last 100 lines on connect; the map's starts when you arrive */
export const CHAT_KEEP = 200;
export const chatStore: Record<ChatCh, ChatLine[]> = { map: [], world: [], guild: [] };
function keep(l: ChatLine) {
  const list = chatStore[l.ch], at = l.at ?? Date.now();
  if (l.at && list.some(q => q.at === l.at && q.id === l.id && q.text === l.text)) return;   // (history sent again on a reconnect)
  list.push({ ...l, at }); list.sort((a, b) => (a.at ?? 0) - (b.at ?? 0)); if (list.length > CHAT_KEEP) list.splice(0, list.length - CHAT_KEEP);
  bus.emit('chat:store', l.ch);
}
bus.on('chat:line', (e: ChatLine) => keep(e));
bus.on('td:chat', (e: { id: string; name: string; text: string }) => keep({ ch: 'map', id: e.id, name: e.name, text: e.text }));
export const WORLD_LV = 5;

class ChatLink {
  ws: WebSocket | null = null; me = ''; closed = false; private wait = 2000;
  constructor(public ch: 'world' | 'guild') { this.open(); }
  get online() { return !!this.ws && this.ws.readyState === WebSocket.OPEN; }
  private open() {
    const t = accountToken(); if (!t || this.closed || typeof WebSocket === 'undefined') return;
    const ws = new WebSocket(SERVER.replace(/^http/, 'ws') + '/chat/' + this.ch + '?t=' + encodeURIComponent(t)); this.ws = ws;
    ws.onopen = () => { this.wait = 2000; };
    ws.onmessage = e => {
      let m: { t: string; you?: string; id?: string; name?: string; text?: string; at?: number; hist?: { id: string; name: string; text: string; at?: number }[] };
      try { m = JSON.parse(String(e.data)); } catch { return; }
      if (m.t === 'hi') { this.me = String(m.you ?? ''); for (const h of m.hist ?? []) bus.emit('chat:line', { ch: this.ch, ...h, old: true }); }
      else if (m.t === 'c') bus.emit('chat:line', { ch: this.ch, id: String(m.id ?? ''), name: String(m.name ?? ''), text: String(m.text ?? '') });
    };
    ws.onclose = () => { if (this.ws === ws) this.ws = null; if (this.closed) return; setTimeout(() => this.open(), this.wait); this.wait = Math.min(60000, this.wait * 2); };
  }
  send(text: string) { if (this.online && text.trim()) this.ws!.send(JSON.stringify({ t: 'c', text: text.slice(0, 90) })); }
  close() { this.closed = true; try { this.ws?.close(); } catch { /* gone */ } this.ws = null; }
}

/** the world and guild channels follow the character: opened / closed as the level and the guild change */
export const chatHub = {
  world: null as ChatLink | null, guild: null as ChatLink | null, gid: '',
  start() { this.sync(); setInterval(() => this.sync(), 5000); },
  sync() {
    const s = runtime.state as { level?: number; guildId?: string } | null; if (!s || !accountToken()) return;
    if (!this.world && (s.level ?? 1) >= WORLD_LV) this.world = new ChatLink('world');
    const gid = s.guildId ?? '';
    if (gid !== this.gid) { this.guild?.close(); this.guild = gid ? new ChatLink('guild') : null; this.gid = gid; }
  },
  send(ch: 'world' | 'guild', text: string) { this[ch]?.send(text); },
  online(ch: 'world' | 'guild') { return !!this[ch]?.online; },
};
