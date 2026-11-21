// 🚩 Report a chat line: the last lines other players wrote in this map, each with a report button (HTML, like the chat box).
import { tr } from '../core/i18n';
import { reportChat } from './cloud';

export interface ChatLine { id: string; name: string; text: string }
export function openReport(lines: ChatLine[], room: string, done: (msg: string, col: string) => void) {
  if (document.getElementById('mc-report')) return;
  const box = document.createElement('div'); box.id = 'mc-report';
  box.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:31;width:min(520px,92vw);max-height:80vh;overflow:auto;padding:12px;background:rgba(20,14,24,.96);border:1px solid #d9b45a;border-radius:10px;font:14px system-ui,sans-serif;color:#ece4d6';
  const esc = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
  const rows = lines.length ? lines.map((l, i) => `<div style="display:flex;gap:8px;align-items:center;padding:6px 0;border-top:1px solid #3a3040"><div style="flex:1"><b style="color:#9fd4ff">${esc(l.name)}</b>: ${esc(l.text)}</div><button data-i="${i}" style="font-size:13px;padding:6px 10px;border:0;border-radius:7px;background:#7a1a10;color:#fff">🚩 ${tr('รายงาน')}</button></div>`).join('')
    : `<div style="padding:10px 0;color:#a89878">${tr('ยังไม่มีข้อความจากผู้เล่นคนอื่น')}</div>`;
  box.innerHTML = `<div style="font-weight:700;color:#f3d38a;margin-bottom:6px">🚩 ${tr('รายงานแชตไม่เหมาะสม')}</div><div style="font-size:12px;color:#a89878;margin-bottom:6px">${tr('ถูกรายงานจาก 3 คนขึ้นไปใน 1 วัน = ปิดแชต 1 วัน • แอดมินดูรายงานทุกข้อความ')}</div>${rows}<button class="x" style="margin-top:10px;width:100%;font-size:15px;padding:8px;border:0;border-radius:7px;background:#3a2a2a;color:#fff">${tr('ปิด')}</button>`;
  document.body.append(box);
  const close = () => box.remove();
  box.querySelector('.x')!.addEventListener('click', close);
  box.querySelectorAll<HTMLButtonElement>('button[data-i]').forEach(b => b.addEventListener('click', async () => {
    const l = lines[Number(b.dataset.i)]; b.disabled = true; b.textContent = '...';
    const r = await reportChat(l.id, l.text, room); close();
    done(r === 'ok' ? `🚩 ${tr('รายงาน')} ${l.name} ${tr('แล้ว — ขอบคุณที่ช่วยดูแล')}` : r === 'again' ? tr('รายงานคนนี้ไปแล้ววันนี้') : r === 'limit' ? tr('วันนี้รายงานครบ 10 ครั้งแล้ว') : tr('ส่งรายงานไม่สำเร็จ ลองใหม่อีกครั้ง'), r === 'ok' ? '#9fffb0' : '#ffb080');
  }));
}
