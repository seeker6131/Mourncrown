// Black & gold fantasy UI kit (vector drawn, crisp at any scale).
import Phaser from 'phaser';
import { sfx } from '../audio/sfx';
import { hasSkin, buttonPlate, SKINNED, UI_META, UK } from './skin';
import { RARITY_COLORS } from '../data/items';

export const GOLD = 0xd9b45a;
export const GOLD_D = 0x7a5a24;
export const GOLD_L = 0xffe7a0;
export const DARK = 0x120d0a;
export const DARK2 = 0x1f1712;
export const FONT = '"Sarabun","Noto Sans Thai","Leelawadee UI","Tahoma",sans-serif';

export class UIKit {
  constructor(public scene: Phaser.Scene, public res: () => number) {}

  text(x: number, y: number, s: string, size = 10, color = '#f3e6c4', opts: Partial<Phaser.Types.GameObjects.Text.TextStyle> = {}) {
    return this.scene.add.text(x, y, s, {
      fontFamily: FONT, fontSize: `${size}px`, color, resolution: this.res(),
      stroke: '#0b0705', strokeThickness: Math.max(2, size / 5), ...opts,
    });
  }

  /** Ornate panel frame. */
  frame(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, alpha = 0.94, title?: boolean) {
    g.fillStyle(0x000000, 0.35).fillRoundedRect(x + 2, y + 3, w, h, 6);
    g.fillStyle(DARK, alpha).fillRoundedRect(x, y, w, h, 6);
    g.fillStyle(DARK2, alpha * 0.8).fillRoundedRect(x + 3, y + 3, w - 6, h * 0.45, 4);
    g.lineStyle(2, GOLD, 1).strokeRoundedRect(x, y, w, h, 6);
    g.lineStyle(1, GOLD_D, 1).strokeRoundedRect(x + 3.5, y + 3.5, w - 7, h - 7, 4);
    for (const [cx, cy] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) this.diamond(g, cx, cy, 4);
    if (title) {
      g.fillStyle(0x2a1d12, 1).fillRect(x + 10, y + 4, w - 20, 18);
      g.lineStyle(1, GOLD_D, 1).lineBetween(x + 10, y + 22, x + w - 10, y + 22);
    }
  }

  diamond(g: Phaser.GameObjects.Graphics, cx: number, cy: number, r: number) {
    g.fillStyle(GOLD, 1).fillTriangle(cx - r, cy, cx, cy - r, cx + r, cy).fillTriangle(cx - r, cy, cx, cy + r, cx + r, cy);
    g.fillStyle(GOLD_L, 1).fillTriangle(cx - r / 2, cy, cx, cy - r / 2, cx + r / 2, cy);
  }

