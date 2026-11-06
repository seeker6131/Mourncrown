// Multiple world maps. 'main' = Eldergrove (village, meadow, forest, boss) from mapgen.ts.
// 'gather' = ป่าพรานไพร: a resource map — woods, quarry and wild animals, no monsters.
import { mulberry32, fbm } from '../core/rng';
import { G, MAP_W, MAP_H, iso, generateWorld, surfaceAt, type WorldMap, type WorldObj, type ObjType, type SpawnArea, type Zone } from './mapgen';
import type { MonsterKind } from '../data/monsters';
import type { Theme } from '../art/isoArt';

export type MapId = 'main' | 'gather' | 'haunt' | 'lava' | 'snow' | 'dung';

export interface Portal { tx: number; ty: number; x: number; y: number; to: MapId; label: string }

export interface GameMap extends WorldMap {
  id: MapId;
  name: string;
  portals: Portal[];
  hasBoss: boolean;
  bossKind: MonsterKind;
  theme: Theme;
  /** recommended level */
  level: number;
  surface: (tx: number, ty: number, g: number) => number;
}

export const MAP_NAMES: Record<MapId, string> = { main: 'เอลเดอร์โกรฟ', gather: 'ป่าพรานไพร', haunt: 'ป่าใบไม้ร่วงผีสิง', lava: 'ดินแดนลาวา', snow: 'ภูเขาหิมะนิรันดร์', dung: 'คุกใต้ดินเหวลึก' };

const cache: Partial<Record<MapId, GameMap>> = {};

/** Fresh copy each call (blocked grid is mutated by chopping). */
export function generateMap(id: MapId): GameMap {
  void cache;
  if (id === 'gather') return generateGather();
  if (id !== 'main') return generateRegion(id);
  const w = generateWorld();
  // portal on open ground south-east of the village, past the fence (clear decorations there)
  const PX = 26, PY = 51, p = iso(PX + 0.5, PY + 0.5);
  const veg = new Set(['tree', 'pine', 'bush', 'rock', 'bigrock', 'log', 'flower', 'tuft', 'mushrooms']);
  w.objects = w.objects.filter(o => {
    const near = Math.abs(o.tx - PX) <= 3 && Math.abs(o.ty - PY) <= 3;
    if (near && veg.has(o.type)) { if (o.solid) w.blocked[o.ty * MAP_W + o.tx] = 0; if (o.type === 'bigrock') w.blocked[o.ty * MAP_W + o.tx + 1] = 0; return false; }
    return true;
  });
  w.objects.push({ type: 'portal', x: p.x, y: p.y, v: 0, tx: PX, ty: PY });
  // gate to the next region, east of the ruined temple
  const QX = 103, QY = 47, q = iso(QX + 0.5, QY + 0.5);
  w.objects = w.objects.filter(o => {
    const near = Math.abs(o.tx - QX) <= 3 && Math.abs(o.ty - QY) <= 3;
    if (near && (veg.has(o.type) || o.type === 'wall')) { if (o.solid) w.blocked[o.ty * MAP_W + o.tx] = 0; return false; }
    return true;
  });
  for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) if (w.ground[(QY + j) * MAP_W + QX + i] !== G.Water) w.blocked[(QY + j) * MAP_W + QX + i] = 0;
  w.objects.push({ type: 'portal', x: q.x, y: q.y, v: 1, tx: QX, ty: QY });
  return { ...w, id: 'main', name: MAP_NAMES.main, hasBoss: true, bossKind: 'treant', theme: 'main', level: 1, surface: surfaceAt, portals: [
    { tx: PX, ty: PY, x: p.x, y: p.y, to: 'gather', label: 'ไปป่าพรานไพร (หาทรัพยากร)' },
    { tx: QX, ty: QY, x: q.x, y: q.y, to: 'haunt', label: 'ไปป่าใบไม้ร่วงผีสิง (Lv20+)' }] };
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
    heroStart: start, bossPos: start, zones: GZONES, hasBoss: false, bossKind: 'treant', theme: 'main', level: 1, surface: gsurface,
    portals: [{ tx: 5, ty: 38, x: pp.x, y: pp.y, to: 'main', label: 'กลับหมู่บ้าน' }],
  };
}

