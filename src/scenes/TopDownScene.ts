// Prototype of the new art direction: top-down 3/4 pixel art, muted dark-forest tone.
// Ground is painted per pixel from distance fields (grass, dirt road, cobble plaza, river, pond); props are code-drawn
// placeholders until the PixelLab/ChatGPT art arrives. The hero is the PixelLab villager (8 directions).
// Open with ?td in the URL.
import Phaser from 'phaser';
import { Combat } from '../world/tdCombat';
import { STAGES } from '../world/stages';
import { S } from '../core/events';
import { saveGame, loadGame, startNewGame } from '../core/save';
import { runtime } from '../core/events';
import { derive } from '../systems/stats';
import { Village, populateVillage } from '../world/npcs';
import { activeTier, nextForm, currentSkills } from '../systems/stats';
import { beginCast } from '../systems/skillCast';
import { uiOpt } from '../core/uiOptions';
import { stageFood, payStage, isHungry } from '../systems/supplies';
import { formName } from '../data/classes';
import { bus, EV } from '../core/events';
import { tick as settleTick, collect as settleCollect, buildingAt, underConstruction, ensureNpcVillage } from '../systems/settlement';
import { BUILDINGS, RES_NAMES, type BuildingId } from '../data/buildings';
import type { TdUIScene } from './TdUIScene';
import { CH, preloadChars, createCharAnims, setIdle, playAnim, hasAnim, formKeyOf } from '../world/chars';
import objMeta from '../assets/td/obj/objs.json';
const OBJ_FILES = import.meta.glob('../assets/td/obj/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const OM = objMeta as unknown as Record<string, { w: number; h: number; foot: number; x0: number; x1: number; top: number; chim?: [number, number] }>;
import tl1Wang from '../assets/td/tl1_wang.png';
import tl2Wang from '../assets/td/tl2_wang.png';
import tl3Wang from '../assets/td/tl3_wang.png';
import ft2Wang from '../assets/td/ft2_wang.png';
import tl5Wang from '../assets/td/tl5_wang.png';
import tl6Wang from '../assets/td/tl6_wang.png';
import tl7Wang from '../assets/td/tl7_wang.png';
import tl8Wang from '../assets/td/tl8_wang.png';
import ft3Wang from '../assets/td/ft3_wang.png';

// hero forms (PixelLab characters listed in chars.json)
const LANDS_LABEL = ['ป่า', 'ผีสิง', 'ลาวา', 'หิมะ', 'คุก'];
/** Village plots (index = save plot number). 0-8 are the NPCs' buildings, standing from the start; 9 is the player's home. */
const PLOTS: { x: number; y: number }[] = [
  { x: 722, y: 650 }, { x: 300, y: 660 }, { x: 150, y: 330 }, { x: 702, y: 322 }, { x: 1100, y: 600 }, { x: 120, y: 650 },
  { x: 440, y: 880 }, { x: 790, y: 880 }, { x: 1000, y: 800 },
  { x: 1150, y: 935 },
];
const PLOT_OF: Record<string, number> = { forge: 0, barn: 1, lumber: 2, tavern: 3, kitchen: 4, market: 5, warehouse: 6, quarry: 7, tower: 8 };
export const HOME_PLOT = 9;
/** building art level: 3 art stages over 5 building levels */
const artLv = (lv: number) => lv >= 5 ? 2 : lv >= 3 ? 1 : 0;

const MW = 1280;                      // map size in game px (1 texel = 1 px)
let MH = 800;                         // village is taller (south district), stages 800
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
const POND = { x: 200, y: 840, r: 56 };
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
  const south = Math.abs(x - (PLAZA.x - 40 + (y - PLAZA.y) * 0.35)) < 13 + n && y > PLAZA.y && y < MH - 40;
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
    this.load.image('td_tl1', tl1Wang); this.load.image('td_tl2', tl2Wang); this.load.image('td_tl3', tl3Wang); this.load.image('td_ft2', ft2Wang); this.load.image('td_ft3', ft3Wang); this.load.image('td_tl5', tl5Wang); this.load.image('td_tl6', tl6Wang); this.load.image('td_tl7', tl7Wang); this.load.image('td_tl8', tl8Wang);
    // only the characters this scene shows: hero forms always; villagers + animals in the village;
    // the land's monsters, its boss (boss stages) and the wild game in a stage
    const heroes = ['hero', ...Array.from({ length: 12 }, (_, i) => 'hr' + (i + 1))];
    const st = this.stageN ? STAGES[this.stageN - 1] : null;
    const keys = st ? [...heroes, ...st.land.mobs.map(m => m.key), ...(st.boss ? [st.land.boss.key] : []), 'mo16', 'mo17']
      : [...heroes, ...Array.from({ length: 10 }, (_, i) => 'np' + (i + 1)), ...Array.from({ length: 5 }, (_, i) => 'an' + (i + 1))];
    preloadChars(this, keys);
  }

  stageN = 0;
  hudT = 0;
  regenT = 0;
  combat!: Combat;
  village?: Village;
  portals: { x: number; y: number; to: number | 'select'; label: Phaser.GameObjects.Text }[] = [];
  init(data: { stage?: number }) { this.stageN = data?.stage ?? 0; MH = this.stageN ? 800 : 1024; }

  create() {
    if (!runtime.state) runtime.state = loadGame() ?? startNewGame();
    (window as unknown as { __tdS: typeof S }).__tdS = S;
    this.lamps = []; this.fires = []; this.reserved = new Set(); this.dead = false; this.attacking = false; this.portals = []; this.skillReady = {};
    this.combat = new Combat(this as never);
    this.blocked = new Uint8Array((MW / CELL) * (MH / CELL));
    this.paintGround();
    this.animateWater();
    this.makePropTextures();
    createCharAnims(this);
    this.shadow = this.add.ellipse(PLAZA.x, PLAZA.y + 40, 18, 7, 0x10180f, 0.45).setDepth(1);
    this.hero = this.add.sprite(PLAZA.x, PLAZA.y + 40, 'c_hero_idle', 0); setIdle(this.hero, this.F.key, 0);
    { const s0 = S(), d0 = derive(s0); if (s0.hp <= 0) s0.hp = d0.maxHp; }
    this.placeProps();
    this.village = this.stageN ? undefined : new Village(this, MW, MH);
    if (this.village) populateVillage(this.village, roadY);
    this.plotViews = []; this.heroKeyNow = this.F.key;
    if (!this.stageN) { ensureNpcVillage(S(), PLOT_OF, HOME_PLOT); this.renderPlots(); }
    if (!this.scene.isActive('TdUI')) this.scene.launch('TdUI'); else this.scene.get('TdUI').scene.restart();
    this.scene.bringToTop('TdUI');
    if (!this.stageN) this.addPortal(PLAZA.x + 6, 26, 'select', 'ประตูด่าน ▲');

    const cam = this.cameras.main;
    cam.setBounds(0, 0, MW, MH).setBackgroundColor('#1b2420').startFollow(this.hero, true, 0.18, 0.18).setRoundPixels(true);
    const zoom = () => cam.setZoom(Math.max(1.5, Math.round(this.scale.height / 480 * 2) / 2));
    zoom(); this.scale.on('resize', zoom);

    this.addOverlay();
    // UI lives on its own unzoomed camera
    const ui = [this.vignette, this.label, this.joyG = this.add.graphics(), this.arrowG = this.add.graphics().setDepth(100003),
      this.arrowT = this.add.text(0, 0, '', { fontFamily: 'sans-serif', fontSize: Math.round(this.scale.height / 34) + 'px', color: '#fff4c8', stroke: '#0b0f0c', strokeThickness: 4 }).setOrigin(0.5).setDepth(100003)];
    const uiCam = this.cameras.add(0, 0, this.scale.width, this.scale.height);
    uiCam.ignore(this.children.list.filter(o => !ui.includes(o as never)));
    this.uiCam = uiCam;
    this.events.once('shutdown', () => this.events.off('addedtoscene'));
    this.events.on('addedtoscene', (o: Phaser.GameObjects.GameObject) => { if (!this.makingUi) uiCam.ignore(o); });
    cam.ignore(ui);
    this.scale.on('resize', () => uiCam.setSize(this.scale.width, this.scale.height));
    if (this.input.keyboard) { this.keys = this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT') as Record<string, Phaser.Input.Keyboard.Key>; this.input.keyboard.on('keydown-SPACE', () => this.attack()); ['ONE', 'TWO', 'THREE'].forEach((k, i) => this.input.keyboard!.on('keydown-' + k, () => this.castSkill(i))); }
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => { if (this.ui?.blocks(p) || this.selectUi) return; if (p.x > this.scale.width * 0.55) { this.attack(); return; } if (this.joy.id < 0) { this.joy.id = p.id; this.joy.x = p.x; this.joy.y = p.y; this.joy.dx = this.joy.dy = 0; } });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => { if (p.id === this.joy.id) { this.joy.dx = p.x - this.joy.x; this.joy.dy = p.y - this.joy.y; } });
    const up = (p: Phaser.Input.Pointer) => { if (p.id === this.joy.id) { this.joy.id = -1; this.joy.dx = this.joy.dy = 0; } };
    this.input.on('pointerup', up); this.input.on('pointerupoutside', up);
  }

  // ---------- ground ----------
  /** Ground = PixelLab Wang tiles only. Terrain is decided per 32px vertex, so every tile edge matches its neighbour;
   *  the per-pixel surface map (collision, prop placement, water fx) is derived from the same vertices. */
  paintGround() {
    // 16px PixelLab tilesets (FT2 plaza stone, FT3 river bank); roads are paved until a good flat dirt set (FT1) arrives
    const T = 16, VW = MW / T + 1, VH = MH / T + 1, NX = MW / T, NY = MH / T;
    type Ter = 'g' | 'd' | 'c' | 'w';
    const V: Ter[] = new Array(VW * VH);
    const vAt = (i: number, j: number): Ter => V[Math.max(0, Math.min(VH - 1, j)) * VW + Math.max(0, Math.min(VW - 1, i))];
    for (let j = 0; j < VH; j++) for (let i = 0; i < VW; i++) {
      const x = i * T, y = j * T;
      let t: Ter = 'g';
      if (this.stageN) {   // wild stage: one winding trail from the west gate to the east gate, clearings along it, a pond
        const py = MH / 2 + Math.sin(x / 170 + this.stageN) * 120 + Math.sin(x / 61) * 22;
        const clear = [0.2, 0.42, 0.64, 0.86].some(f => Math.hypot(x - MW * f, (y - (MH / 2 + Math.sin(MW * f / 170 + this.stageN) * 120)) * 1.2) < 70);
        const g0 = STAGES[this.stageN - 1].land.ground;
        const off = Math.abs(y - py);
        if (Math.hypot(x - MW * 0.53, y - (this.stageN % 2 ? 150 : MH - 150)) < 48) t = 'w';
        else if (g0 === 'lava' && off > 70 && Math.abs(Math.sin(x / 95 + y / 140 + this.stageN) * 60 + (y - py) * 0.5 - 90) < 16) t = 'w';     // lava rivers beside the trail
        else if (g0 === 'dung' && off > 60 && (Math.abs(((x + this.stageN * 37) % 260) - 130) < 14 || Math.abs((y % 220) - 110) < 12)) t = 'w'; // sewer channels
        else if (Math.abs(y - py) < 20) t = 'd';
        else if (clear && this.stageN % 10 === 0 && x > MW * 0.75) t = 'c';
        V[j * VW + i] = t; continue;
      }
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
    const tl1 = src('td_ft3'), tl2 = src('td_ft2'), tl3 = src('td_ft3');
    const land = this.stageN ? STAGES[this.stageN - 1].land.ground : 'forest';
    // other lands: 32px PixelLab sets — haunt TL5 (forest floor / leaf trail), snow TL6 (snow / ice path), lava TL7 (basalt / lava pools), dungeon TL8 (flagstones / water channel)
    const LAND: Record<string, { k: string; up: Ter[] } | undefined> = { haunt: { k: 'td_tl5', up: ['d', 'c'] }, snow: { k: 'td_tl6', up: ['g', 'w'] }, lava: { k: 'td_tl7', up: ['w'] }, dung: { k: 'td_tl8', up: ['g', 'd', 'c'] } };
    const LS = LAND[land];
    if (LS) {
      const img = src(LS.k), T2 = 32;
      const drawT = (key: string, cx: number, cy: number) => {
        const t = at[key]; if (!t) return;
        if (key === 'UUUU' || key === 'LLLL') {
          const r = Math.floor(hash(cx * 7 + 3, cy * 13 + 1) * 8);
          ctx.save(); ctx.translate(cx * T2 + T2 / 2, cy * T2 + T2 / 2); ctx.rotate((r & 3) * Math.PI / 2); if (r & 4) ctx.scale(-1, 1);
          ctx.drawImage(img, t[0] * T2, t[1] * T2, T2, T2, -T2 / 2, -T2 / 2, T2, T2); ctx.restore();
        } else ctx.drawImage(img, t[0] * T2, t[1] * T2, T2, T2, cx * T2, cy * T2, T2, T2);
      };
      for (let cy = 0; cy < MH / T2; cy++) for (let cx = 0; cx < MW / T2; cx++) {
        const c = [vAt(cx * 2, cy * 2), vAt(cx * 2 + 2, cy * 2), vAt(cx * 2, cy * 2 + 2), vAt(cx * 2 + 2, cy * 2 + 2)];
        drawT(c.map(t => LS.up.includes(t) ? 'U' : 'L').join(''), cx, cy);
      }
      // collision/surface on the same 32px vertices
      for (let j = 0; j < VH; j++) for (let i = 0; i < VW; i++) if (i % 2 || j % 2) {
        const a = vAt(i - (i % 2), j - (j % 2)), b = vAt(i + (i % 2), j + (j % 2)); V[j * VW + i] = a === b ? a : a;
      }
    }
    for (let cy = 0; cy < NY && !LS; cy++) for (let cx = 0; cx < NX; cx++) {
      const c = [vAt(cx, cy), vAt(cx + 1, cy), vAt(cx, cy + 1), vAt(cx + 1, cy + 1)];
      const key = (f: (t: Ter) => boolean) => c.map(t => f(t) ? 'U' : 'L').join('');
      draw(tl2, 'LLLL', cx, cy);                                            // grass everywhere first
      if (c.includes('w')) draw(tl3, key(t => t === 'w'), cx, cy);
      else if (c.includes('c') || c.includes('d')) draw(tl2, key(t => t === 'c' || t === 'd'), cx, cy);
      else if (c.includes('d')) draw(tl2, key(t => t === 'd'), cx, cy);
    }
    // per-pixel surface from the same vertices (bilinear, threshold 0.5)
    const S: string[] = new Array(MW * MH);
    this.surf = S;
    const BR = this.stageN ? { x0: -99, x1: -99, y0: -99, y1: -99 } : { x0: riverX(roadY(930)) - 46, x1: riverX(roadY(930)) + 46, y0: roadY(930) - 15, y1: roadY(930) + 15 };
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      const cx = Math.min(NX - 1, Math.floor(x / T)), cy = Math.min(NY - 1, Math.floor(y / T));
      const fx = (x - cx * T + 0.5) / T, fy = (y - cy * T + 0.5) / T;
      const c = [vAt(cx, cy), vAt(cx + 1, cy), vAt(cx, cy + 1), vAt(cx + 1, cy + 1)];
      const wt = [(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy];
      const sum = (f: (t: Ter) => boolean) => c.reduce((a, t, i) => a + (f(t) ? wt[i] : 0), 0);
      let v = 'grass';
      if (x >= BR.x0 && x <= BR.x1 && y >= BR.y0 && y <= BR.y1) v = 'bridge';
      else if (sum(t => t === 'w') > 0.5) v = 'water';
      else if (sum(t => t === 'c' || t === 'd') > 0.5) v = 'cobble';
      if (LS && (land === 'haunt' || land === 'snow') && v === 'water') v = 'grass';
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
  campfire(x: number, y: number) {
    this.obj('fire_0', x, y, 0.6, 4, false);
    const g = this.add.image(x, y - 6, 'td_glow').setTint(0xff9a3c).setBlendMode(Phaser.BlendModes.ADD).setDepth(99990).setScale(1.6);
    const core = this.add.image(x, y - 5, 'td_glow').setTint(0xffd27a).setBlendMode(Phaser.BlendModes.ADD).setDepth(99991).setScale(0.55);
    this.fires.push({ g, core, x, y });
    if (!this.textures.exists('td_ember')) { const c = document.createElement('canvas'); c.width = 2; c.height = 2; const k = c.getContext('2d')!; k.fillStyle = '#ffcf6a'; k.fillRect(0, 0, 2, 2); this.textures.addCanvas('td_ember', c); }
    this.add.particles(x, y - 8, 'td_ember', { lifespan: { min: 700, max: 1300 }, speedY: { min: -26, max: -12 }, speedX: { min: -6, max: 6 }, scale: { start: 1, end: 0 },
      alpha: { start: 1, end: 0 }, tint: [0xffe08a, 0xff9a3c, 0xff6a2a], frequency: 140, blendMode: 'ADD' }).setDepth(99992);
  }
  fires: { g: Phaser.GameObjects.Image; core: Phaser.GameObjects.Image; x: number; y: number }[] = [];
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

  /** Wild stage: dense forest off the trail, rocks and decals, monsters in the clearings, gates at both ends. */
  placeStage(rnd: () => number, pick: (k: string, n: number) => string, free: (x: number, y: number, r: number) => boolean) {
    const st = STAGES[this.stageN - 1];
    const tint: Record<string, number> = { forest: 0xffffff, haunt: 0xb8a8d8, lava: 0x8a5a50, snow: 0xe8f4ff, dung: 0x9aa8b8 };

    const tY = (x: number) => MH / 2 + Math.sin(x / 170 + this.stageN) * 120 + Math.sin(x / 61) * 22;
    const g = st.land.ground;
    const trees = g === 'haunt' || g === 'lava' ? ['dead', 2] as const : g === 'snow' ? ['pine', 3] as const : null;
    for (let k = 0; k < (g === 'dung' ? 0 : g === 'lava' ? 160 : 520); k++) {
      const x = 10 + rnd() * (MW - 20), y = 60 + rnd() * (MH - 60);
      const r = rnd(), key = trees ? pick(trees[0], trees[1]) : r < 0.45 ? pick('pine', 3) : r < 0.88 ? pick('oak', 3) : pick('dead', 2);
      const below = y - tY(x), hgt = (OM[key]?.foot ?? 120) - (OM[key]?.top ?? 0);
      if ((below > 0 && below < hgt + 30) || (below <= 0 && -below < 70) || !free(x, y, 48)) continue;   // never hide the trail, roots stay off it   // never hide the trail
      const t = this.obj(key, x, y, 0.16, 4, true);
      if (t && g !== 'forest') t.setTint(tint[g]);
    }
    if (g === 'dung' || g === 'lava') for (let k = 0; k < 260; k++) {   // boulders and ore instead of a forest
      const x = 10 + rnd() * (MW - 20), y = 40 + rnd() * (MH - 50);
      if (Math.abs(y - (MH / 2 + Math.sin(x / 170 + this.stageN) * 120 + Math.sin(x / 61) * 22)) < 50 || !free(x, y, 12)) continue;
      const o = this.obj(rnd() < 0.7 ? pick('rock', 8) : pick('ore', 7), x, y, 0.6, 4); o?.setTint(g === 'lava' ? 0xd09080 : 0x9aa8b8);
    }
    for (let k = 0; k < 220; k++) {
      const x = 20 + rnd() * (MW - 40), y = 30 + rnd() * (MH - 40);
      if (!free(x, y, 8)) continue;
      const r = rnd(); this.add.image(Math.round(x), Math.round(y), 'o_' + (r < 0.5 ? pick('rock', 8) : r < 0.75 ? pick('tuft', 2) : pick('pebble', 6))).setOrigin(0.5, 0.85).setDepth(y);
    }
    const trailY = (x: number) => MH / 2 + Math.sin(x / 170 + this.stageN) * 120 + Math.sin(x / 61) * 22;
    this.addPortal(24, trailY(24), 0, 'กลับหมู่บ้าน');
    this.hero.setPosition(46, trailY(46));
    const spots: [number, number][] = [0.22, 0.42, 0.62, 0.84].map(f => [MW * f, MH / 2 + Math.sin(MW * f / 170 + this.stageN) * 120]);
    this.combat.spawnStage(this.stageN, spots);
    this.events.once('stageCleared', (n: number) => {
      const nx = MW - 30;
      if (n < 50) this.addPortal(nx, trailY(nx), n + 1, `ด่าน ${n + 1} ▶`); else this.addPortal(nx, trailY(nx), 0, 'จบเกม! กลับหมู่บ้าน');
      this.combat.float(this.hero.x, this.hero.y - 60, `ผ่านด่าน ${n}!`, '#ffd24a', 16);
    });
  }

  addPortal(x: number, y: number, to: number | 'select', text: string) {
    const g = this.add.image(x, y - 10, 'td_glow').setTint(to === 0 ? 0x9affc8 : 0x9ad8ff).setBlendMode(Phaser.BlendModes.ADD).setDepth(99985).setScale(1.2);
    this.tweens.add({ targets: g, alpha: { from: 0.5, to: 1 }, scale: { from: 1.0, to: 1.35 }, duration: 900, yoyo: true, repeat: -1 });
    const ring = this.add.ellipse(x, y, 30, 12).setStrokeStyle(2, 0xbfeaff, 0.9).setDepth(2);
    this.tweens.add({ targets: ring, scaleX: 1.25, scaleY: 1.25, alpha: 0.4, duration: 900, yoyo: true, repeat: -1 });
    const label = this.add.text(x, y - 34, text, { fontFamily: 'sans-serif', fontSize: '8px', color: '#e8f8ff', stroke: '#06121a', strokeThickness: 3, resolution: 6 }).setOrigin(0.5).setDepth(99999);
    this.portals.push({ x, y, to, label });
  }

  /** going out costs supplies (food); stages 1-2 are free */
  enterStage(n: number) {
    const s = S();
    if (!payStage(s, n)) { bus.emit(EV.TOAST, `อาหารไม่พอ! ด่าน ${n} ต้องใช้เสบียง 🍖${stageFood(n)} — ล่าสัตว์ป่าหรือเก็บจากคอกสัตว์`, '#ff8a6a'); return; }
    if (stageFood(n)) bus.emit(EV.TOAST, `ใช้เสบียง 🍖${stageFood(n)}`, '#ffd8a0');
    saveGame(s);
    this.portalCool = this.time.now + 99999; this.cameras.main.fadeOut(300); this.time.delayedCall(320, () => this.scene.restart({ stage: n }));
  }
  hungryWarned = false;

  stageSelect() {
    if (this.selectUi) return;
    this.makingUi = true;
    const s = S() as unknown as { tdCleared?: number }, top = Math.min(50, (s.tdCleared ?? 0) + 1);
    const W = this.scale.width, H = this.scale.height, fs = Math.round(H / 26);
    const ui: Phaser.GameObjects.GameObject[] = [];
    ui.push(this.add.rectangle(0, 0, W, H, 0x05080a, 0.82).setOrigin(0).setInteractive());
    ui.push(this.add.text(W / 2, fs * 1.2, 'เลือกด่าน (ผ่านแล้ว ' + (s.tdCleared ?? 0) + '/50)', { fontFamily: 'sans-serif', fontSize: fs * 1.2 + 'px', color: '#ffe0a0', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5));
    const cols = 10, bw = W * 0.085, bh = H * 0.13;
    STAGES.forEach((st, i) => {
      const x = W / 2 + ((i % cols) - (cols - 1) / 2) * (bw + 6), y = H * 0.2 + Math.floor(i / cols) * (bh + 8) + bh / 2;
      const open = st.n <= top;
      const r = this.add.rectangle(x, y, bw, bh, open ? (st.boss ? 0x5a2a1a : 0x1e3a2c) : 0x222222, 0.95).setStrokeStyle(2, open ? (st.boss ? 0xffa060 : 0x9ad8a0) : 0x444444);
      const fc = stageFood(st.n);
      const t = this.add.text(x, y, `${st.n}${st.boss ? ' 👑' : ''}\nLv${st.level}${fc ? `\n🍖${fc}` : ''}`, { fontFamily: 'sans-serif', fontSize: fs * 0.75 + 'px', color: open ? '#ffffff' : '#666666', align: 'center' }).setOrigin(0.5);
      if (open) r.setInteractive().on('pointerdown', () => this.enterStage(st.n));
      ui.push(r, t);
    });
    LANDS_LABEL.forEach((n, i) => ui.push(this.add.text(W * 0.02, H * 0.2 + i * (bh + 8) + bh / 2, n, { fontFamily: 'sans-serif', fontSize: fs * 0.7 + 'px', color: '#c8b88a' }).setOrigin(0, 0.5)));
    const close = this.add.text(W - fs, fs, '✕', { fontFamily: 'sans-serif', fontSize: fs * 1.6 + 'px', color: '#ffffff' }).setOrigin(1, 0).setInteractive().on('pointerdown', () => { ui.forEach(o => o.destroy()); this.selectUi = null; this.portalCool = this.time.now + 1500; });
    ui.push(close);
    this.cameras.main.ignore(ui); this.makingUi = false;
    this.selectUi = ui;
  }
  selectUi: Phaser.GameObjects.GameObject[] | null = null;
  makingUi = false;
  uiCam!: Phaser.Cameras.Scene2D.Camera;
  portalCool = 0;

  /** Place a PixelLab object by its feet; blocks a footprint `fw` wide and `fd` deep above the feet. */
  obj(name: string, x: number, y: number, fw = 0.5, fd = 6, shadow = true, sc = 1) {
    const m = OM[name]; if (!m) return null;
    const im = this.add.image(Math.round(x), Math.round(y), 'o_' + name).setOrigin(0.5, m.foot / m.h).setDepth(y).setScale(sc);
    const w = (m.x1 - m.x0) * fw * sc;
    if (shadow) this.add.ellipse(x, y - 1, Math.max(8, (m.x1 - m.x0) * 0.7 * sc), Math.max(4, fd * 0.9), 0x0a1008, 0.4).setDepth(1);
    for (let j = -fd; j <= 1; j += 2) for (let i = -w / 2; i <= w / 2; i += 2) this.block(x + i, y + j);
    if (m.chim) this.smoke(Math.round(x) - m.w / 2 * sc + m.chim[0] * sc, Math.round(y) - m.foot * sc + m.chim[1] * sc);
    return im;
  }

  /** Soft chimney smoke: puffs grow, drift with the wind and fade. */
  smoke(x: number, y: number) {
    if (!this.textures.exists('td_puff')) {
      const c = document.createElement('canvas'); c.width = 24; c.height = 24; const k = c.getContext('2d')!;
      const g = k.createRadialGradient(12, 12, 1, 12, 12, 12); g.addColorStop(0, 'rgba(200,204,198,0.9)'); g.addColorStop(0.6, 'rgba(170,176,172,0.45)'); g.addColorStop(1, 'rgba(160,166,162,0)');
      k.fillStyle = g; k.fillRect(0, 0, 24, 24); this.textures.addCanvas('td_puff', c);
    }
    this.add.particles(x, y, 'td_puff', { lifespan: { min: 2800, max: 4200 }, speedY: { min: -14, max: -8 }, speedX: { min: 2, max: 6 }, accelerationX: 1.5,
      scale: { start: 0.22, end: 1.15 }, alpha: { start: 0.55, end: 0 }, rotate: { min: 0, max: 360 }, frequency: 240, quantity: 1 }).setDepth(99980);
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
    if (this.stageN) { this.placeStage(rnd, pick, free); return; }
    // village buildings (level art from PixelLab Objects)
    const B: [string, number, number][] = [
      ['townhall_1', 345, 322], ['house_1', 846, 300], ['house_0', 1090, 330], ['house_2', 1180, 760],
    ];
    for (const [n, x, y] of B) {
      const m = OM[n]; this.obj(n, x, y, 0.82, Math.round((m.foot - m.top) * 0.42));
      // keep the trees away from the building
      for (let j = -(m.foot - m.top) - 60; j <= 40; j += 4) for (let i = -(m.x1 - m.x0) * 0.75; i <= (m.x1 - m.x0) * 0.75; i += 4) if (!this.isBlocked(x + i, y + j)) this.reserved.add(Math.round((x + i) / 4) + ',' + Math.round((y + j) / 4));
    }
    for (const P of PLOTS) for (let j = -200; j <= 150; j += 4) for (let i = -96; i <= 96; i += 4) this.reserved.add(Math.round((P.x + i) / 4) + ',' + Math.round((P.y + j) / 4));
    const near = (x: number, y: number) => this.reserved.has(Math.round(x / 4) + ',' + Math.round(y / 4));
    // market stalls and village clutter around the plaza
    for (const [x, y] of [[600, 520], [652, 500], [436, 522]]) this.obj(pick('stall', 5), x, y, 0.8, 10);
    for (const [k, x, y] of [['well_0', 590, 318], ['barrel_0', 812, 660], ['barrel_1', 822, 668], ['crate_0', 628, 664], ['logs_0', 252, 350], 
      ['hay_0', 400, 668], ['hay_1', 410, 676], ['sign_0', 880, 456], ['stump_0', 232, 392]] as [string, number, number][]) this.obj(k, x, y, 0.7, 4);
    // forest edge and clusters
    for (let k = 0; k < 900; k++) {
      const x = 16 + rnd() * (MW - 32), y = 50 + rnd() * (MH - 60);
      const edge = Math.min(x, MW - x, y, MH - y);
      const dense = edge < 80 || fbm(x / 140, y / 140) > 0.62;
      const inVillage = x > 60 && x < 1240 && y > 230 && y < MH - 60 && edge > 70;
      if (!dense || inVillage || !free(x, y, 48) || near(x, y)) continue;   // roots stay off roads
      const r = rnd();
      this.obj(r < 0.45 ? pick('pine', 3) : r < 0.9 ? pick('oak', 3) : pick('dead', 2), x, y, 0.16, 4, true);
    }
    for (let k = 0; k < 170; k++) {
      const x = 20 + rnd() * (MW - 40), y = 30 + rnd() * (MH - 40);
      if (!free(x, y, 10) || near(x, y)) continue;
      const r = rnd();
      if (r < 0.5) this.add.image(Math.round(x), Math.round(y), 'o_' + pick('bush', 5)).setOrigin(0.5, 0.85).setDepth(y);
      else if (r < 0.85) this.obj(pick('rock', 8), x, y, 0.6, 4);
      else this.obj(pick('stump', 5), x, y, 0.5, 3);
    }
    // campfires: flickering warm light + rising embers
    for (const [x, y] of [[300, 560]]) this.campfire(x, y);
    // ground decals: pebbles/leaves along the road edges, flowers and tufts in the grass, reeds on the banks
    const nearSurf = (x: number, y: number, t: string, r: number) => [[r, 0], [-r, 0], [0, r], [0, -r]].some(([a, b]) => this.surfAt(x + a, y + b) === t);
    for (let k = 0; k < 2600; k++) {
      const x = 8 + rnd() * (MW - 16), y = 8 + rnd() * (MH - 16);
      const sf = this.surfAt(x, y);
      if (sf === 'grass' && !this.isBlocked(x, y) && nearSurf(x, y, 'water', 6)) { if (rnd() < 0.5) this.add.image(Math.round(x), Math.round(y), 'o_' + pick('reed', 4)).setOrigin(0.5, 0.9).setDepth(y); continue; }
      if (sf === 'dirt' || sf === 'cobble') { if (nearSurf(x, y, 'grass', 6) && rnd() < 0.35) this.add.image(Math.round(x), Math.round(y), 'o_' + (rnd() < 0.6 ? pick('pebble', 6) : pick('leaf', 3))).setDepth(1.2); continue; }
      if (sf !== 'grass' || this.isBlocked(x, y) || rnd() > 0.28) continue;
      const r = rnd();
      this.add.image(Math.round(x), Math.round(y), 'o_' + (r < 0.4 ? pick('flower', 5) : r < 0.75 ? pick('tuft', 2) : r < 0.9 ? pick('leaf', 3) : pick('pebble', 6))).setOrigin(0.5, 0.8).setDepth(r < 0.75 ? y : 1.2);
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

  get F() { const s = S(); const t = activeTier(s); return { key: formKeyOf(s.cls, t), name: formName(s.cls, t) }; }
  get ui() { const u = this.scene.get('TdUI') as TdUIScene; return u?.sys.isActive() && u.panels ? u : null; }
  heroKey() { return this.F.key; }
  resetJoy() { this.joy.id = -1; this.joy.dx = this.joy.dy = 0; }
  stageTitle() { const st = this.stageN ? STAGES[this.stageN - 1] : null; return st ? `ด่าน ${st.n} ${st.land.name} (มอน Lv${st.level})` : 'หมู่บ้านเอลเดอร์โกรฟ'; }
  /** golden burst when the hero levels up or changes form */
  levelUpFx() {
    const h = this.hero;
    const ring = this.add.ellipse(h.x, h.y, 20, 8).setStrokeStyle(2, 0xffd24a, 1).setDepth(h.y + 1);
    this.tweens.add({ targets: ring, scaleX: 3, scaleY: 3, alpha: 0, duration: 700, onComplete: () => ring.destroy() });
    const g = this.add.image(h.x, h.y - 20, 'td_glow').setTint(0xffd24a).setBlendMode(Phaser.BlendModes.ADD).setDepth(99991).setScale(0.3);
    this.tweens.add({ targets: g, scale: 1.2, alpha: 0, duration: 900, onComplete: () => g.destroy() });
    for (let i = 0; i < 14; i++) {
      const sp = this.add.rectangle(h.x + (Math.random() - 0.5) * 24, h.y - Math.random() * 30, 2, 2, 0xffe08a).setDepth(99992);
      this.tweens.add({ targets: sp, y: sp.y - 30 - Math.random() * 20, alpha: 0, duration: 800 + Math.random() * 500, onComplete: () => sp.destroy() });
    }
  }
  arrowG!: Phaser.GameObjects.Graphics; arrowT!: Phaser.GameObjects.Text;
  /** Guide arrow to the portal you should take: the stage gate in the village, the next-stage gate in a stage
   *  (before the stage is cleared it points to where that gate will open). On screen it bobs above the gate,
   *  off screen it sits on the screen edge pointing the way. */
  updateGuide(time: number) {
    const g = this.arrowG, t = this.arrowT; g.clear(); t.setVisible(false);
    if (this.dead || this.selectUi || this.ui?.panels.isOpen) return;
    let tx: number, ty: number, label: string;
    const next = this.portals.find(p => p.to !== 0);
    if (next) { tx = next.x; ty = next.y; label = typeof next.to === 'number' ? `ด่าน ${next.to}` : 'ประตูด่าน'; }
    else if (this.stageN) { tx = MW - 30; ty = MH / 2 + Math.sin((MW - 30) / 170 + this.stageN) * 120 + Math.sin((MW - 30) / 61) * 22; label = '🔒 ประตูถัดไป'; }
    else return;
    const cam = this.cameras.main, z = cam.zoom, W = this.scale.width, H = this.scale.height;
    const sx = (tx - cam.worldView.x) * z, sy = (ty - cam.worldView.y) * z;
    const dist = Math.round(Math.hypot(tx - this.hero.x, ty - this.hero.y) / 16);
    const sz = H / 22, bob = Math.sin(time / 180) * sz * 0.25;
    const col = 0xffd24a;
    const m = sz * 2.2;
    if (sx > m && sx < W - m && sy > m && sy < H - m) {
      // on screen: a bouncing arrow pointing down at the gate
      const ax = sx, ay = sy - sz * 3.2 + bob;
      g.fillStyle(0x0b0f0c, 0.6).fillTriangle(ax - sz * 0.75, ay - sz * 0.5 + 2, ax + sz * 0.75, ay - sz * 0.5 + 2, ax, ay + sz * 0.7 + 2);
      g.fillStyle(col, 1).fillTriangle(ax - sz * 0.7, ay - sz * 0.5, ax + sz * 0.7, ay - sz * 0.5, ax, ay + sz * 0.6);
      t.setText(label).setPosition(ax, ay - sz * 1.3).setVisible(true);
      return;
    }
    // off screen: arrow on the screen edge in the direction of the gate
    const cx = W / 2, cy = H / 2, a = Math.atan2(sy - cy, sx - cx);
    const top = H * 0.2;   // stay clear of the HUD strip
    const k = Math.min((W / 2 - m) / Math.max(1e-6, Math.abs(Math.cos(a))), ((Math.sin(a) < 0 ? H / 2 - top : H / 2 - m)) / Math.max(1e-6, Math.abs(Math.sin(a))));
    const ax = cx + Math.cos(a) * (k + bob * 0.6), ay = cy + Math.sin(a) * (k + bob * 0.6);
    const pt = (r: number, da: number) => [ax + Math.cos(a + da) * r, ay + Math.sin(a + da) * r] as const;
    const [x1, y1] = pt(sz, 0), [x2, y2] = pt(sz * 0.8, 2.4), [x3, y3] = pt(sz * 0.8, -2.4);
    g.fillStyle(0x0b0f0c, 0.6).fillCircle(ax, ay, sz * 1.05);
    g.fillStyle(col, 1).fillTriangle(x1, y1, x2, y2, x3, y3);
    t.setText(`${label} ${dist} ก้าว`);
    const hw = t.width / 2 + 8;
    const lx = Phaser.Math.Clamp(ax - Math.cos(a) * (sz * 1.6 + hw * Math.abs(Math.cos(a))), hw, W - hw), ly = Phaser.Math.Clamp(ay - Math.sin(a) * sz * 1.9, top, H - sz * 1.5);
    t.setPosition(lx, ly).setVisible(true);
  }
  heroKeyNow = '';
  lastLevel = 0;
  skillReady: Record<string, number> = {};
  /** skill button i (0-2): pay MP / check cooldown in systems, then play it */
  castSkill(i: number) {
    if (this.dead || this.ui?.panels.isOpen || this.selectUi) return;
    const s = S(), id = currentSkills(s)[i]; if (!id) return;
    const r = beginCast(s, id, this.time.now, this.skillReady);
    if (typeof r === 'string') { if (r === 'mp') bus.emit(EV.TOAST, 'MP ไม่พอ', '#8fc8ff'); return; }
    if (hasAnim(this.F.key, 'attack')) {
      this.attacking = true; playAnim(this.hero, this.F.key, 'attack', this.dir, false);
      this.hero.once('animationcomplete', () => { this.attacking = false; setIdle(this.hero, this.F.key, this.dir); });
    }
    this.combat.castSkill(r);
    bus.emit(EV.STATE_CHANGED);
  }

  // ---------- building plots ----------
  plotViews: { key: string; objs: Phaser.GameObjects.GameObject[]; bubble?: Phaser.GameObjects.Container }[] = [];
  settleT = 0; actT = 0;
  plotKey(i: number) {
    const s = S();
    const b = buildingAt(s, i);
    return b ? `${b.type}_${underConstruction(b) ? 'site' : artLv(b.level)}` : 'empty';
  }
  renderPlots() { PLOTS.forEach((_, i) => this.renderPlot(i)); }
  renderPlot(i: number) {
    const P = PLOTS[i], key = this.plotKey(i), old = this.plotViews[i];
    old?.objs.forEach(o => o.destroy()); old?.bubble?.destroy();
    const objs: Phaser.GameObjects.GameObject[] = [];
    const txt = (y: number, t: string, col = '#ffe7a0') => { const o = this.add.text(P.x, y, t, { fontFamily: 'sans-serif', fontSize: '7px', color: col, stroke: '#0b0f0c', strokeThickness: 3, resolution: 8, align: 'center' }).setOrigin(0.5, 1).setDepth(99980); objs.push(o); return o; };
    if (key === 'locked' || key === 'empty') {
      // a staked-out lot: dark soil patch, corner stakes, a sign
      const g = this.add.graphics().setDepth(1.1);
      g.fillStyle(0x2a2016, 0.35).fillRoundedRect(P.x - 62, P.y - 46, 124, 52, 10);
      g.lineStyle(1, 0xc8a878, 0.5).strokeRoundedRect(P.x - 62, P.y - 46, 124, 52, 10);
      objs.push(g);
      for (const [dx, dy] of [[-62, -46], [62, -46], [-62, 6], [62, 6]]) objs.push(this.add.rectangle(P.x + dx, P.y + dy, 2, 7, 0x6a4a2a).setOrigin(0.5, 1).setDepth(P.y + dy));
      const sg = this.add.image(P.x, P.y - 14, 'o_sign_0').setOrigin(0.5, OM.sign_0.foot / OM.sign_0.h).setDepth(P.y - 14); objs.push(sg);
      txt(P.y - 58, i === HOME_PLOT ? '🏠 ที่ดินของคุณ — สร้างบ้าน' : '🔨 ที่ดินว่าง', '#9fffb0');
    } else {
      const [type, lvl] = key.split('_');
      const art = lvl === 'site' ? 'site_0' : `${type === 'home' ? 'house' : type}_${lvl}`;
      const m = OM[art];
      if (m) {
        const im = this.obj(art, P.x, P.y, 0.82, Math.round((m.foot - m.top) * 0.42));
        if (im) objs.push(im);
        // the new walls must not trap the hero
        const h = this.hero;
        if (h && this.isBlocked(h.x, h.y)) h.setPosition(P.x, P.y + 14);
      }
      const b = buildingAt(S(), i)!;
      const t = txt(P.y - (m ? m.foot - m.top : 120) - 2, `${type === 'home' ? '🏠 ' : ''}${BUILDINGS[type as BuildingId].name} Lv${b.level}`, type === 'home' ? '#9fffb0' : '#ffe7a0');
      if (lvl === 'site') t.setData('timer', true);
    }
    this.plotViews[i] = { key, objs };
  }
  saveT = 0;
  updatePlots(time: number) {
    if (time - this.saveT > 10000) { this.saveT = time; const s0 = S(); s0.playTime = (s0.playTime ?? 0) + 10; saveGame(s0); }
    if (this.stageN || time - this.settleT < 1000) return;
    this.settleT = time;
    const s = S();
    settleTick(s);
    PLOTS.forEach((P, i) => {
      const v = this.plotViews[i]; if (!v) return;
      if (this.plotKey(i) !== v.key) { this.renderPlot(i); bus.emit(EV.STATE_CHANGED); return; }
      const b = buildingAt(s, i);
      if (b && underConstruction(b)) (v.objs.find(o => o.getData?.('timer')) as Phaser.GameObjects.Text | undefined)?.setText(`🔨 ${BUILDINGS[b.type as BuildingId].name} Lv${b.level} • ${Math.ceil((b.done! - Date.now()) / 1000)} วิ`);
      const res = b && !underConstruction(b) ? BUILDINGS[b.type as BuildingId].produces : undefined;
      const show = !!res && b!.stored >= 1;
      if (show && !v.bubble) {
        const m = OM[`${b!.type === 'home' ? 'house' : b!.type}_${artLv(b!.level)}`], top = P.y - (m ? m.foot - m.top : 120) - 14;
        const bub = this.add.container(P.x, top).setDepth(99990);
        bub.add([this.add.circle(0, 0, 8, 0xffffff, 0.95).setStrokeStyle(1.5, 0x3a8a3a), this.add.text(0, 0, res === 'gold' ? '💰' : res === 'wood' ? '🪵' : res === 'stone' ? '🪨' : '🍖', { fontSize: '9px', resolution: 8 }).setOrigin(0.5)]);
        this.tweens.add({ targets: bub, y: top - 4, duration: 650, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        v.bubble = bub;
      } else if (!show && v.bubble) { v.bubble.destroy(); v.bubble = undefined; }
      // walk up to a building to collect what it made
      if (show && Math.hypot(P.x - this.hero.x, P.y + 10 - this.hero.y) < 46) {
        const r = settleCollect(s, i);
        if (r) { this.combat.float(P.x, P.y - 60, `+${r.amount} ${RES_NAMES[r.res]}`, '#9fffb0', 10); saveGame(s); bus.emit(EV.STATE_CHANGED); }
      }
    });
  }
  /** what the action button offers: talk to the elder / merchant / blacksmith, or open a plot */
  updateAction(time: number) {
    if (time - this.actT < 200) return;
    this.actT = time;
    const ui = this.ui; if (!ui) return;
    if (this.stageN || this.dead || ui.panels.isOpen) { ui.setAction(null); return; }
    const h = this.hero;
    let best: { d: number; label: string; cb: () => void } | null = null;
    const offer = (d: number, label: string, cb: () => void) => { if (!best || d < best.d) best = { d, label, cb }; };
    for (const n of this.village?.npcs ?? []) {
      if (n.hidden) continue;
      const d = Math.hypot(n.sp.x - h.x, n.sp.y - h.y); if (d > 34) continue;
      if (n.key === 'np1') offer(d, '💬 ผู้เฒ่า', () => {
        const s = S();
        if (nextForm(s) !== null) ui.panels.open('job');
        else ui.panels.openDialog('elder', s.tier === 0 ? `เจ้าเลเวล ${s.level} แล้ว ถึงเลเวล 10 กลับมาหาข้า จะได้เลือกสายอาชีพ — ดาบ ธนู เวท หรือแทงค์` : `เจ้าแกร่งขึ้นมากแล้ว ร่างต่อไปจะปลดล็อกที่เลเวล ${[0, 10, 40, 80][Math.min(3, s.tier + 1)]}`);
      });
      else if (n.key === 'np2') offer(d, '💬 ร้านค้า', () => ui.panels.open('shop'));
      else if (n.key === 'np3') offer(d, '💬 ช่างตีเหล็ก', () => ui.panels.open('smith'));
    }
    PLOTS.forEach((P, i) => {
      const d = Math.hypot(P.x - h.x, (P.y + 12 - h.y) * 1.4); if (d > 60) return;
      const k = this.plotViews[i]?.key;
      offer(d + 20, k === 'empty' ? '🔨 สร้างบ้าน' : i === HOME_PLOT ? '🏠 บ้านของฉัน' : '🏛 อาคาร', () => ui.panels.openPlot(i));
    });
    const b = best as { d: number; label: string; cb: () => void } | null;
    ui.setAction(b?.label ?? null, b?.cb);
  }
  dead = false;
  /** Demo: the hero dies with the code-made death effect, then respawns. */
  heroDie() {
    if (this.dead) return;
    this.dead = true; this.attacking = false;
    const h = this.hero;
    this.deathFx(h, 0xbfe8ff, () => {
      if (this.stageN) { this.time.delayedCall(1200, () => { const s0 = S(); s0.hp = derive(s0).maxHp; saveGame(s0); this.scene.restart({ stage: 0 }); }); return; }
      this.time.delayedCall(900, () => {
        h.setPosition(PLAZA.x, PLAZA.y + 40).setAngle(0).setAlpha(0).setVisible(true).clearTint();
        setIdle(h, this.F.key, 0);
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
    if (this.dead || this.attacking || this.ui?.panels.isOpen || this.selectUi || !hasAnim(this.F.key, 'attack')) return;
    this.attacking = true;
    const h = this.hero;
    const F = this.F;
    playAnim(h, F.key, 'attack', this.dir, false);
    if (this.stageN) this.combat.heroAttack(F.key);
    h.once('animationcomplete', () => { this.attacking = false; setIdle(h, F.key, this.dir); });
  }

  update(time: number, dt: number) {
    let mx = 0, my = 0;
    this.label.setVisible(false);
    const s1 = S();
    if (this.F.key !== this.heroKeyNow) { this.heroKeyNow = this.F.key; if (!this.attacking && !this.dead) setIdle(this.hero, this.F.key, this.dir); this.levelUpFx(); }
    if (this.lastLevel && s1.level > this.lastLevel) { this.levelUpFx(); if (nextForm(s1) !== null) bus.emit(EV.TOAST, s1.tier === 0 ? 'ถึงเลเวล 10! กลับหมู่บ้านไปหาผู้เฒ่าเพื่อเลือกสายอาชีพ' : 'เปลี่ยนร่างได้แล้ว! แตะปุ่ม ✨ ด้านบน', '#ffd84a'); bus.emit(EV.STATE_CHANGED); }
    this.lastLevel = s1.level;
    this.updatePlots(time); this.updateAction(time); this.updateGuide(time);
    if (!this.stageN) { const h = isHungry(s1); if (h && !this.hungryWarned) bus.emit(EV.TOAST, 'ชาวบ้านหิว! อาหารหมดคลัง อาคารผลิตได้แค่ครึ่งเดียว — ออกล่าสัตว์ป่าหาเนื้อ', '#ff8a6a'); this.hungryWarned = h; }
    if (this.ui?.panels.isOpen) { this.resetJoy(); }
    const k = this.keys;
    if (k && !this.ui?.panels.isOpen) { mx = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0); my = (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0); }
    const R = this.scale.height / 9 * uiOpt(S()).btn;
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
      playAnim(h, this.F.key, 'walk', this.dir);
    } else if (h.anims.isPlaying && !this.attacking && !this.dead) {
      setIdle(h, this.F.key, this.dir);
    }
    h.setDepth(h.y);
    if (this.stageN) this.combat.update(time, dt);
    else this.village?.update(time, dt);
    for (const p of this.portals) if (!this.dead && Math.hypot(p.x - h.x, p.y - h.y) < 16 && time > this.portalCool) {
      if (p.to === 'select') { this.portalCool = time + 99999; this.stageSelect(); }
      else if (p.to === 0) { this.portalCool = time + 99999; this.cameras.main.fadeOut(300); this.time.delayedCall(320, () => this.scene.restart({ stage: 0 })); }
      else { this.portalCool = time + 2500; this.enterStage(p.to as number); }
    }
    if (time - this.hudT > 250) {
      this.hudT = time; const s0 = S(), d0 = derive(s0);
      if (time - this.regenT > 2000) { this.regenT = time; s0.hp = Math.min(d0.maxHp, s0.hp + Math.ceil(d0.maxHp * (this.stageN ? 0.01 : 0.05 * (1 + (s0.buildings.find(b => b.type === 'home')?.level ?? 0) * 0.5)))); s0.mp = Math.min(d0.maxMp, (s0.mp ?? 0) + Math.ceil(d0.maxMp * (this.stageN ? 0.04 : 0.1))); }
      const st = this.stageN ? STAGES[this.stageN - 1] : null;
      this.label.setText(`${st ? `ด่าน ${st.n} ${st.land.name} (Lv${st.level})` : 'หมู่บ้าน'} • Lv${s0.level} • HP ${Math.round(s0.hp)}/${d0.maxHp} • ${s0.gold}G • ร่าง ${this.F.name}`);
    }
    if (!this.dead) this.shadow.setPosition(h.x, h.y - 1);
    for (const [i, l] of this.lamps.entries()) l.setAlpha(0.75 + Math.sin(time / 180 + i * 1.7) * 0.12);
    for (const [i, f] of this.fires.entries()) {
      const fl = 0.7 + Math.sin(time / 70 + i) * 0.12 + Math.sin(time / 33 + i * 3) * 0.08 + (Math.random() - 0.5) * 0.12;
      f.g.setAlpha(fl).setScale(1.5 + fl * 0.25); f.core.setAlpha(0.6 + fl * 0.4).setScale(0.5 + fl * 0.1);
    }
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
