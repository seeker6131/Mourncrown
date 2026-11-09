// Village life: NPCs with daily routines. They leave their house (fade in at the door), walk real paths (A* on the
// collision grid) to their workplace or out to the woods, work there for a while (playing their work/attack animation),
// walk back and go inside (fade out at the door), rest, and repeat. Animals wander near home.
import Phaser from 'phaser';
import { CH, playAnim, setIdle, hasAnim } from './chars';

export interface Pt { x: number; y: number }
export interface Step { kind: 'go' | 'work' | 'inside' | 'wander'; to?: Pt; ms?: number; face?: number }
interface Npc { key: string; name: string; sp: Phaser.GameObjects.Sprite; shadow: Phaser.GameObjects.Image; tag: Phaser.GameObjects.Text;
  plan: Step[]; i: number; path: Pt[]; until: number; dir: number; speed: number; home: Pt; back: Pt; hidden: boolean; anim: string; bob?: Phaser.Tweens.Tween }

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

  /** nearest walkable point to p (so routine targets never sit inside a building footprint) */
  free(p: Pt): Pt {
    if (!this.s.isBlocked(p.x, p.y)) return p;
    for (let r = 4; r < 80; r += 4) for (let a = 0; a < 16; a++) {
      const x = p.x + Math.cos(a * Math.PI / 8) * r, y = p.y + Math.sin(a * Math.PI / 8) * r;
      if (!this.s.isBlocked(x, y)) return { x: Math.round(x), y: Math.round(y) };
    }
    return p;
  }

  add(key: string, name: string, home: Pt, plan: Step[], speed = 26, visible = false) {
    if (!CH[key]) return;
    home = this.free(home);
    plan = plan.map(st => st.to ? { ...st, to: this.free(st.to) } : st);
    const sc = this.s;
    const a0 = visible ? 1 : 0;
    const sp = sc.add.sprite(home.x, home.y, `c_${key}_idle`).setAlpha(a0).setDepth(home.y); setIdle(sp, key, 0);
    const fw = (CH[key]?.idleFs ?? 48) * 0.5;
    const shadow = sc.add.image(home.x, home.y, sc.textures.exists('td_shadow') ? 'td_shadow' : '__WHITE').setDisplaySize(fw, fw * 0.34).setDepth(1).setAlpha(a0 * 0.5);
    const tag = sc.add.text(home.x, home.y, name, { fontFamily: 'sans-serif', fontSize: '6px', color: '#e8e0c8', stroke: '#0b0f0c', strokeThickness: 2, resolution: 8 }).setOrigin(0.5, 1).setDepth(99990).setAlpha(a0 * 0.85);
    this.npcs.push({ key, name, sp, shadow, tag, plan, i: -1, path: [], until: sc.time.now + Math.random() * 3000, dir: 0, speed, home, back: home, hidden: !visible, anim: hasAnim(key, 'chop') ? 'chop' : hasAnim(key, 'mine') ? 'mine' : hasAnim(key, 'attack') ? 'attack' : 'walk' });
  }

  next(n: Npc, now: number) {
    n.i = (n.i + 1) % n.plan.length;
    const st = n.plan[n.i];
    if (st.kind === 'go' && st.to) { n.path = this.path({ x: n.sp.x, y: n.sp.y }, st.to); if (n.hidden) this.show(n, true); }
    else if (st.kind === 'work') {
      n.until = now + (st.ms ?? 5000);
      if (st.face !== undefined) n.dir = st.face;
      if (n.anim !== 'walk') { playAnim(n.sp, n.key, n.anim, n.dir, false); n.sp.on('animationcomplete', () => { if (n.plan[n.i]?.kind === 'work') n.sp.play(n.sp.anims.currentAnim!.key); }); }
      else {   // no work animation: stand facing the job and bob as if busy, glancing around now and then
        setIdle(n.sp, n.key, n.dir);
        n.bob = this.s.tweens.add({ targets: n.sp, scaleY: 0.94, duration: 260, yoyo: true, repeat: -1, repeatDelay: 500 + Math.random() * 900,
          onRepeat: () => { if (Math.random() < 0.25) setIdle(n.sp, n.key, (n.dir + (Math.random() < 0.5 ? 1 : 7)) % 8); } });
      }
    }
    else if (st.kind === 'inside') { this.show(n, false); n.until = now + (st.ms ?? 6000); }
    else if (st.kind === 'wander') { const a = Math.random() * Math.PI * 2, r = 20 + Math.random() * 40; n.path = this.path({ x: n.sp.x, y: n.sp.y }, this.free({ x: n.home.x + Math.cos(a) * r, y: n.home.y + Math.sin(a) * r * 0.6 })); }
  }

  show(n: Npc, on: boolean) {
    n.hidden = !on;
    if (on) n.sp.setPosition(n.back.x, n.back.y);      // reappear where they went in (their door, or the edge of the map)
    else n.back = { x: n.sp.x, y: n.sp.y };
    this.s.tweens.add({ targets: n.sp, alpha: on ? 1 : 0, duration: 450 }); this.s.tweens.add({ targets: n.shadow, alpha: on ? 0.5 : 0, duration: 450 });
    this.s.tweens.add({ targets: n.tag, alpha: on ? 0.85 : 0, duration: 450 });
  }

  update(now: number, dt: number) {
    for (const n of this.npcs) {
      const st = n.plan[n.i];
      if (n.i < 0) { if (now > n.until) this.next(n, now); continue; }
      if ((st.kind === 'go' || st.kind === 'wander') ) {
        const p = n.path[0];
        if (!p) { n.sp.off('animationcomplete'); setIdle(n.sp, n.key, n.dir); this.next(n, now); }
        else {
          const dx = p.x - n.sp.x, dy = p.y - n.sp.y, d = Math.hypot(dx, dy), sp = n.speed * 1.3 * dt / 1000;
          if (d <= sp) { n.sp.setPosition(p.x, p.y); n.path.shift(); }
          else { n.sp.x += dx / d * sp; n.sp.y += dy / d * sp; n.dir = dirOf(dx, dy); playAnim(n.sp, n.key, 'walk', n.dir); }
        }
      } else if (now > n.until) { n.sp.off('animationcomplete'); n.bob?.remove(); n.bob = undefined; n.sp.setScale(1); setIdle(n.sp, n.key, n.dir); this.next(n, now); }
      n.sp.setDepth(n.sp.y); n.shadow.setPosition(n.sp.x, n.sp.y - 1); n.tag.setPosition(n.sp.x, n.sp.y - n.sp.displayHeight * n.sp.originY - 2);
    }
  }
}

