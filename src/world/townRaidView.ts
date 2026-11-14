// ⚔ The village raid as the game shows it: the five central buildings (HP bars, fire, ruin), the clock, the result.
// The map room runs everything (src/server/mapSim.ts startRaid); this view only draws what it says ('rs' / 'rend').
import Phaser from 'phaser';
import { RAID_BLD, RAID_WAVES } from '../systems/townRaid';
import { TOWN_NAME, type TownBld } from '../systems/town';
import { burnFx, fireKey } from './guildTown';
import { makeRuin } from './ruin';
import { fx2 } from './fx2';
import { bus, EV } from '../core/events';
import { sfx } from '../audio/sfx';
import { tr } from '../core/i18n';

export interface RaidHost extends Phaser.Scene {
  obj(name: string, x: number, y: number, fw?: number, fd?: number, shadow?: boolean, sc?: number): Phaser.GameObjects.Image | null;
  combat: { vfx: { dust(x: number, y: number, n: number, r: number): void } };
}
const ART: Record<TownBld, string> = { lumber: 'lumber_1', kitchen: 'kitchen_1', forge: 'forge_1', barn: 'barn_1', tavern: 'tavern_1' };
interface Bld { bid: TownBld; x: number; y: number; hp: number; max: number; img: Phaser.GameObjects.Image | null; bar: Phaser.GameObjects.Graphics; tag: Phaser.GameObjects.Text; fk?: string; fx?: Phaser.GameObjects.GameObject[] }
export interface RaidState { t: 'rs'; at: number; end: number; b: [TownBld, number, number][]; n: number; tot: number; sp: number; w?: number; done: number }
export interface RaidEnd { t: 'rend'; won: number; broken: TownBld[]; mvp: string[]; kills: Record<string, number>; min: number }

