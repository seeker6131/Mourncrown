import Phaser from 'phaser';
import { ensureHeroTexture, MONSTER_KINDS } from '../art/textures';

/** Dev-only art gallery: open with ?preview */
export class PreviewScene extends Phaser.Scene {
  constructor() { super('Preview'); }
  create() {
    this.cameras.main.setBackgroundColor('#4a8a3a');
    const z = 3;
    let x = 30;
    for (let a = 0; a < 4; a++) {
      const key = ensureHeroTexture(this, a, a);
      ['down', 'side', 'up'].forEach((d, i) => {
        this.add.sprite(x + i * 40 * z, 70, key).setScale(z).play(`${key}_${d}_walk`);
        this.add.sprite(x + i * 40 * z, 190, key).setScale(z).play(`${key}_${d}_attack`).on('animationcomplete', (_: unknown, __: unknown, s: Phaser.GameObjects.Sprite) => this.time.delayedCall(400, () => s.play(`${key}_${d}_attack`)));
      });
      x += 3 * 40 * z + 10;
      if (a === 1) x = 30;
      if (a === 1) this.cameras.main.scrollY = 0;
    }
    let mx = 30;
    for (const k of MONSTER_KINDS) {
      const s = this.add.sprite(mx, 330, `mon_${k}`).setOrigin(0, 0).setScale(z).play(`mon_${k}_move`);
      mx += s.width * z + 10;
    }
    let ox = 30;
    const objs = ['obj_house_0', 'obj_fence_0', 'obj_fence_1', 'obj_stall_0', 'obj_crate_0', 'obj_barrel_0', 'obj_altar_0', 'obj_sign_0', 'obj_well_0', 'obj_tent_0', 'obj_lamp_0', 'obj_rock_0', 'obj_bigrock_0', 'obj_log_0'];
    for (const k of objs) { const s = this.add.image(ox, 600, k).setOrigin(0, 0).setScale(2); ox += s.width * 2 + 6; }
    this.add.sprite(ox, 600, 'obj_campfire').setOrigin(0, 0).setScale(2).play('campfire_burn');
    let ix = 30;
    for (const k of this.textures.getTextureKeys().filter(k => k.startsWith('icon_')).sort()) { this.add.image(ix, 800, k).setOrigin(0, 0).setScale(3); ix += 54; }
    let nx = 30;
    for (const id of ['elder', 'merchant', 'smith']) { this.add.sprite(nx, 880, `npc_${id}`).setOrigin(0, 0).setScale(3).play(`npc_${id}_idle`); nx += 110; }
  }
}
