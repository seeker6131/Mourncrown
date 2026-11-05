// Isometric (2:1) environment art: painted ground, buildings, props, minimap.
import { PixelCanvas, shadeDark, shadeLight, lighten, darken, mix, type Color } from './pixel';
import { hash2, fbm, valueNoise } from '../core/rng';
import { G, MAP_W, MAP_H, WORLD_PX_W, WORLD_PX_H, unIso, surfaceAt } from '../world/mapgen';

const OUT = 0x120a14;
export const WATER_DEPTH = 6;

export const GROUND_BASE: Record<number, Color> = {
  [G.Grass]: 0x588a3c, [G.Path]: 0xb08656, [G.Water]: 0x2a5c98, [G.Sand]: 0xc9ae78, [G.Forest]: 0x335a33,
  [G.Grove]: 0x2e7064, [G.Plaza]: 0x968c7c, [G.Ruins]: 0x76728a, [G.Bridge]: 0x8a5c34,
};
const OUTSIDE = 0x1c2e1c;

// ---------------- Ground ----------------
export function paintGroundIso(ground: Uint8Array): HTMLCanvasElement {
  const W = WORLD_PX_W, H = WORLD_PX_H;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  const d = img.data;
  const gAt = (tx: number, ty: number): number => {
    const x = Math.floor(tx), y = Math.floor(ty);
    if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return -1;
    return ground[y * MAP_W + x];
  };
  // ground type at a screen pixel (with organic jitter of borders)
  const gScreen = (sx: number, sy: number): number => {
    const t = unIso(sx, sy);
    const jx = (valueNoise(sx * 0.09, sy * 0.18, 11) - 0.5) * 0.35;
    const jy = (valueNoise(sx * 0.09, sy * 0.18, 23) - 0.5) * 0.35;
    const g = gAt(t.tx + jx, t.ty + jy);
    return g < 0 ? g : surfaceAt(t.tx + jx * 0.4, t.ty + jy * 0.4, g);
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let g = gScreen(x, y);
      let c: Color;
      const i = (y * W + x) * 4;
      if (g === G.Water || g === G.Bridge && false) {
        // sunken water: what's visible here is either a bank wall or the water surface further "up"
        let wall = -1;
        for (let k = 1; k <= WATER_DEPTH; k++) {
          const gg = gScreen(x, y - k);
          if (gg !== G.Water && gg !== G.Bridge) { wall = k; break; }
        }
        if (wall > 0) {
          // earthen/stone bank face: lighter at top rim, strata lines
          const depth = WATER_DEPTH - wall; // 0 at rim
          let wc: Color = 0x6a4a30;
          wc = depth < 1 ? 0x8a6a40 : shadeDark(wc, depth * 0.08);
          if (hash2(x >> 2, y, 7) > 0.8) wc = darken(wc, 0.15);
          if ((y + (x >> 3)) % 3 === 0) wc = darken(wc, 0.08);
          c = wc;
        } else {
          const t = unIso(x, y - WATER_DEPTH);
          let shore = false;
          for (let k = WATER_DEPTH + 1; k <= WATER_DEPTH + 3; k++) { const gg = gScreen(x, y - k); if (gg !== G.Water && gg !== G.Bridge) shore = true; }
          c = GROUND_BASE[G.Water];
          const n = fbm(t.tx * 0.2, t.ty * 0.2, 5, 2);
          c = n > 0.55 ? lighten(c, 0.06) : darken(c, 0.12);
          const wv = valueNoise(x * 0.07, y * 0.4, 61);
          if (wv > 0.8 && hash2(x >> 1, y, 4) > 0.35) c = lighten(c, 0.28);
          if (shore) c = mix(c, 0xd8f0ff, 0.45); // foam line
        }
      } else if (g === -1) {
        const n = fbm(x * 0.02, y * 0.04, 9, 2);
        c = n > 0.5 ? lighten(OUTSIDE, 0.06) : OUTSIDE;
        if (hash2(x, y, 2) > 0.97) c = darken(c, 0.3);
      } else {
        const t = unIso(x, y);
        c = GROUND_BASE[g];
        const n = fbm(x * 0.012, y * 0.024, 5, 3);
        const h = hash2(x, y, 3);
        if (g === G.Grass || g === G.Forest || g === G.Grove) {
          c = n > 0.6 ? shadeLight(c, (n - 0.6) * 0.7) : n < 0.42 ? shadeDark(c, (0.42 - n) * 0.9) : c;
          const blade = valueNoise(x * 0.8, y * 0.3, 77);
          if (blade > 0.8) c = shadeLight(c, 0.13);
          else if (blade < 0.17) c = shadeDark(c, 0.18);
          if (h > 0.996) c = shadeLight(c, 0.45);
          // grass clumps: lit top-left rim, shadowed bottom-right
          const cl = valueNoise(x * 0.22, y * 0.44, 13);
          if (cl > 0.72) { const cl2 = valueNoise((x + 2) * 0.22, (y + 2) * 0.44, 13); c = cl2 < cl - 0.03 ? shadeLight(c, 0.18) : shadeDark(c, 0.08); }
          else if (cl > 0.66) c = shadeDark(c, 0.14);
          // tiny pebbles and clover
          const pb = hash2(x >> 1, y >> 1, 71);
          if (pb > 0.9985) c = 0xb8b0a0; else if (pb > 0.9975) c = 0x8a8478;
          if (g === G.Grass && valueNoise(x * 0.07, y * 0.14, 19) > 0.78 && hash2(x, y, 23) > 0.86) c = shadeLight(c, 0.3);
          if (g === G.Forest) { const sp = valueNoise(x * 0.025, y * 0.05, 99); if (sp > 0.72) c = shadeLight(c, 0.16); else if (sp < 0.3) c = shadeDark(c, 0.15); }
        } else if (g === G.Path || g === G.Sand) {
          c = n > 0.55 ? lighten(c, 0.06) : n < 0.42 ? darken(c, 0.08) : c;
          if (h > 0.97) c = darken(c, 0.22); else if (h > 0.945) c = lighten(c, 0.16);
          // pebbles
          if (g === G.Path && valueNoise(t.tx * 3, t.ty * 3, 41) > 0.86) c = mix(c, 0x9a9488, 0.6);
        } else if (g === G.Plaza || g === G.Ruins) {
          // irregular flagstones (jittered Voronoi in tile space) with bevel light + mortar AO
          const u = t.tx * 2.6, v = t.ty * 2.6;
          const cu = Math.floor(u), cv = Math.floor(v);
          let d1 = 9, d2 = 9, id = 0;
          for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
            const gx = cu + i, gy = cv + j;
            const px = gx + 0.15 + hash2(gx, gy, 31) * 0.7, py = gy + 0.15 + hash2(gx, gy, 47) * 0.7;
            const dd = Math.hypot((u - px) * 1.0, (v - py) * 1.0);
            if (dd < d1) { d2 = d1; d1 = dd; id = gx * 7919 + gy; } else if (dd < d2) d2 = dd;
          }
          const edge = d2 - d1;
          const stone = hash2(id, 3, g);
          let base = mix(GROUND_BASE[g], stone > 0.66 ? 0xa89a86 : stone > 0.33 ? 0x8e8778 : 0x9c9488, 0.55);
          if (g === G.Ruins) base = mix(base, 0x7a7690, 0.5);
          c = base;
          if (edge < 0.07) c = darken(base, 0.42);                       // mortar
          else if (edge < 0.13) c = darken(base, 0.18);                  // stone rim (shadow side)
          else {
            const lx = (u - Math.floor(u)) - (v - Math.floor(v));
            if (edge < 0.2 && lx < 0) c = lighten(base, 0.12);             // bevel highlight
            if (hash2(x, y, 5) > 0.985) c = darken(c, 0.15);              // grit
          }
          if (valueNoise(x * 0.05, y * 0.1, 5) > (g === G.Ruins ? 0.62 : 0.74) && edge < 0.14) c = mix(c, 0x4f8a3a, 0.65); // moss in cracks
        } else if (g === G.Bridge) {
          const plank = Math.floor(t.tx * 3.2);
          c = plank % 2 ? c : lighten(c, 0.08);
          if ((t.tx * 3.2) % 1 < 0.12) c = darken(c, 0.4);
          if (hash2(plank, Math.floor(t.ty * 2), 9) > 0.85) c = darken(c, 0.12);
          // rails at bridge edges
          const up = gScreen(x, y - 3), dn = gScreen(x, y + 3);
          if (up === G.Water || dn === G.Water) c = 0x5a3a20;
        }
        // grass lip shadow on lower terrain (path/plaza) just below grass
        if (g === G.Path || g === G.Plaza || g === G.Sand || g === G.Ruins) {
          const above = gScreen(x, y - 2);
          if (above === G.Grass || above === G.Forest || above === G.Grove) c = darken(c, 0.22);
          const above1 = gScreen(x, y - 1);
          if (above1 === G.Grass || above1 === G.Forest || above1 === G.Grove) c = mix(c, GROUND_BASE[above1], 0.7);
        }
      }
      g = 0;
      d[i] = (c >> 16) & 255; d[i + 1] = (c >> 8) & 255; d[i + 2] = c & 255; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

export function paintMinimapIso(ground: Uint8Array, blocked: Uint8Array): HTMLCanvasElement {
  const S = 8;
  const w = Math.ceil(WORLD_PX_W / S), h = Math.ceil(WORLD_PX_H / S);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const t = unIso(x * S, y * S);
    const tx = Math.floor(t.tx), ty = Math.floor(t.ty);
    let c: Color = 0x0e160e;
    if (tx >= 0 && ty >= 0 && tx < MAP_W && ty < MAP_H) {
      const g = ground[ty * MAP_W + tx];
      c = GROUND_BASE[g];
      if (blocked[ty * MAP_W + tx] && g !== G.Water) c = darken(c, 0.45);
    }
    const i = (y * w + x) * 4;
    img.data[i] = (c >> 16) & 255; img.data[i + 1] = (c >> 8) & 255; img.data[i + 2] = c & 255; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

// ---------------- Buildings ----------------
type P2 = [number, number];
const add = (a: P2, b: P2): P2 => [a[0] + b[0], a[1] + b[1]];
const up = (a: P2, h: number): P2 => [a[0], a[1] - h];

/** Half-timbered iso cottage, footprint a×b tiles. Returns canvas and anchor (N corner) offset. */
export function isoHouse(v: number, a = 5, b = 3): { p: PixelCanvas; ax: number; ay: number } {
  const X: P2 = [16, 8], Y: P2 = [-16, 8];
  const Hh = 34, R = 24;
  const ox = b * 16 + 12, oy = Hh + R + 22;
  const p = new PixelCanvas(ox + a * 16 + 12, oy + (a + b) * 8 + 4);
  const N: P2 = [ox, oy];
  const E = add(N, [X[0] * a, X[1] * a]);
  const W = add(N, [Y[0] * b, Y[1] * b]);
  const S = add(E, [Y[0] * b, Y[1] * b]);
  const M1: P2 = [(N[0] + W[0]) / 2, (N[1] + W[1]) / 2];
  const M2: P2 = [(E[0] + S[0]) / 2, (E[1] + S[1]) / 2];
  const roof = [0xa0412e, 0x3b5788][v % 2];
  const plaster = 0xdcc79c, beam = 0x553521, stone = 0x77705f;

  // back roof plane (mostly hidden)
  p.poly([up(N, Hh), up(E, Hh), up(M2, Hh + R), up(M1, Hh + R)], shadeDark(roof, 0.45));
  // left wall (W -> S), lit
  const Lx = S[0] - W[0], Ly = S[1] - W[1];
  p.poly([W, S, up(S, Hh), up(W, Hh)], (x, y) => {
    const u = (x - W[0]) / Lx; const h = W[1] + u * Ly - y;
    const L = u * a;
    if (h < 6) return ((Math.floor(L * 4) + Math.floor(h / 3)) % 2) ? stone : lighten(stone, 0.1);
    if (h > Hh - 3) return beam;
    // door
    if (u > 0.43 && u < 0.57 && h < 24) { if (h > 22 || u < 0.445 || u > 0.555) return darken(beam, 0.2); return (Math.floor(L * 8) % 2) ? 0x6a4428 : 0x7a5232; }
    // windows
    for (const wu of [0.17, 0.83]) if (Math.abs(u - wu) < 0.075 && h > 13 && h < 25) {
      if (Math.abs(u - wu) > 0.06 || h < 14.5 || h > 23.5) return beam;
      if (Math.abs(u - wu) < 0.006 || Math.abs(h - 19) < 0.6) return beam;
      return h > 20 && u < wu ? 0xfff0b8 : 0xffc860;
    }
    if (Math.abs((L % 1) - 0.5) < 0.04 || Math.abs(h - 19) < 0.8 && (u < 0.3 || u > 0.7)) return beam;
    return hash2(x, y, 5) > 0.93 ? darken(plaster, 0.06) : plaster;
  });
  // right wall (S -> E) + gable, shaded
  const Rx = E[0] - S[0], Ry = E[1] - S[1];
  p.poly([S, E, up(E, Hh), up(M2, Hh + R), up(S, Hh)], (x, y) => {
    const u = (x - S[0]) / Rx; const h = S[1] + u * Ry - y;
    const L = u * b;
    let c: Color = plaster;
    if (h < 6) c = ((Math.floor(L * 4) + Math.floor(h / 3)) % 2) ? stone : lighten(stone, 0.1);
    else if (Math.abs(h - Hh) < 1.5) c = beam;
    else if (h > Hh) c = (Math.abs(u - 0.5) < 0.03 || Math.abs((h - Hh) - (1 - Math.abs(u - 0.5) * 2) * R * 0.5) < 1) ? beam : plaster;
    else if (Math.abs(u - 0.5) < 0.12 && h > 13 && h < 25) {
      if (Math.abs(u - 0.5) > 0.1 || h < 14.5 || h > 23.5 || Math.abs(u - 0.5) < 0.012) c = beam; else c = 0xf0b050;
    } else if (u < 0.03 || u > 0.97 || Math.abs(h - 19) < 0.8) c = beam;
    return shadeDark(c, 0.28);
  });
  // front roof plane with overhang and shingle rows
  const o = 4;
  const fW = add(up(W, Hh), [-o, o / 2 + 2]), fS = add(up(S, Hh), [o, o / 2 + 2]);
  const r1 = add(up(M1, Hh + R), [-o, -o / 2]), r2 = add(up(M2, Hh + R), [o, -o / 2]);
  const ex = fS[0] - fW[0], ey = fS[1] - fW[1];
  const rx = r1[0] - fW[0], ry = r1[1] - fW[1];
  const det = ex * ry - ey * rx;
  p.poly([fW, fS, r2, r1], (x, y) => {
    const dx = x - fW[0], dy = y - fW[1];
    const s = (dx * ry - dy * rx) / det; // along eave
    const t = (ex * dy - ey * dx) / det; // eave -> ridge
    const row = Math.floor(t * 9);
    let c: Color = row % 2 ? roof : shadeDark(roof, 0.08);
    const shingle = Math.floor(s * (a * 3) + (row % 2) * 0.5);
    if (((s * (a * 3) + (row % 2) * 0.5) % 1) < 0.08) c = shadeDark(c, 0.3);
    if ((t * 9) % 1 > 0.82) c = shadeDark(c, 0.35);
    if (hash2(shingle, row, v) > 0.88) c = shadeLight(c, 0.12);
    if (t > 0.93) c = shadeLight(roof, 0.35); // ridge cap highlight
    if (s > 0.97) c = shadeDark(c, 0.2);
    return c;
  });
  // chimney sitting on the front roof plane near the ridge
  {
    const Cb: P2 = [fW[0] + ex * 0.78 + rx * 0.62, fW[1] + ey * 0.78 + ry * 0.62];
    const ch = 13;
    p.poly([Cb, add(Cb, [6, 3]), add(up(Cb, ch), [6, 3]), up(Cb, ch)], stone);
    p.poly([add(Cb, [6, 3]), add(Cb, [12, 0]), add(up(Cb, ch), [12, 0]), add(up(Cb, ch), [6, 3])], shadeDark(stone, 0.3));
    p.poly([up(Cb, ch), add(up(Cb, ch), [6, 3]), add(up(Cb, ch), [12, 0]), add(up(Cb, ch), [6, -3])], darken(stone, 0.6));
    for (let k = 0; k < ch; k += 3) p.line(Cb[0], Cb[1] - k, Cb[0] + 5, Cb[1] - k + 2.5, darken(stone, 0.2));
  }
  // eave shadow line under roof on left wall
  p.line(W[0] + 1, W[1] - Hh + 3, S[0] - 1, S[1] - Hh + 3, 0x3a2a1a);
  // lantern by the door
  const lp = [W[0] + Lx * 0.62, W[1] + Ly * 0.62 - 22] as P2;
  p.rect(lp[0], lp[1], 3, 4, 0xffd060); p.set(lp[0] + 1, lp[1] + 1, 0xffffff);
  p.outline(OUT);
  return { p, ax: N[0], ay: N[1] };
}

/** Wooden fence segment along iso X (v=0, "\" direction) or Y (v=1, "/"). */
export function isoFence(v: number): PixelCanvas {
  const p = new PixelCanvas(34, 28);
  const w = 0x8a5e34;
  const a: P2 = [1, 8], b: P2 = [33, 24];
  for (const h of [9, 4]) { p.thickLine(a[0], a[1] + 4 - h + 8, b[0], b[1] + 4 - h - 8, h === 9 ? lighten(w, 0.12) : w, 2); }
  for (const t of [0.05, 0.5, 0.95]) {
    const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t - 6;
    p.rect(x - 1, y - 6, 3, 13, darken(w, 0.1)); p.set(x - 1, y - 7, lighten(w, 0.3)); p.set(x, y - 7, lighten(w, 0.2));
  }
  p.outline(OUT);
  if (v === 1) { const q = new PixelCanvas(34, 28); q.stamp(p, 0, 0, true); return q; }
  return p;
}

/** Iso box helper (top + two faces). */
function isoBox(p: PixelCanvas, cx: number, by: number, a: number, b: number, h: number, top: Color, left: Color, right: Color) {
  const S: P2 = [cx, by];
  const W: P2 = [S[0] - b * 16, S[1] - b * 8];
  const E: P2 = [S[0] + a * 16, S[1] - a * 8];
  const N: P2 = [E[0] - b * 16, E[1] - b * 8];
  p.poly([W, S, up(S, h), up(W, h)], left);
  p.poly([S, E, up(E, h), up(S, h)], right);
  p.poly([up(N, h), up(E, h), up(S, h), up(W, h)], top);
}

export function isoCrate(): PixelCanvas {
  const p = new PixelCanvas(24, 26);
  const w = 0xa8784a;
  isoBox(p, 12, 24, 0.7, 0.7, 12, lighten(w, 0.15), w, shadeDark(w, 0.3));
  p.line(1, 12, 12, 18, 0x5a3a22); p.line(12, 18, 23, 12, darken(w, 0.5));
  p.line(1, 16, 12, 22, 0x6a4428); p.line(12, 22, 23, 16, darken(w, 0.5));
  p.outline(OUT);
  return p;
}

export function isoAltar(): PixelCanvas {
  const p = new PixelCanvas(48, 44);
  const c = 0x9c98b0;
  isoBox(p, 24, 42, 1, 1, 12, lighten(c, 0.12), c, shadeDark(c, 0.3));
  for (let i = 0; i < 3; i++) p.rect(10 + i * 5, 32 - i * 2, 2, 5, 0x6a3aa8);
  // floating crystal
  for (let y = 0; y < 16; y++) { const w = y < 8 ? y / 2.2 : (16 - y) / 2.2; for (let x = -w; x <= w; x++) p.set(24 + x, 6 + y, x < 0 ? 0xd8b0ff : 0x8a5ae0); }
  p.set(23, 10, 0xffffff);
  p.outline(OUT);
  return p;
}

export function isoStall(): PixelCanvas {
  const p = new PixelCanvas(64, 60);
  const wood = 0x8a5a32;
  const S: P2 = [30, 56];
  const A = 1.6, B = 0.8;
  const W: P2 = [S[0] - B * 16, S[1] - B * 8], E: P2 = [S[0] + A * 16, S[1] - A * 8], N: P2 = [E[0] - B * 16, E[1] - B * 8];
  // back posts
  p.rect(N[0] - 1, N[1] - 34, 2, 34, darken(wood, 0.35));
  isoBox(p, S[0], S[1], A, B, 12, lighten(wood, 0.15), wood, shadeDark(wood, 0.3));
  for (let i = 0; i < 5; i++) p.shadedEllipse(W[0] + 5 + i * 6.5, W[1] - 13 - i * 2.2 + 3, 2.5, 2.2, [0xe04848, 0xffd84a, 0x7ee05a, 0xff8a3a, 0x9a5aff][i]);
  for (const q of [W, S, E]) p.rect(q[0] - 1, q[1] - 34, 2, 34 - 12, darken(wood, 0.2));
  // striped awning: raised, slightly enlarged top face
  const h = 34, g = 3;
  const aw: P2[] = [up(add(W, [-g, 0]), h), up(add(S, [0, g]), h), up(add(E, [g, 0]), h), up(add(N, [0, -g]), h)];
  const ux = aw[2][0] - aw[1][0], uy = aw[2][1] - aw[1][1];
  p.poly(aw, (x, y) => {
    const t = ((x - aw[1][0]) * ux + (y - aw[1][1]) * uy) / (ux * ux + uy * uy);
    return Math.floor(t * 8 + 8) % 2 ? 0xf0e6d0 : 0x2f7a52;
  });
  // scalloped front edge
  for (let t = 0; t <= 1; t += 0.125) { const x = aw[0][0] + (aw[1][0] - aw[0][0]) * t, y = aw[0][1] + (aw[1][1] - aw[0][1]) * t; p.ellipse(x, y + 1, 2, 1.5, Math.round(t * 8) % 2 ? 0x2f7a52 : 0xf0e6d0); }
  p.outline(OUT);
  return p;
}

/** One tile-long iso wall segment. v: 0 stone along X, 1 stone along Y, 2 palisade along X, 3 palisade along Y. `seed` varies the crumbling. */
export function isoWall(v: number, seed = 0): PixelCanvas {
  const wood = v >= 2;
  const h = wood ? 26 : 24;
  const p = new PixelCanvas(38, h + 22);
  const A: P2 = [3, h + 8], B: P2 = [35, h + 24 - 8];
  // A->B goes down-right along iso X; compute face
  const L = B[0] - A[0], Ly = B[1] - A[1];
  const topH = (u: number) => wood ? h - (Math.abs(((u * 5) % 1) - 0.5) < 0.18 ? 0 : 4) : h - (hash2(Math.floor(u * 6), seed, 13) > 0.7 ? 3 + Math.floor(hash2(Math.floor(u * 6), seed, 5) * 8) : 0);
  for (let x = A[0]; x <= B[0]; x++) {
    const u = (x - A[0]) / L;
    const base = A[1] + u * Ly;
    const th = topH(u);
    for (let hh = 0; hh < th; hh++) {
      const y = base - hh;
      let c: Color;
      if (wood) {
        const stake = Math.floor(u * 5);
        const fu = (u * 5) % 1;
        c = stake % 2 ? 0x7a5230 : 0x6a4426;
        if (fu < 0.12) c = 0x3a2412; else if (fu < 0.25) c = lighten(c, 0.15);
        if (hh === 9 || hh === 18) c = 0x4a3020; // binding ropes
      } else {
        const row = Math.floor(hh / 5);
        const bu = u * 4 + (row % 2) * 0.5;
        c = hash2(Math.floor(bu), row, seed) > 0.5 ? 0x8a8496 : 0x7a7488;
        if (hh % 5 === 0 || (bu % 1) < 0.07) c = 0x4a4658;
        else if (hh % 5 === 4) c = lighten(c, 0.12);
        if (hh < 4 && valueNoise(x * 0.3, hh, seed) > 0.5) c = mix(c, 0x3f7a34, 0.6); // moss at base
      }
      p.set(x, y, c);
    }
    // top cap (receding towards -Y)
    if (!wood) for (let k = 1; k <= 3; k++) p.set(x + k, base - th - k * 0.5, k === 1 ? 0xb0aac0 : 0x9a94aa);
    else { p.set(x, base - th, 0xa07a4a); }
  }
  // vines on stone
  if (!wood) for (let i = 0; i < 2; i++) {
    const u = hash2(i, seed, 21); const x = A[0] + u * L; const base = A[1] + u * Ly;
    for (let k = 0; k < 10; k++) p.set(x + Math.round(Math.sin(k) * 1), base - topH(u) + k + 2, k % 3 ? 0x3a8a3a : 0x5aaa4a);
  }
  p.outline(OUT);
  if (v % 2 === 1) { const q = new PixelCanvas(p.w, p.h); q.stamp(p, 0, 0, true); return q; }
  return p;
}

/** Treasure chest (closed / open). */
export function isoChest(open: boolean): PixelCanvas {
  const p = new PixelCanvas(26, 26);
  const w = 0x8a4a22, gold = 0xf2c040;
  isoBox(p, 13, 24, 0.55, 0.45, 9, lighten(w, 0.15), w, shadeDark(w, 0.3));
  if (!open) {
    // domed lid
    p.poly([[13 - 7.2, 24 - 3.6 - 9], [13, 24 - 9], [13 + 8.8, 24 - 4.4 - 9], [13 + 8.8, 24 - 4.4 - 13], [13, 24 - 13], [13 - 7.2, 24 - 3.6 - 13]], 0xa05a2a);
    p.poly([[13 - 7.2, 24 - 3.6 - 13], [13, 24 - 13], [13 + 8.8, 24 - 4.4 - 13], [13 + 1.6, 24 - 8 - 13]], lighten(0xa05a2a, 0.2));
    p.line(13, 24 - 13, 13, 24, gold); p.line(13 - 7, 24 - 3.5 - 10, 13, 24 - 10, gold);
    p.rect(12, 24 - 9, 3, 3, gold); p.set(13, 24 - 8, 0x3a2010);
  } else {
    p.poly([[13 - 7.2, 24 - 3.6 - 9], [13 + 1.6, 24 - 8 - 9], [13 + 1.6, 24 - 8 - 19], [13 - 7.2, 24 - 3.6 - 19]], 0x7a3a1a);
    p.poly([[13 - 5, 24 - 3.5 - 9], [13, 24 - 9], [13 + 7, 24 - 4.4 - 9], [13 + 1.6, 24 - 7 - 9]], 0x1a0e08);
    p.set(12, 24 - 11, gold); p.set(14, 24 - 10, gold);
  }
  p.line(13 - 7, 24 - 3.5 - 4, 13, 24 - 4, gold); p.line(13, 24 - 4, 13 + 8.8, 24 - 4.4 - 4, darken(gold, 0.3));
  p.outline(OUT);
  return p;
}
