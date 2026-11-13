// Smooth movement of other players (director: "they warp and stutter"). Each position carries the SENDER's clock (`ts`),
// so the spacing of the spots is the real one even when the network delivers them unevenly (mobile networks: 50–150 ms
// of jitter); they are shown DELAY ms in the past, walking evenly between spots; if the next spot is late the figure keeps
// going the same way for a moment, and any correction is blended in over a few frames instead of a jump.
// Costs nothing more: the same messages, 5 a second.
export const DELAY = 330;          // ms shown in the past (spots come every 200 ms: one late spot never runs the buffer dry)
const EXTRA = 260;                 // ms a figure keeps walking past its last spot while the next is late
const SNAP = 320;                  // px: farther than this is a warp (portal, respawn) — no sliding across the map
export interface Spot { t: number; x: number; y: number }
export class Track {
  buf: Spot[] = []; off = NaN; lastTs = -1; x = 0; y = 0; shown = false;
  /** a spot arrived at local time `now`; `ts` = the sender's clock (missing from an older game: the arrival time is used) */
  add(now: number, x: number, y: number, ts?: number) {
    let t = now;
    if (typeof ts === 'number' && Number.isFinite(ts)) {
      if (ts < this.lastTs - 1000 || !Number.isFinite(this.off)) { this.off = now - ts; if (ts < this.lastTs - 1000) this.buf = []; }   // (first spot, or the sender's game restarted)
      this.off = Math.min(this.off + 0.5, now - ts);   // the fastest delivery seen = the sender's clock on ours (creeps up slowly: clocks drift)
      this.lastTs = ts; t = ts + this.off;
    }
    const last = this.buf[this.buf.length - 1];
    if (last && t <= last.t) t = last.t + 1;
    this.buf.push({ t, x, y }); if (this.buf.length > 10) this.buf.shift();
  }
  /** where to draw at local time `now` (dt = ms since the last frame) */
  at(now: number, dt: number): { x: number; y: number } {
    const b = this.buf; if (!b.length) return { x: this.x, y: this.y };
    const rt = now - DELAY; let tx: number, ty: number;
    const last = b[b.length - 1];
    if (rt >= last.t) {   // the next spot is late: keep walking the way they went (a little), then wait
      const p = b[b.length - 2], ex = Math.min(rt - last.t, EXTRA);
      if (p && last.t - p.t < 450) { const vx = (last.x - p.x) / (last.t - p.t), vy = (last.y - p.y) / (last.t - p.t); tx = last.x + vx * ex; ty = last.y + vy * ex; }
      else { tx = last.x; ty = last.y; }
    } else if (rt <= b[0].t) { tx = b[0].x; ty = b[0].y; }
    else {
      let k = b.length - 1; while (k > 0 && b[k - 1].t > rt) k--;
      const a = b[k - 1], c = b[k], f = (rt - a.t) / Math.max(1, c.t - a.t);
      tx = a.x + (c.x - a.x) * f; ty = a.y + (c.y - a.y) * f;
    }
    if (!this.shown || Math.hypot(tx - this.x, ty - this.y) > SNAP) { this.x = tx; this.y = ty; this.shown = true; }
    else { const k = Math.min(1, dt / 60); this.x += (tx - this.x) * k; this.y += (ty - this.y) * k; }   // (blend: a correction never jumps)
    return { x: this.x, y: this.y };
  }
}
