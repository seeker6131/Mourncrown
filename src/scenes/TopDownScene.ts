// Prototype of the new art direction: top-down 3/4 pixel art, muted dark-forest tone.
// Ground is painted per pixel from distance fields (grass, dirt road, cobble plaza, river, pond); props are code-drawn
// placeholders until the PixelLab/ChatGPT art arrives. The hero is the PixelLab villager (8 directions).
// Open with ?td in the URL.
import Phaser from 'phaser';
import { Combat } from '../world/tdCombat';
import { STAGES, WILD, PITS } from '../world/stages';
import { Crowd } from '../world/crowd';
import { sfx } from '../audio/sfx';
import { act, refused } from '../net/client';
import { TUT_STEPS, tutStep, tutActive } from '../systems/progress';
import { titleOf } from '../data/achievements';
import { type Vein } from '../systems/alchemy';
import { itemDef } from '../data/items';
import { S } from '../core/events';
import { saveGame, loadGame, startNewGame } from '../core/save';
import { runtime } from '../core/events';
import { derive } from '../systems/stats';
import { Village, populateVillage } from '../world/npcs';
import { activeTier, nextForm, currentSkills } from '../systems/stats';
import { beginCast } from '../systems/skillCast';
import { SKILL_BY_ID } from '../data/skills';

import { vipActive } from '../systems/premium';
import { uiOpt } from '../core/uiOptions';
import { showWait, hideWait } from '../core/wait';
import { stageFood, isHungry } from '../systems/supplies';
import { formName } from '../data/classes';
import { bus, EV } from '../core/events';
import { tick as settleTick, buildingAt, underConstruction, ensureNpcVillage } from '../systems/settlement';
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

