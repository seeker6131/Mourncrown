// 🪽 Wings on a hero (data/wings.ts): the sheet from tools/build_wings.py (5 directions x 4 flap poses; the west side is
// the east side mirrored), drawn behind the body (facing the viewer / the side) or in front of it (seen from behind),
// flapping faster while moving. Legend: the wings only. SL: a thin glow and a few sparks. Limited (the best looking):
// a strong glow plus its own effect — storm: lightning along the wings + blue sparks · cosmos: twinkling stars drifting
// round the hero · fallen: black and white feathers falling, a pale halo. Used for the hero and for other players.
import Phaser from 'phaser';
import { WING_BY_ID, type WingDef } from '../data/wings';
import { gfx } from '../core/uiOptions';

const URL = import.meta.glob('../assets/td/wings/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
import META_ from '../assets/td/wings/wings.json';
interface Meta { cw: number; ch: number; w: number; frames: number; dirs: string[]; a: Record<string, { front: boolean; mid: [number, number][] }> }
const META = META_ as unknown as Record<string, Meta>;
const url = (id: string) => Object.entries(URL).find(([p]) => p.endsWith(`/${id}.webp`))?.[1];
/** game direction (0 = south … clockwise to 7 = south-west) → sheet row, mirrored? */
const ROW: [string, boolean][] = [['s', false], ['se', false], ['e', false], ['ne', false], ['n', false], ['ne', true], ['e', true], ['se', true]];

function ensure(sc: Phaser.Scene, id: string, done: () => void) {
  const key = 'wing_' + id, m = META[id], u = url(id);
  if (sc.textures.exists(key)) { done(); return; }
  if (!m || !u) return;
  sc.load.spritesheet(key, u, { frameWidth: m.cw, frameHeight: m.ch }); sc.load.once(`filecomplete-spritesheet-${key}`, done); if (!sc.load.isLoading()) sc.load.start();
}
/** tiny particle pictures (made once): a dot, a star, a feather */
function px(sc: Phaser.Scene) {
  const mk = (k: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) => { if (sc.textures.exists(k)) return; const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d')!); sc.textures.addCanvas(k, cv); };
  mk('wpx_dot', 2, 2, c => { c.fillStyle = '#fff'; c.fillRect(0, 0, 2, 2); });
  mk('wpx_star', 5, 5, c => { c.fillStyle = '#fff'; c.fillRect(2, 0, 1, 5); c.fillRect(0, 2, 5, 1); c.globalAlpha = 0.6; c.fillRect(1, 1, 3, 3); });
  mk('wpx_feather', 3, 6, c => { c.fillStyle = '#fff'; c.fillRect(1, 0, 1, 6); c.fillRect(0, 1, 3, 3); c.globalAlpha = 0.5; c.fillRect(0, 4, 3, 1); });
}

export class WingView {
  sp?: Phaser.GameObjects.Sprite; glow?: Phaser.FX.Glow; em?: Phaser.GameObjects.Particles.ParticleEmitter; em2?: Phaser.GameObjects.Particles.ParticleEmitter;
  bolt?: Phaser.GameObjects.Graphics; halo?: Phaser.GameObjects.Image; def: WingDef; dead = false; seed = Math.random() * 1000; boltT = 0; boltEnd = 0;
  constructor(public sc: Phaser.Scene, public id: string, private effects = true) {
    this.def = WING_BY_ID[id];
    ensure(sc, id, () => { if (!this.dead) this.make(); });
  }
  private make() {
    const sc = this.sc, d = this.def;
    this.sp = sc.add.sprite(0, 0, 'wing_' + this.id, 0);
    if (!this.effects || gfx.low || d.fx === 'none') return;
    px(sc);
    const strong = d.tier === 'X';
    if (this.sp.preFX) this.glow = this.sp.preFX.addGlow(d.col, strong ? 2.2 : 1.1, 0, false, 0.1, strong ? 6 : 3);
    if (d.fx === 'thin') {   // SL: a few sparks drifting up from the wings
      this.em = sc.add.particles(0, 0, 'wpx_dot', { speedY: { min: -18, max: -8 }, speedX: { min: -6, max: 6 }, lifespan: 900, alpha: { start: 0.8, end: 0 }, scale: { start: 1, end: 0.3 }, tint: [d.col, d.col2], frequency: 260, blendMode: Phaser.BlendModes.ADD, emitZone: { type: 'random', source: new Phaser.Geom.Rectangle(-16, -12, 32, 18) } as never });
    } else if (d.fx === 'storm') {   // lightning running along the wings, blue sparks
      this.bolt = sc.add.graphics();
      this.em = sc.add.particles(0, 0, 'wpx_dot', { speed: { min: 10, max: 30 }, lifespan: 500, alpha: { start: 1, end: 0 }, tint: [d.col2, 0xffffff, d.col], frequency: 90, blendMode: Phaser.BlendModes.ADD, emitZone: { type: 'random', source: new Phaser.Geom.Rectangle(-22, -16, 44, 26) } as never });
    } else if (d.fx === 'cosmos') {   // twinkling stars drifting round the hero, a soft nebula behind
      this.halo = sc.add.image(0, 0, 'td_glow').setTint(d.col).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.35);
      this.em = sc.add.particles(0, 0, 'wpx_star', { speed: { min: 2, max: 10 }, lifespan: 1600, alpha: { start: 0, end: 1, ease: 'Sine.easeInOut' }, scale: { start: 0.4, end: 1 }, tint: [0xffffff, d.col2, 0xc8b8ff], frequency: 140, blendMode: Phaser.BlendModes.ADD, emitZone: { type: 'random', source: new Phaser.Geom.Rectangle(-26, -22, 52, 34) } as never });
      this.em.addParticleProcessor?.({ update: (p: Phaser.GameObjects.Particles.Particle) => { p.alpha = Math.min(1, Math.sin(Math.PI * (1 - p.lifeCurrent / p.life)) * 1.2); } } as never);
    } else if (d.fx === 'fallen') {   // black and white feathers drifting down, a pale halo over the head
      this.halo = sc.add.image(0, 0, 'td_glow').setTint(0xfff8e0).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.3).setScale(0.5, 0.25);
      this.em = sc.add.particles(0, 0, 'wpx_feather', { speedY: { min: 6, max: 14 }, speedX: { min: -10, max: 10 }, rotate: { min: -40, max: 40 }, lifespan: 1800, alpha: { start: 0.95, end: 0 }, tint: 0xffffff, frequency: 300, emitZone: { type: 'random', source: new Phaser.Geom.Rectangle(-22, -18, 18, 20) } as never });
      this.em2 = sc.add.particles(0, 0, 'wpx_feather', { speedY: { min: 6, max: 14 }, speedX: { min: -10, max: 10 }, rotate: { min: -40, max: 40 }, lifespan: 1800, alpha: { start: 0.95, end: 0 }, tint: 0x2a2030, frequency: 300, emitZone: { type: 'random', source: new Phaser.Geom.Rectangle(4, -18, 18, 20) } as never });
    }
  }
  /** x, feet = where the hero stands; lift = how high it floats; body = the hero's height (px); dir 0-7; moving flaps faster */
  update(x: number, feet: number, lift: number, body: number, dir: number, moving: boolean, time: number, visible: boolean) {
    const sp = this.sp, m = META[this.id]; if (!sp || !m) return;
    const [row, mir] = ROW[((dir % 8) + 8) % 8], ri = m.dirs.indexOf(row), info = m.a[row];
    const f = Math.floor((time + this.seed) / (moving ? 120 : 230)) % m.frames, mid = info.mid[f];
    const sc = (body * 1.25) / m.w, y = feet - lift - body * 0.58;
    sp.setFrame(ri * m.frames + f).setScale(mir ? -sc : sc, sc).setOrigin(mid[0] / m.cw, mid[1] / m.ch)
      .setPosition(Math.round(x), Math.round(y)).setDepth(feet + (info.front ? 0.6 : -0.6)).setVisible(visible);
    if (this.glow) this.glow.outerStrength = (this.def.tier === 'X' ? 2 : 1) + Math.sin((time + this.seed) / 260) * (this.def.tier === 'X' ? 0.8 : 0.3);
    const ex = Math.round(x), ey = Math.round(y), dep = feet + 1;
    this.em?.setPosition(ex, ey).setDepth(dep).setVisible(visible); if (this.em) this.em.emitting = visible;
    this.em2?.setPosition(ex, ey).setDepth(dep).setVisible(visible); if (this.em2) this.em2.emitting = visible;
    if (this.halo) {
      if (this.def.fx === 'fallen') this.halo.setPosition(ex, feet - lift - body - 2).setDepth(dep);
      else this.halo.setPosition(ex, ey).setDepth(feet - 1).setScale(0.9 + Math.sin(time / 500) * 0.08);
      this.halo.setVisible(visible);
    }
    if (this.bolt) {   // storm: a zig-zag bolt along one wing every 0.6-1.6 s, flickering twice
      if (time > this.boltT) { this.boltT = time + 600 + Math.random() * 1000; this.boltEnd = time + 200; }
      this.bolt.clear().setDepth(dep);
      if (visible && time < this.boltEnd && Math.floor((this.boltEnd - time) / 50) % 2 === 0) {
        const side = Math.random() < 0.5 ? -1 : 1, w = body * 0.6;
        let bx = ex + side * 3, by = ey - 4; this.bolt.lineStyle(1, 0xe8ffff, 1).beginPath().moveTo(bx, by);
        for (let i = 0; i < 4; i++) { bx += side * (w / 4); by += (Math.random() - 0.3) * 6; this.bolt.lineTo(bx, by); }
        this.bolt.strokePath().lineStyle(3, this.def.col2, 0.3).strokePath();
      }
    }
  }
  destroy() { this.dead = true; this.sp?.destroy(); this.em?.destroy(); this.em2?.destroy(); this.bolt?.destroy(); this.halo?.destroy(); }
}
/** lift a hero sprite off the ground without moving it (its position stays the feet: depth, collision, shadow unchanged) */
export function liftSprite(sp: Phaser.GameObjects.Sprite, lift: number) {
  const s = sp as Phaser.GameObjects.Sprite & { __oy?: number; __base?: number };
  if (s.__oy === undefined || Math.abs(sp.originY - s.__oy) > 1e-6) s.__base = sp.originY;   // (a new animation set its own origin)
  const oy = (s.__base ?? sp.originY) + (sp.displayHeight ? lift / sp.displayHeight : 0);
  if (Math.abs(oy - sp.originY) > 1e-6) sp.setOrigin(sp.originX, oy);
  s.__oy = sp.originY;
}
/** load every wing sheet into a scene (the slot machine's reels, the bag); done() once all are in */
export function ensureAllWings(sc: Phaser.Scene, ids: string[], done: () => void) {
  let left = ids.filter(id => !sc.textures.exists('wing_' + id)).length;
  if (!left) { done(); return; }
  for (const id of ids) if (!sc.textures.exists('wing_' + id)) ensure(sc, id, () => { if (--left === 0) done(); });
}
/** the wing's first picture (facing the viewer, wings open) */
export const WING_ICON_FRAME = 0;