  /** Rectangular gold-bordered button. */
  button(x: number, y: number, w: number, h: number, label: string, cb: () => void, opts: { size?: number; color?: number; disabled?: boolean; textColor?: string } = {}) {
    const c = this.scene.add.container(x, y);
    const g = this.scene.add.graphics();
    if (hasSkin(this.scene) && w >= 34 && h >= 16) {
      // painted plate (3-slice) + centre gem on wide buttons
      const n = buttonPlate(opts.color, opts.disabled), cap = UI_META['btn' + n].cap!;
      const ph = h + 6;
      const plate = this.scene.add.nineslice(w / 2, h / 2, 'ui_btn' + n, undefined, w * UK * 1.06, ph * UK, cap, cap, 0, 0).setScale(1 / UK);
      c.add(plate);
      if (w >= 90) { const gem = this.scene.add.image(w / 2, h / 2, `ui_btn${n}_gem`); gem.setScale(ph / gem.height); c.add(gem); }
      const t = this.text(w / 2, h / 2, label, opts.size ?? 10, opts.disabled ? '#9a9080' : opts.textColor ?? '#fff3cf').setOrigin(0.5);
      c.add(t); c.setSize(w, h);
      const zone = this.scene.add.zone(w / 2, h / 2, w, h).setInteractive();
      c.add(zone);
      if (!opts.disabled) {
        zone.on('pointerdown', () => { plate.setTint(0xb0a090); t.y = h / 2 + 1; });
        zone.on('pointerout', () => { plate.clearTint(); t.y = h / 2; });
        zone.on('pointerup', () => { plate.clearTint(); t.y = h / 2; sfx.click(); cb(); });
      }
      c.setData('label', t);
      return c;
    }
    const draw = (pressed: boolean) => {
      g.clear();
      const base = opts.disabled ? 0x2a2622 : opts.color ?? 0x3a2414;
      g.fillStyle(0x000000, 0.4).fillRoundedRect(1, 2, w, h, 4);
      g.fillStyle(pressed ? Phaser.Display.Color.ValueToColor(base).darken(20).color : base, 1).fillRoundedRect(0, 0, w, h, 4);
      g.fillStyle(0xffffff, pressed ? 0.02 : 0.08).fillRoundedRect(2, 2, w - 4, h / 2 - 1, 3);
      g.lineStyle(1.5, opts.disabled ? 0x5a5040 : GOLD, 1).strokeRoundedRect(0, 0, w, h, 4);
    };
    draw(false);
    const t = this.text(w / 2, h / 2, label, opts.size ?? 10, opts.disabled ? '#8a8070' : opts.textColor ?? '#ffe7a0').setOrigin(0.5);
    c.add([g, t]);
    c.setSize(w, h);
    const zone = this.scene.add.zone(w / 2, h / 2, w, h).setInteractive();
    c.add(zone);
    if (!opts.disabled) {
      zone.on('pointerdown', () => { draw(true); t.y = h / 2 + 1; });
      zone.on('pointerout', () => { draw(false); t.y = h / 2; });
      zone.on('pointerup', () => { draw(false); t.y = h / 2; sfx.click(); cb(); });
    }
    c.setData('label', t);
    return c;
  }

  /** Round icon button (for HUD). */
  roundButton(x: number, y: number, r: number, icon: string | null, label: string | null, color = 0x2a1a10) {
    const c = this.scene.add.container(x, y);
    const g = this.scene.add.graphics();
    const painted = !!icon && (SKINNED.has(icon) || icon.startsWith('ui_'));
    const draw = (pressed: boolean, active = false) => {
      g.clear();
      if (painted) { if (active) g.lineStyle(2, 0x9fffb0, 1).strokeCircle(0, 0, r + 1); if (pressed) g.fillStyle(0x000000, 0.3).fillCircle(0, 0, r); return; }
      g.fillStyle(0x000000, 0.45).fillCircle(1, 2, r);
      g.fillStyle(pressed ? 0x120a06 : color, 0.92).fillCircle(0, 0, r);
      g.fillStyle(0xffffff, 0.07).fillEllipse(0, -r * 0.45, r * 1.4, r * 0.7);
      g.lineStyle(2, active ? 0x9fffb0 : GOLD, 1).strokeCircle(0, 0, r);
      g.lineStyle(1, GOLD_D, 1).strokeCircle(0, 0, r - 3);
    };
    draw(false);
    c.add(g);
    if (icon) { const im = this.scene.add.image(0, 0, icon); im.setScale((painted ? r * 2.3 : r * 1.25) / Math.max(im.width, im.height)); c.add(im); c.setData('icon', im); if (painted) c.bringToTop(g); }
    if (label) { const t = this.text(0, icon ? r * 0.55 : 0, label, icon ? Math.max(7, r * 0.36) : r * 0.55, '#ffe7a0').setOrigin(0.5); c.add(t); c.setData('label', t); }
    c.setData('draw', draw);
    const zone = this.scene.add.zone(0, 0, r * 2.2, r * 2.2).setInteractive(new Phaser.Geom.Circle(r * 1.1, r * 1.1, r * 1.1), Phaser.Geom.Circle.Contains);
    c.add(zone);
    c.setData('zone', zone);
    zone.on('pointerdown', () => draw(true, c.getData('active')));
    zone.on('pointerout', () => draw(false, c.getData('active')));
    zone.on('pointerup', () => draw(false, c.getData('active')));
    return { c, zone, g, draw };
  }

