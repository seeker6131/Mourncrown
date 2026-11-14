// Minimap (top-right under the menu): the map's ground in miniature, the hero, the exits (always marked so nobody
// gets lost), the boss, monsters / animals, other players and the Deepwild mines. Tap it for a big map with names.
import Phaser from 'phaser';

export interface MapInfo {
  key: string; w: number; h: number; hero: { x: number; y: number; dir: number };
  exits: { x: number; y: number; label: string }[];
  marks: { x: number; y: number; label: string; col: string }[];
  dots: { x: number; y: number; kind: 'mon' | 'boss' | 'animal' | 'player' }[];
}
interface Host { add: Phaser.GameObjects.GameObjectFactory; textures: Phaser.Textures.TextureManager; VW: number; VH: number; root: Phaser.GameObjects.Container; kit: { text(x: number, y: number, t: string, size: number, col?: string, st?: object): Phaser.GameObjects.Text } }

const DOT: Record<MapInfo['dots'][number]['kind'], [number, number]> = { mon: [0xff5a4a, 1.2], boss: [0xff2a2a, 3], animal: [0xd8a060, 1.2], player: [0x8fd8ff, 1.4] };

export class Minimap {
  big = false;
  img: Phaser.GameObjects.Image; g: Phaser.GameObjects.Graphics; zone: Phaser.GameObjects.Zone; back: Phaser.GameObjects.Rectangle;
  labels: Phaser.GameObjects.Text[] = [];
  key = ''; box = { x: 0, y: 0, w: 0, h: 0 };
  hint?: Phaser.GameObjects.Text; dims = { w: 1, h: 1, mw: 1, mh: 1 };
  /** pick = tap a spot on the big map: the hero walks there (TopDownScene.walkTo) */
  constructor(private ui: Host, private info: () => MapInfo | null, private pick?: (x: number, y: number) => void) {
    this.back = ui.add.rectangle(0, 0, 10, 10, 0x000000, 0.55).setOrigin(0).setVisible(false).setInteractive();
    this.back.on('pointerup', () => this.toggle());
    this.img = ui.add.image(0, 0, '__WHITE').setOrigin(0);
    this.g = ui.add.graphics();
    this.zone = ui.add.zone(0, 0, 10, 10).setOrigin(0).setInteractive();
    // tap the minimap: it zooms; tap a spot on the zoomed map: the hero walks there (director)
    this.zone.on('pointerup', (_p: Phaser.Input.Pointer, lx: number, ly: number) => {
      if (this.big && this.pick) { const d = this.dims; this.pick(Phaser.Math.Clamp(lx / d.w, 0, 1) * d.mw, Phaser.Math.Clamp(ly / d.h, 0, 1) * d.mh); }
      this.toggle();
    });
    ui.root.add([this.back, this.img, this.g, this.zone]);
  }
  toggle() { this.big = !this.big; this.key = ''; }
  /** small copy of the map's ground texture (made once per map) */
  ground(m: MapInfo) {
    const k = 'mm_' + m.key;
    if (!this.ui.textures.exists(k) && this.ui.textures.exists('td_ground')) {
      const src = this.ui.textures.get('td_ground').getSourceImage() as HTMLCanvasElement, W = 320, H = Math.round(W * m.h / m.w);
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d')!;
      c.imageSmoothingEnabled = true; c.drawImage(src, 0, 0, W, H);
      c.fillStyle = 'rgba(10,20,14,0.18)'; c.fillRect(0, 0, W, H);
      this.ui.textures.addCanvas(k, cv);
    }
    return this.ui.textures.exists(k) ? k : '__WHITE';
  }
  update(time: number) {
    const m = this.info(); const show = !!m;
    [this.img, this.g, this.zone].forEach(o => o.setVisible(show)); if (!m) { this.back.setVisible(false); return; }
    const ui = this.ui, ratio = m.w / m.h;
    const h = this.big ? ui.VH * 0.78 : 84, w = Math.min(h * ratio, this.big ? ui.VW * 0.9 : 130), hh = w / ratio;
    const x = this.big ? (ui.VW - w) / 2 : ui.VW - w - 10, y = this.big ? (ui.VH - hh) / 2 : 54;
    const sx = w / m.w, sy = hh / m.h; this.dims = { w, h: hh, mw: m.w, mh: m.h };
    if (this.key !== m.key + this.big) {
      this.key = m.key + this.big;
      this.img.setTexture(this.ground(m)).setPosition(x, y).setDisplaySize(w, hh).setAlpha(this.big ? 1 : 0.92);
      this.zone.setPosition(x, y).setSize(w, hh);
      this.back.setVisible(this.big).setSize(ui.VW, ui.VH);
      if (this.zone.input) this.zone.input.hitArea.setSize(w, hh);
      if (this.back.input) this.back.input.hitArea.setSize(ui.VW, ui.VH);
      this.labels.forEach(t => t.destroy()); this.labels = [];
      const lab = (lx: number, ly: number, t: string, col: string, sz: number, ox = 0.5) => { const tx = ui.kit.text(x + lx * sx, y + Math.max(sz + 2, ly * sy), t, sz, col, { stroke: '#000000', strokeThickness: 3 }).setOrigin(ox, 1); this.labels.push(tx); ui.root.add(tx); };
      if (this.big) { for (const e of m.marks) lab(e.x, e.y - 6 / sy, e.label, e.col, 8); for (const e of m.exits) lab(e.x, e.y - 8 / sy, '🚪 ' + e.label, '#9fffb0', 9);
        if (this.pick) { const t = ui.kit.text(x + w / 2, y + hh + 6, '👆 แตะจุดบนแผนที่ = เดินไปที่นั่นเอง • แตะนอกแผนที่ = ปิด', 8, '#ffe7a0', { stroke: '#000000', strokeThickness: 3 }).setOrigin(0.5, 0); ui.root.add(t); this.labels.push(t); } }
      else for (const e of m.exits) lab(e.x + (e.x < m.w / 2 ? 4 : -4) / sx, e.y - 5 / sy, 'ทางออก', '#9fffb0', 6.5, e.x < m.w / 2 ? 0 : 1);
    }
    const g = this.g; g.clear();
    g.lineStyle(2, 0x0b0805, 1).strokeRect(x - 1, y - 1, w + 2, hh + 2).lineStyle(1, 0xc8a050, 1).strokeRect(x - 2, y - 2, w + 4, hh + 4);
    const P = (px: number, py: number) => [x + Phaser.Math.Clamp(px, 0, m.w) * sx, y + Phaser.Math.Clamp(py, 0, m.h) * sy] as const;
    for (const e of m.marks) { const [a, b] = P(e.x, e.y); g.fillStyle(0xffb040, 1).fillRect(a - 2, b - 2, 4, 4); }
    for (const d of m.dots) { const [a, b] = P(d.x, d.y), [c, r] = DOT[d.kind]; g.fillStyle(c, d.kind === 'boss' ? 1 : 0.9).fillCircle(a, b, r * (this.big ? 1.6 : 1)); }
    const pulse = 3 + Math.sin(time / 200) * 1.5;
    for (const e of m.exits) { const [a, b] = P(e.x, e.y); g.lineStyle(1.5, 0x9fffb0, 1).strokeCircle(a, b, pulse + (this.big ? 3 : 1)); g.fillStyle(0x3aff7a, 1).fillCircle(a, b, 2); }
    // the hero: an arrow pointing where they face
    const [hx, hy] = P(m.hero.x, m.hero.y), ang = Math.PI / 2 - m.hero.dir * Math.PI / 4, R = this.big ? 6 : 4;
    const pt = (r: number, da: number) => [hx + Math.cos(ang + da) * r, hy + Math.sin(ang + da) * r] as const;
    const [a1, b1] = pt(R, 0), [a2, b2] = pt(R * 0.8, 2.5), [a3, b3] = pt(R * 0.8, -2.5);
    g.fillStyle(0x000000, 0.6).fillCircle(hx, hy, R + 1.5).fillStyle(0xffe04a, 1).fillTriangle(a1, b1, a2, b2, a3, b3);
  }
}
