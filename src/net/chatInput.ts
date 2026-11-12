// The chat line: a small HTML box at the bottom of the screen so the phone's own keyboard (Thai / English) works.
import { tr } from '../core/i18n';

export function askChat(send: (text: string) => void) {
  if (document.getElementById('mc-chat')) return;
  const f = document.createElement('form'); f.id = 'mc-chat';
  f.style.cssText = 'position:fixed;left:50%;bottom:12px;transform:translateX(-50%);z-index:30;display:flex;gap:6px;width:min(520px,92vw);padding:6px;background:rgba(20,14,24,.92);border:1px solid #d9b45a;border-radius:10px;font-family:system-ui,sans-serif';
  f.innerHTML = `<input maxlength="90" autocomplete="off" placeholder="${tr('พิมพ์ข้อความถึงคนในแมพนี้...')}" style="flex:1;font-size:16px;padding:8px 10px;border-radius:7px;border:1px solid #6a5a40;background:#0f0b12;color:#fff;outline:none">
    <button style="font-size:15px;padding:8px 14px;border:0;border-radius:7px;background:#2f6a3a;color:#fff;font-weight:700">${tr('ส่งแชต')}</button>
    <button type="button" class="x" style="font-size:15px;padding:8px 12px;border:0;border-radius:7px;background:#5a1a1a;color:#fff">✕</button>`;
  document.body.append(f);
  const inp = f.querySelector('input')!;
  const close = () => f.remove();
  f.querySelector('.x')!.addEventListener('click', close);
  f.addEventListener('submit', e => { e.preventDefault(); const t = inp.value.trim(); if (t) send(t); close(); });
  setTimeout(() => inp.focus(), 30);
}
