import Phaser from 'phaser';
import { lang, setLang } from '../core/i18n';
import { UIKit } from '../ui/kit';
import { hasSave, loadGame, startNewGame } from '../core/save';
import { runtime } from '../core/events';
import { unlockAudio, audioState, setMusic } from '../audio/sfx';
import { ensureHeroTexture } from '../art/textures';

export class TitleScene extends Phaser.Scene {
  constructor() { super('Title'); }

  create() {
    const u = this.scale.height / 360, VW = this.scale.width / u;
    this.cameras.main.setOrigin(0, 0).setZoom(u);
    const k = new UIKit(this, () => u);
    if (this.textures.exists('ai_keyart')) {
      const bg = this.add.image(VW / 2, 180, 'ai_keyart');
      bg.setScale(Math.max(VW / bg.width, 360 / bg.height));
      this.tweens.add({ targets: bg, scale: bg.scale * 1.04, duration: 12000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      const sh = this.add.graphics();
      sh.fillGradientStyle(0x0b0906, 0x0b0906, 0x0b0906, 0x0b0906, 0.75, 0.75, 0, 0).fillRect(0, 0, VW, 140);
      sh.fillGradientStyle(0x0b0906, 0x0b0906, 0x0b0906, 0x0b0906, 0, 0, 0.7, 0.7).fillRect(0, 260, VW, 100);
    } else {
    // sky gradient
      const g = this.add.graphics();
      g.fillGradientStyle(0x1a1438, 0x1a1438, 0x3a6a5a, 0x3a6a5a, 1).fillRect(0, 0, VW, 360);
      g.fillStyle(0xffe8b0, 0.15).fillCircle(VW * 0.7, 90, 60);
      g.fillStyle(0xfff4d0, 0.9).fillCircle(VW * 0.7, 90, 22);
      // distant hills
      g.fillStyle(0x24483e, 1);
      for (let x = 0; x <= VW; x += 4) g.fillRect(x, 220 + Math.sin(x * 0.02) * 16 + Math.sin(x * 0.05) * 6, 4, 200);
      g.fillStyle(0x2e5a3a, 1);
      for (let x = 0; x <= VW; x += 4) g.fillRect(x, 260 + Math.sin(x * 0.03 + 1) * 10, 4, 200);
      g.fillStyle(0x4a8a3a, 1).fillRect(0, 300, VW, 60);
      // trees
      const trees = [[20, 0], [70, 1], [VW - 60, 3], [VW - 120, 2], [VW - 20, 1], [120, 4]] as const;
      for (const [x, v] of trees) this.add.image(x, 318, `obj_tree_${v}`).setOrigin(0.5, 1).setScale(1.6);
      this.add.image(VW / 2 + 90, 318, 'obj_house_0').setOrigin(0.5, 1).setScale(1.1);
      // hero
      const key = ensureHeroTexture(this, 3, 3);
      this.add.image(VW / 2 - 40, 322, 'fx_shadow').setScale(1.6);
      this.add.sprite(VW / 2 - 40, 322, key).setOrigin(0.5, 0.9).setScale(2.4).play(`${key}_down_idle`);
      const slime = this.add.sprite(VW / 2 + 10, 324, 'mon_slime').setOrigin(0.5, 1).setScale(2).play('mon_slime_idle').setFlipX(true);
      void slime;
    }
    // motes
    for (let i = 0; i < 30; i++) {
      const m = this.add.image(Math.random() * VW, Math.random() * 360, 'fx_glow').setScale(0.08).setTint(0xe0ff8a).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: m, y: m.y - 40 - Math.random() * 40, x: m.x + Math.random() * 40 - 20, alpha: { from: 0.9, to: 0 }, duration: 3000 + Math.random() * 3000, repeat: -1, delay: Math.random() * 3000 });
    }
    // logo
    const title = k.text(VW / 2, 68, 'MOURNCROWN', 38, '#ffe7a0', { fontFamily: 'Georgia, serif', fontStyle: 'bold', strokeThickness: 7, stroke: '#2a1408' }).setOrigin(0.5);
    title.setShadow(0, 3, '#000000', 6, true, true);
    k.text(VW / 2, 104, lang() === 'en' ? 'Lift the curse • defend the last village' : 'ป่าต้องสาป • ชำระคำสาป ปกป้องหมู่บ้านสุดท้าย', 12, '#f3e6c4').setOrigin(0.5);
    const lg = this.add.graphics();
    k.diamond(lg, VW / 2 - 150, 70, 6); k.diamond(lg, VW / 2 + 150, 70, 6);
    lg.lineStyle(1, 0xd9b45a, 1).lineBetween(VW / 2 - 120, 120, VW / 2 + 120, 120);
    this.tweens.add({ targets: title, scale: { from: 1, to: 1.03 }, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    const start = (fresh: boolean) => {
      unlockAudio();
      const st = fresh ? startNewGame() : (loadGame() ?? startNewGame());
      runtime.state = st;
      audioState.sfx = st.sfx; setMusic(st.music);
      this.cameras.main.fadeOut(300, 0, 0, 0);
      this.time.delayedCall(320, () => this.scene.start(new URLSearchParams(location.search).has('world') ? 'World' : 'TopDown'));
    };
    let by = 150;
    if (hasSave()) { this.add.existing(k.button(VW / 2 - 80, by, 160, 30, '▶ เล่นต่อ', () => start(false), { size: 12, color: 0x1f4a2a })); by += 38; }
    this.add.existing(k.button(VW / 2 - 80, by, 160, 30, hasSave() ? 'เริ่มเกมใหม่' : '▶ เริ่มผจญภัย', () => start(!hasSave() ? true : true), { size: 12 }));
    k.text(VW / 2, 350, 'แนะนำ: เล่นแนวนอน + เต็มจอ  •  v0.3', 8, '#c8d8c0').setOrigin(0.5);
    // language switch (English by default on the first visit)
    this.add.existing(k.button(VW - 118, 10, 108, 24, lang() === 'en' ? '🌐 ภาษาไทย' : '🌐 English', () => { setLang(lang() === 'en' ? 'th' : 'en'); location.reload(); }, { size: 10, color: 0x2a4a5a }));
    this.cameras.main.fadeIn(400);
  }
}
