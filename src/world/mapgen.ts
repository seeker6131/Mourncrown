// World / Maps — deterministic layout of the Eldergrove region.
import { mulberry32, fbm } from '../core/rng';
import type { MonsterKind } from '../data/monsters';

export const TILE = 16;
export const MAP_W = 110;
export const MAP_H = 76;

export enum G { Grass = 0, Path = 1, Water = 2, Sand = 3, Forest = 4, Grove = 5, Plaza = 6, Ruins = 7, Bridge = 8 }

export type ObjType = 'tree' | 'pine' | 'bush' | 'rock' | 'bigrock' | 'flower' | 'tuft' | 'mushrooms' | 'house' | 'well' | 'fence' | 'sign' | 'campfire'
  | 'lamp' | 'pillar' | 'brokenpillar' | 'altar' | 'stall' | 'barrel' | 'crate' | 'tent' | 'crystal' | 'lily' | 'log';

export interface WorldObj { type: ObjType; x: number; y: number; v: number; solid?: { w: number; h: number } }

export interface Zone { id: string; name: string; cx: number; cy: number; r: number }

export interface SpawnArea { kind: MonsterKind; x: number; y: number; r: number; count: number }

export interface NpcSpawn { id: 'elder' | 'merchant' | 'smith'; x: number; y: number }

export interface WorldMap {
  ground: Uint8Array;
  blocked: Uint8Array;
  objects: WorldObj[];
  spawns: SpawnArea[];
  npcs: NpcSpawn[];
  heroStart: { x: number; y: number };
  bossPos: { x: number; y: number };
  zones: Zone[];
}

export const ZONES: Zone[] = [
  { id: 'village', name: 'หมู่บ้านเอลเดอร์เกลน', cx: 15, cy: 38, r: 12 },
  { id: 'meadow', name: 'ทุ่งหญ้าแสงตะวัน', cx: 37, cy: 40, r: 14 },
  { id: 'forest', name: 'ป่าเงาจันทร์', cx: 70, cy: 44, r: 16 },
  { id: 'grove', name: 'สวนมนตราเหนือ', cx: 78, cy: 12, r: 16 },
  { id: 'arena', name: 'ซากวิหารธอร์นวูด', cx: 98, cy: 40, r: 10 },
];

const PATH: [number, number][] = [[6, 39], [15, 39], [28, 40], [40, 37], [52, 38], [60, 42], [68, 42], [80, 38], [90, 40], [98, 40]];
const PATH2: [number, number][] = [[66, 42], [68, 32], [72, 22], [76, 14], [86, 10]];

function distToPolyline(x: number, y: number, pts: [number, number][]): number {
  let best = 1e9;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
    best = Math.min(best, Math.hypot(x - (ax + dx * t), y - (ay + dy * t)));
  }
  return best;
}

export function riverX(y: number) { return 50 + Math.sin(y * 0.12) * 3 + Math.sin(y * 0.31) * 1.2; }

export function pathDist(x: number, y: number) {
  return Math.min(distToPolyline(x, y, PATH), distToPolyline(x, y, PATH2));
}

