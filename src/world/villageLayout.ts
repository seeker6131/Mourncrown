// Guild village layout (docs/GUILD_WAR.md 2). One layout for every village: your own and the rival villages you raid.
//   north gate (map portal) ─ tavern · guild hall · kitchen ─ main road ─ bridge ─ east bank: lumber / quarry / barn
//   forge · plaza + market · warehouse · barracks ─ south road ─ south gate
//   residential street: 2 rows of 5 houses side by side (members' houses), lanes in front of each row
//   a wall road all round the village with the defense slots on it
export const VW = 1600, VH = 1280;
export const riverX = (y: number) => 1185 + Math.sin(y / 130) * 34 + Math.sin(y / 47) * 8;
export const roadY = (x: number) => 470 + Math.sin(x / 170) * 12;
export const PLAZA = { x: 780, y: 610, r: 100 };
export const POND = { x: 175, y: 640, r: 52 };
export const NORTH_GATE = { x: 560, y: 34 };
export const SOUTH_GATE = { x: 780, y: 1246 };
export const WEST_EXIT = { x: 44, y: roadY(44) };
/** the bridge where the main road crosses the river */
export const BRIDGE = { y0: roadY(1185) - 20, y1: roadY(1185) + 20 };
/** village plots: 0-8 craft / production buildings, 9 the guild hall, 10-19 the members' houses */
export const PLOTS: { x: number; y: number }[] = [
  { x: 380, y: 700 },   // 0 forge
  { x: 1385, y: 1000 }, // 1 barn
  { x: 1385, y: 390 },  // 2 lumber
  { x: 330, y: 410 },   // 3 tavern
  { x: 1010, y: 410 },  // 4 kitchen
  { x: 590, y: 720 },   // 5 market
  { x: 1010, y: 700 },  // 6 warehouse
  { x: 1385, y: 690 },  // 7 quarry
  { x: 1010, y: 960 },  // 8 barracks
  { x: 780, y: 400 },   // 9 guild hall
  ...[0, 1].flatMap(r => [0, 1, 2, 3, 4].map(c => ({ x: 170 + c * 116, y: r ? 1135 : 905 }))),   // 10-19 houses
];
export const PLOT_OF: Record<string, number> = { forge: 0, barn: 1, lumber: 2, tavern: 3, kitchen: 4, market: 5, warehouse: 6, quarry: 7, barracks: 8, hall: 9 };
export const HOUSE_SCALE = 0.7;
export const HALL_PLOT = 9;
/** the plot of the i-th house lot on the residential street */
export const housePlot = (i: number) => 10 + i;
/** the lane in front of each row of houses */
export const ROW_LANES = [930, 1160];
/** extra decor houses (none: villagers live in the buildings they work at) */
export const NPC_HOUSES: [string, number, number][] = [];
/** the wall road round the village and the defense slots on it (slot order = unlock order) */
export const RING = { x0: 92, y0: 92, x1: 1508, y1: 1196, r: 150 };
export const SLOTS: { x: number; y: number }[] = [
  { x: 690, y: 1196 }, { x: 870, y: 1196 }, { x: 470, y: 92 }, { x: 650, y: 92 },        // the gates
  { x: 92, y: 640 }, { x: 92, y: 900 }, { x: 1508, y: 330 }, { x: 1508, y: 820 },
  { x: 400, y: 1196 }, { x: 1150, y: 1196 }, { x: 1000, y: 92 }, { x: 1300, y: 92 },
  { x: 92, y: 280 }, { x: 1508, y: 1080 },
];
/** stone yards under buildings: rx / ry of the jagged paved area */
export function yards() {
  const out: { x: number; y: number; rx: number; ry: number }[] = [];
  PLOTS.forEach((p, i) => out.push(i < 10 ? { x: p.x, y: p.y + 8, rx: i === 9 ? 130 : 104, ry: i === 9 ? 62 : 50 } : { x: p.x, y: p.y + 8, rx: 62, ry: 34 }));
  for (const [, x, y] of NPC_HOUSES) out.push({ x, y: y + 8, rx: 80, ry: 40 });
  for (const s of SLOTS) out.push({ x: s.x, y: s.y + 4, rx: 30, ry: 18 });
  return out;
}
/** distance from (x, y) to the wall road (a rounded rectangle) */
export function ringDist(x: number, y: number) {
  const { x0, y0, x1, y1, r } = RING, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, hw = (x1 - x0) / 2 - r, hh = (y1 - y0) / 2 - r;
  const qx = Math.abs(x - cx) - hw, qy = Math.abs(y - cy) - hh;
  const out = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
  return Math.abs(out);
}
const segDist = (x: number, y: number, ax: number, ay: number, bx: number, by: number) => {
  const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(x - (ax + dx * t), y - (ay + dy * t));
};
/** lanes (besides the main road): [ax, ay, bx, by, half width] */
export const LANES: [number, number, number, number, number][] = [
  [NORTH_GATE.x, 0, NORTH_GATE.x, 480, 15],          // north gate down to the main road
  [PLAZA.x, PLAZA.y, SOUTH_GATE.x, VH, 15],          // plaza to the south gate
  [100, ROW_LANES[0], SOUTH_GATE.x, ROW_LANES[0], 12],
  [100, ROW_LANES[1], SOUTH_GATE.x, ROW_LANES[1], 12],
  [PLAZA.x, PLAZA.y, PLOTS[9].x, PLOTS[9].y + 30, 14], // plaza to the hall door
];
/** how far a point is from the nearest road / lane (main road included) */
export function laneDist(x: number, y: number) {
  let d = Math.abs(y - roadY(x));
  for (const [ax, ay, bx, by, w] of LANES) d = Math.min(d, segDist(x, y, ax, ay, bx, by) - (w - 15));
  return d;
}
/** where the hero arrives in the village / at a building's door */
export const VILLAGE_SPAWN = { x: PLAZA.x, y: PLAZA.y + 40 };
export const doorOf = (plot: number) => { const p = PLOTS[plot]; return { x: p.x, y: p.y + (plot >= 10 ? 14 : 18) }; };