// ---------------- Regions (Lv20-100) ----------------
interface RegionDef {
  name: string; level: number; theme: Theme; boss: MonsterKind; mobs: MonsterKind[]; prev: MapId; next: MapId | null;
  /** props: texture key, world solid?, weight, is-tree */
  props: [string, boolean, number][]; trees: [string, number][]; zones: [string, string][]; water: 'river' | 'lake' | 'none';
}
const REGIONS: Partial<Record<MapId, RegionDef>> = {
  haunt: { name: MAP_NAMES.haunt, level: 20, theme: 'haunt', boss: 'stag', mobs: ['skeleton', 'skarcher', 'ghost', 'spider'], prev: 'main', next: 'lava', water: 'river',
    props: [['pr_haunt3', true, 3], ['pr_haunt4', true, 1], ['pr_haunt5', false, 3], ['pr_haunt6', true, 1], ['pr_haunt7', true, 2]],
    trees: [['pr_haunt0', 3], ['pr_haunt1', 4], ['pr_haunt2', 2]],
    zones: [['ประตูป่า', 'ทางเข้า'], ['สุสานร้าง', ''], ['ลำธารเงา', ''], ['รังแมงมุม', ''], ['ลานกวางคำสาป', '']] },
  lava: { name: MAP_NAMES.lava, level: 50, theme: 'lava', boss: 'dragon', mobs: ['imp', 'salamander', 'golem'], prev: 'haunt', next: 'snow', water: 'river',
    props: [['pr_lava0', true, 3], ['pr_lava1', true, 2], ['pr_lava2', true, 2], ['pr_lava4', true, 1], ['pr_lava5', true, 2], ['pr_lava6', true, 2], ['pr_lava7', true, 1]],
    trees: [['pr_lava3', 3]],
    zones: [['ปากปล่อง', ''], ['ทุ่งเถ้าถ่าน', ''], ['แม่น้ำลาวา', ''], ['เหมืองเงินร้อน', ''], ['รังมังกร', '']] },
  snow: { name: MAP_NAMES.snow, level: 60, theme: 'snow', boss: 'frostgiant', mobs: ['icewolf', 'yeti'], prev: 'lava', next: 'dung', water: 'lake',
    props: [['pr_snow1', true, 2], ['pr_snow2', true, 3], ['pr_snow3', false, 2], ['pr_snow4', true, 1], ['pr_snow5', true, 1], ['pr_snow6', true, 2], ['pr_snow7', true, 2]],
    trees: [['pr_snow0', 5]],
    zones: [['เชิงเขา', ''], ['ป่าสนหิมะ', ''], ['ทะเลสาบน้ำแข็ง', ''], ['ถ้ำเยติ', ''], ['บัลลังก์ยักษ์', '']] },
  dung: { name: MAP_NAMES.dung, level: 80, theme: 'dung', boss: 'skking', mobs: ['skeleton', 'skarcher', 'ghost', 'rat'], prev: 'snow', next: null, water: 'none',
    props: [['pr_dung0', true, 1], ['pr_dung1', true, 3], ['pr_dung2', true, 1], ['pr_dung3', true, 2], ['pr_dung5', false, 3], ['pr_dung6', true, 1]],
    trees: [],
    zones: [['ประตูคุก', ''], ['ห้องทรมาน', ''], ['ทางน้ำใต้ดิน', ''], ['สุสานกษัตริย์', ''], ['ท้องพระโรงกระดูก', '']] },
};
export const regionOf = (id: MapId) => REGIONS[id];

