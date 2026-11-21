// Minimap (top-right under the menu): the map's ground in miniature, the hero, the exits (always marked so nobody
// gets lost), the boss, monsters / animals, other players and the Deepwild mines. Tap it for a big map with names.
import Phaser from 'phaser';

export interface MapInfo {
  key: string; w: number; h: number; hero: { x: number; y: number; dir: number };
  exits: { x: number; y: number; label: string }[];
  marks: { x: number; y: number; label: string; col: string }[];
  dots: { x: number; y: number; kind: 'mon' | 'boss' | 'animal' | 'player' }[];
  /** buildings and NPCs: tiny names on the small map (you see there is something), readable on the big one */
  names?: { x: number; y: number; label: string; npc: boolean }[];
}
interface Host { add: Phaser.GameObjects.GameObjectFactory; textures: Phaser.Textures.TextureManager; VW: number; VH: number; root: Phaser.GameObjects.Container; kit: { text(x: number, y: number, t: string, size: number, col?: string, st?: object): Phaser.GameObjects.Text } }

const DOT: Record<MapInfo['dots'][number]['kind'], [number, number]> = { mon: [0xff5a4a, 1.2], boss: [0xff2a2a, 3], animal: [0xd8a060, 1.2], player: [0x8fd8ff, 1.4] };

export class Minimap {
  big = false;
  img: Phaser.GameObjects.Image; g: Phaser.GameObjects.Graphics; zone: Phaser.GameObjects.Zone; back: Phaser.GameObjects.Rectangle;
  labels: Phaser.GameObjects.Text[] = [];
  names: Phaser.GameObjects.Text[] = []; namesT = 0; tip?: Phaser.GameObjects.Text;
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
  toggle() { this.big = !this.big; this.key = ''; this.namesT = 0; }
  /** the names of buildings / NPCs (NPCs walk: placed again a few times a second) */
  drawNames(m: MapInfo, x: number, y: number, w: number, hh: number, sx: number, sy: number, time: number) {
    const list = m.names ?? [], ui = this.ui;
    if (time - this.namesT > 300) {
      this.namesT = time;
      const big = this.big, sz = big ? 8 : 4.2;
      while (this.names.length < list.length) { const t = ui.kit.text(0, 0, '', 8, '#ffffff', { stroke: '#000000', strokeThickness: 3 }).setOrigin(0.5, 1); ui.root.add(t); this.names.push(t); }
      this.names.forEach((t, i) => {
        const e = list[i]; if (!e) { t.setVisible(false); return; }
        if (t.text !== e.label) t.setText(e.label);
        // (buildings: the name above the square; NPCs: below the dot — a cook by her kitchen no longer covers its name)
        t.setFontSize(sz).setStroke('#000000', big ? 3 : 1.5).setColor(e.npc ? '#fff4d8' : '#ffd84a').setAlpha(big ? 1 : 0.7).setOrigin(0.5, e.npc ? 0 : 1)
          .setPosition(x + Phaser.Math.Clamp(e.x * sx, 8, w - 8), e.npc ? y + Phaser.Math.Clamp(e.y * sy + (big ? 3 : 1.5), 0, hh - sz - 1) : y + Phaser.Math.Clamp(e.y * sy - (big ? 3 : 1.5), sz + 1, hh)).setVisible(true);
      });
    }
    // (small map with names: a hint that it opens)
    if (!this.tip) { this.tip = ui.kit.text(0, 0, '🔍 แตะเพื่อดูชื่อ', 5.5, '#ffe7a0', { stroke: '#000000', strokeThickness: 2 }).setOrigin(1, 0); ui.root.add(this.tip); }
    this.tip.setVisible(!this.big && list.length > 0).setPosition(x + w, y + hh + 2);
  }
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
    [this.img, this.g, this.zone].forEach(o => o.setVisible(show)); if (!m) { this.back.setVisible(false); this.names.forEach(t => t.setVisible(false)); this.tip?.setVisible(false); return; }
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
    this.drawNames(m, x, y, w, hh, sx, sy, time);
    const g = this.g; g.clear();
    g.lineStyle(2, 0x0b0805, 1).strokeRect(x - 1, y - 1, w + 2, hh + 2).lineStyle(1, 0xc8a050, 1).strokeRect(x - 2, y - 2, w + 4, hh + 4);
    const P = (px: number, py: number) => [x + Phaser.Math.Clamp(px, 0, m.w) * sx, y + Phaser.Math.Clamp(py, 0, m.h) * sy] as const;
    for (const e of m.marks) { const [a, b] = P(e.x, e.y); g.fillStyle(0xffb040, 1).fillRect(a - 2, b - 2, 4, 4); }
    for (const e of m.names ?? []) { const [a, b] = P(e.x, e.y); if (e.npc) g.fillStyle(0xfff0c0, 0.95).fillCircle(a, b, this.big ? 2.4 : 1.3); else g.fillStyle(0xffd060, 0.9).fillRect(a - (this.big ? 2.5 : 1.5), b - (this.big ? 2.5 : 1.5), this.big ? 5 : 3, this.big ? 5 : 3); }
    for (const d of m.dots) { const [a, b] = P(d.x, d.y), [c, r] = DOT[d.kind]; g.fillStyle(c, d.kind === 'boss' ? 1 : 0.9).fillCircle(a, b, r * (this.big ? 1.6 : 1)); }
    void time;   // (exits no longer blink — a player: too many flashing dots)
    for (const e of m.exits) { const [a, b] = P(e.x, e.y); g.lineStyle(1, 0x9fffb0, 0.8).strokeCircle(a, b, this.big ? 4 : 2.5); g.fillStyle(0x3aff7a, 1).fillCircle(a, b, 1.5); }
    // the hero: an arrow pointing where they face
    const [hx, hy] = P(m.hero.x, m.hero.y), ang = Math.PI / 2 - m.hero.dir * Math.PI / 4, R = this.big ? 6 : 4;
    const pt = (r: number, da: number) => [hx + Math.cos(ang + da) * r, hy + Math.sin(ang + da) * r] as const;
    const [a1, b1] = pt(R, 0), [a2, b2] = pt(R * 0.8, 2.5), [a3, b3] = pt(R * 0.8, -2.5);
    g.fillStyle(0x000000, 0.6).fillCircle(hx, hy, R + 1.5).fillStyle(0xffe04a, 1).fillTriangle(a1, b1, a2, b2, a3, b3);
  }
}
