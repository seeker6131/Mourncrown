// "Name your hero" — asked once, right after the first Google sign-in (director). A small HTML box over the title screen
// so the phone's own keyboard (Thai / English) works. The server checks the name (net/cloud.ts chooseName).
import { chooseName } from './cloud';
import { tr } from '../core/i18n';

export function askName(done: (name: string) => void) {
  if (document.getElementById('mc-name')) return;
  const wrap = document.createElement('div'); wrap.id = 'mc-name';
  wrap.style.cssText = 'position:fixed;inset:0;z-index:30;display:grid;place-items:center;background:rgba(6,4,10,.72);font-family:system-ui,sans-serif';
  wrap.innerHTML = `
    <form style="width:min(340px,88vw);padding:18px 18px 16px;background:#1c1520;border:2px solid #d9b45a;border-radius:10px;box-shadow:0 10px 40px rgba(0,0,0,.6);color:#f3e6c4;display:grid;gap:10px">
      <b style="font-size:18px;color:#ffe7a0;text-align:center">${tr('ตั้งชื่อตัวละคร')}</b>
      <span style="font-size:13px;color:#c8b898;text-align:center">${tr('ชื่อจะแสดงบนหัวตัวละคร ให้ผู้เล่นคนอื่นเห็น • ตั้งได้ครั้งเดียว')}</span>
      <input name="n" maxlength="16" autocomplete="off" placeholder="${tr('ชื่อ 2-16 ตัว (ไทย/อังกฤษ/ตัวเลข)')}"
        style="font-size:17px;padding:10px 12px;border-radius:8px;border:2px solid #6a5a40;background:#0f0b12;color:#fff;outline:none">
      <span class="err" style="min-height:16px;font-size:13px;color:#ff8a6a;text-align:center"></span>
      <button style="font-size:16px;padding:10px;border:0;border-radius:8px;background:#2f6a3a;color:#fff;font-weight:700">${tr('ยืนยันชื่อ')}</button>
    </form>`;
  document.body.append(wrap);
  const f = wrap.querySelector('form')!, inp = wrap.querySelector('input')!, err = wrap.querySelector('.err') as HTMLElement, btn = wrap.querySelector('button')!;
  setTimeout(() => inp.focus(), 50);
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const n = inp.value.trim(); if (!n) return;
    btn.disabled = true; err.textContent = '';
    const r = await chooseName(n);
    btn.disabled = false;
    if (r === 'ok') { wrap.remove(); done(n); return; }
    err.textContent = tr(r === 'taken' ? 'ชื่อนี้มีคนใช้แล้ว ลองชื่ออื่น' : r === 'bad' ? 'ใช้ได้เฉพาะตัวอักษรไทย/อังกฤษ ตัวเลข และ _ ยาว 2-16 ตัว (ห้ามคำหยาบ)' : 'เชื่อมต่อเซิร์ฟไม่ได้ ลองใหม่อีกครั้ง');
  });
}