function generateRegion(id: MapId, seed = 777): GameMap {
  const R = REGIONS[id]!;
  const rnd = mulberry32(seed + id.length * 131 + id.charCodeAt(0));
  const ground = new Uint8Array(MAP_W * MAP_H);
  const blocked = new Uint8Array(MAP_W * MAP_H);
  const objects: WorldObj[] = [];
  const idx = (x: number, y: number) => y * MAP_W + x;
  const X0 = 4, X1 = 80, Y0 = 8, Y1 = 68;
  const inside = (x: number, y: number) => x >= X0 && x <= X1 && y >= Y0 && y <= Y1;
  const ARENA = { cx: 70, cy: 38, rx: 8, ry: 7 };
  const path: [number, number][][] = [[[6, 38], [18, 36], [30, 42], [44, 36], [56, 40], [64, 38]], [[30, 42], [28, 56], [40, 62]], [[44, 36], [46, 22], [58, 14]]];
  const pd = (x: number, y: number) => Math.min(...path.map(p => polyDist(x, y, p)));
  const rx = (y: number) => 38 + Math.sin(y * 0.13 + seed) * 4;
  const dung = R.theme === 'dung';
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    const n = fbm(x * 0.08, y * 0.08, 17);
    let g = n > 0.56 ? G.Forest : G.Grass;
    if (!inside(x, y)) g = G.Forest;
    if (R.water === 'river' && inside(x, y)) { const d = Math.abs(x + 0.5 - rx(y)); if (d < 1.8) g = G.Water; else if (d < 2.6) g = G.Sand; }
    if (R.water === 'lake') { const d = Math.hypot((x - 40) / 9, (y - 54) / 6) + (n - 0.5) * 0.4; if (d < 1) g = G.Water; else if (d < 1.15) g = G.Sand; }
    if (dung && inside(x, y) && (y === 26 || y === 50) && x > 12 && x < 60 && (x % 9) > 2) g = G.Water;
    if (Math.hypot((x - ARENA.cx) / ARENA.rx, (y - ARENA.cy) / ARENA.ry) + (n - 0.5) * 0.25 < 1) g = G.Ruins;
    if (inside(x, y) && pd(x + 0.5, y + 0.5) + (n - 0.5) * 0.9 < 1.4 && g !== G.Ruins) g = g === G.Water || g === G.Sand ? G.Bridge : G.Path;
    ground[idx(x, y)] = g;
    if (g === G.Water || !inside(x, y)) blocked[idx(x, y)] = 1;
  }
  const free = (x: number, y: number, r = 0) => {
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
      const X = x + i, Y = y + j;
      if (X < 0 || Y < 0 || X >= MAP_W || Y >= MAP_H) return false;
      const g = ground[idx(X, Y)];
      if (blocked[idx(X, Y)] || g === G.Water || g === G.Path || g === G.Bridge || g === G.Ruins) return false;
    }
    return true;
  };
  const prop = (key: string, tx: number, ty: number, solid: boolean, deco = false) => {
    const p = iso(tx + 0.5, ty + 0.5);
    objects.push({ type: 'prop', key, x: p.x, y: p.y, v: 0, tx, ty, deco, solid: solid ? { w: 1, h: 1 } : undefined });
    if (solid) blocked[idx(tx, ty)] = 1;
  };
  const pick = <T,>(list: [T, ...unknown[]][]): T => {
    const tot = list.reduce((a, l) => a + (l[l.length - 1] as number), 0); let r = rnd() * tot;
    for (const l of list) { r -= l[l.length - 1] as number; if (r <= 0) return l[0]; }
    return list[0][0];
  };
  for (let y = 1; y < MAP_H - 1; y++) for (let x = 1; x < MAP_W - 1; x++) {
    const g = ground[idx(x, y)], r = rnd();
    if (!inside(x, y)) {
      const edge = Math.min(Math.abs(x - X0), Math.abs(x - X1), Math.abs(y - Y0), Math.abs(y - Y1));
      if (edge <= 5 && r < (dung ? 0.35 : 0.45)) {
        if (R.trees.length) prop(pick(R.trees.map(t => [t[0], t[1]] as [string, number])), x, y, false, true);
        else prop(rnd() < 0.5 ? 'pr_dung3' : 'pr_dung1', x, y, false, true);
      }
      continue;
    }
    if (Math.hypot(x - 8, y - 38) < 5 || Math.hypot(x - ARENA.cx, y - ARENA.cy) < 9 || pd(x, y) < 2.2) continue;
    if (g === G.Ruins) continue;
    const treeP = R.trees.length ? (g === G.Forest ? 0.14 : 0.03) : 0;
    if (r < treeP && free(x, y, 1)) { prop(pick(R.trees.map(t => [t[0], t[1]] as [string, number])), x, y, true); continue; }
    if (r < treeP + (dung ? 0.05 : 0.025) && free(x, y)) { const k = pick(R.props.map(q => [q[0], q[2]] as [string, number])); prop(k, x, y, R.props.find(q => q[0] === k)![1]); continue; }
    if (!dung && r < treeP + 0.05 && free(x, y)) put0('tuft', x, y, g);
  }
  function put0(type: ObjType, tx: number, ty: number, v: number) { const p = iso(tx + 0.5, ty + 0.5); objects.push({ type, x: p.x, y: p.y, v, tx, ty }); }
  // arena ring of torches / pillars
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2, tx = Math.round(ARENA.cx + Math.cos(a) * 7), ty = Math.round(ARENA.cy + Math.sin(a) * 6);
    if (a > Math.PI * 0.85 && a < Math.PI * 1.15) continue; // entrance
    put0(i % 2 ? 'pillar' : 'brokenpillar', tx, ty, i); blocked[idx(tx, ty)] = 1;
  }
  for (let x = 0; x < MAP_W; x++) { blocked[idx(x, 0)] = 1; blocked[idx(x, MAP_H - 1)] = 1; }
  for (let y = 0; y < MAP_H; y++) { blocked[idx(0, y)] = 1; blocked[idx(MAP_W - 1, y)] = 1; }
  const portals: Portal[] = [];
  const back = iso(5.5, 38.5);
  objects.push({ type: 'portal', x: back.x, y: back.y, v: 0, tx: 5, ty: 38 });
  portals.push({ tx: 5, ty: 38, x: back.x, y: back.y, to: R.prev, label: 'กลับ ' + MAP_NAMES[R.prev] });
  if (R.next) {
    const nx = iso(78.5, 38.5);
    for (let j = -1; j <= 1; j++) for (let i = -2; i <= 1; i++) blocked[idx(78 + i, 38 + j)] = 0;
    objects.push({ type: 'portal', x: nx.x, y: nx.y, v: 1, tx: 78, ty: 38 });
    portals.push({ tx: 78, ty: 38, x: nx.x, y: nx.y, to: R.next, label: `ไป${MAP_NAMES[R.next]} (Lv${REGIONS[R.next]!.level}+)` });
  }
  const spawnPts: [number, number][] = [[22, 30], [26, 48], [36, 20], [40, 60], [50, 30], [52, 48], [60, 22], [58, 56]];
  const spawns: SpawnArea[] = spawnPts.map(([x, y], i) => ({ kind: R.mobs[i % R.mobs.length], x, y, r: 4, count: 3 }));
  const zc: [number, number][] = [[10, 38], [26, 50], [40, 30], [54, 20], [70, 38]];
  return {
    id, name: R.name, ground, blocked, objects, spawns, npcs: [], heroStart: iso(9.5, 38.5), bossPos: iso(ARENA.cx + 0.5, ARENA.cy + 0.5),
    zones: R.zones.map(([n], i) => ({ id: id + i, name: n, cx: zc[i][0], cy: zc[i][1], r: 12 })), hasBoss: true, bossKind: R.boss, theme: R.theme, level: R.level,
    surface: (_tx, _ty, g) => g, portals,
  };
}
