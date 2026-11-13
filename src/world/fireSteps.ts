// 🔥 Fire footprints (fashion, prototype — director): every step leaves a burning footprint on the ground; the last 10
// follow behind the hero. The newest burn bright with small flickering flames, older ones die down to embers and go;
// standing still lets the whole trail burn out. Footprints point the way the hero walks, left / right in turn.
// (Code-drawn for now — the real flame art comes from PixelLab once the director approves the look.)
import Phaser from 'phaser';

export const TRAIL_STEPS = 10;     // footprints behind the hero (director: 10)
const STRIDE = 20;                 // px walked per footprint
const IDLE_OUT = 1500;             // ms for the whole trail to burn out after stopping
interface Step { x: number; y: number; born: number; foot: Phaser.GameObjects.Image; glow: Phaser.GameObjects.Image; flames: Phaser.GameObjects.Image[]; ph: number[]; dying?: number }

function textures(sc: Phaser.Scene) {
  if (!sc.textures.exists('fs_foot')) {   // a sole print (no toes — the heroes are small; director), burnt: dark core, glowing rim — pixel art 12×18
    const cv = document.createElement('canvas'); cv.width = 12; cv.height = 18; const c = cv.getContext('2d')!;
    const px = (x: number, y: number, col: string) => { c.fillStyle = col; c.fillRect(x, y, 1, 1); };
    const sole = ['....####....', '...######...', '..########..', '..########..', '..#######...', '...######...', '...#####....', '...#####....', '...######...', '..#######...', '..########..', '..########..', '...######...', '....####....'];
    sole.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === '#') px(x, y + 2, '#3a0c04'); }));
    // the burning rim
    const solid = (x: number, y: number) => { const d = c.getImageData(x, y, 1, 1).data; return d[3] > 0; };
    const rim: [number, number][] = [];
    for (let y = 0; y < 18; y++) for (let x = 0; x < 12; x++) if (solid(x, y) && (!solid(x - 1, y) || !solid(x + 1, y) || !solid(x, y - 1) || !solid(x, y + 1) || x === 0 || x === 11 || y === 0 || y === 17)) rim.push([x, y]);
    for (const [x, y] of rim) px(x, y, y < 8 ? '#ffb02e' : '#e8501a');
    for (const [x, y] of [[5, 9], [6, 10], [5, 13], [6, 14]] as [number, number][]) px(x, y, '#8a1c08');   // embers inside
    sc.textures.addCanvas('fs_foot', cv);
  }
  if (!sc.textures.exists('fs_flame')) {   // one small flame tongue 7×12: white-yellow core, orange, red tip
    const cv = document.createElement('canvas'); cv.width = 7; cv.height = 12; const c = cv.getContext('2d')!;
    const rows = ['...r...', '...r...', '..rOr..', '..rOr..', '.rOyOr.', '.rOyOr.', 'rOyWyOr', 'rOyWyOr', 'rOyWyOr', '.rOyOr.', '..rOr..', '...r...'];
    const col: Record<string, string> = { r: '#d8361a', O: '#ff7a1a', y: '#ffd23a', W: '#fff6c8' };
    rows.forEach((row, y) => [...row].forEach((ch, x) => { if (col[ch]) { c.fillStyle = col[ch]; c.fillRect(x, y, 1, 1); } }));
    sc.textures.addCanvas('fs_flame', cv);
  }
}

