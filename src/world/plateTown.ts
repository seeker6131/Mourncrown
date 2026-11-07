// Painted-plate village (prototype): the ground is one big hand-painted image stitched from GPT plates
// (tools/plate_build.py). Walkability and depth come from a per-cell mask baked from the image.
import meta from '../assets/plates/town.json';
import { G, MAP_W, MAP_H, type WorldObj } from './mapgen';
import type { GameMap } from './maps';

export const PLATE_ORIGIN = { x: 32, y: 32 };      // game px of the composite's top-left
export const PLATE_SCALE = 0.5;                     // composite art px -> game px
// the single-file (artifact) build stays under its size cap: plates ship only on the web build
const FILES = (import.meta.env.MODE === 'single' ? {}
  : import.meta.glob('../assets/plates/*.webp', { eager: true, query: '?url', import: 'default' })) as Record<string, string>;
export const PLATE_FILES: Record<string, string> = Object.fromEntries(Object.entries(FILES).map(([p, u]) => ['plate_' + p.split('/').pop()!.replace('.webp', ''), u]));
export const plateAvailable = () => !!PLATE_FILES.plate_town;

export interface PlateBld { w: number; h: number; base: number; cx: number; cy: number; rx: number; ry: number }
export interface PlateMeta { cell: number; w: number; h: number; pw: number; ph: number; walk: number[]; occ: number[]; start: [number, number]; blds: Record<string, PlateBld> }
export const PM = meta as unknown as PlateMeta;

/** Building lots painted into the plate (composite px): centre and width. */
export const PLATE_LOTS: { x: number; y: number; w: number; kind?: 'townhall' | 'lumber' | 'house' }[] = [
  { x: 1880, y: 270, w: 600, kind: 'townhall' },
  { x: 640, y: 300, w: 400, kind: 'lumber' },
  { x: 600, y: 600, w: 460, kind: 'house' },
  { x: 700, y: 880, w: 420 }, { x: 960, y: 1100, w: 420 }, { x: 1460, y: 1220, w: 500 },
  { x: 2300, y: 1240, w: 520 }, { x: 2260, y: 1540, w: 280 },
];

function unrle(r: number[], n: number): Uint8Array {
  const out = new Uint8Array(n); let v = 0, i = 0;
  for (const run of r) { if (v) out.fill(1, i, i + run); i += run; v ^= 1; }
  return out;
}

export interface PlateGrid { cell: number; w: number; h: number; walk: Uint8Array; occ: Uint8Array }
let grid: PlateGrid | null = null;
export function plateGrid(): PlateGrid {
  if (!grid) grid = { cell: PM.cell, w: PM.w, h: PM.h, walk: unrle(PM.walk, PM.w * PM.h), occ: unrle(PM.occ, PM.w * PM.h) };
  return grid;
}

export const toGame = (cx: number, cy: number) => ({ x: PLATE_ORIGIN.x + cx * PLATE_SCALE, y: PLATE_ORIGIN.y + cy * PLATE_SCALE });

export function generateTown(): GameMap {
  const ground = new Uint8Array(MAP_W * MAP_H).fill(G.Path);
  const blocked = new Uint8Array(MAP_W * MAP_H);
  const north = toGame(2080, 70), start = toGame(PM.start[0], PM.start[1]);
  const objects: WorldObj[] = [{ type: 'portal', x: north.x, y: north.y, v: 0, tx: 0, ty: 0 }];
  return {
    id: 'town', name: 'หมู่บ้านใบไม้แดง (ทดลอง)', ground, blocked, objects, spawns: [], npcs: [],
    heroStart: start, bossPos: start, hasBoss: false, bossKind: 'treant', theme: 'main', level: 1,
    surface: () => 0,
    zones: [{ id: 'town', name: 'หมู่บ้านใบไม้แดง', cx: 0, cy: 0, r: 999 }],
    portals: [{ tx: 0, ty: 0, x: north.x, y: north.y, to: 'main', label: 'กลับเอลเดอร์โกรฟ' }],
    plate: true,
  };
}
