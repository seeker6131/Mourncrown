// Mourncrown game server — Cloudflare Worker + D1 + Durable Objects (free plan). Deployed by tools/deploy_server.py.
import { handlers, useMem, newMem, type Mem } from '../src/server/handlers';
import { STAGES, WILD, stageOf, scaleStats } from '../src/world/stages';
import { MONSTERS, type MonsterKind } from '../src/data/monsters';
import { MapSim, mapOfRoom, gridOk, WB, type Grid, type SimPlayer } from '../src/server/mapSim';
import { itemDef, ITEMS } from '../src/data/items';
import { invSize, type GameState } from '../src/core/state';
import { addItem } from '../src/systems/inventory';
import { MARKET_FEE, type Listing } from '../src/systems/market';
import { startNewGame } from '../src/core/save';
import { grantAdminKit } from '../src/systems/adminKit';
import { goalProgress, rivals, type GuildState, rivalOf, raidedBy, weekOf, hallLv, type RaidHit, type Rival } from '../src/systems/guild';
import { dayKey } from '../src/systems/daily';
import { grantCbt } from '../src/systems/cbtGift';
import { ensureHomeVillage, homeFix } from '../src/systems/settlement';
import { addMail, takeMailAll, cleanGift, giftText, mailOf, type Gift } from '../src/systems/mail';
import { CBT_ACTIVE, cbtGot } from '../src/systems/cbtGift';
import { GUILD_MAX } from '../src/data/guild';
import { packOf, packDiamonds, qrCheck, qrWithAmount, slipVerdict, SLIP_PER_HOUR, type SlipData } from '../src/systems/topup';
import { grantDiamonds, grantVip } from '../src/systems/premium';
import { charList, createChar, switchChar } from '../src/systems/chars';
import { isRaid } from '../src/world/stages';
import { TOWN_BLDS, TOWN_NAME, setTown, repairNeed, repairPoints, repairProgress, isRepaired, type TownRow, type TownBld } from '../src/systems/town';
import { RAID_SECS, RAID_MIN_KILLS, raidChest, nextRaid, type RaidPlan } from '../src/systems/townRaid';
import { gainExp } from '../src/systems/stats';
import type { RaidRun } from '../src/server/mapSim';
// Step 1 (now): accounts (a guest account per device, Google login links it so any device loads the same hero) and the
// save kept on the server. ⚠️ The save is still WRITTEN by the game on the player's device — the server stores it but does
// not yet decide the rules; step 2 moves src/server/handlers.ts here (docs/ONLINE_RISKS.md).
interface D1Result<T> { results: T[] }
interface D1Stmt { bind(...v: unknown[]): D1Stmt; first<T>(): Promise<T | null>; run(): Promise<unknown>; all<T>(): Promise<D1Result<T>> }
interface DOState { acceptWebSocket(ws: WebSocket, tags?: string[]): void; getWebSockets(tag?: string): WebSocket[]; waitUntil?(p: Promise<unknown>): void }
interface DONamespace { idFromName(n: string): unknown; get(id: unknown): { fetch(r: Request): Promise<Response> } }
interface Env { DB: { prepare(sql: string): D1Stmt; batch(list: D1Stmt[]): Promise<unknown> }; GOOGLE_CLIENT_ID?: string; ADMINS?: string; MAX_ONLINE?: string; DAY_HOURS?: string; THUNDER_API_KEY?: string; THUNDER_URL?: string; ROOM: DONamespace; PLAYER: DONamespace; GUILD: DONamespace }
declare const WebSocketPair: { new(): { 0: WebSocket; 1: WebSocket } };
type WSX = WebSocket & { serializeAttachment(v: unknown): void; deserializeAttachment(): unknown; accept?: () => void };

/** small settings kept in D1 (the top-up QR, open / closed) */
async function kvGet(env: Env, k: string) { return (await env.DB.prepare('SELECT v FROM kv WHERE k = ?').bind(k).first<{ v: string }>())?.v ?? ''; }
/** 🏘 the central buildings + the next raid (D1), read at most every 20 s per server copy (shared by its objects) */
let townC: { at: number; rows: TownRow[]; plan: RaidPlan | null } = { at: 0, rows: [], plan: null };
async function townInfo(env: Env, fresh = false) {
  const now = Date.now();
  if (fresh || now - townC.at > 20000) {
    try {
      const rows = (await env.DB.prepare('SELECT bid, broken, at, donated, need, donors FROM town').all<TownRow & { donors: string | null }>()).results;
      const pv = await kvGet(env, 'raid_plan'); let set: RaidPlan | null = null; try { set = pv ? JSON.parse(pv) : null; } catch { set = null; }
      const plan = nextRaid(now, set);   // (the daily 12:00 / 18:00 / 21:00 raid, or a time the admin set)
      townC = { at: now, rows, plan };
    } catch { townC.at = now - 10000; }   // (the database is busy: try again in 10 s)
    setTown(townC.rows, now);
  }
  return townC;
}
async function kvSet(env: Env, k: string, v: string) { await env.DB.prepare('INSERT INTO kv (k, v, at) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, at = excluded.at').bind(k, v, Date.now()).run(); }
/** a paid slip → the player's diamonds (the Player object skips a ref it already has) → the record says 'ok' */
async function payCredit(env: Env, id: string, ref: string, dia: number, thb: number, pack: string) {
  try {
    const r = await env.PLAYER.get(env.PLAYER.idFromName(id)).fetch(new Request('https://p/topup?id=' + id, { method: 'POST', body: JSON.stringify({ ref, dia, thb, pack }) }));
    if (!(await r.json() as { ok?: boolean }).ok) throw new Error('credit');
    await env.DB.prepare("UPDATE payments SET status = 'ok' WHERE ref = ?").bind(ref).run(); return true;
  } catch { await flag(env, id, 'pay:credit', `${ref} ${pack} ${dia}💎 — not given yet (back office → 💳 → ส่งเพชรอีกครั้ง)`); return false; }
}

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

/** the account a device's token belongs to: the account's first device (accounts.token_hash) or any device that signed
 *  in with Google later (sessions) — several devices stay signed in at once (a new sign-in no longer logs the others out) */
async function byToken(env: Env, t: string) {
  if (!t || t.length < 32 || t.length > 128) return null;
  return env.DB.prepare('SELECT id, google_sub, name FROM accounts WHERE banned = 0 AND (token_hash = ?1 OR id = (SELECT id FROM sessions WHERE token_hash = ?1))').bind(await sha(t)).first<{ id: string; google_sub: string | null; name: string | null }>();
}
/** the money cap (director, server/cf.json limits): at most MAX_ONLINE players at once and DAY_HOURS player-hours a day
 *  (Cloudflare has no spending limit of its own). Someone already playing always gets back in; the admin always does. */
