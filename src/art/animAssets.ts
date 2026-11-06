// Multi-frame animation sheets made by the Game Director (processed by tools/import_anims.py).
import Phaser from 'phaser';
import meta from '../assets/anim/meta.json';
import { strokeEnabled, strokeSheet } from './stroke';
import { CLASSES, type ClassId } from '../data/classes';

type Meta = { w: number; h: number; n: number; ax: number; ay: number };
const M = meta as Record<string, Meta>;
// The single-file (artifact) build leaves out art of regions that are not playable yet (16 MB page limit).
const files = (import.meta.env.MODE === 'single'
  ? import.meta.glob(['../assets/anim/*.webp', '!../assets/anim/mon_{rat,skeleton,skarcher,ghost,spider,imp,golem,salamander,icewolf,yeti,stag,dragon,frostgiant,skking}_*'], { eager: true, query: '?url', import: 'default' })
  : import.meta.glob('../assets/anim/*.webp', { eager: true, query: '?url', import: 'default' })) as Record<string, string>;
const url = (name: string) => Object.entries(files).find(([p]) => p.endsWith('/' + name + '.webp'))?.[1];

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

/** Recoloured copy of a hero strip: tunic colour per class, richer per form. */
function heroStrip(scene: Phaser.Scene, anim: string, cls: ClassId, tier: number): string {
  const base = `an_hero_${anim}`;
  const cloth = CLASSES[cls].cloth;
  if (!cloth && tier <= 1) return base;
  const key = `${base}_${cls}${tier}`;
  if (scene.textures.exists(key)) return key;
  const img = scene.textures.get(base).getSourceImage() as HTMLImageElement;
  const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
  const ctx = cv.getContext('2d')!; ctx.drawImage(img, 0, 0);
  const id = ctx.getImageData(0, 0, cv.width, cv.height); const d = id.data;
  for (let p = 0; p < d.length; p += 4) {
    if (!d[p + 3]) continue;
    const c = Phaser.Display.Color.RGBToHSV(d[p], d[p + 1], d[p + 2]) as { h: number; s: number; v: number };
    if (c.h < 0.53 || c.h > 0.72 || c.s < 0.3) continue; // the blue tunic only
    let h = c.h, sat = c.s, v = c.v;
    if (cloth) { h = cloth.h; sat = Math.min(1, c.s * cloth.s / 0.6); v = Math.min(1, c.v * cloth.v); }
    if (tier >= 2) { sat = Math.min(1, sat * 1.15); v = Math.min(1, v * 1.08); }
    if (tier >= 3) { v = Math.min(1, v * 1.08); }
    const rgb = Phaser.Display.Color.HSVToRGB(h, sat, v) as { r: number; g: number; b: number };
    d[p] = rgb.r; d[p + 1] = rgb.g; d[p + 2] = rgb.b;
  }
  ctx.putImageData(id, 0, 0);
  const m = M[`hero_${anim}`];
  scene.textures.addSpriteSheet(key, cv as unknown as HTMLImageElement, { frameWidth: m.w, frameHeight: m.h });
  pivot(scene, key, m);
  return key;
}

export const HERO_ANIMS: Record<string, [number, number]> = { idle: [5, -1], walk: [11, -1], walkup: [11, -1], attack: [20, 0], cast: [10, 0], die: [7, 0] };

/** Ensure hero animations for a class/form exist; returns the anim key prefix. */
export function ensureHeroAnims(scene: Phaser.Scene, cls: ClassId = 'novice', tier = 0): string {
  const pre = `h_${cls}${tier}_`;
  if (scene.anims.exists(pre + 'idle')) return pre;
  for (const [a, [rate, rep]] of Object.entries(HERO_ANIMS)) mk(scene, pre + a, heroStrip(scene, a, cls, tier), rate, rep);
  mk(scene, pre + 'idleup', heroStrip(scene, 'walkup', cls, tier), 1, -1, [0]);
  mk(scene, pre + 'hurt', heroStrip(scene, 'die', cls, tier), 10, 0, [0, 1]);
  return pre;
}

export function applyAnims(scene: Phaser.Scene) {
  if (strokeEnabled()) for (const [k, m] of Object.entries(M)) {
    if (k.startsWith('fx_') || k === 'env_smoke' || !scene.textures.exists('an_' + k)) continue;
    strokeSheet(scene, 'an_' + k, m.w, m.h, 2);
  }
  for (const [k, m] of Object.entries(M)) if (scene.textures.exists('an_' + k)) pivot(scene, 'an_' + k, m);
  if (!scene.textures.exists('an_hero_idle')) return;
  ensureHeroAnims(scene, 'novice', 0);
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
  // batch-2 monsters & bosses (move/attack[/cast/die])
  for (const k of Object.keys(M)) {
    const mm = /^mon_(\w+)_move$/.exec(k);
    if (!mm || ['slime', 'shroom', 'wolf', 'goblin', 'wisp', 'treant'].includes(mm[1]) || !scene.textures.exists('an_' + k)) continue;
    const kind = mm[1], boss = !!M[`mon_${kind}_die`];
    mk(scene, `mon_${kind}_idle`, `an_mon_${kind}_move`, boss ? 2 : 4, -1, boss ? [0, 3] : undefined);
    mk(scene, `mon_${kind}_move`, `an_mon_${kind}_move`, boss ? 5 : 8, -1);
    mk(scene, `mon_${kind}_attack`, `an_mon_${kind}_attack`, boss ? 7 : 9, 0);
    mk(scene, `mon_${kind}_hurt`, `an_mon_${kind}_attack`, 10, 0, [0]);
    if (M[`mon_${kind}_cast`]) mk(scene, `mon_${kind}_cast`, `an_mon_${kind}_cast`, 5, 0);
    if (boss) mk(scene, `mon_${kind}_die`, `an_mon_${kind}_die`, 4, 0);
  }
  // wild animals hunted on the resource map (walk sheet only)
  for (const k of ['deer', 'boar']) {
    const t = `an_ani_${k}_walk`;
    mk(scene, `mon_${k}_idle`, t, 1, -1, [0]);
    mk(scene, `mon_${k}_move`, t, 11, -1);
    mk(scene, `mon_${k}_attack`, t, 18, 0, [2, 3, 4, 5]);
    mk(scene, `mon_${k}_hurt`, t, 10, 0, [1]);
  }
  // village life
  for (const k of Object.keys(M)) {
    const m = /^(ani|vil)_(\w+?)_(walk|run|work|idle|walkup|attack|die)$/.exec(k);
    if (m) mk(scene, k, 'an_' + k, m[3] === 'run' ? 12 : m[3] === 'work' ? 6 : m[3] === 'idle' ? 4 : 8, m[3] === 'attack' || m[3] === 'die' ? 0 : -1);
  }
  for (const k of ['arrow', 'arrowrain', 'ice', 'holy', 'flame', 'poison', 'shield', 'rage', 'wood', 'rock', 'dust', 'coins']) if (M['fx2_' + k]) mk(scene, 'fx2_' + k, 'an_fx2_' + k, 14, 0);
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
