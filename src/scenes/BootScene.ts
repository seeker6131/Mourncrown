import Phaser from 'phaser';
import { hasResume } from '../core/resume';
import { buildIcons, buildVfx } from '../art/iconArt';
import { PixelCanvas } from '../art/pixel';
import { preloadUi, applyUi } from '../ui/skin';
import keyart from '../assets/title/keyart.jpg';

// Loads only what the game needs up front: the UI skin and the title art. Characters, buildings and the map load
// inside TopDownScene; item icons are drawn here as a fallback and replaced by PixelLab icons in TdUIScene.
function addCanvas(scene: Phaser.Scene, key: string, p: PixelCanvas | HTMLCanvasElement, scale = 1) {
  if (scene.textures.exists(key)) return;
  if (!(p instanceof PixelCanvas)) { scene.textures.addCanvas(key, p); return; }
  const cv0 = document.createElement('canvas'); cv0.width = p.w; cv0.height = p.h; p.drawTo(cv0.getContext('2d')!, 0, 0);
  const cv = document.createElement('canvas'); cv.width = p.w * scale; cv.height = p.h * scale;
  const cx = cv.getContext('2d')!; cx.imageSmoothingEnabled = false; cx.drawImage(cv0, 0, 0, cv.width, cv.height);
  scene.textures.addCanvas(key, cv);
}

export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }
  preload() {
    const { width, height } = this.scale;
    const t = this.add.text(width / 2, height / 2, 'กำลังโหลด...', { fontFamily: 'sans-serif', fontSize: Math.round(height / 22) + 'px', color: '#e8c872' }).setOrigin(0.5);
    const bar = this.add.rectangle(width / 2 - width * 0.2, height / 2 + height * 0.06, 0, height * 0.012, 0xe8c872).setOrigin(0, 0.5);
    this.load.on('progress', (v: number) => { bar.width = width * 0.4 * v; });
    this.load.on('complete', () => t.setText('กำลังสร้างโลก...'));
    this.load.image('ai_keyart', keyart);
    preloadUi(this);
  }
  create() {
    for (const [k, p] of Object.entries(buildIcons())) addCanvas(this, `icon_${k}`, p, 2);
    for (const [k, p] of Object.entries(buildVfx())) addCanvas(this, `fx_${k}`, p);
    applyUi(this);
    this.children.removeAll(true);
    const q = new URLSearchParams(location.search);
    this.scene.start((q.has('td') || q.has('play')) && !hasResume() ? 'TopDown' : 'Title');   // (just reloaded for an update: the title takes the player back)
  }
}
