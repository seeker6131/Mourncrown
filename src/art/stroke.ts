// Optional sticker-style outline ("stroke") around world art. Toggle stored per device.
import Phaser from 'phaser';

const KEY = 'eldergrove_stroke';
export function strokeEnabled(): boolean { try { return localStorage.getItem(KEY) !== '0'; } catch { return true; } }
export function setStroke(on: boolean) { try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* ignore */ } }

const COLOR = '#1a0e12';

/** Paint an outline of `t` px around opaque pixels, staying inside each frame cell. */
function outlineCanvas(src: HTMLImageElement | HTMLCanvasElement, cells: { x: number; y: number; w: number; h: number }[], t: number) {
  const W = src.width, H = src.height;
  const sil = document.createElement('canvas'); sil.width = W; sil.height = H;
  const s = sil.getContext('2d')!;
  s.drawImage(src, 0, 0);
  s.globalCompositeOperation = 'source-in';
  s.fillStyle = COLOR; s.fillRect(0, 0, W, H);
  const out = document.createElement('canvas'); out.width = W; out.height = H;
  const o = out.getContext('2d')!;
  o.imageSmoothingEnabled = false;
  for (const c of cells) {
    o.save();
    o.beginPath(); o.rect(c.x, c.y, c.w, c.h); o.clip();
    for (let dy = -t; dy <= t; dy++) for (let dx = -t; dx <= t; dx++) {
      if (dx * dx + dy * dy > t * t + 0.5 || (dx === 0 && dy === 0)) continue;
      o.drawImage(sil, dx, dy);
    }
    o.restore();
  }
  o.drawImage(src, 0, 0);
  return out;
}

/** Stroke a plain image texture in place (keeps the key). */
export function strokeImage(scene: Phaser.Scene, key: string, t = 2) {
  const src = scene.textures.get(key).getSourceImage() as HTMLImageElement;
  const cv = outlineCanvas(src, [{ x: 0, y: 0, w: src.width, h: src.height }], t);
  scene.textures.remove(key);
  scene.textures.addCanvas(key, cv);
}

/** Stroke a spritesheet texture in place (frames keep their size). */
export function strokeSheet(scene: Phaser.Scene, key: string, fw: number, fh: number, t = 2) {
  const src = scene.textures.get(key).getSourceImage() as HTMLImageElement;
  const cells = [];
  for (let y = 0; y + fh <= src.height; y += fh) for (let x = 0; x + fw <= src.width; x += fw) cells.push({ x, y, w: fw, h: fh });
  const cv = outlineCanvas(src, cells, t);
  scene.textures.remove(key);
  scene.textures.addSpriteSheet(key, cv as unknown as HTMLImageElement, { frameWidth: fw, frameHeight: fh });
}
