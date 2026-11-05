import Phaser from 'phaser';
import { generateAll } from '../art/textures';
import { preloadAi, applyAiArt } from '../art/aiAssets';

export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }
  preload() {
    const { width, height } = this.scale;
    const t = this.add.text(width / 2, height / 2, 'กำลังโหลด...', { fontFamily: 'sans-serif', fontSize: Math.round(height / 22) + 'px', color: '#e8c872' }).setOrigin(0.5);
    const bar = this.add.rectangle(width / 2 - width * 0.2, height / 2 + height * 0.06, 0, height * 0.012, 0xe8c872).setOrigin(0, 0.5);
    this.load.on('progress', (v: number) => { bar.width = width * 0.4 * v; });
    this.load.on('complete', () => { t.setText('กำลังสร้างโลก...'); });
    preloadAi(this);
  }
  create() {
    this.time.delayedCall(30, () => {
      generateAll(this);
      applyAiArt(this);
      this.children.removeAll(true);
      const q = new URLSearchParams(location.search);
      this.scene.start(q.has('preview') ? 'Preview' : 'Title');
    });
  }
}
