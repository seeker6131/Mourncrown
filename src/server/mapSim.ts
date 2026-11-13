// The map's monsters, run by the game server (server/worker.ts Room) — director: nobody's game may steer them.
// The room spawns them, walks them, decides who they chase and when they strike; every player's game only shows them.
// Same behaviour as the old single-player code (world/tdCombat.ts): peaceful until hit, a charge then a chase after the
// one who hit them last, home again when that player gets away; bosses add a ground blast and a charge; game animals
// bolt and now and then kick back. The map's walls come from the players' games (Grid, checked by the room).
import { STAGES, WILD, WILD_GAME, wildStage, scaleStats, type Stage, type StageMon } from '../world/stages';
import { MONSTERS } from '../data/monsters';
import { monTarget, respawnMs, lowWater } from '../systems/spawnRate';

/** the map's walls (1 bit a cell, row by row), meadows, gate and boss meadow — sent by the players' games */
export interface Grid { w: number; h: number; c: number; bits: Uint8Array; clear: { x: number; y: number; r: number; boss?: boolean }[]; gate: { x: number; y: number } }
export interface SimPlayer { id: string; x: number; y: number; hp: number; lv: number }
export interface SMon {
  sid: number; mob: StageMon; boss: boolean; elite: boolean; animal: boolean; hp: number; max: number; dmg: Record<string, number>; alive: boolean;
  x: number; y: number; hx: number; hy: number; dir: number; mv: boolean; atT: number; last: number; hitT: number; tgt?: string;
  wanderT: number; idle: boolean; fleeT: number; spT: number; chT: number; chargeEnd: number; cvx: number; cvy: number; join: number; /** seconds it has tried to move and not got anywhere */ stuck: number;
}
/** what a tick wants told: a swing that lands on one player, an effect everyone sees */
export interface SimEvents { atk: { to: string; sid: number; k: 'hit' | 'shot' | 'special' | 'charge' | 'stun' }[]; fx: { sid: number; k: 'special' | 'charge'; x: number; y: number }[] }
/** one monster for the players' games: sid, key, kind, boss, elite, x, y, dir, moving, attacking, max HP, HP */
export type Row = [number, string, string, number, number, number, number, number, number, number, number, number];

const dirOf = (dx: number, dy: number) => (Math.round((Math.PI / 2 - Math.atan2(dy, dx)) / (Math.PI / 4)) % 8 + 8) % 8;
export const BOSS_RESPAWN = 300000;

/** the room's map number from its name: m12 / m12-3 → 12, w / w-2 → the Deepwild, anything else 0 */
export const mapOfRoom = (room: string) => room.startsWith('w') ? WILD : room.startsWith('m') ? parseInt(room.slice(1), 10) || 0 : 0;
export function gridOk(g: Grid) { return g.w > 0 && g.h > 0 && g.w <= 400 && g.h <= 300 && g.c >= 4 && g.c <= 16 && g.bits.length === Math.ceil(g.w * g.h / 8) && g.clear.length <= 30; }

