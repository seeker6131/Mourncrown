// HUD + menus for the top-down game. Runs on top of TopDownScene and reuses the shared Panels
// (bag, character, shop, blacksmith, building plots, class choice, menu).
import Phaser from 'phaser';
import { UIKit } from '../ui/kit';
import { panelFrame } from '../ui/skin';
import { bus, EV, S } from '../core/events';
import { derive, expToNext, nextForm, activeTier } from '../systems/stats';
import { formName } from '../data/classes';
import { Panels } from '../ui/panels';
import { sfx } from '../audio/sfx';
import type { UIScene } from './UIScene';

const VH = 400;
export interface TdHost extends Phaser.Scene {
  heroKey(): string; levelUpFx(): void; resetJoy(): void; stageTitle(): string;
}

export class TdUIScene extends Phaser.Scene {
  kit!: UIKit;
  u = 1; VW = 640;
  panels!: Panels;
  root!: Phaser.GameObjects.Container;
  hud!: Phaser.GameObjects.Graphics;
  portrait!: Phaser.GameObjects.Image;
  lvText!: Phaser.GameObjects.Text; hpText!: Phaser.GameObjects.Text; expText!: Phaser.GameObjects.Text;
  resText!: Phaser.GameObjects.Text; stageText!: Phaser.GameObjects.Text; resTexts: Phaser.GameObjects.Text[] = [];
  formBtn!: Phaser.GameObjects.Container;
  actBtn!: Phaser.GameObjects.Container; actLabel = ''; actCb: (() => void) | null = null;
  toasts: Phaser.GameObjects.Text[] = [];
  lastKey = ''; refreshT = 0;

  constructor() { super('TdUI'); }

