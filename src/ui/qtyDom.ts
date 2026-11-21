// 🔢 "How many?" — a small HTML box (the phone's number pad works): type a number or tap 1 / 5 / 10 / 20 / max, see the total.
import { tr } from '../core/i18n';

export function askQty(o: { title: string; price: number; max: number; unit?: string }, ok: (n: number) => void) {
  if (document.getElementById('mc-qty') || o.max < 1) return;
  const wrap = document.createElement('div'); wrap.id = 'mc-qty';
  wrap.style.cssText = 'position:fixed;inset:0;z-index:40;display:grid;place-items:center;background:rgba(6,4,10,.6);font-family:system-ui,sans-serif';
  const quick = [1, 5, 10, 20].filter(n => n < o.max);
  wrap.innerHTML = `
    <form style="width:min(320px,88vw);padding:16px;background:#1c1520;border:2px solid #d9b45a;border-radius:10px;box-shadow:0 10px 40px rgba(0,0,0,.6);color:#f3e6c4;display:grid;gap:10px;text-align:center">
      <b style="font-size:16px;color:#ffe7a0">${o.title}</b>
      <div style="display:flex;gap:6px;align-items:center;justify-content:center">
        <button type="button" data-d="-1" style="width:42px;height:42px;font-size:22px;border:0;border-radius:8px;background:#3a2a20;color:#fff">−</button>
        <input type="number" inputmode="numeric" min="1" max="${o.max}" value="1" style="width:90px;font-size:22px;text-align:center;padding:6px;border-radius:8px;border:2px solid #6a5a40;background:#0f0b12;color:#fff">
        <button type="button" data-d="1" style="width:42px;height:42px;font-size:22px;border:0;border-radius:8px;background:#3a2a20;color:#fff">+</button>
      </div>
      <div style="display:flex;gap:6px;justify-content:center;flex-wrap:wrap">${quick.map(n => `<button type="button" data-n="${n}" style="padding:6px 10px;border:0;border-radius:7px;background:#2a2030;color:#ffe7a0">${n}</button>`).join('')}<button type="button" data-n="${o.max}" style="padding:6px 10px;border:0;border-radius:7px;background:#2a2030;color:#9fffb0">${tr('สูงสุด')} ${o.max}</button></div>
      <div class="tot" style="font-size:15px;color:#ffd84a"></div>
      <div style="display:flex;gap:8px"><button type="button" class="no" style="flex:1;padding:10px;border:0;border-radius:8px;background:#3a2a2a;color:#fff;font-size:15px">${tr('ยกเลิก')}</button>
        <button class="ok" style="flex:2;padding:10px;border:0;border-radius:8px;background:#2f6a3a;color:#fff;font-size:15px;font-weight:700">${tr('ซื้อ')}</button></div>
    </form>`;
  document.body.append(wrap);
  const inp = wrap.querySelector('input')!, tot = wrap.querySelector('.tot') as HTMLElement;
  const val = () => Math.max(1, Math.min(o.max, Math.floor(Number(inp.value) || 1)));
  const show = () => { tot.textContent = `= ${(val() * o.price).toLocaleString()} ${o.unit ?? 'G'}`; };
  wrap.querySelectorAll('[data-d]').forEach(b => (b as HTMLElement).onclick = () => { inp.value = String(Math.max(1, Math.min(o.max, val() + Number((b as HTMLElement).dataset.d)))); show(); });
  wrap.querySelectorAll('[data-n]').forEach(b => (b as HTMLElement).onclick = () => { inp.value = (b as HTMLElement).dataset.n!; show(); });
  inp.oninput = show; show();
  (wrap.querySelector('.no') as HTMLElement).onclick = () => wrap.remove();
  wrap.querySelector('form')!.addEventListener('submit', e => { e.preventDefault(); const n = val(); wrap.remove(); ok(n); });
}
