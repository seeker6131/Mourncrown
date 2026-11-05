// Procedural environment art: trees, props, buildings, NPCs and the painted ground layer.
import { PixelCanvas, shadeDark, shadeLight, lighten, darken, mix, type Color } from './pixel';
import { hash2, fbm, valueNoise } from '../core/rng';
import { G, MAP_W, MAP_H, TILE } from '../world/mapgen';

const OUT = 0x140c1c;

/** Leafy blob with per-pixel clustered shading. */
function leafBlob(p: PixelCanvas, cx: number, cy: number, rx: number, ry: number, c: Color, seed: number) {
  for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
    const n = valueNoise(x * 0.45, y * 0.45, seed) * 0.35;
    const d = dx * dx + dy * dy - n;
    if (d > 0.85) continue;
    const l = dx * 0.55 + dy * 0.8 + (valueNoise(x * 0.7, y * 0.7, seed + 3) - 0.5) * 0.6;
    let col = c;
    if (l > 0.55) col = shadeDark(c, 0.5);
    else if (l > 0.15) col = shadeDark(c, 0.25);
    else if (l < -0.6) col = shadeLight(c, 0.45);
    else if (l < -0.25) col = shadeLight(c, 0.2);
    p.set(x, y, col);
  }
}

const TREE_COLS: Color[] = [0x4fa83a, 0x2f7a3a, 0x2a9a86, 0xf08ab4, 0xe07a2a];

export function tree(v: number): PixelCanvas {
  const p = new PixelCanvas(56, 72);
  const c = TREE_COLS[v] ?? TREE_COLS[0];
  const trunk = 0x6a4428;
  // roots + trunk
  p.rect(23, 46, 10, 22, trunk);
  for (let y = 46; y < 68; y++) { p.set(23, y, shadeLight(trunk, 0.25)); p.set(31, y, shadeDark(trunk, 0.4)); p.set(32, y, shadeDark(trunk, 0.5)); if (y % 5 === 0) p.set(27, y, darken(trunk, 0.3)); }
  p.rect(20, 66, 4, 3, trunk); p.rect(32, 66, 4, 3, shadeDark(trunk, 0.3));
  // branches
  p.thickLine(27, 52, 16, 40, trunk, 3); p.thickLine(29, 50, 40, 38, shadeDark(trunk, 0.2), 3);
  // canopy clusters
  const s = v * 17 + 3;
  leafBlob(p, 28, 34, 18, 12, darken(c, 0.15), s);
  leafBlob(p, 16, 28, 11, 10, c, s + 1);
  leafBlob(p, 40, 28, 11, 10, c, s + 2);
  leafBlob(p, 28, 18, 14, 11, c, s + 3);
  leafBlob(p, 22, 12, 8, 7, lighten(c, 0.08), s + 4);
  if (v === 3) for (let i = 0; i < 26; i++) p.set(10 + hash2(i, 1) * 36, 8 + hash2(i, 2) * 34, hash2(i, 3) > 0.5 ? 0xffe0ee : 0xffffff);
  if (v === 0 || v === 1) for (let i = 0; i < 5; i++) { const x = 12 + hash2(i, 9 + v) * 32, y = 16 + hash2(i, 7) * 24; p.rect(x, y, 2, 2, v === 0 ? 0xe04848 : 0xf2cc58); }
  p.outline(OUT);
  return p;
}

export function pine(v: number): PixelCanvas {
  const p = new PixelCanvas(44, 72);
  const c = v === 2 ? 0x2a8a7a : 0x2a6a46;
  p.rect(19, 56, 6, 12, 0x5a3a22); p.set(24, 60, darken(0x5a3a22, 0.4));
  for (let i = 0; i < 5; i++) {
    const y = 58 - i * 11, w = 20 - i * 3.6;
    for (let row = 0; row < 14; row++) {
      const ww = w * (row / 14) + 2;
      for (let x = -ww; x <= ww; x++) {
        const xx = 22 + x, yy = y - 14 + row;
        let col = c;
        if (x > ww * 0.35) col = shadeDark(c, 0.4); else if (x < -ww * 0.5) col = shadeLight(c, 0.25);
        if (row === 13 && (Math.floor(x) & 1)) col = shadeDark(c, 0.55);
        p.set(xx, yy, col);
      }
    }
  }
  p.set(22, 3, lighten(c, 0.5));
  p.outline(OUT);
  return p;
}

