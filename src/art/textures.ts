// Registers all procedurally generated art as Phaser textures + animations.
import Phaser from 'phaser';
import { PixelCanvas } from './pixel';
import { drawHero, heroAnims, HERO_FRAME, type Dir } from './heroArt';
import { buildMonster } from './monsterArt';
import * as W from './worldArt';
import { buildIcons, buildVfx } from './iconArt';
import * as I from './isoArt';

export const HOUSE_ANCHOR = { ax: 0, ay: 0 };
import type { MonsterKind } from '../data/monsters';

function addSheet(scene: Phaser.Scene, key: string, groups: { name: string; frames: PixelCanvas[] }[]) {
  const fw = groups[0].frames[0].w, fh = groups[0].frames[0].h;
  const cols = Math.max(...groups.map(g => g.frames.length));
  const cv = document.createElement('canvas');
  cv.width = fw * cols; cv.height = fh * groups.length;
  const ctx = cv.getContext('2d')!;
  groups.forEach((g, row) => g.frames.forEach((f, i) => f.drawTo(ctx, i * fw, row * fh)));
  const tex = scene.textures.addCanvas(key, cv)!;
  groups.forEach((g, row) => g.frames.forEach((_, i) => tex.add(`${g.name}_${i}`, 0, i * fw, row * fh, fw, fh)));
  return tex;
}

function addSingle(scene: Phaser.Scene, key: string, p: PixelCanvas | HTMLCanvasElement, scale = 1) {
  if (scene.textures.exists(key)) return;
  if (p instanceof PixelCanvas) {
    const cv0 = document.createElement('canvas'); cv0.width = p.w; cv0.height = p.h;
    p.drawTo(cv0.getContext('2d')!, 0, 0);
    const cv = document.createElement('canvas'); cv.width = p.w * scale; cv.height = p.h * scale;
    const cx = cv.getContext('2d')!; cx.imageSmoothingEnabled = false; cx.drawImage(cv0, 0, 0, cv.width, cv.height);
    scene.textures.addCanvas(key, cv);
  } else scene.textures.addCanvas(key, p);
}

/** Hero texture for a given equipment look. Generated lazily & cached. */
export function ensureHeroTexture(scene: Phaser.Scene, armor: number, weapon: number): string {
  const key = `hero_a${armor}_w${weapon}`;
  if (scene.textures.exists(key)) return key;
  const groups: { name: string; frames: PixelCanvas[]; rate: number; repeat: number; dir: Dir; anim: string }[] = [];
  for (const dir of ['down', 'up', 'side'] as Dir[]) {
    for (const a of heroAnims(dir)) {
      groups.push({ name: `${dir}_${a.name}`, frames: a.frames.map(p => drawHero(dir, p, armor, weapon)), rate: a.rate, repeat: a.repeat, dir, anim: a.name });
    }
  }
  addSheet(scene, key, groups);
  for (const g of groups) {
    scene.anims.create({
      key: `${key}_${g.name}`,
      frames: g.frames.map((_, i) => ({ key, frame: `${g.name}_${i}` })),
      frameRate: g.rate, repeat: g.repeat,
    });
  }
  return key;
}

export const MONSTER_KINDS: MonsterKind[] = ['slime', 'shroom', 'wolf', 'goblin', 'wisp', 'treant'];

export function generateAll(scene: Phaser.Scene) {
  // monsters
  for (const kind of MONSTER_KINDS) {
    const sheet = buildMonster(kind);
    const key = `mon_${kind}`;
    const groups = Object.entries(sheet.anims).map(([name, a]) => ({ name, frames: a.frames }));
    addSheet(scene, key, groups);
    for (const [name, a] of Object.entries(sheet.anims)) {
      scene.anims.create({ key: `${key}_${name}`, frames: a.frames.map((_, i) => ({ key, frame: `${name}_${i}` })), frameRate: a.rate, repeat: a.repeat });
    }
  }
  // NPCs
  for (const id of ['elder', 'merchant', 'smith'] as const) {
    addSheet(scene, `npc_${id}`, [{ name: 'idle', frames: [W.npc(id, 0), W.npc(id, 1)] }]);
    scene.anims.create({ key: `npc_${id}_idle`, frames: [0, 1].map(i => ({ key: `npc_${id}`, frame: `idle_${i}` })), frameRate: 2, repeat: -1 });
  }
  // environment objects
  for (let v = 0; v < 5; v++) addSingle(scene, `obj_tree_${v}`, W.tree(v));
  for (const v of [1, 2]) addSingle(scene, `obj_pine_${v}`, W.pine(v));
  addSingle(scene, 'obj_pine_0', W.pine(1));
  for (const v of [0, 1]) { addSingle(scene, `obj_bush_${v}`, W.bush(v)); addSingle(scene, `obj_rock_${v}`, W.rock(v)); { const h = I.isoHouse(v); HOUSE_ANCHOR.ax = h.ax; HOUSE_ANCHOR.ay = h.ay; addSingle(scene, `obj_house_${v}`, h.p); addSingle(scene, `obj_fence_${v}`, I.isoFence(v)); } addSingle(scene, `obj_mushrooms_${v}`, W.mushrooms(v)); addSingle(scene, `obj_lily_${v}`, W.lily(v)); }
  addSingle(scene, 'obj_bigrock_0', W.bigRock());
  for (let v = 0; v < 4; v++) addSingle(scene, `obj_flower_${v}`, W.flower(v));
  for (const g of [0, 4, 5]) addSingle(scene, `obj_tuft_${g}`, W.tuft(g));
  addSingle(scene, 'obj_well_0', W.well());
  addSingle(scene, 'obj_sign_0', W.sign());
  addSingle(scene, 'obj_lamp_0', W.lamp());
  for (let v = 0; v < 10; v++) { addSingle(scene, `obj_pillar_${v}`, W.pillar(false, v)); addSingle(scene, `obj_brokenpillar_${v}`, W.pillar(true, v)); }
  addSingle(scene, 'obj_altar_0', I.isoAltar());
  for (let v = 0; v < 4; v++) for (let sd = 0; sd < 3; sd++) addSingle(scene, `obj_wall_${v * 3 + sd}`, I.isoWall(v, sd));
  addSingle(scene, 'obj_chest_0', I.isoChest(false)); addSingle(scene, 'obj_chest_1', I.isoChest(true));
  addSingle(scene, 'obj_stall_0', I.isoStall());
  addSingle(scene, 'obj_barrel_0', W.barrel());
  addSingle(scene, 'obj_crate_0', I.isoCrate());
  addSingle(scene, 'obj_tent_0', W.tent());
  addSingle(scene, 'obj_crystal_0', W.crystal());
  addSingle(scene, 'obj_log_0', W.log());
  addSheet(scene, 'obj_campfire', [{ name: 'burn', frames: [0, 1, 2, 3].map(f => W.campfire(f)) }]);
  scene.anims.create({ key: 'campfire_burn', frames: [0, 1, 2, 3].map(i => ({ key: 'obj_campfire', frame: `burn_${i}` })), frameRate: 8, repeat: -1 });
  // icons & vfx
  for (const [k, p] of Object.entries(buildIcons())) addSingle(scene, `icon_${k}`, p, 2);
  for (const [k, p] of Object.entries(buildVfx())) addSingle(scene, `fx_${k}`, p);
  // default hero
  ensureHeroTexture(scene, 0, 0);
}

export { HERO_FRAME };
