// ⚔ The team round on screen (rules: systems/br.ts; the room on the server decides everything): the lobby's team list
// (make / join / leave a team), the title line with the clock, the shrinking safe zone, "you are out" (watch or go home)
// and the results.
import Phaser from 'phaser';
import { tr } from '../core/i18n';
import { sfx } from '../audio/sfx';
import { brRoundById, brZone, BR_TEAM_MAX, BR_MIN_TEAMS, type BrRound } from '../systems/br';

export interface BrTeam { tid: string; m: { id: string; name: string; alive: boolean }[] }
export interface BrEnd { cancelled?: boolean; win?: string | null; winners?: string[]; mvp?: string; mvpKills?: number; rows?: { tid: string; alive: number; kills: number; names: string[] }[] }
const esc = (s: string) => s.replace(/[<>&"]/g, '');
const mmss = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export class BrView {
  teams: BrTeam[] = []; started = false; done = false; out = false; R: BrRound;
  zone: Phaser.GameObjects.Graphics; box?: HTMLDivElement; lastKey = '';
  constructor(private sc: Phaser.Scene, public id: number, private me: () => string, private send: (t: 'tcreate' | 'tjoin' | 'tleave', tid?: string) => void, private W: number, private H: number) {
    this.R = brRoundById(id);
    this.zone = sc.add.graphics().setDepth(99980);
    sc.events.once('shutdown', () => { this.box?.remove(); document.getElementById('mc-brend')?.remove(); document.getElementById('mc-brhome')?.remove(); });
  }
  myTeam() { return this.teams.find(t => t.m.some(m => m.id === this.me()))?.tid ?? null; }
  /** is this hero on my team? (no hitting teammates) */
  mate(id: string) { const t = this.myTeam(); return !!t && !!this.teams.find(q => q.tid === t)?.m.some(m => m.id === id); }
  setTeams(teams: BrTeam[], started?: boolean) { this.teams = teams; if (started) this.started = true; this.drawBox(); }
  /** every frame: the zone ring, the lobby box */
  update(now: number) {
    this.zone.clear();
    if (this.started && !this.done && now >= this.R.fightAt) {
      const z = brZone(now - this.R.fightAt, this.W, this.H, this.id);
      // outside the ring: dark red quads from the circle out past the map edge (a huge line width draws with stripes)
      const N = 72, far = z.r + 4000; this.zone.fillStyle(0x6a0a1a, 0.3);
      for (let i = 0; i < N; i++) {
        const a0 = i / N * Math.PI * 2, a1 = (i + 1) / N * Math.PI * 2, c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
        this.zone.fillPoints([{ x: z.x + c0 * z.r, y: z.y + s0 * z.r }, { x: z.x + c1 * z.r, y: z.y + s1 * z.r }, { x: z.x + c1 * far, y: z.y + s1 * far }, { x: z.x + c0 * far, y: z.y + s0 * far }], true);
      }
      this.zone.lineStyle(3, 0xff5a6a, 0.9).strokeCircle(z.x, z.y, z.r);
    }
    if (now >= this.R.fightAt && this.box) { this.box.remove(); this.box = undefined; }
  }
  /** is (x, y) outside the safe zone now? (only for the warning — the room deals the damage) */
  outside(x: number, y: number, now: number) { if (!this.started || this.done || now < this.R.fightAt) return false; const z = brZone(now - this.R.fightAt, this.W, this.H, this.id); return Math.hypot(x - z.x, y - z.y) > z.r; }
  /** the lobby's team list */
  drawBox() {
    if (this.started || Date.now() >= this.R.fightAt) { this.box?.remove(); this.box = undefined; return; }
    const mine = this.myTeam(), key = JSON.stringify([this.teams, mine]); if (key === this.lastKey && this.box) return; this.lastKey = key;
    if (!this.box) {
      this.box = document.createElement('div'); this.box.id = 'mc-brteams';
      this.box.style.cssText = 'position:fixed;left:8px;top:30%;z-index:40;width:min(250px,46vw);max-height:46vh;overflow:auto;padding:8px 10px;background:rgba(26,14,8,.9);border:2px solid #ff9a6a;border-radius:10px;color:#f3e6c4;font:13px system-ui,sans-serif';
      document.body.append(this.box);
    }
    const btn = (label: string, act: string, tid = '') => `<button data-a="${act}" data-t="${tid}" style="margin:2px 0;padding:4px 10px;font:700 12px system-ui;color:#fff3d0;background:#5a2a1a;border:1px solid #ffb08a;border-radius:8px">${label}</button>`;
    const rows = this.teams.map(t => {
      const lead = t.m[0]?.name ?? '?', full = t.m.length >= BR_TEAM_MAX, me = t.tid === mine;
      return `<div style="margin:5px 0;padding:4px 6px;border-radius:6px;background:${me ? 'rgba(90,200,120,.18)' : 'rgba(255,255,255,.06)'}"><b>${esc(tr('ทีม'))} ${esc(lead)}</b> (${t.m.length}/${BR_TEAM_MAX})<br><span style="font-size:12px;opacity:.85">${t.m.map(m => esc(m.name)).join(', ')}</span>${!me && !full ? '<br>' + btn(tr('เข้าร่วม'), 'tjoin', t.tid) : ''}</div>`;
    }).join('');
    this.box.innerHTML = `<div style="font-weight:800;color:#ffd84a">⚔ ${esc(tr('ตั้งทีม (สูงสุด 4 คน)'))}</div><div style="font-size:11px;opacity:.8">${esc(tr('ไม่มีทีม = ลุยเดี่ยว • ต้องมีอย่างน้อย'))} ${BR_MIN_TEAMS} ${esc(tr('ทีมถึงเริ่ม'))}</div>${rows || `<div style="opacity:.7;margin:6px 0">${esc(tr('ยังไม่มีทีม'))}</div>`}${mine ? btn(tr('ออกจากทีม'), 'tleave') : btn(tr('➕ สร้างทีม'), 'tcreate')}`;
    this.box.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { sfx.click(); this.send(b.dataset.a as 'tcreate', b.dataset.t || undefined); }));
  }
  /** the title line on top of the map */
  title(now: number) {
    const R = this.R;
    if (this.done) return tr('⚔ จบรอบ — กำลังกลับหมู่บ้าน...');
    if (now < R.fightAt) return `⚔ ${tr('สมรภูมิทีม • เริ่มในอีก')} ${mmss(R.fightAt - now)} — ${tr('ตั้งทีมได้ทางซ้าย')}`;
    const alive = this.teams.filter(t => t.m.some(m => m.alive)), heroes = this.teams.reduce((a, t) => a + t.m.filter(m => m.alive).length, 0);
    return `⚔ ${tr('เหลือเวลา')} ${mmss(R.fightEnd - now)} • ${tr('ทีมที่เหลือ')} ${alive.length} • ${tr('ผู้รอด')} ${heroes}${this.out ? ' • 💀 ' + tr('คุณตกรอบแล้ว') : ''}`;
  }
  /** someone fell: mark them out of the list */
  fell(id: string) { for (const t of this.teams) for (const m of t.m) if (m.id === id) m.alive = false; }
  /** I am out: watch, or go home now */
  fallen(back: () => void) {
    this.out = true; if (document.getElementById('mc-brhome')) return;
    const b = document.createElement('button'); b.id = 'mc-brhome'; b.textContent = tr('🏠 กลับบ้าน');
    b.style.cssText = 'position:fixed;left:50%;bottom:18%;transform:translateX(-50%);z-index:41;padding:12px 26px;font:700 17px system-ui,sans-serif;color:#fff3d0;background:#5a2a1a;border:2px solid #ffb08a;border-radius:12px';
    b.onclick = () => { b.remove(); back(); };
    document.body.append(b);
  }
  /** the end */
  onEnd(e: BrEnd, back: () => void) {
    this.done = true; this.box?.remove(); this.box = undefined;
    const mine = this.myTeam(), won = !!e.win && e.win === mine;
    const lines = e.cancelled ? [tr('⚔ รอบนี้ยกเลิก'), `${tr('ทีมไม่ครบ')} ${BR_MIN_TEAMS} ${tr('ทีม — คืนค่าเข้าให้แล้ว')}`] : [
      won ? tr('🏆 ทีมคุณชนะ! ทีมสุดท้ายที่รอด') : tr('⚔ จบรอบสมรภูมิทีม'),
      e.winners?.length ? `👑 ${tr('ทีมชนะ')}: ${e.winners.join(', ')}` : tr('ไม่มีทีมรอด'),
      e.mvp ? `⭐ MVP: ${e.mvp} (${tr('ล้มศัตรู')} ${e.mvpKills ?? 0})` : '',
      ...(e.rows ?? []).slice(0, 5).map((r, i) => `${i + 1}. ${r.names.join(', ')} — ${tr('ผู้รอด')} ${r.alive} • ${tr('ล้มศัตรู')} ${r.kills}`),
      tr('รางวัลเข้ากระเป๋าแล้ว (ทีมชนะ / MVP / สิทธิ์สุ่มกล่องของทีมที่รอด)'),
    ].filter(Boolean);
    document.getElementById('mc-brend')?.remove(); document.getElementById('mc-brhome')?.remove();
    const d = document.createElement('div'); d.id = 'mc-brend';
    d.style.cssText = `position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:41;width:min(420px,90vw);padding:16px 18px;background:rgba(26,18,8,.94);border:2px solid ${won ? '#ffd84a' : '#ff7a5a'};border-radius:12px;color:#f3e6c4;font:14px system-ui,sans-serif;text-align:center`;
    d.innerHTML = lines.map((l, i) => `<div style="${i === 0 ? `font-size:20px;font-weight:800;color:${won ? '#ffe07a' : '#ffb08a'};margin-bottom:6px` : 'margin:3px 0'}">${esc(l)}</div>`).join('');
    document.body.append(d);
    if (won) sfx.levelUp(); else sfx.error();
    this.sc.time.delayedCall(e.cancelled ? 5000 : 10000, back);
  }
}