export function bush(v: number): PixelCanvas {
  const p = new PixelCanvas(26, 20);
  const c = v ? 0x3f8a3a : 0x4f9a40;
  leafBlob(p, 13, 12, 11, 7, c, 40 + v);
  if (v) for (const [x, y] of [[7, 10], [13, 8], [18, 12], [10, 14]] as const) { p.set(x, y, 0xd03050); p.set(x + 1, y, 0xff6080); }
  p.outline(OUT);
  return p;
}

export function rock(v: number): PixelCanvas {
  const p = new PixelCanvas(20, 16);
  const c = v ? 0x8a8a9a : 0x9a9488;
  p.shadedEllipse(10, 10, 8, 5.5, c);
  p.line(6, 9, 9, 11, darken(c, 0.3));
  p.rect(4, 13, 10, 1, 0x5a8a3a);
  p.outline(OUT);
  return p;
}

export function bigRock(): PixelCanvas {
  const p = new PixelCanvas(36, 28);
  const c = 0x8a8898;
  p.shadedEllipse(18, 17, 15, 9, c);
  p.shadedEllipse(12, 12, 8, 6, lighten(c, 0.05));
  p.line(18, 10, 22, 20, darken(c, 0.35)); p.line(22, 20, 26, 22, darken(c, 0.35));
  leafBlob(p, 14, 8, 7, 3, 0x5a9a3a, 9);
  p.outline(OUT);
  return p;
}

export function flower(v: number): PixelCanvas {
  const p = new PixelCanvas(12, 12);
  const cols = [0xff6a8a, 0xffd84a, 0x8ab0ff, 0xffffff];
  const c = cols[v % 4];
  for (const [x, y] of [[3, 5], [8, 3], [6, 8]] as const) {
    p.line(x, y + 1, x, y + 4, 0x3a7a2a);
    p.set(x - 1, y, c); p.set(x + 1, y, c); p.set(x, y - 1, c); p.set(x, y + 1, c); p.set(x, y, 0xffe070);
  }
  return p;
}

export function tuft(g: number): PixelCanvas {
  const p = new PixelCanvas(12, 10);
  const c = g === G.Forest ? 0x2f6a34 : g === G.Grove ? 0x2a8a72 : 0x4a9a34;
  for (const [x, h] of [[2, 4], [4, 6], [6, 5], [8, 7], [10, 4]] as const) { p.line(x, 9, x + (x > 5 ? 1 : -1), 9 - h, x % 4 ? c : lighten(c, 0.25)); }
  return p;
}

export function mushrooms(v: number): PixelCanvas {
  const p = new PixelCanvas(16, 14);
  const cap = v ? 0x6ae0ff : 0xd8443c;
  for (const [x, y, r] of [[4, 8, 3], [10, 6, 4], [13, 10, 2]] as const) {
    p.rect(x - 1, y, 2, 5 - (r > 3 ? 0 : 1), 0xf2e2c4);
    p.shadedEllipse(x, y, r, r * 0.7, cap);
    p.set(x - 1, y - 1, 0xffffff);
  }
  p.outline(OUT);
  return p;
}

