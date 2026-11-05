import Phaser from 'phaser';
import { generateAll } from '../art/textures';

export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }
  create() {
    const { width, height } = this.scale;
    const t = this.add.text(width / 2, height / 2, 'กำลังสร้างโลก...', { fontFamily: 'sans-serif', fontSize: Math.round(height / 22) + 'px', color: '#e8c872' }).setOrigin(0.5);
    // let the text render one frame before heavy generation
    this.time.delayedCall(30, () => {
      generateAll(this);
      t.destroy();
      const q = new URLSearchParams(location.search);
      this.scene.start(q.has('preview') ? 'Preview' : 'Title');
    });
  }
}
