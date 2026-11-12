// Mourncrown game server — Cloudflare Worker + D1 (free plan). Deployed by tools/deploy_server.mjs.
// Step 1 (now): accounts (a guest account per device, Google login links it so any device loads the same hero) and the
// save kept on the server. ⚠️ The save is still WRITTEN by the game on the player's device — the server stores it but does
// not yet decide the rules; step 2 moves src/server/handlers.ts here (docs/ONLINE_RISKS.md).
interface D1Result<T> { results: T[] }
interface D1Stmt { bind(...v: unknown[]): D1Stmt; first<T>(): Promise<T | null>; run(): Promise<unknown>; all<T>(): Promise<D1Result<T>> }
interface DOState { acceptWebSocket(ws: WebSocket, tags?: string[]): void; getWebSockets(tag?: string): WebSocket[] }
interface DONamespace { idFromName(n: string): unknown; get(id: unknown): { fetch(r: Request): Promise<Response> } }
interface Env { DB: { prepare(sql: string): D1Stmt }; GOOGLE_CLIENT_ID?: string; ROOM: DONamespace }
declare const WebSocketPair: { new(): { 0: WebSocket; 1: WebSocket } };
type WSX = WebSocket & { serializeAttachment(v: unknown): void; deserializeAttachment(): unknown; accept?: () => void };

const ORIGINS = ['https://seeker6131.github.io', 'http://localhost:5174', 'http://localhost:5180', 'http://localhost:4173', 'http://localhost:5173'];
const MAX_SAVE = 900_000;          // bytes of save JSON
const SAVE_GAP = 3000;             // ms between two saves of one account
const NEW_PER_HOUR = 20;           // new guest accounts per IP per hour

const enc = new TextEncoder();
async function sha(s: string) { const d = await crypto.subtle.digest('SHA-256', enc.encode(s)); return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join(''); }
function rand(n = 32) { const a = new Uint8Array(n); crypto.getRandomValues(a); return [...a].map(b => b.toString(16).padStart(2, '0')).join(''); }

function cors(req: Request) {
  const o = req.headers.get('Origin') ?? '';
  return { 'Access-Control-Allow-Origin': ORIGINS.includes(o) ? o : ORIGINS[0], 'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS', 'Access-Control-Allow-Headers': 'content-type,x-mc-token', 'Access-Control-Max-Age': '86400', Vary: 'Origin' };
}
const json = (req: Request, body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...cors(req) } });