export function house(v: number): PixelCanvas {
  const p = new PixelCanvas(88, 84);
  const roof = v ? 0x3a62b0 : 0xb8443a;
  const wall = 0xe8d4a8, wood = 0x7a4a2a, stone = 0x8a8478;
  // stone base
  for (let x = 10; x < 78; x++) for (let y = 66; y < 80; y++) {
    const brick = ((Math.floor((x + (Math.floor(y / 4) % 2) * 3) / 6)) + Math.floor(y / 4)) % 2;
    p.set(x, y, (x % 6 === 0 || y % 4 === 0) ? darken(stone, 0.3) : brick ? stone : lighten(stone, 0.08));
  }
  // walls
  p.rect(12, 38, 64, 28, wall);
  for (let y = 38; y < 66; y++) { p.set(12, y, wood); p.set(75, y, wood); p.set(44, y, wood); }
  p.rect(12, 38, 64, 2, wood); p.rect(12, 52, 64, 1, darken(wall, 0.15));
  for (let x = 13; x < 75; x++) p.set(x, 64, shadeDark(wall, 0.3));
  // door
  p.rect(38, 54, 12, 26, darken(wood, 0.2)); p.rect(39, 55, 10, 25, wood);
  p.line(44, 55, 44, 79, darken(wood, 0.35)); p.set(47, 67, 0xf2cc58);
  p.rect(37, 52, 14, 2, darken(wood, 0.35));
  // windows (warm light)
  for (const wx of [20, 58]) {
    p.rect(wx, 46, 11, 10, darken(wood, 0.3));
    p.rect(wx + 1, 47, 9, 8, 0xffd27a); p.rect(wx + 1, 47, 4, 3, 0xfff0c0);
    p.line(wx + 5, 47, wx + 5, 54, darken(wood, 0.3)); p.line(wx + 1, 51, wx + 9, 51, darken(wood, 0.3));
    p.rect(wx - 1, 56, 13, 2, wood);
    p.rect(wx, 58, 11, 3, 0x4a9a3a); p.set(wx + 2, 58, 0xff6a8a); p.set(wx + 6, 58, 0xffd84a); p.set(wx + 9, 58, 0xff6a8a);
  }
  // roof (sloped, tiled)
  for (let y = 4; y < 42; y++) {
    const inset = Math.max(0, 38 - y) * 0.95;
    for (let x = 4 + inset; x < 84 - inset; x++) {
      const row = Math.floor((y - 4) / 4);
      const tileEdge = (y - 4) % 4 === 3 || ((Math.floor(x) + row * 3) % 7 === 0);
      let c = roof;
      if (x > 44) c = shadeDark(roof, 0.25);
      if (tileEdge) c = shadeDark(c, 0.35);
      if ((y - 4) % 4 === 0) c = shadeLight(c, 0.15);
      p.set(x, y, c);
    }
  }
  p.line(44, 4, 44, 6, shadeLight(roof, 0.5));
  p.rect(2, 40, 84, 2, darken(roof, 0.45));
  // chimney
  p.rect(62, 6, 8, 14, stone); p.rect(61, 5, 10, 2, darken(stone, 0.2));
  p.outline(OUT);
  return p;
}

export function well(): PixelCanvas {
  const p = new PixelCanvas(32, 40);
  const stone = 0x8a8a98;
  p.rect(5, 6, 2, 22, 0x6a4428); p.rect(25, 6, 2, 22, 0x6a4428);
  for (let y = 0; y < 8; y++) p.rect(2 + y * 0, 2 + y, 28, 1, y < 1 ? 0xd04a3a : shadeDark(0xb8443a, y * 0.05));
  p.line(6, 14, 26, 14, 0x5a3a22); p.rect(15, 14, 2, 8, 0xc8b080); p.rect(13, 21, 6, 4, 0x7a4a2a);
  p.shadedEllipse(16, 30, 13, 6, stone);
  p.ellipse(16, 29, 9, 3.5, 0x1a2a4a); p.ellipse(15, 29, 6, 2, 0x2a4a8a);
  for (let x = 4; x < 29; x += 4) p.set(x, 33, darken(stone, 0.3));
  p.outline(OUT);
  return p;
}

export function fence(): PixelCanvas {
  const p = new PixelCanvas(16, 18);
  const w = 0x9a6a3a;
  p.rect(1, 4, 3, 13, w); p.rect(12, 4, 3, 13, w);
  p.rect(0, 7, 16, 2, lighten(w, 0.1)); p.rect(0, 12, 16, 2, w);
  p.set(2, 3, lighten(w, 0.3)); p.set(13, 3, lighten(w, 0.3));
  p.outline(OUT);
  return p;
}

