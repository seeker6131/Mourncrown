// Black & gold fantasy UI kit (vector drawn, crisp at any scale).
import Phaser from 'phaser';
import { sfx } from '../audio/sfx';

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
    const draw = (pressed: boolean, active = false) => {
      g.clear();
      g.fillStyle(0x000000, 0.45).fillCircle(1, 2, r);
      g.fillStyle(pressed ? 0x120a06 : color, 0.92).fillCircle(0, 0, r);
      g.fillStyle(0xffffff, 0.07).fillEllipse(0, -r * 0.45, r * 1.4, r * 0.7);
      g.lineStyle(2, active ? 0x9fffb0 : GOLD, 1).strokeCircle(0, 0, r);
      g.lineStyle(1, GOLD_D, 1).strokeCircle(0, 0, r - 3);
    };
    draw(false);
    c.add(g);
    if (icon) { const im = this.scene.add.image(0, 0, icon); im.setScale((r * 1.25) / Math.max(im.width, im.height)); c.add(im); c.setData('icon', im); }
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

  iconSlot(g: Phaser.GameObjects.Graphics, x: number, y: number, s: number, rarityColor?: number, selected = false) {
    g.fillStyle(0x0a0705, 0.95).fillRoundedRect(x, y, s, s, 3);
    g.fillStyle(0xffffff, 0.04).fillRect(x + 2, y + 2, s - 4, s / 2 - 2);
    g.lineStyle(selected ? 2 : 1, selected ? GOLD_L : rarityColor ?? GOLD_D, 1).strokeRoundedRect(x, y, s, s, 3);
  }
}
