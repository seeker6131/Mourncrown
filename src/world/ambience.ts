// Ambient pixel particles per land, following the camera: fireflies and leaves in the forest and the villages,
// ghost wisps in the haunted woods, embers and ash in the lava lands, snow on the mountain, dust motes in the dungeon.
// Plain pixels (no blur) to match the art; light enough for phones.
import { gfx } from '../core/uiOptions';
import Phaser from 'phaser';

function dot(scene: Phaser.Scene, key: string, w: number, h: number, col: string) {
  if (scene.textures.exists(key)) return;
  const c = document.createElement('canvas'); c.width = w; c.height = h; const k = c.getContext('2d')!; k.fillStyle = col; k.fillRect(0, 0, w, h);
  scene.textures.addCanvas(key, c);
}
function leaf(scene: Phaser.Scene) {
  if (scene.textures.exists('amb_leaf')) return;
  const c = document.createElement('canvas'); c.width = 3; c.height = 2; const k = c.getContext('2d')!;
  k.fillStyle = '#8a6a2a'; k.fillRect(0, 0, 2, 1); k.fillStyle = '#6a8a32'; k.fillRect(1, 1, 2, 1);
  scene.textures.addCanvas('amb_leaf', c);
}

export type Land = 'forest' | 'haunt' | 'lava' | 'snow' | 'dung' | 'village' | 'room';
/** start the ambience; it follows the main camera until the scene shuts down */
export function ambience(scene: Phaser.Scene, land: Land) {
  if (land === 'room' || gfx.low) return;   // (low graphics: no weather particles)
  const cam = scene.cameras.main;
  const view = () => cam.worldView;
  const zone = (pad = 40) => ({ type: 'random' as const, source: { getRandomPoint: (p: Phaser.Types.Math.Vector2Like) => { const v = view(); p.x = v.x - pad + Math.random() * (v.width + pad * 2); p.y = v.y - pad + Math.random() * (v.height + pad * 2); return p; } } as unknown as Phaser.Types.GameObjects.Particles.RandomZoneSource });
  const top = () => ({ type: 'random' as const, source: { getRandomPoint: (p: Phaser.Types.Math.Vector2Like) => { const v = view(); p.x = v.x - 60 + Math.random() * (v.width + 120); p.y = v.y - 10; return p; } } as unknown as Phaser.Types.GameObjects.Particles.RandomZoneSource });
  const bottom = () => ({ type: 'random' as const, source: { getRandomPoint: (p: Phaser.Types.Math.Vector2Like) => { const v = view(); p.x = v.x + Math.random() * v.width; p.y = v.y + v.height + 6; return p; } } as unknown as Phaser.Types.GameObjects.Particles.RandomZoneSource });
  const D = 99978;
  if (land === 'forest' || land === 'village') {
    dot(scene, 'amb_fly', 2, 2, '#e8ff8a'); leaf(scene);
    scene.add.particles(0, 0, 'amb_fly', { emitZone: zone(), lifespan: { min: 2600, max: 4200 }, speedX: { min: -8, max: 8 }, speedY: { min: -8, max: 6 }, alpha: { values: [0, 1, 0.2, 1, 0] }, blendMode: 'ADD', frequency: land === 'village' ? 380 : 220, quantity: 1 }).setDepth(D);
    scene.add.particles(0, 0, 'amb_leaf', { emitZone: top(), lifespan: 7000, speedX: { min: 6, max: 16 }, speedY: { min: 14, max: 22 }, rotate: { min: 0, max: 360 }, alpha: { start: 0.9, end: 0.6 }, frequency: land === 'village' ? 1400 : 700, quantity: 1 }).setDepth(D);
  } else if (land === 'haunt') {
    dot(scene, 'amb_wisp', 2, 2, '#c8b8ff');
    scene.add.particles(0, 0, 'amb_wisp', { emitZone: zone(), lifespan: { min: 3000, max: 5000 }, speedX: { min: -6, max: 6 }, speedY: { min: -14, max: -4 }, alpha: { values: [0, 0.9, 0.5, 0] }, scale: { start: 1, end: 2 }, blendMode: 'ADD', frequency: 160, quantity: 1 }).setDepth(D);
    if (scene.textures.exists('td_puff')) scene.add.particles(0, 0, 'td_puff', { emitZone: zone(80), lifespan: 6000, speedX: { min: 4, max: 10 }, scale: { start: 1.6, end: 2.6 }, alpha: { values: [0, 0.14, 0] }, tint: 0x8a7ab8, frequency: 500, quantity: 1 }).setDepth(D - 1);
  } else if (land === 'lava') {
    dot(scene, 'amb_ember', 2, 2, '#ffb04a'); dot(scene, 'amb_ash', 1, 1, '#9a8a80');
    scene.add.particles(0, 0, 'amb_ember', { emitZone: bottom(), lifespan: { min: 3000, max: 5200 }, speedX: { min: -10, max: 10 }, speedY: { min: -46, max: -22 }, alpha: { values: [1, 0.8, 0] }, blendMode: 'ADD', frequency: 110, quantity: 1 }).setDepth(D);
    scene.add.particles(0, 0, 'amb_ash', { emitZone: top(), lifespan: 8000, speedX: { min: -4, max: 8 }, speedY: { min: 10, max: 18 }, alpha: 0.7, frequency: 120, quantity: 1 }).setDepth(D);
  } else if (land === 'snow') {
    dot(scene, 'amb_snow', 2, 2, '#ffffff'); dot(scene, 'amb_snow1', 1, 1, '#e8f4ff');
    scene.add.particles(0, 0, 'amb_snow', { emitZone: top(), lifespan: 9000, speedX: { min: -12, max: 4 }, speedY: { min: 20, max: 34 }, accelerationX: { min: -3, max: 3 }, alpha: 0.95, frequency: 60, quantity: 1 }).setDepth(D);
    scene.add.particles(0, 0, 'amb_snow1', { emitZone: top(), lifespan: 12000, speedX: { min: -6, max: 2 }, speedY: { min: 10, max: 18 }, alpha: 0.7, frequency: 50, quantity: 1 }).setDepth(D - 1);
  } else if (land === 'dung') {
    dot(scene, 'amb_dust', 1, 1, '#d8d0b8');
    scene.add.particles(0, 0, 'amb_dust', { emitZone: zone(), lifespan: { min: 4000, max: 6000 }, speedX: { min: -3, max: 3 }, speedY: { min: -3, max: 3 }, alpha: { values: [0, 0.8, 0] }, frequency: 90, quantity: 1 }).setDepth(D);
  }
}
