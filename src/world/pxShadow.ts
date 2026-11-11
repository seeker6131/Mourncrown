// Pixel-game shadows (director: "เงาเอาตามเกมพิกเซล ไม่จำเป็นต้องสมจริง"): a flat dark oval under everything, drawn at its exact
// size so its pixels match the art's pixels — solid core, checkerboard-dithered rim, no blur, no sun direction.
import Phaser from 'phaser';

const COL = '#08120e';
/** texture of a w × h pixel oval (made once per size) */
export function pxShadowKey(scene: Phaser.Scene, w: number, h: number) {
  w = Math.max(4, Math.round(w)); h = Math.max(3, Math.round(h));
  const key = `pxsh_${w}_${h}`;
  if (scene.textures.exists(key)) return key;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const k = cv.getContext('2d')!; k.fillStyle = COL;
  const rx = w / 2, ry = h / 2;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const dx = (i + 0.5 - rx) / rx, dy = (j + 0.5 - ry) / ry, d = dx * dx + dy * dy;
    if (d <= 0.6 || (d <= 1 && (i + j) % 2 === 0)) k.fillRect(i, j, 1, 1);
  }
  scene.textures.addCanvas(key, cv);
  return key;
}
/** a pixel oval shadow centred on (x, y) */
export function pxShadow(scene: Phaser.Scene, x: number, y: number, w: number, h: number, alpha = 0.4, depth = 1) {
  return scene.add.image(Math.round(x), Math.round(y), pxShadowKey(scene, w, h)).setAlpha(alpha).setDepth(depth);
}