async function who(req: Request, env: Env) {
  const t = req.headers.get('x-mc-token'); if (!t || t.length < 32 || t.length > 128) return null;
  const a = await env.DB.prepare('SELECT id, google_sub, name FROM accounts WHERE token_hash = ?').bind(await sha(t)).first<{ id: string; google_sub: string | null; name: string | null }>();
  if (a) await env.DB.prepare('UPDATE accounts SET seen = ? WHERE id = ?').bind(Date.now(), a.id).run();
  return a;
}
async function newAccount(env: Env, ipHash: string, sub: string | null) {
  const id = rand(12), token = rand(32), now = Date.now();
  await env.DB.prepare('INSERT INTO accounts (id, token_hash, google_sub, ip_hash, created, seen) VALUES (?, ?, ?, ?, ?, ?)').bind(id, await sha(token), sub, ipHash, now, now).run();
  return { id, token };
}
/** something looked wrong in a save: kept for the admin to look at (step 2 makes it impossible instead) */
async function flag(env: Env, id: string, what: string, detail: string) {
  await env.DB.prepare('INSERT INTO flags (id, at, what, detail) VALUES (?, ?, ?, ?)').bind(id, Date.now(), what, detail.slice(0, 200)).run();
}
/** player names: Thai / English letters, digits, _ — 2 to 16 characters; no staff look-alikes or rude words */
const BAD = ['admin', 'gm', 'moderator', 'mourncrown', 'support', 'ทีมงาน', 'แอดมิน', 'ผู้ดูแล', 'fuck', 'shit', 'bitch', 'dick', 'เหี้ย', 'ควย', 'สัส', 'เย็ด', 'ระยำ', 'ชาติหมา'];
function cleanName(raw: unknown) {
  const n = String(raw ?? '').normalize('NFC').trim();
  if (!/^[\u0E00-\u0E7FA-Za-z0-9_]{2,16}$/.test(n)) return null;
  const k = n.toLowerCase(); return BAD.some(b => k.includes(b)) ? null : n;
}
/** a Google sign-in credential (ID token) checked with Google: right app, not expired, e-mail verified */
async function googleSub(env: Env, credential: string) {
  if (!env.GOOGLE_CLIENT_ID || !credential || credential.length > 4096) return null;
  const r = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(credential)); if (!r.ok) return null;
  const p = await r.json() as { aud?: string; iss?: string; exp?: string; sub?: string };
  if (p.aud !== env.GOOGLE_CLIENT_ID || !['accounts.google.com', 'https://accounts.google.com'].includes(p.iss ?? '') || Number(p.exp) * 1000 < Date.now() || !p.sub) return null;
  return p.sub;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
    const url = new URL(req.url), path = url.pathname;
    try {
      if (path === '/' || path === '/health') return json(req, { ok: true, game: 'mourncrown', google: !!env.GOOGLE_CLIENT_ID });

      if (path === '/auth/guest' && req.method === 'POST') {
        const ipHash = await sha('mc:' + (req.headers.get('CF-Connecting-IP') ?? ''));
        const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM accounts WHERE ip_hash = ? AND created > ?').bind(ipHash, Date.now() - 3600_000).first<{ n: number }>();
        if ((n?.n ?? 0) >= NEW_PER_HOUR) return json(req, { error: 'rate' }, 429);
        return json(req, await newAccount(env, ipHash, null));
      }

      if (path === '/auth/google' && req.method === 'POST') {
        const body = await req.json().catch(() => ({})) as { credential?: string };
        const sub = await googleSub(env, body.credential ?? ''); if (!sub) return json(req, { error: 'google' }, 401);
        const linked = await env.DB.prepare('SELECT id FROM accounts WHERE google_sub = ?').bind(sub).first<{ id: string }>();
        if (linked) {   // this Google account already has a hero: this device signs in to it (a new session token for this device)
          const token = rand(32);
          await env.DB.prepare('UPDATE accounts SET token_hash = ?, seen = ? WHERE id = ?').bind(await sha(token), Date.now(), linked.id).run();
          return json(req, { id: linked.id, token, switched: true });
        }
        const me = await who(req, env);
        if (me && !me.google_sub) {   // first Google login: the guest hero on this device becomes this Google account's hero
          await env.DB.prepare('UPDATE accounts SET google_sub = ? WHERE id = ?').bind(sub, me.id).run();
          return json(req, { id: me.id, linked: true });
        }
        const ipHash = await sha('mc:' + (req.headers.get('CF-Connecting-IP') ?? ''));
        return json(req, { ...(await newAccount(env, ipHash, sub)), switched: true });
      }

      // a map room (Durable Object): see the other players in this map and talk (WebSocket; the token rides in the URL
      // because a browser cannot set headers on a WebSocket)
      if (path.startsWith('/room/')) {
        const room = path.slice(6);
        if (!/^[a-z0-9-]{1,32}$/.test(room) || req.headers.get('Upgrade') !== 'websocket') return json(req, { error: 'room' }, 400);
        const t = url.searchParams.get('t') ?? '';
        const a = t.length >= 32 && t.length <= 128 ? await env.DB.prepare('SELECT id, name FROM accounts WHERE token_hash = ?').bind(await sha(t)).first<{ id: string; name: string | null }>() : null;
        if (!a) return new Response('auth', { status: 401 });
        const u = new URL(req.url); u.search = ''; u.searchParams.set('id', a.id); u.searchParams.set('name', a.name ?? '');
        return env.ROOM.get(env.ROOM.idFromName(room)).fetch(new Request(u.toString(), req));
      }

      const me = await who(req, env);
      if (!me) return json(req, { error: 'auth' }, 401);

      if (path === '/me') return json(req, { id: me.id, google: !!me.google_sub, name: me.name });

      // the player's name: set once (changing it later is a support / shop matter), unique ignoring case
      if (path === '/name' && req.method === 'POST') {
        if (me.name) return json(req, { error: 'set', name: me.name }, 409);
        const body = await req.json().catch(() => ({})) as { name?: string };
        const n = cleanName(body.name); if (!n) return json(req, { error: 'bad' }, 400);
        try { await env.DB.prepare('UPDATE accounts SET name = ?, name_key = ? WHERE id = ? AND name IS NULL').bind(n, n.toLowerCase(), me.id).run(); }
        catch { return json(req, { error: 'taken' }, 409); }
        return json(req, { name: n });
      }

      if (path === '/save' && req.method === 'GET') {
        const s = await env.DB.prepare('SELECT rev, at, data FROM saves WHERE id = ?').bind(me.id).first<{ rev: number; at: number; data: string }>();
        return json(req, s ? { rev: s.rev, at: s.at, data: JSON.parse(s.data) } : { rev: 0, at: 0, data: null });
      }
      if (path === '/save' && req.method === 'PUT') {
        const raw = await req.text(); if (raw.length > MAX_SAVE + 200) return json(req, { error: 'size' }, 413);
        const body = JSON.parse(raw) as { rev?: number; data?: { version?: number } };
        if (!body.data || typeof body.data !== 'object' || typeof body.data.version !== 'number') return json(req, { error: 'data' }, 400);
        const data = JSON.stringify(body.data), now = Date.now();
        const cur = await env.DB.prepare('SELECT rev, at FROM saves WHERE id = ?').bind(me.id).first<{ rev: number; at: number }>();
        if (cur && now - cur.at < SAVE_GAP) return json(req, { error: 'rate', rev: cur.rev }, 429);
        if ((cur?.rev ?? 0) !== (body.rev ?? 0)) return json(req, { error: 'stale', rev: cur?.rev ?? 0, at: cur?.at ?? 0 }, 409);
        // anti-cheat until the rules run here: what only real money / the server gives can never go up through a save
        // (diamonds, VIP) — it is put back to the stored value; big jumps in gold / level are logged for review
        if (cur) {
          const old = await env.DB.prepare('SELECT data FROM saves WHERE id = ?').bind(me.id).first<{ data: string }>();
          const o = JSON.parse(old?.data ?? '{}') as Record<string, number>, n = body.data as Record<string, number>, mins = Math.max(1, (now - cur.at) / 60000);
          for (const k of ['diamonds', 'vipUntil', 'vipTier']) if ((Number(n[k]) || 0) > (Number(o[k]) || 0)) { n[k] = o[k]; await flag(env, me.id, k, `${o[k]} -> raised`); }
          if ((Number(n.gold) || 0) - (Number(o.gold) || 0) > 50000 + 20000 * mins) await flag(env, me.id, 'gold', `${o.gold} -> ${n.gold} in ${Math.round(mins)} min`);
          if ((Number(n.level) || 0) - (Number(o.level) || 0) > 3 + mins / 10) await flag(env, me.id, 'level', `${o.level} -> ${n.level} in ${Math.round(mins)} min`);
        }
        const data2 = JSON.stringify(body.data);
        const rev = (cur?.rev ?? 0) + 1;
        await env.DB.prepare('INSERT INTO saves (id, rev, at, size, data) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET rev = excluded.rev, at = excluded.at, size = excluded.size, data = excluded.data')
          .bind(me.id, rev, now, data2.length, data2).run();
        return json(req, { rev, at: now });
      }
      return json(req, { error: 'not found' }, 404);
    } catch (e) {
      return json(req, { error: 'server', detail: String(e).slice(0, 200) }, 500);
    }
  },
};

