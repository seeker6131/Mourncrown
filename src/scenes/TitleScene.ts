import Phaser from 'phaser';
import { lang, setLang } from '../core/i18n';
import { showWait } from '../core/wait';
import { UIKit } from '../ui/kit';
import { hasSave, loadGame, startNewGame } from '../core/save';
import { runtime } from '../core/events';
import { unlockAudio, audioState, setMusic, setVolume } from '../audio/sfx';
import { uiOpt } from '../core/uiOptions';
import { newGameState } from '../core/state';
import { queueTd } from './TopDownScene';
import { loadAtlas } from '../world/atlas';
import { formKeyOf } from '../world/chars';
import { activeTier } from '../systems/stats';
import { guildOf } from '../systems/guild';
import { mountOn } from '../systems/mounts';
import { cloud, googleLinked, accountName, relogin } from '../net/cloud';
import { askName } from '../net/namePrompt';
import { showGoogleButton } from '../net/googleBtn';
import { takeResume, type Resume } from '../core/resume';

export class TitleScene extends Phaser.Scene {
  constructor() { super('Title'); }

  artLeft = 0; artMid = 0;
  create() {
    // turning the phone (portrait -> landscape) changes the screen size: lay the title out again
    // (not once the game is starting: going full screen resizes too, and a restart would cancel the start)
    let starting = false;
    const relayout = () => { if (!starting) this.time.delayedCall(80, () => { if (this.sys.isActive() && !starting) this.scene.restart(); }); };
    this.scale.on('resize', relayout); this.events.once('shutdown', () => this.scale.off('resize', relayout));
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
    const sub = k.text(cx, art ? 220 : 104, lang() === 'en' ? 'Lift the curse • defend the last village' : 'ป่าต้องสาป • ชำระคำสาป ปกป้องหมู่บ้านสุดท้าย', 12, '#f3e6c4').setOrigin(0.5);
    sub.setShadow(0, 2, '#000000', 4, true, true);
    if (!art) { const lg = this.add.graphics(); k.diamond(lg, VW / 2 - 150, 70, 6); k.diamond(lg, VW / 2 + 150, 70, 6); lg.lineStyle(1, 0xd9b45a, 1).lineBetween(VW / 2 - 120, 120, VW / 2 + 120, 120); }
    this.tweens.add({ targets: title, scale: { from: 1, to: 1.03 }, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    const start = (fresh: boolean, rs?: Resume) => {
      starting = true;
      unlockAudio();
      // (no automatic full screen — director: players in a window got thrown into it; the ⛶ button on the top bar does it)
      const st = fresh ? startNewGame() : (loadGame() ?? startNewGame());
      runtime.state = st;
      audioState.sfx = st.sfx; setMusic(st.music); setVolume(uiOpt(st).vol);
      this.cameras.main.fadeOut(250, 0, 0, 0);
      // the village files were already coming in behind the title: let them finish here (the next scene finds them)
      const go = () => this.time.delayedCall(30, () => this.scene.start('TopDown', rs ? { stage: rs.stage, room: rs.room, guild: rs.guild, inside: (rs.inside ?? -1) >= 0 ? rs.inside : undefined, pos: { x: rs.x, y: rs.y }, farm: rs.farm } : undefined));
      this.time.delayedCall(260, () => { showWait(); if (this.load.isLoading()) this.load.once(Phaser.Loader.Events.COMPLETE, go); else go(); });
    };
    // a guest plays at once; a Google account keeps the hero on any device (it can be linked later in the menu — nothing is lost)
    const linked = googleLinked(), save = hasSave();
    let by = art ? 236 : 150, gy = -1;
    if (!linked) { gy = by + 14; by += 34; }   // Google sign-in in the middle of the screen (Google draws it over the game)
    if (save) {
      this.add.existing(k.button(cx - 80, by, 160, 30, linked ? '▶ เล่นต่อ' : '▶ เล่นต่อ (แขก)', () => start(false), { size: 12, color: 0x1f4a2a }));
      this.add.existing(k.button(cx - 55, by + 36, 110, 18, 'เริ่มเกมใหม่', () => start(true), { size: 9 }));
    } else this.add.existing(k.button(cx - 80, by, 160, 30, linked ? '▶ เริ่มผจญภัย' : '▶ เล่นแบบแขก', () => start(true), { size: 12, color: linked ? undefined : 0x1f4a2a }));
    k.text(cx, 351, 'แนะนำ: เล่นแนวนอน + เต็มจอ  •  v0.3', 8, '#c8d8c0').setOrigin(0.5);
    // the game server: is the save kept there (net/cloud.ts)
    const cl = k.text(cx, 338, '', 7.5, '#9fd4ff').setOrigin(0.5);
    let note = '';
    const showCloud = () => cl.active && cl.setText(note || (relogin ? '🔑 เข้าสู่ระบบ Google อีกครั้ง เพื่อเล่นตัวละครเดิมของคุณ' : cloud.state === 'ok' || cloud.state === 'saving' ? (googleLinked() ? '☁ เชื่อม Google แล้ว — เข้าเครื่องไหนก็เจอตัวละครเดิม' : '☁ เล่นแบบแขกได้เลย • ผูก Google ทีหลังได้ที่เมนู ของไม่หาย') : cloud.state === 'error' ? '☁ ยังต่อเซิร์ฟไม่ได้ — กำลังลองใหม่เอง (เล่นไปก่อนได้)' : '☁ กำลังเชื่อมต่อเซิร์ฟ...')).setColor(relogin ? '#ffd84a' : cloud.state === 'error' ? '#c8b89a' : '#9fd4ff');
    if (gy >= 0) {
      const b = this.game.canvas.getBoundingClientRect(), px = b.left + cx * u * (b.width / this.scale.width), py = b.top + gy * u * (b.height / this.scale.height);
      const off = showGoogleButton(r => {
        if (r === 'switched') { off(); this.scene.restart(); return; }   // the hero of that Google account is now on this device
        if (r === 'linked') { off(); note = '✔ เชื่อม Google แล้ว — เข้าเครื่องไหนก็เจอตัวละครเดิม'; if (!accountName()) askName(n => { note = `✔ ยินดีต้อนรับ ${n}!`; showCloud(); }); }
        else note = '✖ เข้าสู่ระบบไม่สำเร็จ ลองใหม่อีกครั้ง';
        showCloud();
      }, { x: px, y: py, big: b.height > 600 });
      this.events.once('shutdown', off);
    }
    showCloud(); this.time.addEvent({ delay: 600, loop: true, callback: showCloud });
    // signed in with Google but no name yet (e.g. this device just loaded that account): name the hero now
    if (googleLinked() && !accountName()) askName(n => { note = `✔ ยินดีต้อนรับ ${n}!`; showCloud(); });
    // language switch (English by default on the first visit)
    this.add.existing(k.button(VW - 118, 10, 108, 24, lang() === 'en' ? '🌐 ภาษาไทย' : '🌐 English', () => { setLang(lang() === 'en' ? 'th' : 'en'); location.reload(); }, { size: 10, color: 0x2a4a5a }));
    this.cameras.main.fadeIn(400);
    this.prefetch();
    // the game just reloaded itself for an update: straight back to where the player was (no title in between)
    const rs = takeResume();
    if (rs && hasSave()) {
      start(false, rs);
      // sound needs a tap after a reload (browser rule): the first tap brings it back
      const back = () => { unlockAudio(); };
      window.addEventListener('pointerdown', back, { once: true });
    }
  }

  /** fetch what the first scene (the village, or the guild village) waits for while the player looks at the title */
  prefetch() {
    try {
      const s = loadGame() ?? newGameState();
      queueTd(this, { gv: !!guildOf(s), stageN: 0, st: null, boss: false, mount: !!mountOn(s), form: formKeyOf(s.cls, activeTier(s), s.look) });
      loadAtlas(this, 'skill'); loadAtlas(this, 'icon');   // the HUD's icons (TdUIScene)
      if (this.load.list.size) this.load.start();
    } catch { /* the scene loads what is missing itself */ }
  }
}
