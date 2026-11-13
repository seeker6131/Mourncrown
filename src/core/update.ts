// A new version of the game is out (director: players with the game left open must not need to reload by hand).
// Every 2 minutes the game asks the site for version.json; when it names another build, a note says so and the game
// reloads by itself at the next map change (never in the middle of a fight). Offline / in development: nothing happens.
import { bus, EV } from './events';

let ready = false, told = false, newest = '';
/** a new build is out and this page has not already reloaded for it (no reload loops if the site is slow to update) */
export const updateReady = () => { if (!ready) return false; try { return sessionStorage.getItem('mcReloadFor') !== newest; } catch { return true; } };
/** reload now for the new build (the caller saved the game) */
export function reloadForUpdate() { try { sessionStorage.setItem('mcReloadFor', newest); } catch { /* private mode */ } location.reload(); }
export function watchUpdates() {
  if (typeof location === 'undefined' || !/^https?:$/.test(location.protocol)) return;
  const check = async () => {
    try {
      const r = await fetch('./version.json?t=' + Date.now(), { cache: 'no-store' }); if (!r.ok) return;
      const v = await r.json() as { b?: string };
      if (v.b && v.b !== __BUILD__) { ready = true; newest = v.b; if (!told) { told = true; bus.emit(EV.TOAST, '🔄 มีเกมเวอร์ชันใหม่ — จะโหลดใหม่ให้เองตอนเปลี่ยนแมพ', '#9fd4ff'); } }
    } catch { /* offline: try again later */ }
  };
  setTimeout(check, 30000); setInterval(check, 120000);
}
