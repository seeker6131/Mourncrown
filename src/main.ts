import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { TitleScene } from './scenes/TitleScene';
import { WorldScene } from './scenes/WorldScene';
import { UIScene } from './scenes/UIScene';
import { PreviewScene } from './scenes/PreviewScene';
import { installDebug } from './core/debug';

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
  scene: [BootScene, TitleScene, WorldScene, UIScene, PreviewScene],
  fps: { target: 60 },
});

function resize() {
  game.scale.resize(Math.round(window.innerWidth * DPR), Math.round(window.innerHeight * DPR));
  game.scale.setZoom(1 / DPR);
}
window.addEventListener('resize', () => setTimeout(resize, 50));
window.addEventListener('orientationchange', () => setTimeout(resize, 300));

(window as unknown as { __game: Phaser.Game }).__game = game;
installDebug(game);