export function generateWorld(seed = 1337): WorldMap {
  const rnd = mulberry32(seed);
  const ground = new Uint8Array(MAP_W * MAP_H);
  const blocked = new Uint8Array(MAP_W * MAP_H);
  const objects: WorldObj[] = [];
  const idx = (x: number, y: number) => y * MAP_W + x;
  const zoneDist = (z: string, x: number, y: number) => { const Z = ZONES.find(q => q.id === z)!; return Math.hypot(x - Z.cx, y - Z.cy) / Z.r; };

  // ---- ground ----
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    let g = G.Grass;
    const n = fbm(x * 0.08, y * 0.08, 7);
    if (x > 56 && y > 24) g = G.Forest;
    if (x > 55 && x < 104 && y < 24 + n * 4) g = G.Grove;
    if (x > 52 && x < 60 && y > 24 && n > 0.5) g = G.Forest;
    // river
    const rx = riverX(y);
    const rd = Math.abs(x + 0.5 - rx);
    if (rd < 2.2) g = G.Water; else if (rd < 3.1) g = G.Sand;
    // ponds
    const pd = Math.hypot((x - 30) / 7, (y - 64) / 4.5) + (n - 0.5) * 0.4;
    if (pd < 1) g = G.Water; else if (pd < 1.18) g = G.Sand;
    const gp = Math.hypot((x - 92) / 5, (y - 12) / 3.5) + (n - 0.5) * 0.4;
    if (gp < 1) g = G.Water; else if (gp < 1.2) g = G.Sand;
    // village plaza
    if (zoneDist('village', x, y) < 0.42 + (n - 0.5) * 0.15) g = G.Plaza;
    // ruins
    const ad = zoneDist('arena', x, y);
    if (ad < 0.85 + (n - 0.5) * 0.2) g = G.Ruins;
    // path
    const pdist = pathDist(x + 0.5, y + 0.5) + (n - 0.5) * 0.9;
    if (pdist < 1.3 && g !== G.Ruins && g !== G.Plaza) {
      g = g === G.Water ? G.Bridge : (g === G.Sand && rd < 3.1 ? G.Bridge : G.Path);
    }
    ground[idx(x, y)] = g;
    if (g === G.Water) blocked[idx(x, y)] = 1;
  }

  const free = (x: number, y: number, r = 0) => {
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
      const tx = x + i, ty = y + j;
      if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return false;
      const g = ground[idx(tx, ty)];
      if (blocked[idx(tx, ty)] || g === G.Water || g === G.Path || g === G.Bridge || g === G.Plaza || g === G.Ruins) return false;
    }
    return true;
  };
  const block = (tx: number, ty: number, w = 1, h = 1) => {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const X = tx + i, Y = ty + j;
      if (X >= 0 && Y >= 0 && X < MAP_W && Y < MAP_H) blocked[idx(X, Y)] = 1;
    }
  };
  const put = (type: ObjType, tx: number, ty: number, v = 0, solid?: { w: number; h: number }) => {
    objects.push({ type, x: tx * TILE + TILE / 2, y: ty * TILE + TILE, v, solid });
    if (solid) block(tx - Math.floor((solid.w - 1) / 2), ty - solid.h + 1, solid.w, solid.h);
  };

  // ---- village structures ----
  const houses: [number, number, number][] = [[8, 32, 0], [21, 31, 1], [7, 46, 1], [22, 47, 0]];
  for (const [x, y, v] of houses) put('house', x, y, v, { w: 5, h: 3 });
  put('well', 15, 45, 0, { w: 1, h: 1 });
  put('campfire', 12, 42, 0, { w: 1, h: 1 });
  put('stall', 20, 40, 0, { w: 3, h: 1 });
  put('sign', 25, 38, 0, { w: 1, h: 1 });
  put('lamp', 11, 36, 0, { w: 1, h: 1 }); put('lamp', 19, 36, 0, { w: 1, h: 1 }); put('lamp', 11, 44, 0, { w: 1, h: 1 }); put('lamp', 19, 44, 0, { w: 1, h: 1 });
  for (const [x, y] of [[17, 41], [25, 43], [6, 37], [23, 36]] as const) put(rnd() < 0.5 ? 'barrel' : 'crate', x, y, 0, { w: 1, h: 1 });
  // fence ring around village (with gaps for path)
  for (let a = 0; a < Math.PI * 2; a += 0.09) {
    const fx = Math.round(15 + Math.cos(a) * 13), fy = Math.round(39 + Math.sin(a) * 11);
    if (pathDist(fx + 0.5, fy + 0.5) < 2.5) continue;
    if (!free(fx, fy)) continue;
    if (objects.some(o => o.type === 'fence' && Math.abs(o.x - (fx * TILE + 8)) < 8 && Math.abs(o.y - (fy * TILE + 16)) < 8)) continue;
    put('fence', fx, fy, 0, { w: 1, h: 1 });
  }

  // ---- arena ----
  const B = ZONES.find(z => z.id === 'arena')!;
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.3;
    const px = Math.round(B.cx + Math.cos(a) * 8), py = Math.round(B.cy + Math.sin(a) * 6.5);
    if (pathDist(px, py) < 2) continue;
    put(i % 3 === 1 ? 'brokenpillar' : 'pillar', px, py, i, { w: 1, h: 1 });
  }
  put('altar', B.cx + 4, B.cy - 3, 0, { w: 2, h: 1 });

  // goblin camp
  for (const [x, y] of [[80, 52], [86, 48], [82, 27]] as const) put('tent', x, y, 0, { w: 3, h: 2 });
  put('campfire', 83, 51, 1, { w: 1, h: 1 });

  // grove crystals
  for (const [x, y] of [[64, 9], [72, 6], [84, 17], [97, 7], [60, 18]] as const) put('crystal', x, y, 0, { w: 1, h: 1 });

  // ---- vegetation ----
  for (let y = 1; y < MAP_H - 1; y++) for (let x = 1; x < MAP_W - 1; x++) {
    const g = ground[idx(x, y)];
    const border = Math.min(x, y, MAP_W - 1 - x, MAP_H - 1 - y);
    const vd = zoneDist('village', x, y);
    let p = 0.02;
    if (g === G.Forest) p = 0.16;
    else if (g === G.Grove) p = 0.07;
    if (border < 3) p = 0.7;
    if (vd < 1.15) p = 0;
    if (zoneDist('arena', x, y) < 1.1) p = 0;
    if (pathDist(x, y) < 2.6) p = 0;
    if (Math.abs(x - riverX(y)) < 4) p *= 0.3;
    const r = rnd();
    if (r < p && free(x, y, 1)) {
      const type: ObjType = g === G.Forest && rnd() < 0.45 ? 'pine' : 'tree';
      let v = g === G.Grove ? 2 : g === G.Forest ? 1 : 0;
      if (g === G.Grass && rnd() < 0.15) v = 3; // blossom tree
      if (g === G.Forest && rnd() < 0.08) v = 4; // autumn
      put(type, x, y, v, { w: 1, h: 1 });
      continue;
    }
    if (!free(x, y)) continue;
    const r2 = rnd();
    if (vd < 0.95 && g !== G.Plaza) { if (r2 < 0.08) put('flower', x, y, Math.floor(rnd() * 4)); continue; }
    if (r2 < 0.012) put('rock', x, y, Math.floor(rnd() * 2), { w: 1, h: 1 });
    else if (r2 < 0.018 && g !== G.Grass) put('bigrock', x, y, 0, { w: 2, h: 1 });
    else if (r2 < 0.04) put('bush', x, y, Math.floor(rnd() * 2), { w: 1, h: 1 });
    else if (r2 < 0.05 && g === G.Forest) put('log', x, y, 0, { w: 2, h: 1 });
    else if (r2 < 0.075 && g !== G.Grass) put('mushrooms', x, y, g === G.Grove ? 1 : 0);
    else if (r2 < 0.13 && g === G.Grass) put('flower', x, y, Math.floor(rnd() * 4));
    else if (r2 < 0.22) put('tuft', x, y, g);
  }
  // lily pads
  for (let i = 0; i < 40; i++) {
    const x = Math.floor(rnd() * MAP_W), y = Math.floor(rnd() * MAP_H);
    if (ground[idx(x, y)] === G.Water && Math.abs(x - riverX(y)) > 1.4) put('lily', x, y, i % 2);
  }

  // hard border
  for (let x = 0; x < MAP_W; x++) { blocked[idx(x, 0)] = 1; blocked[idx(x, MAP_H - 1)] = 1; }
  for (let y = 0; y < MAP_H; y++) { blocked[idx(0, y)] = 1; blocked[idx(MAP_W - 1, y)] = 1; }

  const spawns: SpawnArea[] = [
    { kind: 'slime', x: 33, y: 33, r: 5, count: 5 },
    { kind: 'slime', x: 36, y: 46, r: 5, count: 5 },
    { kind: 'shroom', x: 44, y: 29, r: 4, count: 4 },
    { kind: 'shroom', x: 43, y: 51, r: 4, count: 4 },
    { kind: 'wolf', x: 63, y: 50, r: 5, count: 4 },
    { kind: 'wolf', x: 70, y: 34, r: 5, count: 4 },
    { kind: 'goblin', x: 81, y: 49, r: 5, count: 4 },
    { kind: 'goblin', x: 83, y: 30, r: 4, count: 3 },
    { kind: 'wisp', x: 67, y: 11, r: 6, count: 4 },
    { kind: 'wisp', x: 88, y: 14, r: 6, count: 4 },
  ];

  return {
    ground, blocked, objects, spawns,
    npcs: [{ id: 'elder', x: 15, y: 34 }, { id: 'merchant', x: 24, y: 40 }, { id: 'smith', x: 9, y: 39 }],
    heroStart: { x: 15 * TILE, y: 39 * TILE },
    bossPos: { x: B.cx * TILE, y: B.cy * TILE },
    zones: ZONES,
  };
}

export function zoneAt(px: number, py: number): Zone {
  const tx = px / TILE, ty = py / TILE;
  let best = ZONES[0], bd = 1e9;
  for (const z of ZONES) { const d = Math.hypot(tx - z.cx, ty - z.cy) / z.r; if (d < bd) { bd = d; best = z; } }
  return best;
}