export class RaidView {
  blds: Bld[] = [];
  at = 0; end = 0; left = 0; tot = 0; spawned = 0; wave = 0; done = false; started = false;
  constructor(public sc: RaidHost, planAt: number) {
    this.at = planAt;
    for (const b of RAID_BLD) {
      const img = sc.obj(ART[b.bid], b.x, b.y, 0.82, 50, true, 1);
      const bar = sc.add.graphics().setDepth(99990);
      const tag = sc.add.text(b.x, b.y - (img ? img.displayHeight * img.originY : 60) - 16, tr(TOWN_NAME[b.bid]), { fontFamily: 'sans-serif', fontSize: '8px', color: '#ffe7a0', stroke: '#1a1006', strokeThickness: 3, resolution: 6 }).setOrigin(0.5).setDepth(99990);
      this.blds.push({ bid: b.bid, x: b.x, y: b.y, hp: 1, max: 1, img, bar, tag });
    }
    this.draw();
  }
  private draw() {
    for (const b of this.blds) {
      const w = 54, x = b.x - w / 2, y = b.tag.y + 7, f = Math.max(0, Math.min(1, b.hp / b.max));
      b.bar.clear().fillStyle(0x000000, 0.65).fillRect(x - 1, y - 1, w + 2, 6).fillStyle(f > 0.5 ? 0x5ad86a : f > 0.25 ? 0xffc83a : 0xff4a3a, 1).fillRect(x, y, w * f, 4);
    }
  }
  private burn(b: Bld) {
    if (!b.img) return;
    const f = Math.max(0, Math.min(1, 1 - b.hp / b.max)), fk = b.hp <= 0 ? 'ruin' : fireKey(f >= 0.15 ? f : 0);
    if (fk === (b.fk ?? '')) return;
    b.fk = fk; b.fx?.forEach(o => o.destroy());
    if (fk === 'ruin') { const src = b.img.texture.key, dst = 'o_ruin_' + src.replace(/^o_/, ''); if (makeRuin(this.sc, src, dst)) b.img.setTexture(dst); }
    b.fx = fk ? burnFx(this.sc, b.img, fk === 'ruin' ? 1 : f) : [];
  }
  /** the room's numbers (5 a second at most) */
  onState(e: RaidState) {
    this.at = e.at; this.end = e.end; this.left = e.n; this.tot = e.tot; this.spawned = e.sp; if (e.w && e.w > this.wave && this.started) { bus.emit(EV.TOAST, `⚔ ${tr('คลื่นที่')} ${e.w}/${RAID_WAVES} ${tr('มาแล้ว! ถึกขึ้นอีก')}`, '#ff9a7a'); sfx.bossRoar(); } this.wave = e.w ?? this.wave;
    if (!this.started) { this.started = true; sfx.bossRoar(); this.sc.cameras.main.flash(300, 120, 30, 20); bus.emit(EV.TOAST, '⚔ มอนบุกหมู่บ้านกลางแล้ว! ปกป้องอาคารทั้ง 5 หลัง (งดยาฮีล • มานาไม่หมด)', '#ff9a7a'); }
    for (const [bid, hp, max] of e.b) {
      const b = this.blds.find(q => q.bid === bid); if (!b) continue;
      const was = b.hp; b.max = Math.max(1, max); b.hp = hp;
      if (hp < was && b.img) { b.img.setTintFill(0xffd0c0); this.sc.time.delayedCall(70, () => b.img?.clearTint()); }
      if (hp <= 0 && was > 0 && b.max > 1) { fx2(this.sc, 'fx_collapse', b.x, b.y + 4, b.y + 5, 1.6); this.sc.combat.vfx.dust(b.x, b.y, 16, 50); bus.emit(EV.TOAST, `💥 ${tr(TOWN_NAME[bid])} ${tr('ถูกมอนทำลายแล้ว!')}`, '#ff6a5a'); }
      this.burn(b);
    }
    this.draw();
  }
  /** the end: who held, what fell, the best defenders */
  onEnd(e: RaidEnd, me: string, back: () => void) {
    this.done = true;
    const sc = this.sc, cam = sc.cameras.main, mine = e.kills[me] ?? 0;
    const lines = [
      e.won ? tr('🛡 ป้องกันหมู่บ้านสำเร็จ!') : tr('⚔ มอนบุกจบแล้ว'),
      e.broken.length ? `${tr('อาคารพัง')}: ${e.broken.map(b => tr(TOWN_NAME[b])).join('  ')}` : tr('ไม่มีอาคารพัง!'),
      e.mvp.length ? `🏅 MVP: ${e.mvp.join(', ')}` : '',
      `${tr('มอนที่คุณกำจัด')}: ${mine}` + (mine >= e.min ? ` — ${tr('ได้หีบผู้พิทักษ์!')}` : ` (${tr('ได้หีบเมื่อกำจัดครบ')} ${e.min})`),
      e.broken.length ? tr('อาคารที่พัง: ทุกคนในเซิร์ฟใช้ไม่ได้จนกว่าจะช่วยกันซ่อม (กด 🏘 บริจาค) หรือรอซ่อมเอง 2 ชม.') : '',
    ].filter(Boolean);
    void cam;
    document.getElementById('mc-raidend')?.remove();
    const d = document.createElement('div'); d.id = 'mc-raidend';
    d.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:41;width:min(420px,90vw);padding:16px 18px;background:rgba(26,18,8,.94);border:2px solid ' + (e.won ? '#ffd84a' : '#ff7a5a') + ';border-radius:12px;color:#fff3d0;font:15px/1.55 system-ui,sans-serif;text-align:center;box-shadow:0 10px 40px rgba(0,0,0,.6)';
    d.innerHTML = lines.map((l, i) => `<div style="${i === 0 ? 'font-size:20px;font-weight:800;color:' + (e.won ? '#ffe07a' : '#ffb08a') + ';margin-bottom:6px' : ''}">${l.replace(/[<>&]/g, '')}</div>`).join('') + `<div style="font-size:12px;opacity:.7;margin-top:8px">${tr('กำลังกลับหมู่บ้าน...')}</div>`;
    document.body.append(d); sc.events.once('shutdown', () => d.remove());
    if (e.won) sfx.levelUp(); else sfx.error();
    sc.time.delayedCall(9000, back);
  }
  /** the title line on top of the map */
  title(now: number) {
    if (this.done) return tr('⚔ มอนบุกจบแล้ว — กำลังกลับหมู่บ้าน...');
    if (!this.at || now < this.at) { const s = Math.max(0, Math.ceil((this.at - now) / 1000)); return this.at ? `⚔ ${tr('หมู่บ้านกลาง • มอนจะบุกในอีก')} ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : tr('⚔ หมู่บ้านกลาง • ยังไม่มีมอนบุก'); }
    const s = Math.max(0, Math.ceil((this.end - now) / 1000));
    return `⚔ ${tr('มอนบุก!')} ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} • ${tr('คลื่นที่')} ${this.wave}/${RAID_WAVES} • ${tr('มอนบนแผนที่')} ${this.left} • ${tr('มอนมาแล้ว')} ${this.spawned}/${this.tot}`;
  }
}
