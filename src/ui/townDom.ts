// 🏘 The central village window: the five shared buildings (fine / broken + the repair bar), donate resources or gold to
// repair one (anyone, any amount — a full bar makes it usable again for the whole server), the top donors, the next raid.
import { tr } from '../core/i18n';
import { S, bus, EV } from '../core/events';
import { callServer, refused } from '../net/client';
import { TOWN, setTownView, raidAtLocal, type TownView } from '../net/townView';
import { TOWN_BLDS, TOWN_NAME, TOWN_STOPS, SELF_REPAIR_MS } from '../systems/town';
import { RAID_SECS } from '../systems/townRaid';

const css = 'border:0;border-radius:7px;padding:6px 9px;font-size:13px;cursor:pointer';
export function openTown(join: () => void) {
  document.getElementById('mc-town')?.remove();
  const wrap = document.createElement('div'); wrap.id = 'mc-town';
  wrap.style.cssText = 'position:fixed;inset:0;z-index:40;display:grid;place-items:center;background:rgba(6,4,10,.6);font-family:system-ui,sans-serif';
  document.body.append(wrap);
  const close = () => { wrap.remove(); bus.off('town:view', draw); };
  wrap.onclick = e => { if (e.target === wrap) close(); };
  let pick = '';
  function draw() {
    if (!wrap.isConnected) return;
    const v = TOWN.view, s = S(), now = Date.now(), at = raidAtLocal();
    const rows = TOWN_BLDS.map(bid => v?.rows.find(r => r.bid === bid) ?? { bid, broken: 0, at: 0, need: 1, prog: 1, top: [] });
    const raidTxt = at && now < at + RAID_SECS * 1000 ? (now < at ? `${tr('⚔ มอนบุกครั้งถัดไป')}: ${new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : tr('⚔ มอนกำลังบุกตอนนี้!')) : tr('ยังไม่มีกำหนดมอนบุก');
    const donors = new Map<string, number>(); for (const r of rows) for (const d of r.top) donors.set(d.n, (donors.get(d.n) ?? 0) + d.p);
    const board = [...donors].sort((a, b) => b[1] - a[1]).slice(0, 10);
    wrap.innerHTML = `<div style="width:min(440px,92vw);max-height:88vh;overflow:auto;padding:14px;background:#1c1520;border:2px solid #d9b45a;border-radius:10px;color:#f3e6c4;display:grid;gap:8px">
      <div style="display:flex;justify-content:space-between;align-items:center"><b style="font-size:16px;color:#ffe7a0">🏘 ${tr('หมู่บ้านกลาง')}</b><button class="x" style="${css};background:#3a2a2a;color:#fff">✕</button></div>
      <div style="font-size:13px;color:#ffb08a">${raidTxt}${at && now < at + RAID_SECS * 1000 ? ` <button class="join" style="${css};background:#7a2a1a;color:#fff;font-weight:700">⚔ ${tr('ไปป้องกัน')}</button>` : ''}</div>
      <div style="font-size:12px;opacity:.8">${tr('อาคารกลางพัง = ทุกคนในเซิร์ฟใช้อาคารชนิดนั้นไม่ได้ จนกว่าจะช่วยกันเติมหลอดซ่อมให้เต็ม (ไม้/หิน/อาหาร 1 = 1 แต้ม • ทอง 10 = 1 แต้ม) หรือรอซ่อมเอง 2 ชม.')}</div>
      ${rows.map(r => { const f = Math.max(0, Math.min(1, r.prog / Math.max(1, r.need))), left = r.broken ? Math.max(0, Math.ceil((r.at + SELF_REPAIR_MS - (now - TOWN.skew)) / 60000)) : 0;
        return `<div style="padding:8px;border-radius:8px;background:${r.broken ? '#3a1a18' : '#1a2a1c'};border:1px solid ${r.broken ? '#a04a3a' : '#3a6a40'}">
          <div style="display:flex;justify-content:space-between"><b>${tr(TOWN_NAME[r.bid])}</b><span style="font-size:12px">${r.broken ? `🔥 ${tr('พัง — ใช้ไม่ได้')}: ${tr(TOWN_STOPS[r.bid])}` : `✅ ${tr('ใช้งานได้')}`}</span></div>
          ${r.broken ? `<div style="margin-top:5px;height:9px;background:#000;border-radius:5px;overflow:hidden"><div style="height:100%;width:${Math.round(f * 100)}%;background:linear-gradient(90deg,#d9b45a,#ffe07a)"></div></div>
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-top:3px"><span>${Math.floor(r.prog).toLocaleString()} / ${r.need.toLocaleString()}</span><span>${tr('ซ่อมเองในอีก')} ~${left} ${tr('นาที')}</span></div>
          ${pick === r.bid ? `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin-top:6px;font-size:12px">
            ${(['wood', 'stone', 'food', 'gold'] as const).map(k => `<label style="display:grid;gap:2px">${k === 'wood' ? '🪵' : k === 'stone' ? '🪨' : k === 'food' ? '🍖' : '💰'} ${(k === 'gold' ? s.gold : s.res[k]).toLocaleString()}<input data-k="${k}" type="number" min="0" inputmode="numeric" placeholder="0" style="width:100%;box-sizing:border-box;padding:5px;border-radius:6px;border:1px solid #6a5a40;background:#0f0b12;color:#fff"></label>`).join('')}
            </div><div style="display:flex;gap:6px;margin-top:6px"><button class="give" data-b="${r.bid}" style="${css};flex:1;background:#2f6a3a;color:#fff;font-weight:700">🙏 ${tr('บริจาคซ่อม')}</button></div>`
          : `<button class="pick" data-b="${r.bid}" style="${css};margin-top:6px;background:#5a4220;color:#ffe7a0">🙏 ${tr('ช่วยซ่อม')}</button>`}` : ''}
        </div>`; }).join('')}
      <div><b style="color:#ffd84a">🙏 ${tr('ผู้ศรัทธา (ช่วยซ่อมมากที่สุด)')}</b>${board.length ? `<ol style="margin:4px 0 0 18px;padding:0;font-size:13px">${board.map(([n, p]) => `<li>${n.replace(/[<>&"]/g, '')} — ${p.toLocaleString()} ${tr('แต้มศรัทธา')}</li>`).join('')}</ol>` : `<div style="font-size:12px;opacity:.7">${tr('ยังไม่มีใครบริจาค')}</div>`}</div>
    </div>`;
    (wrap.querySelector('.x') as HTMLElement).onclick = close;
    const jb = wrap.querySelector('.join') as HTMLElement | null; if (jb) jb.onclick = () => { close(); join(); };
    wrap.querySelectorAll('.pick').forEach(b => (b as HTMLElement).onclick = () => { pick = (b as HTMLElement).dataset.b!; draw(); });
    wrap.querySelectorAll('.give').forEach(b => (b as HTMLElement).onclick = async () => {
      const a: Record<string, number | string> = { bid: (b as HTMLElement).dataset.b! };
      wrap.querySelectorAll('input[data-k]').forEach(i => { a[(i as HTMLInputElement).dataset.k!] = Math.max(0, Math.floor(Number((i as HTMLInputElement).value) || 0)); });
      (b as HTMLButtonElement).disabled = true;
      const r = await callServer('townDonate', a) as { ok?: boolean; pts?: number; fixed?: boolean; view?: TownView } | { refused: string };
      if (refused(r)) { bus.emit(EV.TOAST, ({ none: 'ใส่จำนวนที่จะบริจาคก่อน (ต้องมีของพอ)', fine: 'อาคารนี้ซ่อมเสร็จแล้ว', offline: 'ต้องออนไลน์ถึงจะบริจาคได้' } as Record<string, string>)[r.refused] ?? 'บริจาคไม่สำเร็จ', '#ff8a6a'); draw(); return; }
      const ok = r as { pts: number; fixed: boolean; view: TownView };
      bus.emit(EV.TOAST, ok.fixed ? `🎉 ${tr('ซ่อมเสร็จแล้ว! ใช้งานได้ทั้งเซิร์ฟ')}` : `🙏 ${tr('บริจาคแล้ว')} +${ok.pts} ${tr('แต้มศรัทธา')}`, '#9fffb0');
      pick = ''; if (ok.view) setTownView(ok.view); bus.emit(EV.STATE_CHANGED); draw();
    });
  }
  bus.on('town:view', draw); draw();
  callServer('townInfo', {}).then(r => { if (r && !refused(r)) setTownView(r as TownView); });
}
