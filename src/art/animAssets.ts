// Multi-frame animation sheets made by the Game Director (processed by tools/import_anims.py).
import Phaser from 'phaser';
import meta from '../assets/anim/meta.json';

type Meta = { w: number; h: number; n: number; ax: number; ay: number };
const M = meta as Record<string, Meta>;
const files = import.meta.glob('../assets/anim/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const url = (name: string) => Object.entries(files).find(([p]) => p.endsWith('/' + name + '.png'))?.[1];

export function preloadAnims(scene: Phaser.Scene) {
  for (const [k, m] of Object.entries(M)) {
    const u = url(k);
    if (u) scene.load.spritesheet('an_' + k, u, { frameWidth: m.w, frameHeight: m.h });
  }
  for (const s of ['cyclone', 'flame', 'thunder', 'heal']) { const u = url('skill_' + s); if (u) scene.load.image('an_skill_' + s, u); }
}

export const hasAnim = (scene: Phaser.Scene, key: string) => scene.anims.exists(key);

/** Set every frame's pivot to the feet anchor so swapping strips never jumps. */
function pivot(scene: Phaser.Scene, texKey: string, m: Meta) {
  const tex = scene.textures.get(texKey);
  for (let i = 0; i < m.n; i++) {
    const f = tex.get(i);
    f.customPivot = true; f.pivotX = m.ax / m.w; f.pivotY = (m.ay - 1) / m.h;
  }
}

function mk(scene: Phaser.Scene, key: string, tex: string, rate: number, repeat: number, frames?: number[]) {
  if (!scene.textures.exists(tex)) return;
  const n = scene.textures.get(tex).frameTotal - 1;
  if (scene.anims.exists(key)) scene.anims.remove(key);
  scene.anims.create({ key, frames: scene.anims.generateFrameNumbers(tex, { frames: frames ?? [...Array(n).keys()] }), frameRate: rate, repeat });
}

/** Recoloured copy of a hero strip for armour tiers (blue cloth -> leather / steel / gold). */
function heroStrip(scene: Phaser.Scene, anim: string, armor: number): string {
  const base = `an_hero_${anim}`;
  if (armor <= 0) return base;
  const key = `${base}_a${armor}`;
  if (scene.textures.exists(key)) return key;
  const img = scene.textures.get(base).getSourceImage() as HTMLImageElement;
  const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
  const ctx = cv.getContext('2d')!; ctx.drawImage(img, 0, 0);
  const id = ctx.getImageData(0, 0, cv.width, cv.height); const d = id.data;
  for (let p = 0; p < d.length; p += 4) {
    if (!d[p + 3]) continue;
    const c = Phaser.Display.Color.RGBToHSV(d[p], d[p + 1], d[p + 2]) as { h: number; s: number; v: number };
    if (c.h < 0.53 || c.h > 0.72 || c.s < 0.3) continue;
    let h = c.h, s = c.s, v = c.v;
    if (armor === 1) { h = 0.07; s *= 0.9; v *= 0.95; } else if (armor === 2) { s *= 0.12; v = Math.min(1, v * 1.25); } else { h = 0.12; s = Math.min(1, s + 0.1); v = Math.min(1, v * 1.35); }
    const rgb = Phaser.Display.Color.HSVToRGB(h, s, v) as { r: number; g: number; b: number };
    d[p] = rgb.r; d[p + 1] = rgb.g; d[p + 2] = rgb.b;
  }
  ctx.putImageData(id, 0, 0);
  const m = M[`hero_${anim}`];
  scene.textures.addSpriteSheet(key, cv as unknown as HTMLImageElement, { frameWidth: m.w, frameHeight: m.h });
  pivot(scene, key, m);
  return key;
}

export const HERO_ANIMS: Record<string, [number, number]> = { idle: [5, -1], walk: [11, -1], walkup: [11, -1], attack: [20, 0], cast: [10, 0], die: [7, 0] };

/** Ensure hero animations for an armour look exist; returns the anim key prefix. */
export function ensureHeroAnims(scene: Phaser.Scene, armor: number): string {
  const pre = `h${Math.max(0, armor)}_`;
  if (scene.anims.exists(pre + 'idle')) return pre;
  for (const [a, [rate, rep]] of Object.entries(HERO_ANIMS)) mk(scene, pre + a, heroStrip(scene, a, armor), rate, rep);
  mk(scene, pre + 'idleup', heroStrip(scene, 'walkup', armor), 1, -1, [0]);
  mk(scene, pre + 'hurt', heroStrip(scene, 'die', armor), 10, 0, [0, 1]);
  return pre;
}

export function applyAnims(scene: Phaser.Scene) {
  for (const [k, m] of Object.entries(M)) if (scene.textures.exists('an_' + k)) pivot(scene, 'an_' + k, m);
  if (!scene.textures.exists('an_hero_idle')) return;
  ensureHeroAnims(scene, 0);
  for (const k of ['slime', 'shroom', 'wolf', 'goblin', 'wisp']) {
    mk(scene, `mon_${k}_idle`, `an_mon_${k}_move`, 4, -1);
    mk(scene, `mon_${k}_move`, `an_mon_${k}_move`, 9, -1);
    mk(scene, `mon_${k}_attack`, `an_mon_${k}_attack`, 9, 0);
    mk(scene, `mon_${k}_hurt`, `an_mon_${k}_attack`, 10, 0, [0]);
  }
  mk(scene, 'mon_treant_idle', 'an_mon_treant_move', 2, -1, [0, 3]);
  mk(scene, 'mon_treant_move', 'an_mon_treant_move', 5, -1);
  mk(scene, 'mon_treant_attack', 'an_mon_treant_attack', 7, 0);
  mk(scene, 'mon_treant_cast', 'an_mon_treant_cast', 5, 0);
  mk(scene, 'mon_treant_hurt', 'an_mon_treant_die', 10, 0, [0]);
  mk(scene, 'mon_treant_die', 'an_mon_treant_die', 4, 0);
  for (const id of ['elder', 'merchant', 'smith']) mk(scene, `npc_${id}_idle`, `an_npc_${id}_idle`, 3, -1, [0, 1, 0, 2, 0, 3]);
  const fx: [string, number, number][] = [['slash', 26, 0], ['fireball', 14, -1], ['explode', 16, 0], ['bolt', 18, 0], ['heal', 11, 0], ['lvlup', 9, 0], ['smoke', 14, 0], ['hit', 26, 0]];
  for (const [k, r, rep] of fx) mk(scene, `fxa_${k}`, `an_fx_${k}`, r, rep);
  mk(scene, 'env_campfire', 'an_env_campfire', 10, -1);
  mk(scene, 'env_lamp', 'an_env_lamp', 7, -1);
  mk(scene, 'env_smoke', 'an_env_smoke', 5, 0);
  mk(scene, 'env_flag', 'an_env_flag', 8, -1);
  // skill icons
  for (const s of ['cyclone', 'flame', 'thunder', 'heal']) {
    const src = 'an_skill_' + s, dst = 'icon_sk_' + s;
    if (!scene.textures.exists(src)) continue;
    if (scene.textures.exists(dst)) scene.textures.remove(dst);
    scene.textures.addImage(dst, scene.textures.get(src).getSourceImage() as HTMLImageElement);
  }
}