  get td() { return this.scene.get('TopDown') as TdHost; }
  /** what Panels expects from the old WorldScene */
  get world() {
    const key = this.td.heroKey();
    return { hero: { ai: true, portrait: () => ({ key: `c_${key}_idle`, frame: 0 }) }, levelUpFx: () => this.td.levelUpFx() };
  }
  controlsReset() { this.td.resetJoy(); }
  reloadWorld() { this.scene.get('TopDown').scene.restart({ stage: 0 }); }
  toggleFullscreen() {
    sfx.click();
    if (this.scale.isFullscreen) { this.scale.stopFullscreen(); return; }
    try { document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => undefined); } catch { /* not supported */ }
  }

  create() {
    this.u = this.scale.height / VH;
    this.VW = this.scale.width / this.u;
    this.cameras.main.setOrigin(0, 0).setZoom(this.u);
    this.kit = new UIKit(this, () => Math.max(1, this.u));
    this.toasts = []; this.lastKey = ''; this.actLabel = ''; this.actCb = null;
    this.root = this.add.container(0, 0);
    this.panels = new Panels(this as unknown as UIScene);
    const k = this.kit;

    // top-left: portrait, level, HP / EXP bars, gold + materials
    // top-left: wooden frame, portrait in the carved ring, HP/EXP bars, resources with icons
    this.root.add(panelFrame(this, 6, 6, 206, 50));
    this.hud = this.add.graphics();
    this.portrait = this.add.image(28, 30, '__DEFAULT');
    const ring = this.add.image(28, 30, 'ui_ring0'); ring.setScale(44 / ring.width);
    this.lvText = k.text(28, 52, 'Lv1', 8, '#ffe7a0').setOrigin(0.5);
    this.hpText = k.text(128, 11, '', 7.5, '#ffffff').setOrigin(0.5, 0);
    this.expText = k.text(128, 25, '', 6.5, '#e0d0ff').setOrigin(0.5, 0);
    this.stageText = k.text(this.VW / 2, 8, '', 10, '#ffe7a0').setOrigin(0.5, 0);
    this.root.add([this.hud, this.portrait, ring, this.lvText, this.hpText, this.expText, this.stageText]);
    this.resTexts = (['res0', 'res1', 'res2', 'res3'] as const).map((ic, i) => {
      const x = 56 + i * 38, im = this.add.image(x, 44, 'ui_' + ic); im.setScale(11 / im.height);
      const t = k.text(x + 7, 44, '0', 7.5, '#ffe7a0').setOrigin(0, 0.5);
      this.root.add([im, t]); return t;
    });
    this.resText = this.resTexts[0];

    // top-right menu: icon buttons
    const menu: [string, string, () => void][] = [['ui_hud0', 'กระเป๋า', () => this.panels.open('bag')], ['ui_hud1', 'ตัวละคร', () => this.panels.open('stats')], ['ui_hud3', 'เมนู', () => this.panels.open('menu')]];
    menu.forEach(([ic, label, cb], i) => {
      const x = this.VW - 22 - (menu.length - 1 - i) * 36, y = 20;
      const sl = this.add.image(x, y, 'ui_slot0'); sl.setScale(30 / sl.width);
      const im = this.add.image(x, y - 1, ic); im.setScale(20 / Math.max(im.width, im.height));
      const t = k.text(x, y + 17, label, 6.5, '#ffe7a0').setOrigin(0.5, 0);
      const z = this.add.zone(x, y + 4, 34, 40).setInteractive();
      z.on('pointerdown', () => im.setScale(18 / Math.max(im.width, im.height)));
      z.on('pointerout', () => im.setScale(20 / Math.max(im.width, im.height)));
      z.on('pointerup', () => { im.setScale(20 / Math.max(im.width, im.height)); cb(); });
      this.root.add([sl, im, t, z]);
    });
    // class change ready
    this.formBtn = k.button(this.VW - 206, 64, 194, 22, '✨ เปลี่ยนร่างได้! (แตะ)', () => this.panels.open('job'), { size: 9, color: 0x6a3a8a });
    this.formBtn.setVisible(false);
    this.root.add(this.formBtn);
    this.tweens.add({ targets: this.formBtn, alpha: 0.6, duration: 600, yoyo: true, repeat: -1 });

    bus.on(EV.TOAST, this.toast, this);
    bus.on(EV.STATE_CHANGED, this.refresh, this);
    this.events.once('shutdown', () => { bus.off(EV.TOAST, this.toast, this); bus.off(EV.STATE_CHANGED, this.refresh, this); });
    this.scale.on('resize', this.onResize, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.onResize, this));
    this.refresh();

    const st = S();
    if (!st.introSeen) {
      st.introSeen = true;
      this.time.delayedCall(800, () => this.panels.openDialog('elder', 'คำสาปดำกำลังกลืนแผ่นดินเอลเดอร์โกรฟ... เจ้าเป็นแค่ชาวบ้านถือดาบไม้ ออกไปทางประตูด่านทางเหนือ ล่ามอนสเตอร์ เก็บไม้ หิน อาหาร กลับมาสร้างหมู่บ้านที่แปลงว่าง ถึงเลเวล 10 แล้วมาหาข้า จะได้เลือกเส้นทางนักรบของเจ้า!'));
    }
  }

  onResize() { this.scene.restart(); }

  /** TopDownScene tells us what the action button does (talk / build / collect), or null to hide it. */
  setAction(label: string | null, cb?: () => void) {
    if ((label ?? '') === this.actLabel) { this.actCb = cb ?? null; return; }
    this.actLabel = label ?? ''; this.actCb = cb ?? null;
    this.actBtn?.destroy();
    if (!label) return;
    const w = Math.max(90, label.length * 7 + 20);
    this.actBtn = this.kit.button(this.VW - w - 96, VH - 140, w, 30, label, () => this.actCb?.(), { size: 11, color: 0x2a4a2a });
    this.root.add(this.actBtn);
  }

  /** true when a tap at this pointer belongs to the UI (open panel or a button) */
  blocks(p: Phaser.Input.Pointer) {
    return this.panels.isOpen || this.input.hitTestPointer(p).length > 0;
  }

  refresh() {
    if (!this.hud) return;
    const s = S(), d = derive(s), k = this.kit, g = this.hud;
    g.clear();
    g.fillStyle(0x140d08, 1).fillCircle(28, 30, 17);
    const need = expToNext(s.level);
    const bar = (x: number, y: number, w: number, h: number, f: number, col: number, hi: number) => {
      g.fillStyle(0x0b0806, 1).fillRect(x - 1, y - 1, w + 2, h + 2).fillStyle(0x2a1d14, 1).fillRect(x, y, w, h);
      const fw = Math.round(w * Phaser.Math.Clamp(f, 0, 1));
      g.fillStyle(col, 1).fillRect(x, y, fw, h).fillStyle(hi, 1).fillRect(x, y, fw, Math.max(1, Math.floor(h / 3)));
      g.lineStyle(1, 0x5a4a3a, 1).strokeRect(x - 1.5, y - 1.5, w + 3, h + 3);
    };
    bar(52, 11, 152, 10, s.hp / d.maxHp, 0xb8332c, 0xe0645a);
    bar(52, 25, 152, 7, need > 0 ? s.exp / need : 1, 0x6a4ab8, 0x9a7ae0);
    this.hpText.setText(`HP ${Math.round(s.hp)}/${d.maxHp}`);
    this.expText.setText(`EXP ${Math.floor(s.exp)}/${need}`);
    this.lvText.setText(`Lv${s.level}`);
    [s.gold, s.res.wood, s.res.stone, s.res.food].forEach((v, i) => this.resTexts[i]?.setText(v >= 10000 ? Math.floor(v / 1000) + 'k' : String(v)));
    const key = this.td.heroKey();
    if (key !== this.lastKey && this.textures.exists(`c_${key}_idle`)) {
      this.lastKey = key;
      this.portrait.setTexture(`c_${key}_idle`, 0);
      const f = this.portrait.frame, ch = Math.round(f.height * 0.55);
      this.portrait.setCrop(0, Math.round(f.height * 0.12), f.width, ch).setScale(32 / ch).setOrigin(0.5, 0.36);
    }
    this.stageText.setText(`${this.td.stageTitle()} • ร่าง ${formName(s.cls, activeTier(s))}`);
    this.formBtn.setVisible(nextForm(s) !== null && !this.panels.isOpen);
  }

  toast(text: string, color = '#ffe7a0') {
    const t = this.kit.text(this.VW / 2, 92, text, 10, color).setOrigin(0.5).setAlpha(0);
    this.root.add(t);
    this.toasts.push(t);
    this.toasts.forEach((o, i) => { if (o !== t) this.tweens.add({ targets: o, y: 92 - (this.toasts.length - 1 - i) * 13, duration: 150 }); });
    this.tweens.add({ targets: t, alpha: 1, duration: 150 });
    this.tweens.add({ targets: t, alpha: 0, delay: 2000, duration: 400, onComplete: () => { t.destroy(); this.toasts = this.toasts.filter(x => x !== t); } });
    if (this.toasts.length > 4) this.toasts.shift()?.destroy();
  }

  update(time: number) {
    if (time - this.refreshT > 300) { this.refreshT = time; this.refresh(); }
  }
}

