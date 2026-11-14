// 💳 The top-up window: an HTML box over the game (the phone's own file picker works for the slip). Shows the director's
// bank QR with the price written in, a button to save the QR (to open it in the bank app on the same phone), and the slip
// upload. The server checks the slip (server/worker.ts /pay/slip → Thunder); the diamonds arrive by the game's connection.
import { payQr, paySlip } from '../net/cloud';
import { qrDataUrl } from '../core/qr';
import { SLIP_WHY, packOf } from '../systems/topup';
import { tr } from '../core/i18n';

const ID = 'mc-topup';
/** the slip picture made smaller (keeps the QR in the corner readable) → base64 JPEG */
async function shrink(f: File): Promise<string> {
  const url = URL.createObjectURL(f);
  try {
    const im = new Image(); await new Promise<void>((ok, bad) => { im.onload = () => ok(); im.onerror = () => bad(new Error('img')); im.src = url; });
    const k = Math.min(1, 1600 / Math.max(im.width, im.height)), c = document.createElement('canvas');
    c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
    const g = c.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.9);
  } finally { URL.revokeObjectURL(url); }
}

export async function openTopup(packId: string, toast: (text: string, color?: string) => void, done?: () => void) {
  if (document.getElementById(ID)) return;
  const p = packOf(packId); if (!p) return;
  const q = await payQr(packId);
  if ('error' in q) { toast(tr(SLIP_WHY[q.error] ?? SLIP_WHY.service), '#ff9a6a'); return; }
  const wrap = document.createElement('div'); wrap.id = ID;
  wrap.style.cssText = 'position:fixed;inset:0;z-index:40;display:grid;place-items:center;background:rgba(6,4,10,.78);font-family:system-ui,sans-serif;overflow:auto;padding:12px 0';
  const img = qrDataUrl(q.qr, 6, 4);
  wrap.innerHTML = `
    <div style="position:relative;width:min(360px,92vw);padding:16px 16px 14px;background:#141c22;border:2px solid #5ac8e8;border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,.6);color:#e8f4f8;display:grid;gap:9px;text-align:center">
      <button class="x" aria-label="close" style="position:absolute;top:6px;right:8px;background:none;border:0;color:#9ab;font-size:22px;cursor:pointer">✕</button>
      <b style="font-size:18px;color:#8fe8ff">${tr('💳 เติมเพชร')}</b>
      <div style="font-size:15px">${tr('ได้รับ')} <b style="color:#8fe8ff">💎 ${q.dia.toLocaleString()}</b>${q.first ? `<br><span style="font-size:12px;color:#9fffb0">${tr('รวมโบนัสเติมครั้งแรก (เพชรหลัก x2)')}</span>` : ''}</div>
      <img src="${img}" alt="QR" style="width:min(240px,70vw);margin:0 auto;border-radius:6px;image-rendering:pixelated;background:#fff">
      <div style="font-size:20px;font-weight:700;color:#fff">${tr('ยอดโอน')} ฿${q.thb.toFixed(2)}</div>
      <div style="font-size:12.5px;color:#b8c8d0;line-height:1.5">${tr('สแกนด้วยแอปธนาคาร ยอดจะขึ้นเอง — ห้ามแก้ยอด')}<br>${tr('เล่นบนมือถือเครื่องเดียวกัน: กดบันทึกรูป QR แล้วเปิดแอปธนาคาร → สแกน → เลือกรูปจากเครื่อง')}</div>
      <a class="save" download="mourncrown-qr-${q.thb}.png" href="${img}" style="display:block;padding:9px;border-radius:8px;background:#26404c;color:#fff;text-decoration:none;font-size:14px">${tr('💾 บันทึกรูป QR')}</a>
      <label class="up" style="display:block;padding:11px;border-radius:8px;background:#2f6a3a;color:#fff;font-weight:700;font-size:15px;cursor:pointer">${tr('📎 โอนแล้ว — อัปโหลดสลิป')}<input type="file" accept="image/*" style="display:none"></label>
      <div class="msg" style="min-height:18px;font-size:13px;color:#ffd84a"></div>
      <div style="font-size:11px;color:#7a8a90">${tr('ระบบตรวจสลิปอัตโนมัติ: ต้องโอนเข้าบัญชีของเกม ยอดตรงแพ็ก และเป็นสลิปใหม่ • มีปัญหาแจ้งแอดมินพร้อมสลิปในดิสคอร์ด')}</div>
    </div>`;
  document.body.append(wrap);
  const close = () => { wrap.remove(); done?.(); };
  const msg = wrap.querySelector('.msg') as HTMLElement, inp = wrap.querySelector('input')!, up = wrap.querySelector('.up') as HTMLElement;
  (wrap.querySelector('.x') as HTMLElement).onclick = close;
  wrap.addEventListener('click', e => { if (e.target === wrap) close(); });
  let busy = false;
  inp.addEventListener('change', async () => {
    const f = inp.files?.[0]; inp.value = ''; if (!f || busy) return;
    busy = true; up.style.opacity = '.5'; msg.style.color = '#ffd84a'; msg.textContent = tr('กำลังตรวจสลิป…');
    let r: Awaited<ReturnType<typeof paySlip>>;
    try { r = await paySlip(packId, await shrink(f)); } catch { r = { error: 'image' }; }
    busy = false; up.style.opacity = '1';
    if ('ok' in r) {
      msg.style.color = '#9fffb0'; msg.textContent = `✅ ${tr('เติมสำเร็จ! ได้รับ')} 💎 ${r.dia.toLocaleString()}`;
      up.style.display = 'none'; (wrap.querySelector('.save') as HTMLElement).style.display = 'none';
    } else { msg.style.color = '#ff8a6a'; msg.textContent = tr(SLIP_WHY[r.error] ?? SLIP_WHY.service); }
  });
}
