// Guild flags in the world: the 16x16 cloth (data/flag.ts) becomes a small waving spritesheet (4 frames, the columns
// ripple up and down, a soft shade on the folds) on a wooden pole with a gold knob. One texture per distinct flag.
import Phaser from 'phaser';
import { PALETTE, FLAG_W, FLAG_H } from '../data/flag';

const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
let seq = 0; const KEYS = new Map<string, string>();

/** the waving texture + animation for these pixels; returns the texture key */
export function flagTexture(sc: Phaser.Scene, px: string): string {
  let key = KEYS.get(px);
  if (key && sc.textures.exists(key)) return key;
  key = 'gflag_' + (++seq); KEYS.set(px, key);
  const F = 4, W = FLAG_W + 1, H = FLAG_H + 3, c = document.createElement('canvas'); c.width = W * F; c.height = H;
  const x = c.getContext('2d')!;
  for (let f = 0; f < F; f++) for (let i = 0; i < FLAG_W; i++) {
    const wave = Math.sin(i * 0.55 - f * (Math.PI / 2)) * Math.min(1.5, i * 0.18), dy = Math.round(wave + 1), shade = wave > 0.6 ? 0.82 : wave < -0.6 ? 1.08 : 1;
    for (let j = 0; j < FLAG_H; j++) {
      const n = PALETTE[parseInt(px[j * FLAG_W + i], 16)], r = Math.min(255, ((n >> 16) & 255) * shade), g = Math.min(255, ((n >> 8) & 255) * shade), b = Math.min(255, (n & 255) * shade);
      x.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`; x.fillRect(f * W + i, j + dy, 1, 1);
    }
    x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(f * W + i, FLAG_H + dy, 1, 1);   // a thin dark hem under the cloth
  }
  sc.textures.addSpriteSheet(key, c as unknown as HTMLImageElement, { frameWidth: W, frameHeight: H });
  sc.anims.create({ key: key + '_wave', frames: sc.anims.generateFrameNumbers(key, { start: 0, end: F - 1 }), frameRate: 6, repeat: -1 });
  return key;
}
/** a still picture of the cloth (for windows): a canvas texture, flat */
export function flagStill(sc: Phaser.Scene, px: string): string {
  const key = 'gflagS_' + px;
  if (sc.textures.exists(key)) return key;
  const c = document.createElement('canvas'); c.width = FLAG_W; c.height = FLAG_H; const x = c.getContext('2d')!;
  for (let i = 0; i < px.length; i++) { x.fillStyle = hex(PALETTE[parseInt(px[i], 16)]); x.fillRect(i % FLAG_W, Math.floor(i / FLAG_W), 1, 1); }
  sc.textures.addCanvas(key, c); return key;
}
/** a flag on a pole standing at (x, foot): pole + gold knob + waving cloth; returns the objects (for clean-up) */
export function flagPole(sc: Phaser.Scene, x: number, foot: number, px: string, scale = 2, height = 64): Phaser.GameObjects.GameObject[] {
  const g = sc.add.graphics().setDepth(foot);
  g.fillStyle(0x3a2616, 1).fillRect(Math.round(x) - 1, foot - height, 3, height).fillStyle(0x6a4a2a, 1).fillRect(Math.round(x) - 1, foot - height, 1, height);
  g.fillStyle(0xd8a032, 1).fillRect(Math.round(x) - 2, foot - height - 4, 5, 4).fillStyle(0xf0d070, 1).fillRect(Math.round(x) - 1, foot - height - 4, 2, 1);
  g.fillStyle(0x000000, 0.3).fillEllipse(x, foot, 12, 4);
  const key = flagTexture(sc, px), sp = sc.add.sprite(Math.round(x) + 2, foot - height + 1, key, 0).setOrigin(0, 0).setScale(scale).setDepth(foot + 0.5);
  sp.play(key + '_wave');
  return [g, sp];
}
