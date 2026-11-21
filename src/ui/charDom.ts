// 👥 "Name your new character" — a small HTML box (the phone's own keyboard works). The server checks the name is free.
import { actServer, refused } from '../net/client';
import { tr } from '../core/i18n';

export function askCharName(done: (slot: number) => void) {
  if (document.getElementById('mc-char')) return;
  const wrap = document.createElement('div'); wrap.id = 'mc-char';
  wrap.style.cssText = 'position:fixed;inset:0;z-index:40;display:grid;place-items:center;background:rgba(6,4,10,.72);font-family:system-ui,sans-serif';
  wrap.innerHTML = `
    <form style="width:min(340px,88vw);padding:18px 18px 16px;background:#1c1520;border:2px solid #d9b45a;border-radius:10px;box-shadow:0 10px 40px rgba(0,0,0,.6);color:#f3e6c4;display:grid;gap:10px">
      <b style="font-size:18px;color:#ffe7a0;text-align:center">${tr('👥 สร้างตัวละครใหม่')}</b>
      <span style="font-size:13px;color:#c8b898;text-align:center">${tr('เริ่มที่ Lv1 ชาวบ้าน แล้วไปเลือกอาชีพกับผู้เฒ่า • ใช้ทอง เพชร VIP หมู่บ้าน และหีบเก็บของร่วมกับตัวอื่น')}</span>
      <input name="n" maxlength="16" autocomplete="off" placeholder="${tr('ชื่อ 2-16 ตัว (ไทย/อังกฤษ/ตัวเลข)')}"
        style="font-size:17px;padding:10px 12px;border-radius:8px;border:2px solid #6a5a40;background:#0f0b12;color:#fff;outline:none">
      <span class="err" style="min-height:16px;font-size:13px;color:#ff8a6a;text-align:center"></span>
      <div style="display:flex;gap:8px"><button type="button" class="no" style="flex:1;font-size:15px;padding:10px;border:0;border-radius:8px;background:#3a2a2a;color:#fff">${tr('ยกเลิก')}</button>
        <button class="ok" style="flex:2;font-size:15px;padding:10px;border:0;border-radius:8px;background:#2f6a3a;color:#fff;font-weight:700">${tr('สร้างตัวละคร')}</button></div>
    </form>`;
  document.body.append(wrap);
  const f = wrap.querySelector('form')!, inp = wrap.querySelector('input')!, err = wrap.querySelector('.err') as HTMLElement, ok = wrap.querySelector('.ok') as HTMLButtonElement;
  (wrap.querySelector('.no') as HTMLElement).onclick = () => wrap.remove();
  setTimeout(() => inp.focus(), 50);
  f.addEventListener('submit', async e => {
    e.preventDefault(); const n = inp.value.trim(); if (!n) return;
    ok.disabled = true; err.textContent = '';
    const r = await actServer('charCreate', { name: n }) as { refused?: string; slot?: number };
    ok.disabled = false;
    if (!refused(r as never) && r.slot) { wrap.remove(); done(r.slot); return; }
    err.textContent = tr(r.refused === 'taken' ? 'ชื่อนี้มีคนใช้แล้ว ลองชื่ออื่น' : r.refused === 'slots' ? 'ช่องตัวละครเต็ม — ซื้อช่องเพิ่มก่อน' : r.refused === 'noname' ? 'ล็อกอิน Google และตั้งชื่อตัวละครแรกก่อน' : 'ใช้ได้เฉพาะตัวอักษรไทย/อังกฤษ/ตัวเลข 2-16 ตัว');
  });
}
