// ⛈ The storm-cloud pet (diamond wheel prize, systems/cosmetics.ts): the round cloud with a face (art-source/pixellab/
// cloudpet, design G2) floats at the hero's shoulder, bobbing gently, and now and then lightning flickers inside it with a
// tiny bolt dropping below. Used for the hero and for other players who have it out.
import Phaser from 'phaser';
import cloudUrl from '../assets/td/pet_cloud.png?url';

const KEY = 'pet_cloud';
/** load the cloud picture once (the sprite appears when it is ready) */
function ensure(sc: Phaser.Scene, done: () => void) {
  if (sc.textures.exists(KEY)) { done(); return; }
  sc.load.image(KEY, cloudUrl); sc.load.once(`filecomplete-image-${KEY}`, done); if (!sc.load.isLoading()) sc.load.start();
}

export class StormCloud {
  sp?: Phaser.GameObjects.Image; bolt: Phaser.GameObjects.Graphics; sh: Phaser.GameObjects.Ellipse;
  x: number; y: number; nextFlash = 0; flashEnd = 0; seed = Math.random() * 1000; dead = false;
  constructor(public sc: Phaser.Scene, x: number, y: number) {
    this.x = x; this.y = y;
    this.bolt = sc.add.graphics();
    this.sh = sc.add.ellipse(x, y, 14, 4, 0x000000, 0.22);
    ensure(sc, () => { if (!this.dead) this.sp = sc.add.image(this.x, this.y, KEY).setScale(0.5); });
  }
  /** follow the owner: floats above the head, over the name, a touch behind where they face (director: not at the side,
   *  not close to the body). hy = their feet, top = the top of their head */
  update(hx: number, hy: number, dir: number, time: number, visible = true, top = hy - 30) {
    const side = dir >= 1 && dir <= 3 ? -1 : 1;   // (above the head, a little to one side: east-facing → west, else east — director)
    const tx = hx + side * 12, ty = top - 20;
    const k = Math.min(1, 0.12 * (this.sc.game.loop.delta / 16.7));
    this.x += (tx - this.x) * k; this.y += (ty - this.y) * k;
    const bob = Math.sin((time + this.seed) / 420) * 2, breathe = 1 + Math.sin((time + this.seed) / 650) * 0.03;
    const x = Math.round(this.x), y = Math.round(this.y + bob);
    if (this.sp) this.sp.setPosition(x, y).setScale(0.5 * breathe, 0.5 / breathe).setDepth(hy + 40).setVisible(visible);
    this.sh.setVisible(false);   // (high above the head: no shadow on the ground)
    // lightning: every 2–5 s a quick double flicker and a little zig-zag bolt under the cloud
    if (time > this.nextFlash) { this.nextFlash = time + 2000 + Math.random() * 3000; this.flashEnd = time + 220; }
    const on = time < this.flashEnd && visible, fl = on && Math.floor((this.flashEnd - time) / 55) % 2 === 0;
    if (this.sp) { if (fl) this.sp.setTint(0xfff8c0); else this.sp.clearTint(); }
    this.bolt.clear();
    if (fl) {
      const bx = x + (this.seed % 2 > 1 ? 3 : -3), by = y + 8;
      this.bolt.lineStyle(1.5, 0xfff27a, 1).beginPath().moveTo(bx, by).lineTo(bx - 2, by + 4).lineTo(bx + 1, by + 5).lineTo(bx - 1, by + 10).strokePath();
      this.bolt.lineStyle(3, 0xfff27a, 0.25).beginPath().moveTo(bx, by).lineTo(bx - 1, by + 10).strokePath();
      this.bolt.setDepth(hy + 39.5);
    }
  }
  destroy() { this.dead = true; this.sp?.destroy(); this.bolt.destroy(); this.sh.destroy(); }
}