async function gate(env: Env, id: string): Promise<{ ok: boolean; why?: string; n?: number; max?: number }> {
  if ((env.ADMINS ?? '').split(',').includes(id)) return { ok: true };
  const max = Number(env.MAX_ONLINE) || 0, hours = Number(env.DAY_HOURS) || 0; if (!max && !hours) return { ok: true };
  try { return await (await env.ROOM.get(env.ROOM.idFromName('chat-world')).fetch(new Request('https://r/gate', { method: 'POST', body: JSON.stringify({ id, max, hours }) }))).json() as { ok: boolean; why?: string }; }
  catch { return { ok: true }; }   // (the counter cannot answer: let them in)
}
/** a refused game socket: it opens, says why, and closes (4002 = the cap; the game waits a minute before trying again) */
function refuseWs(g: { why?: string; n?: number; max?: number }) {
  const pair = new WebSocketPair(), client = pair[0], server = pair[1] as WSX;
  server.accept?.(); server.send(JSON.stringify({ t: 'full', why: g.why ?? 'full', n: g.n ?? 0, max: g.max ?? 0 })); server.close(4002, 'cap');
  return new Response(null, { status: 101, webSocket: client } as ResponseInit);
}
async function who(req: Request, env: Env) {
  const a = await byToken(env, req.headers.get('x-mc-token') ?? '');
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
        const ip = req.headers.get('CF-Connecting-IP') ?? '', ipHash = await sha('mc:' + ip);
        const n = ip ? await env.DB.prepare('SELECT COUNT(*) AS n FROM accounts WHERE ip_hash = ? AND created > ?').bind(ipHash, Date.now() - 3600_000).first<{ n: number }>() : null;   // (Cloudflare always names the IP; only a local test copy has none)
        if ((n?.n ?? 0) >= NEW_PER_HOUR) return json(req, { error: 'rate' }, 429);
        return json(req, await newAccount(env, ipHash, null));
      }

      if (path === '/auth/google' && req.method === 'POST') {
        const body = await req.json().catch(() => ({})) as { credential?: string };
        const sub = await googleSub(env, body.credential ?? ''); if (!sub) return json(req, { error: 'google' }, 401);
        const linked = await env.DB.prepare('SELECT id, banned FROM accounts WHERE google_sub = ?').bind(sub).first<{ id: string; banned: number }>();
        if (linked?.banned) return json(req, { error: 'banned' }, 403);
        if (linked) {   // this Google account already has a hero: this device signs in to it (a new session token for this device)
          const token = rand(32);
          const now = Date.now();
          await env.DB.prepare('INSERT INTO sessions (token_hash, id, at) VALUES (?, ?, ?)').bind(await sha(token), linked.id, now).run();
          await env.DB.prepare('DELETE FROM sessions WHERE id = ?1 AND token_hash NOT IN (SELECT token_hash FROM sessions WHERE id = ?1 ORDER BY at DESC LIMIT 5)').bind(linked.id).run();   // (the 5 newest devices)
          await env.DB.prepare('UPDATE accounts SET seen = ? WHERE id = ?').bind(now, linked.id).run();
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

      // sign out on this device: its key stops working (the hero stays with the account; the other devices stay signed in)
      if (path === '/auth/logout' && req.method === 'POST') {
        const t = req.headers.get('x-mc-token') ?? '', me = await who(req, env); if (!me) return json(req, { ok: true });
        const h = await sha(t);
        await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(h).run();
        await env.DB.prepare('UPDATE accounts SET token_hash = ? WHERE id = ? AND token_hash = ?').bind(await sha(rand(32)), me.id, h).run();   // (the first device's key: replaced by one nobody has)
        return json(req, { ok: true });
      }
      // the player's own game on the server (Durable Object): every valuable action runs here
      if (path === '/play') {
        if (req.headers.get('Upgrade') !== 'websocket') return json(req, { error: 'play' }, 400);
        const t = url.searchParams.get('t') ?? '';
        const a = await byToken(env, t);
        if (!a) return new Response('auth', { status: 401 });
        const g = await gate(env, a.id); if (!g.ok) return refuseWs(g);
        const u = new URL(req.url); u.pathname = '/ws'; u.search = ''; u.searchParams.set('id', a.id);
        return env.PLAYER.get(env.PLAYER.idFromName(a.id)).fetch(new Request(u.toString(), req));
      }
      // a map room (Durable Object): see the other players in this map and talk (WebSocket; the token rides in the URL
      // because a browser cannot set headers on a WebSocket)
      if (path.startsWith('/room/')) {
        const room = path.slice(6).replace(/^m300b\d/, 'm300');   // (⚔ the raid is ONE room for every level — a game still on the level-band version joins it too)
        if (!/^[a-z0-9-]{1,32}$/.test(room) || room.startsWith('chat') || req.headers.get('Upgrade') !== 'websocket') return json(req, { error: 'room' }, 400);   // (chat channels: /chat only)
        const t = url.searchParams.get('t') ?? '';
        const a = await byToken(env, t);
        if (!a) return new Response('auth', { status: 401 });
        const g = await gate(env, a.id); if (!g.ok) return refuseWs(g);
        const u = new URL(req.url); u.search = ''; u.searchParams.set('id', a.id); u.searchParams.set('name', a.name ?? ''); u.searchParams.set('room', room);
        return env.ROOM.get(env.ROOM.idFromName(room)).fetch(new Request(u.toString(), req));
      }
      // 🟢 how many are playing now (the small counter at the top of the screen)
      if (path === '/online') return json(req, await (await env.ROOM.get(env.ROOM.idFromName('chat-world')).fetch(new Request('https://r/count'))).json());
      // 👹 roaming bosses alive now (map-select screen; no login needed)
      if (path === '/bosses') return json(req, { list: await (await env.ROOM.get(env.ROOM.idFromName('chat-world')).fetch(new Request('https://r/bosslist'))).json() });
      // 💬 world chat / guild chat (WebSocket): the world from Lv5 (keeps throwaway spam accounts out), a guild only for its members
      if (path === '/chat/world' || path === '/chat/guild') {
        if (req.headers.get('Upgrade') !== 'websocket') return json(req, { error: 'chat' }, 400);
        const t = url.searchParams.get('t') ?? '';
        const a = await byToken(env, t);
        if (!a) return new Response('auth', { status: 401 });
        const info = await (await env.PLAYER.get(env.PLAYER.idFromName(a.id)).fetch(new Request('https://p/gid?id=' + a.id))).json() as { gid: string | null; lv: number };
        let room = 'chat-world';
        if (path === '/chat/guild') { if (!info.gid) return new Response('guild', { status: 403 }); room = 'chat-g-' + String(info.gid).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24); }
        else if (info.lv < 5) return new Response('level', { status: 403 });
        const u = new URL(req.url); u.search = ''; u.searchParams.set('id', a.id); u.searchParams.set('name', a.name ?? ''); u.searchParams.set('room', room);
        return env.ROOM.get(env.ROOM.idFromName(room)).fetch(new Request(u.toString(), req));
      }

      const me = await who(req, env);
      if (!me) return json(req, { error: 'auth' }, 401);

      if (path === '/me') return json(req, { id: me.id, google: !!me.google_sub, name: me.name, admin: (env.ADMINS ?? '').split(',').includes(me.id) });

      // 💳 top-up (src/systems/topup.ts): the director's bank QR with the price written in → the player pays and uploads the slip →
      // Thunder checks it (to the registered account, the amount, not used before) → diamonds. Admin-only until opened in the back office.
      if (path === '/pay/qr' || path === '/pay/slip') {
        const admin = (env.ADMINS ?? '').split(',').includes(me.id);
        if (!admin && (await kvGet(env, 'pay_open')) !== '1') return json(req, { error: 'closed' }, 403);
        const qr = await kvGet(env, 'pay_qr'); if (!qr || !env.THUNDER_API_KEY) return json(req, { error: 'noqr' }, 503);
        const first = !(await env.DB.prepare("SELECT 1 AS x FROM payments WHERE id = ? AND status = 'ok' AND pack LIKE 'd%' LIMIT 1").bind(me.id).first());   // (the first diamond top-up doubles; a VIP card does not use it up)
        if (path === '/pay/qr') {
          const p = packOf(String(url.searchParams.get('pack') ?? '')); if (!p) return json(req, { error: 'pack' }, 400);
          return json(req, { qr: qrWithAmount(qr, p.thb), thb: p.thb, dia: p.days ? 0 : packDiamonds(p, first), days: p.days, first: first && !p.days });
        }
        if (req.method !== 'POST') return json(req, { error: 'method' }, 405);
        const b = await req.json().catch(() => ({})) as { pack?: string; img?: string };
        const p = packOf(String(b.pack ?? '')); if (!p) return json(req, { error: 'pack' }, 400);
        const img = String(b.img ?? '').replace(/^data:image\/[a-z]+;base64,/, '');
        if (!img) return json(req, { error: 'image' }, 400); if (img.length > 4_000_000) return json(req, { error: 'big' }, 400);
        const now = Date.now(), tries = (await env.DB.prepare("SELECT COUNT(*) AS n FROM pay_try WHERE id = ? AND at > ? AND why <> 'service'").bind(me.id, now - 3600000).first<{ n: number }>())?.n ?? 0;
        if (tries >= (admin ? 30 : SLIP_PER_HOUR)) return json(req, { error: 'limit' }, 429);
        let d: SlipData | null = null, code = '';
        try {
          const r = await fetch((env.THUNDER_URL || 'https://api.thunder.in.th') + '/v2/verify/bank',   // (THUNDER_URL: a local test stand-in only)
             { method: 'POST', headers: { authorization: 'Bearer ' + env.THUNDER_API_KEY, 'content-type': 'application/json' }, body: JSON.stringify({ base64: img, matchAccount: true, matchAmount: p.thb, checkDuplicate: true }) });
          const j = await r.json().catch(() => ({})) as { data?: SlipData; error?: { code?: string }; code?: string; message?: string };
          if (r.ok) d = j.data ?? null;
          else { code = String(j.error?.code ?? j.code ?? j.message ?? 'http' + r.status).slice(0, 60); if (/duplicate/i.test(code)) d = { isDuplicate: true, rawSlip: { transRef: 'dup' } }; }
        } catch { code = 'network'; }
        const IMG = /IMAGE|SLIP_NOT_FOUND|SLIP_PENDING|invalid_payload|VALIDATION/i;
        const v = d ? slipVerdict(d, p.thb, now) : { ok: false as const, why: IMG.test(code) ? 'image' : 'service' };
        const why = v.ok ? 'ok' : v.why;
        await env.DB.prepare('INSERT INTO pay_try (id, at, pack, why, code) VALUES (?, ?, ?, ?, ?)').bind(me.id, now, p.id, why, code || null).run();
        if (why === 'service') await flag(env, me.id, 'pay:service', code);
        if (!v.ok) return json(req, { error: v.why }, 400);
        const dia = p.days ? 0 : packDiamonds(p, first);
        const ins = await env.DB.prepare("INSERT OR IGNORE INTO payments (ref, id, pack, thb, dia, at, status) VALUES (?, ?, ?, ?, ?, ?, 'paid')").bind(v.ref, me.id, p.id, v.thb, dia, now).run() as { meta?: { changes?: number } };
        if (!ins.meta?.changes) return json(req, { error: 'dup' }, 400);   // (our own record: the same slip twice, even if Thunder missed it)
        const out = await payCredit(env, me.id, v.ref, dia, v.thb, p.id);
        return out ? json(req, { ok: true, dia, days: p.days, first: first && !p.days }) : json(req, { error: 'credit' }, 500);
      }

      // the player's name: set once (changing it later is a support / shop matter), unique ignoring case
      // 🚩 a player reports someone's chat line: kept for the admin; 3 different players in a day = a day without chat
      if (path === '/report' && req.method === 'POST') {
        const b = await req.json().catch(() => ({})) as { target?: string; text?: string; room?: string };
        const target = String(b.target ?? '').slice(0, 40), now = Date.now(), day = now - 86400000;
        if (!target || target === me.id) return json(req, { error: 'target' }, 400);
        if (!(await env.DB.prepare('SELECT 1 FROM accounts WHERE id = ?').bind(target).first())) return json(req, { error: 'target' }, 400);
        const mine = await env.DB.prepare('SELECT COUNT(*) AS n, SUM(target = ?) AS same FROM reports WHERE by_id = ? AND at > ?').bind(target, me.id, day).first<{ n: number; same: number }>();
        if ((mine?.same ?? 0) > 0) return json(req, { ok: true, again: true });   // (already reported today)
        if ((mine?.n ?? 0) >= 10) return json(req, { error: 'limit' }, 429);
        await env.DB.prepare('INSERT INTO reports (at, by_id, target, room, text) VALUES (?, ?, ?, ?, ?)').bind(now, me.id, target, String(b.room ?? '').slice(0, 32), String(b.text ?? '').slice(0, 120)).run();
        const by = await env.DB.prepare('SELECT COUNT(DISTINCT by_id) AS n FROM reports WHERE target = ? AND at > ?').bind(target, day).first<{ n: number }>();
        const muted = (by?.n ?? 0) >= 3;
        if (muted) await env.DB.prepare('UPDATE accounts SET muted_until = ? WHERE id = ? AND muted_until < ?').bind(now + 86400000, target, now + 86400000).run();
        return json(req, { ok: true });
      }
      // (admin) the latest reports: who, about whom, what was said
      // 👑 the back office (public/admin.html): everything about the game, for the admin accounts only (server/cf.json admins)
      if (path.startsWith('/admin/')) {
        if (!(env.ADMINS ?? '').split(',').includes(me.id)) return json(req, { error: 'admin' }, 403);
        const DB = env.DB, now = Date.now(), day = now - 86400000, cw = env.ROOM.get(env.ROOM.idFromName('chat-world'));
        const one = async <T>(sql: string, ...a: unknown[]) => (await DB.prepare(sql).bind(...a).first<T>()) as T;
        const all = async <T>(sql: string, ...a: unknown[]) => (await DB.prepare(sql).bind(...a).all<T>()).results;
        // test accounts (the AI's checks — tutorial skipped with tut 99, made by a script, or a level set by a test button with no play
        // time; never a Google account): hidden from the counts and lists so the numbers are real players
        const TEST = "(a.google_sub IS NULL AND (json_extract(s.data,'$.tut') = 99 OR json_extract(s.data,'$.tut') IS NULL OR (CAST(json_extract(s.data,'$.level') AS INTEGER) >= 9 AND COALESCE(json_extract(s.data,'$.playTime'),0) < 120)))";
        const REAL = `s.id IS NOT NULL AND NOT ${TEST}`, PLAYED = `${REAL} AND (a.google_sub IS NOT NULL OR COALESCE(json_extract(s.data,'$.playTime'),0) >= 120)`;
        const pick = "a.id, a.name, a.google_sub IS NOT NULL AS google, a.created, a.seen, a.banned, a.muted_until, json_extract(s.data,'$.level') AS lv, json_extract(s.data,'$.cls') AS cls, json_extract(s.data,'$.tier') AS tier, json_extract(s.data,'$.gold') AS gold, json_extract(s.data,'$.diamonds') AS diamonds, json_extract(s.data,'$.vipUntil') AS vip, s.size";
        if (path === '/admin/overview') {
          const on = await (await cw.fetch(new Request('https://r/onlinelist'))).json() as { ids: string[]; h: number };
          const ids = on.ids.slice(0, 200), who = ids.length ? await all<Record<string, unknown>>(`SELECT ${pick} FROM accounts a LEFT JOIN saves s ON s.id = a.id WHERE a.id IN (${ids.map(() => '?').join(',')})`, ...ids) : [];
          const bosses = await (await cw.fetch(new Request('https://r/bosslist'))).json();
          const n = async (sql: string, ...a: unknown[]) => Number((await one<{ n: number }>(sql, ...a))?.n ?? 0);
          return json(req, {
            now, online: on.ids.length, hoursToday: on.h, limits: { maxOnline: Number(env.MAX_ONLINE) || 0, dayHours: Number(env.DAY_HOURS) || 0 }, who, bosses,
            accounts: await n(`SELECT COUNT(*) AS n FROM accounts a LEFT JOIN saves s ON s.id = a.id WHERE ${REAL}`), played: await n(`SELECT COUNT(*) AS n FROM accounts a LEFT JOIN saves s ON s.id = a.id WHERE ${PLAYED}`),
            google: await n('SELECT COUNT(*) AS n FROM accounts WHERE google_sub IS NOT NULL'),
            tests: await n(`SELECT COUNT(*) AS n FROM accounts a JOIN saves s ON s.id = a.id WHERE ${TEST}`), nosave: await n('SELECT COUNT(*) AS n FROM accounts a LEFT JOIN saves s ON s.id = a.id WHERE s.id IS NULL'),
            newToday: await n(`SELECT COUNT(*) AS n FROM accounts a LEFT JOIN saves s ON s.id = a.id WHERE a.created > ? AND ${REAL}`, day), activeToday: await n(`SELECT COUNT(*) AS n FROM accounts a LEFT JOIN saves s ON s.id = a.id WHERE a.seen > ? AND ${PLAYED}`, day),
            banned: await n('SELECT COUNT(*) AS n FROM accounts WHERE banned = 1'), guilds: await n('SELECT COUNT(*) AS n FROM guilds'),
            market: await n("SELECT COUNT(*) AS n FROM market WHERE status = 'open' AND until > ?", now), reports: await n('SELECT COUNT(*) AS n FROM reports WHERE at > ?', day),
            flags: await n('SELECT COUNT(*) AS n FROM flags WHERE at > ?', day),
          });
        }
        if (path === '/admin/econ') {   // 💰 the economy: what there is now, where gold comes from / goes, who earns, market prices
          const days = Math.max(1, Math.min(30, Number(url.searchParams.get('days')) || 7)), thai = (t: number) => new Date(t + 7 * 3600000).toISOString().slice(0, 10);
          const today = thai(now), since = thai(now - (days - 1) * 86400000), prevSince = thai(now - (2 * days - 1) * 86400000);
          const adm = (env.ADMINS ?? '').split(',').filter(Boolean), noAdm = adm.length ? ` AND a.id NOT IN (${adm.map(() => '?').join(',')})` : '';
          const W = `a.id = e.id ${noAdm} AND NOT ${TEST}`, J = 'FROM econ e JOIN accounts a ON a.id = e.id LEFT JOIN saves s ON s.id = e.id';
          // what the real players hold now → today's snapshot (the trend: does gold pile up?)
          const held = await all<{ id: string; name: string; gold: number; dia: number; wood: number; stone: number; food: number; items: number }>(`SELECT a.id, a.name, COALESCE(json_extract(s.data,'$.gold'),0) AS gold, COALESCE(json_extract(s.data,'$.diamonds'),0) AS dia, COALESCE(json_extract(s.data,'$.res.wood'),0) AS wood, COALESCE(json_extract(s.data,'$.res.stone'),0) AS stone, COALESCE(json_extract(s.data,'$.res.food'),0) AS food, COALESCE(json_array_length(s.data,'$.inventory'),0) AS items FROM accounts a JOIN saves s ON s.id = a.id WHERE ${PLAYED}${noAdm}`, ...adm);
          const sum = (k: 'gold' | 'dia' | 'wood' | 'stone' | 'food' | 'items') => held.reduce((t, r) => t + (Number(r[k]) || 0), 0);
          const golds = held.map(r => Number(r.gold) || 0).sort((x, y) => x - y), med = golds.length ? golds[Math.floor(golds.length / 2)] : 0;
          await DB.prepare('INSERT INTO econ_snap (day, at, players, gold, dia, wood, stone, food, med_gold, items) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(day) DO UPDATE SET at = excluded.at, players = excluded.players, gold = excluded.gold, dia = excluded.dia, wood = excluded.wood, stone = excluded.stone, food = excluded.food, med_gold = excluded.med_gold, items = excluded.items')
            .bind(today, now, held.length, sum('gold'), sum('dia'), sum('wood'), sum('stone'), sum('food'), med, sum('items')).run();
          const F = 'SUM(e.g_in) AS g_in, SUM(e.g_out) AS g_out, SUM(e.d_in) AS d_in, SUM(e.d_out) AS d_out, SUM(e.wood) AS wood, SUM(e.stone) AS stone, SUM(e.food) AS food, SUM(e.n) AS n, COUNT(DISTINCT e.id) AS who';
          const bySrc = await all(`SELECT e.src, ${F} ${J} WHERE e.day >= ? AND ${W} GROUP BY e.src ORDER BY SUM(e.g_in) + SUM(e.g_out) DESC`, since, ...adm);
          const byDay = await all(`SELECT e.day, ${F} ${J} WHERE e.day >= ? AND ${W} GROUP BY e.day ORDER BY e.day`, thai(now - 29 * 86400000), ...adm);
          const top = await all<{ id: string; name: string; g_in: number; g_out: number; n: number; pt: number; lv: number }>(`SELECT e.id, a.name, SUM(e.g_in) AS g_in, SUM(e.g_out) AS g_out, SUM(e.n) AS n, json_extract(s.data,'$.playTime') AS pt, json_extract(s.data,'$.level') AS lv ${J} WHERE e.day >= ? AND ${W} GROUP BY e.id ORDER BY SUM(e.g_in) DESC LIMIT 30`, since, ...adm);
          const ids = top.map(t => t.id), mains = ids.length ? await all<{ id: string; src: string; g: number }>(`SELECT id, src, SUM(g_in) AS g FROM econ WHERE day >= ? AND id IN (${ids.map(() => '?').join(',')}) GROUP BY id, src`, since, ...ids) : [];
          const rich = held.slice().sort((x, y) => (Number(y.gold) || 0) - (Number(x.gold) || 0)).slice(0, 10).map(r => ({ id: r.id, name: r.name, gold: r.gold, dia: r.dia }));
          // market prices: this period against the one before (what costs more = inflation on items)
          const sold = await all<{ item: string; price: number; at: number }>("SELECT item, price, at FROM market WHERE status = 'sold' AND at > ?", now - 2 * days * 86400000);
          const mk: Record<string, { n: number; sum: number; pn: number; psum: number }> = {};
          for (const r of sold) { let id = '?'; try { id = JSON.parse(r.item).id; } catch { /* bad row */ } const m = (mk[id] ??= { n: 0, sum: 0, pn: 0, psum: 0 }); if (thai(r.at) >= since) { m.n++; m.sum += r.price; } else { m.pn++; m.psum += r.price; } }
          return json(req, { days, since, today, now: { players: held.length, gold: sum('gold'), dia: sum('dia'), wood: sum('wood'), stone: sum('stone'), food: sum('food'), items: sum('items'), med },
            snaps: await all('SELECT * FROM econ_snap ORDER BY day DESC LIMIT 30'), bySrc, byDay, top: top.map(t => ({ ...t, main: mains.filter(m => m.id === t.id).sort((x, y) => y.g - x.g)[0]?.src ?? '' })), rich,
            market: Object.entries(mk).map(([id, m]) => ({ id, name: ITEMS[id]?.name ?? id, n: m.n, avg: m.n ? Math.round(m.sum / m.n) : 0, pn: m.pn, pavg: m.pn ? Math.round(m.psum / m.pn) : 0 })).sort((x, y) => y.n - x.n).slice(0, 30), prevSince });
        }
        if (path === '/admin/players') {
          const q = (url.searchParams.get('q') ?? '').trim().toLowerCase().slice(0, 32), sort = url.searchParams.get('sort') === 'lv' ? "CAST(json_extract(s.data,'$.level') AS INTEGER) DESC" : 'a.seen DESC';
          const page = Math.max(0, Number(url.searchParams.get('page')) || 0), only = url.searchParams.get('all') === '1' ? 's.id IS NOT NULL' : REAL;   // (all=1: the test accounts too)
          const rows = q ? await all(`SELECT ${pick}, ${TEST} AS test FROM accounts a LEFT JOIN saves s ON s.id = a.id WHERE a.name_key LIKE ? OR a.id = ? ORDER BY ${sort} LIMIT 50 OFFSET ?`, `%${q}%`, q, page * 50)
            : await all(`SELECT ${pick}, ${TEST} AS test FROM accounts a LEFT JOIN saves s ON s.id = a.id WHERE ${only} ORDER BY ${sort} LIMIT 50 OFFSET ?`, page * 50);
          return json(req, { rows });
        }
        if (path === '/admin/player') {
          const id = url.searchParams.get('id') ?? '';
          const acc = await one(`SELECT ${pick} FROM accounts a LEFT JOIN saves s ON s.id = a.id WHERE a.id = ?`, id);
          const save = await one<{ data: string; at: number; rev: number }>('SELECT data, at, rev FROM saves WHERE id = ?', id);
          return json(req, { acc, save: save ? { at: save.at, rev: save.rev, data: JSON.parse(save.data) } : null,
            flags: await all('SELECT at, what, detail FROM flags WHERE id = ? ORDER BY at DESC LIMIT 50', id),
            econ: await all("SELECT src, SUM(g_in) AS g_in, SUM(g_out) AS g_out, SUM(d_in) AS d_in, SUM(d_out) AS d_out, SUM(wood) AS wood, SUM(stone) AS stone, SUM(food) AS food, SUM(n) AS n FROM econ WHERE id = ? AND day >= ? GROUP BY src ORDER BY SUM(g_in) + SUM(g_out) DESC", id, new Date(now + 7 * 3600000 - 6 * 86400000).toISOString().slice(0, 10)),
            reports: await all('SELECT r.at, r.room, r.text, b.name AS by_name FROM reports r LEFT JOIN accounts b ON b.id = r.by_id WHERE r.target = ? ORDER BY r.at DESC LIMIT 50', id),
            market: await all('SELECT id, item, price, status, until, at FROM market WHERE seller = ? ORDER BY at DESC LIMIT 30', id) });
        }
        if (path === '/admin/guilds') return json(req, { rows: await all('SELECT g.id, g.name, g.members, g.hall, g.score, g.week, g.shield, g.at, a.name AS leader_name FROM guilds g LEFT JOIN accounts a ON a.id = g.leader ORDER BY g.score DESC, g.members DESC LIMIT 200') });
        if (path === '/admin/market') return json(req, { rows: await all("SELECT id, seller_name, item, type, rar, price, until, status, buyer, at FROM market ORDER BY at DESC LIMIT 200") });
        if (path === '/admin/flags') return json(req, { rows: await all('SELECT f.at, f.what, f.detail, f.id, a.name FROM flags f LEFT JOIN accounts a ON a.id = f.id ORDER BY f.at DESC LIMIT 200') });
        if (path === '/admin/reports') return json(req, { rows: await all('SELECT r.at, r.room, r.text, r.target, t.name AS target_name, t.muted_until, b.name AS by_name FROM reports r LEFT JOIN accounts t ON t.id = r.target LEFT JOIN accounts b ON b.id = r.by_id ORDER BY r.at DESC LIMIT 200') });
        if (path === '/admin/items') return json(req, { items: Object.values(ITEMS).map(i => ({ id: i.id, name: i.name, type: i.type, rarity: i.rarity, stack: !!i.stack })) });
        // 💳 top-ups: the record, the QR to receive money (uploaded once, kept in D1 — never in the code), open / closed for players
        if (path === '/admin/movehero' && req.method === 'POST') {   // 🔁 a player changed devices without Google: their old hero moves to their new account
          const b = await req.json() as { from?: string; to?: string }, from = String(b.from ?? '').trim(), to = String(b.to ?? '').trim();
          if (!/^[0-9a-f]{24}$/.test(from) || !/^[0-9a-f]{24}$/.test(to) || from === to) return json(req, { error: 'id' }, 400);
          const src = await DB.prepare('SELECT data FROM saves WHERE id = ?').bind(from).first<{ data: string }>(), dst = await DB.prepare('SELECT id FROM accounts WHERE id = ?').bind(to).first<{ id: string }>();
          if (!src || !dst) return json(req, { error: 'missing' }, 404);
          const r = await env.PLAYER.get(env.PLAYER.idFromName(to)).fetch(new Request('https://p/adopt?id=' + to, { method: 'POST', body: src.data }));
          if (!r.ok) return json(req, { error: 'adopt' }, 500);
          await DB.prepare('UPDATE accounts SET banned = 1 WHERE id = ?').bind(from).run();   // (the old copy can never play again: no duplicate hero / items)
          await flag(env, me.id, 'admin:movehero', `${from} -> ${to}`);
          return json(req, { ok: true });
        }
        if (path === '/admin/raid') {   // ⚔ the village raid: plan one (in N minutes) / cancel; the central buildings (fix / break for tests)
          if (req.method === 'POST') {
            const b = await req.json() as { mins?: number; clear?: boolean; bid?: string; act?: string };
            if (b.bid) {
              const bid = String(b.bid); if (!(TOWN_BLDS as readonly string[]).includes(bid)) return json(req, { error: 'bid' }, 400);
              if (b.act === 'break') await DB.prepare('INSERT INTO town (bid, broken, at, donated, need) VALUES (?, 1, ?, 0, ?) ON CONFLICT(bid) DO UPDATE SET broken = 1, at = excluded.at, donated = 0, need = excluded.need, donors = NULL').bind(bid, now, repairNeed(5)).run();
              else await DB.prepare('UPDATE town SET broken = 0 WHERE bid = ?').bind(bid).run();
              await flag(env, me.id, 'admin:town', bid + ' ' + (b.act ?? 'fix'));
            } else if (b.clear) { await kvSet(env, 'raid_plan', ''); await flag(env, me.id, 'admin:raid', 'cancel'); }
            else { const mins = Math.max(0, Math.min(1440, Number(b.mins) || 0)), at = now + Math.max(15000, mins * 60000); await kvSet(env, 'raid_plan', JSON.stringify({ at })); await flag(env, me.id, 'admin:raid', new Date(at).toISOString()); }
          }
          const t = await townInfo(env, true);
          return json(req, { plan: t.plan, rows: t.rows, now });
        }
        if (path === '/admin/ann') {   // 📢 the megaphone: a short line shown in every game (sent with the next heartbeat, ≤ 2 min)
          const r = await cw.fetch(new Request('https://r/ann', req.method === 'POST' ? { method: 'POST', body: await req.text() } : {})); const out = await r.json() as { ann: unknown };
          if (req.method === 'POST') await flag(env, me.id, 'admin:ann', JSON.stringify(out.ann ?? 'cleared').slice(0, 200));
          return json(req, out);
        }
        if (path === '/admin/pay') {
          const q = await kvGet(env, 'pay_qr'), info = q ? qrCheck(q) : null;
          const sum = await one<{ n: number; thb: number }>("SELECT COUNT(*) AS n, COALESCE(SUM(thb),0) AS thb FROM payments WHERE status = 'ok'");
          const today = await one<{ n: number; thb: number }>("SELECT COUNT(*) AS n, COALESCE(SUM(thb),0) AS thb FROM payments WHERE status = 'ok' AND at > ?", day);
          return json(req, { open: (await kvGet(env, 'pay_open')) === '1', key: !!env.THUNDER_API_KEY, qr: info, sum, today,
            rows: await all('SELECT p.ref, p.id, p.pack, p.thb, p.dia, p.at, p.status, a.name FROM payments p LEFT JOIN accounts a ON a.id = p.id ORDER BY p.at DESC LIMIT 200'),
            tries: await all('SELECT t.id, t.at, t.pack, t.why, t.code, a.name FROM pay_try t LEFT JOIN accounts a ON a.id = t.id ORDER BY t.at DESC LIMIT 100') });
        }
        if (path === '/admin/payqr' && req.method === 'POST') {
          const b = await req.json().catch(() => ({})) as { qr?: string }; const q = String(b.qr ?? '').trim().slice(0, 512), info = qrCheck(q);
          if (!info.ok) return json(req, { error: info.why ?? 'format' }, 400);
          await kvSet(env, 'pay_qr', q); await flag(env, me.id, 'admin:payqr', `${info.kind} ...${info.tail}`);
          return json(req, { ok: true, qr: info });
        }
        if (path === '/admin/payopen' && req.method === 'POST') {
          const b = await req.json().catch(() => ({})) as { open?: boolean }; await kvSet(env, 'pay_open', b.open ? '1' : '0');
          await flag(env, me.id, 'admin:payopen', b.open ? 'open' : 'closed'); return json(req, { ok: true, open: !!b.open });
        }
        if (path === '/admin/paycredit' && req.method === 'POST') {   // a checked slip whose diamonds did not arrive: send them again
          const b = await req.json().catch(() => ({})) as { ref?: string };
          const r = await one<{ ref: string; id: string; pack: string; thb: number; dia: number }>("SELECT ref, id, pack, thb, dia FROM payments WHERE ref = ? AND status = 'paid'", String(b.ref ?? ''));
          if (!r) return json(req, { error: 'ref' }, 400);
          return (await payCredit(env, r.id, r.ref, r.dia, r.thb, r.pack)) ? json(req, { ok: true }) : json(req, { error: 'credit' }, 500);
        }
        if (path === '/admin/give' && req.method === 'POST') {   // send gold / wood / stone / food / items to a player (bug compensation) — no diamonds (real money only)
          const b = await req.json().catch(() => ({})) as { id?: string; gold?: number; wood?: number; stone?: number; food?: number; items?: { id: string; qty: number }[]; note?: string };
          const id = String(b.id ?? ''); if (!id || !(await one('SELECT 1 AS x FROM saves WHERE id = ?', id))) return json(req, { error: 'target' }, 400);
          const r = await env.PLAYER.get(env.PLAYER.idFromName(id)).fetch(new Request('https://p/gift?id=' + id, { method: 'POST', body: JSON.stringify(b) }));
          const out = await r.json() as { ok?: boolean; text?: string; error?: string };
          if (out.ok) await flag(env, id, 'admin:give', `${out.text} — by ${me.id}`);
          return json(req, out, out.ok ? 200 : 400);
        }
        if (path === '/admin/mailall') {   // letters to everyone: the list, or a new one (POST) — each player gets it on their next visit
          if (req.method === 'POST') {
            const b = await req.json().catch(() => ({})) as Gift & { title?: string; text?: string; days?: number };
            const title = String(b.title ?? '').trim().slice(0, 40); if (!title) return json(req, { error: 'title' }, 400);
            const days = Math.max(0, Math.min(90, Number(b.days) || 0)), gift = cleanGift(b);
            await DB.prepare('INSERT INTO mail_all (at, title, text, gift, until, by_id) VALUES (?, ?, ?, ?, ?, ?)').bind(now, title, String(b.text ?? '').slice(0, 300), JSON.stringify(gift), days ? now + days * 86400000 : 0, me.id).run();
            return json(req, { ok: true, text: `${title}${giftText(gift) ? ' — ' + giftText(gift) : ''}` });
          }
          return json(req, { rows: await all('SELECT id, at, title, text, gift, until FROM mail_all ORDER BY id DESC LIMIT 100') });
        }
        if (path === '/admin/act' && req.method === 'POST') {   // ban / unban, mute / unmute (the admin's own account is never touched)
          const b = await req.json().catch(() => ({})) as { id?: string; what?: string; hours?: number };
          const id = String(b.id ?? ''); if (!id || (env.ADMINS ?? '').split(',').includes(id)) return json(req, { error: 'target' }, 400);
          if (b.what === 'ban') await DB.prepare('UPDATE accounts SET banned = 1 WHERE id = ?').bind(id).run();
          else if (b.what === 'unban') await DB.prepare('UPDATE accounts SET banned = 0 WHERE id = ?').bind(id).run();
          else if (b.what === 'mute') await DB.prepare('UPDATE accounts SET muted_until = ? WHERE id = ?').bind(now + Math.max(1, Math.min(720, Number(b.hours) || 24)) * 3600000, id).run();
          else if (b.what === 'unmute') await DB.prepare('UPDATE accounts SET muted_until = 0 WHERE id = ?').bind(id).run();
          else return json(req, { error: 'what' }, 400);
          await flag(env, id, 'admin:' + b.what, `by ${me.id}`);
          return json(req, { ok: true });
        }
        return json(req, { error: 'not found' }, 404);
      }
      if (path === '/reports' && (env.ADMINS ?? '').split(',').includes(me.id)) {
        const rows = (await env.DB.prepare('SELECT r.at, r.room, r.text, r.target, t.name AS target_name, t.muted_until, b.name AS by_name FROM reports r LEFT JOIN accounts t ON t.id = r.target LEFT JOIN accounts b ON b.id = r.by_id ORDER BY r.at DESC LIMIT 100').all()).results;
        return json(req, { reports: rows });
      }
      if (path === '/name' && req.method === 'POST') {
        if (me.name) return json(req, { error: 'set', name: me.name }, 409);
        const body = await req.json().catch(() => ({})) as { name?: string };
        const n = cleanName(body.name); if (!n) return json(req, { error: 'bad' }, 400);
        if (await env.DB.prepare('SELECT 1 AS x FROM char_names WHERE name_key = ? AND id <> ?').bind(n.toLowerCase(), me.id).first()) return json(req, { error: 'taken' }, 409);   // (another account's other character)
        try { await env.DB.prepare('UPDATE accounts SET name = ?, name_key = ? WHERE id = ? AND name IS NULL').bind(n, n.toLowerCase(), me.id).run(); }
        catch { return json(req, { error: 'taken' }, 409); }
        return json(req, { name: n });
      }

      // the save lives in the player's object (it writes the database); the game's copy only brings what is not valuable
      if (path === '/save') {
        const stub = env.PLAYER.get(env.PLAYER.idFromName(me.id));
        if (req.method === 'GET') return json(req, await (await stub.fetch(new Request('https://p/save?id=' + me.id))).json());
        if (req.method === 'PUT') {
          const raw = await req.text(); if (raw.length > MAX_SAVE + 200) return json(req, { error: 'size' }, 413);
          const r = await stub.fetch(new Request('https://p/merge?id=' + me.id, { method: 'PUT', body: raw }));
          return json(req, await r.json(), r.status);
        }
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
/** players a room (the system picks the room — the next one when full): monster maps 30, the Deepwild 100 (director), villages 50 */
/** (director "C") the common monsters are each player's own, on their device; the room runs only roaming bosses */
const SOLO_MONSTERS = true;
const roomCap = (room: string) => room === 'chat-world' ? 5000 : room.startsWith('m300') ? 50 : room.startsWith('chat') ? 60 : room.startsWith('w') ? 100 : room.startsWith('m') ? 30 : 50;
// Positions are relayed as they come (the sender is rate-limited), chat is filtered. Uses the hibernation WebSocket
// API so an idle room costs nothing. Monsters are still each player's own (step 3 moves combat here).
interface Who { id: string; room: string; name: string; lv?: number; lvT?: number; p?: Record<string, unknown>; n: number; win: number; chatT: number; join: number; bud: number; budT: number }
const RUDE = ['fuck', 'shit', 'bitch', 'dick', 'เหี้ย', 'ควย', 'สัส', 'เย็ด', 'ระยำ', 'ชาติหมา', 'หี', 'แตด'];
const cleanChat = (t: string) => { let o = t.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 90); for (const w of RUDE) o = o.split(w).join('*'.repeat(w.length)); return o; };
export class Room {
  /** the map's monsters: the room runs them (src/server/mapSim.ts) — no player's game steers them. In memory: a room
   *  that sleeps forgets, and the map fills up again when the players' games send its walls. */
  sim: MapSim | null = null; timer: ReturnType<typeof setInterval> | null = null;
  /** the map's walls as each player's game sent them (hash → grid + who sent it): the most players agree = used */
  grids = new Map<string, { g: Grid; ids: Set<string> }>(); used = ''; askT = new Map<string, number>();
  /** (chat channels) the last lines, for whoever joins */
  hist: { id: string; name: string; text: string; at: number }[] = [];
  constructor(private state: DOState, private env: Env) {}
  private all(skip?: WebSocket) { return this.state.getWebSockets().filter(w => w !== skip).map(w => ({ w, a: (w as WSX).deserializeAttachment() as Who })).filter(x => x.a); }
  private async lvOf(ws: WebSocket, me: Who, now: number) {
    if (!me.lv || now - (me.lvT ?? 0) > 60000) {   // the level from the player's character on the server (not what the game says), once a minute
      try { me.lv = ((await (await this.env.PLAYER.get(this.env.PLAYER.idFromName(me.id)).fetch(new Request('https://p/lv?id=' + me.id))).json()) as { lv: number }).lv; } catch { me.lv = me.lv ?? 1; }
      me.lvT = now; (ws as WSX).serializeAttachment(me);
    }
    return Math.max(1, Math.min(999, me.lv ?? 1));
  }
  private players(): SimPlayer[] {
    return this.all().filter(x => x.a.p).map(x => { const p = x.a.p as { x: number; y: number; hp: number; lv: number }; return { id: x.a.id, x: p.x, y: p.y, hp: p.hp, lv: Math.min(p.lv, x.a.lv ?? p.lv) }; });
  }
  /** the walls most of the players here agree on (a game that sends other walls changes nothing while others disagree) */
  private choose(room: string) {
    const here = new Set(this.all().map(x => x.a.id)); let best = '', n = -1;
    for (const [h, v] of this.grids) { for (const id of [...v.ids]) if (!here.has(id)) v.ids.delete(id); if (!v.ids.size) { if (h !== this.used) this.grids.delete(h); continue; } if (v.ids.size > n || (v.ids.size === n && h === this.used)) { best = h; n = v.ids.size; } }
    if (!best || best === this.used) return;
    this.used = best; const g = this.grids.get(best)!.g;
    if (this.sim) this.sim.grid = g; else {
      this.sim = new MapSim(room, g); this.sim.regular = !SOLO_MONSTERS && !isRaid(this.sim.n);
      if (isRaid(this.sim.n)) this.refreshPlan();
      if (this.wbKeep > Date.now() - WB.life) this.sim.wbAt = this.wbKeep;   // (the room slept: the boss keeps its time)
      this.start();
    }
  }
  private start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.beat(), 200);
  }
  /** tell the whole game (world chat + the boss list on the map-select screen) that a roaming boss came / left / fell */
  private announce(k: 'spawn' | 'leave' | 'dead', name: string, by = '') {
    const n = this.sim?.n ?? 0; if (!n) return;
    this.state.waitUntil?.(this.env.ROOM.get(this.env.ROOM.idFromName('chat-world')).fetch(new Request('https://r/wbnote', { method: 'POST', body: JSON.stringify({ n, k, name, by }) })).catch(() => undefined));
  }
  /** the next roaming boss time, kept in storage so a room that slept still brings the boss on time */
  wbKeep = 0;
  /** monster rewards waiting to be sent, per player: one call every 3 s instead of one per kill (the daily request quota) */
  payQ = new Map<string, unknown[]>(); payT = 0;
  private payNow(pid: string, p: unknown) { return this.env.PLAYER.get(this.env.PLAYER.idFromName(pid)).fetch(new Request('https://p/pay?id=' + pid, { method: 'POST', body: JSON.stringify(p) })); }
  private flushPay() {
    this.payT = Date.now(); if (!this.payQ.size) return;
    const all = [...this.payQ]; this.payQ.clear();
    const go = Promise.allSettled(all.map(([pid, list]) => this.env.PLAYER.get(this.env.PLAYER.idFromName(pid)).fetch(new Request('https://p/payb?id=' + pid, { method: 'POST', body: JSON.stringify({ list }) }))));
    this.state.waitUntil?.(go);
  }
  private beat() {
    const socks = this.state.getWebSockets(); if (!socks.length || !this.sim) { this.flushPay(); if (this.timer) clearInterval(this.timer); this.timer = null; return; }
    const now = Date.now(), ev = this.sim.run(now, this.players());
    if (now - this.payT >= 3000) this.flushPay();
    if (isRaid(this.sim.n)) this.raidBeat(now);
    if (this.sim.wbAt !== this.wbKeep) { this.wbKeep = this.sim.wbAt; this.store.put('wbAt', this.wbKeep).catch(() => undefined); }
    const ms = JSON.stringify({ t: 'ms', a: this.sim.rows(now) });
    for (const w of socks) { try { w.send(ms); } catch { /* closing */ } }
    for (const f of ev.fx) { const t = JSON.stringify({ t: 'mfx', ...f }); for (const w of socks) { try { w.send(t); } catch { /* closing */ } } }
    for (const a of ev.atk) { const t = JSON.stringify({ t: 'matk', sid: a.sid, k: a.k }); for (const w of this.state.getWebSockets(a.to)) { try { w.send(t); } catch { /* closing */ } } }
    for (const b of ev.wb) { const t = JSON.stringify({ t: 'wb', ...b }); for (const w of socks) { try { w.send(t); } catch { /* closing */ } } if (b.k !== 'warn') this.announce(b.k, b.name); }   // a roaming boss came / left
    // nothing to move (the common monsters are on the players' devices): stop ticking, wake a minute before the next boss
    let q = this.sim.quietUntil(now);
    const b = this.sim.boss();   // a roaming boss nobody is near: it stands still; wake when someone comes close (a position / a hit) or when it is due to leave
    if (!q && SOLO_MONSTERS && b && !this.sim.bossNear(now, this.players())) q = Math.min(b.join + WB.idle + 500, now + 60000);
    if (q) { this.flushPay(); if (this.timer) clearInterval(this.timer); this.timer = null; if (q !== Infinity) this.store.setAlarm(Math.max(now + 1000, q)).catch(() => undefined); }
  }
  // ---------------------------------------------------------------- ⚔ the village raid's room (map m300)
  plan: RaidPlan | null = null; planT = 0; rsT = 0;
  /** the planned raid from the database (every 15 s at most); a raid due later wakes the room at its time */
  private refreshPlan() {
    this.planT = Date.now();
    this.state.waitUntil?.(townInfo(this.env).then(t => {
      this.plan = t.plan; const now = Date.now();
      if (this.plan && this.plan.at > now) this.store.setAlarm(this.plan.at).catch(() => undefined);
      else if (this.plan && now < this.plan.at + RAID_SECS * 1000 && this.sim && !this.timer) this.start();
    }).catch(() => undefined));
  }
  private raidBeat(now: number) {
    const sim = this.sim!; if (now - this.planT > 15000) this.refreshPlan();
    const p = this.plan;
    if (p && now >= p.at && now < p.at + RAID_SECS * 1000 && (!sim.raid || sim.raid.at !== p.at)) sim.startRaid(p.at, this.players());
    const r = sim.raid; if (!r) return;
    if (r.done && r.told) return;
    if (now - this.rsT >= 400 || r.done) {   // the buildings' HP and the clock, for every game here
      this.rsT = now; const left = [...sim.mons.values()].filter(m => m.alive).length;
      const t = JSON.stringify({ t: 'rs', at: r.at, end: r.end, b: r.blds.map(b => [b.bid, b.hp, b.max]), n: left, tot: r.total, sp: r.spawned, w: r.wave, done: r.done ? 1 : 0 });
      for (const w of this.state.getWebSockets()) { try { w.send(t); } catch { /* closing */ } }
    }
    if (r.done && !r.told) { r.told = true; this.raidEnd(r); }
  }
  /** the raid is over: tell everyone, break the fallen buildings (server-wide), the defenders' chests, the world chat */
  private raidEnd(r: RaidRun) {
    const names = new Map(this.all().map(x => [x.a.id, x.a.name] as const)), now = Date.now();
    const rank = Object.entries(r.kills).sort((a, b) => b[1] - a[1]), mvp = rank.filter(([, k]) => k >= RAID_MIN_KILLS).slice(0, 3).map(([id]) => id);
    const broken = r.blds.filter(b => b.hp <= 0).map(b => b.bid);
    const t = JSON.stringify({ t: 'rend', won: r.won ? 1 : 0, broken, mvp: mvp.map(id => names.get(id) ?? '?'), kills: r.kills, min: RAID_MIN_KILLS });
    for (const w of this.state.getWebSockets()) { try { w.send(t); } catch { /* closing */ } }
    const DB = this.env.DB, cw = this.env.ROOM.get(this.env.ROOM.idFromName('chat-world'));
    this.state.waitUntil?.((async () => {
      let online = 5; try { online = Number(((await (await cw.fetch(new Request('https://r/count'))).json()) as { n: number }).n) || 5; } catch { /* a guess */ }
      for (const bid of broken) await DB.prepare('INSERT INTO town (bid, broken, at, donated, need) VALUES (?, 1, ?, 0, ?) ON CONFLICT(bid) DO UPDATE SET broken = 1, at = excluded.at, donated = 0, need = excluded.need, donors = NULL').bind(bid, now, repairNeed(online)).run().catch(() => undefined);
      await townInfo(this.env, true).catch(() => undefined);
      await Promise.allSettled(rank.filter(([, k]) => k >= RAID_MIN_KILLS).map(([pid]) => this.env.PLAYER.get(this.env.PLAYER.idFromName(pid)).fetch(new Request('https://p/raidpay?id=' + pid, { method: 'POST', body: JSON.stringify({ mvp: mvp.includes(pid), won: r.won }) }))));
      const top = mvp.map(id => names.get(id) ?? '?').join(', ');
      const text = (r.won ? '🛡 หมู่บ้านกลางต้านมอนบุกได้สำเร็จ!' : '⚔ มอนบุกหมู่บ้านกลางจบแล้ว') + (broken.length ? ` อาคารพัง: ${broken.map(b => TOWN_NAME[b]).join(' ')} — ช่วยกันบริจาคซ่อมได้ที่ 🏘` : ' ไม่มีอาคารพัง!') + (top ? ` • MVP: ${top}` : '');
      await cw.fetch(new Request('https://r/say', { method: 'POST', body: JSON.stringify({ text }) })).catch(() => undefined);
    })());
  }
  /** the boss's time is near: tick again (after a sleep the room has forgotten the map: the games send it again) */
  async alarm() {
    if (!this.state.getWebSockets().length) return;
    if (!this.wbKeep) this.wbKeep = Number(await this.store.get('wbAt').catch(() => 0)) || 0;
    if (this.sim) { if (this.sim.wbAt !== this.wbKeep && this.wbKeep) this.sim.wbAt = this.wbKeep; this.start(); return; }
    const ask = JSON.stringify({ t: 'grid?' }); for (const w of this.state.getWebSockets()) { try { w.send(ask); } catch { /* closing */ } }
  }
  /** (chat-world) roaming bosses alive now, by map — for the map-select screen */
  bosses = new Map<number, { name: string; until: number }>();
  /** (chat-world) who is playing now: account → last sign of life (15 min without one = gone) */
  online = new Map<string, number>(); onlineT = 0;
  /** (chat-world) player-minutes played today (UTC day — Cloudflare's day), kept in storage across restarts */
  use = { day: '', mins: 0 }; useT = 0; useLoaded = false;
  /** 📢 the admin's megaphone (back office): one announcement, shown in every game (handed out with the online count) */
  ann: { id: number; text: string; until: number } | null = null;
  private get store() { return (this.state as unknown as { storage: { get(k: string): Promise<unknown>; put(k: string, v: unknown): Promise<void>; setAlarm(t: number): Promise<void> } }).storage; }
  private async useLoad(now: number) {
    if (!this.useLoaded) {
      this.useLoaded = true; const v = await this.store.get('use').catch(() => null) as { day: string; mins: number } | null; if (v) this.use = v;
      this.ann = await this.store.get('ann').catch(() => null) as typeof this.ann;
      // who is online survives this object going to sleep / a deploy (it lived in memory only: the 🟢 count and the back office
      // showed only those who had said hello since — "online 1" while others walked around)
      const o = await this.store.get('online').catch(() => null) as Record<string, number> | null;
      if (o) for (const [k, t] of Object.entries(o)) if (now - t < 5 * 60000 && !this.online.has(k)) this.online.set(k, t);
    }
    const day = new Date(now).toISOString().slice(0, 10); if (this.use.day !== day) this.use = { day, mins: 0 };
  }
  /** write who is online: at once when someone came / left, else at most once a minute (the storage quota) */
  private saveOnline(now: number, changed: boolean) {
    if (!changed && now - this.onlineT < 60000) return; this.onlineT = now;
    this.store.put('online', Object.fromEntries(this.online)).catch(() => undefined);
  }
  private credit(ms: number, now: number) {
    this.use.mins += ms / 60000;
    if (now - this.useT > 60000) { this.useT = now; this.store.put('use', this.use).catch(() => undefined); }   // (written once a minute at most)
  }
  async fetch(req: Request) {
    const u = new URL(req.url), id = u.searchParams.get('id') ?? '', name = (u.searchParams.get('name') || 'ผู้กล้า#' + id.slice(0, 4)).slice(0, 16);
    if (u.pathname === '/wbnote') {   // (from a map room) a roaming boss came / left / fell: everyone in world chat hears it
      const b = await req.json() as { n: number; k: string; name: string; by?: string }, now = Date.now();
      if (b.k === 'spawn') this.bosses.set(b.n, { name: b.name, until: now + 8 * 60000 }); else this.bosses.delete(b.n);
      const text = b.k === 'spawn' ? `👹 บอสเร่ร่อน "${b.name}" ปรากฏตัวที่แผนที่ ${b.n}! ไปรุมกันเร็ว` : b.k === 'dead' ? `👑 ${b.by} ปราบ "${b.name}" ที่แผนที่ ${b.n} สำเร็จ!` : `💨 "${b.name}" หายไปจากแผนที่ ${b.n} แล้ว`;
      const line = { id: '', name: '📢 ประกาศ', text, at: now };
      this.hist = [...this.hist, line].slice(-100);
      const msg = JSON.stringify({ t: 'c', id: '', name: line.name, text });
      for (const w of this.state.getWebSockets()) { try { w.send(msg); } catch { /* closing */ } }
      return new Response('{}');
    }
    if (u.pathname === '/say') {   // (the raid room) a line for everyone in world chat
      const b = await req.json() as { text: string }, now = Date.now(), text = String(b.text ?? '').slice(0, 240);
      this.hist = [...this.hist, { id: '', name: '📢 ประกาศ', text, at: now }].slice(-100);
      const msg = JSON.stringify({ t: 'c', id: '', name: '📢 ประกาศ', text }); for (const w of this.state.getWebSockets()) { try { w.send(msg); } catch { /* closing */ } }
      return new Response('{}');
    }
    if (u.pathname === '/gate') {   // (the worker) may this player come online now — the money cap
      const b = await req.json() as { id: string; max: number; hours: number }, now = Date.now(); await this.useLoad(now);
      for (const [k, t] of this.online) if (now - t > 5 * 60000) this.online.delete(k);
      if (this.online.has(String(b.id))) return new Response(JSON.stringify({ ok: true }));   // already playing (a reconnect / another map)
      if (b.max && this.online.size >= b.max) return new Response(JSON.stringify({ ok: false, why: 'full', n: this.online.size, max: b.max }));
      if (b.hours && this.use.mins / 60 >= b.hours) return new Response(JSON.stringify({ ok: false, why: 'day' }));
      return new Response(JSON.stringify({ ok: true }));
    }
    if (u.pathname === '/hello' || u.pathname === '/bye') {   // (from a player's object) online / gone
      const b = await req.json() as { id: string }, now = Date.now(); await this.useLoad(now);
      const prev = this.online.get(String(b.id)); if (prev && now - prev < 15 * 60000) this.credit(now - prev, now);   // player-minutes today (the cap)
      const had = this.online.has(String(b.id));
      if (u.pathname === '/hello') this.online.set(String(b.id), now); else this.online.delete(String(b.id));
      if (this.online.size > 20000) this.online.clear();
      let gone = false; for (const [k, t] of this.online) if (now - t > 5 * 60000) { this.online.delete(k); gone = true; }   // (a game says hello every 2 minutes: 5 without one = gone)
      this.saveOnline(now, gone || had !== this.online.has(String(b.id)));
      return new Response(JSON.stringify({ n: this.online.size, ...(this.ann && this.ann.until > now ? { ann: this.ann } : {}) }));
    }
    if (u.pathname === '/ann') {   // (the back office) set / clear the announcement, or read it
      const now = Date.now(); await this.useLoad(now);
      if (req.method === 'POST') { const b = await req.json() as { text?: string; mins?: number }, text = String(b.text ?? '').trim().slice(0, 160), mins = Math.max(0, Math.min(1440, Number(b.mins) || 0));
        this.ann = text && mins ? { id: now, text, until: now + mins * 60000 } : null; await this.store.put('ann', this.ann); }
      return new Response(JSON.stringify({ ann: this.ann && this.ann.until > now ? this.ann : null }));
    }
    if (u.pathname === '/onlinelist') { const now = Date.now(); await this.useLoad(now); for (const [k, t] of this.online) if (now - t > 5 * 60000) this.online.delete(k); return new Response(JSON.stringify({ ids: [...this.online.keys()], h: Math.round(this.use.mins / 6) / 10 })); }   // (the back office)
    if (u.pathname === '/count') { const now = Date.now(); await this.useLoad(now); for (const [k, t] of this.online) if (now - t > 5 * 60000) this.online.delete(k); return new Response(JSON.stringify({ n: this.online.size, h: Math.round(this.use.mins / 6) / 10 })); }
    if (u.pathname === '/bosslist') { const now = Date.now(); return new Response(JSON.stringify([...this.bosses].filter(([, v]) => v.until > now).map(([n, v]) => ({ n, name: v.name, left: v.until - now })))); }
    for (const old of this.state.getWebSockets(id)) { try { old.close(4000, 'again'); } catch { /* gone */ } }   // one connection per player
    const pair = new WebSocketPair(), client = pair[0], server = pair[1] as WSX;
    if (this.all().filter(x => x.a.id !== id).length >= roomCap(u.searchParams.get('room') ?? '')) {   // full: the game moves on to the next room of this map
      (server as unknown as { accept(): void }).accept(); server.close(4001, 'full');
      return new Response(null, { status: 101, webSocket: client } as ResponseInit);
    }
    this.state.acceptWebSocket(server, [id]);
    server.serializeAttachment({ id, room: u.searchParams.get('room') ?? '', name, n: 0, win: Date.now(), chatT: 0, join: Date.now(), bud: 0, budT: Date.now() } as Who);
    if ((u.searchParams.get('room') ?? '').startsWith('chat')) { server.send(JSON.stringify({ t: 'hi', you: id, name, hist: this.hist })); return new Response(null, { status: 101, webSocket: client } as ResponseInit); }
    const others = this.state.getWebSockets().filter(w => w !== server).map(w => (w as WSX).deserializeAttachment() as Who).filter(o => o && o.id !== id && o.p);
    // srv: the room runs this map's monsters (the game sends the map's walls and only shows them)
    server.send(JSON.stringify({ t: 'hi', you: id, name, host: '', srv: 1, solo: SOLO_MONSTERS && !isRaid(mapOfRoom(u.searchParams.get('room') ?? '')) ? 1 : 0, players: others.map(o => ({ id: o.id, name: o.name, ...o.p })) }));
    if (this.sim) { const ms = JSON.stringify({ t: 'ms', a: this.sim.rows(Date.now()) }); try { server.send(ms); } catch { /* closing */ } this.start(); }
    return new Response(null, { status: 101, webSocket: client } as ResponseInit);
  }
  private others(ws: WebSocket, msg: string) { for (const w of this.state.getWebSockets()) if (w !== ws) { try { w.send(msg); } catch { /* closing */ } } }
  async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer) {
    const me = (ws as WSX).deserializeAttachment() as Who; if (!me || typeof data !== 'string' || data.length > 24000) return;
    const now = Date.now(); if (now - me.win > 1000) { me.win = now; me.n = 0; }
    if (++me.n > 20) return;   // at most 20 messages a second
    let m: Record<string, unknown>; try { m = JSON.parse(data); } catch { return; }
    const room = me.room ?? '', shared = mapOfRoom(room) > 0, chat = room.startsWith('chat');
    if (chat && m.t !== 'c') return;   // a chat channel carries chat only
    // (woke from sleep: memory was cleared) ask this game for the map's walls again
    if (shared && !this.sim && m.t !== 'grid' && now - (this.askT.get(me.id) ?? 0) > 3000) { this.askT.set(me.id, now); try { ws.send(JSON.stringify({ t: 'grid?' })); } catch { /* closing */ } }
    if (m.t === 'p') {   // where I am / what I look like
      const num = (v: unknown, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));
      const p = { x: num(m.x, 0, 4000), y: num(m.y, 0, 4000), d: num(m.d, 0, 7), f: String(m.f ?? 'hero').slice(0, 8), mv: m.mv ? 1 : 0, hp: num(m.hp, 0, 100), a: num(m.a, 0, 4), r: String(m.r ?? '').slice(0, 8), lv: num(m.lv, 1, 999), pe: m.pe ? 1 : 0, nc: m.nc ? 1 : 0, sk: m.sk ? 1 : 0, wu: num(m.wu, 0, 2), ...(m.ts !== undefined ? { ts: num(m.ts, 0, 4e9) } : {}) };   // (ts: the sender's clock, for smooth movement)
      me.p = p; (ws as WSX).serializeAttachment(me);
      this.others(ws, JSON.stringify({ t: 'p', id: me.id, name: me.name, ...p }));
      // a sleeping room wakes only for a reason: a boss is due (a missed alarm) or someone came near the standing boss
      // (not on every position — that kept the room awake all the time)
      if (this.sim && !this.timer && ((!SOLO_MONSTERS) || (this.sim.quietUntil(now) === 0 && !this.sim.boss()) || this.sim.bossNear(now, this.players()))) this.start();
    } else if (m.t === 'hit') {   // swing / skill (for the animation others see)
      const sk = typeof m.s === 'string' && /^[a-z0-9_]{1,16}$/.test(m.s) ? m.s : undefined;   // (⚔ the raid: the skill, for its effect + a softer sound on the others' screens)
      this.others(ws, JSON.stringify({ t: 'hit', id: me.id, k: String(m.k ?? 'attack').slice(0, 12), d: Math.max(0, Math.min(7, Number(m.d) || 0)), ...(sk ? { s: sk } : {}) }));
    } else if (m.t === 'grid' && shared) {   // the map's walls from this player's game
      const w = Number(m.w), h = Number(m.h), c = Number(m.c); let bits: Uint8Array;
      try { const bin = atob(String(m.b ?? '')); bits = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bits[i] = bin.charCodeAt(i); } catch { return; }
      const cl = (Array.isArray(m.cl) ? m.cl : []).slice(0, 30).map((q: { x: number; y: number; r: number; boss?: boolean }) => ({ x: Number(q.x) || 0, y: Number(q.y) || 0, r: Math.max(10, Math.min(300, Number(q.r) || 60)), boss: !!q.boss }));
      const gt = m.gate as { x: number; y: number } | undefined, g: Grid = { w, h, c, bits, clear: cl, gate: { x: Number(gt?.x) || 0, y: Number(gt?.y) || 0 } };
      if (!gridOk(g)) return;
      let hs = 2166136261; const key = `${w},${h},${c},${m.b},${JSON.stringify(cl)},${g.gate.x},${g.gate.y}`; for (let i = 0; i < key.length; i++) { hs ^= key.charCodeAt(i); hs = Math.imul(hs, 16777619); }
      const hk = (hs >>> 0).toString(36); for (const v of this.grids.values()) v.ids.delete(me.id);
      const e = this.grids.get(hk) ?? { g, ids: new Set<string>() }; e.ids.add(me.id); this.grids.set(hk, e);
      if (!this.sim && !this.wbKeep) this.wbKeep = Number(await this.store.get('wbAt').catch(() => 0)) || 0;
      this.choose(room);
    } else if (m.t === 'dmg' && this.sim) {   // I hit a monster: the room takes the HP off (no more than this hero could deal)
      const sid = Number(m.sid), r = this.sim.mons.get(sid); if (!r || !r.alive) return;
      if (this.sim.raid && !this.sim.raid.done && this.sim.raid.fallen.has(me.id)) return;   // (⚔ fell in this raid: out until it ends)
      const lv = await this.lvOf(ws, me, now), cap = (lv * 30 + 100) * 10;   // damage per second, generous
      me.bud = Math.min(cap * 4, me.bud + (now - me.budT) / 1000 * cap); me.budT = now;
      const n = Math.max(0, Math.min(Math.round(Number(m.n) || 0), me.bud)); if (!n) { (ws as WSX).serializeAttachment(me); return; }
      me.bud -= n; (ws as WSX).serializeAttachment(me);
      r.hp -= n; r.dmg[me.id] = (r.dmg[me.id] ?? 0) + n; this.sim.hit(sid, me.id, now, this.players());
      if (!this.timer) this.start();
      const all = this.state.getWebSockets();
      const send = (o: unknown) => { const t = JSON.stringify(o); for (const w of all) { try { w.send(t); } catch { /* closing */ } } };
      send({ t: 'mhp', sid, hp: Math.max(0, Math.round(r.hp)), by: me.id });
      if (r.hp <= 0) {   // dead: everyone's share of the damage (each one's reward is their own)
        const sh: Record<string, number> = {};
        for (const [k, v] of Object.entries(r.dmg)) sh[k] = Math.round(v / r.max * 1000) / 1000;
        this.sim.died(sid, now, all.length); this.sim.raidKill(sh);
        send({ t: 'mdead', sid, sh, ...(r.wb ? { wb: 1, killer: me.id, kname: me.name } : {}) });
        if (r.wb) this.announce('dead', r.mob.name, me.name);
        // the server pays: each player with a fair share gets their own reward in their own game on the server
        const n = mapOfRoom(room), need = r.boss ? 0.03 : 0.1;
        if (n) {
          const pays = Object.entries(sh).filter(([, v]) => v >= need).map(([pid, v]) => ({ pid, p: { n, sid, key: r.mob.key, kind: r.mob.kind, boss: r.boss, elite: r.elite, share: v, ...(r.wb ? { wb: true, lv: r.lv, killer: pid === me.id } : {}) } }));
          if (r.wb) await Promise.allSettled(pays.map(({ pid, p }) => this.payNow(pid, p)));   // (a roaming boss: at once — the killer's item)
          else for (const { pid, p } of pays) { const q = this.payQ.get(pid) ?? []; q.push(p); this.payQ.set(pid, q); if (q.length >= 10) this.flushPay(); }
        }
      }
    } else if (m.t === 'c') {   // chat: one line every 2 seconds (the world: every 5), filtered
      if (now - me.chatT < (room === 'chat-world' ? 5000 : 2000)) return; me.chatT = now; (ws as WSX).serializeAttachment(me);
      const text = cleanChat(String(m.text ?? '')); if (!text) return;
      // reported by several players today: no chat for a while (checked on the server, line by line)
      const mu = await this.env.DB.prepare('SELECT muted_until FROM accounts WHERE id = ?').bind(me.id).first<{ muted_until: number }>().catch(() => null);
      if ((mu?.muted_until ?? 0) > now) { try { ws.send(JSON.stringify({ t: 'c', id: '', name: '⚠ ระบบ', text: `คุณถูกปิดแชตชั่วคราว (ถูกรายงานหลายครั้ง) อีก ${Math.ceil(((mu?.muted_until ?? 0) - now) / 3600000)} ชม.` })); } catch { /* closing */ } return; }
      const msg = JSON.stringify({ t: 'c', id: me.id, name: me.name, text });
      if (chat) this.hist = [...this.hist, { id: me.id, name: me.name, text, at: now }].slice(-100);   // (the last 100: the chat window scrolls back through them)
      for (const w of this.state.getWebSockets()) { try { w.send(msg); } catch { /* closing */ } }
    }
  }
  async webSocketClose(ws: WebSocket) {
    const me = (ws as WSX).deserializeAttachment() as Who; if (me) this.others(ws, JSON.stringify({ t: 'bye', id: me.id }));
    try { ws.close(); } catch { /* already */ }
    if (me) { for (const v of this.grids.values()) v.ids.delete(me.id); if (mapOfRoom(me.room ?? '')) this.choose(me.room ?? ''); }
  }
  async webSocketError(ws: WebSocket) { await this.webSocketClose(ws); }
}

