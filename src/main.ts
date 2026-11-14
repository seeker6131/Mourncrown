import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { TitleScene } from './scenes/TitleScene';
import { TopDownScene } from './scenes/TopDownScene';
import { TdUIScene } from './scenes/TdUIScene';
import { installDebug } from './core/debug';
import { TEST_HOOKS } from './core/testHooks';
import { tr, lang } from './core/i18n';

// Language: every text object goes through tr() (English by default, Thai when chosen)
{
  const T = Phaser.GameObjects.Text.prototype as unknown as { setText(v: string | string[]): unknown };
  const orig = T.setText;
  T.setText = function (this: unknown, v: string | string[]) { return orig.call(this, Array.isArray(v) ? v.map(tr) : typeof v === 'string' ? tr(v) : v); };
  document.title = tr(document.title);
  document.documentElement.lang = lang();
}

// Render at device resolution (capped) for crisp text; CSS scales the canvas down.
export const DPR = Math.min(window.devicePixelRatio || 1, 2);

const parent = document.getElementById('game')!;

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent,
  backgroundColor: '#0b0906',
  pixelArt: true,
  roundPixels: true,
  antialias: false,
  scale: {
    mode: Phaser.Scale.NONE,
    width: Math.round(window.innerWidth * DPR),
    height: Math.round(window.innerHeight * DPR),
    zoom: 1 / DPR,
  },
  input: { activePointers: 4 },
  scene: [BootScene, TitleScene, TopDownScene, TdUIScene],
  fps: { target: 60 },
});

function resize() {
  game.scale.resize(Math.round(window.innerWidth * DPR), Math.round(window.innerHeight * DPR));
  game.scale.setZoom(1 / DPR);
}
window.addEventListener('resize', () => setTimeout(resize, 50));
window.addEventListener('orientationchange', () => setTimeout(resize, 300));

// typing in a text box (chat, names, amounts): the game lets go of the keyboard — W/A/S/D (Thai ไ ฟ ห ก …), Q, 1-3 and
// the arrows were walk / skill / AUTO keys and their letters could not be typed (a player's report)
{ const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  const kb = () => (game.input as unknown as { keyboard?: { enabled: boolean } }).keyboard;
  document.addEventListener('focusin', e => { const k = kb(); if (k && typing(e.target)) k.enabled = false; });
  document.addEventListener('focusout', () => { setTimeout(() => { const k = kb(); if (k && !typing(document.activeElement)) k.enabled = true; }, 0); }); }
if (TEST_HOOKS) { (window as unknown as { __game: Phaser.Game }).__game = game; installDebug(game); }   // tests only (localhost) — never on the public site

// keep the built pictures / code on the phone between visits (public/sw.js): later starts skip the downloads
if (import.meta.env.PROD && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost'))
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));

// the save on the game server: an account for this device, the newer save taken before the player presses start
// (no server at first — no signal, or the server restarting: it keeps trying; once through, the title shows 'continue')
const lateCloud = () => { const t = game.scene.getScene('Title'); if (t?.sys.isActive()) t.scene.restart(); };
import('./net/cloud').then(m => m.cloudBoot(() => !!game.scene.getScene('TopDown')?.sys.isActive(), lateCloud).then(took => {
  import('./net/play').then(p => p.play.start());   // the character on the server (every valuable action runs there)
  import('./core/update').then(u => u.watchUpdates());   // a new version: reload at the next map change
  import('./net/chatHub').then(c => c.chatHub.start());   // world chat + guild chat
  const t = game.scene.getScene('Title'); if ((took || m.relogin) && t?.sys.isActive()) t.scene.restart();   // a save from another device: show 'continue' / signed out: show the Google button
}));
