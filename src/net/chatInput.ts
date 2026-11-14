// The chat line: a small HTML box at the bottom of the screen so the phone's own keyboard (Thai / English) works.
import { tr } from '../core/i18n';

export type Chan = 'map' | 'world' | 'guild';
let last: Chan = 'map';
/** the chat line with channel tabs: this map / the whole world / my guild (channels that are not open are greyed out) */
export function askChat(send: (text: string, ch: Chan) => void, open: Record<Chan, boolean>, why: Partial<Record<Chan, string>> = {}) {
  if (document.getElementById('mc-chat')) return;
  let ch: Chan = open[last] ? last : (['map', 'world', 'guild'] as Chan[]).find(c => open[c]) ?? 'map';
  const f = document.createElement('form'); f.id = 'mc-chat';
  f.style.cssText = 'position:fixed;left:50%;bottom:12px;transform:translateX(-50%);z-index:30;display:flex;flex-direction:column;gap:6px;width:min(520px,92vw);padding:6px;background:rgba(20,14,24,.92);border:1px solid #d9b45a;border-radius:10px;font-family:system-ui,sans-serif';
  const COL: Record<Chan, string> = { map: '#2a4a5a', world: '#6a4a10', guild: '#1f4a2a' }, NAME: Record<Chan, string> = { map: '📍 ' + tr('แมพนี้'), world: '🌍 ' + tr('แชตโลก'), guild: '🏛 ' + tr('แชตกิลด์') };
  const tabs = (['map', 'world', 'guild'] as Chan[]).map(c => `<button type="button" data-c="${c}" style="flex:1;font-size:13px;padding:6px 4px;border:0;border-radius:7px;color:#fff;background:${COL[c]};opacity:${open[c] ? 1 : 0.4}">${NAME[c]}</button>`).join('');
  f.innerHTML = `<div style="display:flex;gap:6px">${tabs}</div><div class="why" style="font-size:12px;color:#c8b89a;display:none"></div>
    <div style="display:flex;gap:6px"><input maxlength="90" autocomplete="off" style="flex:1;font-size:16px;padding:8px 10px;border-radius:7px;border:1px solid #6a5a40;background:#0f0b12;color:#fff;outline:none">
    <button style="font-size:15px;padding:8px 14px;border:0;border-radius:7px;background:#2f6a3a;color:#fff;font-weight:700">${tr('ส่งแชต')}</button>
    <button type="button" class="x" style="font-size:15px;padding:8px 12px;border:0;border-radius:7px;background:#5a1a1a;color:#fff">✕</button></div>`;
  document.body.append(f);
  const inp = f.querySelector('input')!, whyEl = f.querySelector<HTMLDivElement>('.why')!;
  const PH: Record<Chan, string> = { map: tr('พิมพ์ข้อความถึงคนในแมพนี้...'), world: tr('พิมพ์ถึงทุกคนในเกม (ส่งได้ทุก 5 วิ)...'), guild: tr('พิมพ์ถึงสมาชิกกิลด์...') };
  const pick = (c: Chan) => {
    if (!open[c]) { whyEl.textContent = tr(why[c] ?? 'ช่องนี้ยังใช้ไม่ได้'); whyEl.style.display = 'block'; return; }
    ch = c; last = c; whyEl.style.display = 'none'; inp.placeholder = PH[c];
    f.querySelectorAll<HTMLButtonElement>('button[data-c]').forEach(b => { b.style.outline = b.dataset.c === c ? '2px solid #ffe7a0' : 'none'; });
  };
  f.querySelectorAll<HTMLButtonElement>('button[data-c]').forEach(b => b.addEventListener('click', () => pick(b.dataset.c as Chan)));
  pick(ch);
  const close = () => f.remove();
  f.querySelector('.x')!.addEventListener('click', close);
  f.addEventListener('submit', e => { e.preventDefault(); const t = inp.value.trim(); if (t) send(t, ch); close(); });
  setTimeout(() => inp.focus(), 30);
}
