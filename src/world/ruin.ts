// Burnt ruins, made from each building's own picture so every building burns the same way and stays recognisable:
// the top is broken off along a jagged line, the walls are charred black (darker near the burnt edge), charred beams
// stick up out of the gap and a heap of the game's own rubble props piles up in front. Fire and smoke on top come from
// PixelLab effects (fx_ruin_fire, fx_smoke). Built once per picture on a canvas and kept as a texture.
import type Phaser from 'phaser';

const RUBBLE = ['o_pp_dung_rubble', 'o_pp_forest_rockpile'];

/** the visible part of a picture (texture pixels), cached — pictures have empty margins */
const BOX = new Map<string, { top: number; bot: number; x0: number; x1: number }>();
export function opaqueBox(sc: Phaser.Scene, key: string) {
  const hit = BOX.get(key); if (hit) return hit;
  const img = sc.textures.get(key).getSourceImage() as HTMLImageElement | HTMLCanvasElement, W = img.width, H = img.height;
  const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d')!; x.drawImage(img, 0, 0);
  const p = x.getImageData(0, 0, W, H).data; let top = H, bot = 0, x0 = W, x1 = 0;
  for (let y = 0; y < H; y++) for (let i = 0; i < W; i++) if (p[(y * W + i) * 4 + 3] > 20) { if (y < top) top = y; if (y > bot) bot = y; if (i < x0) x0 = i; if (i > x1) x1 = i; }
  const b = bot > top ? { top, bot, x0, x1 } : { top: 0, bot: H, x0: 0, x1: W }; BOX.set(key, b); return b;
}
/** a sooty darkening for a burning building: the worse the fire, the blacker */
export const charTint = (f: number) => f >= 0.66 ? 0x8a7064 : f >= 0.33 ? 0xae9488 : f > 0 ? 0xd4c4bc : 0xffffff;
/** a rubble prop, a little darker (sooty) */
function sooty(src: HTMLImageElement | HTMLCanvasElement) {
  const c = document.createElement('canvas'); c.width = src.width; c.height = src.height; const x = c.getContext('2d')!; x.drawImage(src, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height); for (let i = 0; i < d.data.length; i += 4) { d.data[i] *= 0.62; d.data[i + 1] *= 0.58; d.data[i + 2] *= 0.56; }
  x.putImageData(d, 0, 0); return c;
}

function seeded(str: string) { let a = 0; for (const ch of str) a = (a * 31 + ch.charCodeAt(0)) >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** make texture `dst` (a ruin) from texture `src`; returns false when the source picture is missing */
export function makeRuin(sc: Phaser.Scene, src: string, dst: string): boolean {
  if (sc.textures.exists(dst)) return true;
  if (!sc.textures.exists(src)) return false;
  const img = sc.textures.get(src).getSourceImage() as HTMLImageElement | HTMLCanvasElement, W = img.width, H = img.height;
  const ct = sc.textures.createCanvas(dst, W, H); if (!ct) return false;
  const ctx = ct.getContext(); ctx.imageSmoothingEnabled = false; ctx.drawImage(img, 0, 0);
  const id = ctx.getImageData(0, 0, W, H), p = id.data, rnd = seeded(src);
  let top = H, bot = 0, x0 = W, x1 = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (p[(y * W + x) * 4 + 3] > 20) { top = Math.min(top, y); bot = Math.max(bot, y); x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
  if (bot <= top) return false;
  const tall = bot - top, base = top + tall * 0.5;
  // jagged break line: 4-px steps, a couple of wall stubs left standing higher
  const cut: number[] = []; let c = base;
  for (let x = 0; x < W; x += 4) { c = Math.max(top + tall * 0.3, Math.min(top + tall * 0.68, c + (rnd() - 0.5) * tall * 0.12)); cut.push(c); }
  for (let k = 0; k < 2; k++) { const at = Math.floor(((x0 + (x1 - x0) * (0.15 + rnd() * 0.7)) / 4)); for (let j = 0; j < 2 + Math.floor(rnd() * 3); j++) if (cut[at + j] !== undefined) cut[at + j] -= tall * (0.1 + rnd() * 0.08); }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4; if (!p[i + 3]) continue;
    const cy = cut[x >> 2];
    if (y < cy) { p[i + 3] = 0; continue; }
    const under = y - cy;
    if (under < 2) { p[i] = 26; p[i + 1] = 18; p[i + 2] = 14; continue; }   // burnt edge
    let k = 0.3 + 0.45 * Math.min(1, under / (tall * 0.4));
    if (rnd() < 0.07) k *= 0.6;                                                // soot speckles
    p[i] = p[i] * k; p[i + 1] = p[i + 1] * k * 0.88; p[i + 2] = p[i + 2] * k * 0.8;
    if (under < 6 && rnd() < 0.05) { p[i] = 240; p[i + 1] = 120 + rnd() * 60; p[i + 2] = 40; }   // embers along the edge
  }
  ctx.putImageData(id, 0, 0);
  // charred beams sticking up out of the gap (square pixel brush, no smoothing)
  const beam = (ax: number, ay: number, bx: number, by: number, w: number) => {
    const n = Math.ceil(Math.hypot(bx - ax, by - ay));
    for (let s = 0; s <= n; s++) { const t = s / n, x = Math.round(ax + (bx - ax) * t), y = Math.round(ay + (by - ay) * t); ctx.fillStyle = '#211813'; ctx.fillRect(x - (w >> 1), y - (w >> 1), w, w); ctx.fillStyle = '#4a3326'; ctx.fillRect(x - (w >> 1), y - (w >> 1), 1, 1); }
  };
  const bw = Math.max(3, Math.round((x1 - x0) / 32));
  for (let k = 0; k < 3; k++) {
    const bx = x0 + (x1 - x0) * (0.2 + 0.3 * k + rnd() * 0.1), by = base + tall * (0.05 + rnd() * 0.1);
    beam(bx, by, bx + (rnd() - 0.5) * tall * 0.5, by - tall * (0.15 + rnd() * 0.15), bw);
  }
  // rubble heap along the front, from the game's own rubble props
  const props = RUBBLE.filter(k => sc.textures.exists(k));
  const n = Math.max(3, Math.round((x1 - x0) / 26));
  for (let k = 0; k < n && props.length; k++) {
    const r = sooty(sc.textures.get(props[k % props.length]).getSourceImage() as HTMLImageElement), sz = 0.7 + rnd() * 0.5;
    const w = r.width * sz, h = r.height * sz, cx = x0 + (x1 - x0) * ((k + 0.5) / n) + (rnd() - 0.5) * 10;
    ctx.drawImage(r, Math.round(cx - w / 2), Math.round(bot - h + 4 - rnd() * 8), Math.round(w), Math.round(h));
  }
  ct.refresh();
  return true;
}