export function sign(): PixelCanvas {
  const p = new PixelCanvas(20, 24);
  p.rect(9, 8, 2, 15, 0x6a4428);
  p.shadedRect(2, 4, 16, 8, 0xb08050);
  p.line(5, 7, 14, 7, 0x5a3a22); p.line(5, 9, 12, 9, 0x5a3a22);
  p.outline(OUT);
  return p;
}

export function campfire(f: number): PixelCanvas {
  const p = new PixelCanvas(24, 28);
  // logs & stones
  for (let a = 0; a < 8; a++) { const r = (a / 8) * Math.PI * 2; p.shadedEllipse(12 + Math.cos(r) * 8, 22 + Math.sin(r) * 3, 2, 1.6, 0x8a8a98, false); }
  p.thickLine(6, 23, 18, 20, 0x6a4428, 2); p.thickLine(6, 20, 18, 23, 0x5a3a22, 2);
  // flames
  const h = [10, 13, 11, 14][f % 4];
  for (let i = 0; i < 3; i++) {
    const x = 9 + i * 3 + ((f + i) % 2);
    const hh = h - (i === 1 ? 0 : 4) - ((f + i) % 3);
    for (let y = 0; y < hh; y++) {
      const w = Math.max(0, 2.5 * (1 - y / hh));
      const c = y < hh * 0.3 ? 0xff5a2a : y < hh * 0.7 ? 0xffa030 : 0xffe070;
      p.rect(x - w, 21 - y, w * 2, 1, c);
    }
  }
  p.set(12, 19, 0xffffff);
  return p;
}

export function lamp(): PixelCanvas {
  const p = new PixelCanvas(12, 34);
  p.rect(5, 10, 2, 22, 0x3a3048); p.rect(3, 31, 6, 2, 0x3a3048);
  p.rect(2, 3, 8, 8, 0x3a3048); p.rect(3, 4, 6, 6, 0xffd060); p.rect(4, 5, 2, 2, 0xfff4c0);
  p.rect(1, 2, 10, 1, 0x3a3048);
  p.outline(OUT);
  return p;
}

export function pillar(broken: boolean, v: number): PixelCanvas {
  const p = new PixelCanvas(24, 56);
  const c = 0xb8b4c8;
  const top = broken ? 26 + (v % 3) * 4 : 8;
  p.rect(2, 48, 20, 6, darken(c, 0.15)); p.rect(1, 52, 22, 3, darken(c, 0.25));
  for (let y = top; y < 48; y++) {
    for (let x = 5; x < 19; x++) {
      let col = c;
      if (x > 14) col = shadeDark(c, 0.3); else if (x < 7) col = shadeLight(c, 0.2);
      if ((x - 5) % 4 === 0) col = shadeDark(col, 0.15);
      p.set(x, y, col);
    }
  }
  if (broken) { for (let x = 5; x < 19; x++) p.set(x, top - (x % 3), c); }
  else { p.rect(2, 4, 20, 5, c); p.rect(2, 8, 20, 1, darken(c, 0.3)); }
  // vines
  for (let y = top + 4; y < 46; y += 2) p.set(6 + Math.round(Math.sin(y * 0.5) * 2), y, 0x3a8a3a);
  p.set(8, top + 10, 0x6aff9a);
  p.outline(OUT);
  return p;
}

export function altar(): PixelCanvas {
  const p = new PixelCanvas(40, 30);
  const c = 0xa8a4b8;
  p.shadedRect(4, 14, 32, 14, c);
  p.rect(2, 12, 36, 3, lighten(c, 0.1));
  for (let x = 8; x < 33; x += 6) p.rect(x, 18, 3, 6, 0x5a3a8a);
  p.ellipse(20, 8, 4, 5, 0x9a5aff); p.ellipse(20, 8, 2, 3, 0xe0c0ff); p.set(19, 6, 0xffffff);
  p.outline(OUT);
  return p;
}

