// A* path finding for auto play: an 8 px grid of cells where the hero's feet fit (trees, rocks, water, walls blocked).
// Paths are smoothed by line of sight so the hero walks straight where it can and goes around obstacles when needed.
export class PathGrid {
  readonly S = 8; w: number; h: number; walk: Uint8Array;
  constructor(mw: number, mh: number, blocked: (x: number, y: number) => boolean) {
    this.w = Math.ceil(mw / this.S); this.h = Math.ceil(mh / this.S); this.walk = new Uint8Array(this.w * this.h);
    for (let j = 0; j < this.h; j++) for (let i = 0; i < this.w; i++) {
      const x = i * this.S + 4, y = j * this.S + 4;
      this.walk[j * this.w + i] = blocked(x - 5, y) || blocked(x + 5, y) || blocked(x, y - 2) || blocked(x, y + 2) ? 0 : 1;
    }
  }
  /** cells reachable from (x, y) — the map's open area seen from its entrance */
  reach?: Uint8Array;
  flood(x: number, y: number) {
    const st = this.nearestOk(...this.cell(x, y), 8); const r = new Uint8Array(this.w * this.h); this.reach = r; if (!st) return;
    const q = [st[1] * this.w + st[0]]; r[q[0]] = 1;
    while (q.length) { const c = q.pop()!, ci = c % this.w, cj = (c - ci) / this.w;
      for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ni = ci + a, nj = cj + b; if (this.ok(ni, nj) && !r[nj * this.w + ni]) { r[nj * this.w + ni] = 1; q.push(nj * this.w + ni); } } }
  }
  reachable(x: number, y: number) { if (!this.reach) return true; const [i, j] = this.cell(x, y); return i >= 0 && j >= 0 && i < this.w && j < this.h && this.reach[j * this.w + i] === 1; }
  /** the point is on / right beside the open area (3x3 cells) — tolerant, for points checked with the real collision test */
  near(x: number, y: number) {
    if (!this.reach) return true; const [i, j] = this.cell(x, y);
    for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) { const ni = i + a, nj = j + b; if (ni >= 0 && nj >= 0 && ni < this.w && nj < this.h && this.reach[nj * this.w + ni]) return true; }
    return false;
  }
  /** nearest reachable point (world px) to (x, y) */
  rescue(x: number, y: number, maxRing = 80): { x: number; y: number } | null {
    const [i0, j0] = this.cell(x, y);
    if (this.reach?.[j0 * this.w + i0]) return { x: i0 * this.S + 4, y: j0 * this.S + 4 };
    for (let d = 1; d < maxRing; d++) for (let b = -d; b <= d; b++) for (let a = -d; a <= d; a++) {
      if (Math.abs(a) !== d && Math.abs(b) !== d) continue; const i = i0 + a, j = j0 + b;
      if (i >= 0 && j >= 0 && i < this.w && j < this.h && this.reach?.[j * this.w + i]) return { x: i * this.S + 4, y: j * this.S + 4 };
    }
    return null;
  }
  ok(i: number, j: number) { return i >= 0 && j >= 0 && i < this.w && j < this.h && this.walk[j * this.w + i] === 1; }
  cell(x: number, y: number) { return [Math.floor(x / this.S), Math.floor(y / this.S)] as const; }
  /** nearest walkable cell to (i, j) within r cells */
  nearestOk(i: number, j: number, r = 4): [number, number] | null {
    if (this.ok(i, j)) return [i, j];
    for (let d = 1; d <= r; d++) for (let b = -d; b <= d; b++) for (let a = -d; a <= d; a++) if ((Math.abs(a) === d || Math.abs(b) === d) && this.ok(i + a, j + b)) return [i + a, j + b];
    return null;
  }
  /** straight line between two points stays on walkable cells */
  clear(x0: number, y0: number, x1: number, y1: number) {
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 4);
    for (let k = 1; k < n; k++) { const [i, j] = this.cell(x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n); if (!this.ok(i, j)) return false; }
    return true;
  }
  /** waypoints (world px) from start to goal, or null when unreachable */
  find(sx: number, sy: number, tx: number, ty: number, limit = 24000): { x: number; y: number }[] | null {
    if (this.clear(sx, sy, tx, ty)) return [{ x: tx, y: ty }];
    const s0 = this.nearestOk(...this.cell(sx, sy), 2), g0 = this.nearestOk(...this.cell(tx, ty), 5);
    if (!s0 || !g0) return null;
    const W = this.w, start = s0[1] * W + s0[0], goal = g0[1] * W + g0[0];
    const g = new Float32Array(this.w * this.h).fill(Infinity), from = new Int32Array(this.w * this.h).fill(-1), closed = new Uint8Array(this.w * this.h);
    const heap: [number, number][] = []; // [f, idx] binary min-heap
    const push = (f: number, i: number) => { heap.push([f, i]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
    const pop = () => { const top = heap[0], last = heap.pop()!; if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
    const hx = g0[0], hy = g0[1], H = (i: number) => { const dx = Math.abs((i % W) - hx), dy = Math.abs(Math.floor(i / W) - hy); return Math.max(dx, dy) + 0.414 * Math.min(dx, dy); };
    g[start] = 0; push(H(start), start);
    let n = 0;
    while (heap.length && n++ < limit) {
      const [, cur] = pop(); if (closed[cur]) continue; closed[cur] = 1;
      if (cur === goal) break;
      const ci = cur % W, cj = Math.floor(cur / W);
      for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
        if (!a && !b) continue; const ni = ci + a, nj = cj + b; if (!this.ok(ni, nj)) continue;
        if (a && b && (!this.ok(ci + a, cj) || !this.ok(ci, cj + b))) continue;   // no corner cutting
        const nb = nj * W + ni, cost = g[cur] + (a && b ? 1.414 : 1);
        if (cost < g[nb]) { g[nb] = cost; from[nb] = cur; push(cost + H(nb), nb); }
      }
    }
    if (from[goal] < 0 && goal !== start) return null;
    const cells: { x: number; y: number }[] = [];
    for (let c = goal; c !== -1 && c !== start; c = from[c]) cells.push({ x: (c % W) * this.S + 4, y: Math.floor(c / W) * this.S + 4 });
    cells.reverse(); cells.push({ x: tx, y: ty });
    // string pulling: skip waypoints that are in plain sight
    const out: { x: number; y: number }[] = []; let px = sx, py = sy, k = 0;
    while (k < cells.length) { let far = k; for (let m = cells.length - 1; m > k; m--) if (this.clear(px, py, cells[m].x, cells[m].y)) { far = m; break; } out.push(cells[far]); px = cells[far].x; py = cells[far].y; k = far + 1; }
    return out;
  }
}
