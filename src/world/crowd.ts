// Other players in the Deepwild (shared server map). Until the game is online these are simulated locally:
// villagers in gathering clothes who walk between trees / rocks and chop, mine or hunt. When online the server
// sends real player positions instead and this class only draws them.
import Phaser from 'phaser';
import { setIdle, playAnim } from './chars';

const NAMES = ['Kaito', 'น้องมิ้น', 'Arden', 'ลุงหมี', 'Vexa', 'พี่ต้น', 'Mira_99', 'ขุดแร่ทั้งวัน', 'Thorn', 'NightOwl', 'แป้งร่ำ', 'Rook',
  'โจ้ไม้', 'Lyra', 'BigAxe', 'ฟ้าใส', 'Grimm', 'มะปราง', 'Soren', 'คนตัดไม้', 'Ivy.x', 'ไข่เจียว', 'Brakk', 'เหมืองเมฆ'];
const TINTS = [0xffffff, 0xffe0c0, 0xd8e8ff, 0xe8ffd8, 0xffd8e8, 0xf0e0ff, 0xfff0b0];
const dirOf = (dx: number, dy: number) => (Math.round((Math.PI / 2 - Math.atan2(dy, dx)) / (Math.PI / 4)) % 8 + 8) % 8;

interface Host { isBlocked(x: number, y: number): boolean; contact(x: number, y: number, w: number, h: number, a?: number): Phaser.GameObjects.Image }
interface Spot { x: number; y: number; kind: 'wood' | 'stone' }
interface P { sp: Phaser.GameObjects.Sprite; sh: Phaser.GameObjects.Image; tag: Phaser.GameObjects.Text; x: number; y: number; tx: number; ty: number; dir: number; work: number; until: number; anim: string; stuck: number }

export class Crowd {
  list: P[] = [];
  constructor(private sc: Phaser.Scene & Host, private spots: () => Spot[], n: number, start: (i: number) => { x: number; y: number }) {
    for (let i = 0; i < n; i++) {
      const p0 = start(i);
      const sp = sc.add.sprite(p0.x, p0.y, 'c_hero_idle', 0).setTint(TINTS[i % TINTS.length]);
      setIdle(sp, 'hero', i % 8);
      const sh = sc.contact(p0.x, p0.y - 1, 22, 8, 0.45);
      const tag = sc.add.text(p0.x, p0.y - 40, NAMES[i % NAMES.length], { fontFamily: 'sans-serif', fontSize: '7px', color: '#bfe8ff', stroke: '#06121a', strokeThickness: 3, resolution: 6 }).setOrigin(0.5).setDepth(99990);
      this.list.push({ sp, sh, tag, x: p0.x, y: p0.y, tx: p0.x, ty: p0.y, dir: i % 8, work: 0, until: 0, anim: '', stuck: 0 });
    }
  }
  /** pick a new job: walk to a tree or rock not too far away */
  plan(p: P, time: number) {
    const all = this.spots(), near = all.filter(s => Math.abs(s.x - p.x) < 420 && Math.abs(s.y - p.y) < 320);
    const pool = near.length ? near : all; if (!pool.length) return;
    const s = pool[Math.floor(Math.random() * pool.length)];
    p.tx = s.x + (Math.random() - 0.5) * 8; p.ty = s.y + 14; p.anim = s.kind === 'wood' ? 'chop' : 'mine'; p.work = 0; p.until = time + 20000;
  }
  update(time: number, dt: number) {
    for (const p of this.list) {
      if (p.work > 0) {                       // working at a node: swing a few times, then move on
        if (time > p.until) { p.work--; p.until = time + 900; if (!playAnim(p.sp, 'hero', p.anim, p.dir, false)) playAnim(p.sp, 'hero', 'attack', p.dir, false); if (p.work === 0) { setIdle(p.sp, 'hero', p.dir); p.until = time + 1500 + Math.random() * 4000; p.tx = NaN; } }
      } else if (Number.isNaN(p.tx)) { if (time > p.until) this.plan(p, time); }
      else {
        const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy);
        if (d < 4 || time > p.until) { p.work = 3 + Math.floor(Math.random() * 4); p.until = time; p.dir = dirOf(0, -1); }
        else {
          const v = 78 * dt / 1000, nx = p.x + dx / d * v, ny = p.y + dy / d * v;
          let moved = false;
          if (!this.sc.isBlocked(nx, p.y)) { p.x = nx; moved = true; }
          if (!this.sc.isBlocked(p.x, ny)) { p.y = ny; moved = true; }
          if (!moved && ++p.stuck > 30) { p.stuck = 0; p.tx = NaN; p.until = time + 500; setIdle(p.sp, 'hero', p.dir); continue; }
          p.dir = dirOf(dx, dy); playAnim(p.sp, 'hero', 'walk', p.dir);
        }
      }
      p.sp.setPosition(p.x, p.y).setDepth(p.y); p.sh.setPosition(p.x, p.y - 1); p.tag.setPosition(p.x, p.y - 40);
    }
  }
}
