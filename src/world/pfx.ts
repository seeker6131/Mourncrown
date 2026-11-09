// Skill effects from pixelfx (https://github.com/patch-gg/pixelfx, MIT — src/assets/pfx/LICENSE.txt).
// Sheets are made by tools/import_pfx.py; only the effects of the hero's current skills are loaded (they are big).
import Phaser from 'phaser';
import meta from '../assets/pfx/pfx.json';

const FILES = import.meta.glob('../assets/pfx/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const URL: Record<string, string> = Object.fromEntries(Object.entries(FILES).map(([p, u]) => [p.split('/').pop()!.replace('.webp', ''), u]));
type Meta = { fw: number; fh: number; n: number; fps: number; px: number; py: number; peak: number };
export const PFX_META = meta as Record<string, Meta>;

/** where an effect plays: on the hero, just in front of the hero, on every target, or where the hero lands (dash / leap) */
export type At = 'hero' | 'front' | 'target' | 'land';
export interface Use { fx: string; at: At; delay?: number; scale?: number; flip?: boolean; behind?: boolean }
const U = (fx: string, at: At, o: Partial<Use> = {}): Use => ({ fx, at, ...o });
/** every skill -> its effects (chosen to match the skill's look and element) */
export const SKILL_PFX: Record<string, Use[]> = {
  v_bash: [U('sword-slash', 'front')],
  s2_cleave: [U('heavy-cleave', 'front', { scale: 1.2 })],
  s2_whirl: [U('spin-slash', 'hero', { scale: 1.1 })],
  s2_guard: [U('divine-shield', 'hero', { scale: 1.2 })],
  s3_charge: [U('thrust', 'hero'), U('crit-hit', 'land', { delay: 200 })],
  s3_crusade: [U('double-slash', 'front', { scale: 1.2 })],
  s3_valor: [U('fire-ring', 'hero', { scale: 0.7, behind: true }), U('charge-up', 'hero', { scale: 0.9 })],
  s4_judgment: [U('smite', 'land', { delay: 300, scale: 1.1 }), U('sunburst', 'land', { delay: 340, scale: 1.1 })],
  s4_blades: [U('holy-pillar', 'target', { scale: 0.6 })],
  s4_aegis: [U('divine-shield', 'hero', { scale: 1.4 }), U('blessing', 'hero')],
  a2_double: [U('hit-spark', 'target', { delay: 180, scale: 0.7 })],
  a2_fan: [U('hit-spark', 'target', { delay: 180, scale: 0.7 })],
  a2_focus: [U('leaf-storm', 'hero', { scale: 0.9 })],
  a3_pierce: [U('hit-spark', 'target', { delay: 200, scale: 0.8 })],
  a3_rain: [U('hit-spark', 'target', { delay: 700, scale: 0.8 })],
  a3_trap: [U('root-snare', 'hero', { scale: 1.6 }), U('thorns', 'hero', { scale: 0.9 })],
  a4_spirit: [U('hit-spark', 'target', { delay: 200, scale: 0.9 }), U('leaf-storm', 'hero', { scale: 0.7 })],
  a4_storm: [U('thorns', 'target', { delay: 650, scale: 0.4 })],
  a4_wind: [U('leaf-storm', 'hero', { scale: 1.1 })],
  m2_bolt: [U('ice-shatter', 'target', { delay: 260, scale: 0.6 })],
  m2_fire: [U('small-explosion', 'target', { delay: 300, scale: 0.6 })],
  m2_heal: [U('heal', 'hero', { scale: 1.3 })],
  m3_chain: [U('lightning-strike', 'target', { scale: 0.5 })],
  m3_arcane: [U('magic-circle-cast', 'hero', { scale: 0.5, behind: true }), U('mana-burst', 'hero', { scale: 0.8, delay: 120 })],
  m3_volley: [U('mana-burst', 'target', { delay: 300, scale: 0.35 })],
  m4_meteor: [U('meteor', 'target', { scale: 0.55 })],
  m4_void: [U('shadow-tendrils', 'target', { delay: 220, scale: 0.6 })],
  m4_dread: [U('dark-explosion', 'hero', { scale: 0.75 })],
  t2_slam: [U('blunt-hit', 'front', { scale: 1.1 })],
  t2_wall: [U('divine-shield', 'hero', { scale: 1.2 })],
  t2_recover: [U('heal', 'hero', { scale: 1.2 })],
  t3_quake: [U('quake', 'hero', { scale: 0.7 }), U('ground-slam', 'hero', { scale: 0.6 })],
  t3_ram: [U('thrust', 'hero'), U('heavy-landing', 'land', { delay: 200 })],
  t3_bulwark: [U('divine-shield', 'hero', { scale: 1.3 })],
  t4_titan: [U('ground-slam', 'land', { delay: 330, scale: 0.8 }), U('dirt-explosion', 'land', { delay: 340, scale: 0.55 })],
  t4_fortress: [U('blessing', 'hero', { scale: 1.2 }), U('divine-shield', 'hero', { scale: 1.3 })],
  t4_lion: [U('hammer-smash', 'hero', { scale: 0.9 }), U('spin-slash', 'hero', { delay: 300 })],
};
export const COMMON_PFX = ['hit-spark', 'crit-hit'];
export const pfxFor = (skills: (string | null | undefined)[]) => [...new Set([...COMMON_PFX, ...skills.flatMap(id => (id ? SKILL_PFX[id] ?? [] : []).map(u => u.fx))])];

/** load the sheets that aren't loaded yet (works before or after the scene started) */
export function ensurePfx(scene: Phaser.Scene, keys: string[]) {
  let n = 0;
  for (const k of keys) {
    const m = PFX_META[k], tk = 'pfx_' + k; if (!m || !URL[k] || scene.textures.exists(tk)) continue;
    scene.load.spritesheet(tk, URL[k], { frameWidth: m.fw, frameHeight: m.fh }); n++;
  }
  if (!n) return;
  const make = () => { for (const k of keys) { const m = PFX_META[k], tk = 'pfx_' + k; if (m && scene.textures.exists(tk) && !scene.anims.exists(tk)) scene.anims.create({ key: tk, frames: scene.anims.generateFrameNumbers(tk, { start: 0, end: m.n - 1 }), frameRate: m.fps, repeat: 0 }); } };
  scene.load.once(Phaser.Loader.Events.COMPLETE, make);
  if (!scene.load.isLoading()) scene.load.start();
}
/** play one effect with its pivot on (x, y); returns ms until its flash (for timing damage), or -1 if not loaded */
export function playPfx(scene: Phaser.Scene, key: string, x: number, y: number, o: { scale?: number; flip?: boolean; depth?: number; delay?: number } = {}) {
  const m = PFX_META[key], tk = 'pfx_' + key;
  if (!m || !scene.anims.exists(tk)) return -1;
  const go = () => {
    const sp = scene.add.sprite(Math.round(x), Math.round(y), tk, 0).setOrigin(m.px / m.fw, m.py / m.fh).setScale(o.scale ?? 1).setFlipX(!!o.flip).setDepth(o.depth ?? 99952);
    sp.play(tk); sp.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => sp.destroy());
  };
  if (o.delay) scene.time.delayedCall(o.delay, go); else go();
  return (o.delay ?? 0) + m.peak * 1000 / m.fps;
}
