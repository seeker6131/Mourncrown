// Pixel-game shadows (director: pixel style; later: "prettier, darker, more realistic"): an oval drawn at its exact size so
// its pixels match the art's, in three stepped tones — a near-black core right under the feet, a softer middle band and a
// checkerboard-dithered rim — with the core pushed a little toward the lower right, as if the light came from the upper
// left. No blur.
import Phaser from 'phaser';

const RGB = '6,10,8';
// 4 × 4 ordered (Bayer) dither: the shadow fades out in many small pixel steps instead of three hard rings (director:
// "prettier, more realistic" — still crisp pixels, no blur)
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
/** texture of a w × h pixel oval (made once per size) */
export function pxShadowKey(scene: Phaser.Scene, w: number, h: number) {
  w = Math.max(4, Math.round(w)); h = Math.max(3, Math.round(h));
  const key = `pxsh3_${w}_${h}`;
  if (scene.textures.exists(key)) return key;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const k = cv.getContext('2d')!;
  const rx = w / 2, ry = h / 2, ox = w * 0.05, oy = h * 0.1;   // the darkest spot sits a little right / down (light from the upper left)
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const dx = (i + 0.5 - rx) / rx, dy = (j + 0.5 - ry) / ry, d = Math.sqrt(dx * dx + dy * dy);
    if (d > 1) continue;
    const cx = (i + 0.5 - rx - ox) / rx, cy = (j + 0.5 - ry - oy) / ry, c = Math.sqrt(cx * cx + cy * cy);
    // a near-black contact core under the feet, a solid body getting lighter outward, then a dithered fade to the rim
    let a = 0;
    if (c <= 0.42) a = 0.95;
    else if (d <= 0.66) a = 0.62 + 0.25 * (1 - d / 0.66);
    else if ((1 - d) / 0.34 > BAYER[(j % 4) * 4 + (i % 4)]) a = 0.5;
    if (a) { k.fillStyle = `rgba(${RGB},${a.toFixed(2)})`; k.fillRect(i, j, 1, 1); }
  }
  scene.textures.addCanvas(key, cv);
  return key;
}
/** a pixel oval shadow centred on (x, y) — darker than before (director) */
export function pxShadow(scene: Phaser.Scene, x: number, y: number, w: number, h: number, alpha = 0.4, depth = 1) {
  return scene.add.image(Math.round(x), Math.round(y), pxShadowKey(scene, w, h)).setAlpha(Math.min(0.9, alpha * 1.6)).setDepth(depth);
}
