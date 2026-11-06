// Multiple world maps. 'main' = Eldergrove (village, meadow, forest, boss) from mapgen.ts.
// 'gather' = ป่าพรานไพร: a resource map — woods, quarry and wild animals, no monsters.
import { mulberry32, fbm } from '../core/rng';
import { G, MAP_W, MAP_H, iso, generateWorld, surfaceAt, type WorldMap, type WorldObj, type ObjType, type SpawnArea, type Zone } from './mapgen';

export type MapId = 'main' | 'gather';

export interface Portal { tx: number; ty: number; x: number; y: number; to: MapId; label: string }

export interface GameMap extends WorldMap {
  id: MapId;
  name: string;
  portals: Portal[];
  hasBoss: boolean;
  surface: (tx: number, ty: number, g: number) => number;
}

export const MAP_NAMES: Record<MapId, string> = { main: 'เอลเดอร์โกรฟ', gather: 'ป่าพรานไพร' };

const cache: Partial<Record<MapId, GameMap>> = {};

/** Fresh copy each call (blocked grid is mutated by chopping). */
export function generateMap(id: MapId): GameMap {
  void cache;
  if (id === 'gather') return generateGather();
  const w = generateWorld();
  const p = iso(4.5, 39.5);
  // portal at the west end of the village road (clear the spot)
  w.objects = w.objects.filter(o => Math.abs(o.tx - 4) > 1 || Math.abs(o.ty - 39) > 1);
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 2; i++) w.blocked[(39 + j) * MAP_W + 4 + i] = 0;
  w.objects.push({ type: 'portal', x: p.x, y: p.y, v: 0, tx: 4, ty: 39 });
  return { ...w, id: 'main', name: MAP_NAMES.main, hasBoss: true, surface: surfaceAt, portals: [{ tx: 4, ty: 39, x: p.x, y: p.y, to: 'gather', label: 'ไปป่าพรานไพร (หาทรัพยากร)' }] };
}

function distSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l)) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}
function polyDist(x: number, y: number, pts: [number, number][]) {
  let d = 1e9;
  for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, distSeg(x, y, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]));
  return d;
}

// ---- ป่าพรานไพร layout (playable box ~ x 4..78, y 8..68) ----
const GX0 = 4, GX1 = 78, GY0 = 8, GY1 = 68;
const GPATHS: [number, number][][] = [
  [[6, 38], [16, 38], [28, 37], [40, 39], [52, 38], [62, 36]],   // camp -> bridge -> meadow
  [[24, 37], [24, 26], [20, 16]],                                // north into the woods
  [[52, 38], [56, 48], [62, 58]],                                // south-east to the quarry
  [[62, 36], [64, 24], [66, 15]],                                // north-east rocky hill
];
const griverX = (y: number) => 40 + Math.sin(y * 0.11) * 3 + Math.sin(y * 0.29) * 1.1;
const gpath = (x: number, y: number) => Math.min(...GPATHS.map(p => polyDist(x, y, p)));
const QUARRY = { cx: 63, cy: 59, rx: 11, ry: 7 };
const HILL = { cx: 66, cy: 15, rx: 9, ry: 6 };
const inEll = (x: number, y: number, e: { cx: number; cy: number; rx: number; ry: number }) => Math.hypot((x - e.cx) / e.rx, (y - e.cy) / e.ry);

const GZONES: Zone[] = [
  { id: 'gcamp', name: 'ค่ายพราน', cx: 10, cy: 38, r: 7 },
  { id: 'gwoods', name: 'ป่าไม้ใหญ่', cx: 22, cy: 20, r: 14 },
  { id: 'gmeadow', name: 'ทุ่งกวาง', cx: 56, cy: 38, r: 12 },
  { id: 'gquarry', name: 'เหมืองหินร้าง', cx: 63, cy: 59, r: 10 },
  { id: 'ghill', name: 'เนินหินผา', cx: 66, cy: 15, r: 9 },
  { id: 'gsouth', name: 'ป่าโอ๊กใต้', cx: 22, cy: 56, r: 12 },
];

