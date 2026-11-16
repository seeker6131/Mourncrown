// 📱 Playing on several devices (director 16 Nov: "like any game"). Boxes for:
// - a short code to sign in on another device (no Google needed),
// - typing that code on the new device,
// - "switch hero?" before this device's hero is swapped (Google or code) — the old one is kept on the device,
// - going back to a hero this device played before,
// - "this hero is being played on another device" (only one device plays at a time; tap to play here).
import { makeCode, useCode, prevHeroes, switchBack, setAskSwitch, type HeroSum } from './cloud';
import { tr } from '../core/i18n';
import { bus } from '../core/events';

const esc = (s: string) => s.replace(/[<>&"]/g, '');
const hero = (h: HeroSum | null) => h ? `<b>${esc(h.name)}</b> Lv${h.level}` : tr('ตัวละครใหม่');
function box(id: string, html: string) {
  document.getElementById(id)?.remove();
  const w = document.createElement('div'); w.id = id;
  w.style.cssText = 'position:fixed;inset:0;z-index:60;display:grid;place-items:center;background:rgba(6,4,10,.78);font-family:system-ui,sans-serif';
  w.innerHTML = `<div style="width:min(380px,90vw);padding:18px;background:#1c1520;border:2px solid #d9b45a;border-radius:10px;box-shadow:0 10px 40px rgba(0,0,0,.6);color:#f3e6c4;display:grid;gap:10px;text-align:center;font-size:14px;line-height:1.5">${html}</div>`;
  document.body.append(w); return w;
}
const btn = (cls: string, label: string, bg = '#4a3a2a') => `<button class="${cls}" style="font:600 15px system-ui;padding:9px;border:0;border-radius:8px;background:${bg};color:#fff">${label}</button>`;

/** "switch hero?" — asked before this device's hero is swapped for another */
setAskSwitch((here, there) => new Promise(res => {
  const w = box('mc-askswitch', `<b style="font-size:18px;color:#ffe7a0">${tr('🔁 สลับตัวละคร?')}</b>
    <div>${tr('เครื่องนี้ตอนนี้')}: ${hero(here)}</div><div style="font-size:20px">⬇</div><div>${tr('จะเปลี่ยนเป็น')}: ${hero(there)}</div>
    <span style="font-size:12px;color:#c8b898">${tr('ตัวละครเดิมบนเครื่องนี้ไม่หาย — กลับมาเล่นได้ที่ "↩ ตัวละครเดิมบนเครื่องนี้"')}</span>
    ${btn('yes', tr('✔ สลับเลย'), '#1f5a2a')}${btn('no', tr('✖ ไม่สลับ เล่นตัวนี้ต่อ'))}`);
  (w.querySelector('.yes') as HTMLElement).onclick = () => { w.remove(); res(true); };
  (w.querySelector('.no') as HTMLElement).onclick = () => { w.remove(); res(false); };
}));

/** on the device that has the hero: show a code to type on the other device */
export function openShowCode() {
  const w = box('mc-code', `<b style="font-size:18px;color:#ffe7a0">${tr('📱 เล่นบนอีกเครื่อง')}</b><div class="c" style="font:800 30px ui-monospace,monospace;letter-spacing:4px;color:#ffd84a;padding:8px;background:#0f0b14;border-radius:8px">...</div>
    <span>${tr('บนเครื่องใหม่: เปิดเกม → หน้าแรกกด "📱 ใส่โค้ดย้ายเครื่อง" → พิมพ์โค้ดนี้')}</span>
    <span style="font-size:12px;color:#c8b898">${tr('ใช้ได้ 10 นาที ครั้งเดียว • ทั้งสองเครื่องเข้าเล่นได้ แต่เล่นได้ทีละเครื่อง • ห้ามบอกโค้ดคนอื่น')}</span>${btn('close', tr('ปิด'))}`);
  const c = w.querySelector('.c') as HTMLElement;
  makeCode().then(code => { c.textContent = code ? `${code.slice(0, 4)}-${code.slice(4)}` : tr('ไม่สำเร็จ ลองใหม่'); });
  (w.querySelector('.close') as HTMLElement).onclick = () => w.remove();
}

/** on the new device: type the code */
export function openEnterCode(done: () => void) {
  const w = box('mc-code', `<b style="font-size:18px;color:#ffe7a0">${tr('📱 ใส่โค้ดย้ายเครื่อง')}</b>
    <span style="font-size:13px">${tr('เครื่องเดิม: เมนู → "📱 เล่นบนอีกเครื่อง (รับโค้ด)"')}</span>
    <input class="i" maxlength="9" autocapitalize="characters" autocomplete="off" placeholder="XXXX-XXXX" style="font:800 24px ui-monospace,monospace;letter-spacing:3px;text-align:center;padding:8px;border-radius:8px;border:1px solid #d9b45a;background:#0f0b14;color:#ffd84a">
    <span class="e" style="min-height:18px;font-size:13px;color:#ff8a6a"></span>${btn('go', tr('✔ ตกลง'), '#1f5a2a')}${btn('close', tr('ปิด'))}`);
  const i = w.querySelector('.i') as HTMLInputElement, e = w.querySelector('.e') as HTMLElement, go = w.querySelector('.go') as HTMLButtonElement;
  i.focus();
  go.onclick = async () => {
    go.disabled = true; e.textContent = tr('กำลังตรวจโค้ด...');
    const r = await useCode(i.value); go.disabled = false;
    if (r === 'switched') { w.remove(); done(); return; }
    e.textContent = r === 'cancel' ? tr('ยกเลิกแล้ว') : r === 'code' ? tr('โค้ดไม่ถูกหรือหมดอายุ (10 นาที) — ขอโค้ดใหม่จากเครื่องเดิม') : r === 'rate' ? tr('ใส่ผิดหลายครั้ง รอ 10 นาทีแล้วลองใหม่') : r === 'banned' ? tr('บัญชีนี้ถูกระงับ') : tr('ต่อเซิร์ฟไม่ได้ ลองใหม่อีกครั้ง');
  };
  i.onkeydown = ev => { if (ev.key === 'Enter') go.click(); };
  (w.querySelector('.close') as HTMLElement).onclick = () => w.remove();
}

/** heroes this device played before (kept after a switch) */
export function openPrev(done: () => void) {
  const list = prevHeroes();
  const w = box('mc-code', `<b style="font-size:18px;color:#ffe7a0">${tr('↩ ตัวละครเดิมบนเครื่องนี้')}</b>
    ${list.length ? list.map((p, i) => btn('p" data-i="' + i, `${esc(p.hero.name)} Lv${p.hero.level}`, '#2a4a6a')).join('') : `<span>${tr('ไม่มี')}</span>`}
    <span class="e" style="min-height:18px;font-size:13px;color:#ff8a6a"></span>${btn('close', tr('ปิด'))}`);
  const e = w.querySelector('.e') as HTMLElement;
  w.querySelectorAll<HTMLButtonElement>('button[data-i]').forEach(b => b.onclick = async () => {
    e.textContent = tr('กำลังสลับ...');
    const r = await switchBack(Number(b.dataset.i));
    if (r === 'switched') { w.remove(); done(); return; }
    e.textContent = r === 'gone' ? tr('ตัวละครนี้ออกจากระบบไปแล้ว (ใช้ Google หรือโค้ดเพื่อเข้าใหม่)') : tr('ต่อเซิร์ฟไม่ได้ ลองใหม่อีกครั้ง');
  });
  (w.querySelector('.close') as HTMLElement).onclick = () => w.remove();
}

/** another device opened this hero: this one stops; tap to play here instead (the other one stops then) */
bus.on('net:kicked', () => {
  const w = box('mc-kicked', `<b style="font-size:18px;color:#ffe7a0">${tr('📱 ตัวละครนี้เปิดเล่นบนอีกเครื่อง')}</b>
    <span>${tr('เล่นได้ทีละเครื่อง เครื่องนี้หยุดไว้ก่อน ของไม่หาย')}</span>${btn('here', tr('▶ เล่นบนเครื่องนี้แทน'), '#1f5a2a')}`);
  (w.querySelector('.here') as HTMLElement).onclick = () => location.reload();
});
