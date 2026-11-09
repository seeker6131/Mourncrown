import Phaser from 'phaser';
import { lang, setLang } from '../core/i18n';
import { showWait } from '../core/wait';
import { toggleFullscreen, isFullscreen } from '../core/fullscreen';
import { UIKit } from '../ui/kit';
import { hasSave, loadGame, startNewGame } from '../core/save';
import { runtime } from '../core/events';
import { unlockAudio, audioState, setMusic } from '../audio/sfx';

export class TitleScene extends Phaser.Scene {
  constructor() { super('Title'); }

  artLeft = 0; artMid = 0;
  create() {
    const u = this.scale.height / 360, VW = this.scale.width / u;
    this.cameras.main.setOrigin(0, 0).setZoom(u);
    const k = new UIKit(this, () => u);
    if (this.textures.exists('ai_keyart')) {
      // the cover is wider than phones: fill the height, crop the plain forest on the left first so the heroes and
      // the curse on the right stay whole — but never cut into the logo (it starts ~23% in from the left)
      const bg = this.add.image(0, 0, 'ai_keyart').setOrigin(0, 0);
      const sc = Math.max(VW / bg.width, 360 / bg.height); bg.setScale(sc);
      const iw = bg.width * sc; this.artLeft = Math.min(0, Math.max(VW - iw, 6 - bg.width * 0.23 * sc)); bg.x = this.artLeft;
      this.artMid = this.artLeft + iw * 0.5;   // logo / village centre
      // the cover art carries the MOURNCROWN logo itself; only darken the bottom for the buttons
      const sh = this.add.graphics();
      sh.fillGradientStyle(0x0b0906, 0x0b0906, 0x0b0906, 0x0b0906, 0, 0, 0.8, 0.8).fillRect(0, 210, VW, 150);
    } else this.add.graphics().fillGradientStyle(0x1a1438, 0x1a1438, 0x1b2420, 0x1b2420, 1).fillRect(0, 0, VW, 360);
    // motes
    for (let i = 0; i < 30; i++) {
      const m = this.add.image(Math.random() * VW, Math.random() * 360, 'fx_glow').setScale(0.08).setTint(0xe0ff8a).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: m, y: m.y - 40 - Math.random() * 40, x: m.x + Math.random() * 40 - 20, alpha: { from: 0.9, to: 0 }, duration: 3000 + Math.random() * 3000, repeat: -1, delay: Math.random() * 3000 });
    }
    // logo: drawn only when the cover art is missing (the cover has the logo in it)
    const art = this.textures.exists('ai_keyart');
    const title = k.text(VW / 2, 68, art ? '' : 'MOURNCROWN', 38, '#ffe7a0', { fontFamily: 'Georgia, serif', fontStyle: 'bold', strokeThickness: 7, stroke: '#2a1408' }).setOrigin(0.5);
    title.setShadow(0, 3, '#000000', 6, true, true);
    const cx = art ? Math.max(90, this.artMid) : VW / 2;
    const sub = k.text(cx, art ? 228 : 104, lang() === 'en' ? 'Lift the curse • defend the last village' : 'ป่าต้องสาป • ชำระคำสาป ปกป้องหมู่บ้านสุดท้าย', 12, '#f3e6c4').setOrigin(0.5);
    sub.setShadow(0, 2, '#000000', 4, true, true);
    if (!art) { const lg = this.add.graphics(); k.diamond(lg, VW / 2 - 150, 70, 6); k.diamond(lg, VW / 2 + 150, 70, 6); lg.lineStyle(1, 0xd9b45a, 1).lineBetween(VW / 2 - 120, 120, VW / 2 + 120, 120); }
    this.tweens.add({ targets: title, scale: { from: 1, to: 1.03 }, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    const start = (fresh: boolean) => {
      unlockAudio();
      if (!isFullscreen() && !/iPhone|iPod/.test(navigator.userAgent)) toggleFullscreen();   // full screen on start (Android / iPad / desktop)
      const st = fresh ? startNewGame() : (loadGame() ?? startNewGame());
      runtime.state = st;
      audioState.sfx = st.sfx; setMusic(st.music);
      this.cameras.main.fadeOut(250, 0, 0, 0);
      this.time.delayedCall(260, () => { showWait(); this.time.delayedCall(30, () => this.scene.start('TopDown')); });
    };
    let by = art ? 248 : 150;
    if (hasSave()) { this.add.existing(k.button(cx - 80, by, 160, 30, '▶ เล่นต่อ', () => start(false), { size: 12, color: 0x1f4a2a })); by += 38; }
    if (art && hasSave()) by -= 2;
    this.add.existing(k.button(cx - 80, by, 160, 30, hasSave() ? 'เริ่มเกมใหม่' : '▶ เริ่มผจญภัย', () => start(!hasSave() ? true : true), { size: 12 }));
    k.text(cx, 350, 'แนะนำ: เล่นแนวนอน + เต็มจอ  •  v0.3', 8, '#c8d8c0').setOrigin(0.5);
    // language switch (English by default on the first visit)
    this.add.existing(k.button(VW - 118, 10, 108, 24, lang() === 'en' ? '🌐 ภาษาไทย' : '🌐 English', () => { setLang(lang() === 'en' ? 'th' : 'en'); location.reload(); }, { size: 10, color: 0x2a4a5a }));
    this.cameras.main.fadeIn(400);
  }
}
