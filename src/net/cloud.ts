// The save kept on the game server (server/worker.ts on Cloudflare). Every device gets a guest account by itself; a
// Google login (when GOOGLE_CLIENT_ID is set) links it, so the same hero loads on any phone. The game keeps working
// offline: the local save is always written first, the server copy follows a few seconds later.
// ⚠️ Step 1: the server stores what the game sends. Step 2 moves the rules (src/server/handlers.ts) to the server.
export const SERVER = 'https://mourncrown.egowenit.workers.dev';
const ACC = 'mc_cloud', SAVE_KEY = 'eldergrove_save_v1', DELAY = 12_000;

interface Acc { id: string; token: string; rev: number }
export const cloud = { state: 'off' as 'off' | 'ok' | 'saving' | 'error', at: 0, google: false };
const ok = () => typeof window !== 'undefined' && typeof fetch === 'function' && typeof localStorage !== 'undefined';
function acc(): Acc | null { try { return JSON.parse(localStorage.getItem(ACC) ?? 'null'); } catch { return null; } }
function setAcc(a: Acc) { try { localStorage.setItem(ACC, JSON.stringify(a)); } catch { /* private mode */ } }
async function req(path: string, init: RequestInit = {}, a = acc()) {
  const r = await fetch(SERVER + path, { ...init, headers: { 'content-type': 'application/json', ...(a ? { 'x-mc-token': a.token } : {}), ...(init.headers ?? {}) } });
  return { status: r.status, body: await r.json().catch(() => ({})) as Record<string, unknown> };
}
async function account(): Promise<Acc | null> {
  const a = acc(); if (a) return a;
  const r = await req('/auth/guest', { method: 'POST' }, null);
  if (r.status !== 200) return null;
  const n = { id: String(r.body.id), token: String(r.body.token), rev: 0 }; setAcc(n); return n;
}

let started = false;
/** at boot (before the player presses start): make sure there is an account and take the server's save when it is newer
 *  (played on another device). Never blocks the game; offline = nothing happens. */
export async function cloudBoot(gameStarted: () => boolean): Promise<boolean> {
  if (!ok() || started) return false; started = true; let took = false;
  try {
    const a = await account(); if (!a) { cloud.state = 'error'; return false; }
    const r = await req('/save'); if (r.status !== 200) { cloud.state = 'error'; return false; }
    const rev = Number(r.body.rev) || 0;
    if (rev > a.rev && r.body.data && !gameStarted()) { localStorage.setItem(SAVE_KEY, JSON.stringify(r.body.data)); a.rev = rev; setAcc(a); took = true; }
    else if (rev === 0 && localStorage.getItem(SAVE_KEY)) { a.rev = 0; setAcc(a); dirty = true; }
    else if (rev !== a.rev) { a.rev = rev; setAcc(a); }   // (another device moved on while this one is playing: the next write wins)
    cloud.state = 'ok'; cloud.at = Number(r.body.at) || 0;
    if (dirty) flush();
  } catch { cloud.state = 'error'; }
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