function gsurface(tx: number, ty: number, g: number) {
  if (g === G.Water || g === G.Sand || g === G.Bridge || g === G.Ruins) return g;
  const n = fbm(tx * 0.08, ty * 0.08, 5);
  if (gpath(tx, ty) + (n - 0.5) * 0.9 < 1.2) return G.Path;
  if (Math.hypot(tx - 10.5, ty - 38.5) < 3.2 + (n - 0.5)) return G.Path; // trampled camp
  return g === G.Forest ? G.Forest : G.Grass;
}

export function generateGather(seed = 4242): GameMap {
  const rnd = mulberry32(seed);
  const ground = new Uint8Array(MAP_W * MAP_H);
  const blocked = new Uint8Array(MAP_W * MAP_H);
  const objects: WorldObj[] = [];
  const idx = (x: number, y: number) => y * MAP_W + x;
  const inside = (x: number, y: number) => x >= GX0 && x <= GX1 && y >= GY0 && y <= GY1;

  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    const n = fbm(x * 0.08, y * 0.08, 5);
    let g = G.Grass;
    if (!inside(x, y)) g = G.Forest;
    if ((x < 34 && y < 30) || (x < 34 && y > 47)) g = G.Forest;
    const rd = Math.abs(x + 0.5 - griverX(y));
    if (inside(x, y) || rd < 4) { if (rd < 2) g = G.Water; else if (rd < 2.9) g = G.Sand; }
    const pd = Math.hypot((x - 50) / 4.5, (y - 46) / 3) + (n - 0.5) * 0.4; // deer pond
    if (pd < 1) g = G.Water; else if (pd < 1.2) g = G.Sand;
    if (inEll(x, y, QUARRY) < 1 + (n - 0.5) * 0.25 || inEll(x, y, HILL) < 1 + (n - 0.5) * 0.25) g = G.Ruins;
    if (gpath(x + 0.5, y + 0.5) + (n - 0.5) * 0.9 < 1.3 && inside(x, y)) g = g === G.Water || g === G.Sand ? G.Bridge : g === G.Ruins ? G.Ruins : G.Path;
    ground[idx(x, y)] = g;
    if (g === G.Water || !inside(x, y)) blocked[idx(x, y)] = 1;
  }

  const free = (x: number, y: number, r = 0) => {
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
      const X = x + i, Y = y + j;
      if (X < 0 || Y < 0 || X >= MAP_W || Y >= MAP_H) return false;
      const g = ground[idx(X, Y)];
      if (blocked[idx(X, Y)] || g === G.Water || g === G.Path || g === G.Bridge) return false;
    }
    return true;
  };
  const put = (type: ObjType, tx: number, ty: number, v = 0, solid?: { w: number; h: number }, deco = false) => {
    let cx = tx + 0.5, cy = ty + 0.5;
    if (solid) { cx = tx - Math.floor((solid.w - 1) / 2) + solid.w / 2; cy = ty - solid.h + 1 + solid.h / 2; }
    const p = iso(cx, cy);
    objects.push({ type, x: p.x, y: p.y, v, tx, ty, solid, deco });
    if (solid) for (let j = 0; j < solid.h; j++) for (let i = 0; i < solid.w; i++) {
      const X = tx - Math.floor((solid.w - 1) / 2) + i, Y = ty - solid.h + 1 + j;
      if (X >= 0 && Y >= 0 && X < MAP_W && Y < MAP_H) blocked[idx(X, Y)] = 1;
    }
  };

  // camp
  put('campfire', 11, 40, 0, { w: 1, h: 1 });
  put('tent', 8, 35, 0, { w: 3, h: 2 });
  put('tent', 14, 44, 0, { w: 3, h: 2 });
  put('sign', 15, 36, 0, { w: 1, h: 1 });
  for (const [x, y] of [[13, 41], [8, 41], [16, 40]] as const) put(rnd() < 0.5 ? 'barrel' : 'crate', x, y, 0, { w: 1, h: 1 });
  put('haystack', 7, 44, 0, { w: 1, h: 1 });
  put('lamp', 17, 37, 0, { w: 1, h: 1 }); put('lamp', 9, 37, 0, { w: 1, h: 1 });
  const pp = iso(5.5, 38.5);
  objects.push({ type: 'portal', x: pp.x, y: pp.y, v: 0, tx: 5, ty: 38 });

  // vegetation: dense woods (choppable), quarry rocks (mineable)
  for (let y = 1; y < MAP_H - 1; y++) for (let x = 1; x < MAP_W - 1; x++) {
    const g = ground[idx(x, y)];
    const isIn = inside(x, y);
    const camp = Math.hypot(x - 11, y - 39) < 8;
    const r = rnd();
    if (!isIn) {
      // decorative forest wall (not choppable) just outside the playable box
      const edge = Math.min(Math.abs(x - GX0), Math.abs(x - GX1), Math.abs(y - GY0), Math.abs(y - GY1));
      if (edge <= 6 && r < 0.5 && ground[idx(x, y)] !== G.Water) put(rnd() < 0.5 ? 'pine' : 'tree', x, y, 1, undefined, true);
      continue;
    }
    if (camp || gpath(x, y) < 2.2) { if (!camp && free(x, y) && r < 0.06) put('tuft', x, y, 0); continue; }
    if (g === G.Ruins) {
      if (r < 0.07 && free(x, y, 1)) put('bigrock', x, y, 0, { w: 2, h: 1 });
      else if (r < 0.2 && free(x, y)) put('rock', x, y, Math.floor(rnd() * 2), { w: 1, h: 1 });
      else if (r < 0.24 && free(x, y)) put('tuft', x, y, 1);
      continue;
    }
    let p = g === G.Forest ? 0.2 : 0.025;
    if (inEll(x, y, { cx: 56, cy: 38, rx: 12, ry: 10 }) < 1) p = 0.012;
    if (Math.abs(x - griverX(y)) < 4) p *= 0.4;
    if (r < p && free(x, y, 1)) {
      const v = g === G.Forest ? (rnd() < 0.12 ? 4 : 1) : rnd() < 0.18 ? 3 : 0;
      put(g === G.Forest && rnd() < 0.4 ? 'pine' : 'tree', x, y, v, { w: 1, h: 1 });
      continue;
    }
    if (!free(x, y)) continue;
    const r2 = rnd();
    if (r2 < 0.012) put('rock', x, y, Math.floor(rnd() * 2), { w: 1, h: 1 });
    else if (r2 < 0.05) put('bush', x, y, Math.floor(rnd() * 2));
    else if (r2 < 0.06 && g === G.Forest) put('log', x, y, 0, { w: 2, h: 1 });
    else if (r2 < 0.085 && g === G.Forest) put('mushrooms', x, y, 0);
    else if (r2 < 0.15 && g === G.Grass) put('flower', x, y, Math.floor(rnd() * 4));
    else if (r2 < 0.24) put('tuft', x, y, g);
  }
  for (let i = 0; i < 24; i++) {
    const x = Math.floor(rnd() * MAP_W), y = Math.floor(rnd() * MAP_H);
    if (ground[idx(x, y)] === G.Water && inside(x, y) && Math.abs(x - griverX(y)) > 1.3) put('lily', x, y, i % 2);
  }
  for (let x = 0; x < MAP_W; x++) { blocked[idx(x, 0)] = 1; blocked[idx(x, MAP_H - 1)] = 1; }
  for (let y = 0; y < MAP_H; y++) { blocked[idx(0, y)] = 1; blocked[idx(MAP_W - 1, y)] = 1; }

  const spawns: SpawnArea[] = [
    { kind: 'deer', x: 54, y: 33, r: 6, count: 4 },
    { kind: 'deer', x: 60, y: 43, r: 6, count: 4 },
    { kind: 'deer', x: 28, y: 46, r: 4, count: 3 },
    { kind: 'boar', x: 22, y: 56, r: 6, count: 4 },
    { kind: 'boar', x: 26, y: 20, r: 6, count: 3 },
    { kind: 'boar', x: 68, y: 30, r: 4, count: 2 },
  ];
  const start = iso(9.5, 38.5);
  return {
    id: 'gather', name: MAP_NAMES.gather, ground, blocked, objects, spawns, npcs: [],
    heroStart: start, bossPos: start, zones: GZONES, hasBoss: false, surface: gsurface,
    portals: [{ tx: 5, ty: 38, x: pp.x, y: pp.y, to: 'main', label: 'กลับหมู่บ้าน' }],
  };
}
