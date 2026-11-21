// A new version of the game is out (director): a popup counts down 1 minute with a button to reload now; when the
// minute is up the game reloads by itself. After the reload the player is back on the same map and spot, with auto
// still on (core/resume.ts). In a dungeon run / raid / war the reload waits until it ends. Offline / dev: nothing.
import { tr } from './i18n';
import { keepResume, resumeBusy } from './resume';

const SECS = 60;
let newest = '', shown = false;
/** a new build is out and this page has not already reloaded for it (no reload loops if the site is slow to update) */
const fresh = () => { try { return sessionStorage.getItem('mcReloadFor') !== newest; } catch { return true; } };
/** reload now for the new build: saves where the player is first */
export function reloadForUpdate() {
  keepResume();
  try { sessionStorage.setItem('mcReloadFor', newest); } catch { /* private mode */ }
  location.reload();
}
function popup() {
  if (shown || document.getElementById('mc-update')) return; shown = true;
  const box = document.createElement('div'); box.id = 'mc-update';
  box.style.cssText = 'position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:40;display:flex;align-items:center;gap:12px;padding:10px 14px;background:#1c1520f2;border:2px solid #d9b45a;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.6);color:#f3e6c4;font:14px system-ui,sans-serif;max-width:94vw';
  box.innerHTML = `<span>🔄 <b style="color:#ffe7a0">${tr('มีอัปเดตเกมใหม่!')}</b> <span class="t"></span></span>
    <button style="font-size:14px;padding:7px 12px;border:0;border-radius:8px;background:#2f6a3a;color:#fff;font-weight:700;white-space:nowrap">${tr('🔄 รีเกมเลย')}</button>`;
  document.body.append(box);
  const t = box.querySelector('.t') as HTMLElement, btn = box.querySelector('button') as HTMLButtonElement;
  let left = SECS;
  const tick = () => {
    if (left > 0) t.textContent = tr('เกมจะรีเองใน') + ` ${left} ` + tr('วินาที — กลับมาที่เดิมให้');
    else if (resumeBusy()) t.textContent = tr('จะรีให้หลังจบดันเจี้ยน/สงคราม');
    else { reloadForUpdate(); return; }
    left = Math.max(0, left - 1); setTimeout(tick, 1000);
  };
  btn.onclick = () => { if (resumeBusy()) { t.textContent = tr('จะรีให้หลังจบดันเจี้ยน/สงคราม'); left = 0; return; } btn.disabled = true; reloadForUpdate(); };
  tick();
}
export function watchUpdates() {
  if (typeof location === 'undefined' || !/^https?:$/.test(location.protocol)) return;
  const check = async () => {
    try {
      const r = await fetch('./version.json?t=' + Date.now(), { cache: 'no-store' }); if (!r.ok) return;
      const v = await r.json() as { b?: string };
      if (v.b && v.b !== __BUILD__) { newest = v.b; if (fresh()) popup(); }
    } catch { /* offline: try again later */ }
  };
  setTimeout(check, 30000); setInterval(check, 120000);
}
