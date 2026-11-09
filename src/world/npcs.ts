// Village life: NPCs with daily routines. They leave their house (fade in at the door), walk real paths (A* on the
// collision grid) to their workplace or out to the woods, work there for a while (playing their work/attack animation),
// walk back and go inside (fade out at the door), rest, and repeat. Animals wander near home.
import Phaser from 'phaser';
import { CH, playAnim, setIdle, hasAnim } from './chars';

export interface Pt { x: number; y: number }
interface Step { kind: 'go' | 'work' | 'inside' | 'wander'; to?: Pt; ms?: number; label?: string }
interface Npc { key: string; name: string; sp: Phaser.GameObjects.Sprite; shadow: Phaser.GameObjects.Ellipse; tag: Phaser.GameObjects.Text;
  plan: Step[]; i: number; path: Pt[]; until: number; dir: number; speed: number; home: Pt; hidden: boolean; anim: string }

export interface NpcHost extends Phaser.Scene { isBlocked(x: number, y: number): boolean }

const dirOf = (dx: number, dy: number) => (Math.round((Math.PI / 2 - Math.atan2(dy, dx)) / (Math.PI / 4)) % 8 + 8) % 8;

export class Village {
  npcs: Npc[] = [];
  constructor(public s: NpcHost, public W: number, public H: number) {}

  /** A* on an 8px grid over the scene's collision map */
  path(a: Pt, b: Pt): Pt[] {
    const G = 8, gw = Math.ceil(this.W / G), gh = Math.ceil(this.H / G);
    const free = (i: number, j: number) => i >= 0 && j >= 0 && i < gw && j < gh && !this.s.isBlocked(i * G + 4, j * G + 4);
    const si = Math.floor(a.x / G), sj = Math.floor(a.y / G), ti = Math.floor(b.x / G), tj = Math.floor(b.y / G);
    const key = (i: number, j: number) => j * gw + i;
    const open: [number, number, number][] = [[0, si, sj]], g = new Map<number, number>([[key(si, sj), 0]]), from = new Map<number, number>();
    let found = false, n = 0;
    while (open.length && n++ < 6000) {
      open.sort((p, q) => p[0] - q[0]); const [, i, j] = open.shift()!;
      if (Math.abs(i - ti) <= 1 && Math.abs(j - tj) <= 1) { from.set(key(ti, tj), key(i, j)); found = true; break; }
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const ni = i + di, nj = j + dj;
        if (!free(ni, nj) || (di && dj && (!free(i + di, j) || !free(i, j + dj)))) continue;
        const ng = g.get(key(i, j))! + (di && dj ? 1.414 : 1);
        if (ng < (g.get(key(ni, nj)) ?? 1e9)) { g.set(key(ni, nj), ng); from.set(key(ni, nj), key(i, j)); open.push([ng + Math.hypot(ti - ni, tj - nj), ni, nj]); }
      }
    }
    if (!found) return [b];
    const out: Pt[] = []; let k = key(ti, tj);
    while (k !== key(si, sj) && from.has(k)) { out.push({ x: (k % gw) * G + 4, y: Math.floor(k / gw) * G + 4 }); k = from.get(k)!; }
    out.reverse(); out.push(b);
    return out.filter((_, idx) => idx % 2 === 1 || idx === out.length - 1);   // thin the path a little
  }

  add(key: string, name: string, home: Pt, plan: Step[], speed = 26) {
    if (!CH[key]) return;
    const sc = this.s;
    const sp = sc.add.sprite(home.x, home.y, `c_${key}_idle`).setAlpha(0); setIdle(sp, key, 0);
    const shadow = sc.add.ellipse(home.x, home.y, 14, 5, 0x0a1008, 0.4).setDepth(1).setAlpha(0);
    const tag = sc.add.text(home.x, home.y, name, { fontFamily: 'sans-serif', fontSize: '6px', color: '#e8e0c8', stroke: '#0b0f0c', strokeThickness: 2, resolution: 8 }).setOrigin(0.5, 1).setDepth(99990).setAlpha(0);
    this.npcs.push({ key, name, sp, shadow, tag, plan, i: -1, path: [], until: sc.time.now + Math.random() * 3000, dir: 0, speed, home, hidden: true, anim: hasAnim(key, 'attack') ? 'attack' : 'walk' });
  }

  next(n: Npc, now: number) {
    n.i = (n.i + 1) % n.plan.length;
    const st = n.plan[n.i];
    if (st.kind === 'go' && st.to) { n.path = this.path({ x: n.sp.x, y: n.sp.y }, st.to); if (n.hidden) this.show(n, true); }
    else if (st.kind === 'work') { n.until = now + (st.ms ?? 5000); playAnim(n.sp, n.key, n.anim, n.dir, false); n.sp.on('animationcomplete', () => { if (n.plan[n.i]?.kind === 'work') n.sp.play(n.sp.anims.currentAnim!.key); }); }
    else if (st.kind === 'inside') { this.show(n, false); n.until = now + (st.ms ?? 6000); }
    else if (st.kind === 'wander') { const a = Math.random() * Math.PI * 2, r = 20 + Math.random() * 40; n.path = this.path({ x: n.sp.x, y: n.sp.y }, { x: n.home.x + Math.cos(a) * r, y: n.home.y + Math.sin(a) * r * 0.6 }); }
  }

  show(n: Npc, on: boolean) {
    n.hidden = !on;
    if (on) n.sp.setPosition(n.home.x, n.home.y);
    this.s.tweens.add({ targets: [n.sp, n.shadow, n.tag], alpha: on ? 1 : 0, duration: 450 });
  }

  update(now: number, dt: number) {
    for (const n of this.npcs) {
      const st = n.plan[n.i];
      if (n.i < 0) { if (now > n.until) this.next(n, now); continue; }
      if ((st.kind === 'go' || st.kind === 'wander') ) {
        const p = n.path[0];
        if (!p) { n.sp.off('animationcomplete'); setIdle(n.sp, n.key, n.dir); this.next(n, now); }
        else {
          const dx = p.x - n.sp.x, dy = p.y - n.sp.y, d = Math.hypot(dx, dy), sp = n.speed * dt / 1000;
          if (d <= sp) { n.sp.setPosition(p.x, p.y); n.path.shift(); }
          else { n.sp.x += dx / d * sp; n.sp.y += dy / d * sp; n.dir = dirOf(dx, dy); playAnim(n.sp, n.key, 'walk', n.dir); }
        }
      } else if (now > n.until) { n.sp.off('animationcomplete'); setIdle(n.sp, n.key, n.dir); this.next(n, now); }
      n.sp.setDepth(n.sp.y); n.shadow.setPosition(n.sp.x, n.sp.y - 1); n.tag.setPosition(n.sp.x, n.sp.y - 40);
    }
  }
}