export function stall(): PixelCanvas {
  const p = new PixelCanvas(56, 44);
  const wood = 0x8a5a32;
  p.rect(4, 12, 3, 30, wood); p.rect(49, 12, 3, 30, wood);
  // awning stripes
  for (let x = 0; x < 56; x++) for (let y = 4; y < 14; y++) p.set(x, y, Math.floor(x / 7) % 2 ? 0xf0e6d0 : 0x3a8a5a);
  for (let x = 0; x < 56; x += 7) p.ellipse(x + 3.5, 14, 3.5, 2, Math.floor(x / 7) % 2 ? 0xf0e6d0 : 0x3a8a5a);
  p.shadedRect(2, 28, 52, 12, wood);
  // goods
  for (let i = 0; i < 6; i++) p.shadedEllipse(9 + i * 7, 26, 3, 3, [0xe04848, 0xffd84a, 0x7ee05a, 0xff8a3a, 0x9a5aff, 0xe04848][i]);
  p.outline(OUT);
  return p;
}

export function barrel(): PixelCanvas {
  const p = new PixelCanvas(16, 20);
  p.shadedEllipse(8, 11, 6.5, 8, 0x8a5a32, false);
  p.rect(2, 6, 13, 1, 0x4a4a58); p.rect(2, 15, 13, 1, 0x4a4a58);
  p.ellipse(8, 4, 5, 2, 0x6a4428);
  p.outline(OUT);
  return p;
}

export function crate(): PixelCanvas {
  const p = new PixelCanvas(16, 18);
  p.shadedRect(1, 3, 14, 14, 0xa87a48);
  p.line(1, 3, 14, 16, 0x6a4428); p.line(14, 3, 1, 16, 0x6a4428);
  p.outline(OUT);
  return p;
}

export function tent(): PixelCanvas {
  const p = new PixelCanvas(48, 36);
  const c = 0x8a6a4a;
  for (let y = 4; y < 34; y++) {
    const w = (y - 4) * 0.8;
    for (let x = -w; x <= w; x++) p.set(24 + x, y, x > 0 ? shadeDark(c, 0.3) : (Math.floor(x) % 5 === 0 ? darken(c, 0.15) : c));
  }
  for (let y = 18; y < 34; y++) { const w = (y - 18) * 0.35; p.rect(24 - w, y, w * 2 + 1, 1, 0x1a1010); }
  p.line(24, 0, 24, 5, 0x5a3a22); p.rect(25, 0, 5, 3, 0xc23b3b);
  p.outline(OUT);
  return p;
}

export function crystal(): PixelCanvas {
  const p = new PixelCanvas(20, 30);
  const c = 0x7ae8ff;
  for (const [x, h, w] of [[10, 26, 4], [5, 16, 3], [15, 18, 3]] as const) {
    for (let y = 0; y < h; y++) {
      const ww = y < 4 ? (y / 4) * w : w;
      for (let i = -ww; i <= ww; i++) p.set(x + i, 28 - h + y, i < 0 ? lighten(c, 0.35) : i > ww * 0.4 ? shadeDark(c, 0.35) : c);
    }
  }
  p.outline(0x0a2a3a);
  return p;
}

export function lily(v: number): PixelCanvas {
  const p = new PixelCanvas(14, 10);
  p.ellipse(7, 5, 6, 3.5, 0x3a9a4a); p.line(7, 5, 12, 3, 0x2a6a3a);
  if (v) { p.ellipse(6, 4, 2, 1.5, 0xffb0d0); p.set(6, 4, 0xffe070); }
  return p;
}

export function log(): PixelCanvas {
  const p = new PixelCanvas(36, 16);
  p.rect(4, 4, 28, 9, 0x7a4a2a);
  p.rect(4, 4, 28, 2, 0x9a6a3a); p.rect(4, 11, 28, 2, 0x4a2c18);
  p.ellipse(31, 8, 3, 4.5, 0xc89a60); p.ellipse(31, 8, 1.5, 2.5, 0x9a6a3a);
  p.rect(10, 3, 6, 2, 0x5a9a3a);
  p.outline(OUT);
  return p;
}