  bar(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, frac: number, color: number, back = 0x2a1010) {
    frac = Phaser.Math.Clamp(frac, 0, 1);
    g.fillStyle(0x000000, 0.7).fillRoundedRect(x - 1, y - 1, w + 2, h + 2, 2);
    g.fillStyle(back, 1).fillRect(x, y, w, h);
    if (frac > 0) {
      g.fillStyle(color, 1).fillRect(x, y, w * frac, h);
      g.fillStyle(0xffffff, 0.28).fillRect(x, y, w * frac, Math.max(1, h * 0.35));
      g.fillStyle(0x000000, 0.2).fillRect(x, y + h - 1, w * frac, 1);
    }
    g.lineStyle(1, GOLD_D, 1).strokeRect(x - 0.5, y - 0.5, w + 1, h + 1);
  }

  /** a glowing aura around an item slot, stronger the rarer the item (director: Rare..SL must stand apart at a glance):
   *  Rare a soft blue glow · Super Rare a purple pulse · Legend an orange pulse + a spark running round the frame ·
   *  SL red-gold shifting light, a bigger pulse and two sparks */
  private slotAura(pc: Phaser.GameObjects.Container, x: number, y: number, s: number, ri: number) {
    const sc = this.scene;
    if (!sc.textures.exists('ui_aura')) {
      const cv = document.createElement('canvas'); cv.width = cv.height = 64; const q = cv.getContext('2d')!;
      const gr = q.createRadialGradient(32, 32, 6, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      q.fillStyle = gr; q.fillRect(0, 0, 64, 64); sc.textures.addCanvas('ui_aura', cv);
      const c2 = document.createElement('canvas'); c2.width = c2.height = 16; const q2 = c2.getContext('2d')!;
      const g2 = q2.createRadialGradient(8, 8, 0, 8, 8, 8); g2.addColorStop(0, 'rgba(255,255,255,1)'); g2.addColorStop(0.3, 'rgba(255,255,255,0.8)'); g2.addColorStop(1, 'rgba(255,255,255,0)');
      q2.fillStyle = g2; q2.beginPath(); q2.moveTo(8, 0); q2.lineTo(9.5, 6.5); q2.lineTo(16, 8); q2.lineTo(9.5, 9.5); q2.lineTo(8, 16); q2.lineTo(6.5, 9.5); q2.lineTo(0, 8); q2.lineTo(6.5, 6.5); q2.closePath(); q2.fill();
      sc.textures.addCanvas('ui_spark', c2);
    }
    const cx = x + s / 2, cy = y + s / 2, col = RARITY_COLORS[ri], big = [0, 0, 1.6, 1.75, 1.9, 2.1][ri];
    const glow = sc.add.image(cx, cy, 'ui_aura').setTint(col).setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(s * big, s * big).setAlpha(ri >= 4 ? 0.85 : 0.7);
    pc.add(glow);
    const tws: Phaser.Tweens.Tween[] = [];
    if (ri >= 3) tws.push(sc.tweens.add({ targets: glow, alpha: { from: 0.35, to: ri >= 5 ? 0.95 : 0.8 }, scale: { from: glow.scale * 0.92, to: glow.scale * 1.08 }, duration: ri >= 5 ? 650 : 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }));
    if (ri >= 5) {   // SL: the light shifts between red and gold
      const a = Phaser.Display.Color.ValueToColor(0xff4a5a), b = Phaser.Display.Color.ValueToColor(0xffd84a);
      tws.push(sc.tweens.addCounter({ from: 0, to: 100, duration: 1200, yoyo: true, repeat: -1, onUpdate: t => { const c = Phaser.Display.Color.Interpolate.ColorWithColor(a, b, 100, t.getValue() ?? 0), v = Phaser.Display.Color.GetColor(c.r, c.g, c.b); glow.setTint(v); drawEdge(v); } }));
    }
    // a bright frame in the rarity colour on top of the slot (SL: red-gold, matching the glow)
    const edge = sc.add.graphics(), drawEdge = (c: number) => edge.clear().lineStyle(2, c, 1).strokeRoundedRect(x - 1, y - 1, s + 2, s + 2, 4).lineStyle(1, 0xffffff, 0.35).strokeRoundedRect(x + 1, y + 1, s - 2, s - 2, 3);
    drawEdge(col); pc.add(edge);
    if (ri >= 3) tws.push(sc.tweens.add({ targets: edge, alpha: { from: 0.65, to: 1 }, duration: ri >= 5 ? 650 : 900, yoyo: true, repeat: -1 }));
    const sparks: Phaser.GameObjects.Image[] = [edge as unknown as Phaser.GameObjects.Image];
    for (let k = 0; k < (ri >= 5 ? 2 : ri >= 4 ? 1 : 0); k++) {   // a spark running round the frame
      const sp = sc.add.image(x, y, 'ui_spark').setTint(ri >= 5 ? 0xfff0b0 : 0xffe0a0).setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(s * 0.32, s * 0.32);
      pc.add(sp); sparks.push(sp);
      tws.push(sc.tweens.addCounter({ from: 0, to: 4, duration: ri >= 5 ? 1600 : 2200, repeat: -1, delay: k * 800, onUpdate: t => {
        const v = (t.getValue() ?? 0) % 4, f = v % 1, side = Math.floor(v);
        const px = side === 0 ? x + f * s : side === 1 ? x + s : side === 2 ? x + s - f * s : x, py = side === 0 ? y : side === 1 ? y + f * s : side === 2 ? y + s : y + s - f * s;
        sp.setPosition(px, py).setAngle((t.getValue() ?? 0) * 90);
      } }));
    }
    glow.once('destroy', () => { for (const t of tws) t.stop(); sparks.forEach(o => o.destroy()); });
    return sparks;
  }

  iconSlot(g: Phaser.GameObjects.Graphics, x: number, y: number, s: number, rarityColor?: number, selected = false) {
    const pc = g.parentContainer;
    const ri0 = rarityColor === undefined ? -1 : RARITY_COLORS.indexOf(rarityColor), sparks = pc && ri0 >= 2 ? this.slotAura(pc, x, y, s, ri0) : [];   // (glow behind the slot)
    if (pc && hasSkin(this.scene)) {
      const ri = rarityColor === undefined ? -1 : RARITY_COLORS.indexOf(rarityColor);
      const im = this.scene.add.image(x + s / 2, y + s / 2, 'ui_slot' + (ri < 0 ? 0 : Math.min(5, ri + 1)));
      im.setScale((s * 1.18) / im.width);
      pc.add(im); for (const sp of sparks) pc.bringToTop(sp);   // (sparks run over the frame)
      if (selected) { const hl = this.scene.add.graphics().lineStyle(2, GOLD_L, 1).strokeRoundedRect(x - 1, y - 1, s + 2, s + 2, 4); pc.add(hl); }
      return;
    }
    g.fillStyle(0x0a0705, 0.95).fillRoundedRect(x, y, s, s, 3);
    g.fillStyle(0xffffff, 0.04).fillRect(x + 2, y + 2, s - 4, s / 2 - 2);
    g.lineStyle(selected ? 2 : 1, selected ? GOLD_L : rarityColor ?? GOLD_D, 1).strokeRoundedRect(x, y, s, s, 3);
  }
}
