// Character-form sheets (tools/import_forms.py -> src/assets/forms). 3 texture px per world px.
import Phaser from 'phaser';
import meta from '../assets/forms/meta.json';
import { strokeEnabled, strokeSheet } from './stroke';

type Meta = { w: number; h: number; n: number; ax: number; ay: number };
const M = meta as Record<string, Meta>;
const files = import.meta.glob('../assets/forms/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const url = (name: string) => Object.entries(files).find(([p]) => p.endsWith('/' + name + '.webp'))?.[1];
export const FORM_RES = 3;

export function preloadForms(scene: Phaser.Scene) {
  for (const [k, m] of Object.entries(M)) {
    const u = url(k);
    if (!u) continue;
    if (k.endsWith('_portrait')) scene.load.image('fp_' + k.replace('_portrait', ''), u);
    else scene.load.spritesheet('fs_' + k, u, { frameWidth: m.w, frameHeight: m.h });
  }
}

const RATE: Record<string, [number, number]> = { chop: [12, 0], mine: [12, 0], carry: [10, -1], idle: [5, -1], walk: [11, -1], walkup: [11, -1], attack: [16, 0], skill: [9, 0], die: [8, 0] };

export function applyForms(scene: Phaser.Scene) {
  for (const [k, m] of Object.entries(M)) {
    if (k.endsWith('_portrait')) continue;
    const key = 'fs_' + k;
    if (!scene.textures.exists(key)) continue;
    if (strokeEnabled()) strokeSheet(scene, key, m.w, m.h, 3);
    const tex = scene.textures.get(key);
    for (let i = 0; i < m.n; i++) { const f = tex.get(i); f.customPivot = true; f.pivotX = m.ax / m.w; f.pivotY = m.ay / m.h; }
    const anim = k.split('_')[1];
    const [rate, rep] = RATE[anim] ?? [8, -1];
    if (scene.anims.exists('f_' + k)) scene.anims.remove('f_' + k);
    scene.anims.create({ key: 'f_' + k, frames: scene.anims.generateFrameNumbers(key, {}), frameRate: rate, repeat: rep });
  }
}

export const hasForms = (scene: Phaser.Scene) => scene.anims.exists('f_V0_idle');

/** Resolve the anim key to use for a form code, with fallbacks for art not delivered yet. */
export function formAnim(scene: Phaser.Scene, code: string, anim: string): { key: string; tint?: number; fake?: 'die' } {
  let c = code, tint: number | undefined;
  // T2 art pending -> use the tank T3 sheet with a lighter bronze tint (shield + armour silhouette stays a tank)
  if (!scene.anims.exists(`f_${c}_idle`) && c.startsWith('T')) { c = scene.anims.exists('f_T3_idle') ? 'T3' : 'S' + c.slice(1); tint = c === 'T3' ? 0xd8c8a8 : 0x9098b0; }
  if (!scene.anims.exists(`f_${c}_idle`)) c = 'V0';
  const order: Record<string, string[]> = { chop: ['chop', 'attack'], mine: ['mine', 'chop', 'attack'], skill: ['skill', 'attack', 'idle'], attack: ['attack', 'idle'], die: ['die'], walkup: ['walkup', 'walk'], walk: ['walk'], idle: ['idle'] };
  for (const a of order[anim] ?? [anim]) if (scene.anims.exists(`f_${c}_${a}`)) return { key: `f_${c}_${a}`, tint };
  return { key: `f_${c}_idle`, tint, fake: anim === 'die' ? 'die' : undefined };
}

export function portraitKey(scene: Phaser.Scene, code: string) {
  if (scene.textures.exists('fp_' + code)) return 'fp_' + code;
  if (code.startsWith('T') && scene.textures.exists('fp_T3')) return 'fp_T3';
  return scene.textures.exists('fp_V0') ? 'fp_V0' : null;
}
