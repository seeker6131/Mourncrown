import Phaser from 'phaser';
import { generateAll } from '../art/textures';
import { preloadAi, applyAiArt } from '../art/aiAssets';
import { preloadAnims, applyAnims } from '../art/animAssets';
import { preloadForms, applyForms } from '../art/formAssets';
import { preloadUi, applyUi } from '../ui/skin';

export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }
  preload() {
    const { width, height } = this.scale;
    const t = this.add.text(width / 2, height / 2, 'กำลังโหลด...', { fontFamily: 'sans-serif', fontSize: Math.round(height / 22) + 'px', color: '#e8c872' }).setOrigin(0.5);
    const bar = this.add.rectangle(width / 2 - width * 0.2, height / 2 + height * 0.06, 0, height * 0.012, 0xe8c872).setOrigin(0, 0.5);
    this.load.on('progress', (v: number) => { bar.width = width * 0.4 * v; });
    this.load.on('complete', () => { t.setText('กำลังสร้างโลก...'); });
    preloadAi(this);
    preloadAnims(this);
    preloadForms(this);
    preloadUi(this);
  }
  create() {
    this.time.delayedCall(30, () => {
      generateAll(this);
      applyAiArt(this);
      applyAnims(this);
      applyForms(this);
      applyUi(this);
      this.children.removeAll(true);
      const q = new URLSearchParams(location.search);
      this.scene.start(q.has('td') || q.has('play') ? 'TopDown' : q.has('preview') ? 'Preview' : 'Title');
    });
  }
}