let MW = 1280;                        // map size in game px (1 texel = 1 px): village 1280x1024, farming maps 2048x1408
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
  shadow!: Phaser.GameObjects.Image;
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
    const st = this.stageN && this.stageN !== WILD ? STAGES[this.stageN - 1] : null;
    const keys = this.stageN === WILD ? [...heroes, 'hg', 'mo16', 'mo17'] : st ? [...heroes, ...st.land.mobs.map(m => m.key), ...(st.boss ? [st.land.boss.key] : [])]
      : [...heroes, ...Array.from({ length: 10 }, (_, i) => 'np' + (i + 1)), ...Array.from({ length: 5 }, (_, i) => 'an' + (i + 1))];
    preloadChars(this, keys);
  }

  stageN = 0;
  hudT = 0;
  regenT = 0;
  combat!: Combat;
  village?: Village;
  portals: { x: number; y: number; to: number | 'select'; label: Phaser.GameObjects.Text }[] = [];
  get wild() { return this.stageN === WILD; }
  room = 1; roomPick?: number;
  init(data: { stage?: number; room?: number }) {
    this.stageN = data?.stage ?? 0; this.roomPick = data?.room; MW = this.wild ? 2560 : this.stageN ? 2048 : 1280; MH = this.wild ? 1792 : this.stageN ? 1408 : 1024;
    if (this.wild) this.makeWild(); else if (this.stageN) this.makeTrails(this.stageN);
  }

  create() {
    if (!runtime.state) runtime.state = loadGame() ?? startNewGame();
    (window as unknown as { __tdS: typeof S }).__tdS = S;
    this.selectUi = null; this.portalCool = this.time.now + 1500; this.makingUi = false; this.portalArmed = false;
    this.crowd = undefined; this.lamps = []; this.fires = []; this.nodes = []; this.casts = []; this.tall = []; this.faded.clear(); this.dayT = -1e9; this.reserved = new Set(); this.dead = false; this.attacking = false; this.portals = []; this.skillReady = {};
    this.combat = new Combat(this as never);
    this.blocked = new Uint8Array((MW / CELL) * (MH / CELL));
    this.paintGround();
    this.animateWater();
    this.makePropTextures();
    createCharAnims(this);
    this.shadowTex();
    this.shadow = this.contact(PLAZA.x, PLAZA.y + 40, 24, 9, 0.5);
    this.hero = this.add.sprite(PLAZA.x, PLAZA.y + 40, 'c_hero_idle', 0); setIdle(this.hero, this.F.key, 0);
    { const s0 = S(), d0 = derive(s0); if (s0.hp <= 0) s0.hp = d0.maxHp; }
    this.titleTx = this.add.text(0, 0, '', { fontFamily: 'sans-serif', fontSize: '7px', color: '#ffd84a', stroke: '#1a1208', strokeThickness: 3, resolution: 6 }).setOrigin(0.5).setDepth(99995);
    this.placeProps();
    // return scroll: back to the village from any map
    const recall = () => { if (!this.stageN || this.dead) return; this.portalCool = this.time.now + 99999; this.cameras.main.fadeOut(250); this.time.delayedCall(260, () => showWait()); this.time.delayedCall(300, () => this.scene.restart({ stage: 0 })); };
    bus.on('td:recall', recall); this.events.once('shutdown', () => bus.off('td:recall', recall));
    this.village = this.stageN ? undefined : new Village(this, MW, MH);
    if (this.village) { populateVillage(this.village, roadY); this.castShadow(this.hero, true); for (const n of this.village.npcs) this.castShadow(n.sp, true); }
    this.plotViews = []; this.heroKeyNow = this.F.key;
    if (refused(act('enterMap', { n: this.stageN }))) { bus.emit(EV.TOAST, 'เซิร์ฟปฏิเสธการเข้าแผนที่', '#ff8a6a'); this.time.delayedCall(50, () => this.scene.restart({ stage: 0 })); }
    if (this.wild) { const r = act('wildRooms', { pick: this.roomPick }); if (r.refused) bus.emit(EV.TOAST, 'ห้องเต็ม — ย้ายไปห้องที่ว่าง', '#ff8a6a'); this.room = r.room; this.online = r.rooms[r.room - 1].count; this.onlineT = this.time.now + 30000; }
    if (!this.stageN) { ensureNpcVillage(S(), PLOT_OF, HOME_PLOT); this.renderPlots(); }
    if (!this.scene.isActive('TdUI')) this.scene.launch('TdUI'); else this.scene.get('TdUI').scene.restart();
    this.scene.bringToTop('TdUI');
    if (!this.stageN) { this.addPortal(PLAZA.x + 6, 26, 'select', 'ประตูแผนที่ ▲'); this.addPortal(70, roadY(70), WILD, '◀ ป่าดงดิบ'); }

    const cam = this.cameras.main;
    cam.postFX?.clear(); this.dayFx = !this.stageN && this.renderer.type === Phaser.WEBGL ? cam.postFX.addColorMatrix() : null;
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
    if (this.input.keyboard) { this.keys = this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT') as Record<string, Phaser.Input.Keyboard.Key>; this.input.keyboard.on('keydown-SPACE', () => this.attack()); ['ONE', 'TWO', 'THREE'].forEach((k, i) => this.input.keyboard!.on('keydown-' + k, () => this.castSkill(i))); this.input.keyboard.on('keydown-Q', () => this.toggleAuto()); }
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
      if (this.wild) {   // the Deepwild: trails, open-pit mines (rock floor), ponds; everything else jungle floor
        const off = this.trailOff(x, y);
        if (this.ponds.some(c => Math.hypot(x - c.x, (y - c.y) * 1.3) < c.r)) t = 'w';
        else if (this.pits.some(c => Math.hypot(x - c.x, (y - c.y) * 1.25) < c.r)) t = 'c';
        else if (off < 18) t = 'd';
        V[j * VW + i] = t; continue;
      }
      if (this.stageN) {   // wild stage: one winding trail from the west gate to the east gate, clearings along it, a pond
        const off = this.trailOff(x, y), n = this.stageN;
        const g0 = STAGES[n - 1].land.ground;
        const clr = this.clearings.find(c => Math.hypot(x - c.x, (y - c.y) * 1.2) < c.r);
        if (off > 70 && this.ponds.some(c => Math.hypot(x - c.x, (y - c.y) * 1.3) < c.r)) t = 'w';
        else if (g0 === 'lava' && off > 80 && Math.abs(Math.sin(x / 130 + n) * Math.cos(y / 110 + n)) > 0.9) t = 'w';     // lava pools between the trails
        else if (g0 === 'dung' && off > 60 && (Math.abs(((x + n * 37) % 260) - 130) < 14 || Math.abs((y % 220) - 110) < 12)) t = 'w'; // sewer channels
        else if (off < 20) t = 'd';
        else if (clr && (clr.boss || g0 === 'dung')) t = 'c';
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
    const land = this.stageN && !this.wild ? STAGES[this.stageN - 1].land.ground : 'forest';
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
    this.contact(x, y - 1, Math.max(10, im.width * 0.8), Math.max(5, im.width * 0.22), 0.4);
    for (let j = -2; j <= 1; j++) for (let i = -foot; i <= foot; i += 2) this.block(x + i, y + j);
    return im;
  }

  // ---------- farming map layout: three winding east-west trails joined by two north-south ones ----------
  clearings: { x: number; y: number; r: number; boss?: boolean }[] = [];
  ponds: { x: number; y: number; r: number }[] = [];
  trailMain = (x: number) => x;
  trailOff = (_x: number, _y: number) => 1e9;
  makeTrails(n: number) {
    const W = MW, H = MH;
    const wave = (x: number, base: number, ph: number) => base + Math.sin(x / 190 + ph) * 90 + Math.sin(x / 67 + ph * 2) * 18;
    const y1 = (x: number) => wave(x, H * 0.24, n), y2 = (x: number) => wave(x, H * 0.5, n + 1.7), y3 = (x: number) => wave(x, H * 0.77, n + 3.1);
    const v1 = (y: number) => W * 0.3 + Math.sin(y / 150 + n) * 50, v2 = (y: number) => W * 0.68 + Math.sin(y / 140 + n * 2) * 50;
    this.trailMain = y2;
    this.trailOff = (x, y) => {
      let d = Math.min(Math.abs(y - y1(x)), Math.abs(y - y2(x)), Math.abs(y - y3(x)));
      if (y > y1(x) - 10 && y < y3(x) + 10) d = Math.min(d, Math.abs(x - v1(y)), Math.abs(x - v2(y)));
      return d;
    };
    let seed = n * 977 + 13; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const lines = [y1, y2, y3];
    this.clearings = Array.from({ length: 9 }, (_, k) => { const x = W * (0.14 + 0.095 * k) + (r() - 0.5) * 60; return { x, y: lines[k % 3](x) + (r() - 0.5) * 40, r: 70 + r() * 30 }; });
    if (n % 10 === 0) this.clearings.push({ x: W * 0.88, y: y2(W * 0.88), r: 120, boss: true });
    this.ponds = [{ x: W * (0.2 + r() * 0.6), y: (y1(W * 0.5) + y2(W * 0.5)) / 2, r: 50 + r() * 20 }, { x: W * (0.2 + r() * 0.6), y: (y2(W * 0.5) + y3(W * 0.5)) / 2, r: 45 + r() * 20 }];
  }

  // ---------- the Deepwild: one big shared jungle for gathering (no monsters) ----------
  pits: { x: number; y: number; r: number; i: number }[] = [];
  crowd?: Crowd;
  online = 0; onlineT = 0;
  makeWild() {
    const W = MW, H = MH;
    const main = (x: number) => H * 0.5 + Math.sin(x / 230) * 140 + Math.sin(x / 71) * 16;
    this.trailMain = main;
    this.pits = [{ x: 620, y: 470 }, { x: 1080, y: 1360 }, { x: 1560, y: 400 }, { x: 2020, y: 1280 }, { x: 2280, y: 560 }].map((p, i) => ({ ...p, r: 150 + (i === 4 ? 20 : 0), i }));
    this.ponds = [{ x: 330, y: 1350, r: 90 }, { x: 1300, y: 860, r: 70 }, { x: 1800, y: 820, r: 60 }, { x: 2380, y: 1580, r: 80 }];
    this.clearings = [{ x: 420, y: 1050, r: 140 }, { x: 900, y: 760, r: 120 }, { x: 1420, y: 1200, r: 130 }, { x: 1750, y: 1550, r: 120 }, { x: 2150, y: 900, r: 120 }, { x: 1150, y: 300, r: 120 }];
    // a trail along the middle, plus a branch to every pit and meadow
    const segs: [number, number, number, number][] = [];
    for (const p of [...this.pits, ...this.clearings]) { const y0 = main(p.x); segs.push([p.x, y0, p.x, p.y]); }
    const seg = (x: number, y: number, [x0, y0, x1, y1]: [number, number, number, number]) => {
      const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / l2));
      const wob = Math.sin((y + x) / 60) * 8; return Math.hypot(x - (x0 + dx * t) - wob, y - (y0 + dy * t));
    };
    this.trailOff = (x, y) => Math.min(Math.abs(y - main(x)), ...segs.map(q => seg(x, y, q)));
  }
  placeWild(rnd: () => number, pick: (k: string, n: number) => string, free: (x: number, y: number, r: number) => boolean) {
    const has = (k: string) => !!OM[k];
    const jungle = ['jtree_0', 'jtree_1', 'jtree_2', 'palm_0'].filter(has);
    const area = (MW * MH) / (1280 * 800);
    const open = (x: number, y: number, pad: number) => this.pits.some(c => Math.hypot(x - c.x, (y - c.y) * 1.25) < c.r + pad) || this.clearings.some(c => Math.hypot(x - c.x, y - c.y) < c.r);
    // mine pits: quarry art at the rim, ore rocks across the floor, glowing rare veins and a gold vein in the middle
    const COL = [0xffffff, 0xf0f4ff, 0x9a7aaa, 0xb8e8ff, 0xa8ffe8];
    for (const p of this.pits) {
      const P = PITS[p.i];
      if (has('pit_' + (p.i % 2))) { const im = this.add.image(p.x, p.y, 'o_pit_' + (p.i % 2)).setDepth(1).setAlpha(0.95); im.setScale((p.r * 2.1) / Math.max(im.width, 1)); }
      if (has('mine_0')) this.obj('mine_0', p.x - p.r * 0.2, p.y - p.r * 0.78, 0.8, 10, true, 0.9);
      this.add.text(p.x, p.y - p.r * 0.78 - 96, `⛏ ${P.name} • Lv${P.req}`, { fontFamily: 'sans-serif', fontSize: '9px', color: '#ffe8a0', stroke: '#1a1208', strokeThickness: 3, resolution: 6 }).setOrigin(0.5).setDepth(99990);
      const vein = { ore: P.ore, gem: P.gem, req: P.req, pit: p.i };
      for (let k = 0; k < 40; k++) {
        const a = rnd() * Math.PI * 2, rr = p.r * (0.32 + rnd() * 0.5), x = p.x + Math.cos(a) * rr, y = p.y + Math.sin(a) * rr / 1.25;
        if (this.isBlocked(x, y) || this.nodes.some(n => Math.hypot(n.x - x, n.y - y) < 34)) continue;
        const o = this.obj(pick('ore', 7), x, y, 0.4, 3, true, 0.62); o?.setTint(COL[p.i]); this.addNode(o, x, y, 'stone', vein);
      }
      const veins = ['vein_0', 'vein_1', 'vein_3'].filter(has);
      for (let k = 0; k < 3; k++) {
        const a = k * 2.1 + 0.4, x = p.x + Math.cos(a) * 34, y = p.y + Math.sin(a) * 26;
        const key = veins.length ? veins[(p.i + k) % veins.length] : pick('ore', 7);
        const o = this.obj(key, x, y, 0.6, 4); if (!veins.length) o?.setTint(0xff9cff);
        const gl = this.add.image(x, y - 10, 'td_glow').setTint(0xd89cff).setBlendMode(Phaser.BlendModes.ADD).setDepth(y - 1).setScale(0.8);
        this.tweens.add({ targets: gl, alpha: { from: 0.35, to: 0.9 }, duration: 1100 + k * 200, yoyo: true, repeat: -1 });
        this.addNode(o, x, y, 'stone', { ...vein, rare: true });
      }
      { const x = p.x, y = p.y + 4; const o = this.obj(has('vein_2') ? 'vein_2' : pick('ore', 7), x, y, 0.6, 4); if (!has('vein_2')) o?.setTint(0xffd84a); this.addNode(o, x, y, 'stone', { ...vein, gold: true }); }
    }
    // jungle: big trees everywhere off the trails, ferns and flowers underneath
    for (let k = 0; k < 340 * area; k++) {
      const x = 10 + rnd() * (MW - 20), y = 60 + rnd() * (MH - 60);
      const key = jungle.length && rnd() < 0.7 ? jungle[Math.floor(rnd() * jungle.length)] : rnd() < 0.6 ? pick('oak', 3) : pick('pine', 3);
      const hgt = (OM[key]?.foot ?? 120) - (OM[key]?.top ?? 0);
      if (this.trailOff(x, y) < 60 || this.trailOff(x, y - hgt * 0.5) < 44 || open(x, y, 40) || !free(x, y, 56)) continue;
      // solid trunk + roots: jungle trees spread wide buttress roots, so their footprint is wider and deeper
      const jt = key.startsWith('jtree');
      this.addNode(this.obj(key, x, y, jt ? 0.28 : key.startsWith('palm') ? 0.18 : 0.22, jt ? 40 : 16, true), x, y, 'wood');
    }
    const ferns = ['fern_0', 'fern_1'].filter(has);
    for (let k = 0; k < 260 * area; k++) {
      const x = 20 + rnd() * (MW - 40), y = 30 + rnd() * (MH - 40);
      if (this.trailOff(x, y) < 24 || !free(x, y, 6)) continue;
      const r = rnd(), key = ferns.length && r < 0.4 ? ferns[Math.floor(rnd() * ferns.length)] : r < 0.6 ? pick('bush', 5) : r < 0.8 ? pick('flower', 5) : pick('tuft', 2);
      this.add.image(Math.round(x), Math.round(y), 'o_' + key).setOrigin(0.5, 0.85).setDepth(y).setScale(key.startsWith('fern') ? 0.55 : 1);
    }
    for (const c of this.ponds) for (let k = 0; k < 10; k++) { const a = rnd() * 6.28, x = c.x + Math.cos(a) * (c.r + 6), y = c.y + Math.sin(a) * (c.r / 1.3 + 4); if (free(x, y, 4)) this.add.image(x, y, 'o_' + pick('reed', 4)).setOrigin(0.5, 0.9).setDepth(y); }
    const gy = this.trailMain(30);
    this.addPortal(30, gy, 0, 'กลับหมู่บ้าน');
    this.hero.setPosition(64, this.trailMain(64));
    // herds of deer and boar graze the meadows and the jungle edges
    const spot = () => {
      for (let i = 0; i < 80; i++) {
        const c = rnd() < 0.7 ? this.clearings[Math.floor(rnd() * this.clearings.length)] : null;
        const x = c ? c.x + (rnd() - 0.5) * c.r * 1.6 : 60 + rnd() * (MW - 120), y = c ? c.y + (rnd() - 0.5) * c.r * 1.3 : 60 + rnd() * (MH - 120);
        if (this.isBlocked(x, y) || this.surfAt(x, y) === 'water' || Math.hypot(x - 30, y - gy) < 200) continue;
        if (Math.hypot(x - this.hero.x, y - this.hero.y) < 220 && i < 60) continue;
        return { x, y };
      }
      return { x: MW * 0.5, y: this.trailMain(MW * 0.5) };
    };
    this.combat.spawnMap(WILD, spot, null);
    // other players gathering here (simulated until the server exists)
    const work = this.nodes.filter(n => !n.vein || n.vein.req <= 20);
    this.crowd = new Crowd(this as never, CH.hg ? 'hg' : 'hero', () => work.map(n => ({ x: n.x, y: n.y, kind: n.kind })), 16, () => { const n = work[Math.floor(rnd() * work.length)]; return { x: n.x + 10, y: n.y + 16 }; });
  }

  /** Farming map: dense forest between the trails, clearings where monsters gather, the village gate in the west. */
  placeStage(rnd: () => number, pick: (k: string, n: number) => string, free: (x: number, y: number, r: number) => boolean) {
    const st = STAGES[this.stageN - 1];
    const tint: Record<string, number> = { forest: 0xffffff, haunt: 0xb8a8d8, lava: 0x8a5a50, snow: 0xe8f4ff, dung: 0x9aa8b8 };

    const g = st.land.ground;
    const area = (MW * MH) / (1280 * 800);
    const inClear = (x: number, y: number) => this.clearings.some(c => Math.hypot(x - c.x, (y - c.y) * 1.2) < c.r + 20);
    const trees = g === 'haunt' || g === 'lava' ? ['dead', 2] as const : g === 'snow' ? ['pine', 3] as const : null;
    for (let k = 0; k < (g === 'dung' ? 0 : g === 'lava' ? 160 : 520) * area; k++) {
      const x = 10 + rnd() * (MW - 20), y = 60 + rnd() * (MH - 60);
      const r = rnd(), key = trees ? pick(trees[0], trees[1]) : r < 0.45 ? pick('pine', 3) : r < 0.88 ? pick('oak', 3) : pick('dead', 2);
      const hgt = (OM[key]?.foot ?? 120) - (OM[key]?.top ?? 0);
      // never hide a trail behind the crown, roots stay off it, clearings stay open
      if (this.trailOff(x, y) < 70 || this.trailOff(x, y - hgt * 0.5) < 50 || this.trailOff(x, y - hgt) < 30 || inClear(x, y) || !free(x, y, 48)) continue;
      const t = this.obj(key, x, y, 0.22, 16, true);
      if (t && g !== 'forest') t.setTint(tint[g]);
      void t;
    }
    if (g === 'dung' || g === 'lava') for (let k = 0; k < 260 * area; k++) {   // boulders and ore instead of a forest
      const x = 10 + rnd() * (MW - 20), y = 40 + rnd() * (MH - 50);
      if (this.trailOff(x, y) < 50 || inClear(x, y) || !free(x, y, 12)) continue;
      const o = this.obj(rnd() < 0.7 ? pick('rock', 8) : pick('ore', 7), x, y, 0.6, 4); o?.setTint(g === 'lava' ? 0xd09080 : 0x9aa8b8);
      void o;
    }
    for (let k = 0; k < 220 * area; k++) {
      const x = 20 + rnd() * (MW - 40), y = 30 + rnd() * (MH - 40);
      if (!free(x, y, 8)) continue;
      const r = rnd(), im = this.add.image(Math.round(x), Math.round(y), 'o_' + (r < 0.5 ? pick('rock', 8) : r < 0.75 ? pick('tuft', 2) : pick('pebble', 6))).setOrigin(0.5, 0.85).setDepth(y);
      void im;
    }
    const gy = this.trailMain(24);
    this.addPortal(24, gy, 0, 'กลับหมู่บ้าน');
    this.hero.setPosition(56, this.trailMain(56));
    // monsters appear anywhere walkable, away from the gate and out of the hero's sight
    const spot = () => {
      for (let i = 0; i < 80; i++) {
        const c = rnd() < 0.55 ? this.clearings[Math.floor(rnd() * this.clearings.length)] : null;
        const x = c ? c.x + (rnd() - 0.5) * c.r * 1.6 : 40 + rnd() * (MW - 80), y = c ? c.y + (rnd() - 0.5) * c.r * 1.2 : 40 + rnd() * (MH - 80);
        if (this.isBlocked(x, y) || this.surfAt(x, y) === 'water' || Math.hypot(x - 24, y - gy) < 260) continue;
        if (Math.hypot(x - this.hero.x, y - this.hero.y) < 240 && i < 60) continue;
        return { x, y };
      }
      return { x: MW * 0.5, y: this.trailMain(MW * 0.5) };
    };
    const boss = this.clearings.find(c => c.boss) ?? null;
    this.combat.spawnMap(this.stageN, spot, boss ? { x: boss.x, y: boss.y } : null);
    const s0 = S() as unknown as { tdMaxMap?: number }; s0.tdMaxMap = Math.max(s0.tdMaxMap ?? 0, this.stageN);
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
  enterStage(n: number, room?: number) {
    const s = S();
    if (n === WILD) {   // free, any level; everyone goes in villager clothes
      if (s.outfit !== 'gather') { s.outfit = 'gather'; bus.emit(EV.TOAST, 'สวมชุดชาวบ้าน (ชุดหาทรัพยากร) แล้ว', '#ffd8a0'); }
      saveGame(s); this.portalCool = this.time.now + 99999; this.cameras.main.fadeOut(250); this.time.delayedCall(260, () => showWait()); this.time.delayedCall(300, () => this.scene.restart({ stage: WILD, room })); return;
    }
    const st = STAGES[n - 1], sv = s as unknown as { tdUnlockAll?: boolean };
    if (s.level < st.req && !sv.tdUnlockAll) { bus.emit(EV.TOAST, `ต้องเลเวล ${st.req} ถึงจะเข้าแผนที่ ${n} ได้`, '#ff8a6a'); return; }
    if (s.res.food < stageFood(n) && !vipActive(s)) { bus.emit(EV.TOAST, `อาหารไม่พอ! แผนที่ ${n} ต้องใช้เสบียง 🍖${stageFood(n)} — ล่าสัตว์ในป่าดงดิบหรือเก็บจากคอกสัตว์`, '#ff8a6a'); return; }
    if (s.outfit === 'gather') { s.outfit = 'hunt'; bus.emit(EV.TOAST, 'สวมชุดนักรบแล้ว (แผนที่มอน)', '#ffd8a0'); }
    bus.emit(EV.TOAST, 'แผนที่มอน: ได้ EXP ทอง ไอเทม • ทรัพยากรอยู่ที่ 🌿 ป่าดงดิบ', '#c8e8ff');
    if (stageFood(n) && !vipActive(s)) bus.emit(EV.TOAST, `ใช้เสบียง 🍖${stageFood(n)}`, '#ffd8a0');
    saveGame(s);
    this.portalCool = this.time.now + 99999; this.cameras.main.fadeOut(250); this.time.delayedCall(260, () => showWait()); this.time.delayedCall(300, () => this.scene.restart({ stage: n }));
  }
  hungryWarned = false;

  /** the stage select is a TdUI panel (same skin as the other windows) */
  stageSelect() { const u = this.ui; if (u) { u.panels.land = -1; u.panels.open('stages'); } this.portalCool = this.time.now + 600; }
  selectUi: Phaser.GameObjects.GameObject[] | null = null;
  makingUi = false;
  uiCam!: Phaser.Cameras.Scene2D.Camera;
  portalCool = 0;
  portalArmed = false;

  // ---------- shadows + day / night (village) ----------
  shadowTex() {
    if (this.textures.exists('td_shadow')) return;
    const c = document.createElement('canvas'); c.width = 64; c.height = 32; const k = c.getContext('2d')!;
    const g = k.createRadialGradient(32, 16, 0, 32, 16, 32); g.addColorStop(0, 'rgba(6,10,8,0.95)'); g.addColorStop(0.55, 'rgba(6,10,8,0.6)'); g.addColorStop(1, 'rgba(6,10,8,0)');
    k.save(); k.scale(1, 0.5); k.fillStyle = g; k.fillRect(0, 0, 64, 64); k.restore();
    this.textures.addCanvas('td_shadow', c);
  }
  /** soft oval shadow under something (w × h px) */
  contact(x: number, y: number, w: number, h: number, alpha = 0.45) {
    return this.add.image(x, y, 'td_shadow').setDisplaySize(w, h).setAlpha(alpha).setDepth(1);
  }
  casts: { src: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite; sh: Phaser.GameObjects.Image; live: boolean }[] = [];
  /** dark silhouette of the object laid on the ground, pointing away from the sun (updated by updateDayNight) */
  castShadow(src: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite, live = false) {
    const sh = this.add.image(src.x, src.y, src.texture.key, src.frame.name).setOrigin(src.originX, src.originY).setTintFill(0x050a08).setAlpha(0).setDepth(1.3);
    this.casts.push({ src, sh, live });
    return sh;
  }
  clock() { const h = this.dayHour(), hh = Math.floor(h), mm = Math.floor((h - hh) * 60); return `${h >= 6 && h < 18 ? '☀' : '🌙'} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`; }
  /** hour of the village day (0-24): one full day lasts 20 real minutes */
  dayHour() { return ((Date.now() / 1200000) % 1) * 24; }
  dayFx: Phaser.FX.ColorMatrix | null = null;
  dayT = 0; light = 0; sunAng = 0; sunLen = 1; shAlpha = 0;
  updateDayNight(time: number) {
    if (this.stageN) return;
    const h = this.dayHour();
    if (time - this.dayT > 400) {
      this.dayT = time;
      const day = h >= 6 && h < 18, t = day ? (h - 6) / 12 : (((h - 18) + 24) % 24) / 12;   // 0..1 across the sky
      const elev = Math.sin(t * Math.PI);                                                      // 0 at the horizon, 1 overhead
      this.sunAng = Math.PI + t * Math.PI;                    // shadows point west at sunrise, north at noon, east at sunset
      this.sunLen = 0.35 + (1 - elev) * 1.1;
      const edge = Math.min(1, Math.min(t, 1 - t) * 8);       // fade the shadows in/out at sunrise/sunset and moonrise/moonset
      this.shAlpha = (day ? 0.6 : 0.32) * edge;
      // light: 0 = night (the original moody tone), 1 = full day
      this.light = Phaser.Math.Clamp(day ? Math.min(1, elev * 2.2) : 0, 0, 1);
      if (this.dayFx) {
        this.dayFx.reset();
        if (this.light > 0) { this.dayFx.brightness(1 + 0.32 * this.light, true); this.dayFx.saturate(0.18 * this.light, true); }
      }
      for (const c of this.casts) if (!c.live) this.placeShadow(c);
      for (const l of this.lamps) l.setData('base', 1 - this.light).setVisible(this.light < 0.85);
    }
    for (const c of this.casts) if (c.live) this.placeShadow(c);
  }
  placeShadow(c: { src: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite; sh: Phaser.GameObjects.Image }) {
    const { src, sh } = c;
    if (!src.active) { sh.setVisible(false); return; }
    if (sh.texture.key !== src.texture.key || sh.frame.name !== src.frame.name) sh.setTexture(src.texture.key, src.frame.name);
    sh.setPosition(src.x, src.y).setOrigin(src.originX, src.originY).setFlipX(src.flipX)
      .setRotation(this.sunAng + Math.PI / 2).setScale(src.scaleX, src.scaleY * this.sunLen * 0.62)
      .setAlpha(this.shAlpha * src.alpha).setVisible(src.visible && this.shAlpha > 0.01);
  }

  /** Place a PixelLab object by its feet; blocks a footprint `fw` wide and `fd` deep above the feet. */
  obj(name: string, x: number, y: number, fw = 0.5, fd = 6, shadow = true, sc = 1) {
    const m = OM[name]; if (!m) return null;
    const im = this.add.image(Math.round(x), Math.round(y), 'o_' + name).setOrigin(0.5, m.foot / m.h).setDepth(y).setScale(sc);
    if ((m.foot - m.top) * sc > 36) this.tall.push(im);   // tall things fade when the hero walks behind them
    const w = (m.x1 - m.x0) * fw * sc;
    if (shadow) {
      // soft contact shadow as wide as the object, and (village) a cast shadow that follows the sun / moon
      const ow = (m.x1 - m.x0) * sc;
      this.contact(x, y - 1, Math.max(10, ow * 0.95), Math.max(6, Math.min(ow * 0.32, (fd + 6) * 1.6)), 0.45);
      if (!this.stageN && (m.foot - m.top) * sc > 24) this.castShadow(im);
    }
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
    if (this.wild) { this.placeWild(rnd, pick, free); return; }
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
      this.obj(r < 0.45 ? pick('pine', 3) : r < 0.9 ? pick('oak', 3) : pick('dead', 2), x, y, 0.22, 16, true);
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

  /** what the minimap shows */
  mapInfo() {
    if (!this.hero || !this.sys.isActive()) return null;
    const exits = this.portals.map(p => ({ x: p.x, y: p.y, label: p.to === 0 ? 'หมู่บ้าน' : p.to === 'select' ? 'แผนที่มอน' : p.to === WILD ? 'ป่าดงดิบ' : `แผนที่ ${p.to}` }));
    const marks = this.wild ? this.pits.map(p => ({ x: p.x, y: p.y, label: `⛏ ${PITS[p.i].name} Lv${PITS[p.i].req}`, col: S().level >= PITS[p.i].req ? '#ffe8a0' : '#a89878' })) : [];
    const dots: { x: number; y: number; kind: 'mon' | 'boss' | 'animal' | 'player' }[] = [];
    if (this.stageN) for (const m of this.combat.mons) if (m.alive) dots.push({ x: m.x, y: m.y, kind: m.boss ? 'boss' : m.animal ? 'animal' : 'mon' });
    for (const c of this.crowd?.list ?? []) dots.push({ x: c.x, y: c.y, kind: 'player' });
    return { key: String(this.stageN), w: MW, h: MH, hero: { x: this.hero.x, y: this.hero.y, dir: this.dir }, exits, marks, dots };
  }
  /** in the Deepwild the gathering outfit is the empty-handed villager 'hg' (axe / pickaxe only when working) */
  get F() { const s = S(); const t = activeTier(s); if (this.wild && s.outfit === 'gather' && CH.hg) return { key: 'hg', name: formName(s.cls, 0) }; return { key: formKeyOf(s.cls, t), name: formName(s.cls, t) }; }
  /** the swing used to hit: the empty-handed villager hits with the axe */
  get swing() { return this.F.key === 'hg' ? 'chop' : 'attack'; }
  get ui() { const u = this.scene.get('TdUI') as TdUIScene; return u?.sys.isActive() && u.panels ? u : null; }
  heroKey() { return this.F.key; }
  resetJoy() { this.joy.id = -1; this.joy.dx = this.joy.dy = 0; }
  stageTitle() { if (this.wild) return `🌿 ป่าดงดิบ ห้อง ${this.room} • 👥 ${this.online}/100`; const st = this.stageN ? STAGES[this.stageN - 1] : null; return st ? `แผนที่ ${st.n} ${st.land.name} (มอน Lv${st.level})` : `${this.clock()}  ` + 'หมู่บ้านเอลเดอร์โกรฟ'; }
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
    const next = this.portals.find(p => p.to === 'select');
    const boss = this.stageN ? this.combat.mons.find(m => m.boss && m.alive) : null;
    const tut = this.tutTarget();
    if (tut) { tx = tut.x; ty = tut.y; label = tut.label; }
    else if (next) { tx = next.x; ty = next.y; label = 'ประตูแผนที่'; }
    else if (boss) { tx = boss.x; ty = boss.y; label = `👑 ${boss.m.name}`; }   // farming maps: point at the boss while it is alive
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
  // ---------- see-through: trees and buildings in front of the hero turn translucent ----------
  tall: Phaser.GameObjects.Image[] = [];
  faded = new Set<Phaser.GameObjects.Image>();
  fadeT = 0;
  updateOcclusion(time: number) {
    if (time - this.fadeT < 90) return; this.fadeT = time;
    const h = this.hero, hx0 = h.x - 9, hx1 = h.x + 9, hy0 = h.y - 34, hy1 = h.y;
    const now = new Set<Phaser.GameObjects.Image>();
    for (const im of this.tall) {
      if (Math.abs(im.x - h.x) > 160 || im.y - h.y > 260 || im.y <= h.y + 2) continue;   // only things in front (lower on screen) and close
      const w = im.width * im.scaleX, ht = im.height * im.scaleY;
      const l = im.x - w * im.originX, r = l + w, t = im.y - ht * im.originY;
      if (hx1 > l + w * 0.12 && hx0 < r - w * 0.12 && hy1 > t + 4 && hy0 < im.y - 6) now.add(im);
    }
    for (const im of now) if (!this.faded.has(im)) this.tweens.add({ targets: im, alpha: 0.42, duration: 160 });
    for (const im of this.faded) if (!now.has(im) && im.active) this.tweens.add({ targets: im, alpha: 1, duration: 220 });
    this.faded = now;
  }

  // ---------- auto farm: hunt monsters (hunting outfit) or chop/mine (gathering outfit) ----------
  manualT = 0; potT = 0; autoTipT = 0;
  autoStuck = { x: 0, y: 0, t: 0 };
  autoBad = new Map<object, number>();
  autoTarget: object | null = null;
  toggleAuto() {
    const s = S(); s.auto = !s.auto; this.autoBad.clear(); saveGame(s);
    bus.emit(EV.TOAST, s.auto ? (this.gathering() ? 'ออโต้: ตัดไม้/ขุดหินเอง' : 'ออโต้: ตีมอนเอง') : 'ปิดออโต้', s.auto ? '#9fffb0' : '#e8c872');
    bus.emit(EV.STATE_CHANGED);
  }
  /** returns the direction to walk this frame (or 0,0) and attacks / casts / gathers when in reach */
  autoStep(time: number): [number, number] {
    const s = S(), h = this.hero, d = derive(s);
    if (s.hp < d.maxHp * 0.35 && time > this.potT) {
      let it = s.inventory.find(i => i.id === 'hp_potion_l') ?? s.inventory.find(i => i.id === 'hp_potion');
      if (!it && vipActive(s) && !refused(act('autoPotion', {}))) it = s.inventory.find(i => i.id === 'hp_potion');   // VIP: auto-buy
      if (it) { const r = act('useItem', { uid: it.uid }); this.potT = time + 2500; if (r) this.combat.float(h.x, h.y - 44, `+${r.heal}`, '#7aff8a', 11); }
    }
    const bad = (o: object) => (this.autoBad.get(o) ?? 0) > time;
    const near = <T extends { x: number; y: number }>(list: T[]) => list.reduce<T | null>((b, q) => !b || Math.hypot(q.x - h.x, q.y - h.y) < Math.hypot(b.x - h.x, b.y - h.y) ? q : b, null);
    let tx: number, ty: number, reach: number, target: object;
    if (this.gathering()) {
      const n = near(this.nodes.filter(q => q.until <= this.time.now && !bad(q) && (!q.vein || q.vein.req <= s.level)));
      if (!n) return [0, 0];
      tx = n.x; ty = n.y + 14; reach = 16; target = n;
    } else {
      if (!this.stageN) { if (time > this.autoTipT) { this.autoTipT = time + 15000; bus.emit(EV.TOAST, 'ออโต้ตีมอนทำงานในแผนที่มอน — ออโต้เก็บทรัพยากรทำงานในป่าดงดิบ', '#e8c872'); } return [0, 0]; }
      const alive = this.combat.alive().filter(m => !bad(m));
      const foes = alive.filter(m => !m.animal);
      const m = near(foes.length ? foes : alive);
      if (!m) return [0, 0];
      const dist = Math.hypot(m.x - h.x, m.y - h.y);
      // skills: buffs/attacks when a foe is close, heal and shield only when hurt
      if (dist < 150) for (let i = 0; i < 3; i++) {
        const id = currentSkills(s)[i], sk = id ? SKILL_BY_ID[id] : null;
        if (!sk || (this.skillReady[id] ?? 0) > this.time.now || (s.mp ?? 0) < sk.mp) continue;
        if (sk.kind === 'heal' && s.hp > d.maxHp * 0.6) continue;
        if (sk.kind === 'shield' && s.hp > d.maxHp * 0.85) continue;
        if (sk.kind !== 'heal' && sk.kind !== 'shield' && sk.kind !== 'buff' && dist > (sk.kind === 'shot' || sk.kind === 'pierce' || sk.kind === 'rain' ? 150 : 60)) continue;
        this.castSkill(i); return [0, 0];
      }
      const ranged = ['hr4', 'hr5', 'hr6', 'hr7', 'hr8', 'hr9'].includes(this.F.key);
      tx = m.x; ty = m.y; reach = ranged ? 120 : 20 + m.m.size * 0.25; target = m;
    }
    if (target !== this.autoTarget) { this.autoTarget = target; this.autoStuck = { x: h.x, y: h.y, t: time }; }
    const dx = tx - h.x, dy = ty - h.y, dist = Math.hypot(dx, dy);
    if (dist <= reach) {
      this.dir = (Math.round((Math.PI / 2 - Math.atan2(dy, dx)) / (Math.PI / 4)) % 8 + 8) % 8;
      this.attack(); return [0, 0];
    }
    // stuck behind something for 1.5 s: try another target for a while
    if (Math.hypot(h.x - this.autoStuck.x, h.y - this.autoStuck.y) > 8) this.autoStuck = { x: h.x, y: h.y, t: time };
    else if (time - this.autoStuck.t > 1500) { this.autoBad.set(target, time + 8000); this.autoStuck.t = time; return [0, 0]; }
    const a0 = Math.atan2(dy, dx);
    for (const da of [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8]) {
      const a = a0 + da, nx = h.x + Math.cos(a) * 10, ny = h.y + Math.sin(a) * 10;
      if (!this.isBlocked(nx - 5, ny) && !this.isBlocked(nx + 5, ny)) return [Math.cos(a), Math.sin(a)];
    }
    return [dx / dist, dy / dist];
  }
  skillReady: Record<string, number> = {};
  /** skill button i (0-2): pay MP / check cooldown in systems, then play it */
  castSkill(i: number) {
    if (this.dead || this.ui?.panels.isOpen || this.selectUi) return;
    const s = S(), id = currentSkills(s)[i]; if (!id) return;
    const r = beginCast(s, id, this.time.now, this.skillReady);
    if (typeof r === 'string') { if (r === 'mp') bus.emit(EV.TOAST, 'MP ไม่พอ', '#8fc8ff'); return; }
    if (hasAnim(this.F.key, this.swing)) {
      this.attacking = true; playAnim(this.hero, this.F.key, this.swing, this.dir, false);
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
        const r = act('collect', { plot: i });
        if (r) { this.combat.float(P.x, P.y - 60, `+${r.amount} ${RES_NAMES[r.res]}`, '#9fffb0', 10); saveGame(s); bus.emit(EV.STATE_CHANGED); }
      }
    });
  }
  /** what the action button offers: talk to the elder / merchant / blacksmith, or open a plot */
  updateAction(time: number) {
    if (time - this.actT < 200) return;
    this.actT = time;
    const ui = this.ui; if (!ui) return;
    if (this.dead || ui.panels.isOpen) { ui.setAction(null); return; }
    const h = this.hero;
    let best: { d: number; label: string; cb: () => void } | null = null;
    const offer = (d: number, label: string, cb: () => void) => { if (!best || d < best.d) best = { d, label, cb }; };
    if (this.gathering()) { const nd = this.nearNode(); if (nd) offer(30, nd.kind === 'wood' ? '🪓 ตัดไม้' : '⛏ ขุดหิน', () => this.attack()); }
    if (this.stageN) { const b0 = best as { label: string; cb: () => void } | null; ui.setAction(b0?.label ?? null, b0?.cb); return; }
    for (const n of this.village?.npcs ?? []) {
      if (n.hidden) continue;
      const d = Math.hypot(n.sp.x - h.x, n.sp.y - h.y); if (d > 48) continue;
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
      if (this.stageN) { this.time.delayedCall(1200, () => { const s0 = S(); s0.hp = derive(s0).maxHp; saveGame(s0); showWait(); this.time.delayedCall(30, () => this.scene.restart({ stage: 0 })); }); return; }
      this.time.delayedCall(900, () => {
        h.setPosition(PLAZA.x, PLAZA.y + 40).setAngle(0).setAlpha(0).setVisible(true).clearTint();
        setIdle(h, this.F.key, 0);
        this.tweens.add({ targets: h, alpha: 1, duration: 500, onComplete: () => { this.dead = false; } });
        this.shadow.setAlpha(0.5);
      });
    });
  }

  /** Code-made death: white flash → knock back and topple → burst into the sprite's own pixels → a soul rises. */
  deathFx(sp: Phaser.GameObjects.Sprite, soul: number, done?: () => void) {
    sp.anims.stop();
    const back = this.dir >= 1 && this.dir <= 3 ? -1 : this.dir >= 5 && this.dir <= 7 ? 1 : (Math.random() < 0.5 ? -1 : 1);
    sp.setTintFill(0xffffff);
    this.time.delayedCall(70, () => sp.clearTint());
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
  // ---------- gathering (gathering outfit + axe / pickaxe) ----------
  nodes: { x: number; y: number; kind: 'wood' | 'stone'; im: Phaser.GameObjects.Image; hp: number; until: number; vein?: Vein }[] = [];
  gatherTipT = 0;
  addNode(im: Phaser.GameObjects.Image | null, x: number, y: number, kind: 'wood' | 'stone', vein?: Vein) { if (im) this.nodes.push({ x, y, kind, im, hp: vein?.rare ? 6 : 4, until: 0, vein }); }
  nearNode(r = 34) {
    const h = this.hero, now = this.time.now;
    let best: (typeof this.nodes)[number] | null = null, bd = r;
    for (const n of this.nodes) { if (n.until > now) continue; const d = Math.hypot(n.x - h.x, (n.y - h.y) * 1.3); if (d < bd) { bd = d; best = n; } }
    return best;
  }
  gathering() { return S().outfit === 'gather'; }
  gather(n: (typeof this.nodes)[number]) {
    if (n.vein && S().level < n.vein.req) { if (this.time.now > this.gatherTipT) { this.gatherTipT = this.time.now + 3000; bus.emit(EV.TOAST, `ต้องเลเวล ${n.vein.req} ถึงจะขุดแร่ที่นี่ได้`, '#ff8a6a'); } return; }
    const h = this.hero, anim = n.kind === 'wood' ? 'chop' : 'mine', key = this.F.key;
    this.dir = (Math.round((Math.PI / 2 - Math.atan2(n.y - h.y, n.x - h.x)) / (Math.PI / 4)) % 8 + 8) % 8;
    this.attacking = true;
    const done = () => {
      this.attacking = false; setIdle(h, key, this.dir);
      const s = S(), r = act('gather', { node: this.nodes.indexOf(n), kind: n.kind, pit: n.vein?.pit ?? -1, rare: n.vein?.rare, gold: n.vein?.gold });
      if (!refused(r)) this.tutGathered = true;
      if (refused(r)) { if (r.refused === 'level') bus.emit(EV.TOAST, `ต้องเลเวล ${n.vein?.req} ถึงจะขุดแร่ที่นี่ได้`, '#ff8a6a'); return; }
      if (r.amt) this.combat.float(n.x, n.y - 30, `${n.kind === 'wood' ? '🪵' : '🪨'}+${r.amt}`, '#ffd8a0', 10);
      if (r.ore) this.combat.float(n.x + 10, n.y - 42, `+${r.oreQty} ${itemDef(r.ore).name}`, '#c8e8ff', 9);
      if (r.gold) this.combat.float(n.x - 10, n.y - 52, `💰 +${r.gold}G`, '#ffd84a', 10);
      if (r.gem) { this.combat.vfx.star(n.x, n.y - 20, 0xff9cff, 1.6); this.combat.float(n.x, n.y - 62, `💎 ${itemDef(r.gem).name}!`, '#ff9cff', 12); bus.emit(EV.TOAST, `พบแร่หายาก! ${itemDef(r.gem).name}`, '#ff9cff'); saveGame(s); }
      this.tweens.add({ targets: n.im, x: n.im.x + 2, duration: 40, yoyo: true, repeat: 2 });
      n.hp--;
      if (n.hp <= 0) { const t = n.vein?.rare ? 240000 : this.wild ? 45000 : 90000; n.until = this.time.now + t; n.hp = n.vein?.rare ? 6 : 4; n.im.setAlpha(0.45); this.time.delayedCall(t, () => n.im.active && n.im.setAlpha(1)); }
      bus.emit(EV.STATE_CHANGED);
    };
    if (playAnim(h, key, anim, this.dir, false) || playAnim(h, key, 'attack', this.dir, false)) h.once('animationcomplete', done);
    else this.time.delayedCall(500, done);
  }

  // ---------- tutorial: first five minutes ----------
  tutDist = 0; tutLast = { x: 0, y: 0 }; tutAttacked = false; tutGathered = false; tutT = 0;
  updateTutorial(time: number) {
    const s = S() as ReturnType<typeof S> & { tut?: number; tutBase?: number; tdKills?: number; tdq?: { i: number } };
    if (!tutActive(s) || time - this.tutT < 300) return; this.tutT = time;
    const h = this.hero; this.tutDist += Math.hypot(h.x - this.tutLast.x, h.y - this.tutLast.y); this.tutLast = { x: h.x, y: h.y };
    const st = tutStep(s), mon = this.stageN >= 1 && this.stageN <= 50;
    const done = [this.tutDist > 120, this.tutAttacked, mon, mon && (s.tdKills ?? 0) - (s.tutBase ?? 0) >= 3, (s.tdq?.i ?? 0) >= 1, !!s.auto, !this.stageN, this.wild, this.tutGathered][st];
    if (!done) return;
    s.tut = st + 1;
    if (s.tut === 3) s.tutBase = s.tdKills ?? 0;
    this.tutDist = 0; this.tutAttacked = false;
    if (s.tut >= TUT_STEPS.length) { if (!refused(act('tutorialDone', {}))) bus.emit(EV.TOAST, '🎓 จบการสอนเล่น! ได้รับ 💰300 + ยา 5 + ม้วนกลับ 2', '#ffd84a'); this.levelUpFx(); }
    else { sfx.pickup(); bus.emit(EV.TOAST, '✔ ' + TUT_STEPS[st], '#9fffb0'); }
    saveGame(s); bus.emit(EV.STATE_CHANGED);
  }
  /** where the tutorial wants the hero to go (the guide arrow points there) */
  tutTarget(): { x: number; y: number; label: string } | null {
    const s = S(); if (!tutActive(s)) return null;
    const st = tutStep(s), por = (to: number | 'select') => this.portals.find(p => p.to === to);
    const p = st === 2 ? por('select') : st === 6 ? por(0) : st === 7 ? por(WILD) : null;
    if (p) return { x: p.x, y: p.y, label: st === 2 ? 'ประตูแผนที่' : st === 6 ? 'กลับหมู่บ้าน' : 'ป่าดงดิบ' };
    if (st === 3) { const m = this.combat.nearest(2000).find(q => !q.animal); if (m) return { x: m.x, y: m.y, label: m.m.name }; }
    if (st === 8) { const n = this.nearNode(3000); if (n) return { x: n.x, y: n.y, label: n.kind === 'wood' ? 'ต้นไม้' : 'ก้อนหิน' }; }
    return null;
  }
  tutText() { const s = S(); return tutActive(s) ? `🎓 ${tutStep(s) + 1}/${TUT_STEPS.length}  ${TUT_STEPS[tutStep(s)]}` : ''; }
  titleTx!: Phaser.GameObjects.Text;
  stunUntil = 0;
  /** animal kick: pushed back a little and dazed (can't move or swing) */
  stunHero(ms: number, fx: number, fy: number) {
    const h = this.hero, a = Math.atan2(h.y - fy, h.x - fx);
    for (let i = 0; i < 18; i += 2) { const nx = h.x + Math.cos(a) * 2, ny = h.y + Math.sin(a) * 2; if (this.isBlocked(nx, ny)) break; h.x = nx; h.y = ny; }
    this.stunUntil = this.time.now + ms; this.attacking = false; setIdle(h, this.F.key, this.dir);
    h.setTintFill(0xfff0a0); this.time.delayedCall(90, () => h.clearTint());
    this.combat.float(h.x, h.y - 46, '💫 มึน!', '#ffe080', 10);
    this.combat.vfx.dust?.(h.x, h.y);
  }
  attack() {
    if (this.time.now < this.stunUntil) return;
    this.tutAttacked = true;
    if (this.dead || this.attacking || this.ui?.panels.isOpen || this.selectUi) return;
    const node = this.nearNode();
    if (node && this.gathering()) { this.gather(node); return; }
    if (node && this.time.now > this.gatherTipT && !this.combat.nearest(90).length) { this.gatherTipT = this.time.now + 20000; bus.emit(EV.TOAST, 'อยากตัดไม้/ขุดหิน? สวมชุดหาทรัพยากรที่ปุ่ม 👕 ชุด ด้านบน', '#ffd8a0'); }
    if (!hasAnim(this.F.key, this.swing)) return;
    this.attacking = true;
    const h = this.hero;
    const F = this.F;
    playAnim(h, F.key, this.swing, this.dir, false);
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
    this.updateTutorial(time);
    this.updatePlots(time); this.updateAction(time); this.updateGuide(time); this.updateOcclusion(time);
    if (!this.stageN) { const h = isHungry(s1); if (h && !this.hungryWarned) bus.emit(EV.TOAST, 'ชาวบ้านหิว! อาหารหมดคลัง อาคารผลิตได้แค่ครึ่งเดียว — ไปล่าสัตว์ที่ป่าดงดิบ', '#ff8a6a'); this.hungryWarned = h; }
    if (this.ui?.panels.isOpen) { this.resetJoy(); }
    const k = this.keys;
    if (k && !this.ui?.panels.isOpen) { mx = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0); my = (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0); }
    const R = this.scale.height / 9 * uiOpt(S()).btn;
    if (this.joy.id >= 0) {
      const l = Math.hypot(this.joy.dx, this.joy.dy);
      if (l > 6) { mx = this.joy.dx / l; my = this.joy.dy / l; }
    }
    if (mx || my) this.manualT = time;
    if (S().auto && !mx && !my && !this.dead && !this.attacking && !this.ui?.panels.isOpen && !this.selectUi) [mx, my] = this.autoStep(time);
    const len = Math.hypot(mx, my);
    const h = this.hero;
    if (this.dead) { /* dying */ } else if (time < this.stunUntil) { /* dazed */ } else if (this.attacking) { /* finish the swing first */ } else if (len > 0) {
      mx /= len; my /= len;
      const sp = 92 * dt / 1000;
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
    this.crowd?.update(time, dt);
    if (this.wild && time > this.onlineT) { this.onlineT = time + 30000; const r = act('wildRooms', { pick: this.room }); this.online = r.rooms[this.room - 1].count; }
    else this.village?.update(time, dt);
    // a portal only fires when the hero walks onto it: after closing the stage select (or arriving) they must step off first
    if (!this.portalArmed && this.portals.every(p => Math.hypot(p.x - h.x, p.y - h.y) > 30)) this.portalArmed = true;
    for (const p of this.portals) if (!this.dead && this.portalArmed && (!S().auto || time - this.manualT < 500) && Math.hypot(p.x - h.x, p.y - h.y) < 16 && time > this.portalCool) {
      this.portalArmed = false;
      if (p.to === 'select') this.stageSelect();
      else if (p.to === WILD) { const u = this.ui; u?.panels.open('rooms'); this.portalCool = time + 600; }
      else if (p.to === 0) { this.portalCool = time + 99999; this.cameras.main.fadeOut(250); this.time.delayedCall(260, () => showWait()); this.time.delayedCall(300, () => this.scene.restart({ stage: 0 })); }
      else { this.portalCool = time + 2500; this.enterStage(p.to as number); }
    }
    if (time - this.hudT > 250) {
      this.hudT = time; const s0 = S(), d0 = derive(s0);
      if (time - this.regenT > 2000) { this.regenT = time; s0.hp = Math.min(d0.maxHp, s0.hp + Math.ceil(d0.maxHp * (this.wild ? 0.03 : this.stageN ? 0.01 : 0.05 * (1 + (s0.buildings.find(b => b.type === 'home')?.level ?? 0) * 0.5)))); s0.mp = Math.min(d0.maxMp, (s0.mp ?? 0) + Math.ceil(d0.maxMp * (this.stageN ? 0.04 : 0.1))); }
      const st = this.stageN && !this.wild ? STAGES[this.stageN - 1] : null;
      this.label.setText(`${st ? `ด่าน ${st.n} ${st.land.name} (Lv${st.level})` : 'หมู่บ้าน'} • Lv${s0.level} • HP ${Math.round(s0.hp)}/${d0.maxHp} • ${s0.gold}G • ร่าง ${this.F.name}`);
    }
    if (!this.dead) this.shadow.setPosition(h.x, h.y - 1);
    { const t = titleOf(S()); this.titleTx.setText(t ? `「${t}」` : '').setPosition(h.x, h.y - 46).setVisible(!this.dead); }
    for (const [i, l] of this.lamps.entries()) l.setAlpha((0.75 + Math.sin(time / 180 + i * 1.7) * 0.12) * (l.getData('base') ?? 1));
    this.updateDayNight(time);
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