export class FireSteps {
  steps: Step[] = []; private walked = 0; private lx = NaN; private ly = NaN; private left = false; private lastStep = 0;
  constructor(private sc: Phaser.Scene) { textures(sc); }
  /** call every frame with the hero's feet; `walking` = moving on foot (not riding) */
  update(time: number, x: number, y: number, walking: boolean) {
    if (Number.isNaN(this.lx)) { this.lx = x; this.ly = y; }
    const dx = x - this.lx, dy = y - this.ly, d = Math.hypot(dx, dy);
    if (d > 120) { this.walked = 0; }   // (a warp: no footprints across the map)
    else if (walking && d > 0) {
      this.walked += d;
      if (this.walked >= STRIDE) { this.walked = 0; this.place(time, x, y, Math.atan2(dy, dx)); }
    }
    this.lx = x; this.ly = y;
    // burn: the newest bright with flames, older dying down to embers; stopping burns the whole trail out
    const idle = Math.max(0, time - this.lastStep - 250) / IDLE_OUT;
    const n = this.steps.length;
    this.steps.forEach((s, i) => {
      const age = (n - 1 - i) / TRAIL_STEPS;                       // 0 = newest … ~1 = oldest
      let life = Math.max(0, 1 - age * 0.95 - idle);
      if (s.dying !== undefined) life *= Math.max(0, 1 - (time - s.dying) / 350);
      const fl = Math.max(0, (life - 0.25) / 0.75);               // flames only while it still burns well
      s.foot.setAlpha(Math.min(1, 0.25 + life)).setTint(Phaser.Display.Color.GetColor(255, Math.round(120 + 135 * life), Math.round(90 + 100 * life)));
      s.glow.setAlpha(0.15 + 0.55 * life * (0.85 + 0.15 * Math.sin(time / 90 + s.ph[0])));
      s.flames.forEach((f, k) => {
        const flick = 0.75 + 0.35 * Math.sin(time / (70 + k * 13) + s.ph[k]) + 0.12 * Math.sin(time / 23 + s.ph[k] * 3);
        f.setScale((0.5 + 0.25 * k % 2) * (0.6 + 0.4 * fl), Math.max(0.01, fl * flick * (k === 0 ? 1.15 : 0.85))).setAlpha(fl > 0.02 ? 0.9 : 0);
        f.x = s.x + Math.sin(time / 160 + s.ph[k]) * 0.6 + (f.getData('ox') as number);
      });
      if (life <= 0.01) s.dying ??= time - 350;
    });
    for (const s of [...this.steps]) if (s.dying !== undefined && time - s.dying >= 350) this.drop(s);
  }
  private place(time: number, x: number, y: number, ang: number) {
    this.left = !this.left; this.lastStep = time;
    const side = this.left ? -1 : 1, ox = Math.cos(ang + Math.PI / 2) * 4 * side, oy = Math.sin(ang + Math.PI / 2) * 3 * side;
    const sx = x + ox, sy = y + oy, rot = ang + Math.PI / 2, sc = this.sc;
    const foot = sc.add.image(sx, sy, 'fs_foot').setRotation(rot).setScale(0.75).setFlipX(this.left).setDepth(sy - 30);
    const glow = sc.add.image(sx, sy, 'td_glow').setTint(0xff6a1a).setBlendMode(Phaser.BlendModes.ADD).setScale(0.55, 0.4).setDepth(sy - 31);
    // three little flames: on the toes, the ball and the heel (they stand up, whatever way the foot points)
    const fx = Math.cos(rot - Math.PI / 2), fy = Math.sin(rot - Math.PI / 2);
    const flames = [5, 0, -5].map((t, k) => sc.add.image(sx + fx * t, sy + fy * t * 0.7, 'fs_flame').setOrigin(0.5, 1).setBlendMode(Phaser.BlendModes.ADD).setDepth(sy - 29 + k).setData('ox', fx * t));
    const ph = [Math.random() * 6.3, Math.random() * 6.3, Math.random() * 6.3];
    this.steps.push({ x: sx, y: sy, born: time, foot, glow, flames, ph });
    const live = this.steps.filter(s => s.dying === undefined);
    if (live.length > TRAIL_STEPS) live[0].dying = time;   // (the 11th: burns out quickly)
  }
  private drop(s: Step) { s.foot.destroy(); s.glow.destroy(); s.flames.forEach(f => f.destroy()); this.steps = this.steps.filter(q => q !== s); }
  destroy() { for (const s of [...this.steps]) this.drop(s); }
}
