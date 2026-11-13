// The save kept on the game server (server/worker.ts on Cloudflare). Every device gets a guest account by itself; a
// Google login (when GOOGLE_CLIENT_ID is set) links it, so the same hero loads on any phone. The game keeps working
// offline: the local save is always written first, the server copy follows a few seconds later.
// ⚠️ Step 1: the server stores what the game sends. Step 2 moves the rules (src/server/handlers.ts) to the server.
/** the game server; on this machine only, ?srv=local talks to a local copy (wrangler dev, for testing) */
export const SERVER = typeof location !== 'undefined' && ['localhost', '127.0.0.1'].includes(location.hostname) && new URLSearchParams(location.search).get('srv') === 'local'
  ? 'http://127.0.0.1:8787' : 'https://mourncrown.egowenit.workers.dev';
/** Google sign-in (Google Cloud project 'mourncrown', web client) — public, not a secret */
export const GOOGLE_CLIENT_ID = '481032367362-eu2jvusbdcecpppgnb5gf2bp8a46664b.apps.googleusercontent.com';
const ACC = 'mc_cloud', SAVE_KEY = 'eldergrove_save_v1', DELAY = 12_000;

interface Acc { id: string; token: string; rev: number; google?: boolean; name?: string; admin?: boolean }
export const cloud = { state: 'off' as 'off' | 'ok' | 'saving' | 'error', at: 0 };
/** is this device's account linked to a Google account (the hero loads on any device) */
export const googleLinked = () => ok() && !!acc()?.google;
/** the director's account (the server says so): sees the admin-only class / form switch */
export const isAdmin = () => ok() && !!acc()?.admin;
const ok = () => typeof window !== 'undefined' && typeof fetch === 'function' && typeof localStorage !== 'undefined';
let accCache: Acc | null | undefined;   // (read every frame for the name tag: parsed once)
function acc(): Acc | null { if (accCache !== undefined) return accCache ? { ...accCache } : null; try { accCache = JSON.parse(localStorage.getItem(ACC) ?? 'null'); } catch { accCache = null; } return accCache ? { ...accCache } : null; }
function setAcc(a: Acc) { accCache = { ...a }; try { localStorage.setItem(ACC, JSON.stringify(a)); } catch { /* private mode */ } }
async function req(path: string, init: RequestInit = {}, a = acc()) {
  const r = await fetch(SERVER + path, { ...init, headers: { 'content-type': 'application/json', ...(a ? { 'x-mc-token': a.token } : {}), ...(init.headers ?? {}) } });
  return { status: r.status, body: await r.json().catch(() => ({})) as Record<string, unknown> };
}
/** 🚩 report a player's chat line (the server keeps it for the admin; 3 reporters in a day = no chat for a day) */
export async function reportChat(target: string, text: string, room: string): Promise<'ok' | 'again' | 'limit' | 'fail'> {
  if (!ok() || !acc()) return 'fail';
  try { const r = await req('/report', { method: 'POST', body: JSON.stringify({ target, text, room }) }); return r.status === 429 ? 'limit' : r.status !== 200 ? 'fail' : r.body.again ? 'again' : 'ok'; } catch { return 'fail'; }
}
/** this device's Google sign-in was refused by the server (signed out / an old key): sign in again to get the hero back
 *  (no guest account is made meanwhile — it would start a fresh hero) */
export let relogin = false;
function dropAcc() { accCache = null; try { localStorage.removeItem(ACC); } catch { /* private mode */ } }
async function account(): Promise<Acc | null> {
  const a = acc(); if (a) return a;
  if (relogin) return null;
  const r = await req('/auth/guest', { method: 'POST' }, null);
  if (r.status !== 200) return null;
  const n = { id: String(r.body.id), token: String(r.body.token), rev: 0 }; setAcc(n); return n;
}

let started = false;
/** at boot (before the player presses start): make sure there is an account and take the server's save when it is newer
 *  (played on another device). Never blocks the game. If the server cannot be reached (no signal, or the server is
 *  restarting) it keeps trying by itself — 3 s, 6 s, 12 s ... every 30 s — and `late(took)` tells when it got through. */