// ===== the player's game on the server =====
// Holds the real character: every action the game sends runs the same rules (src/server/handlers.ts) here with the
// server's dice and clock, and the answer carries what changed. What is valuable (level, gold, items, resources,
// buildings, diamonds, VIP...) is written ONLY here; the game's own save can only bring the harmless fields below.
const MARKET = new Set(['marketList', 'marketCancel', 'marketBrowse', 'marketBuy', 'marketHistory']);
/** actions that change the guild itself: run by the guild's own object on the one shared copy (all members see it) */
const GUILD_ACTS = new Set(['guildSync', 'guildUpgrade', 'guildCollect', 'guildFlag', 'guildRole', 'guildKick', 'guildShop', 'guildInvite', 'donate', 'houseBuild', 'houseRepair', 'bldRepair', 'hireGuard', 'dismissGuard', 'defBuild', 'defUpgrade', 'defRepair', 'defRemove', 'seasonClaim', 'raidStart', 'raidEnd', 'warStart', 'warSync', 'warHit', 'warKill', 'warEnd', 'warDone']);
const GUILD_CAP = GUILD_MAX;   // members of a real guild (the village has GUILD_MAX house plots)
/** the CBT gift (src/systems/cbtGift.ts): only the server hands it out */
const CBT = new Set(['cbtClaim']);
const CLIENT_KEYS = new Set(['pos', 'hp', 'mp', 'auto', 'music', 'sfx', 'mapPos', 'map', 'dayTime', 'playTime', 'introSeen', 'outfit', 'prevOutfit', 'look', 'pot', 'farm', 'aura', 'auraOff', 'tut', 'tutBase', 'useTier', 'uiOpt', 'name', 'lootOpt']);
type St = Record<string, unknown>;
interface DOStore { setAlarm(t: number): Promise<void>; getAlarm(): Promise<number | null> }
export class Player {
  st: St | null = null; mem: Mem = newMem(); goalSend: { kind: string; n: number }[] = []; rev = 0; at = 0; dirty = false; loaded = false; id = '';
  constructor(private state: DOState & { storage: DOStore }, private env: Env) {}
  private async load(id: string) {
    if (this.loaded) return; this.id = id;
    const row = await this.env.DB.prepare('SELECT rev, at, data FROM saves WHERE id = ?').bind(id).first<{ rev: number; at: number; data: string }>();
    if (row) { this.st = JSON.parse(row.data); this.rev = row.rev; this.at = row.at; }
    this.loaded = true;
  }
  private async persist() {
    if (!this.dirty || !this.st) return;
    const data = JSON.stringify(this.st), now = Date.now(); this.rev++; this.at = now; this.dirty = false;
    await this.env.DB.prepare('INSERT INTO saves (id, rev, at, size, data) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET rev = excluded.rev, at = excluded.at, size = excluded.size, data = excluded.data').bind(this.id, this.rev, now, data.length, data).run();
  }
  // ---- the money ledger (back office 💰): what each action changed in gold / diamonds / resources, added up by source in
  // memory and written to D1 `econ` (one row per day × player × source) at most every 5 minutes and when the game closes ----
  econQ = new Map<string, number[]>(); econT = Date.now();
  private eSnap(): number[] | null { const s = this.st as { gold?: number; diamonds?: number; res?: { wood?: number; stone?: number; food?: number } } | null; return s ? [Number(s.gold) || 0, Number(s.diamonds) || 0, Number(s.res?.wood) || 0, Number(s.res?.stone) || 0, Number(s.res?.food) || 0] : null; }
  private eAdd(src: string, b: number[] | null) {
    const a = this.eSnap(); if (!a || !b) return;
    const dg = a[0] - b[0], dd = a[1] - b[1], dw = a[2] - b[2], ds = a[3] - b[3], df = a[4] - b[4];
    if (!dg && !dd && !dw && !ds && !df) return;
    const k = src.slice(0, 24), q = this.econQ.get(k) ?? [0, 0, 0, 0, 0, 0, 0, 0];   // gold in, gold out, 💎 in, 💎 out, wood, stone, food (net), times
    if (dg > 0) q[0] += dg; else q[1] -= dg; if (dd > 0) q[2] += dd; else q[3] -= dd; q[4] += dw; q[5] += ds; q[6] += df; q[7]++;
    this.econQ.set(k, q);
  }
  private async eFlush(force = false) {
    if (!this.econQ.size || !this.id || (!force && Date.now() - this.econT < 300000)) return;
    const day = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10), rows = [...this.econQ]; this.econQ.clear(); this.econT = Date.now();   // (the day in Thailand)
    try {
      await this.env.DB.batch(rows.map(([src, q]) => this.env.DB.prepare('INSERT INTO econ (day, id, src, g_in, g_out, d_in, d_out, wood, stone, food, n) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(day, id, src) DO UPDATE SET g_in = g_in + excluded.g_in, g_out = g_out + excluded.g_out, d_in = d_in + excluded.d_in, d_out = d_out + excluded.d_out, wood = wood + excluded.wood, stone = stone + excluded.stone, food = food + excluded.food, n = n + excluded.n').bind(day, this.id, src, ...q.map(Math.round))));
    } catch { /* the database is busy: these minutes are not in the ledger */ }
  }
  private async later() { this.dirty = true; if (!(await this.state.storage.getAlarm())) await this.state.storage.setAlarm(Date.now() + 30000); }   // (written at most every 30 s, and when the game closes)
  async alarm() { await this.persist(); await this.eFlush(); }
  /** run one action with the server's dice and clock; the answer + the top-level fields it changed */
  private run(name: string, args: unknown) {
    const st = this.st!, fn = (handlers as unknown as Record<string, (s: unknown, a: unknown, c: unknown) => unknown>)[name];
    if (!fn) return { r: { refused: 'action' }, own: {} };
    // the test buttons (free VIP / diamonds / levels / kits / unlock-all) work only for the admin accounts (server/cf.json)
    if ((name === 'dev' || name === 'devTest') && !(this.env.ADMINS ?? '').split(',').includes(this.id)) return { r: { refused: 'dev' }, own: {} };
    if (!(this.env.ADMINS ?? '').split(',').includes(this.id)) delete st.tdUnlockAll;
    const before = new Map<string, string>(); for (const k of Object.keys(st)) if (!CLIENT_KEYS.has(k)) before.set(k, JSON.stringify(st[k]));
    useMem(this.mem);
    const realG = (st as { guildId?: string }).guildId ? st.guild : undefined;
    const admin = (this.env.ADMINS ?? '').split(',').includes(this.id);
    let r: unknown; try { r = fn(st, args ?? {}, { now: Date.now(), rnd: Math.random, admin }); } catch (e) { r = { refused: 'error', detail: String(e).slice(0, 120) }; }
    if (realG !== undefined) {   // a real guild changes only through its own object — but goal progress (kills, ore...) is sent there
      const nowG = st.guild as { goals?: { list?: { kind: string; have: number }[] } } | undefined, oldL = (realG as typeof nowG)?.goals?.list ?? [];
      const ups = (nowG?.goals?.list ?? []).map(q => ({ kind: q.kind, n: q.have - (oldL.find(o => o.kind === q.kind)?.have ?? q.have) })).filter(d => d.n > 0);
      st.guild = realG;
      if (ups.length) this.goalSend = [...this.goalSend, ...ups];
    }
    const own: St = {}; for (const k of Object.keys(st)) if (!CLIENT_KEYS.has(k) && before.get(k) !== JSON.stringify(st[k])) own[k] = st[k];
    return { r, own };
  }
  private send(o: unknown) { const t = JSON.stringify(o); for (const w of this.state.getWebSockets()) { try { w.send(t); } catch { /* closing */ } } }
  private snap() { const b = new Map<string, string>(); for (const k of Object.keys(this.st!)) if (!CLIENT_KEYS.has(k)) b.set(k, JSON.stringify(this.st![k])); return b; }
  private diff(b: Map<string, string>) { const own: St = {}; for (const k of Object.keys(this.st!)) if (!CLIENT_KEYS.has(k) && b.get(k) !== JSON.stringify(this.st![k])) own[k] = this.st![k]; return own; }
  private gstub(gid: string) { return this.env.GUILD.get(this.env.GUILD.idFromName(gid)); }
  /** an action on the shared guild: the guild's object runs it with this character, sends back both */
  private async guildAct(gid: string, name: string, args: unknown): Promise<{ r: unknown; own: St }> {
    const b = this.snap(), player: St = { ...this.st! }; delete player.guild;
    const res = await (await this.gstub(gid).fetch(new Request('https://g/act', { method: 'POST', body: JSON.stringify({ pid: this.id, name, args, player }) }))).json() as { r: unknown; player?: St; guild?: St | null };
    if (res.player) for (const [k, v] of Object.entries(res.player)) if (!CLIENT_KEYS.has(k) && k !== 'guild' && k !== 'guildId') this.st![k] = v;
    if (res.guild === null) { delete this.st!.guild; delete this.st!.guildId; } else if (res.guild) this.st!.guild = res.guild;
    return { r: res.r, own: this.diff(b) };
  }
  /** 🏘 the central buildings and the next raid, for the game */
  private async townView(fresh = false) {
    const t = await townInfo(this.env, fresh), now = Date.now();
    return { now, plan: t.plan, rows: t.rows.map(r => { let d: Record<string, { n: string; p: number }> = {}; try { d = JSON.parse((r as { donors?: string | null }).donors || '{}'); } catch { d = {}; }
      return { bid: r.bid, broken: r.broken && !isRepaired(r, now) ? 1 : 0, at: r.at, need: r.need, prog: repairProgress(r, now), top: Object.values(d).sort((a, b) => b.p - a.p).slice(0, 10) }; }) };
  }
  /** 🙏 give resources / gold to repair a broken central building (anyone, any amount; full bar = usable again) */
  private async townDonate(a: Record<string, unknown>): Promise<{ r: unknown; own: St }> {
    const bid = String(a.bid ?? '') as TownBld, st = this.st as unknown as GameState, now = Date.now();
    if (!(TOWN_BLDS as readonly string[]).includes(bid)) return { r: { refused: 'bld' }, own: {} };
    const t = await townInfo(this.env, true), row = t.rows.find(r => r.bid === bid);
    if (!row || isRepaired(row, now)) return { r: { refused: 'fine' }, own: {} };
    const want = (k: 'wood' | 'stone' | 'food') => Math.max(0, Math.min(Math.floor(Number(a[k]) || 0), Math.floor(st.res[k] ?? 0)));
    const g = { wood: want('wood'), stone: want('stone'), food: want('food'), gold: Math.max(0, Math.min(Math.floor(Number(a.gold) || 0), Math.floor(st.gold))) };
    const pts = repairPoints(g); if (!pts) return { r: { refused: 'none' }, own: {} };
    const b = this.snap(); st.res.wood -= g.wood; st.res.stone -= g.stone; st.res.food -= g.food; st.gold -= g.gold;
    let d: Record<string, { n: string; p: number }> = {}; try { d = JSON.parse((row as { donors?: string | null }).donors || '{}'); } catch { d = {}; }
    d[this.id] = { n: st.name || 'ผู้เล่น', p: (d[this.id]?.p ?? 0) + pts };
    const keep = Object.fromEntries(Object.entries(d).sort((x, y) => y[1].p - x[1].p).slice(0, 30));
    await this.env.DB.prepare('UPDATE town SET donated = donated + ?, donors = ? WHERE bid = ?').bind(pts, JSON.stringify(keep), bid).run();
    const after = { ...row, donated: row.donated + pts }, fixed = isRepaired(after, now);
    if (fixed) {
      await this.env.DB.prepare('UPDATE town SET broken = 0 WHERE bid = ?').bind(bid).run();
      const text = `🙏 ${st.name || 'ผู้เล่น'} เติมหลอดซ่อมจนเต็ม — ${TOWN_NAME[bid]} กลับมาใช้ได้แล้ว!`;
      this.state.waitUntil?.(this.env.ROOM.get(this.env.ROOM.idFromName('chat-world')).fetch(new Request('https://r/say', { method: 'POST', body: JSON.stringify({ text }) })).catch(() => undefined));
    }
    await townInfo(this.env, true);
    return { r: { ok: true, pts, fixed, view: await this.townView() }, own: this.diff(b) };
  }
  /** 👥 a new character (its name unique across the whole server) / play another one (the name others see follows it) */
  private async chars(name: string, a: Record<string, unknown>): Promise<{ r: unknown; own: St }> {
    const DB = this.env.DB, st = this.st as unknown as GameState, b = this.snap();
    { const acc = await DB.prepare('SELECT name FROM accounts WHERE id = ?').bind(this.id).first<{ name: string | null }>(); if (acc?.name) st.name = acc.name; else return { r: { refused: 'noname' }, own: {} }; }   // (the account's name is the truth for the character being played; a guest without a name sets one first)
    if (name === 'charCreate') {
      const n = cleanName(a.name); if (!n) return { r: { refused: 'name' }, own: {} };
      const k = n.toLowerCase();
      if (charList(st).some(c => c.name.toLowerCase() === k) || await DB.prepare('SELECT 1 AS x FROM accounts WHERE name_key = ? AND id <> ? UNION ALL SELECT 1 AS x FROM char_names WHERE name_key = ? AND id <> ?').bind(k, this.id, k, this.id).first()) return { r: { refused: 'taken' }, own: {} };
      // (every character's name is kept for this account — nobody can take one while another character is being played)
      for (const c of charList(st)) if (c.name) await DB.prepare('INSERT OR IGNORE INTO char_names (name_key, id, slot, name) VALUES (?, ?, ?, ?)').bind(c.name.toLowerCase(), this.id, c.slot, c.name).run();
      const r = createChar(st, n); if ('refused' in r) return { r, own: {} };
      try { await DB.prepare('INSERT INTO char_names (name_key, id, slot, name) VALUES (?, ?, ?, ?)').bind(k, this.id, r.slot, n).run(); }
      catch { delete (st as unknown as { alts: Record<string, unknown> }).alts[String(r.slot)]; return { r: { refused: 'taken' }, own: {} }; }
      return { r: { ok: true, slot: r.slot }, own: this.diff(b) };
    }
    const r = switchChar(st, Number(a.slot)); if ('refused' in r) return { r, own: {} };
    try { await DB.prepare('UPDATE accounts SET name = ?, name_key = ? WHERE id = ?').bind(st.name || null, st.name ? st.name.toLowerCase() : null, this.id).run(); } catch { /* (a clash: the old name stays shown until the next switch) */ }
    return { r: { ok: true, st: this.st }, own: this.diff(b) };   // (the game takes the whole state and starts over in the village)
  }
  /** found / find / join / leave a real guild */
  private async guildMeta(name: string, a: Record<string, unknown>): Promise<{ r: unknown; own: St }> {
    const DB = this.env.DB, now = Date.now(), b = this.snap(), st = this.st as St & { guild?: St & { id: string; name: string; members: { id: string; name: string }[] }; guildId?: string; name?: string };
    if (name === 'guildBrowse') {
      const rows = (await DB.prepare('SELECT id, name, leader, members, hall FROM guilds WHERE members < ? ORDER BY members DESC, at DESC LIMIT 20').bind(GUILD_CAP).all<{ id: string; name: string; leader: string; members: number; hall: number }>()).results;
      return { r: { list: rows }, own: {} };
    }
    if (name === 'guildCreate') {
      if (st.guild) return { r: { refused: 'member' }, own: {} };
      if (!cleanName(String(a.name ?? '').replace(/\s+/g, '_'))) return { r: { refused: 'name' }, own: {} };   // (the player-name filter)
      const out = this.run('guildCreate', a); const g = st.guild; if (!g || (out.r as { refused?: string })?.refused) return out;
      for (const mm of g.members) if (mm.id === 'me') mm.id = this.id;
      try { await DB.prepare('INSERT INTO guilds (id, name, name_key, leader, members, hall, at) VALUES (?, ?, ?, ?, 1, 1, ?)').bind(g.id, g.name, g.name.toLowerCase(), String(st.name ?? ''), now).run(); }
      catch { delete st.guild; return { r: { refused: 'taken' }, own: this.diff(b) }; }   // (another guild has that name)
      const view = await (await this.gstub(g.id).fetch(new Request('https://g/init', { method: 'POST', body: JSON.stringify({ g, pid: this.id }) }))).json() as St;
      st.guild = view as never; st.guildId = g.id;
      return { r: out.r, own: this.diff(b) };
    }
    if (name === 'guildJoinReal') {
      if (st.guild) return { r: { refused: 'member' }, own: {} };
      if (Number(st.level) < 20) return { r: { refused: 'level' }, own: {} };
      const id = String(a.id ?? ''); if (!/^[a-z0-9]{1,24}$/.test(id)) return { r: { refused: 'target' }, own: {} };
      const res = await (await this.gstub(id).fetch(new Request('https://g/join', { method: 'POST', body: JSON.stringify({ pid: this.id, name: st.name ?? 'ผู้เล่น', cls: st.cls, lv: st.level }) }))).json() as { refused?: string; guild?: St };
      if (res.refused || !res.guild) return { r: { refused: res.refused ?? 'target' }, own: {} };
      st.guild = res.guild as never; st.guildId = id;
      return { r: { ok: true }, own: this.diff(b) };
    }
    if (name === 'guildLeave') {
      if (!st.guild) return { r: { refused: 'guild' }, own: {} };
      if (st.guildId) await this.gstub(st.guildId).fetch(new Request('https://g/leave', { method: 'POST', body: JSON.stringify({ pid: this.id }) }));
      delete st.guild; delete st.guildId;
      return { r: { ok: true }, own: this.diff(b) };
    }
    return { r: { refused: 'action' }, own: {} };
  }
  /** what the market owes this player: gold for sold listings, items back from expired ones */
  private async claim(): Promise<{ own: St; text: string }> {
    if (!this.st) return { own: {}, text: '' };
    const DB = this.env.DB, now = Date.now(), b = this.snap(), st = this.st as St & { myListings?: Listing[]; gold: number };
    const paid = (await DB.prepare('SELECT listing, gold FROM market_pay WHERE seller = ? AND done = 0').bind(this.id).all<{ listing: string; gold: number }>()).results;
    let gold = 0; const sold: string[] = [];
    for (const p of paid) { gold += p.gold; sold.push(p.listing); await DB.prepare('UPDATE market_pay SET done = 1 WHERE listing = ?').bind(p.listing).run(); }
    if (gold) { const eb = this.eSnap(); st.gold += gold; st.myListings = (st.myListings ?? []).filter(l => !sold.includes(l.id)); this.eAdd('marketSold', eb); }
    const late = (await DB.prepare("SELECT id FROM market WHERE seller = ? AND status = 'open' AND until < ?").bind(this.id, now).all<{ id: string }>()).results;
    let back = 0;
    for (const l of late) {
      useMem(this.mem); const ok = (handlers as unknown as { marketCancel(s: unknown, a: { id: string }): boolean }).marketCancel(st, { id: l.id });
      if (ok) { back++; await DB.prepare("UPDATE market SET status = 'expired' WHERE id = ?").bind(l.id).run(); }
    }
    const own = this.diff(b); if (Object.keys(own).length) await this.later();
    return { own, text: [gold ? `🏪 ขายของในตลาดได้ ${sold.length} ชิ้น +${gold.toLocaleString()} 💰` : '', back ? `🏪 ของหมดเวลาขาย ${back} ชิ้น คืนเข้ากระเป๋าแล้ว` : ''].filter(Boolean).join(' • ') };
  }
  /** the players' market (shared by everyone, in the database) */
  /** CBT gift: VIP 7 days + a small pack, once per account (marked in the account's character) */
  private async cbt(_name: string): Promise<{ r: unknown; own: St }> {
    const b = this.snap(), r = grantCbt(this.st as unknown as GameState, Date.now());
    if (r !== true) return { r: { refused: r }, own: {} };
    await this.later();
    return { r: { ok: true }, own: this.diff(b) };
  }
  private async market(name: string, a: Record<string, unknown>): Promise<{ r: unknown; own: St }> {
    const DB = this.env.DB, now = Date.now(), st = this.st as St & GameState;
    if (name === 'marketList') {
      // the daily listing limit counts what was really listed today and not taken back (a player hit it by re-listing)
      { const day = Math.floor((now + 7 * 3600000) / 86400000), from = day * 86400000 - 7 * 3600000;
        const n = (await DB.prepare("SELECT COUNT(*) AS n FROM market WHERE seller = ? AND CAST(substr(id, 2, 13) AS INTEGER) >= ? AND status != 'cancel'").bind(this.id, from).first<{ n: number }>().catch(() => null))?.n;
        if (typeof n === 'number') (st as { mkDay?: { d: number; n: number } }).mkDay = { d: day, n }; }
      const out = this.run('marketList', a), l = out.r as Listing;
      if (l && typeof l === 'object' && l.id) { const d = itemDef(l.item.id);
        await DB.prepare('INSERT INTO market (id, seller, seller_name, item, type, rar, price, until, status, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(l.id, this.id, String(st.name ?? ''), JSON.stringify(l.item), d.type, l.item.rar ?? d.rarity, l.price, l.until, 'open', now).run(); }
      return out;
    }
    if (name === 'marketCancel') {   // only while nobody has bought it
      const u = await DB.prepare("UPDATE market SET status = 'cancel' WHERE id = ? AND seller = ? AND status = 'open'").bind(String(a.id), this.id).run() as { meta?: { changes?: number } };
      if (!u.meta?.changes) { const c = await this.claim(); return { r: false, own: c.own }; }
      const out = this.run('marketCancel', a);
      if (out.r !== true) await DB.prepare("UPDATE market SET status = 'open' WHERE id = ?").bind(String(a.id)).run();   // (bag full: still for sale)
      return out;
    }
    if (name === 'marketBrowse') {
      const type = Number(a.type) || 0, rar = Number(a.rar ?? -1), page = Math.max(0, Number(a.page) || 0), T = ['', 'weapon', 'armor', 'accessory'];
      let where = "status = 'open' AND until > ? AND seller != ?"; const bind: unknown[] = [now, this.id];
      if (type >= 1 && type <= 3) { where += ' AND type = ?'; bind.push(T[type]); } else if (type === 4) where += " AND type NOT IN ('weapon', 'armor', 'accessory')";
      if (rar >= 0) { where += ' AND rar >= ?'; bind.push(rar); }
      const total = (await DB.prepare(`SELECT COUNT(*) AS n FROM market WHERE ${where}`).bind(...bind).first<{ n: number }>())?.n ?? 0;
      const rows = (await DB.prepare(`SELECT id, seller_name, item, price, until FROM market WHERE ${where} ORDER BY price ASC LIMIT 7 OFFSET ?`).bind(...bind, page * 7).all<{ id: string; seller_name: string; item: string; price: number; until: number }>()).results;
      return { r: { list: rows.map(r => ({ id: r.id, seller: r.seller_name || 'ผู้เล่น', item: JSON.parse(r.item), price: r.price, until: r.until })), total }, own: {} };
    }
    if (name === 'marketHistory') {   // 📜 what sold on the whole server, newest first (everyone sees it — no buyer / seller names), or one item's recent prices
      const type = Number(a.type) || 0, rar = Number(a.rar ?? -1), page = Math.max(0, Math.min(50, Number(a.page) || 0)), T = ['', 'weapon', 'armor', 'accessory'], id = typeof a.id === 'string' ? a.id.slice(0, 40) : '';
      let where = "status = 'sold'"; const bind: unknown[] = [];
      if (id) { where += " AND json_extract(item, '$.id') = ?"; bind.push(id); }
      else { if (type >= 1 && type <= 3) { where += ' AND type = ?'; bind.push(T[type]); } else if (type === 4) where += " AND type NOT IN ('weapon', 'armor', 'accessory')"; if (rar >= 0) { where += ' AND rar >= ?'; bind.push(rar); } }
      const total = (await DB.prepare(`SELECT COUNT(*) AS n FROM market WHERE ${where}`).bind(...bind).first<{ n: number }>())?.n ?? 0;
      const rows = (await DB.prepare(`SELECT item, price, at FROM market WHERE ${where} ORDER BY at DESC LIMIT 7 OFFSET ?`).bind(...bind, page * 7).all<{ item: string; price: number; at: number }>()).results;
      const week = id ? await DB.prepare(`SELECT COUNT(*) AS n, AVG(price * 1.0 / MAX(1, COALESCE(json_extract(item, '$.qty'), 1))) AS avg, MIN(price * 1.0 / MAX(1, COALESCE(json_extract(item, '$.qty'), 1))) AS lo, MAX(price * 1.0 / MAX(1, COALESCE(json_extract(item, '$.qty'), 1))) AS hi FROM market WHERE ${where} AND at > ?`).bind(...bind, now - 7 * 86400000).first<{ n: number; avg: number; lo: number; hi: number }>() : null;
      return { r: { list: rows.map(r => ({ item: JSON.parse(r.item), price: r.price, at: r.at })), total, ...(week ? { week: { n: week.n, avg: Math.round(week.avg ?? 0), lo: Math.round(week.lo ?? 0), hi: Math.round(week.hi ?? 0) } } : {}) }, own: {} };
    }
    if (name === 'marketBuy') {   // checked, then taken off the market in one step (two buyers can never get the same piece)
      const row = await DB.prepare("SELECT * FROM market WHERE id = ? AND status = 'open' AND until > ?").bind(String(a.id), now).first<{ id: string; seller: string; item: string; price: number }>();
      if (!row) return { r: { refused: 'gone' }, own: {} };
      if (row.seller === this.id) return { r: { refused: 'own' }, own: {} };
      if (st.gold < row.price) return { r: { refused: 'gold' }, own: {} };
      const it = JSON.parse(row.item) as { id: string; qty: number; upg: number; rar?: number; aff?: unknown; set?: string };
      const stack = !!ITEMS[it.id]?.stack && st.inventory.some(i => i.id === it.id);
      if (st.inventory.length >= invSize(st) && !stack) return { r: { refused: 'bag' }, own: {} };
      const u = await DB.prepare("UPDATE market SET status = 'sold', buyer = ?, at = ? WHERE id = ? AND status = 'open'").bind(this.id, now, row.id).run() as { meta?: { changes?: number } };
      if (!u.meta?.changes) return { r: { refused: 'gone' }, own: {} };
      const b = this.snap();
      st.gold -= row.price; addItem(st, it.id, it.qty, it.upg, { rar: it.rar, aff: it.aff as never, set: it.set } as never);
      const pay = row.price - Math.ceil(row.price * MARKET_FEE);   // 8% market tax (a gold sink)
      await DB.prepare('INSERT INTO market_pay (listing, seller, gold, at) VALUES (?, ?, ?, ?)').bind(row.id, row.seller, pay, now).run();
      try { await this.env.PLAYER.get(this.env.PLAYER.idFromName(row.seller)).fetch(new Request('https://p/claim?id=' + row.seller)); } catch { /* paid when they come back */ }
      await this.later();
      return { r: { ok: true, id: it.id, qty: it.qty, price: row.price }, own: this.diff(b) };
    }
    return { r: { refused: 'action' }, own: {} };
  }
  async fetch(req: Request) {
    const u = new URL(req.url), id = u.searchParams.get('id') ?? ''; await this.load(id);
    if (u.pathname === '/ws') {
      for (const old of this.state.getWebSockets()) { try { old.close(4000, 'again'); } catch { /* gone */ } }   // one game per player
      const pair = new WebSocketPair(), client = pair[0], server = pair[1] as WSX;
      this.state.acceptWebSocket(server, [id]); server.serializeAttachment({ id });
      // the director's account: everything in the game, given once by the server (src/systems/adminKit.ts)
      if (this.st && (this.env.ADMINS ?? '').split(',').includes(id)) { const eb = this.eSnap(); if (grantAdminKit(this.st as unknown as GameState)) { this.eAdd('adminKit', eb); await this.later(); } }
      if (this.st && ensureHomeVillage(this.st as unknown as GameState)) await this.later();
      if (this.st) { const hf = homeFix(this.st as unknown as GameState); if (hf) await this.later(); if (hf === 2) addMail(this.st as unknown as GameState, { id: 'homefix', from: 'ทีมงาน Mourncrown', title: '🏠 ขออภัยเรื่องบ้านหาย', text: 'บ้านที่สร้างไว้หายหลังอัปเดตเพราะบั๊กของเรา — ทีมงานสร้างบ้าน Lv1 คืนให้แล้ว (เควสต่อจากนี้ทำต่อได้เลย) ขออภัยในความไม่สะดวกครับ 🙏' }); }   // (the lost-house bug: src/systems/settlement.ts homeFix)   // the home village's NPC buildings live here too (they used to exist on the device only)
      if (this.st && await this.mailAll()) await this.later();   // letters to everyone from the back office, not had yet
      if (this.cbtLetter()) await this.later();
      // on (re)connect the game gets the server's whole valuable state (anything edited on the device is put back)
      const own: St = {}; if (this.st) for (const k of Object.keys(this.st)) if (!CLIENT_KEYS.has(k)) own[k] = this.st[k];
      server.send(JSON.stringify({ t: 'hi', rev: this.rev, has: !!this.st, own }));
      await this.hello('/hello');
      if (this.st) { const c = await this.claim(); if (c.text) server.send(JSON.stringify({ t: 'note', own: c.own, text: c.text })); }   // sold while away
      const gid = (this.st as { guildId?: string } | null)?.guildId;
      if (gid) { const v = await (await this.gstub(gid).fetch(new Request('https://g/view?pid=' + this.id))).json() as St | null; if (v) this.st!.guild = v; else { delete this.st!.guild; delete this.st!.guildId; } this.dirty = true; server.send(JSON.stringify({ t: 'note', own: { guild: this.st!.guild ?? null }, text: '' })); }
      return new Response(null, { status: 101, webSocket: client } as ResponseInit);
    }
    if (u.pathname === '/save') return new Response(JSON.stringify(this.st ? { rev: this.rev, at: this.at, data: this.st } : { rev: 0, at: 0, data: null }));
    if (u.pathname === '/gnote') {   // the guild changed (another member did something): the game gets the new guild
      const v = JSON.parse(await req.text()) as St | null;
      if (this.st) { if (v) this.st.guild = v; else { delete this.st.guild; delete this.st.guildId; } this.dirty = true; this.send({ t: 'note', own: { guild: v }, text: '' }); }
      return new Response('{}');
    }
    if (u.pathname === '/topup' && req.method === 'POST') {   // (the worker, after Thunder said the slip is good) diamonds — once per slip
      if (!this.st) return new Response(JSON.stringify({ error: 'nosave' }), { status: 400 });
      const t = JSON.parse(await req.text()) as { ref: string; dia: number; thb: number; pack: string };
      const st = this.st as St & { payRefs?: string[]; topups?: number; topupThb?: number };
      if ((st.payRefs ?? []).includes(t.ref)) return new Response(JSON.stringify({ ok: true, again: true }));
      const eb = this.eSnap(), b = this.snap();
      const card = packOf(String(t.pack)); if (card?.days) grantVip(st as unknown as GameState, card.days); else grantDiamonds(st as unknown as GameState, Math.max(0, Math.floor(Number(t.dia) || 0)));
      st.payRefs = [...(st.payRefs ?? []), String(t.ref)].slice(-50); st.topups = (st.topups ?? 0) + 1; st.topupThb = (st.topupThb ?? 0) + (Number(t.thb) || 0);
      this.eAdd('topup', eb); this.dirty = true; await this.persist(); await this.eFlush(true);
      this.send({ t: 'note', own: this.diff(b), text: card?.days ? `👑 ซื้อ VIP ${card.days} วัน สำเร็จ! — ขอบคุณที่สนับสนุนเกม` : `💎 เติมเงินสำเร็จ! ได้รับ ${t.dia.toLocaleString()} เพชร — ขอบคุณที่สนับสนุนเกม` });
      return new Response(JSON.stringify({ ok: true }));
    }
    if (u.pathname === '/gift') {   // (the back office) the admin sends resources / items — written at once, the game is told
      if (!this.st) return new Response(JSON.stringify({ error: 'nosave' }), { status: 400 });
      const g = JSON.parse(await req.text()) as { gold?: number; wood?: number; stone?: number; food?: number; items?: { id: string; qty: number }[]; note?: string };
      const gift = cleanGift(g as Gift), got = giftText(gift); if (!got) return new Response(JSON.stringify({ error: 'empty' }), { status: 400 });
      const b = this.snap();
      addMail(this.st as unknown as GameState, { from: 'แอดมิน', title: String(g.note || '').trim() ? '🎁 ของจากแอดมิน' : '🎁 ของขวัญจากแอดมิน', text: String(g.note ?? '').slice(0, 300), ...gift });   // (into the mailbox: the player claims it)
      this.dirty = true; await this.persist();
      this.send({ t: 'note', own: this.diff(b), text: '📬 มีจดหมายใหม่! เปิดที่ เมนู → 📬 จดหมาย' });
      return new Response(JSON.stringify({ ok: true, text: `ส่งเข้ากล่องจดหมายแล้ว: ${got}` }));
    }
    if (u.pathname === '/claim') { const c = await this.claim(); if (c.text) this.send({ t: 'note', own: c.own, text: c.text }); return new Response('{}'); }
    if (u.pathname === '/gid') return new Response(JSON.stringify({ gid: (this.st as { guildId?: string } | null)?.guildId ?? null, lv: Number(this.st?.level) || 1 }));
    if (u.pathname === '/lv') return new Response(JSON.stringify({ lv: Number(this.st?.level) || 1 }));   // (rooms ask: the damage cap uses the server's level)
    if (u.pathname === '/merge') {   // the game's save: only the harmless fields are taken (the first save of a new account seeds it)
      const body = JSON.parse(await req.text()) as { data?: St };
      if (!body.data || typeof body.data !== 'object' || typeof body.data.version !== 'number') return new Response(JSON.stringify({ error: 'data' }), { status: 400 });
      if (!this.st) {   // a new account's first save: a fresh character (a save edited before going online brings nothing)
        this.st = startNewGame() as unknown as St; ensureHomeVillage(this.st as unknown as GameState);
        for (const k of CLIENT_KEYS) if (k in body.data) this.st[k] = body.data[k];
      }
      else for (const k of CLIENT_KEYS) if (k in body.data) this.st[k] = body.data[k];
      const cbtNew = this.cbtLetter();   // (a game that only saves — idle, or its socket never came back — gets the CBT letter too)
      this.dirty = true; await this.persist();
      if (cbtNew) this.send({ t: 'note', own: { mail: (this.st as { mail?: unknown }).mail }, text: '📬 ของขวัญ CBT (VIP 7 วัน) รออยู่ในกล่องจดหมาย — กดซองจดหมายด้านบน' });
      return new Response(JSON.stringify({ rev: this.rev, at: this.at }));
    }
    if (u.pathname === '/pay' && this.st) {   // the map room: a monster died and this player did a fair share
      this.payOne(JSON.parse(await req.text())); await this.later();
      return new Response('{}');
    }
    if (u.pathname === '/adopt') {   // (the back office) this account takes over a hero moved from another account
      await this.load(u.searchParams.get('id') ?? ''); const data = JSON.parse(await req.text()) as St;
      if (!data || typeof data !== 'object' || typeof data.version !== 'number') return new Response('{}', { status: 400 });
      this.st = data; this.dirty = true; await this.persist();
      const own: St = {}; for (const k of Object.keys(this.st)) if (!CLIENT_KEYS.has(k)) own[k] = this.st[k];
      this.send({ t: 'note', own, text: '🔁 ทีมงานย้ายตัวละครเดิมของคุณมาที่บัญชีนี้แล้ว — แนะนำ: เมนู → 🔗 ผูกบัญชี Google เพื่อไม่ให้หายอีก' });
      return new Response(JSON.stringify({ ok: true }));
    }
    if (u.pathname === '/raidpay' && this.st) {   // ⚔ the village raid's chest for a defender (from the raid room)
      const b = JSON.parse(await req.text()) as { mvp?: boolean; won?: boolean }, sn = this.snap(), eb = this.eSnap();
      // the chest comes by mail (a full bag loses nothing; director: players look for it in the mailbox) — EXP at once
      const st = this.st as unknown as GameState, c = raidChest(st.level, !!b.mvp, !!b.won); gainExp(st, c.exp); this.eAdd('raidChest', eb);
      addMail(st, { from: 'หมู่บ้านกลาง', title: `🎁 หีบผู้พิทักษ์${b.mvp ? ' 🏅 MVP x2' : ''}`, text: `ขอบคุณที่ช่วยป้องกันหมู่บ้านกลาง${b.won ? ' — ป้องกันสำเร็จ!' : ''} (ได้ EXP +${c.exp.toLocaleString()} แล้ว)`, gold: c.gold, items: c.items, until: Date.now() + 7 * 86400000 });
      await this.later();
      this.send({ t: 'note', own: this.diff(sn), text: `📬 หีบผู้พิทักษ์${b.mvp ? ' (MVP x2)' : ''} ส่งเข้ากล่องจดหมายแล้ว — 💰${c.gold.toLocaleString()} + ผลึกมานา x${c.items[0].qty} + ยาฟื้นพลังใหญ่ x${c.items[1].qty} • EXP +${c.exp.toLocaleString()}` });
      return new Response('{}');
    }
    if (u.pathname === '/payb' && this.st) {   // the map room: the kills of the last few seconds in one call (saves the daily quota)
      const b = JSON.parse(await req.text()) as { list?: unknown[] };
      for (const p of (b.list ?? []).slice(0, 60)) this.payOne(p as never);
      await this.later(); return new Response('{}');
    }
    return new Response('{}', { status: 404 });
  }
  /** the CBT gift not claimed yet: a letter in the mailbox (director) — checked on connect and on every action (a game that
   *  stayed on the old server through a deploy gets it as soon as it does anything); true = the letter was just added */
  private cbtLetter() {
    const st = this.st as unknown as GameState | null;
    if (!st || !CBT_ACTIVE || cbtGot(st) || mailOf(st).some(m => m.id === 'cbt')) return false;
    addMail(st, { id: 'cbt', kind: 'cbt', from: 'ทีมงาน Mourncrown', title: '🎁 ของขวัญผู้ทดสอบ CBT', text: 'ขอบคุณที่มาช่วยทดสอบเกมนะครับ! กดรับ VIP 7 วัน + ฉายา「ผู้บุกเบิก」+ ของใช้ ได้เลย (ตอนเปิด OBT ข้อมูล CBT จะถูกล้าง ยกเว้นของ limited ที่จะประกาศภายหลัง)' });
    return true;
  }
  /** letters to everyone (D1 mail_all) this hero has not had yet go into the mailbox; true = some came */
  private async mailAll() {
    const st = this.st as unknown as GameState & { mailAll?: number }, since = st.mailAll ?? 0;
    try {
      const rows = (await this.env.DB.prepare('SELECT id, at, title, text, gift, until FROM mail_all WHERE id > ? ORDER BY id LIMIT 20').bind(since).all<{ id: number; at: number; title: string; text: string; gift: string; until: number }>()).results;
      if (!rows.length) return false;
      return takeMailAll(st, rows) > 0 || st.mailAll !== since;
    } catch { return false; }
  }
  /** one monster's reward for this player (the game gets a 'pay' note with the loot) */
  private payOne(p: { n: number; sid: number; key: string; kind: string; boss: boolean; elite: boolean; share: number; wb?: boolean; lv?: number; killer?: boolean }) {
    if (p.wb) {
      if (this.mem.map !== p.n) { this.mem.map = p.n; this.mem.dmgT = Date.now() - 10000; }
      const eb = this.eSnap(), out = this.run('wbKill', { sid: p.sid, key: p.key, kind: p.kind, lv: p.lv, share: p.share, killer: !!p.killer });
      this.eAdd('wbKill', eb); this.send({ t: 'pay', sid: p.sid, ...out }); return;
    }
    const st = p.n === WILD ? null : STAGES[p.n - 1], L = st?.land, mob = L ? [...L.mobs, L.boss].find(m => m.key === p.key) : null;
    this.mem.spawns.set(p.sid, { key: p.key, elite: p.elite, boss: p.boss }); if (this.mem.map !== p.n) { this.mem.map = p.n; this.mem.dmgT = Date.now() - 10000; }   // (memory lost / just arrived: a fresh 10 s of damage, never zero)
    const eb = this.eSnap(), out = this.run('kill', { sid: p.sid, kind: p.kind, key: p.key, name: mob?.name ?? p.key, size: mob?.size ?? 40, boss: p.boss, share: p.share });
    this.eAdd('roomKill', eb); this.send({ t: 'pay', sid: p.sid, ...out });
  }
  async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer) {
    if (typeof data !== 'string' || data.length > 20000) return;
    const me = (ws as WSX).deserializeAttachment() as { id: string }; await this.load(me.id);
    let m: { t?: string; q?: number; name?: string; args?: unknown }; try { m = JSON.parse(data); } catch { return; }
    if (m.t === 'hb') { if (Date.now() - this.helloT > 60000) await this.hello('/hello'); if (this.st) { const b = this.snap(); if (await this.mailAll()) { await this.later(); this.send({ t: 'note', own: this.diff(b), text: '📬 มีจดหมายใหม่! เปิดที่ เมนู → 📬 จดหมาย' }); } if (this.cbtLetter()) { await this.later(); this.send({ t: 'note', own: { mail: (this.st as { mail?: unknown }).mail }, text: '📬 ของขวัญ CBT (VIP 7 วัน) รออยู่ในกล่องจดหมาย — กดซองจดหมายด้านบน' }); } } return; }   // (the game: still here — counts the minutes played for the money cap)
    if (m.t === 'sync' && this.st) { const own: St = {}; for (const k of Object.keys(this.st)) if (!CLIENT_KEYS.has(k)) own[k] = this.st[k]; ws.send(JSON.stringify({ t: 'note', own })); return; }   // (the game did something the server refused: its whole copy)
    if (m.t !== 'act' || typeof m.name !== 'string') return;
    if (Date.now() - this.helloT > 300000) this.hello('/hello');
    if (this.cbtLetter()) { await this.later(); ws.send(JSON.stringify({ t: 'note', own: { mail: (this.st as { mail?: unknown }).mail }, text: '📬 ของขวัญ CBT (VIP 7 วัน) รออยู่ในกล่องจดหมาย — กดซองจดหมายด้านบน' })); }   // (still playing: keep counting me online)
    if (!this.st) { ws.send(JSON.stringify({ t: 'r', q: m.q, r: { refused: 'nostate' }, own: {} })); return; }
    const gid = (this.st as { guildId?: string }).guildId;
    if (this.goalSend.length && gid) { const g = this.goalSend; this.goalSend = []; try { await this.gstub(gid).fetch(new Request('https://g/goal', { method: 'POST', body: JSON.stringify({ pid: this.id, ups: g }) })); } catch { /* next time */ } }
    await townInfo(this.env);   // (the broken central buildings: the rules read them)
    const eb = this.eSnap();
    const out = MARKET.has(m.name) ? await this.market(m.name, (m.args ?? {}) as Record<string, unknown>)
      : CBT.has(m.name) ? await this.cbt(m.name)
      : ['guildCreate', 'guildBrowse', 'guildJoinReal', 'guildLeave'].includes(m.name) ? await this.guildMeta(m.name, (m.args ?? {}) as Record<string, unknown>)
      : ['charCreate', 'charSwitch'].includes(m.name) ? await this.chars(m.name, (m.args ?? {}) as Record<string, unknown>)
      : m.name === 'townDonate' ? await this.townDonate((m.args ?? {}) as Record<string, unknown>)
      : m.name === 'townInfo' ? { r: await this.townView(), own: {} }
      : gid && GUILD_ACTS.has(m.name) ? await this.guildAct(gid, m.name, m.args) : this.run(m.name, m.args);
    this.eAdd(m.name, eb);
    if (Object.keys(out.own).length) { await this.later(); await this.eFlush(); }
    ws.send(JSON.stringify({ t: 'r', q: m.q, ...out }));
  }
  async webSocketClose(ws: WebSocket) { try { ws.close(); } catch { /* already */ } await this.persist(); await this.eFlush(true); if (!this.state.getWebSockets().filter(w => w !== ws).length) await this.hello('/bye'); }
  /** the online counter (a map in the chat-world room): hello on connect and now and then while playing, bye on leaving */
  helloT = 0;
  private async hello(path: '/hello' | '/bye') {
    this.helloT = Date.now();
    try {
      const j = await (await this.env.ROOM.get(this.env.ROOM.idFromName('chat-world')).fetch(new Request('https://r' + path, { method: 'POST', body: JSON.stringify({ id: this.id }) }))).json() as { n?: number; ann?: { id: number; text: string; until: number } };
      if (path === '/hello' && typeof j.n === 'number') this.send({ t: 'on', n: j.n });
      if (path === '/hello') this.send({ t: 'town', ...(await this.townView()) });   // (🏘 the central buildings + the next raid: the game's warning bar)
      if (path === '/hello' && j.ann) this.send({ t: 'ann', id: j.ann.id, text: j.ann.text, until: j.ann.until });   // (📢 the admin's announcement: the game shows it once)   // (the 🟢 online count on the game's screen: fresh every 2 minutes, no extra request)
    } catch { /* not counted this time */ }
  }
}

