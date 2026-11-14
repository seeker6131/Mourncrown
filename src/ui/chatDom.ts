// 📜 The chat window (director: like the big games) — slides in from the left side, live, and scrolls back through the
// last lines of each channel (net/chatHub.ts chatStore: up to 200 per channel; the world / guild bring the server's last
// 100 on connect). Tabs: all / world / guild / this map; the box at the bottom sends to the chosen channel.
import { tr } from '../core/i18n';
import { bus } from '../core/events';
import { chatStore, CHAT_KEEP, type ChatCh, type ChatLine } from '../net/chatHub';

type Tab = 'all' | ChatCh;
const COL: Record<ChatCh, string> = { world: '#ffd27a', guild: '#8fffa8', map: '#bfe4ff' };
const TAG: Record<ChatCh, string> = { world: '🌍', guild: '🏛', map: '📍' };
let lastTab: Tab = 'all', lastSend: ChatCh = 'map';
const esc = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export function openChat(o: { send: (text: string, ch: ChatCh) => void; open: () => Record<ChatCh, boolean>; why: Partial<Record<ChatCh, string>>; me: () => string }) {
  if (document.getElementById('mc-chatlog')) { closeChat(); return; }
  const p = document.createElement('div'); p.id = 'mc-chatlog';
  p.style.cssText = 'position:fixed;left:0;top:8vh;bottom:8vh;width:min(380px,86vw);z-index:30;display:flex;flex-direction:column;background:rgba(14,10,18,.9);border:1px solid #d9b45a;border-left:0;border-radius:0 12px 12px 0;box-shadow:4px 0 24px rgba(0,0,0,.5);font-family:system-ui,sans-serif;color:#f3e6c4;transform:translateX(-105%);transition:transform .22s ease-out';
  const tabs: [Tab, string][] = [['all', tr('ทั้งหมด')], ['world', '🌍 ' + tr('แชตโลก')], ['guild', '🏛 ' + tr('แชตกิลด์')], ['map', '📍 ' + tr('แมพนี้')]];
  p.innerHTML = `<div style="display:flex;gap:4px;padding:6px">${tabs.map(([t, n]) => `<button data-t="${t}" style="flex:1;padding:7px 2px;font-size:13px;border:0;border-radius:7px;color:#fff;background:#2a2030">${n}</button>`).join('')}<button class="x" style="padding:7px 10px;border:0;border-radius:7px;background:#5a1a1a;color:#fff">✕</button></div>
    <div class="list" style="flex:1;overflow-y:auto;padding:4px 10px;font-size:14px;line-height:1.45;overscroll-behavior:contain"></div>
    <button class="new" style="display:none;margin:0 10px 4px;padding:5px;border:0;border-radius:7px;background:#3a5a8a;color:#fff;font-size:12px">⬇ ${tr('ข้อความใหม่')}</button>
    <div class="why" style="display:none;padding:0 10px 4px;font-size:12px;color:#c8b89a"></div>
    <form style="display:flex;gap:5px;padding:6px"><button type="button" class="ch" style="padding:8px 8px;border:0;border-radius:7px;font-size:13px;color:#1a1208;font-weight:700"></button>
      <input maxlength="90" autocomplete="off" style="flex:1;min-width:0;font-size:16px;padding:8px 9px;border-radius:7px;border:1px solid #6a5a40;background:#0f0b12;color:#fff;outline:none">
      <button style="padding:8px 12px;border:0;border-radius:7px;background:#2f6a3a;color:#fff;font-weight:700">${tr('ส่งแชต')}</button></form>
    <div style="padding:0 10px 6px;font-size:11px;opacity:.6">${tr('ย้อนดูได้')} ${CHAT_KEEP} ${tr('ข้อความล่าสุดต่อช่อง')}</div>`;
  document.body.append(p);
  requestAnimationFrame(() => { p.style.transform = 'translateX(0)'; });
  const list = p.querySelector<HTMLDivElement>('.list')!, newBtn = p.querySelector<HTMLButtonElement>('.new')!, whyEl = p.querySelector<HTMLDivElement>('.why')!;
  const chBtn = p.querySelector<HTMLButtonElement>('.ch')!, inp = p.querySelector('input')!;
  let tab: Tab = lastTab;
  const lines = (): ChatLine[] => tab === 'all' ? [...chatStore.world, ...chatStore.guild, ...chatStore.map].sort((a, b) => (a.at ?? 0) - (b.at ?? 0)).slice(-CHAT_KEEP) : chatStore[tab];
  const hhmm = (t?: number) => t ? new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  const atBottom = () => list.scrollHeight - list.scrollTop - list.clientHeight < 30;
  const draw = (stick: boolean) => {
    const me = o.me();
    list.innerHTML = lines().map(l => `<div style="margin:1px 0;word-break:break-word"><span style="opacity:.5;font-size:11px">${hhmm(l.at)}</span> ${tab === 'all' ? TAG[l.ch] + ' ' : ''}<b style="color:${l.id && l.id === me ? '#ffe7a0' : COL[l.ch]}">${esc(l.name || '?')}</b>: ${esc(l.text)}</div>`).join('') || `<div style="opacity:.6;padding:12px 0">${tr('ยังไม่มีข้อความในช่องนี้')}</div>`;
    if (stick) { list.scrollTop = list.scrollHeight; newBtn.style.display = 'none'; }
  };
  const sendCh = (): ChatCh => tab === 'all' ? lastSend : tab;
  const drawCh = () => {
    const c = sendCh(), on = o.open()[c];
    chBtn.textContent = TAG[c]; chBtn.style.background = COL[c]; chBtn.style.opacity = on ? '1' : '.45';
    whyEl.textContent = on ? '' : tr(o.why[c] ?? 'ช่องนี้ยังใช้ไม่ได้'); whyEl.style.display = on ? 'none' : 'block';
    p.querySelectorAll<HTMLButtonElement>('button[data-t]').forEach(b => { b.style.outline = b.dataset.t === tab ? '2px solid #ffe7a0' : 'none'; });
  };
  const pick = (t: Tab) => { tab = t; lastTab = t; if (t !== 'all') lastSend = t; draw(true); drawCh(); };
  p.querySelectorAll<HTMLButtonElement>('button[data-t]').forEach(b => b.onclick = () => pick(b.dataset.t as Tab));
  chBtn.onclick = () => { const order: ChatCh[] = ['map', 'world', 'guild'], open = o.open(); let i = order.indexOf(sendCh()); for (let k = 0; k < 3; k++) { i = (i + 1) % 3; if (open[order[i]]) break; } lastSend = order[i]; if (tab !== 'all') { tab = lastSend; lastTab = tab; draw(true); } drawCh(); };
  newBtn.onclick = () => { list.scrollTop = list.scrollHeight; newBtn.style.display = 'none'; };
  list.onscroll = () => { if (atBottom()) newBtn.style.display = 'none'; };
  p.querySelector('form')!.addEventListener('submit', e => { e.preventDefault(); const t = inp.value.trim(), c = sendCh(); if (!t) return; if (!o.open()[c]) { drawCh(); return; } o.send(t, c); inp.value = ''; });
  p.querySelector<HTMLButtonElement>('.x')!.onclick = closeChat;
  // live: a new line in a channel this tab shows — stay at the bottom if you were there, else a "new messages" button
  const onStore = (ch: ChatCh) => { if (tab !== 'all' && tab !== ch) return; const stick = atBottom(); draw(stick); if (!stick) newBtn.style.display = 'block'; };
  bus.on('chat:store', onStore); (p as unknown as { off: () => void }).off = () => bus.off('chat:store', onStore);
  pick(tab);
}
export function closeChat() {
  const p = document.getElementById('mc-chatlog'); if (!p) return;
  (p as unknown as { off?: () => void }).off?.(); p.style.transform = 'translateX(-105%)'; setTimeout(() => p.remove(), 230);
}