// ---- NPCs (front-facing, 2 idle frames) ----
export function npc(id: 'elder' | 'merchant' | 'smith', f: number): PixelCanvas {
  const p = new PixelCanvas(32, 36);
  const b = f;
  const skin = 0xf0c098;
  const robe = id === 'elder' ? 0x6a3a9a : id === 'merchant' ? 0x3a8a5a : 0x5a4a40;
  // body / robe
  for (let y = 18; y < 33; y++) { const w = 5 + (y - 18) * 0.3; p.rect(16 - w, y + (y < 26 ? b : 0), w * 2, 1, y > 30 ? darken(robe, 0.3) : robe); }
  p.rect(10, 26, 12, 1, id === 'smith' ? 0x8a6a4a : 0xf2cc58);
  if (id === 'smith') { p.rect(12, 20 + b, 8, 11, 0x8a6a4a); p.rect(12, 20 + b, 8, 1, 0xa88a6a); }
  // arms
  p.rect(8, 20 + b, 3, 7, darken(robe, 0.2)); p.rect(21, 20 + b, 3, 7, darken(robe, 0.2));
  p.rect(8, 26 + b, 3, 2, skin); p.rect(21, 26 + b, 3, 2, skin);
  // head
  p.shadedEllipse(16, 13 + b, 6, 5.5, skin, false);
  p.rect(13, 13 + b, 2, 2, OUT); p.rect(18, 13 + b, 2, 2, OUT);
  if (id === 'elder') {
    // beard + hood
    for (let y = 15; y < 26; y++) { const w = Math.max(1, 5 - (y - 15) * 0.4); p.rect(16 - w, y + b, w * 2, 1, 0xf0f0f0); }
    p.shadedEllipse(16, 9 + b, 7.5, 5, robe); p.rect(9, 9 + b, 2, 8, robe); p.rect(21, 9 + b, 2, 8, darken(robe, 0.2));
    p.line(25, 6, 25, 33, 0x8a5a2a); p.ellipse(25, 5, 2.5, 2.5, 0x6ae8ff); p.set(24, 4, 0xffffff);
  } else if (id === 'merchant') {
    p.shadedEllipse(16, 9 + b, 7, 4.5, 0xe0b040); p.rect(8, 11 + b, 16, 2, 0xc89a30);
    p.rect(15, 17 + b, 2, 1, 0x8a4a3a);
    p.rect(3, 18 + b, 6, 10, 0x9a6a3a); p.rect(3, 18 + b, 6, 2, 0x7a4a2a); // backpack
  } else {
    p.shadedEllipse(16, 9 + b, 6.5, 4, 0x3a2a20);
    p.rect(13, 16 + b, 6, 3, 0x5a3a2a); // beard
    p.rect(24, 16 + b, 2, 12, 0x6a4428); p.shadedRect(22, 13 + b, 7, 4, 0x8a8a9a); // hammer
  }
  p.outline(OUT);
  return p;
}

// ---- Ground painter ----
const GROUND_BASE: Record<number, Color> = {
  [G.Grass]: 0x5aa83e, [G.Path]: 0xc8a06a, [G.Water]: 0x2f6fb8, [G.Sand]: 0xe0cc8a, [G.Forest]: 0x3a7a3c,
  [G.Grove]: 0x3a9a7a, [G.Plaza]: 0xb4a890, [G.Ruins]: 0x8a8698, [G.Bridge]: 0x9a6a3a,
};