export async function cloudBoot(gameStarted: () => boolean, late?: (took: boolean) => void): Promise<boolean> {
  if (!ok() || started) return false; started = true;
  const first = await attempt(gameStarted); if (first !== null) return first;
  let wait = 3000;
  const again = async () => { const t = await attempt(gameStarted); if (t === null) { wait = Math.min(30000, wait * 2); setTimeout(again, wait); } else late?.(t); };
  setTimeout(again, wait);
  return false;
}
/** one try: true / false = connected (true: took the server's newer save), null = could not reach the server */
async function attempt(gameStarted: () => boolean): Promise<boolean | null> {
  let took = false;
  try {
    let a = await account(); if (!a) { cloud.state = 'error'; return relogin ? false : null; }
    let me = await req('/me');   // name / Google link may have been set on another device
    if (me.status === 401) {   // the server does not know this device's key any more
      const wasGoogle = !!a.google; dropAcc();
      if (wasGoogle) { relogin = true; cloud.state = 'error'; return false; }   // sign in with Google again (the title shows the button)
      a = await account(); if (!a) { cloud.state = 'error'; return null; }   // a guest: a new guest account
      me = await req('/me');
    }
    if (me.status === 200) { a.google = !!me.body.google; a.name = me.body.name ? String(me.body.name) : undefined; a.admin = !!me.body.admin; setAcc(a); }
    const r = await req('/save'); if (r.status !== 200) { cloud.state = 'error'; return null; }
    const rev = Number(r.body.rev) || 0;
    if (rev > a.rev && r.body.data && !gameStarted()) { localStorage.setItem(SAVE_KEY, JSON.stringify(r.body.data)); a.rev = rev; setAcc(a); took = true; }
    else if (rev === 0 && localStorage.getItem(SAVE_KEY)) { a.rev = 0; setAcc(a); dirty = true; }
    else if (rev !== a.rev) { a.rev = rev; setAcc(a); }   // (another device moved on while this one is playing: the next write wins)
    cloud.state = 'ok'; cloud.at = Number(r.body.at) || 0;
    if (dirty) flush();
  } catch { cloud.state = 'error'; return null; }
  return took;
}

let dirty = false, timer: ReturnType<typeof setTimeout> | null = null, busy = false;
/** the local save was just written: send it to the server a little later (many saves in a row = one upload) */
export function cloudSaved() {
  if (!ok()) return; dirty = true;
  if (!timer) timer = setTimeout(() => { timer = null; flush(); }, DELAY);
}
export async function flush(keepalive = false) {
  if (!ok() || !dirty || busy) return;
  const a = acc(), raw = localStorage.getItem(SAVE_KEY); if (!a || !raw) return;
  busy = true; dirty = false; cloud.state = 'saving';
  try {
    let r = await req('/save', { method: 'PUT', body: `{"rev":${a.rev},"data":${raw}}`, keepalive });
    if (r.status === 409) { a.rev = Number(r.body.rev) || 0; r = await req('/save', { method: 'PUT', body: `{"rev":${a.rev},"data":${raw}}`, keepalive }); }   // the newest write wins
    if (r.status === 200) { a.rev = Number(r.body.rev); setAcc(a); cloud.state = 'ok'; cloud.at = Number(r.body.at); }
    else { dirty = true; cloud.state = r.status === 429 ? 'ok' : 'error'; if (!timer) timer = setTimeout(() => { timer = null; flush(); }, DELAY); }
  } catch { dirty = true; cloud.state = 'error'; }
  busy = false;
}
if (ok()) document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(true); });

/** a Google sign-in credential from the button: link this device's hero to the Google account, or (that Google account
 *  already has a hero) sign this device in to it and take its save. 'switched' = the save on this device was replaced. */
export async function googleLogin(credential: string): Promise<'linked' | 'switched' | 'fail'> {
  if (!ok()) return 'fail';
  try {
    await flush();   // this device's latest progress reaches its own account first
    const r = await req('/auth/google', { method: 'POST', body: JSON.stringify({ credential }) });
    if (r.status !== 200) return 'fail';
    relogin = false;
    if (r.body.linked) { const a = acc()!; a.google = true; setAcc(a); return 'linked'; }
    const n: Acc = { id: String(r.body.id), token: String(r.body.token), rev: 0, google: true }; setAcc(n);
    const sv = await req('/save');
    if (sv.status === 200 && sv.body.data) { localStorage.setItem(SAVE_KEY, JSON.stringify(sv.body.data)); n.rev = Number(sv.body.rev) || 0; setAcc(n); return 'switched'; }
    dirty = true; flush();   // a new Google account: the hero on this device becomes its hero
    return 'linked';
  } catch { return 'fail'; }
}

/** sign out on this device (menu): the latest progress is sent first, then this device forgets the account and its
 *  local copy — the hero stays on the server with the Google account */
export async function signOut() {
  if (!ok()) return;
  try { dirty = true; await flush(); await req('/auth/logout', { method: 'POST' }); } catch { /* offline: the key just stays unused */ }
  dropAcc(); try { localStorage.removeItem(SAVE_KEY); } catch { /* private mode */ }
}
/** the player's name on the server (null = not chosen yet) */
export const accountName = () => (ok() ? acc()?.name ?? null : null);
/** choose the name once: 'bad' = not allowed (2-16 Thai/English letters, digits, _), 'taken' = someone has it */
export async function chooseName(name: string): Promise<'ok' | 'bad' | 'taken' | 'fail'> {
  if (!ok()) return 'fail';
  try {
    const r = await req('/name', { method: 'POST', body: JSON.stringify({ name }) });
    if (r.status === 200 || (r.status === 409 && r.body.error === 'set')) { const a = acc()!; a.name = String(r.body.name); setAcc(a); return 'ok'; }
    return r.body.error === 'taken' ? 'taken' : r.body.error === 'bad' ? 'bad' : 'fail';
  } catch { return 'fail'; }
}

/** this device's session token (for the map room WebSocket), or null offline */
export const accountToken = () => (ok() ? acc()?.token ?? null : null);
