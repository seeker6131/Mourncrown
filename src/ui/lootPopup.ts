// "You got it!" popups for Rare and better — the rarer, the bigger: Rare = a card sliding in, Super Rare = centre card
// with glow + sparkles, Legend = big card with turning light rays, SL = the screen dims, rays, burst, "SL!!" (no shake).
// Plus the server-wide news ticker (SL drops are announced to everyone).
import Phaser from 'phaser';
import { itemDef, RARITY_COLORS, RARITY_NAMES } from '../data/items';
import { SETS } from '../data/sets';

interface Host extends Phaser.Scene { VW: number; VH: number; root: Phaser.GameObjects.Container; kit: { text(x: number, y: number, t: string, size: number, col?: string, st?: object): Phaser.GameObjects.Text } }
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

export class LootPopup {
  queue: { id: string; rar: number; set?: string }[] = [];
  busy = false;
  constructor(private ui: Host) {}
  push(p: { id: string; rar: number; set?: string }) { this.queue.push(p); if (!this.busy) this.next(); }
  next() {
    const p = this.queue.shift(); if (!p) { this.busy = false; return; }
    this.busy = true; this.show(p, () => this.next());
  }
  show(p: { id: string; rar: number; set?: string }, done: () => void) {
    const ui = this.ui, k = ui.kit, def = itemDef(p.id), col = RARITY_COLORS[p.rar], r = p.rar;
    const c = ui.add.container(0, 0).setDepth(9000); const objs: Phaser.GameObjects.GameObject[] = [];
    const add = <T extends Phaser.GameObjects.GameObject>(o: T) => { c.add(o); objs.push(o); return o; };
    const W = [0, 0, 190, 250, 290, 330][r], H = [0, 0, 52, 70, 86, 110][r];
    const cx = r === 2 ? ui.VW - W / 2 - 12 : ui.VW / 2, cy = r === 2 ? 128 : ui.VH * 0.38;
    const life = [0, 0, 1900, 2500, 3200, 4200][r];
    if (r >= 5) {   // SL: dim the screen + a white flash
      const dim = add(ui.add.rectangle(0, 0, ui.VW, ui.VH, 0x000000, 0).setOrigin(0));
      ui.tweens.add({ targets: dim, fillAlpha: 0.65, duration: 300 });
      const fl = add(ui.add.rectangle(0, 0, ui.VW, ui.VH, 0xffffff, 0.8).setOrigin(0));
      ui.tweens.add({ targets: fl, alpha: 0, duration: 500 });
    }
    if (r >= 4) {   // turning light rays behind the card
      const rays = add(ui.add.graphics({ x: cx, y: cy }));
      const n = r >= 5 ? 18 : 12, R = r >= 5 ? 260 : 170;
      for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, w = 0.09; rays.fillStyle(i % 2 ? col : 0xfff4c8, r >= 5 ? 0.28 : 0.2).fillTriangle(0, 0, Math.cos(a - w) * R, Math.sin(a - w) * R, Math.cos(a + w) * R, Math.sin(a + w) * R); }
      ui.tweens.add({ targets: rays, angle: 360, duration: r >= 5 ? 9000 : 14000, repeat: -1 });
      if (r >= 5) { const rays2 = add(ui.add.graphics({ x: cx, y: cy })); for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; rays2.fillStyle(0xff4a5a, 0.18).fillTriangle(0, 0, Math.cos(a - 0.05) * 300, Math.sin(a - 0.05) * 300, Math.cos(a + 0.05) * 300, Math.sin(a + 0.05) * 300); } ui.tweens.add({ targets: rays2, angle: -360, duration: 7000, repeat: -1 }); }
    }
    // the card
    const card = add(ui.add.graphics({ x: cx, y: cy }));
    card.fillStyle(0x120c08, 0.94).fillRoundedRect(-W / 2, -H / 2, W, H, 8);
    card.lineStyle(r >= 4 ? 3 : 2, col, 1).strokeRoundedRect(-W / 2, -H / 2, W, H, 8);
    if (r >= 3) card.lineStyle(1, 0xfff4c8, 0.6).strokeRoundedRect(-W / 2 + 4, -H / 2 + 4, W - 8, H - 8, 6);
    const glow = ui.textures.exists('td_glow') ? add(ui.add.image(cx - W / 2 + H / 2, cy, 'td_glow').setTint(col).setBlendMode(Phaser.BlendModes.ADD).setScale(H / 40)) : null;
    if (glow) ui.tweens.add({ targets: glow, alpha: { from: 0.5, to: 1 }, duration: 500, yoyo: true, repeat: -1 });
    const ik = `icon_${def.icon}`;
    if (ui.textures.exists(ik)) { const im = add(ui.add.image(cx - W / 2 + H / 2, cy, ik)); im.setScale((H * 0.62) / Math.max(im.width, im.height)); }
    const tx = cx - W / 2 + H + 4;
    const head = r >= 5 ? 'SL!! ไอเทมระดับตำนานสูงสุด' : r >= 4 ? '★ LEGEND ★' : r >= 3 ? 'Super Rare!' : 'Rare';
    add(k.text(tx, cy - H / 2 + 6, head, r >= 5 ? 12 : r >= 4 ? 11 : 9, hex(col), { fontStyle: 'bold', stroke: '#000000', strokeThickness: 3 }));
    add(k.text(tx, cy - H / 2 + (r >= 4 ? 26 : 22), def.name, r >= 4 ? 12 : 10, '#ffffff', { stroke: '#000000', strokeThickness: 3, wordWrap: { width: W - H - 12 } }));
    add(k.text(tx, cy + H / 2 - (p.set ? 26 : 16), `[${RARITY_NAMES[r]}]`, 8, hex(col)));
    if (p.set && SETS[p.set]) add(k.text(tx, cy + H / 2 - 14, `◆ ${SETS[p.set].name}`, 8, hex(SETS[p.set].col)));
    if (r >= 3) {   // sparkles
      for (let i = 0; i < (r >= 5 ? 40 : r >= 4 ? 22 : 12); i++) {
        const sp = add(ui.add.rectangle(cx + (Math.random() - 0.5) * W, cy + (Math.random() - 0.5) * H, 2, 2, Math.random() < 0.5 ? col : 0xfff4c8));
        const a = Math.random() * Math.PI * 2, d = (r >= 5 ? 160 : 70) * (0.4 + Math.random());
        ui.tweens.add({ targets: sp, x: sp.x + Math.cos(a) * d, y: sp.y + Math.sin(a) * d, alpha: 0, duration: 900 + Math.random() * 900, delay: Math.random() * 600 });
      }
    }
    // entrance
    if (r === 2) { c.x = 230; ui.tweens.add({ targets: c, x: 0, duration: 260, ease: 'Back.easeOut' }); }
    else { c.setScale(0.6).setAlpha(0); ui.tweens.add({ targets: c, scale: 1, alpha: 1, duration: r >= 5 ? 420 : 300, ease: 'Back.easeOut' }); c.x = cx * 0.4; c.y = cy * 0.4; ui.tweens.add({ targets: c, x: 0, y: 0, duration: r >= 5 ? 420 : 300, ease: 'Back.easeOut' }); }
    let closed = false;
    const close = () => { if (closed) return; closed = true; ui.tweens.add({ targets: c, alpha: 0, duration: 260, onComplete: () => { c.destroy(); done(); } }); };
    if (r >= 5) { const z = add(ui.add.zone(0, 0, ui.VW, ui.VH).setOrigin(0).setInteractive()); z.on('pointerup', close); }
    ui.time.delayedCall(life, close);
  }
}

/** Server-wide news ticker across the top (SL drops) */
export class NewsTicker {
  since = Date.now(); busy = false; queue: string[] = [];
  constructor(private ui: Host) {}
  push(t: string) { this.queue.push(t); if (!this.busy) this.next(); }
  next() {
    const t = this.queue.shift(); if (!t) { this.busy = false; return; }
    this.busy = true; const ui = this.ui, y = 48;
    const bar = ui.add.rectangle(0, y, ui.VW, 18, 0x3a0a10, 0.88).setOrigin(0, 0.5).setDepth(8999);
    const line = ui.add.rectangle(0, y + 9, ui.VW, 1, 0xff4a5a, 1).setOrigin(0, 0.5).setDepth(8999);
    const tx = ui.kit.text(ui.VW + 10, y, t, 9, '#ffe0a0', { stroke: '#000000', strokeThickness: 3 }).setOrigin(0, 0.5).setDepth(9000);
    ui.tweens.add({ targets: tx, x: -tx.width - 20, duration: 9000, ease: 'Linear', onComplete: () => { [bar, line, tx].forEach(o => o.destroy()); this.next(); } });
  }
}