// ===== a map room: the players in one map see each other and talk =====
// Positions are relayed as they come (the sender is rate-limited), chat is filtered. Uses the hibernation WebSocket
// API so an idle room costs nothing. Monsters are still each player's own (step 3 moves combat here).
interface Who { id: string; name: string; p?: Record<string, unknown>; n: number; win: number; chatT: number; join: number; bud: number; budT: number }
interface RMon { hp: number; max: number; alive: boolean; boss: boolean; dmg: Record<string, number> }
const RUDE = ['fuck', 'shit', 'bitch', 'dick', 'เหี้ย', 'ควย', 'สัส', 'เย็ด', 'ระยำ', 'ชาติหมา', 'หี', 'แตด'];
const cleanChat = (t: string) => { let o = t.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 90); for (const w of RUDE) o = o.split(w).join('*'.repeat(w.length)); return o; };
export class Room {
  /** the monsters of this map: the host's game spawns and moves them, the room keeps their HP (in memory: a room that
   *  sleeps forgets, and the host's next list brings them back at full HP) */
  mons = new Map<number, RMon>(); host = '';
  constructor(private state: DOState) {}
  private all(skip?: WebSocket) { return this.state.getWebSockets().filter(w => w !== skip).map(w => ({ w, a: (w as WSX).deserializeAttachment() as Who })).filter(x => x.a); }
  /** the host = who has been here longest; tell everyone when it changes */
  private pickHost(skip?: WebSocket) {
    const h = this.all(skip).sort((x, y) => x.a.join - y.a.join)[0]?.a.id ?? '';
    if (h !== this.host) { this.host = h; const msg = JSON.stringify({ t: 'host', id: h }); for (const { w } of this.all(skip)) { try { w.send(msg); } catch { /* closing */ } } }
  }
  async fetch(req: Request) {
    const u = new URL(req.url), id = u.searchParams.get('id') ?? '', name = (u.searchParams.get('name') || 'ผู้กล้า#' + id.slice(0, 4)).slice(0, 16);
    for (const old of this.state.getWebSockets(id)) { try { old.close(4000, 'again'); } catch { /* gone */ } }   // one connection per player
    const pair = new WebSocketPair(), client = pair[0], server = pair[1] as WSX;
    this.state.acceptWebSocket(server, [id]);
    server.serializeAttachment({ id, name, n: 0, win: Date.now(), chatT: 0, join: Date.now(), bud: 0, budT: Date.now() } as Who);
    const others = this.state.getWebSockets().filter(w => w !== server).map(w => (w as WSX).deserializeAttachment() as Who).filter(o => o && o.id !== id && o.p);
    if (!this.host || !others.some(o => o.id === this.host)) this.host = '';
    this.pickHost();
    server.send(JSON.stringify({ t: 'hi', you: id, name, host: this.host, players: others.map(o => ({ id: o.id, name: o.name, ...o.p })) }));
    return new Response(null, { status: 101, webSocket: client } as ResponseInit);
  }
  private others(ws: WebSocket, msg: string) { for (const w of this.state.getWebSockets()) if (w !== ws) { try { w.send(msg); } catch { /* closing */ } } }
  async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer) {
    const me = (ws as WSX).deserializeAttachment() as Who; if (!me || typeof data !== 'string' || data.length > 12000) return;
    if (!this.host) this.pickHost();   // (woke from sleep: memory was cleared)
    const now = Date.now(); if (now - me.win > 1000) { me.win = now; me.n = 0; }
    if (++me.n > 20) return;   // at most 20 messages a second
    let m: Record<string, unknown>; try { m = JSON.parse(data); } catch { return; }
    if (m.t === 'p') {   // where I am / what I look like
      const num = (v: unknown, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));
      const p = { x: num(m.x, 0, 4000), y: num(m.y, 0, 4000), d: num(m.d, 0, 7), f: String(m.f ?? 'hero').slice(0, 8), mv: m.mv ? 1 : 0, hp: num(m.hp, 0, 100), a: num(m.a, 0, 3), r: String(m.r ?? '').slice(0, 8), lv: num(m.lv, 1, 999) };
      me.p = p; (ws as WSX).serializeAttachment(me);
      this.others(ws, JSON.stringify({ t: 'p', id: me.id, name: me.name, ...p }));
    } else if (m.t === 'hit') {   // swing / skill (for the animation others see)
      this.others(ws, JSON.stringify({ t: 'hit', id: me.id, k: String(m.k ?? 'attack').slice(0, 12), d: Math.max(0, Math.min(7, Number(m.d) || 0)) }));
    } else if (m.t === 'ms' && me.id === this.host && Array.isArray(m.a)) {   // the host's monsters: where they are
      const seen = new Set<number>(), out: unknown[] = [];
      for (const e of (m.a as unknown[][]).slice(0, 160)) {
        const sid = Number(e[0]), max = Math.max(1, Number(e[10]) || 1); if (!sid) continue; seen.add(sid);
        let r = this.mons.get(sid); if (!r) { r = { hp: max, max, alive: true, boss: !!e[3], dmg: {} }; this.mons.set(sid, r); }
        if (r.alive) out.push([...e.slice(0, 11), Math.max(0, Math.round(r.hp))]);
      }
      for (const sid of [...this.mons.keys()]) if (!seen.has(sid)) this.mons.delete(sid);
      this.others(ws, JSON.stringify({ t: 'ms', a: out }));
    } else if (m.t === 'dmg') {   // I hit a monster: the room takes the HP off (no more than this hero could deal)
      const r = this.mons.get(Number(m.sid)); if (!r || !r.alive) return;
      const lv = Math.max(1, Math.min(999, Number((me.p as { lv?: number } | undefined)?.lv) || 1)), cap = (lv * 30 + 100) * 10;   // damage per second, generous
      me.bud = Math.min(cap * 4, me.bud + (now - me.budT) / 1000 * cap); me.budT = now;
      const n = Math.max(0, Math.min(Math.round(Number(m.n) || 0), me.bud)); if (!n) { (ws as WSX).serializeAttachment(me); return; }
      me.bud -= n; (ws as WSX).serializeAttachment(me);
      r.hp -= n; r.dmg[me.id] = (r.dmg[me.id] ?? 0) + n;
      const all = this.state.getWebSockets();
      const send = (o: unknown) => { const t = JSON.stringify(o); for (const w of all) { try { w.send(t); } catch { /* closing */ } } };
      send({ t: 'mhp', sid: Number(m.sid), hp: Math.max(0, Math.round(r.hp)), by: me.id });
      if (r.hp <= 0) {   // dead: everyone's share of the damage (each one's reward is their own)
        r.alive = false; const sh: Record<string, number> = {};
        for (const [k, v] of Object.entries(r.dmg)) sh[k] = Math.round(v / r.max * 1000) / 1000;
        send({ t: 'mdead', sid: Number(m.sid), sh });
      }
    } else if (m.t === 'matk' && me.id === this.host) {   // a monster (moved by the host) swings at another player
      const to = String(m.to ?? ''), msg = JSON.stringify({ t: 'matk', sid: Number(m.sid), k: String(m.k ?? 'hit').slice(0, 8) });
      for (const w of this.state.getWebSockets(to)) { try { w.send(msg); } catch { /* closing */ } }
    } else if (m.t === 'c') {   // chat: one line every 2 seconds, filtered
      if (now - me.chatT < 2000) return; me.chatT = now; (ws as WSX).serializeAttachment(me);
      const text = cleanChat(String(m.text ?? '')); if (!text) return;
      const msg = JSON.stringify({ t: 'c', id: me.id, name: me.name, text });
      for (const w of this.state.getWebSockets()) { try { w.send(msg); } catch { /* closing */ } }
    }
  }
  async webSocketClose(ws: WebSocket) {
    const me = (ws as WSX).deserializeAttachment() as Who; if (me) this.others(ws, JSON.stringify({ t: 'bye', id: me.id }));
    try { ws.close(); } catch { /* already */ }
    if (me && me.id === this.host) { this.host = ''; this.pickHost(ws); }
  }
  async webSocketError(ws: WebSocket) { await this.webSocketClose(ws); }
}