export function paintGround(ground: Uint8Array): HTMLCanvasElement {
  const W = MAP_W * TILE, H = MAP_H * TILE;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  const d = img.data;
  const gAt = (tx: number, ty: number) => ground[Math.max(0, Math.min(MAP_H - 1, ty)) * MAP_W + Math.max(0, Math.min(MAP_W - 1, tx))];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      // jitter sample position for organic borders
      const jx = (valueNoise(x * 0.15, y * 0.15, 11) - 0.5) * 9;
      const jy = (valueNoise(x * 0.15, y * 0.15, 23) - 0.5) * 9;
      const tx = Math.floor((x + jx) / TILE), ty = Math.floor((y + jy) / TILE);
      const g = gAt(tx, ty);
      let c = GROUND_BASE[g];
      const n = fbm(x * 0.03, y * 0.03, 5, 3);
      const h = hash2(x, y, 3);
      if (g === G.Grass || g === G.Forest || g === G.Grove) {
        // large-scale tonal variation + grass blades texture
        c = n > 0.6 ? shadeLight(c, (n - 0.6) * 0.8) : n < 0.4 ? shadeDark(c, (0.4 - n) * 0.9) : c;
        const blade = valueNoise(x * 0.9, y * 0.35, 77);
        if (blade > 0.78) c = shadeLight(c, 0.14);
        else if (blade < 0.18) c = shadeDark(c, 0.16);
        if (h > 0.995) c = shadeLight(c, 0.4);
        // dappled light in forest
        if (g === G.Forest) { const sp = valueNoise(x * 0.05, y * 0.05, 99); if (sp > 0.72) c = shadeLight(c, 0.18); }
      } else if (g === G.Path) {
        c = n > 0.55 ? lighten(c, 0.08) : n < 0.42 ? darken(c, 0.08) : c;
        if (h > 0.97) c = darken(c, 0.25); else if (h > 0.94) c = lighten(c, 0.2);
      } else if (g === G.Water) {
        // depth: darker away from shore
        let shore = 0;
        for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) if (gAt(tx + ox, ty + oy) !== G.Water && gAt(tx + ox, ty + oy) !== G.Bridge) shore = 1;
        c = shore ? lighten(c, 0.12) : darken(c, 0.1);
        const wv = valueNoise(x * 0.09, y * 0.45, 61);
        if (wv > 0.8 && hash2(x >> 1, y, 4) > 0.3) c = lighten(c, 0.3);
        else if (wv < 0.2) c = darken(c, 0.1);
        if (n > 0.62) c = lighten(c, 0.06);
      } else if (g === G.Sand) {
        if (h > 0.9) c = darken(c, 0.1); else if (h < 0.05) c = lighten(c, 0.2);
      } else if (g === G.Plaza || g === G.Ruins) {
        // cobblestones
        const sx = Math.floor((x + (Math.floor(y / 8) % 2) * 4) / 8), sy = Math.floor(y / 8);
        const shade = hash2(sx, sy, g) * 0.16 - 0.08;
        c = shade > 0 ? lighten(c, shade) : darken(c, -shade);
        const lx = (x + (Math.floor(y / 8) % 2) * 4) % 8, ly = y % 8;
        if (lx === 0 || ly === 0) c = darken(c, 0.28);
        else if (lx === 1 || ly === 1) c = lighten(c, 0.1);
        if (g === G.Ruins && valueNoise(x * 0.08, y * 0.08, 5) > 0.66) c = mix(c, 0x4a8a3a, 0.55); // moss
      } else if (g === G.Bridge) {
        const plank = Math.floor(y / 5);
        c = plank % 2 ? c : lighten(c, 0.08);
        if (y % 5 === 0) c = darken(c, 0.4);
        if (hash2(plank, Math.floor(x / 24), 9) > 0.8 && x % 24 === 0) c = 0x4a4a58;
      }
      // soft shadow at borders between grass and path/plaza (fake ambient occlusion)
      const i = (y * W + x) * 4;
      d[i] = (c >> 16) & 255; d[i + 1] = (c >> 8) & 255; d[i + 2] = c & 255; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  // bank shading: dark rim along water edges
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = '#10203a';
  for (let ty = 0; ty < MAP_H; ty++) for (let tx = 0; tx < MAP_W; tx++) {
    if (gAt(tx, ty) === G.Water && gAt(tx, ty - 1) !== G.Water && gAt(tx, ty - 1) !== G.Bridge) ctx.fillRect(tx * TILE, ty * TILE, TILE, 4);
  }
  ctx.globalAlpha = 1;
  return cv;
}

/** Tiny minimap image: 2px per tile. */
export function paintMinimap(ground: Uint8Array, blocked: Uint8Array): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = MAP_W * 2; cv.height = MAP_H * 2;
  const ctx = cv.getContext('2d')!;
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    const g = ground[y * MAP_W + x];
    let c = GROUND_BASE[g];
    if (blocked[y * MAP_W + x] && g !== G.Water) c = darken(c, 0.45);
    ctx.fillStyle = '#' + c.toString(16).padStart(6, '0');
    ctx.fillRect(x * 2, y * 2, 2, 2);
  }
  return cv;
}
