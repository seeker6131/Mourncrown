// "Link a Google account" from the in-game menu (director): a guest plays first; when they like the game they link a
// Google account here and keep everything (the guest hero becomes that Google account's hero, on any device).
// If that Google account already has a hero, the device switches to that hero instead (the box says so first).
import { showGoogleButton } from './googleBtn';
import { tr } from '../core/i18n';

export function openLinkGoogle(done: (r: 'linked' | 'switched') => void) {
  if (document.getElementById('mc-link')) return;
  const wrap = document.createElement('div'); wrap.id = 'mc-link';
  wrap.style.cssText = 'position:fixed;inset:0;z-index:30;display:grid;place-items:center;background:rgba(6,4,10,.72);font-family:system-ui,sans-serif';
  wrap.innerHTML = `
    <div style="width:min(380px,90vw);padding:18px;background:#1c1520;border:2px solid #d9b45a;border-radius:10px;box-shadow:0 10px 40px rgba(0,0,0,.6);color:#f3e6c4;display:grid;gap:10px;text-align:center">
      <b style="font-size:18px;color:#ffe7a0">${tr('🔗 ผูกบัญชี Google')}</b>
      <span style="font-size:14px;line-height:1.5">${tr('ตัวละครและของทั้งหมดที่เล่นแบบแขกมา จะย้ายไปอยู่กับบัญชี Google — ไม่หาย และเข้าเครื่องไหนก็เล่นต่อได้')}</span>
      <span style="font-size:12px;color:#c8b898;line-height:1.5">${tr('ถ้าบัญชี Google นี้เคยมีตัวละครอยู่แล้ว เกมจะสลับไปใช้ตัวละครเดิมของบัญชีนั้นแทน')}</span>
      <div class="slot"></div>
      <span class="err" style="min-height:16px;font-size:13px;color:#ff8a6a"></span>
      <button class="close" style="font-size:15px;padding:8px;border:0;border-radius:8px;background:#4a3a2a;color:#fff">${tr('ปิด')}</button>
    </div>`;
  document.body.append(wrap);
  const err = wrap.querySelector('.err') as HTMLElement;
  const off = showGoogleButton(r => {
    if (r === 'fail') { err.textContent = tr('เข้าสู่ระบบไม่สำเร็จ ลองใหม่อีกครั้ง'); return; }
    off(); wrap.remove(); done(r);
  }, wrap.querySelector('.slot') as HTMLElement);
  (wrap.querySelector('.close') as HTMLElement).onclick = () => { off(); wrap.remove(); };
}
