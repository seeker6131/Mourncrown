// PixelLab characters (heroes, monsters, NPCs) for the top-down world, driven by src/assets/td/chars.json
// (written by tools/import_chars.py). Every character has an idle sheet (one frame per direction) and
// animation sheets (rows = directions, cols = frames). Missing directions fall back to the nearest one.
import Phaser from 'phaser';
import manifest from '../assets/td/chars.json';

export const DIRS = ['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west'];
interface AnimInfo { fs: number; n: number; dirs: string[]; foot: number }
interface CharInfo { dirs: string[]; idleFs: number; idleFoot: number; anims: Record<string, AnimInfo> }
export const CH = manifest as unknown as Record<string, CharInfo>;
const FILES = import.meta.glob('../assets/td/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const url = (name: string) => FILES[`../assets/td/${name}.webp`];

export function preloadChars(scene: Phaser.Scene) {
  for (const [k, c] of Object.entries(CH)) {
    scene.load.spritesheet(`c_${k}_idle`, url(`${k}_idle`), { frameWidth: c.idleFs, frameHeight: c.idleFs });
    for (const [a, i] of Object.entries(c.anims)) if (url(`${k}_${a}`)) scene.load.spritesheet(`c_${k}_${a}`, url(`${k}_${a}`), { frameWidth: i.fs, frameHeight: i.fs });
  }
}

const RATE: Record<string, number> = { walk: 10, attack: 18, special: 12, die: 10 };
export function createCharAnims(scene: Phaser.Scene) {
  for (const [k, c] of Object.entries(CH)) for (const [a, i] of Object.entries(c.anims)) {
    if (!scene.textures.exists(`c_${k}_${a}`)) continue;
    i.dirs.forEach((d, r) => {
      const key = `c_${k}_${a}_${d}`;
      if (!scene.anims.exists(key)) scene.anims.create({ key, frames: scene.anims.generateFrameNumbers(`c_${k}_${a}`, { start: r * i.n, end: r * i.n + i.n - 1 }), frameRate: RATE[a] ?? 10, repeat: a === 'walk' ? -1 : 0 });
    });
  }
}

/** nearest available direction to dir index (0 = south, clockwise via east) */
function near(dirs: string[], d: number) {
  for (let k = 0; k < 8; k++) for (const s of [d + k, d - k]) { const n = DIRS[(s % 8 + 8) % 8]; if (dirs.includes(n)) return n; }
  return dirs[0];
}
export const hasAnim = (k: string, a: string) => !!CH[k]?.anims[a];
export function setIdle(sp: Phaser.GameObjects.Sprite, k: string, d: number) {
  const c = CH[k]; sp.anims.stop();
  sp.setTexture(`c_${k}_idle`, c.dirs.indexOf(near(c.dirs, d))).setOrigin(0.5, c.idleFoot / c.idleFs);
}
export function playAnim(sp: Phaser.GameObjects.Sprite, k: string, a: string, d: number, ignoreIfPlaying = true) {
  const i = CH[k]?.anims[a]; if (!i) return false;
  const key = `c_${k}_${a}_${near(i.dirs, d)}`;
  if (sp.texture.key !== `c_${k}_${a}`) sp.setTexture(`c_${k}_${a}`);
  sp.setOrigin(0.5, i.foot / i.fs).play(key, ignoreIfPlaying);
  return true;
}

/** PixelLab character per class line and form tier (0 = villager) */
const FORM_KEYS: Record<string, string[]> = {
  novice: ['hero'], sword: ['hero', 'hr1', 'hr2', 'hr3'], archer: ['hero', 'hr4', 'hr5', 'hr6'],
  mage: ['hero', 'hr7', 'hr8', 'hr9'], cleric: ['hero', 'hr10', 'hr11', 'hr12'],
};
export function formKeyOf(cls: string, tier: number) {
  const k = FORM_KEYS[cls]?.[tier] ?? 'hero';
  return CH[k] ? k : 'hero';
}
