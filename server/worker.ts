// Mourncrown game server — Cloudflare Worker + D1 (free plan). Deployed by tools/deploy_server.mjs.
// Step 1 (now): accounts (a guest account per device, Google login links it so any device loads the same hero) and the
// save kept on the server. ⚠️ The save is still WRITTEN by the game on the player's device — the server stores it but does
// not yet decide the rules; step 2 moves src/server/handlers.ts here (docs/ONLINE_RISKS.md).
interface D1Result<T> { results: T[] }
interface D1Stmt { bind(...v: unknown[]): D1Stmt; first<T>(): Promise<T | null>; run(): Promise<unknown>; all<T>(): Promise<D1Result<T>> }
interface Env { DB: { prepare(sql: string): D1Stmt }; GOOGLE_CLIENT_ID?: string }

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
        const rev = (cur?.rev ?? 0) + 1;
        await env.DB.prepare('INSERT INTO saves (id, rev, at, size, data) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET rev = excluded.rev, at = excluded.at, size = excluded.size, data = excluded.data')
          .bind(me.id, rev, now, data.length, data).run();
        return json(req, { rev, at: now });
      }
      return json(req, { error: 'not found' }, 404);
    } catch (e) {
      return json(req, { error: 'server', detail: String(e).slice(0, 200) }, 500);
    }
  },
};
