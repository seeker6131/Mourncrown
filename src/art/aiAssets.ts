// Imported art made by the Game Director with an image generator (processed by tools/import_ai_assets.py).
// Loaded at boot; replaces procedural textures where available, procedural art remains the fallback.
import Phaser from 'phaser';
import { strokeEnabled, strokeImage } from './stroke';

// artifact build (16 MB page cap): skip art that is not placed in the game yet
const files = (import.meta.env.MODE === 'single'
  ? import.meta.glob(['../assets/ai/*.{png,jpg,webp}', '!../assets/ai/pr_vil*', '!../assets/ai/bld_townhall*', '!../assets/ai/bld_house*'], { eager: true, query: '?url', import: 'default' })
  : import.meta.glob('../assets/ai/*.{png,jpg,webp}', { eager: true, query: '?url', import: 'default' })) as Record<string, string>;

export function preloadAi(scene: Phaser.Scene) {
  for (const [path, url] of Object.entries(files)) {
    const name = path.split('/').pop()!.replace(/\.(png|jpg|webp)$/, '');
    scene.load.image('ai_' + name, url);
  }
}

const HIRES = new Set<string>();
/** Texture resolution factor: AI world art is stored at 2x and drawn at 0.5 scale. */
export function resOf(key: string): number {
  if (key.startsWith('fs_')) return 3;
  if (HIRES.has(key)) return 2;
  if (key.startsWith('aihero_') || key.startsWith('an_')) return 2;
  if (key.startsWith('ai_') && !key.startsWith('ai_icon_') && !key.startsWith('ai_tile_') && key !== 'ai_keyart') return 2;
  return 1;
}

export function hasAi(scene: Phaser.Scene, name: string) { return scene.textures.exists('ai_' + name); }

function srcOf(scene: Phaser.Scene, name: string) {
  return scene.textures.get('ai_' + name).getSourceImage() as HTMLImageElement;
}

/** Replace texture `key` with ai image `name`, optionally flipped / tinted / scaled. */
export function aliasAi(scene: Phaser.Scene, key: string, name: string, opts: { flip?: boolean; tint?: string; scale?: number } = {}) {
  if (!hasAi(scene, name)) return false;
  const img = srcOf(scene, name);
  const s = opts.scale ?? 1;
  const cv = document.createElement('canvas');
  cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
  const ctx = cv.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  if (opts.flip) { ctx.translate(cv.width, 0); ctx.scale(-1, 1); }
  ctx.drawImage(img, 0, 0, cv.width, cv.height);
  if (opts.tint) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = opts.tint; ctx.fillRect(0, 0, cv.width, cv.height);
  }
  if (scene.textures.exists(key)) scene.textures.remove(key);
  scene.textures.addCanvas(key, cv);
  if (!name.startsWith('icon_') && !name.startsWith('tile_')) HIRES.add(key); else HIRES.delete(key);
  return true;
}

/** Pixel data of an ai image (for the ground painter). */
export function aiPixels(scene: Phaser.Scene, name: string): { d: Uint8ClampedArray; w: number; h: number } | null {
  if (!hasAi(scene, name)) return null;
  const img = srcOf(scene, name);
  const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
  const ctx = cv.getContext('2d')!; ctx.drawImage(img, 0, 0);
  return { d: ctx.getImageData(0, 0, img.width, img.height).data, w: img.width, h: img.height };
}

/** Hue-shift the blue tunic of the hero for armour tiers. */
export function recolorHero(scene: Phaser.Scene, armor: number) {
  const out: string[] = [];
  for (let i = 0; i < 8; i++) {
    const key = `aihero_a${armor}_${i}`;
    out.push(key);
    if (scene.textures.exists(key)) continue;
    const img = srcOf(scene, `hero_${i}`);
    const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
    const ctx = cv.getContext('2d')!; ctx.drawImage(img, 0, 0);
    if (armor >= 1) {
      const id = ctx.getImageData(0, 0, cv.width, cv.height); const d = id.data;
      for (let p = 0; p < d.length; p += 4) {
        if (!d[p + 3]) continue;
        const c = Phaser.Display.Color.RGBToHSV(d[p], d[p + 1], d[p + 2]) as { h: number; s: number; v: number };
        if (c.h < 0.53 || c.h > 0.72 || c.s < 0.3) continue; // only the blue cloth
        let h = c.h, s = c.s, v = c.v;
        if (armor === 1) { h = 0.07; s = Math.min(1, s * 0.9); v *= 0.95; }        // leather
        else if (armor === 2) { s *= 0.12; v = Math.min(1, v * 1.25); }            // steel
        else { h = 0.12; s = Math.min(1, s * 1.05 + 0.1); v = Math.min(1, v * 1.35); } // gold
        const rgb = Phaser.Display.Color.HSVToRGB(h, s, v) as { r: number; g: number; b: number };
        d[p] = rgb.r; d[p + 1] = rgb.g; d[p + 2] = rgb.b;
      }
      ctx.putImageData(id, 0, 0);
    }
    scene.textures.addCanvas(key, cv);
  }
  return out;
}

