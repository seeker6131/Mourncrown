// Riding, drawn so it reads as ONE picture (director: seamless, no pasted look):
//   mount (back layer, the whole animal)  →  the rider  →  mount (front layer: the rows from the saddle down)
// The rider is the hero's own current form (any form, male or female), cut at the hips and seated on the saddle point
// of the mount's direction, so the saddle and the animal's body hide the cut and the far-side head stays behind.
// The rider rises and falls with the gait. The fire dragon throws embers off its back.
import Phaser from 'phaser';
import manifest from '../assets/td/mounts.json';
import riders from '../assets/td/riders.json';
import { CH, setIdle } from './chars';
import { MOUNTS, type MountId } from '../data/mounts';
import { pxShadow } from './pxShadow';

const PNG = import.meta.glob('../assets/td/mt_*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const RIDE = import.meta.glob('../assets/td/ride_*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
/** each hero form's own riding pose (tools/gen_riders.py): frame size, foot row, seat row */
const RIDERS = riders as Record<string, { fs: number; foot: number; seat: number }>;
interface MInfo { fs: number; n: number; foot: number; idleN?: number }
const MAN = manifest as Record<string, MInfo>;
const file = (key: string, part: string) => Object.entries(PNG).find(([p]) => p.endsWith(`/${key}_${part}.webp`))?.[1];

export function preloadMounts(sc: Phaser.Scene) {
  for (const [p, u] of Object.entries(RIDE)) { const f = p.split('/').pop()!.replace('.webp', '').slice(5), r = RIDERS[f]; if (r && !sc.textures.exists('ride_' + f)) sc.load.spritesheet('ride_' + f, u, { frameWidth: r.fs, frameHeight: r.fs }); }
  for (const [key, m] of Object.entries(MAN)) for (const part of ['idle', 'walk', 'idlea']) {
    const u = file(key, part); if (u && !sc.textures.exists(`m_${key}_${part}`)) sc.load.spritesheet(`m_${key}_${part}`, u, { frameWidth: m.fs, frameHeight: m.fs });
  }
}
export function createMountAnims(sc: Phaser.Scene) {
  for (const [key, m] of Object.entries(MAN)) for (let d = 0; d < 8; d++) {
    if (sc.textures.exists(`m_${key}_walk`) && !sc.anims.exists(`m_${key}_walk_${d}`)) sc.anims.create({ key: `m_${key}_walk_${d}`, frames: sc.anims.generateFrameNumbers(`m_${key}_walk`, { start: d * m.n, end: d * m.n + m.n - 1 }), frameRate: 11, repeat: -1 });
    if (m.idleN && sc.textures.exists(`m_${key}_idlea`) && !sc.anims.exists(`m_${key}_idlea_${d}`)) sc.anims.create({ key: `m_${key}_idlea_${d}`, frames: sc.anims.generateFrameNumbers(`m_${key}_idlea`, { start: d * m.idleN, end: d * m.idleN + m.idleN - 1 }), frameRate: 7, repeat: -1 });
  }
}
export const mountReady = (sc: Phaser.Scene, id: MountId) => !!MAN[MOUNTS[id].key] && sc.textures.exists(`m_${MOUNTS[id].key}_idle`);

/** top row of the body in one idle frame of a hero form (cached): the hips are cut a fixed share down from there */
const TOP = new Map<string, number>();
function bodyTop(sc: Phaser.Scene, key: string, frame: number) {
  const id = key + ':' + frame; const hit = TOP.get(id); if (hit !== undefined) return hit;
  const c = CH[key], tex = sc.textures.get(`c_${key}_idle`), fr = tex.get(frame), src = tex.getSourceImage() as HTMLImageElement;
  const cv = document.createElement('canvas'); cv.width = fr.cutWidth; cv.height = fr.cutHeight; const x = cv.getContext('2d')!;
  x.drawImage(src, fr.cutX, fr.cutY, fr.cutWidth, fr.cutHeight, 0, 0, fr.cutWidth, fr.cutHeight);
  const p = x.getImageData(0, 0, cv.width, cv.height).data; let top = c.idleFoot * 0.4;
  outer: for (let y = 0; y < cv.height; y++) for (let i = 0; i < cv.width; i++) if (p[(y * cv.width + i) * 4 + 3] > 40) { top = y; break outer; }
  TOP.set(id, top); return top;
}

export class Riding {
  back: Phaser.GameObjects.Sprite; front: Phaser.GameObjects.Sprite; fronts: Phaser.GameObjects.Sprite[] = []; rider: Phaser.GameObjects.Sprite; sh: Phaser.GameObjects.Image;
  embers?: Phaser.GameObjects.Particles.ParticleEmitter;
  info: MInfo; key: string; dir = -1; form = ''; moving = false; cut = 0; riderTop = 0;
  constructor(public sc: Phaser.Scene, public id: MountId, x: number, y: number) {
    const def = MOUNTS[id]; this.key = def.key; this.info = MAN[def.key];
    const tex = `m_${this.key}_idle`, oy = this.info.foot / this.info.fs;
    this.sh = pxShadow(sc, x, y, 46 * def.scale, 12 * def.scale, 0.5);
    this.back = sc.add.sprite(x, y, tex, 0).setOrigin(0.5, oy).setScale(def.scale);
    this.rider = sc.add.sprite(x, y, '__DEFAULT');
    this.front = sc.add.sprite(x, y, tex, 0).setOrigin(0.5, oy).setScale(def.scale);
    for (let i = 0; i < 2; i++) this.fronts.push(sc.add.sprite(x, y, tex, 0).setOrigin(0.5, oy).setScale(def.scale).setVisible(false));
    if (def.fire) {
      if (!sc.textures.exists('px_ember')) { const c = document.createElement('canvas'); c.width = 2; c.height = 2; const k = c.getContext('2d')!; k.fillStyle = '#ffb040'; k.fillRect(0, 0, 2, 2); sc.textures.addCanvas('px_ember', c); }
      this.embers = sc.add.particles(x, y, 'px_ember', { x: { min: -14, max: 14 }, speedY: { min: -38, max: -18 }, speedX: { min: -8, max: 8 }, lifespan: { min: 500, max: 900 }, alpha: { start: 1, end: 0 }, scale: { start: 1, end: 0.4 }, tint: [0xffd060, 0xff8030, 0xff4020], frequency: 70, blendMode: Phaser.BlendModes.ADD });
    }
  }
  /** follow the hero: direction, gait, the seat of this direction, layering by depth */
  update(x: number, y: number, dir: number, moving: boolean, form: string, heroScale: number, time: number) {
    const def = MOUNTS[this.id], m = this.info, s = def.scale;
    if (dir !== this.dir || moving !== this.moving) {
      this.dir = dir; this.moving = moving;
      if (moving && this.sc.anims.exists(`m_${this.key}_walk_${dir}`)) this.back.play(`m_${this.key}_walk_${dir}`, true);
      else if (!moving && this.sc.anims.exists(`m_${this.key}_idlea_${dir}`)) this.back.play(`m_${this.key}_idlea_${dir}`, true);
      else { this.back.anims.stop(); this.back.setTexture(`m_${this.key}_idle`, dir); }
    }
    const pose = RIDERS[form] && this.sc.textures.exists('ride_' + form) ? RIDERS[form] : null;
    if (form !== this.form || this.rider.getData('d') !== dir) {
      this.form = form; this.rider.setData('d', dir);
      if (pose) {   // the form's own riding pose: legs astride, the whole rider
        this.rider.setTexture('ride_' + form, dir).setOrigin(0.5, pose.seat / pose.fs);
        this.rider.isCropped = false; this.riderTop = pose.seat - 2;   // the pose fills its frame almost to the top
      } else if (CH[form]) {   // fallback: the standing picture cut at the hips
        setIdle(this.rider, form, dir);
        const c = CH[form], top = bodyTop(this.sc, form, Number(this.rider.frame.name));
        this.cut = Math.round(top + (c.idleFoot - top) * 0.6);   // the hips: legs go behind the saddle
        this.rider.setCrop(0, 0, this.rider.frame.width, this.cut).setOrigin(0.5, this.cut / this.rider.frame.height);
        this.riderTop = (this.cut - top);
      }
    }
    // the front layer: what of the animal is nearer the viewer than the rider. With a riding pose: facing the viewer the
    // head and neck (a centre band), from behind the rump (a centre band) — the legs astride show at both sides; from
    // the side the near leg lies over the flank, so nothing. Without a pose: everything under the seat hides the cut.
    const [sx, sy] = def.seat[dir] ?? [m.fs / 2, m.fs * 0.35];
    this.front.setTexture(this.back.texture.key, this.back.frame.name);
    // the body under the saddle is always nearer than the rider's lower legs (they hang down the far side / behind the
    // flank); with a riding pose the thighs stay on the saddle and legs spread wider than the body still show at the sides
    // with a riding pose the whole rider shows (legs included — director); only the animal's near-side parts cover it:
    // the head / neck facing us or to a side (so the far leg never hangs over them), the rump from behind.
    // Without a pose (fallback cut-off picture) everything under the seat hides the cut.
    if (pose) this.front.setVisible(false); else this.front.setVisible(true).setCrop(0, sy + 1, m.fs, m.fs - sy - 1);
    const parts = pose ? def.front?.[dir] ?? [] : [];
    this.fronts.forEach((f, i) => {
      const r = parts[i]; if (!r) { f.setVisible(false); return; }
      f.setTexture(this.back.texture.key, this.back.frame.name).setVisible(true).setCrop(r[0], r[2], r[1] - r[0], m.fs - r[2]);
    });
    // gait: the rider rises and falls with the steps
    const bob = moving ? -Math.abs(Math.sin(time / 95)) * 1.6 : Math.sin(time / 600) * 0.5;
    const wx = x + (sx - m.fs / 2) * s, wy = y + (sy - m.foot) * s;
    this.back.setPosition(x, y).setDepth(y - 0.3);
    this.front.setPosition(x, y).setDepth(y + 0.3);
    for (const f of this.fronts) f.setPosition(x, y).setDepth(y + 0.3);
    this.rider.setPosition(Math.round(wx), Math.round(wy + (pose ? 1 : 3) * heroScale + bob)).setScale(heroScale).setDepth(y);
    this.sh.setPosition(x, y);
    this.embers?.setPosition(wx, wy - 6).setDepth(y + 0.4);
  }
  /** world y of the rider's head (for the HP bar) */
  headY() { return this.rider.y - this.riderTop * this.rider.scaleY - 4; }
  destroy() { this.back.destroy(); this.front.destroy(); this.fronts.forEach(f => f.destroy()); this.rider.destroy(); this.sh.destroy(); this.embers?.destroy(); }
}
