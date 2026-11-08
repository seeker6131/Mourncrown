// Prototype of the new art direction: top-down 3/4 pixel art, muted dark-forest tone.
// Ground is painted per pixel from distance fields (grass, dirt road, cobble plaza, river, pond); props are code-drawn
// placeholders until the PixelLab/ChatGPT art arrives. The hero is the PixelLab villager (8 directions).
// Open with ?td in the URL.
import Phaser from 'phaser';
import heroIdle from '../assets/td/hero_idle.webp';
import heroWalk from '../assets/td/hero_walking.webp';
import heroAttack from '../assets/td/hero_attack.webp';
import hr3Idle from '../assets/td/hr3_idle.webp';
import hr3Walk from '../assets/td/hr3_walking.webp';

// hero forms from PixelLab: idle sheet (8 dirs, 48px), walk sheet (8 rows x 8 frames, 68px), optional attack (8 rows x 9)
const FORMS: { key: string; name: string; idle: string; walk: string; attack?: string; idleFoot: number; walkFoot: number }[] = [
  { key: 'hero', name: 'ชาวบ้าน', idle: heroIdle, walk: heroWalk, attack: heroAttack, idleFoot: 46, walkFoot: 56 },
  { key: 'hr3', name: 'ลอร์ดอัศวิน', idle: hr3Idle, walk: hr3Walk, idleFoot: 44, walkFoot: 54 },
];

const MW = 1280, MH = 800;           // map size in game px (1 texel = 1 px)
const CELL = 4;                       // collision grid
const DIRS = ['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west'];

type RGB = [number, number, number];
const PAL = {
  grass: [[52, 74, 58], [58, 82, 62], [66, 92, 68], [74, 101, 72]] as RGB[],
  weed: [[92, 116, 80], [104, 126, 84]] as RGB[],
  dirt: [[110, 86, 62], [122, 96, 70], [134, 108, 80]] as RGB[],
  pebble: [[150, 132, 108], [86, 70, 54]] as RGB[],
  stone: [[96, 102, 106], [106, 112, 116], [116, 121, 124]] as RGB[],
  gap: [[56, 62, 64], [62, 74, 62]] as RGB[],
  water: [[40, 80, 88], [46, 92, 98], [54, 104, 108]] as RGB[],
  foam: [[96, 140, 140]] as RGB[],
  mud: [[70, 62, 48], [80, 70, 54]] as RGB[],
  plank: [[112, 84, 58], [98, 72, 50], [126, 96, 66]] as RGB[],
};

function hash(x: number, y: number) { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x: number, y: number) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const s = (t: number) => t * t * (3 - 2 * t);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * s(xf) + (c - a) * s(yf) + (a - b - c + d) * s(xf) * s(yf);
}
const fbm = (x: number, y: number) => vnoise(x, y) * 0.55 + vnoise(x * 2.1, y * 2.1) * 0.3 + vnoise(x * 4.3, y * 4.3) * 0.15;
const pick = (p: RGB[], r: number) => p[Math.min(p.length - 1, Math.floor(r * p.length))];

// ---- layout (distance fields) ----
const riverX = (y: number) => 930 + Math.sin(y / 130) * 46 + Math.sin(y / 47) * 10;
const roadY = (x: number) => 420 + Math.sin(x / 160) * 18;
const PLAZA = { x: 520, y: 410, r: 92 };
const POND = { x: 250, y: 650, r: 56 };
const BRIDGE = { y0: roadY(930) - 20, y1: roadY(930) + 20 };
function surface(x: number, y: number) {
  const n = (fbm(x / 22, y / 22) - 0.5) * 10;
  const dr = Math.abs(x - riverX(y));
  if (dr < 26 + n * 0.6) return y > BRIDGE.y0 && y < BRIDGE.y1 && dr < 40 ? 'bridge' : 'water';
  if (dr < 31 + n) return y > BRIDGE.y0 && y < BRIDGE.y1 ? 'bridge' : 'mud';
  const dp = Math.hypot(x - POND.x, (y - POND.y) * 1.3);
  if (dp < POND.r + n) return 'water';
  if (dp < POND.r + 5 + n) return 'mud';
  if (Math.hypot(x - PLAZA.x, (y - PLAZA.y) * 1.15) < PLAZA.r + (fbm(x / 38, y / 38) - 0.5) * 46 + n * 0.5) return 'cobble';
  const road = Math.abs(y - roadY(x)) < 15 + n;
  const north = x > PLAZA.x - 16 - n && x < PLAZA.x + 16 + n && y < PLAZA.y;
  const south = Math.abs(x - (PLAZA.x - 40 + (y - PLAZA.y) * 0.35)) < 13 + n && y > PLAZA.y && y < 760;
  if (road || north || south) return 'dirt';
  return 'grass';
}