/** Apply all aliases after procedural generation. */
export function applyAiArt(scene: Phaser.Scene) {
  if (strokeEnabled()) for (const k of scene.textures.getTextureKeys()) {
    if (!k.startsWith('ai_') || k.startsWith('ai_icon_') || k.startsWith('ai_tile_') || k === 'ai_keyart') continue;
    strokeImage(scene, k, 2);
  }
  if (!hasAi(scene, 'house_0')) return;
  const A = (k: string, n: string, o?: Parameters<typeof aliasAi>[3]) => aliasAi(scene, k, n, o);
  // icons (32px)
  for (const n of ['sword0', 'sword1', 'sword2', 'sword3', 'staff0', 'armor0', 'armor1', 'armor2', 'armor3', 'ring0', 'amulet0', 'amulet1', 'potion_hp', 'potion_mp', 'shard', 'gold']) A('icon_' + n, 'icon_' + n);
  A('icon_potion_hp_l', 'icon_potion_hp', { tint: 'rgba(255,60,160,0.25)' });
  A('icon_gem0', 'icon_ring0');
  // trees
  A('obj_tree_0', 'tree_oak'); A('obj_tree_1', 'tree_oak', { tint: 'rgba(10,40,20,0.35)' }); A('obj_tree_2', 'tree_magic');
  A('obj_tree_3', 'tree_blossom'); A('obj_tree_4', 'tree_autumn'); A('obj_tree_5', 'tree_dead');
  for (const v of [0, 1, 2]) A(`obj_pine_${v}`, 'tree_pine', v === 2 ? { tint: 'rgba(20,120,110,0.25)' } : undefined);
  // props
  A('obj_barrel_0', 'barrel'); A('obj_crate_0', 'crate'); A('obj_chest_0', 'chest_0'); A('obj_chest_1', 'chest_1');
  A('obj_lamp_0', 'lamp'); A('obj_sign_0', 'sign'); A('obj_well_0', 'well'); A('obj_haystack_0', 'haystack');
  A('obj_rock_0', 'rock', { scale: 0.7 }); A('obj_rock_1', 'rock', { scale: 0.85 }); A('obj_bigrock_0', 'rock', { scale: 1.25 });
  A('obj_bush_0', 'bush'); A('obj_bush_1', 'bush');
  A('obj_fence_0', 'fence', { flip: true }); A('obj_fence_1', 'fence');
  A('obj_stall_0', 'stall'); A('obj_altar_0', 'ruin_altar');
  for (let v = 0; v < 10; v++) { A(`obj_pillar_${v}`, 'ruin_pillar'); A(`obj_brokenpillar_${v}`, 'ruin_broken'); }
  A('obj_statue_0', 'ruin_statue'); A('obj_arch_0', 'ruin_arch'); A('obj_stairs_0', 'ruin_stairs');
  // stone wall segments: ai wall runs along iso Y ("/"); X-oriented ones are mirrored
  for (let sd = 0; sd < 3; sd++) { A(`obj_wall_${sd}`, 'ruin_wall', { flip: true }); A(`obj_wall_${3 + sd}`, 'ruin_wall'); }
  A('obj_house_0', 'house_0'); A('obj_house_1', 'house_1'); A('obj_building_0', 'smithy'); A('obj_building_1', 'tower');
  // monsters: single-frame animations (motion is added in code)
  const kinds = ['slime', 'shroom', 'wolf', 'goblin', 'wisp'];
  for (const k of kinds) {
    if (!hasAi(scene, 'mon_' + k)) continue;
    for (const a of ['idle', 'move', 'attack', 'hurt']) {
      scene.anims.remove(`mon_${k}_${a}`);
      scene.anims.create({ key: `mon_${k}_${a}`, frames: [{ key: 'ai_mon_' + k }], frameRate: 1, repeat: a === 'idle' || a === 'move' ? -1 : 0, duration: a === 'attack' ? 450 : a === 'hurt' ? 150 : undefined });
    }
  }
  if (hasAi(scene, 'boss_0')) {
    const set: Record<string, string[]> = { idle: ['boss_0'], move: ['boss_0'], attack: ['boss_1', 'boss_1', 'boss_0'], hurt: ['boss_0'], cast: ['boss_2', 'boss_2', 'boss_2', 'boss_0'] };
    for (const [a, fr] of Object.entries(set)) {
      scene.anims.remove(`mon_treant_${a}`);
      scene.anims.create({ key: `mon_treant_${a}`, frames: fr.map(f => ({ key: 'ai_' + f })), frameRate: 3, repeat: a === 'idle' || a === 'move' ? -1 : 0 });
    }
  }
}

/** Monsters whose ai art faces left (procedural art faces right). */
export const AI_FACES_LEFT: Record<string, boolean> = { slime: true, shroom: true, wolf: true, goblin: true, wisp: true, treant: true, deer: false, boar: true, skeleton: false, skarcher: true, ghost: true, imp: true, golem: true, salamander: false, icewolf: true, yeti: true, spider: true, rat: false, stag: true, frostgiant: true, dragon: true, skking: true };
