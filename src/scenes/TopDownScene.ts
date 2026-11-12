// Prototype of the new art direction: top-down 3/4 pixel art, muted dark-forest tone.
// Ground is painted per pixel from distance fields (grass, dirt road, cobble plaza, river, pond); props are code-drawn
// placeholders until the PixelLab/ChatGPT art arrives. The hero is the PixelLab villager (8 directions).
// Open with ?td in the URL.
import Phaser from 'phaser';
import { Combat, MONSTER_PFX } from '../world/tdCombat';
import { STAGES, WILD, PITS, DUNGEON, isDungeon, stageOf, DUNGEON_SECS, DUNGEON_WAVES } from '../world/stages';
import { itemDef as idef } from '../data/items';
import { SETS } from '../data/sets';
import { Crowd } from '../world/crowd';
import { sfx } from '../audio/sfx';
import { playSkill } from '../audio/skillSfx';
import { PathGrid } from '../world/pathfind';
import { ensurePfx, pfxFor } from '../world/pfx';
import { act, refused } from '../net/client';
import { TUT_STEPS, tutStep, tutActive } from '../systems/progress';
import { titleOf } from '../data/achievements';
import { energyLeft, resCap } from '../systems/economy';
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
import { stageFood, isHungry, heroHungry, supplyMinutes, SUPPLY_MINS } from '../systems/supplies';
import { potOf, pickPotion, POT_CD } from '../systems/potions';
import { accountName } from '../net/cloud';
import { formName } from '../data/classes';
import { bus, EV } from '../core/events';
import { tick as settleTick, buildingAt, underConstruction, ensureNpcVillage } from '../systems/settlement';
import { BUILDINGS, RES_NAMES, type BuildingId } from '../data/buildings';
import type { TdUIScene } from './TdUIScene';
import { CH, preloadChars, createCharAnims, setIdle, playAnim, hasAnim, hitMs, formKeyOf } from '../world/chars';
import objMeta from '../assets/td/obj/objs.json';
import { GuildTown, gvTerrain, gvBridges } from '../world/guildTown';
import { pxShadow } from '../world/pxShadow';
import * as GV from '../world/villageLayout';
import { ROOMS, RW, RH, DOOR, ROOM_SET, paintRoom, roomFloor, roomOf, type HotAct, type RoomKind } from '../world/interiors';
const ROOM_PNG = import.meta.glob('../assets/td/room/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const ROOM_META = import.meta.glob('../assets/td/room/*.json', { eager: true, import: 'default' }) as Record<string, { corners: string[] }>;
const baseName = (p: string) => p.split('/').pop()!.replace(/\.(png|json)$/, '');
import { guildOf, homeOf, meOf } from '../systems/guild';
import { GUILD_BLD, GUILD_UNLOCK_LV, type GuildBld } from '../data/guild';
import { preloadFx2, createFx2Anims, fx2 } from '../world/fx2';
import { RaidBattle, type RaidStart } from '../world/raid';
import { ambience } from '../world/ambience';
import { DefenseBattle } from '../world/defense';
import { Hunters } from '../world/hunters';
import { hpBar } from '../world/hpBar';
import { makeRuin } from '../world/ruin';
import { loadAtlas, unpackAtlas } from '../world/atlas';
import { preloadMounts, createMountAnims, Riding, mountReady } from '../world/mount';
import { mountOn } from '../systems/mounts';
import { MOUNTS } from '../data/mounts';
import { WC, syncWar, newFeed, warLine } from '../world/warClient';
import { rivalStructs } from '../systems/guild';
import { testBots } from '../core/testBots';
/** the raid the guild window just started (the scene restarts into the rival village) */
let RAID_DATA: RaidStart | null = null;
/** the bounty slot already announced (survives scene restarts) */
let BOUNTY_SEEN = -1;
const VFX_FILES = import.meta.glob('../assets/vfx/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
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
/** NPC houses that are always there (not plots) */
const HOUSES: [string, number, number][] = [['townhall_1', 345, 322], ['house_1', 846, 300], ['house_0', 1090, 330], ['house_2', 1180, 760]];
/** organic stone yard under / in front of every building (jagged edge from noise) */
function yardAt(x: number, y: number) {
  const n = fbm(x / 38, y / 38) - 0.5;
  for (const P of [...PLOTS, ...HOUSES.map(([, hx, hy]) => ({ x: hx, y: hy }))]) { const d = Math.hypot((x - P.x) / 104, (y - P.y - 8) / 50); if (d + n * 0.9 < 1) return true; }
  return false;
}
const PLOT_OF: Record<string, number> = { forge: 0, barn: 1, lumber: 2, tavern: 3, kitchen: 4, market: 5, warehouse: 6, quarry: 7, tower: 8 };
export const HOME_PLOT = 9;
/** guild village plot -> its building */
const GUILD_BLD_AT: Record<number, GuildBld> = Object.fromEntries(Object.entries(GV.PLOT_OF).map(([t, p]) => [p, t as GuildBld]));
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
const POND = { x: 200, y: 845, r: 70 };
const BRIDGE = { y0: roadY(930) - 20, y1: roadY(930) + 20 };
/** south road: forge -> second bridge -> the east district */
const road2Y = (x: number) => 712 + Math.sin(x / 90) * 10;
const BRIDGE2 = { y0: road2Y(930) - 20, y1: road2Y(930) + 20 };
const onBridge = (y: number) => (y > BRIDGE.y0 && y < BRIDGE.y1) || (y > BRIDGE2.y0 && y < BRIDGE2.y1);
function surface(x: number, y: number) {
  const n = (fbm(x / 22, y / 22) - 0.5) * 10;
  const dr = Math.abs(x - riverX(y));
  if (dr < 26 + n * 0.6) return onBridge(y) && dr < 40 ? 'bridge' : 'water';
  if (dr < 31 + n) return onBridge(y) ? 'bridge' : 'mud';
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

/** queue the files a TopDown scene waits for, on any scene's loader (textures are shared by the whole game, so the title
 *  screen can fetch the village while the player is still on it — director: 'please wait' after start was too long).
 *  form = the player's own hero form (null: every form — guild village, test bots, no state yet) */
export function queueTd(sc: Phaser.Scene, o: { gv: boolean; stageN: number; st: ReturnType<typeof stageOf> | null; boss: boolean; mount: boolean; form: string | null }) {
  for (const [p, u] of Object.entries(VFX_FILES)) { const k = 'px_' + p.split('/').pop()!.replace('.png', ''); if (!sc.textures.exists(k)) sc.load.image(k, u); }   // PixelLab skill effects
  loadAtlas(sc, 'obj');   // every map object in one page (tools/pack_atlas.py)
  preloadFx2(sc, o.stageN || o.gv ? 'first' : 'village');   // guild village: raids / defence fight at once if (o.mount) preloadMounts(sc);
  if (o.gv) for (const [p, u] of Object.entries(ROOM_PNG)) if (!sc.textures.exists(baseName(p))) sc.load.image(baseName(p), u);
  const tiles: [string, string][] = [['td_tl1', tl1Wang], ['td_tl2', tl2Wang], ['td_tl3', tl3Wang], ['td_ft2', ft2Wang], ['td_ft3', ft3Wang], ['td_tl5', tl5Wang], ['td_tl6', tl6Wang], ['td_tl7', tl7Wang], ['td_tl8', tl8Wang]];
  for (const [k, u] of tiles) if (!sc.textures.exists(k)) sc.load.image(k, u);
  // only the characters this scene shows: hero forms always; villagers + animals in the village;
  // the land's monsters, its boss (boss stages) and the wild game in a stage
  const all = ['hero', 'heroF', ...Array.from({ length: 12 }, (_, i) => 'hr' + (i + 1))];
  const heroes = o.form ? [...new Set(['hero', 'hg', o.form])] : all;
  const keys = o.stageN === WILD ? [...heroes, 'hg', 'mo16', 'mo17'] : o.st ? [...heroes, ...o.st.land.mobs.map(m => m.key), ...(o.boss ? [o.st.land.boss.key] : [])]
    : [...heroes, ...Array.from({ length: 10 }, (_, i) => 'np' + (i + 1)), ...Array.from({ length: 5 }, (_, i) => 'an' + (i + 1))];
  preloadChars(sc, keys);
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
      const rx = this.gv ? GV.riverX : riverX;
      const inRiver = Math.abs(x - rx(y)) < 40;
      if (!inRiver) return { dx: 0, dy: 0 };
      const dy = 1, dx = (rx(y + 1) - rx(y));
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
    const st0 = runtime.state;   // (not there yet on the very first boot)
    queueTd(this, { gv: this.gv, stageN: this.stageN, st: this.stageN && this.stageN !== WILD ? this.st : null, boss: !!(this.st?.boss || this.dungeon),
      mount: !!(st0 && mountOn(st0)), form: this.gv || testBots.n || !st0 ? null : this.F.key });
  }

  /** what the scene did not wait for: the other hero forms, the remaining effects, mounts and riding poses — loaded behind
   *  the running game (director: shorter 'please wait'); animations are made as soon as they arrive */
  loadLater() {
    if (!this.sys.isActive()) return;
    preloadFx2(this, 'all'); preloadMounts(this);   // ('all' skips what is already here)
    preloadChars(this, ['hero', 'heroF', ...Array.from({ length: 12 }, (_, i) => 'hr' + (i + 1))]);
    if (!this.load.list.size) return;
    this.load.once(Phaser.Loader.Events.COMPLETE, () => { if (!this.sys.isActive()) return; createFx2Anims(this); createMountAnims(this); createCharAnims(this); });
    this.load.start();
  }
  stageN = 0;
  hudT = 0;
  regenT = 0;
  combat!: Combat;
  village?: Village;
  portals: { x: number; y: number; to: number | 'select' | 'starter' | 'guild' | 'out' | 'leave'; label: Phaser.GameObjects.Text }[] = [];
  get wild() { return this.stageN === WILD; }
  get dungeon() { return isDungeon(this.stageN); }
  /** the map's stage data (monster maps, the dungeon, the Deepwild) */
  get st() { return stageOf(this.stageN, runtime.state?.level ?? 1); }
  room = 1; roomPick?: number;
  /** the guild village (stage 0 once the player is in a guild; data.guild = false visits the starter village) */
  gv = false;
  /** inside a building of the guild village: its plot (-1 = outside) */
  inside = -1;
  arriveAt = -1;
  town?: GuildTown;
  raid?: RaidBattle;
  defense?: DefenseBattle;
  defendNext = false;
  hunters?: Hunters;
  heroBar?: Phaser.GameObjects.Graphics; heroTag?: Phaser.GameObjects.Text;
  heroRing?: Phaser.GameObjects.Sprite | null;
  /** riding a mount (world/mount.ts); fighting / gathering gets off for a moment */
  riding?: Riding; rideBlockT = 0; heroMoving = false;
  raidMode = false;
  hot: { x: number; y: number; label: string; act: HotAct }[] = [];
  get roomKind(): RoomKind | null { if (this.inside < 0) return null; if (this.inside >= 10) return 'house'; const t = GUILD_BLD_AT[this.inside]; return t ? roomOf(t) : null; }
  warSide: null | 'home' | 'enemy' = null; warT = 0; warShown = false;
  init(data: { stage?: number; room?: number; guild?: boolean; inside?: number; at?: number; raid?: boolean; war?: 'home' | 'enemy' }) {
    this.stageN = data?.stage ?? 0; this.roomPick = data?.room; MW = this.wild ? 2560 : this.stageN ? 2048 : 1280; MH = this.wild ? 1792 : this.stageN ? 1408 : 1024;
    const st0 = runtime.state;
    this.gv = !this.stageN && (data?.guild ?? !!(st0 && guildOf(st0)));
    this.inside = this.gv ? data?.inside ?? -1 : -1; this.arriveAt = data?.at ?? -1;
    this.warSide = this.gv && data?.war && WC.war && !WC.war.over ? data.war : null; WC.side = this.warSide; this.warShown = false; this.warT = 0;
    if (this.warSide === 'enemy' && WC.war) RAID_DATA = { rival: WC.war.rival, structs: rivalStructs(WC.war.rival), secs: Math.max(1, Math.round((WC.war.end - Date.now()) / 1000)), war: true };
    this.raidMode = this.gv && (!!(data as { raid?: boolean })?.raid || this.warSide === 'enemy') && !!RAID_DATA;
    this.defendNext = this.gv && !!(data as { defend?: boolean })?.defend; this.defense = undefined;
    if (this.raidMode) this.inside = -1;
    if (this.gv) { MW = this.inside >= 0 ? RW : GV.VW; MH = this.inside >= 0 ? RH : GV.VH; }
    if (this.dungeon) { MW = 1536; MH = 1024; }
    if (this.wild) this.makeWild(); else if (this.dungeon) this.makeTrails((this.stageN - DUNGEON) * 10 + 2); else if (this.stageN) this.makeTrails(this.stageN);
  }

  create() {
    unpackAtlas(this, 'obj', 'o_');   // map objects back under their own keys before anything is placed
    if (!runtime.state) runtime.state = loadGame() ?? startNewGame();
    (window as unknown as { __tdS: typeof S }).__tdS = S;
    this.selectUi = null; this.portalCool = this.time.now + 1500; this.makingUi = false; this.portalArmed = false;
    this.crowd = undefined; this.grid = undefined; this.path = null; this.lamps = []; this.fires = []; this.nodes = []; this.casts = []; this.tall = []; this.faded.clear(); this.dayT = -1e9; this.reserved = new Set(); this.dead = false; this.attacking = false; this.portals = []; this.skillReady = {};
    this.combat = new Combat(this as never);
    this.blocked = new Uint8Array((MW / CELL) * (MH / CELL));
    this.paintGround();
    this.animateWater();
    this.makePropTextures();
    createCharAnims(this);
    this.shadowTex();
    const sp0 = this.spawnPoint();
    this.shadow = this.contact(sp0.x, sp0.y, 24, 9, 0.5);
    this.time.delayedCall(250, () => sfx.door());   // arriving on a map
    this.hero = this.add.sprite(sp0.x, sp0.y, 'c_hero_idle', 0); setIdle(this.hero, this.F.key, this.inside >= 0 ? 4 : 0);
    createFx2Anims(this); createMountAnims(this);
    this.time.delayedCall(300, () => this.loadLater());
    this.town = this.gv && this.inside < 0 ? new GuildTown(this as never) : undefined; this.hot = [];
    { const s0 = S(), d0 = derive(s0); if (s0.hp <= 0) s0.hp = d0.maxHp; }
    this.titleTx = this.add.text(0, 0, '', { fontFamily: 'sans-serif', fontSize: '7px', color: '#ffd84a', stroke: '#1a1208', strokeThickness: 3, resolution: 6 }).setOrigin(0.5).setDepth(99995);
    // register the map with the server BEFORE anything spawns (entering clears the server's spawn list)
    if (refused(act('enterMap', { n: this.stageN }))) { bus.emit(EV.TOAST, 'เซิร์ฟปฏิเสธการเข้าแผนที่', '#ff8a6a'); this.time.delayedCall(50, () => this.scene.restart({ stage: 0 })); }
    ensurePfx(this, pfxFor(currentSkills(S())));   // skill effects for the current form (loaded in the background)
    if (this.stageN && !this.wild) ensurePfx(this, MONSTER_PFX(this.st.land.id));   // monsters / boss attacking the hero
    this.placeProps();
    // return scroll: back to the village from any map
    const recall = () => { if (!this.stageN || this.dead) return; this.portalCool = this.time.now + 99999; fx2(this, 'fx_recall', this.hero.x, this.hero.y + 6, this.hero.y + 1); sfx.cast(); this.time.delayedCall(650, () => this.cameras.main.fadeOut(250)); this.time.delayedCall(910, () => showWait()); this.time.delayedCall(950, () => this.scene.restart({ stage: 0 })); };
    bus.on('td:recall', recall); this.events.once('shutdown', () => bus.off('td:recall', recall));
    const onFx = (k: string) => fx2(this, k, this.hero.x, this.hero.y - 18, 99993, 1);
    bus.on('td:fx', onFx); this.events.once('shutdown', () => bus.off('td:fx', onFx));
    this.village = this.stageN || this.gv ? undefined : new Village(this, MW, MH);
    const home = () => { this.portalCool = this.time.now + 99999; this.cameras.main.fadeOut(250); this.time.delayedCall(260, () => showWait()); this.time.delayedCall(300, () => this.scene.restart({ stage: 0, guild: true })); };
    bus.on('td:guildHome', home); this.events.once('shutdown', () => bus.off('td:guildHome', home));
    this.events.once('shutdown', () => { if (this.stageN && !this.wild && !this.dungeon) act('supplyTick', {}); });   // the last minutes on the map are eaten too
    const goRaid = (r: RaidStart) => { RAID_DATA = r; this.portalCool = this.time.now + 99999; sfx.door(); this.cameras.main.fadeOut(300); this.time.delayedCall(310, () => showWait()); this.time.delayedCall(340, () => this.scene.restart({ stage: 0, guild: true, raid: true })); };
    bus.on('td:raid', goRaid); this.events.once('shutdown', () => bus.off('td:raid', goRaid));
    const goDefend = () => {
      if (this.town && this.inside < 0 && !this.raid) { if (!this.defense) { this.defense = new DefenseBattle(this as never, this.town); this.defense.start(); } return; }
      this.portalCool = this.time.now + 99999; this.cameras.main.fadeOut(250); this.time.delayedCall(260, () => showWait()); this.time.delayedCall(300, () => this.scene.restart({ stage: 0, guild: true, defend: true }));
    };
    bus.on('td:defend', goDefend); this.events.once('shutdown', () => bus.off('td:defend', goDefend));
    // guild war: watch / fight on either side (the server runs the war; switching sides reloads the village)
    const goWar = (side?: 'home' | 'enemy') => {
      const w = WC.war ?? syncWar(); if (!w || w.over) return;
      const to = side ?? (this.warSide === 'enemy' ? 'home' : 'enemy');
      this.portalCool = this.time.now + 99999; sfx.door(); this.cameras.main.fadeOut(250); this.time.delayedCall(260, () => showWait());
      this.time.delayedCall(300, () => this.scene.restart({ stage: 0, guild: true, war: to }));
    };
    const swap = () => goWar(); bus.on('td:war', goWar); bus.on('td:warSwap', swap);
    this.events.once('shutdown', () => { bus.off('td:war', goWar); bus.off('td:warSwap', swap); });
    const goStage = (n: number) => { if (this.stageN === n) { bus.emit(EV.TOAST, 'คุณอยู่ในแผนที่นี้แล้ว — ตามหาบอส 👑', '#ffb04a'); return; } this.enterStage(n); };
    bus.on('td:goStage', goStage); this.events.once('shutdown', () => bus.off('td:goStage', goStage));
    const onBots = () => {
      if (this.wild) { this.portalCool = this.time.now + 99999; this.scene.restart({ stage: WILD, room: this.room }); return; }
      if (!this.stageN || this.wild) { bus.emit(EV.TOAST, 'บอทใช้ได้ในแผนที่มอนและป่าดงดิบ', '#ffd8a0'); return; }
      this.joinRoom();
    };
    bus.on('td:bots', onBots); this.events.once('shutdown', () => bus.off('td:bots', onBots));
    this.hunters = undefined;
    this.heroBar = this.add.graphics().setDepth(99991);
    { const nm = accountName(); if (nm && S().name !== nm) { S().name = nm; saveGame(S()); } }   // the name chosen on the server
    this.heroTag = this.add.text(0, 0, S().name ?? '', { fontFamily: 'sans-serif', fontSize: '7px', color: '#ffe7a0', stroke: '#1a1006', strokeThickness: 3, resolution: 6 }).setOrigin(0.5, 1).setDepth(99991);
    this.riding = undefined; this.rideBlockT = 0;
    this.heroRing = fx2(this, 'fx_ring_hero', this.hero.x, this.hero.y, this.hero.y - 3, 0.42)?.setOrigin(0.5, 0.5).setAlpha(0.7).setVisible(false);
    if (this.stageN && !this.wild && !this.dungeon) this.time.delayedCall(300, () => this.joinRoom());
    { const hm = homeOf(S()); if (hm.sleptAt && this.roomKind !== 'house') { const r = act('wake', {}); if (r.gained > 0) this.time.delayedCall(600, () => bus.emit(EV.TOAST, `🛏 ตื่นแล้ว! พลังพักผ่อน +${r.gained} (มี ${r.rest}) — ล่ามอนได้ EXP เพิ่ม`, '#9ad8ff')); } }
    this.castShadow(this.hero, true);
    if (this.village) { populateVillage(this.village, roadY); for (const n of this.village.npcs) this.castShadow(n.sp, true); }
    this.plotViews = []; this.heroKeyNow = this.F.key;
    if (this.wild) { const r = act('wildRooms', { bots: testBots.n }); this.room = r.room; this.online = r.players; this.onlineT = this.time.now + 30000; }
    if (!this.stageN && !this.gv) { ensureNpcVillage(S(), PLOT_OF, HOME_PLOT); this.renderPlots(); }
    if (this.raidMode && RAID_DATA) {
      this.raid = new RaidBattle(this as never, RAID_DATA); RAID_DATA = null; this.raid.build();
      if (this.raid.data.war && WC.war) { this.raid.applyWar(WC.war, true); bus.emit(EV.TOAST, `⚔ หมู่บ้าน ${this.raid.data.rival.name}: กองทัพเรากำลังบุก! ลงไปช่วยตีอาคารได้เลย`, '#ffd84a'); }
      else bus.emit(EV.TOAST, `⚔ บุกหมู่บ้าน ${this.raid.data.rival.name}! ทำลายอาคาร/ป้อมใน ${this.raid.data.secs / 60} นาที`, '#ffd84a');
    }
    else {
      this.raid = undefined;
      if (this.town) { this.town.render(); this.town.sync(); if (this.defendNext) this.time.delayedCall(800, () => bus.emit('td:defend')); }
      if (this.town && this.warSide === 'home' && WC.war) { const w = WC.war; this.time.delayedCall(400, () => { if (this.town && !this.defense) { this.defense = new DefenseBattle(this as never, this.town, w); this.defense.start(); } }); }
    }
    if (!this.scene.isActive('TdUI')) this.scene.launch('TdUI'); else this.scene.get('TdUI').scene.restart();
    this.scene.bringToTop('TdUI');
    if (!this.stageN && !this.gv) {
      this.addPortal(PLAZA.x + 6, 26, 'select', 'ประตูแผนที่ ▲'); this.addPortal(70, roadY(70), WILD, '◀ ป่าดงดิบ');
      if (S().level >= GUILD_UNLOCK_LV || guildOf(S())) this.addPortal(MW - 40, roadY(MW - 40), 'guild', guildOf(S()) ? 'หมู่บ้านกิลด์ ▶' : '🏛 กิลด์ ▶');
    }
    if (this.raid) this.addPortal(GV.SOUTH_GATE.x, GV.VH - 22, 'leave', '🏳 ถอนทัพ ▼');
    else if (this.town) { this.addPortal(GV.NORTH_GATE.x, 30, 'select', 'ประตูแผนที่ ▲'); this.addPortal(GV.WEST_EXIT.x + 6, GV.WEST_EXIT.y, WILD, '◀ ป่าดงดิบ'); this.addPortal(GV.SOUTH_GATE.x, GV.VH - 22, 'starter', 'หมู่บ้านเริ่มต้น ▼'); }
    if (this.inside >= 0) this.addPortal(DOOR.x, DOOR.y, 'out', 'ออกไปข้างนอก ▼');

    const cam = this.cameras.main;
    cam.postFX?.clear(); this.dayFx = null;
    cam.setBounds(0, 0, MW, MH).setBackgroundColor(this.inside >= 0 ? '#0b0d0c' : '#1b2420').startFollow(this.hero, true, 0.18, 0.18).setRoundPixels(true);
    const zoom = () => {
      cam.setZoom(Math.max(1.5, Math.round(this.scale.height / 480 * 2) / 2));
      if (this.inside >= 0) {   // a room smaller than the screen sits in the middle
        const vw = this.scale.width / cam.zoom, vh = this.scale.height / cam.zoom;
        cam.setBounds(Math.min(0, (MW - vw) / 2), Math.min(0, (MH - vh) / 2), Math.max(MW, vw), Math.max(MH, vh));
      }
    };
    zoom(); this.scale.on('resize', zoom);

    this.addOverlay();
    ambience(this, this.inside >= 0 ? 'room' : this.stageN && !this.wild ? this.st.land.ground : this.wild ? 'forest' : 'village');
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

  /** where the hero appears: a room's door, the door of the building just left, the guild plaza, the starter plaza */
  spawnPoint() {
    if (this.inside >= 0) return { x: DOOR.x, y: DOOR.y - 26 };
    if (this.raidMode) return { x: GV.SOUTH_GATE.x, y: GV.SOUTH_GATE.y - 40 };
    if (this.gv) { if (this.arriveAt >= 0) { const d = GV.doorOf(this.arriveAt); return { x: d.x, y: d.y + 22 }; } return GV.VILLAGE_SPAWN; }
    return { x: PLAZA.x, y: PLAZA.y + 40 };
  }
  /** a room of the guild village: floor, walls and door drawn in code (src/world/interiors.ts) */
  paintRoom() {
    const set = ROOM_SET[this.roomKind ?? 'hall'], meta = Object.entries(ROOM_META).find(([p]) => baseName(p) === set)?.[1];
    const cv = document.createElement('canvas'); cv.width = MW; cv.height = MH;
    if (meta && this.textures.exists(set)) paintRoom(cv.getContext('2d')!, this.textures.get(set).getSourceImage() as HTMLImageElement, meta.corners, ROOMS[this.roomKind ?? 'hall'].win);
    this.surf = new Array(MW * MH);
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) { const ok = roomFloor(x, y); this.surf[y * MW + x] = ok ? 'cobble' : 'edge'; if (!ok) this.block(x, y); }
    if (this.textures.exists('td_ground')) this.textures.remove('td_ground');
    this.textures.addCanvas('td_ground', cv);
    this.add.image(0, 0, 'td_ground').setOrigin(0).setDepth(0);
  }
  /** the furniture of the room; the pieces you can use become hotspots for the action button */
  placeRoom() {
    const kind = this.roomKind; if (!kind) return;
    const g = guildOf(S());
    for (const f of ROOMS[kind].furn) {
      const flat = f.k === 'fu_rug';
      const im = flat ? this.add.image(f.x, f.y, 'o_' + f.k).setOrigin(0.5, 0.5).setDepth(1.5).setScale(f.sc ?? 1) : this.obj(f.k, f.x, f.y, 0.8, 6, false, f.sc ?? 1);
      if (im && !flat) this.contact(f.x, f.y - 1, Math.max(12, im.displayWidth * 0.8), 7, 0.4);   // indoors: a soft contact shadow only (no sun)
      if (!im) continue;
      if (f.act && f.label) this.hot.push({ x: f.x, y: f.y + 10, label: f.label, act: f.act });
    }
    // warm light from the fireplaces / furnace, a brazier in the hall
    for (const f of ROOMS[kind].furn) if (['fu_fireplace', 'fu_furnace', 'fu_cauldron'].includes(f.k)) this.lamps.push(this.add.image(f.x, f.y - 20, 'td_glow').setBlendMode(Phaser.BlendModes.ADD).setDepth(99990).setScale(1.6));
    if (kind === 'hall') for (const x of [40, MW - 40]) fx2(this, 'fx_brazier', x, 140, 140);
    if (kind === 'barn') for (const [k, x, y] of [['an3', 200, 200], ['an2', 270, 250], ['an5', 150, 270], ['an4', 320, 270]] as [string, number, number][]) if (this.textures.exists(`c_${k}_idle`)) { const a = this.add.sprite(x, y, `c_${k}_idle`).setDepth(y); setIdle(a, k, Math.floor(Math.random() * 8)); this.contact(x, y, 22, 8, 0.4); }
    const t = this.add.text(MW / 2, 14, `${ROOMS[kind].name}${g ? ` • ${g.name}` : ''}`, { fontFamily: 'sans-serif', fontSize: '8px', color: '#ffe7a0', stroke: '#0b0f0c', strokeThickness: 3, resolution: 8 }).setOrigin(0.5, 0).setDepth(99995);
    void t;
  }
  /** use a piece of furniture */
  useHot(a: HotAct) {
    const ui = this.ui; if (!ui) return;
    if ('collect' in a) {
      const r = act('guildCollect', { type: a.collect });
      if (refused(r)) { sfx.error(); bus.emit(EV.TOAST, r.refused === 'cap' ? 'คลังหมู่บ้านเต็ม — อัปโกดังเพื่อขยาย' : 'ยังไม่มีของให้เก็บ', '#ff8a8a'); }
      else { sfx.coin(); this.combat.float(this.hero.x, this.hero.y - 50, `+${r.amount} ${r.res === 'wood' ? '🪵' : r.res === 'stone' ? '🪨' : '🍖'} เข้าคลังหมู่บ้าน`, '#9fffb0', 10); bus.emit(EV.STATE_CHANGED); }
    }
    else if ('tab' in a) ui.panels.openGuild(a.tab);
    else if ('plot' in a) ui.panels.openPlot(PLOT_OF[a.plot]);
    else if ('sleep' in a) {
      const r = act('sleep', {});
      if (refused(r)) { sfx.error(); bus.emit(EV.TOAST, 'ต้องสร้างบ้านก่อน', '#ff8a8a'); return; }
      sfx.heal(); saveGame(S()); bus.emit(EV.STATE_CHANGED);
      bus.emit(EV.TOAST, '🛏 นอนพักแล้ว — HP/MP เต็ม • ออกจากเกมได้เลย ยิ่งนอนนาน พลังพักผ่อนยิ่งสะสม (ล่ามอนได้ EXP เพิ่ม)', '#9ad8ff');
    }
    else ui.panels.open(a.panel);
  }
  /** guild village actions offered by the town: enter a building, open a guild tab, a defense slot */
  townAct(what: string, arg?: number) {
    const ui = this.ui; if (!ui) return;
    if (what === 'enter' && arg !== undefined) { this.portalCool = this.time.now + 99999; sfx.door(); this.cameras.main.fadeOut(200); this.time.delayedCall(210, () => showWait()); this.time.delayedCall(240, () => this.scene.restart({ stage: 0, guild: true, inside: arg })); }
    else if (what === 'slot' && arg !== undefined) ui.panels.openGuild('defense', arg);
    else if (what.startsWith('tab:')) ui.panels.openGuild(what.slice(4) as never);
  }

  // ---------- ground ----------
  /** Ground = PixelLab Wang tiles only. Terrain is decided per 32px vertex, so every tile edge matches its neighbour;
   *  the per-pixel surface map (collision, prop placement, water fx) is derived from the same vertices. */
  paintGround() {
    if (this.inside >= 0) { this.paintRoom(); return; }
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
        else if (off < this.roadHalf(x, y)) t = 'd';
        else if (this.plaza(x, y)) t = 'd';
        V[j * VW + i] = t; continue;
      }
      if (this.stageN) {   // wild stage: one winding trail from the west gate to the east gate, clearings along it, a pond
        const off = this.trailOff(x, y), n = this.dungeon ? (this.stageN - DUNGEON) * 10 + 2 : this.stageN;
        const g0 = this.st.land.ground;
        const clr = this.clearings.find(c => Math.hypot(x - c.x, (y - c.y) * 1.2) < c.r);
        if (off > 70 && this.ponds.some(c => Math.hypot(x - c.x, (y - c.y) * 1.3) < c.r)) t = 'w';
        else if (g0 === 'lava' && off > 80 && Math.abs(Math.sin(x / 130 + n) * Math.cos(y / 110 + n)) > 0.9) t = 'w';     // lava pools between the trails
        else if (g0 === 'dung' && off > 60 && (Math.abs(((x + n * 37) % 260) - 130) < 14 || Math.abs((y % 220) - 110) < 12)) t = 'w'; // sewer channels
        else if (clr && (clr.boss || g0 === 'dung')) t = 'c';
        else if (off < this.roadHalf(x, y) || this.plaza(x, y)) t = 'd';
        V[j * VW + i] = t; continue;
      }
      // organic layout: wobbly water edges with a rocky shore, stone yards under buildings, roads of uneven width,
      // grass islands left inside the larger stone areas
      const wob = fbm(x / 46, y / 46) - 0.5, isl = fbm(x / 24 + 9, y / 24 + 4);
      if (this.gv) { V[j * VW + i] = gvTerrain(x, y, wob, isl); continue; }
      const rd = Math.abs(x - riverX(y)), pd = Math.hypot(x - POND.x, (y - POND.y) * 1.3);
      const roadW = 22 + wob * 26;
      const onRoad = Math.abs(y - roadY(x)) < roadW || (x > 730 && x < 1130 && Math.abs(y - road2Y(x)) < roadW * 0.8) || (Math.abs(x - PLAZA.x) < roadW && y < PLAZA.y) || (Math.abs(x - (PLAZA.x - 40 + (y - PLAZA.y) * 0.35)) < roadW && y > PLAZA.y);
      const roadCore = Math.abs(y - roadY(x)) < 12 || (Math.abs(x - PLAZA.x) < 12 && y < PLAZA.y) || (Math.abs(x - (PLAZA.x - 40 + (y - PLAZA.y) * 0.35)) < 12 && y > PLAZA.y);
      if (rd < 30 + wob * 14 || pd < POND.r + wob * 22) t = 'w';
      else if (Math.hypot(x - PLAZA.x, (y - PLAZA.y) * 1.1) < PLAZA.r + 18 + wob * 60) t = isl > 0.72 && !roadCore ? 'g' : 'c';
      else if (yardAt(x, y)) t = isl > 0.74 && !roadCore ? 'g' : 'c';
      else if (onRoad) t = 'd';
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
    const land = this.stageN && !this.wild ? this.st.land.ground : 'forest';
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
    const BRS = this.stageN ? [] : this.gv ? gvBridges() : [roadY(930), road2Y(930)].map(cy => ({ x0: riverX(cy) - 46, x1: riverX(cy) + 46, y0: cy - 15, y1: cy + 15 }));
    // one 16px cell at a time: a cell whose four corners agree is one surface throughout (most of the map), only the
    // cells on an edge are worked out per pixel — same result as per-pixel everywhere, a fraction of the work (load time)
    const dryWater = !!LS && (land === 'haunt' || land === 'snow');
    const kind = (t: Ter) => t === 'w' ? 2 : t === 'c' || t === 'd' ? 1 : 0;
    const NAME = ['grass', 'cobble', dryWater ? 'grass' : 'water'];
    for (let cy = 0; cy < NY; cy++) for (let cx = 0; cx < NX; cx++) {
      const k0 = kind(vAt(cx, cy)), k1 = kind(vAt(cx + 1, cy)), k2 = kind(vAt(cx, cy + 1)), k3 = kind(vAt(cx + 1, cy + 1));
      const x0 = cx * T, y0 = cy * T;
      const brs = BRS.filter(BR => BR.x1 >= x0 && BR.x0 <= x0 + T - 1 && BR.y1 >= y0 && BR.y0 <= y0 + T - 1);
      if (k0 === k1 && k1 === k2 && k2 === k3 && !brs.length) {
        const v = NAME[k0], wet = v === 'water';
        for (let y = y0; y < y0 + T; y++) { const row = y * MW; for (let x = x0; x < x0 + T; x++) { S[row + x] = v; if (wet) this.block(x, y); } }
        continue;
      }
      const w0 = k0 === 2 ? 1 : 0, w1 = k1 === 2 ? 1 : 0, w2 = k2 === 2 ? 1 : 0, w3 = k3 === 2 ? 1 : 0;
      const p0 = k0 === 1 ? 1 : 0, p1 = k1 === 1 ? 1 : 0, p2 = k2 === 1 ? 1 : 0, p3 = k3 === 1 ? 1 : 0;
      for (let y = y0; y < y0 + T; y++) for (let x = x0; x < x0 + T; x++) {
        const fx = (x - x0 + 0.5) / T, fy = (y - y0 + 0.5) / T;
        const a = (1 - fx) * (1 - fy), b = fx * (1 - fy), c = (1 - fx) * fy, d = fx * fy;
        let v = 'grass';
        if (brs.length && brs.some(BR => x >= BR.x0 && x <= BR.x1 && y >= BR.y0 && y <= BR.y1)) v = 'bridge';
        else if (w0 * a + w1 * b + w2 * c + w3 * d > 0.5) v = NAME[2];
        else if (p0 * a + p1 * b + p2 * c + p3 * d > 0.5) v = 'cobble';
        S[y * MW + x] = v;
        if (v === 'water') this.block(x, y);
      }
    }
    // wooden bridge over the river (drawn planks, walkable)
    for (const BR of BRS) {
    for (let y = BR.y0; y <= BR.y1; y++) for (let x = Math.round(BR.x0); x <= BR.x1; x++) {
      const rail = y < BR.y0 + 3 || y > BR.y1 - 3, gap = (x - Math.round(BR.x0)) % 6 === 0;
      const col = rail ? [62, 44, 30] : gap ? [44, 31, 22] : pick(PAL.plank, hash(Math.floor((x - BR.x0) / 6), 7) * 0.6 + hash(x, y) * 0.4);
      ctx.fillStyle = `rgb(${col[0] * 0.8},${col[1] * 0.8},${col[2] * 0.8})`; ctx.fillRect(x, y, 1, 1);
    }
    ctx.fillStyle = 'rgba(8,14,12,0.45)'; ctx.fillRect(Math.round(BR.x0), BR.y1 + 1, Math.round(BR.x1 - BR.x0), 3);
    }
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
  /** director: roads wider, their width wandering and their edges ragged like a trodden path (half width, px) */
  roadHalf(x: number, y: number) { return 34 + (fbm(x / 90, y / 90) - 0.5) * 44 + (fbm(x / 17 + 3, y / 17 + 7) - 0.5) * 14; }
  /** an open patch of trodden ground in the middle of a clearing, uneven in shape */
  plaza(x: number, y: number) {
    for (const c of this.clearings) { const k = Math.hypot(x - c.x, (y - c.y) * 1.25) / c.r; if (k < 0.66 + (fbm(x / 34 + 5, y / 34 + 1) - 0.5) * 0.5) return true; }
    return false;
  }
  /** soften the road edges: grass tufts and pebbles strewn along both sides (small, no collision) */
  roadEdges(rnd: () => number, tint = 0xffffff) {
    const keys = ['tuft_0', 'tuft_1', 'tuft_2', 'pebble_0', 'pebble_1', 'pebble_2'].filter(k => OM[k]); if (!keys.length) return;
    const area = (MW * MH) / (1280 * 800);
    for (let n = 0, k = 0; k < 4000 && n < 170 * area; k++) {
      const x = 10 + rnd() * (MW - 20), y = 20 + rnd() * (MH - 30), e = this.trailOff(x, y) - this.roadHalf(x, y);
      if (Math.abs(e) > 9 || this.isBlocked(x, y)) continue;
      const kk = keys[Math.floor(rnd() * keys.length)], m = OM[kk];
      this.add.image(Math.round(x), Math.round(y), 'o_' + kk).setOrigin(0.5, m.foot / m.h).setDepth(y).setScale(0.7 + rnd() * 0.4).setTint(tint); n++;
    }
  }
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

  // ---------- daily dungeon ----------
  dWave = 0; dEnd = 0; dDone = false;
  startDungeon(spot: () => { x: number; y: number }) {
    this.dWave = 0; this.dDone = false; this.dEnd = this.time.now + DUNGEON_SECS * 1000;
    const c = this.clearings.reduce((b, q) => Math.abs(q.x - MW * 0.55) < Math.abs(b.x - MW * 0.55) ? q : b, this.clearings[0]);
    const near = () => { for (let i = 0; i < 40; i++) { const x = c.x + (Math.random() - 0.5) * c.r * 2.4, y = c.y + (Math.random() - 0.5) * c.r * 1.8; if (!this.isBlocked(x, y) && this.surfAt(x, y) !== 'water') return { x, y }; } return spot(); };
    this.combat.startDungeon(this.stageN - DUNGEON, S().level, near, w => {
      this.dWave = w; bus.emit(EV.TOAST, w > DUNGEON_WAVES.length ? `👑 คลื่นสุดท้าย: ${this.st.land.boss.name}!` : `⚔ คลื่นที่ ${w}/${DUNGEON_WAVES.length + 1}`, '#ffb080');
    }, () => this.clearDungeon());
  }
  clearDungeon() {
    if (this.dDone || this.dead) return;
    const r = act('dungeonClear', {});
    if (refused(r)) { bus.emit(EV.TOAST, 'เซิร์ฟไม่รับผลดันเจี้ยน', '#ff8a6a'); return; }
    this.dDone = true; sfx.chest(); this.levelUpFx(); this.combat.vfx.star(this.hero.x, this.hero.y - 30, 0xffd84a, 2.4);
    bus.emit(EV.TOAST, `🎁 ผ่านดันเจี้ยน! 💰${r.gold.toLocaleString()} + ผลึกมานา ${r.shards}`, '#ffd84a');
    for (const g of r.gear) { bus.emit(EV.TOAST, `◆ ${SETS[g.set!].name}: ${idef(g.id).name}`, '#' + SETS[g.set!].col.toString(16).padStart(6, '0')); bus.emit('loot:popup', { id: g.id, rar: g.rar, set: g.set }); }
    { const pp = this.landing(this.hero.x + 40, this.hero.y) ?? { x: this.hero.x, y: this.hero.y }; this.addPortal(pp.x, pp.y, 0, 'กลับหมู่บ้าน'); } saveGame(S()); bus.emit(EV.STATE_CHANGED);
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
  wildProps?: () => void;
  /** village dressing: produce crates, pumpkins, flower barrels, haystacks, an apple tree... beside the roads, never on a plot */
  villageProps(rnd: () => number, free: (x: number, y: number, r: number) => boolean, roadOff: (x: number, y: number) => number) {
    const ks = ['produce', 'pumpkins', 'flowerbarrel', 'wheelbarrow', 'haystack', 'coop', 'sacks', 'firepit', 'bench', 'appletree', 'lanternpost', 'noticeboard', 'logstack', 'flowerbed', 'scarecrow', 'barrels', 'dogbowl'].map(k => 'pp_vil_' + k).filter(k => OM[k]);
    if (!ks.length) return;
    const near = (x: number, y: number) => this.reserved.has(Math.round(x / 4) + ',' + Math.round(y / 4));
    for (let n = 0, k = 0; k < 800 && n < 26; k++) {
      const x = 60 + rnd() * (MW - 120), y = 120 + rnd() * (MH - 180), o = roadOff(x, y);
      if (o < 30 || o > 110 || near(x, y) || !free(x, y, 22)) continue;
      const key = ks[Math.floor(rnd() * ks.length)];
      if (key === 'pp_vil_appletree' && (o < 60 || !free(x, y, 40))) continue;
      this.obj(key, x, y, key === 'pp_vil_appletree' ? 0.22 : 0.6, key === 'pp_vil_appletree' ? 14 : 5, true, key === 'pp_vil_appletree' ? 0.85 : 1);
      if (key === 'pp_vil_firepit') this.campfire(x, y - 4);
      n++;
    }
  }
  /** director: one tree kind per map, in one tone, many sizes — and grouped into groves (big trees in the middle, smaller
   *  ones at the edge, some lone trees between) instead of sprinkled evenly. `accept` places one and says if it fit. */
  groves(rnd: () => number, total: number, accept: (x: number, y: number, scale: number) => boolean) {
    let placed = 0;
    for (let g = 0; g < 900 && placed < total; g++) {
      const lone = rnd() < 0.18, cx = 20 + rnd() * (MW - 40), cy = 60 + rnd() * (MH - 70), R = lone ? 1 : 70 + rnd() * 120, n = lone ? 1 : 4 + Math.floor(rnd() * 9);
      for (let i = 0, got = 0; i < n * 3 && got < n && placed < total; i++) {
        const a = rnd() * Math.PI * 2, d = lone ? 0 : Math.sqrt(rnd()) * R, x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d * 0.75;
        const sc = (lone ? 0.95 + rnd() * 0.2 : 1.18 - 0.42 * (d / R)) + (rnd() - 0.5) * 0.1;
        if (accept(x, y, sc)) { placed++; got++; }
      }
    }
    return placed;
  }
  /** themed props per land (tools/gen_props2.py, pp_<land>_*): big ones away from the paths, middle ones along them
   *  (so they are seen), small ones anywhere; lights get a warm glow */
  placeLandProps(land: string, rnd: () => number, free: (x: number, y: number, r: number) => boolean, pathOff: (x: number, y: number) => number, keepOut: (x: number, y: number) => boolean) {
    const L: Record<string, [string[], string[], string[]]> = {
      forest: [['ruin', 'well', 'shrine'], ['log', 'boulder', 'ruin', 'stumpshroom', 'berry', 'rockpile', 'shrine', 'beehive', 'well', 'cart'], ['shrooms', 'flowers', 'fern', 'lily']],
      haunt: [['angel', 'gallows', 'crypt'], ['grave1', 'grave2', 'grave3', 'crypt', 'skulls', 'lantern', 'fence', 'coffin', 'scarecrow', 'web', 'cauldron'], ['glowshroom', 'candles']],
      lava: [['pillar', 'obelisk', 'skullrock'], ['spike', 'vent', 'boulder', 'bones', 'geyser', 'cart'], ['crystal', 'ashbush']],   // (the beast ribcage reads like a monster: not scattered)
      snow: [['statue', 'frozenfall', 'tent'], ['boulder', 'snowman', 'bush', 'spike', 'log', 'tent', 'sled', 'icebear', 'signpost'], ['crystal']],
      dung: [['pillar', 'torch', 'statue'], ['chains', 'cage', 'rubble', 'bones', 'spike', 'barrel', 'rack', 'altar', 'coffin', 'irons', 'brazier', 'bookpile'], ['crystal']],
      wild: [['totem', 'ruinhead', 'bigshroom'], ['vinerock', 'hollowlog', 'bush', 'flower', 'nest', 'pitcher'], ['shroomring', 'waterlily']],
    };
    const set = L[land]; if (!set) return;
    const pre = `pp_${land}_`, ok = (k: string) => !!OM[pre + k];
    const [big, mid, small] = set.map(a => a.filter(ok));
    const area = (MW * MH) / (1280 * 800), LIGHT = new Set(['pp_haunt_lantern', 'pp_dung_torch', 'pp_lava_vent', 'pp_lava_crystal', 'pp_haunt_cauldron', 'pp_lava_geyser', 'pp_dung_brazier', 'pp_dung_crystal', 'pp_wild_bigshroom']);
    const put = (k: string, x: number, y: number, fw: number, fd: number) => {
      const im = this.obj(k, x, y, fw, fd, true); if (!im) return;
      if (land === 'snow') im.setTint(0xa8c8ff);   // the colour reference warms whites to pink: cool the snow back down
      if (LIGHT.has(k)) { const l = this.add.image(x, y - (OM[k].foot - OM[k].top) * 0.7, 'td_glow').setTint(k.includes('haunt') ? 0x8affc8 : 0xffa04a).setBlendMode(Phaser.BlendModes.ADD).setDepth(99990).setScale(0.8); this.lamps.push(l); }
    };
    for (let n = 0, k = 0; k < 400 && n < (land === 'dung' ? 26 : 34) * area; k++) {   // big
      const x = 20 + rnd() * (MW - 40), y = 60 + rnd() * (MH - 70); if (!big.length || pathOff(x, y) < 96 || keepOut(x, y) || !free(x, y, 40)) continue;
      put(pre + big[Math.floor(rnd() * big.length)], x, y, 0.3, 12); n++;
    }
    for (let n = 0, k = 0; k < 900 && n < (land === 'wild' ? 24 : 42) * area; k++) {   // along the paths (calmer: fewer, director)
      const x = 20 + rnd() * (MW - 40), y = 40 + rnd() * (MH - 50), o = pathOff(x, y); if (!mid.length || o < 60 || o > 170 || keepOut(x, y) || !free(x, y, 18)) continue;
      put(pre + mid[Math.floor(rnd() * mid.length)], x, y, 0.6, 5); n++;
    }
    for (let n = 0, k = 0; k < 600 && n < (land === 'wild' ? 28 : 48) * area; k++) {   // small, no collision
      const x = 10 + rnd() * (MW - 20), y = 30 + rnd() * (MH - 40); if (!small.length || pathOff(x, y) < 50 || !free(x, y, 6)) continue;
      const kk = pre + small[Math.floor(rnd() * small.length)], m = OM[kk];
      const si = this.add.image(Math.round(x), Math.round(y), 'o_' + kk).setOrigin(0.5, m.foot / m.h).setDepth(y); if (land === 'snow') si.setTint(0xa8c8ff); n++;
    }
  }
  placeWild(rnd: () => number, pick: (k: string, n: number) => string, free: (x: number, y: number, r: number) => boolean) {
    const has = (k: string) => !!OM[k];
    const jungle = ['jtree_0', 'jtree_1', 'jtree_2', 'palm_0'].filter(has);
    const area = (MW * MH) / (1280 * 800);
    const open = (x: number, y: number, pad: number) => this.pits.some(c => Math.hypot(x - c.x, (y - c.y) * 1.25) < c.r + pad) || this.clearings.some(c => Math.hypot(x - c.x, y - c.y) < c.r);
    this.wildProps = () => { this.placeLandProps('wild', rnd, free, (x, y) => this.trailOff(x, y), (x, y) => open(x, y, 30)); this.roadEdges(rnd); };
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
        this.addNode(o, x, y, 'stone', { ...vein, rare: true }); if (o) this.nodes[this.nodes.length - 1].glow = gl;
      }
      { const x = p.x, y = p.y + 4; const o = this.obj(has('vein_2') ? 'vein_2' : pick('ore', 7), x, y, 0.6, 4); if (!has('vein_2')) o?.setTint(0xffd84a); this.addNode(o, x, y, 'stone', { ...vein, gold: true }); }
    }
    // jungle: big trees everywhere off the trails, ferns and flowers underneath
    const key = has('jtree_1') ? 'jtree_1' : jungle[0] ?? pick('oak', 3), hgt = (OM[key]?.foot ?? 120) - (OM[key]?.top ?? 0);
    this.groves(rnd, 48 * area, (x, y, sc) => {
      if (this.trailOff(x, y) < 82 || this.trailOff(x, y - hgt * 0.5 * sc) < 60 || open(x, y, 40) || !free(x, y, 52 * sc)) return false;
      // solid trunk + roots: jungle trees spread wide buttress roots, so their footprint is wider and deeper
      this.addNode(this.obj(key, x, y, 0.28, 40 * sc, true, sc), x, y, 'wood'); return true;
    });
    void pick;
    const ferns = ['fern_0', 'fern_1'].filter(has);
    for (let k = 0; k < 140 * area; k++) {
      const x = 20 + rnd() * (MW - 40), y = 30 + rnd() * (MH - 40);
      if (this.trailOff(x, y) < 50 || !free(x, y, 6)) continue;
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
    this.crowd = new Crowd(this as never, CH.hg ? 'hg' : 'hero', () => work.filter(n => n.until <= this.time.now).map(n => ({ x: n.x, y: n.y, kind: n.kind })), testBots.n ? Math.min(testBots.n, 99) : 16, () => { const n = work[Math.floor(rnd() * work.length)]; return { x: n.x + 10, y: n.y + 16 }; });
  }

  /** Farming map: dense forest between the trails, clearings where monsters gather, the village gate in the west. */
  placeStage(rnd: () => number, pick: (k: string, n: number) => string, free: (x: number, y: number, r: number) => boolean) {
    const st = this.st;
    const tint: Record<string, number> = { forest: 0xffffff, haunt: 0xb8a8d8, lava: 0x8a5a50, snow: 0xe8f4ff, dung: 0x9aa8b8 };

    const g = st.land.ground;
    const area = (MW * MH) / (1280 * 800);
    const inClear = (x: number, y: number) => this.clearings.some(c => Math.hypot(x - c.x, (y - c.y) * 1.2) < c.r + 20);
    const TREE: Record<string, string> = { forest: 'oak_1', haunt: 'dead_0', lava: 'dead_1', snow: 'pine_1' };
    const key = TREE[g], hgt = key ? (OM[key]?.foot ?? 120) - (OM[key]?.top ?? 0) : 0;
    if (key) this.groves(rnd, (g === 'lava' ? 45 : 120) * area, (x, y, sc) => {
      // never hide a trail behind the crown, roots stay off it, clearings stay open
      if (this.trailOff(x, y) < 88 || this.trailOff(x, y - hgt * 0.5 * sc) < 62 || this.trailOff(x, y - hgt * sc) < 40 || inClear(x, y) || !free(x, y, 46 * sc)) return false;
      const t = this.obj(key, x, y, 0.22, 16, true, sc);
      if (t && g !== 'forest') t.setTint(tint[g]);
      return true;
    });
    void pick;
    if (g === 'dung' || g === 'lava') for (let k = 0; k < 260 * area; k++) {   // boulders and ore instead of a forest
      const x = 10 + rnd() * (MW - 20), y = 40 + rnd() * (MH - 50);
      if (this.trailOff(x, y) < 62 || inClear(x, y) || !free(x, y, 12)) continue;
      const o = this.obj(rnd() < 0.7 ? pick('rock', 8) : pick('ore', 7), x, y, 0.6, 4); o?.setTint(g === 'lava' ? 0xd09080 : 0x9aa8b8);
      void o;
    }
    this.placeLandProps(g, rnd, free, (x, y) => this.trailOff(x, y), inClear);
    if (g !== 'dung') this.roadEdges(rnd, g === 'snow' ? 0xc8dcff : g === 'lava' ? 0x9a7060 : g === 'haunt' ? 0xa898c8 : 0xffffff);
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
    if (this.dungeon) { this.portals[this.portals.length - 1].label.setText('ออกจากดันเจี้ยน'); this.startDungeon(spot); return; }
    const boss = this.clearings.find(c => c.boss) ?? null;
    this.combat.spawnMap(this.stageN, spot, boss ? { x: boss.x, y: boss.y } : null);
  }

  addPortal(x: number, y: number, to: number | 'select' | 'starter' | 'guild' | 'out' | 'leave', text: string) {
    // the PixelLab dimension gate (loops); a soft glow under it; gates home / to the villages are tinted green
    const home = to === 0 || to === 'starter' || to === 'guild' || to === 'out';
    const gate = to === 'out' ? null : fx2(this, 'fx_portal', x, y + 6, y + 6, 0.62);
    if (gate && home) gate.setTint(0xb8ffd8);
    const g = this.add.image(x, y - 6, 'td_glow').setTint(home ? 0x9affc8 : 0x9ad8ff).setBlendMode(Phaser.BlendModes.ADD).setDepth(99985).setScale(gate ? 0.9 : 1.2).setAlpha(0.6);
    this.tweens.add({ targets: g, alpha: { from: 0.35, to: 0.75 }, duration: 900, yoyo: true, repeat: -1 });
    if (!gate) { const ring = this.add.ellipse(x, y, 30, 12).setStrokeStyle(2, 0xbfeaff, 0.9).setDepth(2); this.tweens.add({ targets: ring, scaleX: 1.25, scaleY: 1.25, alpha: 0.4, duration: 900, yoyo: true, repeat: -1 }); }
    const label = this.add.text(x, y - 52, text, { fontFamily: 'sans-serif', fontSize: '8px', color: '#e8f8ff', stroke: '#06121a', strokeThickness: 3, resolution: 6 }).setOrigin(0.5).setDepth(99999);
    this.portals.push({ x, y, to, label });
  }

  /** going out costs supplies (food); stages 1-2 are free */
  enterStage(n: number, room?: number) {
    const s = S();
    if (isDungeon(n)) {   // daily dungeon: free, the server counts the runs
      if (s.outfit === 'gather') s.outfit = 'hunt';
      saveGame(s); this.portalCool = this.time.now + 99999; this.cameras.main.fadeOut(250); this.time.delayedCall(260, () => showWait()); this.time.delayedCall(300, () => this.scene.restart({ stage: n })); return;
    }
    if (n === WILD) {   // free, any level; everyone goes in villager clothes
      if (s.outfit !== 'gather') { s.outfit = 'gather'; bus.emit(EV.TOAST, 'สวมชุดชาวบ้าน (ชุดหาทรัพยากร) แล้ว', '#ffd8a0'); }
      saveGame(s); this.portalCool = this.time.now + 99999; this.cameras.main.fadeOut(250); this.time.delayedCall(260, () => showWait()); this.time.delayedCall(300, () => this.scene.restart({ stage: WILD, room })); return;
    }
    const st = STAGES[n - 1], sv = s as unknown as { tdUnlockAll?: boolean };
    if (s.level < st.req && !sv.tdUnlockAll) { bus.emit(EV.TOAST, `ต้องเลเวล ${st.req} ถึงจะเข้าแผนที่ ${n} ได้`, '#ff8a6a'); return; }
    if (s.outfit === 'gather') { s.outfit = 'hunt'; bus.emit(EV.TOAST, 'สวมชุดนักรบแล้ว (แผนที่มอน)', '#ffd8a0'); }
    bus.emit(EV.TOAST, 'แผนที่มอน: ได้ EXP ทอง ไอเทม • ทรัพยากรอยู่ที่ 🌿 ป่าดงดิบ', '#c8e8ff');
    // supplies: eaten while on the map (not paid at the gate) — say how long the larder lasts
    if (stageFood(n)) { const m = supplyMinutes(s, n); bus.emit(EV.TOAST, m < 1 ? `⚠ ไม่มีเสบียง! เข้าได้ แต่ฮีโร่จะหิว (พลังตี −20% EXP −30%)` : `🍖 เสบียง ${stageFood(n)} ทุก ${SUPPLY_MINS} นาที • พอสำหรับ ~${Math.floor(m)} นาที`, m < 1 ? '#ff8a6a' : '#ffd8a0'); }
    saveGame(s);
    this.portalCool = this.time.now + 99999; this.cameras.main.fadeOut(250); this.time.delayedCall(260, () => showWait()); this.time.delayedCall(300, () => this.scene.restart({ stage: n }));
  }
  hungryWarned = false;
  supT = 0; heroWarned = false; lowWarn = 0;
  /** supplies on a monster map: the server charges the time spent here; warn when the hero starts / stops starving */
  supplyStep() {
    const r = act('supplyTick', {}) as { ate: number; hungry: boolean; food: number };
    if (r.hungry && !this.heroWarned) { bus.emit(EV.TOAST, '😫 เสบียงหมด! ฮีโร่หิว พลังตี −20% EXP −30% — ล่าสัตว์ที่ 🌿 ป่าดงดิบ หรือกินอาหารจากครัว', '#ff8a6a'); sfx.error(); }
    if (!r.hungry && this.heroWarned) bus.emit(EV.TOAST, '🍖 อิ่มแล้ว! กลับมาแข็งแรงเหมือนเดิม', '#9fffb0');
    else if (!r.hungry) {   // running low: warn twice (10 and 3 minutes left), not on every bite
      const m = supplyMinutes(S(), this.stageN), lv = m < 3 ? 2 : m < 10 ? 1 : 0;
      if (lv > this.lowWarn) bus.emit(EV.TOAST, `🍖 เสบียงใกล้หมด (เหลือ ~${Math.floor(m)} นาที)`, '#ffd8a0');
      this.lowWarn = lv;
    }
    this.heroWarned = r.hungry;
    if (r.ate || r.hungry) { saveGame(S()); bus.emit(EV.STATE_CHANGED); }
  }
  /** a walkable point for a bot player */
  botSpot() { for (let i = 0; i < 60; i++) { const x = 40 + Math.random() * (MW - 80), y = 40 + Math.random() * (MH - 80); if (this.canStand(x, y)) return { x, y }; } return { x: this.hero.x, y: this.hero.y }; }
  bountyT = 0;

  /** the stage select is a TdUI panel (same skin as the other windows) */
  stageSelect() { const u = this.ui; if (u) { u.panels.stSel = 0; u.panels.open('stages'); } this.portalCool = this.time.now + 600; }
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
  /** pixel oval shadow under something (w × h px) — flat, crisp, the same for every map (src/world/pxShadow.ts) */
  contact(x: number, y: number, w: number, h: number, alpha = 0.45) {
    return pxShadow(this, x, y, w, h, alpha * 0.85);
  }
  casts: { src: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite; sh: Phaser.GameObjects.Image; live: boolean; cut?: number }[] = [];
  /** dark silhouette of the object laid on the ground, pointing away from the sun (updated by updateDayNight) */
  /** dark silhouette of the object laid on the ground to the south (fixed light, see placeShadow) */
  /** cut = source pixels above the foot left out of the shadow (trees: roots + trunk, so only the canopy throws a shadow) */
  /** director: pixel-game shadows, not realistic ones — the silhouettes laid on the ground are gone, every object keeps
   *  only its pixel oval (contact / pxShadow). Kept as a no-op so the callers stay simple. */
  castShadow(_src: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite, _live = false, _cut = 0) { void _src; void _live; void _cut; }

  clock() { const h = this.dayHour(), hh = Math.floor(h), mm = Math.floor((h - hh) * 60); return `${h >= 6 && h < 18 ? '☀' : '🌙'} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`; }
  /** hour of the village day (0-24): one full day lasts 20 real minutes */
  dayHour() { return ((Date.now() / 1200000) % 1) * 24; }
  dayFx: Phaser.FX.ColorMatrix | null = null;
  dayT = -1e9; light = 0; sunAng = Math.PI / 2; sunLen = 0.95; shAlpha = 0.58;
  /** director: no day / night — the original moody tone, one fixed light so every shadow falls to the south (down the screen) */
  updateDayNight(time: number) {
    if (time - this.dayT > 400) { this.dayT = time; for (const c of this.casts) if (!c.live) this.placeShadow(c); }
    for (const c of this.casts) if (c.live) this.placeShadow(c);
  }
  /** black canopy silhouette of a tree with its cut edge faded out (made once per tree picture) */
  canopyShadow(src: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite, cut: number) {
    const f = src.frame, key = `shd_${src.texture.key}_${cut}`;
    if (this.textures.exists(key)) return key;
    const h = Math.max(1, Math.round(src.originY * f.height - cut)), cv = document.createElement('canvas'); cv.width = f.width; cv.height = h;
    const k = cv.getContext('2d')!, img = f.source.image as CanvasImageSource;
    k.drawImage(img, f.cutX, f.cutY, f.width, h, 0, 0, f.width, h);
    k.globalCompositeOperation = 'source-in'; k.fillStyle = '#050a08'; k.fillRect(0, 0, f.width, h);
    const g = k.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.6, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    k.globalCompositeOperation = 'destination-in'; k.fillStyle = g; k.fillRect(0, 0, f.width, h);
    this.textures.addCanvas(key, cv);
    return key;
  }
  placeShadow(c: { src: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite; sh: Phaser.GameObjects.Image; cut?: number }) {
    const { src, sh } = c, cut = c.cut ?? 0;
    if (!src.active) { sh.setVisible(false); return; }
    if (!cut && (sh.texture.key !== src.texture.key || sh.frame.name !== src.frame.name)) sh.setTexture(src.texture.key, src.frame.name);
    // a short shadow lying flat to the south that starts a little UNDER the base, so it is glued to the object (no gap)
    sh.setPosition(src.x, src.y - 4 * src.scaleY).setOrigin(src.originX, src.originY).setFlipX(!src.flipX)
      .setRotation(this.sunAng + Math.PI / 2).setScale(src.scaleX, src.scaleY * this.sunLen * 0.4)
      .setAlpha(this.shAlpha * src.alpha).setVisible(src.visible && this.shAlpha > 0.01);
    if (cut) {
      // trees: the canopy silhouette only (no roots / trunk), fading in from the tree's foot, lying close to the south
      const tk = this.canopyShadow(src, cut);
      sh.setTexture(tk).setRotation(0).setFlipY(true).setFlipX(src.flipX).setOrigin(src.originX, 0).setScale(src.scaleX, src.scaleY * 0.34);
      sh.y = src.y - 3 * src.scaleY;
    }
  }

  /** Place a PixelLab object by its feet; blocks a footprint `fw` wide and `fd` deep above the feet. */
  /** the burnt ruin of an object (world/ruin.ts): same footprint as the building, made from its own picture */
  ruin(name: string, x: number, y: number, fw = 0.5, fd = 6, shadow = true, sc = 1) {
    const k = 'ruin_' + name;
    if (!OM[k]) { if (!OM[name] || !makeRuin(this, 'o_' + name, 'o_' + k)) return this.obj(name, x, y, fw, fd, shadow, sc); OM[k] = OM[name]; }
    return this.obj(k, x, y, fw, fd, shadow, sc);
  }
  obj(name: string, x: number, y: number, fw = 0.5, fd = 6, shadow = true, sc = 1) {
    const m = OM[name]; if (!m) return null;
    const im = this.add.image(Math.round(x), Math.round(y), 'o_' + name).setOrigin(0.5, m.foot / m.h).setDepth(y).setScale(sc);
    if ((m.foot - m.top) * sc > 36) this.tall.push(im);   // tall things fade when the hero walks behind them
    const w = (m.x1 - m.x0) * fw * sc;
    if (shadow) {
      // soft contact shadow as wide as the object, and (village) a cast shadow that follows the sun / moon
      const ow = (m.x1 - m.x0) * sc;
      this.contact(x, y - 1, Math.max(10, ow * 0.95), Math.max(6, Math.min(ow * 0.32, (fd + 6) * 1.6)), 0.45);
      const tree = /^(oak|pine|dead|jtree|palm)_/.test(name);
      if ((m.foot - m.top) * sc > 24) this.castShadow(im, false, tree ? Math.round((m.foot - m.top) * 0.38) : 0);
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
    if (this.wild) { this.placeWild(rnd, pick, free); this.wildProps?.(); return; }
    if (this.stageN) { this.placeStage(rnd, pick, free); return; }
    if (this.inside >= 0) { this.placeRoom(); return; }
    if (this.town) { this.town.place(rnd, pick, free); this.villageProps(rnd, free, (x, y) => GV.laneDist(x, y)); return; }
    // village buildings (level art from PixelLab Objects)
    for (const [n, x, y] of HOUSES) {
      const m = OM[n]; this.obj(n, x, y, 0.82, Math.round((m.foot - m.top) * 0.42));
      // keep the trees away from the building
      for (let j = -(m.foot - m.top) - 60; j <= 40; j += 4) for (let i = -(m.x1 - m.x0) * 0.75; i <= (m.x1 - m.x0) * 0.75; i += 4) if (!this.isBlocked(x + i, y + j)) this.reserved.add(Math.round((x + i) / 4) + ',' + Math.round((y + j) / 4));
    }
    for (const P of PLOTS) for (let j = -200; j <= 150; j += 4) for (let i = -96; i <= 96; i += 4) this.reserved.add(Math.round((P.x + i) / 4) + ',' + Math.round((P.y + j) / 4));
    const near = (x: number, y: number) => this.reserved.has(Math.round(x / 4) + ',' + Math.round(y / 4));
    // market stalls and village clutter around the plaza
    for (const [x, y] of [[600, 520], [652, 500], [436, 522]]) this.obj(pick('stall', 5), x, y, 0.8, 10);
    for (const [k, x, y] of [['well_0', 590, 318], ['sign_0', 880, 456]] as [string, number, number][]) this.obj(k, x, y, 0.7, 4);
    // each building gets its own working clutter at its sides (the front door stays clear)
    const DRESS: Record<string, [string, number, number][]> = {
      forge: [['ore_1', -86, -4], ['rock_2', -96, 10], ['barrel_2', 84, -2], ['crate_1', 96, 12], ['logs_1', 74, 22]],
      barn: [['hay_0', 84, -6], ['hay_1', 96, 8], ['hay_2', 78, 20], ['cart_0', -92, 6]],
      lumber: [['logs_2', 86, -2], ['logs_3', 98, 14], ['logs_4', 80, 26], ['stump_1', -84, 4], ['stump_2', -98, 18]],
      tavern: [['barrel_0', -86, -2], ['barrel_1', -96, 10], ['crate_2', 88, 6], ['sign_1', -54, 30]],
      kitchen: [['barrel_3', -84, 0], ['crate_3', -96, 14], ['well_1', 90, 10]],
      market: [['crate_0', -84, 2], ['barrel_1', -96, 14], ['cart_1', 92, 8]],
      warehouse: [['crate_0', -84, -4], ['crate_1', -96, 8], ['crate_2', -84, 18], ['barrel_2', 88, 4], ['barrel_3', 98, 16]],
      quarry: [['rock_0', -86, 0], ['rock_3', -98, 14], ['ore_2', 86, 2], ['ore_4', 98, 16]],
      tower: [['sign_2', -70, 26], ['crate_3', 86, 8]],
      house: [['barrel_0', -70, 6], ['crate_1', 72, 10]],
    };
    const typeOf = Object.fromEntries(Object.entries(PLOT_OF).map(([k, v]) => [v, k])) as Record<number, string>;
    PLOTS.forEach((P, i) => { for (const [k, dx, dy] of DRESS[typeOf[i]] ?? []) if (OM[k] && !this.isBlocked(P.x + dx, P.y + dy)) this.obj(k, P.x + dx, P.y + dy, 0.5, 3, true, 0.9); });
    for (const [n, x, y] of HOUSES) if (n.startsWith('house')) for (const [k, dx, dy] of DRESS.house) if (OM[k] && !this.isBlocked(x + dx, y + dy)) this.obj(k, x + dx, y + dy, 0.5, 3, true, 0.9);
    // rocky, reedy banks along the river and around the pond
    for (let y = 20; y < MH - 10; y += 14) for (const side of [-1, 1]) {
      const x = riverX(y) + side * (40 + rnd() * 10);
      if ((y > BRIDGE.y0 - 30 && y < BRIDGE.y1 + 30) || (y > BRIDGE2.y0 - 30 && y < BRIDGE2.y1 + 30)) continue;
      if (this.isBlocked(x, y) || this.surfAt(x, y) !== 'grass') continue;
      const r = rnd();
      if (r < 0.28) this.obj(pick('rock', 8), x, y, 0.5, 3, true, 0.75 + rnd() * 0.3);
      else if (r < 0.75) this.add.image(Math.round(x), Math.round(y), 'o_' + pick('reed', 4)).setOrigin(0.5, 0.9).setDepth(y);
    }
    for (let a = 0; a < Math.PI * 2; a += 0.22) {
      const x = POND.x + Math.cos(a) * (POND.r + 14 + rnd() * 8), y = POND.y + Math.sin(a) * (POND.r / 1.3 + 12 + rnd() * 6);
      if (this.isBlocked(x, y) || this.surfAt(x, y) !== 'grass') continue;
      if (rnd() < 0.35) this.obj(pick('rock', 8), x, y, 0.5, 3, true, 0.7 + rnd() * 0.3); else this.add.image(Math.round(x), Math.round(y), 'o_' + pick('reed', 4)).setOrigin(0.5, 0.9).setDepth(y);
    }
    // a few lone trees inside the village, beside the paths
    { let placed = 0; const roadAt = (x: number, y: number) => ['cobble', 'dirt'].includes(this.surfAt(x, y));
      for (let k = 0; k < 400 && placed < 8; k++) {
        const x = 110 + rnd() * (MW - 220), y = 250 + rnd() * (MH - 380);
        if (!free(x, y, 44) || near(x, y) || this.isBlocked(x, y) || !(roadAt(x + 40, y) || roadAt(x - 40, y) || roadAt(x, y + 36))) continue;
        if (Math.hypot(x - PLAZA.x, y - PLAZA.y) < PLAZA.r + 60) continue;
        this.obj(rnd() < 0.6 ? pick('oak', 3) : pick('pine', 3), x, y, 0.22, 16, true, 0.8); placed++;
      } }
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
    this.villageProps(rnd, free, (x, y) => Math.min(Math.abs(y - roadY(x)), Math.abs(y - road2Y(x))));
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
    const exits = this.portals.map(p => ({ x: p.x, y: p.y, label: p.to === 0 ? 'หมู่บ้าน' : p.to === 'select' ? 'แผนที่มอน' : p.to === WILD ? 'ป่าดงดิบ' : p.to === 'starter' ? 'หมู่บ้านเริ่มต้น' : p.to === 'guild' ? 'หมู่บ้านกิลด์' : p.to === 'out' ? 'ทางออก' : `แผนที่ ${p.to}` }));
    const marks = this.wild ? this.pits.map(p => ({ x: p.x, y: p.y, label: `⛏ ${PITS[p.i].name} Lv${PITS[p.i].req}`, col: S().level >= PITS[p.i].req ? '#ffe8a0' : '#a89878' })) : [];
    const dots: { x: number; y: number; kind: 'mon' | 'boss' | 'animal' | 'player' }[] = [];
    if (this.stageN) for (const m of this.combat.mons) if (m.alive) dots.push({ x: m.x, y: m.y, kind: m.boss ? 'boss' : m.animal ? 'animal' : 'mon' });
    for (const c of this.crowd?.list ?? []) dots.push({ x: c.x, y: c.y, kind: 'player' });
    return { key: this.inside >= 0 ? `room${this.inside}` : this.gv ? 'guild' : String(this.stageN), w: MW, h: MH, hero: { x: this.hero.x, y: this.hero.y, dir: this.dir }, exits, marks, dots };
  }
  /** in the Deepwild the gathering outfit is the empty-handed villager 'hg' (axe / pickaxe / spear only when working) */
  get F() { const s = S(); const t = activeTier(s); if (this.wild && s.outfit === 'gather' && CH.hg && s.look !== 'f') return { key: 'hg', name: formName(s.cls, 0) }; return { key: formKeyOf(s.cls, t, s.look), name: formName(s.cls, t) }; }
  /** the swing used to hit: the gathering villager hunts with a spear (axe = trees, pickaxe = rocks, spear = animals) */
  get swing() { return this.F.key !== 'hg' ? 'attack' : hasAnim('hg', 'hunt') ? 'hunt' : 'chop'; }
  get ui() { const u = this.scene.get('TdUI') as TdUIScene; return u?.sys.isActive() && u.panels ? u : null; }
  heroKey() { return this.F.key; }
  resetJoy() { this.joy.id = -1; this.joy.dx = this.joy.dy = 0; }
  /** monster map: the system puts the hero in a room (MAP_ROOM_CAP); the others in it hunt here, monsters keep up with them */
  mapRoom = { players: 1, rooms: 1, total: 1, cap: 30 };
  joinRoom() {
    const r = act('mapRoom', { n: this.stageN, bots: testBots.n }); this.mapRoom = r; this.combat.pop = r.players;
    this.hunters?.destroy(); this.hunters = r.players > 1 ? new Hunters(this as never, this.combat, r.players - 1, () => this.botSpot()) : undefined;
  }
  stageTitle() {
    const t = this.stageTitle0() + (this.stageN && !this.wild && heroHungry(S()) ? ' • 😫 หิว' : ''); if (!testBots.n || !(this.stageN || this.wild)) return t;
    const mr = this.mapRoom, rm = this.wild ? '' : ` • ห้องนี้ ${mr.players}/${mr.cap} คน (ระบบแบ่ง ${mr.rooms} ห้อง)`;
    return `${t} • 🤖 บอท ${testBots.n}${rm} • มอน ${this.combat.mons.filter(m => m.alive && !m.boss).length} • FPS ${Math.round(this.game.loop.actualFps)}`;
  }
  /** one second of the guild war: the server's numbers into the view, the news feed, the end */
  warStep() {
    const w = syncWar(); if (!w) return;
    if (this.warSide === 'enemy') this.raid?.applyWar(w); else if (this.warSide === 'home') this.defense?.applyWar(w);
    for (const f of newFeed(w).slice(-2)) bus.emit(EV.TOAST, f.text, f.us ? '#9fffb0' : '#ff9a7a');
    if (w.over && !this.warShown) {
      this.warShown = true; const o = w.over;
      for (const m of o.got) bus.emit(EV.TOAST, m, m.startsWith('🏆') ? '#ffd84a' : m.startsWith('🏳') ? '#ffb080' : '#9fffb0');
      if (o.win) { fx2(this, 'fx_raid_victory', this.hero.x, this.hero.y - 20, 99995, 1.5); sfx.levelUp(); } else sfx.error();
      saveGame(S()); bus.emit(EV.STATE_CHANGED);
      this.time.delayedCall(4500, () => { act('warDone', {}); WC.war = null; WC.side = null; saveGame(S()); if (this.warSide) { this.cameras.main.fadeOut(300); this.time.delayedCall(320, () => this.scene.restart({ stage: 0, guild: true })); } else this.town?.render(); });
    }
  }
  stageTitle0() {
    if (this.gv && WC.war && !WC.war.over) return warLine(WC.war) + (this.warSide === 'enemy' ? ' • 👁 หมู่บ้านศัตรู' : this.warSide === 'home' ? ' • 👁 หมู่บ้านเรา' : ' • กด ⚔ ดูสงคราม'); if (this.wild) return `🌿 ป่าดงดิบ • 👥 ${this.online}/100 • ⚡ แรง ${energyLeft(S())}`;
    if (this.dungeon) { const left = Math.max(0, Math.ceil((this.dEnd - this.time.now) / 1000)); return this.dDone ? '⚔ ดันเจี้ยน • ผ่านแล้ว! ออกทางประตู' : `⚔ ดันเจี้ยน ${this.st.land.name} • คลื่น ${Math.min(this.dWave, DUNGEON_WAVES.length + 1)}/${DUNGEON_WAVES.length + 1} • ⏱ ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`; }
    const st = this.stageN ? STAGES[this.stageN - 1] : null; if (st) return `แผนที่ ${st.n} ${st.land.name} (มอน Lv${st.level})`;
    if (this.raid) return this.raid.title();
    if (this.defense && !this.defense.over) return this.defense.title();
    const g = guildOf(S()); if (this.inside >= 0) return `🏠 ${this.roomKind === 'house' ? 'บ้านของฉัน' : ROOMS[this.roomKind ?? 'hall'].name} • ${g?.name ?? ''}`;
    return this.gv && g ? `🏛 หมู่บ้านกิลด์ ${g.name}` : 'หมู่บ้านเอลเดอร์โกรฟ'; }
  /** golden burst when the hero levels up or changes form */
  levelUpFx(kind: 'level' | 'transform' = 'level') {
    const h = this.hero;
    fx2(this, kind === 'transform' ? 'fx_transform' : 'fx_levelup', h.x, h.y + 6, h.y + 1);
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
    const dm = this.dungeon && !this.dDone ? this.combat.nearest(9999)[0] : null;
    if (tut) { tx = tut.x; ty = tut.y; label = tut.label; }
    else if (dm) { tx = dm.x; ty = dm.y; label = dm.boss ? `👑 ${dm.m.name}` : dm.m.name; }
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
  manualT = 0; potT = 0; mpT = 0; autoTipT = 0;
  /** drink a potion (the button, or by itself): the kind's cooldown, the settings' order; VIP buys a small HP potion
   *  when out. Returns false when nothing was drunk. */
  usePotion(kind: 'hp' | 'mp', manual: boolean) {
    const s = S(), d = derive(s), now = this.time.now, h = this.hero;
    if (now < (kind === 'hp' ? this.potT : this.mpT)) return false;
    if (kind === 'hp' ? s.hp >= d.maxHp : s.mp >= d.maxMp) { if (manual) bus.emit(EV.TOAST, kind === 'hp' ? 'HP เต็มแล้ว' : 'MP เต็มแล้ว', '#c8d8c0'); return false; }
    let it = pickPotion(s, kind);
    if (!it && kind === 'hp' && vipActive(s) && !refused(act('autoPotion', {}))) it = pickPotion(s, 'hp');   // VIP: auto-buy
    if (!it) { if (manual) { sfx.error(); bus.emit(EV.TOAST, kind === 'hp' ? 'ยา HP หมด — ซื้อที่ร้านค้า' : 'ยา MP หมด — ซื้อที่ร้านค้า', '#ff8a6a'); } return false; }
    const r = act('useItem', { uid: it.uid }) as { heal: number; mana: number } | null; if (!r) return false;
    if (kind === 'hp') this.potT = now + POT_CD; else this.mpT = now + POT_CD;
    this.combat.float(h.x, h.y - 44, kind === 'hp' ? `+${r.heal}` : `+${r.mana} MP`, kind === 'hp' ? '#7aff8a' : '#8fc8ff', 11);
    sfx.click(); bus.emit(EV.STATE_CHANGED);
    return true;
  }
  /** the settings' automatic drinking (battle maps, guild battles) — with or without AUTO fighting */
  potionStep() {
    const s = S(), p = potOf(s); if (!p.auto || this.dead) return;
    const d = derive(s);
    if (s.hp < d.maxHp * p.hp / 100) this.usePotion('hp', false);
    if (p.mpAuto && (s.mp ?? 0) < d.maxMp * p.mp / 100) this.usePotion('mp', false);
  }
  autoStuck = { x: 0, y: 0, t: 0 };
  autoBad = new Map<object, number>();
  autoTarget: object | null = null;
  toggleAuto() {
    const s = S(); s.auto = !s.auto; this.autoBad.clear(); saveGame(s);
    // director: auto fights monsters and guild battles (each player chooses: watch their hero fight, or play by hand);
    // gathering in the Deepwild is always by hand
    const battle = !!this.raid || !!this.defense;
    bus.emit(EV.TOAST, s.auto ? (battle ? 'ออโต้: ฮีโร่สู้เอง — นั่งดูได้เลย (กดเดิน/ตีเมื่อไหร่ก็ควบคุมเองทันที)' : !this.stageN || this.wild ? 'ออโต้เปิดแล้ว — ทำงานในแผนที่มอน/ดันเจี้ยน และสงคราม/ปล้น/ป้องกันหมู่บ้าน (ป่าดงดิบต้องเก็บเอง)' : 'ออโต้: ตีมอนเอง') : 'ปิดออโต้ — ควบคุมเอง', s.auto ? '#9fffb0' : '#e8c872');
    bus.emit(EV.STATE_CHANGED);
  }
  /** returns the direction to walk this frame (or 0,0) and attacks / casts / gathers when in reach */
  autoStep(time: number): [number, number] {
    const s = S(), h = this.hero, d = derive(s);
    const bad = (o: object) => (this.autoBad.get(o) ?? 0) > time;
    const near = <T extends { x: number; y: number }>(list: T[]) => list.reduce<T | null>((b, q) => !b || Math.hypot(q.x - h.x, q.y - h.y) < Math.hypot(b.x - h.x, b.y - h.y) ? q : b, null);
    let tx: number, ty: number, reach: number, target: object;
    const ranged = ['hr4', 'hr5', 'hr6', 'hr7', 'hr8', 'hr9'].includes(this.F.key);
    if (this.raid || this.defense) {   // guild battles: guards near the hero first, then the nearest building (enemy village) / raider (home)
      const f = this.battleFoe(ranged, bad); if (!f) return [0, 0];
      if (f.d < 150) for (let i = 0; i < 3; i++) {
        const id = currentSkills(s)[i], sk = id ? SKILL_BY_ID[id] : null;
        if (!sk || (this.skillReady[id] ?? 0) > this.time.now || (s.mp ?? 0) < sk.mp) continue;
        if (sk.kind === 'heal' && s.hp > d.maxHp * 0.6) continue;
        if (sk.kind === 'shield' && s.hp > d.maxHp * 0.85) continue;
        if (sk.kind !== 'heal' && sk.kind !== 'shield' && sk.kind !== 'buff' && f.d > (sk.kind === 'shot' || sk.kind === 'pierce' || sk.kind === 'rain' ? 150 : 60)) continue;
        this.castSkill(i); return [0, 0];
      }
      tx = f.x; ty = f.y; reach = f.reach; target = f.obj;
    } else {
      if (!this.stageN || this.wild) { if (time > this.autoTipT) { this.autoTipT = time + 15000; bus.emit(EV.TOAST, 'ออโต้ทำงานเฉพาะแผนที่มอน/ดันเจี้ยน — ป่าดงดิบต้องเก็บเอง', '#e8c872'); } return [0, 0]; }
      // pick up loot lying close by before the next fight
      const lt = near(this.combat.ground.filter(g => g.landed && !g.busy && g.retryT <= this.time.now && !bad(g) && Math.hypot(g.x - h.x, g.y - h.y) < 260));
      if (lt) { const st = this.steer(lt, lt.x, lt.y, time); if (st) return st; }
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
      tx = m.x; ty = m.y; reach = ranged ? 120 : 20 + m.m.size * 0.25; target = m;
    }
    const dx = tx - h.x, dy = ty - h.y, dist = Math.hypot(dx, dy);
    if (dist <= reach) {
      this.dir = (Math.round((Math.PI / 2 - Math.atan2(dy, dx)) / (Math.PI / 4)) % 8 + 8) % 8;
      this.path = null; this.attack(); return [0, 0];
    }
    return this.steer(target, tx, ty, time) ?? [0, 0];
  }
  /** the auto hero's next foe in a guild battle: where to stand, how close is close enough */
  battleFoe(ranged: boolean, bad: (o: object) => boolean): { x: number; y: number; reach: number; d: number; obj: object } | null {
    const h = this.hero, dd = (x: number, y: number) => Math.hypot(x - h.x, y - h.y);
    if (this.defense) {
      const u = this.defense.units.filter(q => q.side === 'atk' && q.alive && !bad(q)).sort((a, b) => dd(a.x, a.y) - dd(b.x, b.y))[0];
      return u ? { x: u.x, y: u.y, reach: ranged ? 120 : 34, d: dd(u.x, u.y), obj: u } : null;
    }
    const r = this.raid!;
    const g = r.guards.filter(q => q.alive && !bad(q) && dd(q.x, q.y) < 200).sort((a, b) => dd(a.x, a.y) - dd(b.x, b.y))[0];
    if (g) return { x: g.x, y: g.y, reach: ranged ? 120 : 34, d: dd(g.x, g.y), obj: g };
    const t = r.targets.filter(q => q.alive && !bad(q)).sort((a, b) => r.dist(a, h.x, h.y) - r.dist(b, h.x, h.y))[0];
    if (!t) return null;
    const x = t.x + Math.max(-t.rx * 0.6, Math.min(t.rx * 0.6, h.x - t.x)), y = t.y + 16;
    return { x, y, reach: ranged ? 110 : 12, d: r.dist(t, h.x, h.y), obj: t };
  }
  // ---------- path following (A* around trees, rocks and water) ----------
  grid?: PathGrid;
  path: { x: number; y: number }[] | null = null; pathFor: object | null = null; pathT = 0; pathGoal = { x: 0, y: 0 };
  steer(target: object, tx: number, ty: number, time: number): [number, number] | null {
    const h = this.hero;
    this.grid ??= new PathGrid(MW, MH, (x, y) => this.isBlocked(x, y));
    if (target !== this.autoTarget) { this.autoTarget = target; this.autoStuck = { x: h.x, y: h.y, t: time }; this.path = null; }
    // stuck for a moment: plan again; still stuck after a while: give up on this target
    if (Math.hypot(h.x - this.autoStuck.x, h.y - this.autoStuck.y) > 6) this.autoStuck = { x: h.x, y: h.y, t: time };
    else if (time - this.autoStuck.t > 3500) { this.autoBad.set(target, time + 10000); this.autoStuck.t = time; this.path = null; return null; }
    else if (time - this.autoStuck.t > 1200 && time - this.pathT > 600) this.path = null;
    const moved = Math.hypot(tx - this.pathGoal.x, ty - this.pathGoal.y) > 24;
    if (!this.path || this.pathFor !== target || (moved && time - this.pathT > 300) || time - this.pathT > 3000) {
      this.path = this.grid.find(h.x, h.y, tx, ty); this.pathFor = target; this.pathT = time; this.pathGoal = { x: tx, y: ty };
      if (!this.path) { this.autoBad.set(target, time + 10000); return null; }   // no way there (across water, walled in)
    }
    while (this.path.length > 1 && Math.hypot(this.path[0].x - h.x, this.path[0].y - h.y) < 7) this.path.shift();
    const wp = this.path[0], dx = wp.x - h.x, dy = wp.y - h.y, d = Math.hypot(dx, dy) || 1;
    return [dx / d, dy / d];
  }
  skillReady: Record<string, number> = {};
  /** skill button i (0-2): pay MP / check cooldown in systems, then play it */
  castSkill(i: number) {
    if (this.dead || this.ui?.panels.isOpen || this.selectUi) return;
    this.rideBlockT = this.time.now + 2500;
    const s = S(), id = currentSkills(s)[i]; if (!id) return;
    const r = beginCast(s, id, this.time.now, this.skillReady);
    if (typeof r === 'string') { if (r === 'mp') bus.emit(EV.TOAST, 'MP ไม่พอ', '#8fc8ff'); return; }
    if (hasAnim(this.F.key, this.swing)) {
      this.attacking = true; playAnim(this.hero, this.F.key, this.swing, this.dir, false);
      this.hero.once('animationcomplete', () => { this.attacking = false; setIdle(this.hero, this.F.key, this.dir); });
    }
    sfx.cast(); playSkill(r);
    this.combat.castSkill(r);
    this.raid?.skill(r);
    this.defense?.skill(r);
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
    if (this.gv) return;
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
    if (this.gv) {
      for (const p of this.hot) { const d = Math.hypot(p.x - h.x, (p.y - h.y) * 1.3); if (d < 44) offer(d, p.label, () => this.useHot(p.act)); }
      if (!this.raid) this.town?.offers(h, offer, (what, arg) => this.townAct(what, arg));
      const b1 = best as { label: string; cb: () => void } | null; ui.setAction(b1?.label ?? null, b1?.cb); return;
    }
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
      else if (n.key === 'np7') offer(d, '📜 กระดานค่าหัว', () => ui.panels.open('bounty'));
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
        const sp = this.spawnPoint(); h.setPosition(sp.x, sp.y).setAngle(0).setAlpha(0).setVisible(true).clearTint();
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
  nodes: { x: number; y: number; kind: 'wood' | 'stone'; im: Phaser.GameObjects.Image; hp: number; until: number; vein?: Vein; sc: number; glow?: Phaser.GameObjects.Image; stump?: Phaser.GameObjects.Image; timer?: Phaser.GameObjects.Text }[] = [];
  gatherTipT = 0;
  addNode(im: Phaser.GameObjects.Image | null, x: number, y: number, kind: 'wood' | 'stone', vein?: Vein) { if (im) this.nodes.push({ x, y, kind, im, hp: vein?.rare ? 6 : 4, until: 0, vein, sc: im.scaleX }); }
  nearNode(r = 40) {
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
      if (refused(r) && r.refused === 'tired') { if (this.time.now > this.gatherTipT) { this.gatherTipT = this.time.now + 6000; bus.emit(EV.TOAST, '⚡ วันนี้เหนื่อยแล้ว เก็บของต่อไม่ไหว พรุ่งนี้มาใหม่ (ยังล่ามอน/ทำอย่างอื่นได้)', '#ffb080'); } return; }
      if (refused(r)) { if (r.refused === 'level') bus.emit(EV.TOAST, `ต้องเลเวล ${n.vein?.req} ถึงจะขุดแร่ที่นี่ได้`, '#ff8a6a'); return; }
      fx2(this, n.kind === 'wood' ? 'fx_chop' : 'fx_mine', n.x + (h.x < n.x ? -8 : 8), n.y - 14, 99952, 0.9);
      if (r.amt) this.combat.float(n.x, n.y - 30, `${n.kind === 'wood' ? '🪵' : '🪨'}+${r.amt}`, '#ffd8a0', 10);
      if (s.res[n.kind] >= resCap(s) && this.time.now > this.gatherTipT) { this.gatherTipT = this.time.now + 8000; bus.emit(EV.TOAST, '📦 คลังเต็ม! ของล้นทิ้ง — อัปเกรดโกดังหรือใช้ทรัพยากรก่อน', '#ff8a6a'); }
      if (r.ore) this.combat.float(n.x + 10, n.y - 42, `+${r.oreQty} ${itemDef(r.ore).name}`, '#c8e8ff', 9);
      if (r.gold) this.combat.float(n.x - 10, n.y - 52, `💰 +${r.gold}G`, '#ffd84a', 10);
      if (r.gem) { fx2(this, 'fx_ore_rare', n.x, n.y - 24, 99953, 1.1); this.combat.vfx.star(n.x, n.y - 20, 0xff9cff, 1.6); this.combat.float(n.x, n.y - 62, `💎 ${itemDef(r.gem).name}!`, '#ff9cff', 12); bus.emit(EV.TOAST, `พบแร่หายาก! ${itemDef(r.gem).name}`, '#ff9cff'); bus.emit('loot:popup', { id: r.gem, rar: itemDef(r.gem).rarity }); saveGame(s); }
      this.tweens.add({ targets: n.im, x: n.im.x + 2, duration: 40, yoyo: true, repeat: 2 });
      n.hp--;
      if (n.hp <= 0) this.depleteNode(n, n.vein?.rare ? 240000 : this.wild ? 45000 : 90000);
      bus.emit(EV.STATE_CHANGED);
    };
    this.time.delayedCall(hitMs(key, anim, 380), () => (n.kind === 'wood' ? sfx.chop() : sfx.mine()));   // the thud on the frame the tool lands
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
  stepT = 0; unstuckT = 0;
  /** the hero's feet fit here (the same test walking uses) */
  canStand(x: number, y: number) { return !this.isBlocked(x - 5, y) && !this.isBlocked(x + 5, y) && !this.isBlocked(x, y - 2) && !this.isBlocked(x, y + 1); }
  /** path grid with the area reachable from the map's entrance marked */
  openGrid() {
    this.grid ??= new PathGrid(MW, MH, (x, y) => this.isBlocked(x, y));
    if (!this.grid.reach) { const e = this.portals[0] ?? { x: this.hero.x, y: this.hero.y }; this.grid.flood(e.x, e.y); }
    return this.grid;
  }
  /** a skill / knockback may put the hero here: feet fit and it is part of the walkable map (not a closed pocket) */
  canLand(x: number, y: number) { return this.canStand(x, y) && this.openGrid().near(x, y); }
  /** nearest good landing spot to (x, y) within ~30 px, or null */
  landing(x: number, y: number) { if (this.canLand(x, y)) return { x, y }; return this.openGrid().rescue(x, y, 5); }
  /** other players who may grab loot (simulated crowd in the Deepwild) */
  others() { const c = this.crowd; return c ? c.list.map(p => ({ x: p.x, y: p.y, name: p.name, grab: (x: number, y: number) => c.grab(p, x, y, this.time.now) })) : []; }
  stunUntil = 0;
  /** animal kick: pushed back a little and dazed (can't move or swing) */
  stunHero(ms: number, fx: number, fy: number) {
    const h = this.hero, a = Math.atan2(h.y - fy, h.x - fx);
    for (let i = 0; i < 18; i += 2) { const nx = h.x + Math.cos(a) * 2, ny = h.y + Math.sin(a) * 2; if (!this.canStand(nx, ny)) break; h.x = nx; h.y = ny; }
    this.stunUntil = this.time.now + ms; this.attacking = false; setIdle(h, this.F.key, this.dir);
    h.setTintFill(0xfff0a0); this.time.delayedCall(90, () => h.clearTint());
    this.combat.float(h.x, h.y - 46, '💫 มึน!', '#ffe080', 10);
    this.combat.vfx.dust?.(h.x, h.y);
  }
  /** a tree cut down leaves a stump, a mined rock leaves rubble; a countdown shows when it grows back */
  depleteNode(n: (typeof this.nodes)[number], ms: number) {
    n.until = this.time.now + ms; n.hp = n.vein?.rare ? 6 : 4;
    this.tweens.killTweensOf(n.im); n.im.setVisible(false); n.glow?.setVisible(false);
    this.faded.delete(n.im);
    const wood = n.kind === 'wood', key = wood ? `o_stump_${Math.floor(Math.random() * 5)}` : `o_pebble_${Math.floor(Math.random() * 6)}`;
    n.stump = this.add.image(n.x, n.y, key).setOrigin(0.5, 0.85).setDepth(n.y).setScale(wood ? (n.im.width > 150 ? 1.5 : 1.15) : 1.3);
    this.combat.vfx.dust(n.x, n.y - 4, 10, wood ? 34 : 24);
    n.timer = this.add.text(n.x, n.y - (wood ? 44 : 22), '', { fontFamily: 'sans-serif', fontSize: '7px', color: '#e8dcc0', stroke: '#0b0f0c', strokeThickness: 3, resolution: 6 }).setOrigin(0.5).setDepth(99990);
    this.time.delayedCall(ms, () => {
      if (!n.im.active) return;
      n.stump?.destroy(); n.stump = undefined; n.timer?.destroy(); n.timer = undefined;
      n.im.setVisible(true).setAlpha(0).setScale(n.sc * 0.25); n.glow?.setVisible(true);
      this.tweens.add({ targets: n.im, alpha: 1, scale: n.sc, duration: 700, ease: 'Back.easeOut' });
    });
  }
  nodeT = 0;
  /** countdown text over stumps / rubble near the hero */
  updateNodeTimers(time: number) {
    if (time - this.nodeT < 250) return; this.nodeT = time;
    const h = this.hero;
    for (const n of this.nodes) {
      if (!n.timer) continue;
      const near = Math.abs(n.x - h.x) < 320 && Math.abs(n.y - h.y) < 220, left = Math.max(0, Math.ceil((n.until - time) / 1000));
      n.timer.setVisible(near).setText(near ? `⏳ ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : '');
    }
  }
  attack() {
    if (this.time.now < this.stunUntil) return;
    this.rideBlockT = this.time.now + 2500;   // off the mount to fight / gather
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
    this.time.delayedCall(Math.max(60, hitMs(F.key, this.swing, 210) - 90), () => sfx.swing());   // the whoosh just before the weapon lands
    if (this.stageN) this.combat.heroAttack(F.key);
    else if (this.defense) this.defense.heroAttack(F.key);
    else if (this.raid) this.raid.heroAttack(F.key);
    h.once('animationcomplete', () => { this.attacking = false; setIdle(h, F.key, this.dir); });
  }

  update(time: number, dt: number) {
    let mx = 0, my = 0;
    this.label.setVisible(false);
    const s1 = S();
    if (this.F.key !== this.heroKeyNow) { this.heroKeyNow = this.F.key; ensurePfx(this, pfxFor(currentSkills(S()))); if (!this.attacking && !this.dead) setIdle(this.hero, this.F.key, this.dir); this.levelUpFx('transform'); }
    if (this.lastLevel && s1.level > this.lastLevel) { this.levelUpFx(); if (nextForm(s1) !== null) bus.emit(EV.TOAST, s1.tier === 0 ? 'ถึงเลเวล 10! กลับหมู่บ้านไปหาผู้เฒ่าเพื่อเลือกสายอาชีพ' : 'เปลี่ยนร่างได้แล้ว! แตะปุ่ม ✨ ด้านบน', '#ffd84a'); bus.emit(EV.STATE_CHANGED); }
    this.lastLevel = s1.level;
    this.updateTutorial(time);
    if (this.wild) this.updateNodeTimers(time);
    this.updatePlots(time); this.updateAction(time); this.updateGuide(time); this.updateOcclusion(time);
    if (this.stageN && !this.wild && !this.dungeon && time > this.supT) { this.supT = time + 15000; this.supplyStep(); }
    if ((this.stageN && !this.wild) || this.raid || this.defense) this.potionStep();
    if (!this.stageN && !this.gv) { const h = isHungry(s1); if (h && !this.hungryWarned) bus.emit(EV.TOAST, 'ชาวบ้านหิว! อาหารหมดคลัง อาคารผลิตได้แค่ครึ่งเดียว — ไปล่าสัตว์ที่ป่าดงดิบ', '#ff8a6a'); this.hungryWarned = h; }
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
    const h = this.hero; this.heroMoving = false;
    if (this.dead) { /* dying */ } else if (time < this.stunUntil) { /* dazed */ } else if (this.attacking) { /* finish the swing first */ } else if (len > 0) {
      mx /= len; my /= len;
      const sp = 108 * (this.riding ? MOUNTS[this.riding.id].speed : 1) * dt / 1000;   // director: a little faster (was 92); a mount faster still (dragon > horse)
      this.heroMoving = true;
      const nx = h.x + mx * sp, ny = h.y + my * sp;
      const ok = (x: number, y: number) => this.canStand(x, y);
      if (ok(nx, h.y)) h.x = nx;
      if (ok(h.x, ny)) h.y = ny;
      const ang = Math.atan2(my, mx);                       // 0 = east
      this.dir = (Math.round(((Math.PI / 2 - ang) / (Math.PI / 4))) % 8 + 8) % 8;   // 0 = south
      playAnim(h, this.F.key, 'walk', this.dir);
      if (time > this.stepT) { this.stepT = time + 310; sfx.step(); }
    } else if (h.anims.isPlaying && !this.attacking && !this.dead) {
      setIdle(h, this.F.key, this.dir);
    }
    h.setDepth(h.y);
    if (this.stageN) this.combat.update(time, dt);
    this.crowd?.update(time, dt);
    this.hunters?.update(time, dt);
    if (this.heroRing) { const fight = (!!this.stageN && !this.wild) || !!this.raid || !!this.defense; this.heroRing.setVisible(fight && h.visible && !this.dead).setPosition(h.x, h.y + 1).setDepth(h.y - 3); }
    { // riding: on when a mount is chosen, outdoors, not in a fight / at work (attacks and gathering get off for 2.5 s)
      const want = mountOn(S()), can = !!want && this.inside < 0 && !this.dead && time > this.rideBlockT && mountReady(this, want);
      if (can && (!this.riding || this.riding.id !== want)) { this.riding?.destroy(); this.riding = new Riding(this, want!, h.x, h.y); this.combat.vfx.dust(h.x, h.y, 6, 16); }
      else if (!can && this.riding) { this.riding.destroy(); this.riding = undefined; this.combat.vfx.dust(h.x, h.y, 6, 16); if (h.alpha === 0) h.setAlpha(1); }
      if (this.riding) { this.riding.update(h.x, h.y, this.dir, this.heroMoving, this.F.key, h.scaleX, time); h.setAlpha(0); }
    }
    if (this.heroBar) {   // the name over the head, the HP bar just under it (director)
      const s0 = S(), by = this.riding ? this.riding.headY() : h.y - 36; this.heroBar.clear();
      if (h.visible) hpBar(this.heroBar, h.x, by, s0.hp / Math.max(1, derive(s0).maxHp), 24);
      const nm = accountName(); if (nm && s0.name !== nm) s0.name = nm;   // the server's name (it can arrive after the scene opened)
      if (this.heroTag) { if (this.heroTag.text !== s0.name) this.heroTag.setText(s0.name ?? ''); this.heroTag.setPosition(Math.round(h.x), Math.round(by - 2)).setVisible(h.visible || !!this.riding); }
    }
    if (this.raid) this.raid.update(time, dt); else this.town?.update(time, dt);
    this.defense?.update(time, dt);
    if (this.gv && this.inside < 0 && time > this.warT && (this.warSide || WC.war || guildOf(S())?.war)) { this.warT = time + 1000; this.warStep(); }
// never embedded: a forced move (skill, knockback) must not leave the hero where the collision test fails in every direction
    if (!this.dead && time > this.unstuckT && !this.tweens.isTweening(this.hero)) {
      this.unstuckT = time + 300;
      if (!this.canStand(this.hero.x, this.hero.y)) { const p = this.openGrid().rescue(this.hero.x, this.hero.y); if (p) { this.hero.setPosition(p.x, p.y); this.combat.vfx.dust(p.x, p.y, 6, 20); } }
    }
    if (this.dungeon && !this.dDone && !this.dead && this.dEnd && time > this.dEnd) { this.dEnd = 0; bus.emit(EV.TOAST, '⏱ หมดเวลา! ดันเจี้ยนล้มเหลว', '#ff6a5a'); this.time.delayedCall(1500, () => { showWait(); this.scene.restart({ stage: 0 }); }); }
    if (time > this.bountyT) {   // a new wandering lord: announce it once (server-wide in the online game)
      this.bountyT = time + 30000;
      const b = act('bountyInfo', {});
      if (b.slot !== BOUNTY_SEEN && !b.killed && S().level >= STAGES[b.n - 1].req) { BOUNTY_SEEN = b.slot; bus.emit(EV.TOAST, `📢 ค่าหัว! 👑 ${b.name} ปรากฏที่แผนที่ ${b.n} — ดูที่กระดานค่าหัว`, '#ffb04a'); }
    }
    if (this.wild && time > this.onlineT) { this.onlineT = time + 30000; const r = act('wildRooms', { bots: testBots.n }); this.room = r.room; this.online = r.players; }
    else this.village?.update(time, dt);
    // a portal only fires when the hero walks onto it: after closing the stage select (or arriving) they must step off first
    if (!this.portalArmed && this.portals.every(p => Math.hypot(p.x - h.x, p.y - h.y) > 30)) this.portalArmed = true;
    for (const p of this.portals) if (!this.dead && this.portalArmed && (!S().auto || time - this.manualT < 500) && Math.hypot(p.x - h.x, p.y - h.y) < 16 && time > this.portalCool) {
      this.portalArmed = false;
      if (p.to === 'select') this.stageSelect();
      else if (p.to === WILD) this.enterStage(WILD);
      else if (p.to === 0) { this.portalCool = time + 99999; this.cameras.main.fadeOut(250); this.time.delayedCall(260, () => showWait()); this.time.delayedCall(300, () => this.scene.restart({ stage: 0 })); }
      else if (p.to === 'leave') { this.portalCool = time + 99999; this.raid?.finish('leave'); }
      else if (p.to === 'starter' || p.to === 'out' || (p.to === 'guild' && guildOf(S()))) {
        const data = p.to === 'starter' ? { stage: 0, guild: false } : p.to === 'out' ? { stage: 0, guild: true, at: this.inside } : { stage: 0, guild: true };
        this.portalCool = time + 99999; this.cameras.main.fadeOut(200); this.time.delayedCall(210, () => showWait()); this.time.delayedCall(240, () => this.scene.restart(data));
      }
      else if (p.to === 'guild') { this.ui?.panels.openGuild('home'); this.portalCool = time + 600; }
      else { this.portalCool = time + 2500; this.enterStage(p.to as number); }
    }
    if (time - this.hudT > 250) {
      this.hudT = time; const s0 = S(), d0 = derive(s0);
      if (time - this.regenT > 2000) { this.regenT = time; s0.hp = Math.min(d0.maxHp, s0.hp + Math.ceil(d0.maxHp * (this.wild ? 0.03 : this.stageN || this.raid || this.defense ? 0.01 : 0.05 * (1 + (s0.buildings.find(b => b.type === 'home')?.level ?? 0) * 0.5)))); s0.mp = Math.min(d0.maxMp, (s0.mp ?? 0) + Math.ceil(d0.maxMp * (this.stageN ? 0.04 : 0.1))); }
      const st = this.stageN && !this.wild && !this.dungeon ? STAGES[this.stageN - 1] : null;
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