export class MapSim {
  mons = new Map<number, SMon>(); n: number; wild: boolean; stage: Stage | null; last = 0; sid: number;
  pending: { m: SMon; at: number }[] = []; bossAt = 0; later: { at: number; f: () => void }[] = [];
  private ev: SimEvents = { atk: [], fx: [] };
  constructor(room: string, public grid: Grid, private rnd: () => number = Math.random) {
    this.n = mapOfRoom(room); this.wild = this.n === WILD; this.stage = this.wild ? wildStage(1) : STAGES[this.n - 1] ?? null;
    this.sid = 1_000_000 + Math.floor(rnd() * 100_000_000);
  }
  get W() { return this.grid.w * this.grid.c; }
  get H() { return this.grid.h * this.grid.c; }
  free(x: number, y: number) {
    if (x < 0 || y < 0 || x >= this.W || y >= this.H) return false;
    const i = Math.floor(y / this.grid.c) * this.grid.w + Math.floor(x / this.grid.c);
    return !(this.grid.bits[i >> 3] & (1 << (i & 7)));
  }
  /** a free spot: often in a meadow, never by the gate, out of the players' sight when possible */
  spot(players: SimPlayer[]) {
    const r = this.rnd, C = this.grid.clear.filter(c => !c.boss), g = this.grid.gate;
    for (let i = 0; i < 80; i++) {
      const c = C.length && r() < (this.wild ? 0.7 : 0.55) ? C[Math.floor(r() * C.length)] : null;
      const x = c ? c.x + (r() - 0.5) * c.r * 1.6 : 40 + r() * (this.W - 80), y = c ? c.y + (r() - 0.5) * c.r * (this.wild ? 1.3 : 1.2) : 40 + r() * (this.H - 80);
      if (!this.free(x, y) || Math.hypot(x - g.x, y - g.y) < (this.wild ? 200 : 260)) continue;
      if (i < 60 && players.some(p => Math.hypot(x - p.x, y - p.y) < 240)) continue;
      return { x, y };
    }
    for (let i = 0; i < 400; i++) { const x = r() * this.W, y = r() * this.H; if (this.free(x, y)) return { x, y }; }
    return { x: this.W / 2, y: this.H / 2 };
  }
  private make(mob: StageMon, boss: boolean, at: { x: number; y: number }, lv: number, now: number) {
    const base = MONSTERS[mob.kind], st = this.wild ? wildStage(lv) : this.stage!;
    const elite = !boss && !base.animal && !this.wild && this.rnd() < 0.03;   // golden: the server's roll
    const max = Math.max(1, Math.round(scaleStats(base, st.level, boss).hp * (elite ? 5 : 1)));
    const m: SMon = { sid: this.sid++, mob, boss, elite, animal: !!base.animal, hp: max, max, dmg: {}, alive: true, x: at.x, y: at.y, hx: at.x, hy: at.y, dir: 0, mv: false,
      atT: -1e9, last: -1e9, hitT: 0, wanderT: 0, idle: false, fleeT: 0, spT: -1e9, chT: -1e9, chargeEnd: 0, cvx: 0, cvy: 0, join: now, stuck: 0 };
    this.mons.set(m.sid, m); return m;
  }
  /** a player hit it: it turns on that player (game bolts away, and now and then kicks back) */
  hit(sid: number, by: string, now: number, players: SimPlayer[]) {
    const m = this.mons.get(sid); if (!m || !m.alive) return;
    m.hitT = now; m.tgt = by;
    if (m.animal) {
      m.fleeT = now + 1100;
      const p = players.find(q => q.id === by), base = MONSTERS[m.mob.kind];
      if (p && this.rnd() < (base.stun ?? 0.25) && Math.hypot(m.x - p.x, m.y - p.y) < 48 && now - m.last > 2500) {
        m.last = now; m.atT = now; m.dir = dirOf(p.x - m.x, p.y - m.y);
        this.later.push({ at: now + 160, f: () => { if (m.alive) this.ev.atk.push({ to: by, sid, k: 'stun' }); } });
      }
    }
  }
  /** it died: gone from the list, back after a while somewhere else (a boss after 5 minutes at its meadow) */
  died(sid: number, now: number, players: number) {
    const m = this.mons.get(sid); if (!m) return; m.alive = false; this.mons.delete(sid);
    if (m.boss) { this.bossAt = now + BOSS_RESPAWN; return; }
    this.pending.push({ m, at: now + respawnMs(m.animal ? 12000 : 8000 + this.rnd() * 6000, players) });
  }
  /** the map fills up with the crowd: respawns on time, early ones when it runs low, more monsters for more players */
  private keepUp(now: number, players: SimPlayer[]) {
    const st = this.stage; if (!st) return;
    const lv = Math.max(1, ...players.map(p => p.lv)), base = this.wild ? 40 : st.count, target = monTarget(base, players.length);
    const common = [...this.mons.values()].filter(m => !m.boss), alive = common.length;
    this.pending.sort((a, b) => a.at - b.at);
    let early = alive < lowWater(target) ? 3 : 0, k = 0;
    while (this.pending.length && k < 4 && (this.pending[0].at <= now || early-- > 0)) {
      const { m } = this.pending.shift()!; k++;
      if (common.length + 1 <= target) common.push(this.make(m.mob, false, this.spot(players), lv, now));
    }
    for (let i = common.length + this.pending.length; i < target && k < 4; i++, k++) {
      const mob = this.wild ? WILD_GAME[i % 3 === 0 ? 1 : 0] : st.land.mobs[(i + this.n) % st.land.mobs.length];
      common.push(this.make(mob, false, this.spot(players), lv, now));
    }
    const bm = this.grid.clear.find(c => c.boss);
    if (!this.wild && st.boss && bm && now >= this.bossAt && ![...this.mons.values()].some(m => m.boss)) { this.make(st.land.boss, true, bm, lv, now); this.bossAt = Infinity; }
  }
  private step(m: SMon, x: number, y: number) {
    let moved = false;
    if (this.free(x, m.y)) { m.x = x; moved = true; }
    if (this.free(m.x, y)) { m.y = y; moved = true; }
    return moved;
  }
  /** one beat of the map (5 a second): who moves where, who strikes whom */
  tick(now: number, players: SimPlayer[]): SimEvents {
    this.ev = { atk: [], fx: [] };
    const dt = Math.min(0.5, Math.max(0, (now - (this.last || now)) / 1000)); this.last = now;
    const due = this.later.filter(l => l.at <= now); this.later = this.later.filter(l => l.at > now); for (const l of due) l.f();
    this.keepUp(now, players);
    for (const m of this.mons.values()) this.think(m, now, dt, players);
    return this.ev;
  }
  private think(m: SMon, now: number, dt: number, players: SimPlayer[]) {
    const base = MONSTERS[m.mob.kind], reach = base.attackRange + m.mob.size * 0.2;
    let p = m.tgt ? players.find(q => q.id === m.tgt && q.hp > 0) : undefined;
    if (m.tgt && !p) { m.tgt = undefined; m.hitT = 0; }
    const dx = p ? p.x - m.x : 0, dy = p ? p.y - m.y : 0, dist = p ? Math.hypot(dx, dy) : Infinity;
    if (m.hitT > 0 && dist > 320) { m.hitT = 0; m.tgt = undefined; p = undefined; }
    const angry = m.hitT > 0 && !m.animal && !!p, aggro = !angry ? 0 : m.boss ? 260 : 130;
    m.mv = false;
    // a boss's charge in flight: it rushes on, stopping at a wall
    if (m.chargeEnd > now && (m.cvx || m.cvy)) {
      const ox = m.x, oy = m.y; this.step(m, m.x + m.cvx * dt, m.y + m.cvy * dt);
      if (m.x === ox && m.y === oy) { m.cvx = m.cvy = 0; } m.mv = true; return;
    }
    const busy = now - m.atT < (m.boss ? 750 : 500) || now - m.spT < 1300 || m.chargeEnd > now;
    if (!angry && !busy) {
      let tx = 0, ty = 0; const fleeing = m.animal && m.fleeT > now && !!p;
      if (fleeing) { tx = -dx / Math.max(1, dist); ty = -dy / Math.max(1, dist); }
      else {
        if (!m.wanderT || now > m.wanderT) { m.wanderT = now + 1500 + this.rnd() * 2500; m.dir = Math.floor(this.rnd() * 8); m.idle = this.rnd() < 0.5; }
        if (!m.idle) { tx = Math.sin(m.dir * Math.PI / 4) * 0.35; ty = Math.cos(m.dir * Math.PI / 4) * 0.35; }
      }
      if (tx || ty) {
        const sp = (fleeing ? Math.min(base.speed * 1.4, 84) : base.speed * 1.25) * dt, nx = m.x + tx * sp, ny = m.y + ty * sp, lim = fleeing ? 220 : m.boss ? 60 : 110;
        if (this.free(nx, m.y) && Math.abs(nx - m.hx) < lim) m.x = nx; else if (!fleeing) m.wanderT = 0;
        if (this.free(m.x, ny) && Math.abs(ny - m.hy) < lim * 0.75) m.y = ny; else if (!fleeing) m.wanderT = 0;
        m.dir = dirOf(tx, ty); m.mv = true;
      }
    }
    const ox = m.x, oy = m.y; let want: 'chase' | 'home' | '' = '';
    const homeD = Math.hypot(m.hx - m.x, m.hy - m.y), wanderLim = m.boss ? 60 : 110;
    if (angry && p && !busy && dist < aggro && dist > reach * 0.8 && now - m.hitT > 120) {
      want = 'chase';
      const rush = now - m.hitT < 1600;
      const sp = Math.min(dist - reach * 0.7, (rush ? (m.boss ? Math.min((base.speed + 20) * 1.4, 72) : Math.min((base.speed + 20) * 2.2, 150)) : Math.min((base.speed + 8) * 1.35, 96)) * dt);   // (stops at arm's length, never on top of the player)
      this.step(m, m.x + dx / dist * sp, m.y + dy / dist * sp); m.dir = dirOf(dx, dy); m.mv = true;
    } else if (!busy && ((m.hitT > 0 && !m.animal && dist >= aggro) || (!angry && !(m.animal && m.fleeT > now) && homeD > wanderLim + 30))) {
      // back home: after a chase, or a calm one that strayed (a fleeing animal, a charge) far from its spot
      const bx = m.hx - m.x, by = m.hy - m.y, bd = Math.hypot(bx, by);
      if (bd > 6) { want = 'home'; const sp = base.speed * 0.6 * dt; this.step(m, m.x + bx / bd * sp, m.y + by / bd * sp); m.dir = dirOf(bx, by); m.mv = true; }
    }
    // stuck on a corner (tried for 3 s, went nowhere): a chase is given up; on the way home it is simply back home
    if (want && Math.hypot(m.x - ox, m.y - oy) < 0.3) m.stuck += dt; else m.stuck = 0;
    if (m.stuck > 3) {
      m.stuck = 0;
      if (want === 'chase') { m.hitT = 0; m.tgt = undefined; return; }
      m.x = m.hx; m.y = m.hy; m.hitT = 0; m.tgt = undefined; m.mv = false; return;
    }
    if (!angry || !p) return;
    const who = p.id, sid = m.sid;
    // boss: a blast on the ground where the player stands (everyone inside when it goes off is hit)
    if (m.boss && dist < 200 && now - m.spT > 6500) {
      m.spT = now; m.atT = now + 600; m.dir = dirOf(dx, dy); const cx = p.x, cy = p.y;
      this.ev.fx.push({ sid, k: 'special', x: Math.round(cx), y: Math.round(cy) });
      this.later.push({ at: now + 1100, f: () => { if (!m.alive) return; for (const q of this.lastPlayers) if (q.hp > 0 && Math.hypot((q.x - cx) / 46, (q.y - cy) / 27.6) < 1) this.ev.atk.push({ to: q.id, sid, k: 'special' }); } });
    }
    // boss: kept at a distance, it flares and charges at where the player stood
    if (m.boss && !busy && now - m.spT > 1500 && dist > reach + 40 && dist < 230 && now - m.chT > 5500) {
      m.chT = now; m.chargeEnd = now + 900; m.dir = dirOf(dx, dy); const tx = p.x, ty = p.y;
      this.ev.fx.push({ sid, k: 'charge', x: Math.round(tx), y: Math.round(ty) });
      this.later.push({ at: now + 380, f: () => { if (!m.alive) return; const ax = tx - m.x, ay = ty - m.y, ad = Math.max(1, Math.hypot(ax, ay)), go = Math.max(0, Math.min(ad - reach * 0.6, 150)); m.cvx = ax / ad * go / 0.42; m.cvy = ay / ad * go / 0.42; m.chargeEnd = now + 800; } });
      this.later.push({ at: now + 820, f: () => { m.cvx = m.cvy = 0; const q = this.lastPlayers.find(o => o.id === who); if (m.alive && q && q.hp > 0 && Math.hypot(q.x - m.x, q.y - m.y) < reach + 18) this.ev.atk.push({ to: who, sid, k: 'charge' }); } });
      return;
    }
    // a swing (or a shot) at the one it chases; the hit lands a moment later if they are still in reach
    if (dist <= reach && now - m.last > base.attackCooldown && !(m.chargeEnd > now)) {
      m.last = now; m.atT = now; m.dir = dirOf(dx, dy);
      this.later.push({ at: now + (base.ranged ? 560 : 220), f: () => {
        const q = this.lastPlayers.find(o => o.id === who);
        if (m.alive && q && q.hp > 0 && Math.hypot(q.x - m.x, q.y - m.y) <= reach + (base.ranged ? 80 : 30)) this.ev.atk.push({ to: who, sid, k: base.ranged ? 'shot' : 'hit' });
      } });
    }
  }
  /** the players as of the last beat (for hits that land later) */
  lastPlayers: SimPlayer[] = [];
  run(now: number, players: SimPlayer[]) { this.lastPlayers = players; return this.tick(now, players); }
  rows(now: number): Row[] {
    return [...this.mons.values()].filter(m => m.alive).map(m => [m.sid, m.mob.key, m.mob.kind, m.boss ? 1 : 0, m.elite ? 1 : 0, Math.round(m.x), Math.round(m.y), m.dir, m.mv ? 1 : 0, now - m.atT < 500 && now >= m.atT ? 1 : 0, m.max, Math.max(0, Math.round(m.hp))]);
  }
}
