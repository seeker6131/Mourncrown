import { describe, it, expect } from 'vitest';
import { Track, DELAY } from '../src/net/interp';

// a player walks at 150 px/s for 6 s, sending a spot every 200 ms; the network adds 60 ms + 0–200 ms of jitter
function run(useTs: boolean, oldWay: boolean) {
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const sends: { ts: number; x: number; at: number }[] = [];
  for (let ts = 0; ts <= 6000; ts += 200) sends.push({ ts, x: 0.15 * ts, at: ts + 60 + rnd() * 200 });
  sends.sort((a, b) => a.at - b.at);
  const tr = new Track(), steps: number[] = []; let i = 0, prev = NaN; const ob: { t: number; x: number }[] = [];
  for (let now = 0; now < 6800; now += 16.7) {
    while (i < sends.length && sends[i].at <= now) { const s = sends[i++]; if (oldWay) { ob.push({ t: now, x: s.x }); if (ob.length > 8) ob.shift(); } else tr.add(now, s.x, 0, useTs ? s.ts : undefined); }
    let x: number;
    if (oldWay) {   // the previous code: arrival time, 260 ms, hold at the last spot
      const rt = now - 260; if (!ob.length) continue; let k = ob.length - 1; while (k > 0 && ob[k - 1].t > rt) k--;
      if (k === 0 || rt >= ob[ob.length - 1].t) x = (rt >= ob[ob.length - 1].t ? ob[ob.length - 1] : ob[0]).x;
      else { const a = ob[k - 1], c = ob[k]; x = a.x + (c.x - a.x) * Math.min(1, Math.max(0, (rt - a.t) / Math.max(1, c.t - a.t))); }
    } else { if (!tr.buf.length) continue; x = tr.at(now, 16.7).x; }
    if (now > 1000 && now < 5800 && Number.isFinite(prev)) steps.push(x - prev);
    prev = x;
  }
  const ideal = 0.15 * 16.7, freezes = steps.filter(s => s < ideal * 0.2).length, jumps = steps.filter(s => s > ideal * 2.5).length;
  return { freezes, jumps, worst: Math.max(...steps.map(s => Math.abs(s - ideal))) };
}
describe('other players move smoothly through network jitter (same 5 spots a second)', () => {
  it('the new way has (almost) no freezes or jumps where the old way stuttered', () => {
    const old = run(false, true), neu = run(true, false);
    console.log('old', old, 'new', neu, 'delay', DELAY);
    expect(neu.freezes).toBeLessThan(old.freezes); expect(neu.jumps).toBeLessThanOrEqual(old.jumps);
    expect(neu.freezes).toBe(0); expect(neu.jumps).toBe(0);
  });
  it('a far move (portal / respawn) snaps instead of sliding across the map', () => {
    const t = new Track(); t.add(0, 100, 100, 0); t.at(400, 16); t.add(500, 2000, 100, 500); t.add(700, 2000, 100, 700);
    expect(t.at(1100, 16).x).toBe(2000);
  });
});
