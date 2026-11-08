// Prototype of the new art direction: top-down 3/4 pixel art, muted dark-forest tone.
// Ground is painted per pixel from distance fields (grass, dirt road, cobble plaza, river, pond); props are code-drawn
// placeholders until the PixelLab/ChatGPT art arrives. The hero is the PixelLab villager (8 directions).
// Open with ?td in the URL.
import Phaser from 'phaser';
import heroIdle from '../assets/td/hero_idle.webp';
import heroWalk from '../assets/td/hero_walking.webp';
import heroAttack from '../assets/td/hero_attack.webp';
import objMeta from '../assets/td/obj/objs.json';
const OBJ_FILES = import.meta.glob('../assets/td/obj/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const OM = objMeta as Record<string, { w: number; h: number; foot: number; x0: number; x1: number; top: number }>;
import tl1Wang from '../assets/td/tl1_wang.png';
import tl2Wang from '../assets/td/tl2_wang.png';
import tl3Wang from '../assets/td/tl3_wang.png';
import hr3Idle from '../assets/td/hr3_idle.webp';
import hr3Walk from '../assets/td/hr3_walking.webp';
import hr3Attack from '../assets/td/hr3_attack.webp';
import hr4Idle from '../assets/td/hr4_idle.webp';
import hr4Walk from '../assets/td/hr4_walking.webp';
import hr4Attack from '../assets/td/hr4_attack.webp';
import hr9Idle from '../assets/td/hr9_idle.webp';
import hr9Walk from '../assets/td/hr9_walking.webp';
import hr9Attack from '../assets/td/hr9_attack.webp';

// hero forms from PixelLab: idle sheet (8 dirs, 48px), walk sheet (8 rows x 8 frames, 68px), optional attack (8 rows x 9)
const FORMS: { key: string; name: string; idle: string; walk: string; attack?: string; idleFoot: number; walkFoot: number; fs?: number }[] = [
  { key: 'hero', name: 'ชาวบ้าน', idle: heroIdle, walk: heroWalk, attack: heroAttack, idleFoot: 46, walkFoot: 56 },
  { key: 'hr3', name: 'ลอร์ดอัศวิน', idle: hr3Idle, walk: hr3Walk, attack: hr3Attack, idleFoot: 44, walkFoot: 54 },
  { key: 'hr4', name: 'นักธนู', idle: hr4Idle, walk: hr4Walk, attack: hr4Attack, idleFoot: 46, walkFoot: 54, fs: 64 },
  { key: 'hr9', name: 'อาร์คเมจทมิฬ', idle: hr9Idle, walk: hr9Walk, attack: hr9Attack, idleFoot: 44, walkFoot: 51, fs: 56 },
];

const MW = 1280, MH = 800;           // map size in game px (1 texel = 1 px)
const CELL = 4;                       // collision grid
const DIRS = ['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west'];

type RGB = [number, number, number];
const PAL = {
  grass: [[31, 53, 23], [34, 57, 25], [37, 58, 26], [41, 62, 28]] as RGB[],   // matched to the PixelLab TL1 tileset
  weed: [[92, 116, 80], [104, 126, 84]] as RGB[],
  dirt: [[67, 50, 35], [69, 54, 35], [69, 55, 36]] as RGB[],
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
  reserved = new Set<string>();
  surf: string[] = [];

  /** Living water: drifting ripple glints that follow the current, plus foam flickering along the banks. */
  animateWater() {
    const S = this.surf;
    const mk = (key: string, rows: string[], cols: Record<string, string>) => {
      if (this.textures.exists(key)) return;
      const cv = document.createElement('canvas'); cv.width = rows[0].length; cv.height = rows.length; const ctx = cv.getContext('2d')!;
      rows.forEach((r, y) => [...r].forEach((c, x) => { if (cols[c]) { ctx.fillStyle = cols[c]; ctx.fillRect(x, y, 1, 1); } }));
      this.textures.addCanvas(key, cv);
    };
    const C = { a: '#7fc6c4', b: '#4f9a9c', w: '#d6f2ee' };
    mk('td_rip0', ['.aaa.', 'b...b'], C);
    mk('td_rip1', ['.aaaaa.', 'b.....b'], C);
    mk('td_rip2', ['aa'], C);
    mk('td_foam', ['.w.', 'www', '.w.'], C);
    const water: number[] = [], edge: number[] = [];
    const isW = (x: number, y: number) => x >= 0 && y >= 0 && x < MW && y < MH && S[y * MW + x] === 'water';
    for (let y = 2; y < MH - 2; y += 3) for (let x = 2; x < MW - 2; x += 3) {
      if (!isW(x, y)) continue;
      const nearEdge = !isW(x - 4, y) || !isW(x + 4, y) || !isW(x, y - 4) || !isW(x, y + 4);
      (nearEdge ? edge : water).push(x, y);
      if (!nearEdge && !isW(x - 8, y) || !isW(x + 8, y)) { /* keep ripples off the banks */ }
    }
    if (!water.length) return;
    const flow = (x: number, y: number) => {   // river runs south, pond is still
      const inRiver = Math.abs(x - riverX(y)) < 40;
      if (!inRiver) return { dx: 0, dy: 0 };
      const dy = 1, dx = (riverX(y + 1) - riverX(y));
      return { dx: dx * 14, dy: dy * 14 };
    };
    const spawnRipple = (img: Phaser.GameObjects.Image, delay: number) => {
      const i = Math.floor(Math.random() * (water.length / 2)) * 2;
      const x = water[i], y = water[i + 1], f = flow(x, y);
      img.setPosition(x, y).setAlpha(0).setTexture('td_rip' + Math.floor(Math.random() * 3));
      const dur = 1400 + Math.random() * 1600;
      this.tweens.add({ targets: img, x: x + f.dx + (Math.random() - 0.5) * 3, y: y + f.dy, duration: dur, delay, ease: 'Linear' });
      this.tweens.add({ targets: img, alpha: { from: 0, to: 0.85 }, duration: dur / 2, delay, yoyo: true, ease: 'Sine.easeInOut', onComplete: () => spawnRipple(img, Math.random() * 400) });
    };
    const n = Math.min(260, Math.floor(water.length / 2 / 14));
    for (let k = 0; k < n; k++) spawnRipple(this.add.image(0, 0, 'td_rip0').setDepth(2).setOrigin(0.5), Math.random() * 3000);
    const spawnFoam = (img: Phaser.GameObjects.Image, delay: number) => {
      const i = Math.floor(Math.random() * (edge.length / 2)) * 2;
      img.setPosition(edge[i], edge[i + 1]).setAlpha(0).setScale(0.6 + Math.random() * 0.6);
      this.tweens.add({ targets: img, alpha: { from: 0, to: 0.7 }, scale: img.scale * 1.4, duration: 600 + Math.random() * 700, delay, yoyo: true, ease: 'Sine.easeInOut', onComplete: () => spawnFoam(img, Math.random() * 600) });
    };
    if (edge.length) for (let k = 0; k < Math.min(120, edge.length / 2 / 6); k++) spawnFoam(this.add.image(0, 0, 'td_foam').setDepth(2), Math.random() * 2500);
  }
  vignette!: Phaser.GameObjects.Image;
  label!: Phaser.GameObjects.Text;

  constructor() { super('TopDown'); }

  preload() {
    for (const [p, u] of Object.entries(OBJ_FILES)) this.load.image('o_' + p.split('/').pop()!.replace('.png', ''), u);
    this.load.image('td_tl1', tl1Wang); this.load.image('td_tl2', tl2Wang); this.load.image('td_tl3', tl3Wang);
    for (const f of FORMS) {
      this.load.spritesheet(`td_${f.key}_idle`, f.idle, { frameWidth: 48, frameHeight: 48 });
      const fs = f.fs ?? 68;
      this.load.spritesheet(`td_${f.key}_walk`, f.walk, { frameWidth: fs, frameHeight: fs });
      if (f.attack) this.load.spritesheet(`td_${f.key}_attack`, f.attack, { frameWidth: fs, frameHeight: fs });
    }
  }

  create() {
    this.blocked = new Uint8Array((MW / CELL) * (MH / CELL));
    this.paintGround();
    this.animateWater();
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
    const zoom = () => cam.setZoom(Math.max(2, Math.floor(this.scale.height / 340)));
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
  /** Ground = PixelLab Wang tiles only. Terrain is decided per 32px vertex, so every tile edge matches its neighbour;
   *  the per-pixel surface map (collision, prop placement, water fx) is derived from the same vertices. */
  paintGround() {
    const T = 32, VW = MW / T + 1, VH = MH / T + 1, NX = MW / T, NY = MH / T;
    type Ter = 'g' | 'd' | 'c' | 'w';
    const V: Ter[] = new Array(VW * VH);
    const vAt = (i: number, j: number): Ter => V[Math.max(0, Math.min(VH - 1, j)) * VW + Math.max(0, Math.min(VW - 1, i))];
    for (let j = 0; j < VH; j++) for (let i = 0; i < VW; i++) {
      const x = i * T, y = j * T;
      let t: Ter = 'g';
      if (Math.abs(x - riverX(y)) < 30 || Math.hypot(x - POND.x, (y - POND.y) * 1.3) < POND.r) t = 'w';
      else if (Math.hypot(x - PLAZA.x, (y - PLAZA.y) * 1.1) < PLAZA.r) t = 'c';
      else if (Math.abs(y - roadY(x)) < 22 || (Math.abs(x - PLAZA.x) < 22 && y < PLAZA.y) || (Math.abs(x - (PLAZA.x - 40 + (y - PLAZA.y) * 0.35)) < 22 && y > PLAZA.y)) t = 'd';
      V[j * VW + i] = t;
    }
    // roads touching the plaza become paved; roads never touch water (the bridge spans the gap)
    const V2 = V.slice();
    for (let j = 0; j < VH; j++) for (let i = 0; i < VW; i++) {
      if (V[j * VW + i] !== 'd') continue;
      let c = false, w = false;
      for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) { const n = vAt(i + a, j + b); if (n === 'c') c = true; if (n === 'w') w = true; }
      if (w) V2[j * VW + i] = 'g'; else if (c) V2[j * VW + i] = 'c';
    }
    V.splice(0, V.length, ...V2);

    const cv = document.createElement('canvas'); cv.width = MW; cv.height = MH;
    const ctx = cv.getContext('2d')!;
    const LAYOUT = [['LLLU', 'LLUU', 'LLUL', 'UUUL', 'UULU'], ['LULU', 'UUUU', 'ULUL', 'ULUU', 'LUUU'], ['LULL', 'UULL', 'ULLL', 'ULLU', 'LUUL'], ['UUUU', 'LLLL']];
    const at: Record<string, [number, number]> = {};
    LAYOUT.forEach((row, ty) => row.forEach((k, tx) => { if (!at[k]) at[k] = [tx, ty]; }));
    const src = (k: string) => this.textures.get(k).getSourceImage() as HTMLImageElement;
    const draw = (img: HTMLImageElement, key: string, cx: number, cy: number) => {
      const t = at[key]; if (!t) return;
      if (key === 'UUUU' || key === 'LLLL') {
        const r = Math.floor(hash(cx * 7 + 3, cy * 13 + 1) * 8);
        ctx.save(); ctx.translate(cx * T + T / 2, cy * T + T / 2); ctx.rotate((r & 3) * Math.PI / 2); if (r & 4) ctx.scale(-1, 1);
        ctx.drawImage(img, t[0] * T, t[1] * T, T, T, -T / 2, -T / 2, T, T); ctx.restore();
      } else ctx.drawImage(img, t[0] * T, t[1] * T, T, T, cx * T, cy * T, T, T);
    };
    const tl1 = src('td_tl1'), tl2 = src('td_tl2'), tl3 = src('td_tl3');
    for (let cy = 0; cy < NY; cy++) for (let cx = 0; cx < NX; cx++) {
      const c = [vAt(cx, cy), vAt(cx + 1, cy), vAt(cx, cy + 1), vAt(cx + 1, cy + 1)];
      const key = (f: (t: Ter) => boolean) => c.map(t => f(t) ? 'U' : 'L').join('');
      draw(tl1, 'LLLL', cx, cy);                                            // grass everywhere first
      if (c.includes('w')) draw(tl3, key(t => t === 'w'), cx, cy);
      else if (c.includes('c')) draw(tl2, key(t => t === 'c' || t === 'd'), cx, cy);
      else if (c.includes('d')) draw(tl1, key(t => t === 'd'), cx, cy);
    }
    // per-pixel surface from the same vertices (bilinear, threshold 0.5)
    const S: string[] = new Array(MW * MH);
    this.surf = S;
    const BR = { x0: riverX(roadY(930)) - 46, x1: riverX(roadY(930)) + 46, y0: roadY(930) - 15, y1: roadY(930) + 15 };
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      const cx = Math.min(NX - 1, Math.floor(x / T)), cy = Math.min(NY - 1, Math.floor(y / T));
      const fx = (x - cx * T + 0.5) / T, fy = (y - cy * T + 0.5) / T;
      const c = [vAt(cx, cy), vAt(cx + 1, cy), vAt(cx, cy + 1), vAt(cx + 1, cy + 1)];
      const wt = [(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy];
      const sum = (f: (t: Ter) => boolean) => c.reduce((a, t, i) => a + (f(t) ? wt[i] : 0), 0);
      let v = 'grass';
      if (x >= BR.x0 && x <= BR.x1 && y >= BR.y0 && y <= BR.y1) v = 'bridge';
      else if (sum(t => t === 'w') > 0.5) v = 'water';
      else if (c.includes('c') && sum(t => t === 'c' || t === 'd') > 0.5) v = 'cobble';
      else if (sum(t => t === 'd') > 0.5) v = 'dirt';
      S[y * MW + x] = v;
      if (v === 'water') this.block(x, y);
    }
    // wooden bridge over the river (drawn planks, walkable)
    for (let y = BR.y0; y <= BR.y1; y++) for (let x = Math.round(BR.x0); x <= BR.x1; x++) {
      const rail = y < BR.y0 + 3 || y > BR.y1 - 3, gap = (x - Math.round(BR.x0)) % 6 === 0;
      const col = rail ? [62, 44, 30] : gap ? [44, 31, 22] : pick(PAL.plank, hash(Math.floor((x - BR.x0) / 6), 7) * 0.6 + hash(x, y) * 0.4);
      ctx.fillStyle = `rgb(${col[0] * 0.8},${col[1] * 0.8},${col[2] * 0.8})`; ctx.fillRect(x, y, 1, 1);
    }
    ctx.fillStyle = 'rgba(8,14,12,0.45)'; ctx.fillRect(Math.round(BR.x0), BR.y1 + 1, Math.round(BR.x1 - BR.x0), 3);
    if (this.textures.exists('td_ground')) this.textures.remove('td_ground');
    this.textures.addCanvas('td_ground', cv);
    this.add.image(0, 0, 'td_ground').setOrigin(0).setDepth(0);
    for (let x = 0; x < MW; x += CELL) { this.block(x, 0); this.block(x, MH - 1); }
    for (let y = 0; y < MH; y += CELL) { this.block(0, y); this.block(MW - 1, y); }
  }
  surfAt(x: number, y: number) { x = Math.round(x); y = Math.round(y); return x < 0 || y < 0 || x >= MW || y >= MH ? 'edge' : this.surf[y * MW + x]; }

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

  /** Place a PixelLab object by its feet; blocks a footprint `fw` wide and `fd` deep above the feet. */
  obj(name: string, x: number, y: number, fw = 0.5, fd = 6, shadow = true) {
    const m = OM[name]; if (!m) return null;
    const im = this.add.image(Math.round(x), Math.round(y), 'o_' + name).setOrigin(0.5, m.foot / m.h).setDepth(y);
    const w = (m.x1 - m.x0) * fw;
    if (shadow) this.add.ellipse(x, y - 1, Math.max(8, (m.x1 - m.x0) * 0.7), Math.max(4, fd * 0.9), 0x0a1008, 0.4).setDepth(1);
    for (let j = -fd; j <= 1; j += 2) for (let i = -w / 2; i <= w / 2; i += 2) this.block(x + i, y + j);
    return im;
  }

  placeProps() {
    const occ = (x: number, y: number) => this.isBlocked(x, y);
    const free = (x: number, y: number, r: number) => {
      for (let j = -r; j <= r; j += 4) for (let i = -r; i <= r; i += 4) if (this.surfAt(x + i, y + j) !== 'grass' || occ(x + i, y + j)) return false;
      return true;
    };
    let seed = 1;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const pick = (k: string, n: number) => `${k}_${Math.floor(rnd() * n)}`;
    // village buildings (level art from PixelLab Objects)
    const B: [string, number, number][] = [
      ['townhall_1', 400, 318], ['house_1', 668, 318], ['house_0', 760, 300], ['forge_1', 712, 600], ['lumber_0', 190, 330],
      ['quarry_0', 130, 590], ['barn_1', 390, 610], ['house_2', 640, 690],
    ];
    for (const [n, x, y] of B) {
      const m = OM[n]; this.obj(n, x, y, 0.82, Math.round((m.foot - m.top) * 0.42));
      // keep the trees away from the building
      for (let j = -(m.foot - m.top); j <= 14; j += 4) for (let i = -(m.x1 - m.x0) * 0.55; i <= (m.x1 - m.x0) * 0.55; i += 4) if (!this.isBlocked(x + i, y + j)) this.reserved.add(Math.round((x + i) / 4) + ',' + Math.round((y + j) / 4));
    }
    const near = (x: number, y: number) => this.reserved.has(Math.round(x / 4) + ',' + Math.round(y / 4));
    // market stalls and village clutter around the plaza
    for (const [x, y] of [[600, 520], [652, 500], [436, 522]]) this.obj(pick('stall', 5), x, y, 0.8, 10);
    for (const [k, x, y] of [['well_0', 580, 330], ['cart_0', 286, 470], ['barrel_0', 742, 612], ['barrel_1', 752, 618], ['crate_0', 680, 612], ['logs_0', 236, 344], ['logs_3', 150, 350],
      ['hay_0', 430, 628], ['hay_1', 440, 636], ['ore_2', 92, 600], ['ore_4', 164, 604], ['sign_0', 860, 452], ['fire_0', 300, 560], ['stump_0', 222, 362]] as [string, number, number][]) this.obj(k, x, y, 0.7, 4);
    // forest edge and clusters
    for (let k = 0; k < 900; k++) {
      const x = 16 + rnd() * (MW - 32), y = 50 + rnd() * (MH - 60);
      const edge = Math.min(x, MW - x, y, MH - y);
      const dense = edge < 80 || fbm(x / 140, y / 140) > 0.62;
      if (!dense || !free(x, y, 18) || near(x, y)) continue;
      const r = rnd();
      this.obj(r < 0.45 ? pick('pine', 4) : r < 0.9 ? pick('oak', 3) : pick('dead', 6), x, y, 0.18, 3);
    }
    for (let k = 0; k < 170; k++) {
      const x = 20 + rnd() * (MW - 40), y = 30 + rnd() * (MH - 40);
      if (!free(x, y, 10) || near(x, y)) continue;
      const r = rnd();
      if (r < 0.5) this.add.image(Math.round(x), Math.round(y), 'o_' + pick('bush', 5)).setOrigin(0.5, 0.85).setDepth(y);
      else if (r < 0.85) this.obj(pick('rock', 8), x, y, 0.6, 4);
      else this.obj(pick('stump', 5), x, y, 0.5, 3);
    }
    // fences along the road, lamps around the plaza
    for (let x = 40; x < 860; x += 30) {
      const y = Math.round(roadY(x) + 40);
      if (Math.abs(x - PLAZA.x) < PLAZA.r + 40 || near(x, y) || this.isBlocked(x, y)) continue;
      if (this.surfAt(x, y) === 'grass') this.obj('fenceh_0', x, y, 1, 3, false);
    }
    for (let a = 0; a < 6; a++) {
      const x = Math.round(PLAZA.x + Math.cos(a * Math.PI / 3 + 0.5) * (PLAZA.r + 14)), y = Math.round(PLAZA.y + Math.sin(a * Math.PI / 3 + 0.5) * (PLAZA.r + 14));
      if (this.surfAt(x, y) !== 'grass') continue;
      this.obj('lamp_0', x, y, 0.2, 2);
      this.lamps.push(this.add.image(x + 6, y - 26, 'td_glow').setBlendMode(Phaser.BlendModes.ADD).setDepth(99990));
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
    h.setTexture(`td_${F.key}_attack`).setOrigin(0.5, F.walkFoot / (F.fs ?? 68)).play(`${F.key}_a_${DIRS[this.dir]}`);
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
      if (h.anims.currentAnim?.key !== key || !h.anims.isPlaying) { h.setTexture(`td_${this.F.key}_walk`).setOrigin(0.5, this.F.walkFoot / (this.F.fs ?? 68)); h.play(key, true); }
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