// ===== a real guild: one shared copy for every member =====
// The same guild rules (src/systems/guild.ts through the handlers) run here on the one copy, with the acting member's
// character alongside; the answer carries both. Other online members are told so their games show the change.
type G = Omit<GuildState, 'me'> & { me?: string };
export class Guild {
  g: G | null = null; loaded = false; mems = new Map<string, Mem>();
  constructor(private state: DOState & { storage: { get(k: string): Promise<unknown>; put(k: string, v: unknown): Promise<void> } }, private env: Env) {}
  private async load() { if (!this.loaded) { this.g = (await this.state.storage.get('g') as G | undefined) ?? null; if (this.g) this.g.real = true; this.loaded = true; } }
  private gs(gid: string) { return this.env.GUILD.get(this.env.GUILD.idFromName(gid)); }
  /** this guild as GameState for the rules (no member acting) */
  private asSt(): GameState { return { guild: { ...this.g!, me: '' } } as unknown as GameState; }
  /** a real guild's village as a raid target, or null (shielded / gone) */
  private async snapOf(gid: string): Promise<Rival | null> {
    try { return await (await this.gs(gid).fetch(new Request('https://g/snap'))).json() as Rival | null; } catch { return null; }
  }
  /** today's 3 targets: real guilds of about the same strength without a shield; pretend villages fill the gaps */
  private async match(now: number) {
    // real guilds only (director: no bot villages) — hall ±1 first, then any hall; while fewer than 3, looked up again every 30 min
    const g = this.g!, day = dayKey(now), rv = g.rivals as { day: string; list: Rival[]; at?: number } | undefined;
    if (rv?.day === day && rv.list.every(r => r.real) && (rv.list.length >= 3 || now - (rv.at ?? 0) < 1800000)) return;   // (a list from before, with made-up villages: replaced now)
    const my = hallLv(this.asSt(), now);
    let rows = (await this.env.DB.prepare('SELECT id FROM guilds WHERE id != ? AND hall BETWEEN ? AND ? AND shield < ? ORDER BY RANDOM() LIMIT 3').bind(g.id, my - 1, my + 1, now).all<{ id: string }>()).results;
    if (rows.length < 3) { const more = (await this.env.DB.prepare('SELECT id FROM guilds WHERE id != ? AND shield < ? ORDER BY RANDOM() LIMIT 6').bind(g.id, now).all<{ id: string }>()).results; rows = [...rows, ...more.filter(r => !rows.some(q => q.id === r.id))].slice(0, 3); }
    const real = (await Promise.all(rows.map(r => this.snapOf(r.id)))).filter((r): r is Rival => !!r);
    g.rivals = { day, list: real, at: now } as typeof g.rivals;
  }
  /** the real guilds' season board (this week + last week), refreshed every 5 minutes */
  private async board(now: number) {
    const g = this.g!; if (g.board && now - g.board.at < 300000) return;
    const w = weekOf(now);
    const rows = (await this.env.DB.prepare('SELECT name, week, score, pweek, pscore FROM guilds WHERE week >= ? OR pweek >= ? ORDER BY score DESC LIMIT 300').bind(w - 1, w - 1).all<{ name: string; week: number; score: number; pweek: number; pscore: number }>()).results;
    const at = (wk: number) => rows.map(r => ({ name: r.name, score: r.week === wk ? r.score : r.pweek === wk ? r.pscore : 0 })).filter(e => e.score > 0).sort((a, b) => b.score - a.score).slice(0, 50);
    g.board = { at: now, week: w, list: at(w), prev: at(w - 1) };
  }
  /** raids this guild won against real guilds: the loss goes to them; we keep no more than they lost */
  private async deal() {
    const g = this.g!, out = g.out ?? []; delete g.out;
    for (const hit of out) {
      let lost: Record<string, number> = { gold: 0, wood: 0, stone: 0, food: 0 };
      try { lost = await (await this.gs(hit.target).fetch(new Request('https://g/raided', { method: 'POST', body: JSON.stringify({ hit }) }))).json() as Record<string, number>; } catch { /* they are gone: nothing to take */ }
      for (const k of ['gold', 'wood', 'stone', 'food'] as const) { const over = Math.max(0, (hit.gain[k] ?? 0) - (lost[k] ?? 0)); g.treasury[k] = Math.max(0, g.treasury[k] - over); }
    }
  }
  private view(pid: string) { return this.g ? { ...this.g, me: pid } : null; }
  private async save(except?: string) {
    if (!this.g) return;
    await this.state.storage.put('g', this.g);
    const hall = this.g.buildings.find(b => b.type === 'hall')?.level ?? 1, lead = this.g.members.find(m => m.role === 'leader')?.name ?? '';
    const se = this.g.season, w = weekOf(Date.now());
    const score = se?.week === w ? se.score : 0, prev = se?.week === w - 1 ? { week: se.week, score: se.score } : se?.prev;
    await this.env.DB.prepare('UPDATE guilds SET members = ?, hall = ?, leader = ?, shield = ?, week = ?, score = ?, pweek = ?, pscore = ? WHERE id = ?')
      .bind(this.g.members.length, hall, lead, this.g.shieldUntil ?? 0, w, score, prev?.week ?? 0, prev?.score ?? 0, this.g.id).run();
    await Promise.allSettled(this.g.members.filter(m => m.id !== except && !m.sim).map(m =>   // the others' games show the change
      this.env.PLAYER.get(this.env.PLAYER.idFromName(m.id)).fetch(new Request('https://p/gnote?id=' + m.id, { method: 'POST', body: JSON.stringify(this.view(m.id)) }))));
  }
  async fetch(req: Request) {
    await this.load(); const u = new URL(req.url), body = req.method === 'POST' ? JSON.parse(await req.text()) : {};
    if (u.pathname === '/init') { if (!this.g) { this.g = body.g as G; delete this.g.me; this.g.real = true; await this.state.storage.put('g', this.g); } return new Response(JSON.stringify(this.view(body.pid))); }
    if (u.pathname === '/view') { const pid = u.searchParams.get('pid') ?? ''; return new Response(JSON.stringify(this.g?.members.some(m => m.id === pid) ? this.view(pid) : null)); }
    if (!this.g) return new Response(JSON.stringify({ refused: 'target' }));
    if (u.pathname === '/join') {
      if (this.g.members.some(m => m.id === body.pid)) return new Response(JSON.stringify({ guild: this.view(body.pid) }));
      if (this.g.members.length >= GUILD_CAP) return new Response(JSON.stringify({ refused: 'full' }));
      const house = [...Array(GUILD_CAP).keys()].find(i => !this.g!.members.some(m => m.house === i)) ?? this.g.members.length;
      this.g.members.push({ id: body.pid, name: String(body.name ?? 'ผู้เล่น').slice(0, 16), role: 'member', pts: 0, house, houseLv: 0, cls: body.cls, lv: body.lv, joined: Date.now() });
      this.g.log.unshift({ t: Date.now(), kind: 'join', text: `${body.name} เข้าร่วมกิลด์` }); this.g.log = this.g.log.slice(0, 60);
      await this.save(body.pid); return new Response(JSON.stringify({ guild: this.view(body.pid) }));
    }
    if (u.pathname === '/leave') {
      const me = this.g.members.find(m => m.id === body.pid); if (!me) return new Response('{}');
      this.g.members = this.g.members.filter(m => m.id !== body.pid);
      this.g.log.unshift({ t: Date.now(), kind: 'join', text: `${me.name} ออกจากกิลด์` });
      if (!this.g.members.length) { await this.env.DB.prepare('DELETE FROM guilds WHERE id = ?').bind(this.g.id).run(); this.g = null; await this.state.storage.put('g', null); return new Response('{}'); }
      if (me.role === 'leader') { const next = this.g.members.find(m => m.role === 'deputy') ?? [...this.g.members].sort((a, b) => a.joined - b.joined)[0]; next.role = 'leader'; }   // the guild goes on
      await this.save(body.pid); return new Response('{}');
    }
    if (u.pathname === '/snap') {   // another guild was matched with us: our village as they will see it (none while shielded)
      return new Response(JSON.stringify(this.g.shieldUntil > Date.now() || !this.g.members.length ? null : rivalOf(this.asSt())));
    }
    if (u.pathname === '/raided') {   // another guild's raid / war on us is over: take the loss
      const st = this.asSt(), lost = raidedBy(st, body.hit as RaidHit);
      const ng = (st as unknown as { guild: G }).guild; delete ng.me; this.g = ng; await this.save();
      return new Response(JSON.stringify(lost));
    }
    if (u.pathname === '/goal') {   // a member's kills / ore / animals count toward the guild's daily goals
      const pid = String(body.pid); if (!this.g.members.some(m => m.id === pid)) return new Response('{}');
      const st = { guild: { ...this.g, me: pid } } as unknown as GameState, before = JSON.stringify(this.g);
      for (const d of (body.ups as { kind: string; n: number }[]).slice(0, 10)) goalProgress(st, d.kind as never, Math.min(500, Math.max(0, Math.round(d.n))));
      const ng = (st as unknown as { guild: G }).guild; delete ng.me; this.g = ng; if (JSON.stringify(this.g) !== before) await this.save();
      return new Response('{}');
    }
    if (u.pathname === '/act') {
      const pid = String(body.pid); if (!this.g.members.some(m => m.id === pid)) return new Response(JSON.stringify({ r: { refused: 'guild' }, guild: null }));
      const fn = (handlers as unknown as Record<string, (s: unknown, a: unknown, c: unknown) => unknown>)[body.name]; if (!fn) return new Response(JSON.stringify({ r: { refused: 'action' } }));
      const st: St = { ...(body.player as St), guild: { ...this.g, me: pid } };
      let m = this.mems.get(pid); if (!m) { m = newMem(); this.mems.set(pid, m); } useMem(m);
      const now = Date.now(), before0 = JSON.stringify(this.g);
      { // the member as they are now (class / level / form were only taken when they joined: a villager forever in the war scene)
        const p = body.player as { cls?: string; level?: number; tier?: number; useTier?: number; look?: string } | undefined, me = this.g.members.find(m => m.id === pid);
        if (p && me) { const tier = Math.max(0, Number(p.tier) || 0); me.cls = String(p.cls ?? me.cls); me.lv = Number(p.level) || me.lv; me.t = Math.max(0, Math.min(Number(p.useTier ?? tier) || 0, tier)); if (p.look === 'f' || p.look === 'm') me.lk = p.look; }
      }
      try { await this.match(now); await this.board(now); } catch { /* the database is busy: keep yesterday's list */ }
      // going to war with a real guild: look at their village as it is now (they may have a shield by now)
      const aid = String((body.args as { id?: string } | undefined)?.id ?? '');
      if ((body.name === 'raidStart' || body.name === 'warStart') && aid.startsWith('g:')) {
        const fresh = await this.snapOf(aid.slice(2)), L = this.g.rivals.list;
        if (!fresh) { this.g.rivals.list = L.filter(r => r.id !== aid); await this.save(); return new Response(JSON.stringify({ r: { refused: 'shield' }, player: body.player, guild: this.view(pid) })); }
        this.g.rivals.list = L.map(r => (r.id === aid ? fresh : r));
      }
      st.guild = { ...this.g, me: pid };
      const before = before0;
      let r: unknown; try { r = fn(st, body.args ?? {}, { now: Date.now(), rnd: Math.random, admin: (this.env.ADMINS ?? '').split(',').includes(pid) }); } catch (e) { r = { refused: 'error', detail: String(e).slice(0, 120) }; }
      const ng = st.guild as G | undefined; delete st.guild;
      if (ng) { delete ng.me; this.g = ng; if (this.g.out?.length) await this.deal(); if (JSON.stringify(this.g) !== before) await this.save(pid); }
      return new Response(JSON.stringify({ r, player: st, guild: this.view(pid) }));
    }
    return new Response('{}', { status: 404 });
  }
}