export class TopDownScene extends Phaser.Scene {
  hero!: Phaser.GameObjects.Sprite;
  shadow!: Phaser.GameObjects.Ellipse;
  blocked!: Uint8Array;
  keys?: Record<string, Phaser.Input.Keyboard.Key>;
  dir = 0;
  joy = { id: -1, x: 0, y: 0, dx: 0, dy: 0 };
  joyG!: Phaser.GameObjects.Graphics;
  lamps: Phaser.GameObjects.Image[] = [];
  vignette!: Phaser.GameObjects.Image;
  label!: Phaser.GameObjects.Text;

  constructor() { super('TopDown'); }

  preload() {
    for (const f of FORMS) {
      this.load.spritesheet(`td_${f.key}_idle`, f.idle, { frameWidth: 48, frameHeight: 48 });
      this.load.spritesheet(`td_${f.key}_walk`, f.walk, { frameWidth: 68, frameHeight: 68 });
      if (f.attack) this.load.spritesheet(`td_${f.key}_attack`, f.attack, { frameWidth: 68, frameHeight: 68 });
    }
  }

  create() {
    this.blocked = new Uint8Array((MW / CELL) * (MH / CELL));
    this.paintGround();
    this.makePropTextures();
    this.placeProps();

    for (const f of FORMS) {
      if (f.attack) DIRS.forEach((d, i) => this.anims.create({ key: `${f.key}_a_${d}`, frames: this.anims.generateFrameNumbers(`td_${f.key}_attack`, { start: i * 9, end: i * 9 + 8 }), frameRate: 18, repeat: 0 }));
      DIRS.forEach((d, i) => this.anims.create({ key: `${f.key}_w_${d}`, frames: this.anims.generateFrameNumbers(`td_${f.key}_walk`, { start: i * 8, end: i * 8 + 7 }), frameRate: 10, repeat: -1 }));
    }
    this.shadow = this.add.ellipse(PLAZA.x, PLAZA.y + 40, 18, 7, 0x10180f, 0.45).setDepth(1);
    this.hero = this.add.sprite(PLAZA.x, PLAZA.y + 40, 'td_hero_idle', 0).setOrigin(0.5, 46 / 48);
    this.form = 0;

    const cam = this.cameras.main;
    cam.setBounds(0, 0, MW, MH).setBackgroundColor('#1b2420').startFollow(this.hero, true, 0.18, 0.18).setRoundPixels(true);
    const zoom = () => cam.setZoom(Math.max(2, Math.floor(this.scale.height / 250)));
    zoom(); this.scale.on('resize', zoom);

    this.addOverlay();
    // UI lives on its own unzoomed camera
    const ui = [this.vignette, this.label, this.joyG = this.add.graphics()];
    const uiCam = this.cameras.add(0, 0, this.scale.width, this.scale.height);
    uiCam.ignore(this.children.list.filter(o => !ui.includes(o as never)));
    cam.ignore(ui);
    this.scale.on('resize', () => uiCam.setSize(this.scale.width, this.scale.height));
    if (this.input.keyboard) { this.keys = this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT') as Record<string, Phaser.Input.Keyboard.Key>; this.input.keyboard.on('keydown-SPACE', () => this.attack()); }
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => { if (p.x > this.scale.width * 0.7 && p.y < this.scale.height * 0.25) { this.nextForm(); return; } if (p.x < this.scale.width * 0.35 && p.y < this.scale.height * 0.18) { this.heroDie(); return; } if (p.x > this.scale.width * 0.55) { this.attack(); return; } if (this.joy.id < 0) { this.joy.id = p.id; this.joy.x = p.x; this.joy.y = p.y; this.joy.dx = this.joy.dy = 0; } });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => { if (p.id === this.joy.id) { this.joy.dx = p.x - this.joy.x; this.joy.dy = p.y - this.joy.y; } });
    const up = (p: Phaser.Input.Pointer) => { if (p.id === this.joy.id) { this.joy.id = -1; this.joy.dx = this.joy.dy = 0; } };
    this.input.on('pointerup', up); this.input.on('pointerupoutside', up);
  }

  // ---------- ground ----------
  paintGround() {
    const cv = document.createElement('canvas'); cv.width = MW; cv.height = MH;
    const ctx = cv.getContext('2d')!, img = ctx.createImageData(MW, MH), d = img.data;
    const S: string[] = new Array(MW * MH);
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) S[y * MW + x] = surface(x, y);
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      const s = S[y * MW + x], r = hash(x, y), n = fbm(x / 9, y / 9);
      let c: RGB;
      if (s === 'grass') {
        c = pick(PAL.grass, n * 0.85 + r * 0.25);
        if (r > 0.985) c = pick(PAL.weed, hash(y, x));
      } else if (s === 'dirt') {
        c = pick(PAL.dirt, n * 0.8 + r * 0.3);
        if (r > 0.97) c = pick(PAL.pebble, hash(y, x));
      } else if (s === 'cobble') {
        // irregular stones from a jittered grid
        const gx = Math.floor(x / 7), gy = Math.floor(y / 6);
        let best = 1e9, second = 1e9, id = 0;
        for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
          const cx = (gx + i) * 7 + hash(gx + i, gy + j) * 6, cy = (gy + j) * 6 + hash(gy + j, gx + i) * 5;
          const dd = Math.hypot(x - cx, (y - cy) * 1.15);
          if (dd < best) { second = best; best = dd; id = hash(gx + i + 99, gy + j); } else if (dd < second) second = dd;
        }
        c = second - best < 1.1 ? pick(PAL.gap, r) : pick(PAL.stone, id * 0.7 + (best < 1.5 ? 0.3 : 0));
      } else if (s === 'water') {
        const wv = Math.sin(x * 0.18 + Math.sin(y * 0.09) * 2 + y * 0.05);
        c = wv > 0.93 ? PAL.foam[0] : pick(PAL.water, n * 0.6 + (wv + 1) * 0.2);
      } else if (s === 'mud') c = pick(PAL.mud, r);
      else { // bridge planks across the river
        const py = Math.floor((y - BRIDGE.y0) / 5);
        c = (y - BRIDGE.y0) % 5 === 0 ? [70, 52, 36] : pick(PAL.plank, hash(py, 7) * 0.6 + r * 0.4);
        if (y < BRIDGE.y0 + 3 || y > BRIDGE.y1 - 3) c = [84, 62, 42];
      }
      // soft edge shading: darker pixels next to a different surface
      if (s !== 'water' && x > 0 && y > 0 && (S[y * MW + x - 1] !== s || S[(y - 1) * MW + x] !== s) && s !== 'bridge') c = [c[0] * 0.82, c[1] * 0.82, c[2] * 0.82] as RGB;
      const o = (y * MW + x) * 4; d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
      if (s === 'water' || s === 'mud' && Math.abs(x - riverX(y)) < 28) this.block(x, y);
    }
    ctx.putImageData(img, 0, 0);
    if (this.textures.exists('td_ground')) this.textures.remove('td_ground');
    this.textures.addCanvas('td_ground', cv);
    this.add.image(0, 0, 'td_ground').setOrigin(0).setDepth(0);
    // map border
    for (let x = 0; x < MW; x += CELL) { this.block(x, 0); this.block(x, MH - 1); }
    for (let y = 0; y < MH; y += CELL) { this.block(0, y); this.block(MW - 1, y); }
  }

  block(x: number, y: number) { const i = Math.floor(y / CELL) * (MW / CELL) + Math.floor(x / CELL); if (i >= 0 && i < this.blocked.length) this.blocked[i] = 1; }
  isBlocked(x: number, y: number) {
    if (x < 0 || y < 0 || x >= MW || y >= MH) return true;
    return this.blocked[Math.floor(y / CELL) * (MW / CELL) + Math.floor(x / CELL)] === 1;
  }

  // ---------- placeholder props (code-drawn in the same palette) ----------
  makePropTextures() {
    const tex = (key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D, px: (x: number, y: number, c: string) => void) => void) => {
      if (this.textures.exists(key)) return;
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const ctx = cv.getContext('2d')!;
      draw(ctx, (x, y, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1); });
      // 1px dark outline around opaque pixels
      const id = ctx.getImageData(0, 0, w, h), a = id.data, out = new Uint8ClampedArray(a);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4; if (a[o + 3]) continue;
        const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([i, j]) => { const X = x + i, Y = y + j; return X >= 0 && Y >= 0 && X < w && Y < h && a[(Y * w + X) * 4 + 3] > 0; });
        if (nb) { out[o] = 20; out[o + 1] = 26; out[o + 2] = 22; out[o + 3] = 255; }
      }
      ctx.putImageData(new ImageData(out, w, h), 0, 0);
      this.textures.addCanvas(key, cv);
    };
    const blob = (px: (x: number, y: number, c: string) => void, cx: number, cy: number, rx: number, ry: number, cols: string[], seed: number) => {
      for (let y = Math.floor(cy - ry - 2); y <= cy + ry + 2; y++) for (let x = Math.floor(cx - rx - 2); x <= cx + rx + 2; x++) {
        const e = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + (vnoise(x / 3 + seed, y / 3) - 0.5) * 0.5;
        if (e > 1) continue;
        const light = (-(x - cx) / rx - (y - cy) / ry) * 0.5 + (vnoise(x / 2 + seed, y / 2 + seed) - 0.5) * 0.8;
        px(x, y, cols[light > 0.45 ? 3 : light > 0.05 ? 2 : light > -0.4 ? 1 : 0]);
      }
    };
    const leaf = ['#2c4636', '#3a5a44', '#4a6c50', '#5e7e5c'];
    tex('td_tree', 44, 54, (_c, px) => {
      for (let y = 34; y < 52; y++) for (let x = 19; x < 25; x++) px(x, y, x < 21 ? '#4a3626' : x > 23 ? '#2e2218' : '#3c2c1e');
      blob(px, 22, 22, 19, 17, leaf, 1); blob(px, 15, 27, 9, 8, leaf, 2); blob(px, 30, 27, 9, 8, leaf, 3);
    });
    tex('td_pine', 28, 52, (_c, px) => {
      for (let y = 40; y < 50; y++) for (let x = 12; x < 16; x++) px(x, y, '#3c2c1e');
      for (let t = 0; t < 4; t++) {
        const top = 2 + t * 9, base = top + 14, half = 5 + t * 2.5;
        for (let y = top; y < base; y++) { const hw = (y - top) / (base - top) * half; for (let x = Math.round(14 - hw); x <= 14 + hw; x++) px(x, y, x < 14 - hw * 0.4 ? '#34523e' : x > 14 + hw * 0.5 ? '#22382c' : '#2c4636'); }
      }
    });
    tex('td_bush', 22, 16, (_c, px) => blob(px, 11, 9, 9, 6, leaf, 5));
    tex('td_rock', 20, 15, (_c, px) => blob(px, 10, 8, 8, 6, ['#4c5254', '#5e6466', '#72787a', '#868c8a'], 7));
    tex('td_fence', 32, 18, (_c, px) => {
      for (const fx of [2, 15, 28]) for (let y = 2; y < 17; y++) for (let x = fx; x < fx + 3; x++) px(x, y, x === fx ? '#5a4430' : '#46341f');
      for (const fy of [5, 11]) for (let x = 2; x < 31; x++) for (let y = fy; y < fy + 2; y++) px(x, y, y === fy ? '#6e5438' : '#4e3a26');
    });
    tex('td_lamp', 14, 40, (_c, px) => {
      for (let y = 8; y < 39; y++) for (let x = 6; x < 8; x++) px(x, y, '#3c2c1e');
      for (let x = 6; x < 12; x++) px(x, 8, '#3c2c1e');
      for (let y = 10; y < 17; y++) for (let x = 8; x < 13; x++) px(x, y, y === 10 || y === 16 ? '#2a2a26' : '#ffd77a');
    });
    tex('td_glow', 64, 64, (ctx) => {
      const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(255,214,140,0.55)'); g.addColorStop(1, 'rgba(255,214,140,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
    });
  }

  prop(key: string, x: number, y: number, foot: number, ox = 0.5) {
    const im = this.add.image(x, y, key).setOrigin(ox, 1).setDepth(y);
    this.add.ellipse(x, y - 1, Math.max(8, im.width * 0.55), 5, 0x10180f, 0.35).setDepth(1);
    for (let j = -2; j <= 1; j++) for (let i = -foot; i <= foot; i += 2) this.block(x + i, y + j);
    return im;
  }

  placeProps() {
    const free = (x: number, y: number, r: number) => {
      for (let j = -r; j <= r; j += 4) for (let i = -r; i <= r; i += 4) if (surface(x + i, y + j) !== 'grass') return false;
      return true;
    };
    // forest edge and clusters
    let seed = 1;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let k = 0; k < 900; k++) {
      const x = 16 + rnd() * (MW - 32), y = 50 + rnd() * (MH - 60);
      const edge = Math.min(x, MW - x, y, MH - y);
      const dense = edge < 80 || fbm(x / 140, y / 140) > 0.62;
      if (!dense || !free(x, y, 18)) continue;
      const pine = rnd() < 0.45;
      this.prop(pine ? 'td_pine' : 'td_tree', Math.round(x), Math.round(y), 3);
    }
    for (let k = 0; k < 160; k++) {
      const x = 20 + rnd() * (MW - 40), y = 30 + rnd() * (MH - 40);
      if (!free(x, y, 10)) continue;
      const r = rnd();
      if (r < 0.55) this.add.image(Math.round(x), Math.round(y), 'td_bush').setOrigin(0.5, 1).setDepth(y);
      else this.prop('td_rock', Math.round(x), Math.round(y), 5);
    }
    // fences along the road, lamps around the plaza
    for (let x = 40; x < 860; x += 32) {
      const y = Math.round(roadY(x) + 30);
      if (Math.abs(x - PLAZA.x) < PLAZA.r + 20 || Math.abs(x - (PLAZA.x - 40)) < 30) continue;
      if (surface(x + 16, y) === 'grass') this.prop('td_fence', x, y, 14, 0);
    }
    for (let a = 0; a < 6; a++) {
      const x = Math.round(PLAZA.x + Math.cos(a * Math.PI / 3 + 0.5) * (PLAZA.r + 8)), y = Math.round(PLAZA.y + Math.sin(a * Math.PI / 3 + 0.5) * (PLAZA.r + 8));
      if (surface(x, y) === 'dirt') continue;
      this.prop('td_lamp', x, y, 2);
      this.lamps.push(this.add.image(x + 3, y - 27, 'td_glow').setBlendMode(Phaser.BlendModes.ADD).setDepth(99990));
    }
  }

  addOverlay() {
    // dusk vignette, fixed to the screen
    const key = 'td_vignette';
    if (!this.textures.exists(key)) {
      const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256; const ctx = cv.getContext('2d')!;
      const g = ctx.createRadialGradient(128, 128, 60, 128, 128, 182);
      g.addColorStop(0, 'rgba(10,16,22,0)'); g.addColorStop(1, 'rgba(10,16,22,0.62)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
      this.textures.addCanvas(key, cv);
    }
    this.vignette = this.add.image(0, 0, key).setOrigin(0).setDepth(100000);
    const fit = () => this.vignette.setDisplaySize(this.scale.width, this.scale.height);
    fit(); this.scale.on('resize', fit);
    const fs = Math.round(this.scale.height / 30);
    this.label = this.add.text(fs * 0.6, fs * 0.6, 'ทดลอง: มองจากบน • ร่าง ชาวบ้าน (แตะมุมขวาบน = เปลี่ยนร่าง • แตะข้อความนี้ = ทดสอบท่าตาย)', { fontFamily: 'sans-serif', fontSize: fs + 'px', color: '#e8e0c8', stroke: '#0b0f0c', strokeThickness: Math.max(2, fs / 5) })
      .setDepth(100002);
  }

  form = 0;
  get F() { return FORMS[this.form]; }
  nextForm() {
    if (this.attacking) return;
    this.form = (this.form + 1) % FORMS.length;
    this.hero.stop(); this.hero.setTexture(`td_${this.F.key}_idle`, this.dir).setOrigin(0.5, this.F.idleFoot / 48);
    this.label.setText(`ทดลอง: มองจากบน • ร่าง ${this.F.name} (แตะมุมขวาบน = เปลี่ยนร่าง • แตะข้อความนี้ = ทดสอบท่าตาย)`);
  }
  dead = false;
  /** Demo: the hero dies with the code-made death effect, then respawns. */
  heroDie() {
    if (this.dead) return;
    this.dead = true; this.attacking = false;
    const h = this.hero;
    this.deathFx(h, 0xbfe8ff, () => {
      this.time.delayedCall(900, () => {
        h.setPosition(PLAZA.x, PLAZA.y + 40).setAngle(0).setAlpha(0).setVisible(true).clearTint();
        h.setTexture(`td_${this.F.key}_idle`, 0).setOrigin(0.5, this.F.idleFoot / 48);
        this.tweens.add({ targets: h, alpha: 1, duration: 500, onComplete: () => { this.dead = false; } });
        this.shadow.setAlpha(1);
      });
    });
  }

  /** Code-made death: white flash → knock back and topple → burst into the sprite's own pixels → a soul rises. */
  deathFx(sp: Phaser.GameObjects.Sprite, soul: number, done?: () => void) {
    sp.anims.stop();
    const back = this.dir >= 1 && this.dir <= 3 ? -1 : this.dir >= 5 && this.dir <= 7 ? 1 : (Math.random() < 0.5 ? -1 : 1);
    sp.setTintFill(0xffffff);
    this.time.delayedCall(70, () => sp.clearTint());
    this.cameras.main.shake(120, 0.004);
    this.tweens.add({ targets: sp, x: sp.x + back * 7, duration: 180, ease: 'Quad.easeOut' });
    this.tweens.add({ targets: sp, y: sp.y - 5, duration: 90, yoyo: true, ease: 'Quad.easeOut' });
    this.tweens.add({ targets: sp, angle: back * 82, duration: 260, delay: 60, ease: 'Quad.easeIn', onComplete: () => {
      this.burst(sp, soul);
      sp.setVisible(false);
      this.tweens.add({ targets: this.shadow, alpha: 0, duration: 400 });
      done?.();
    } });
  }

  burst(sp: Phaser.GameObjects.Sprite, soul: number) {
    const fr = sp.frame, src = fr.source.image as HTMLImageElement | HTMLCanvasElement;
    const cv = document.createElement('canvas'); cv.width = fr.cutWidth; cv.height = fr.cutHeight;
    const ctx = cv.getContext('2d')!; ctx.drawImage(src, fr.cutX, fr.cutY, fr.cutWidth, fr.cutHeight, 0, 0, fr.cutWidth, fr.cutHeight);
    const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
    const ox = sp.originX * cv.width, oy = sp.originY * cv.height;
    const a = Phaser.Math.DegToRad(sp.angle), ca = Math.cos(a), sa = Math.sin(a);
    for (let y = 0; y < cv.height; y += 2) for (let x = 0; x < cv.width; x += 2) {
      const o = (y * cv.width + x) * 4;
      if (d[o + 3] < 128) continue;
      const lx = x - ox, ly = y - oy;
      const wx = sp.x + lx * ca - ly * sa, wy = sp.y + lx * sa + ly * ca;
      const r = this.add.rectangle(wx, wy, 2, 2, (d[o] << 16) | (d[o + 1] << 8) | d[o + 2]).setDepth(sp.y + 1);
      const ang = Math.atan2(wy - (sp.y - 12), wx - sp.x) + (Math.random() - 0.5) * 0.8, spd = 10 + Math.random() * 26;
      this.tweens.add({ targets: r, x: wx + Math.cos(ang) * spd, y: wy + Math.sin(ang) * spd * 0.6 + 6 + Math.random() * 8,
        alpha: 0, angle: (Math.random() - 0.5) * 180, duration: 500 + Math.random() * 500, ease: 'Quad.easeOut', onComplete: () => r.destroy() });
    }
    const g = this.add.image(sp.x, sp.y - 14, 'td_glow').setScale(0.28).setTint(soul).setBlendMode(Phaser.BlendModes.ADD).setDepth(99991);
    const core = this.add.circle(sp.x, sp.y - 14, 2, soul).setDepth(99992);
    this.tweens.add({ targets: [g, core], y: sp.y - 48, alpha: 0, duration: 1300, ease: 'Sine.easeOut', onComplete: () => { g.destroy(); core.destroy(); } });
    this.tweens.add({ targets: g, scale: 0.45, duration: 1300 });
  }

  attacking = false;
  attack() {
    if (this.dead || this.attacking || !this.F.attack) return;
    this.attacking = true;
    const h = this.hero;
    const F = this.F;
    h.setTexture(`td_${F.key}_attack`).setOrigin(0.5, F.walkFoot / 68).play(`${F.key}_a_${DIRS[this.dir]}`);
    h.once('animationcomplete', () => { this.attacking = false; h.setTexture(`td_${F.key}_idle`, this.dir).setOrigin(0.5, F.idleFoot / 48); });
  }

  update(time: number, dt: number) {
    let mx = 0, my = 0;
    const k = this.keys;
    if (k) { mx = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0); my = (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0); }
    const R = this.scale.height / 9;
    if (this.joy.id >= 0) {
      const l = Math.hypot(this.joy.dx, this.joy.dy);
      if (l > 6) { mx = this.joy.dx / l; my = this.joy.dy / l; }
    }
    const len = Math.hypot(mx, my);
    const h = this.hero;
    if (this.dead) { /* dying */ } else if (this.attacking) { /* finish the swing first */ } else if (len > 0) {
      mx /= len; my /= len;
      const sp = 72 * dt / 1000;
      const nx = h.x + mx * sp, ny = h.y + my * sp;
      const ok = (x: number, y: number) => !this.isBlocked(x - 5, y) && !this.isBlocked(x + 5, y) && !this.isBlocked(x, y - 2) && !this.isBlocked(x, y + 1);
      if (ok(nx, h.y)) h.x = nx;
      if (ok(h.x, ny)) h.y = ny;
      const ang = Math.atan2(my, mx);                       // 0 = east
      this.dir = (Math.round(((Math.PI / 2 - ang) / (Math.PI / 4))) % 8 + 8) % 8;   // 0 = south
      const key = `${this.F.key}_w_${DIRS[this.dir]}`;
      if (h.anims.currentAnim?.key !== key || !h.anims.isPlaying) { h.setTexture(`td_${this.F.key}_walk`).setOrigin(0.5, this.F.walkFoot / 68); h.play(key, true); }
    } else if (h.anims.isPlaying && !this.attacking && !this.dead) {
      h.stop(); h.setTexture(`td_${this.F.key}_idle`, this.dir).setOrigin(0.5, this.F.idleFoot / 48);
    }
    h.setDepth(h.y);
    if (!this.dead) this.shadow.setPosition(h.x, h.y - 1);
    for (const [i, l] of this.lamps.entries()) l.setAlpha(0.75 + Math.sin(time / 180 + i * 1.7) * 0.12);
    // joystick (screen space)
    const g = this.joyG; g.clear();
    const bx2 = this.scale.width - R * 1.3, by2 = this.scale.height - R * 1.3;
    g.fillStyle(0x0b0f0c, 0.35).fillCircle(bx2, by2, R * 0.75).lineStyle(3, 0xe8e0c8, this.attacking ? 0.9 : 0.5).strokeCircle(bx2, by2, R * 0.75);
    g.lineStyle(4, 0xe8e0c8, 0.8).lineBetween(bx2 - R * 0.3, by2 + R * 0.3, bx2 + R * 0.3, by2 - R * 0.3).lineBetween(bx2 - R * 0.36, by2 + R * 0.12, bx2 - R * 0.12, by2 + R * 0.36);
    if (this.joy.id >= 0) {
      const bx = this.joy.x, by = this.joy.y;
      const l = Math.min(R, Math.hypot(this.joy.dx, this.joy.dy)), a = Math.atan2(this.joy.dy, this.joy.dx);
      g.lineStyle(3, 0xe8e0c8, 0.5).strokeCircle(bx, by, R);
      g.fillStyle(0xe8e0c8, 0.55).fillCircle(bx + Math.cos(a) * l, by + Math.sin(a) * l, R * 0.42);
    }
  }
}