/** The village's daily life. Positions match the building layout in TopDownScene.placeProps (door = building foot). */
export function populateVillage(v: Village, roadY: (x: number) => number) {
  const go = (x: number, y: number): Step => ({ kind: 'go', to: { x, y } });
  const work = (ms: number, face?: number): Step => ({ kind: 'work', ms, face });
  const inside = (ms: number): Step => ({ kind: 'inside', ms });
  const N = 4, S = 0, E = 2, W = 6;
  const door = { townhall: { x: 345, y: 336 }, tavern: { x: 702, y: 336 }, house1: { x: 846, y: 314 }, house0: { x: 1090, y: 344 },
    house2: { x: 1180, y: 774 }, kitchen: { x: 1100, y: 614 }, lumber: { x: 150, y: 344 }, barn: { x: 300, y: 674 } };
  // blacksmith: home → forge, hammering → home
  // shopkeepers stay at their posts so the player never has to chase them (they only turn around now and then)
  v.add('np3', 'ช่างเหล็ก', { x: 722, y: 690 }, [go(722, 690), work(600000, S)], 26, true);
  // elder: stands before the town hall, strolls to the plaza, back
  v.add('np1', 'ผู้เฒ่า', { x: 372, y: 360 }, [go(372, 360), work(600000, S)], 16, true);
  // merchant: minds the market stalls
  v.add('np2', 'พ่อค้า', { x: 600, y: 540 }, [go(600, 540), work(600000, S)], 26, true);
  // lumberjack: chops at the western woods, carries logs to the lumber yard
  v.add('np4', 'คนตัดไม้', door.lumber, [go(70, 250), work(9000, W), go(250, 366), work(4000, N), go(door.lumber.x, door.lumber.y), inside(6000)]);
  // miner: off to the rocks in the south-east
  v.add('np5', 'คนขุดแร่', door.house2, [go(1235, 560), work(10000, E), go(door.house2.x, door.house2.y), inside(8000)]);
  // cook: kitchen yard, fetches water at the well
  v.add('np6', 'แม่ครัว', door.kitchen, [go(1070, 628), work(9000, S), go(596, 334), work(4000, N), go(door.kitchen.x, door.kitchen.y), inside(7000)]);
  // barmaid: in front of the tavern, serving at the plaza
  v.add('np7', 'สาวโรงเตี๊ยม', door.tavern, [go(680, 350), work(8000, S), go(560, 430), work(5000, W), go(door.tavern.x, door.tavern.y), inside(6000)]);
  // guard: patrols plaza ↔ bridge, never goes home
  v.add('np8', 'ยาม', { x: 520, y: 320 }, [go(520, 320), work(5000, S), go(880, roadY(880)), work(5000, E), go(620, roadY(620)), work(3000, S)], 22, true);
  // kid: runs laps around the plaza
  v.add('np9', 'เด็ก', { x: 520, y: 470 }, [0, 1, 2, 3, 4, 5].map(a => go(520 + Math.cos(a * Math.PI / 3) * 70, 410 + Math.sin(a * Math.PI / 3) * 55)).concat([work(3000)]), 44, true);
  // elf: leaves west to hunt, comes back hours later
  v.add('np10', 'เอลฟ์', door.house2, [go(14, roadY(14)), inside(25000), go(door.house2.x, door.house2.y), inside(9000)], 30);
  // animals wander near home and rest
  const wander = (ms: number): Step[] => [{ kind: 'wander' }, work(ms), { kind: 'wander' }, work(ms * 1.5)];
  v.add('an1', 'แมว', { x: 660, y: 352 }, wander(4000), 18, true);
  v.add('an2', 'แกะ', { x: 250, y: 700 }, wander(6000), 10, true);
  v.add('an3', 'วัว', { x: 350, y: 704 }, wander(8000), 8, true);
  v.add('an4', 'หมู', { x: 270, y: 724 }, wander(5000), 10, true);
  v.add('an5', 'ไก่', { x: 380, y: 690 }, wander(2500), 14, true);
}
