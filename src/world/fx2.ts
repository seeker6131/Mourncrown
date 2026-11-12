// Animated effects made by PixelLab's VFX artist (tools/gen_vfx2.py): spritesheet + JSON per effect in src/assets/td/fx.
// Loaded as atlases; each becomes one animation 'fx2_<key>' (looping effects repeat forever).
import Phaser from 'phaser';

const PNG = import.meta.glob('../assets/td/fx/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const JSON_ = import.meta.glob('../assets/td/fx/*.json', { eager: true, import: 'default' }) as Record<string, FxSheet>;
interface FxSheet { frames: { filename: string; duration: number; frame: { w: number; h: number } }[]; meta: { anchor?: { x: number; y: number } } }
/** effects that loop (the others play once) */
const LOOP = new Set(['fx_brazier', 'fx_fountain', 'fx_shield', 'fx_build', 'fx_portal', 'fx_drop_epic', 'fx_drop_legend', 'fx_drop_sl', 'fx_elite_aura', 'fx_bld_fire', 'fx_smoke', 'fx_ruin_fire', 'fx_ring_hero', 'fx_ring_mon', 'fx_boss_aura']);
const name = (p: string) => p.split('/').pop()!.replace(/\.(png|json)$/, '');
const sheets: Record<string, FxSheet> = Object.fromEntries(Object.entries(JSON_).map(([p, j]) => [name(p), j]));

/** effects placed while a scene is being built (they must exist before it shows); everything else loads behind the game */
const FIRST = new Set(['fx_portal', 'fx_ring_hero', 'fx_ring_mon', 'fx_boss_aura', 'fx_brazier', 'fx_fountain', 'fx_elite_aura', 'fx_golden_spawn', 'fx_boss_spawn',
  'fx_bld_fire', 'fx_smoke', 'fx_ruin_fire', 'fx_build', 'fx_hit_sword', 'fx_hit_arrow', 'fx_hit_magic', 'fx_hit_punch', 'fx_hit_holy', 'fx_hit_crit', 'fx_mon_death']);
/** first = only the effects a scene needs at once; later = the rest (call after the scene is up) */
export function preloadFx2(scene: Phaser.Scene, part: 'first' | 'later' | 'all' = 'all') {
  for (const [p, url] of Object.entries(PNG)) {
    const k = name(p); if (!sheets[k] || scene.textures.exists('fx2_' + k)) continue;
    if (part === 'first' && !FIRST.has(k)) continue; if (part === 'later' && FIRST.has(k)) continue;
    scene.load.atlas('fx2_' + k, url, sheets[k] as never);
  }
}
export function createFx2Anims(scene: Phaser.Scene) {
  for (const [k, j] of Object.entries(sheets)) {
    if (!scene.textures.exists('fx2_' + k) || scene.anims.exists('fx2_' + k)) continue;
    const ms = j.frames.reduce((a, f) => a + (f.duration || 83), 0) / Math.max(1, j.frames.length);
    scene.anims.create({ key: 'fx2_' + k, frames: j.frames.map(f => ({ key: 'fx2_' + k, frame: f.filename })), frameRate: 1000 / ms, repeat: LOOP.has(k) ? -1 : 0 });
  }
}
/** a sprite playing the effect, its anchor (feet / centre from the artist) at (x, y); one-shot effects remove themselves */
export function fx2(scene: Phaser.Scene, key: string, x: number, y: number, depth?: number, scale = 1) {
  const j = sheets[key]; if (!j || !scene.anims.exists('fx2_' + key)) return null;
  const f = j.frames[0].frame, a = j.meta.anchor ?? { x: f.w / 2, y: f.h / 2 };
  const sp = scene.add.sprite(Math.round(x), Math.round(y), 'fx2_' + key, j.frames[0].filename).setOrigin(a.x / f.w, a.y / f.h).setDepth(depth ?? y).setScale(scale);
  sp.play('fx2_' + key);
  if (!LOOP.has(key)) sp.once('animationcomplete', () => sp.destroy());
  return sp;
}
export const hasFx2 = (key: string) => !!sheets[key];
