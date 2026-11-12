// Pixel-game shadows (director: pixel style; later: "prettier, darker, more realistic"): an oval drawn at its exact size so
// its pixels match the art's, in three stepped tones — a near-black core right under the feet, a softer middle band and a
// checkerboard-dithered rim — with the core pushed a little toward the lower right, as if the light came from the upper
// left. No blur.
import Phaser from 'phaser';

const RGB = '6,10,8';
/** texture of a w × h pixel oval (made once per size) */
export function pxShadowKey(scene: Phaser.Scene, w: number, h: number) {
  w = Math.max(4, Math.round(w)); h = Math.max(3, Math.round(h));
  const key = `pxsh2_${w}_${h}`;
  if (scene.textures.exists(key)) return key;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const k = cv.getContext('2d')!;
  const rx = w / 2, ry = h / 2, ox = w * 0.06, oy = h * 0.08;   // the darkest spot sits a little right / down
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const dx = (i + 0.5 - rx) / rx, dy = (j + 0.5 - ry) / ry, d = dx * dx + dy * dy;
    if (d > 1) continue;
    const cx = (i + 0.5 - rx - ox) / rx, cy = (j + 0.5 - ry - oy) / ry, c = cx * cx + cy * cy;
    let a = 0;
    if (c <= 0.3) a = 1;                        // core
    else if (d <= 0.62) a = 0.78;               // middle band
    else if ((i + j) % 2 === 0) a = 0.55;       // dithered rim
    if (a) { k.fillStyle = `rgba(${RGB},${a})`; k.fillRect(i, j, 1, 1); }
  }
  scene.textures.addCanvas(key, cv);
  return key;
}
/** a pixel oval shadow centred on (x, y) — darker than before (director) */
export function pxShadow(scene: Phaser.Scene, x: number, y: number, w: number, h: number, alpha = 0.4, depth = 1) {
  return scene.add.image(Math.round(x), Math.round(y), pxShadowKey(scene, w, h)).setAlpha(Math.min(0.9, alpha * 1.6)).setDepth(depth);
}
