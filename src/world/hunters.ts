// Test: bot players on a monster map (until the game is online). Heroes of every class walk to monsters and fight them,
// so the player can see what a crowded map feels like: monsters get taken, the screen gets busy, the frame rate drops.
// Their kills give the player nothing (Combat.botKill); they never touch bosses or the bounty lord.
import Phaser from 'phaser';
import { CH, playAnim, setIdle, hitMs } from './chars';
import { pxShadow } from './pxShadow';
import { fx2 } from './fx2';
import type { Combat } from './tdCombat';

const NAMES = ['Kaito', 'น้องมิ้น', 'Arden', 'ลุงหมี', 'Vexa', 'พี่ต้น', 'Mira_99', 'Thorn', 'NightOwl', 'แป้งร่ำ', 'Rook', 'Lyra', 'BigAxe', 'ฟ้าใส',
  'Grimm', 'มะปราง', 'Soren', 'Ivy.x', 'ไข่เจียว', 'Brakk', 'ShadowKing', 'หมูกรอบ', 'Zed99', 'ลูกพีช', 'Astra', 'ต้นกล้า', 'Kuro', 'มีนา', 'Riven', 'โอ๊ต'];
const FORMS = ['hr1', 'hr2', 'hr3', 'hr4', 'hr5', 'hr6', 'hr7', 'hr8', 'hr9', 'hr10', 'hr11', 'hr12', 'hero', 'heroF'];
const RANGED = new Set(['hr4', 'hr5', 'hr6', 'hr7', 'hr8', 'hr9']);
const dirOf = (dx: number, dy: number) => (Math.round((Math.PI / 2 - Math.atan2(dy, dx)) / (Math.PI / 4)) % 8 + 8) % 8;
interface Host extends Phaser.Scene { canStand(x: number, y: number): boolean }
interface B { key: string; sp: Phaser.GameObjects.Sprite; sh: Phaser.GameObjects.Image; tag: Phaser.GameObjects.Text; x: number; y: number; dir: number; last: number; busy: boolean; ranged: boolean; wander?: { x: number; y: number } }

export class Hunters {
  list: B[] = [];
  constructor(private sc: Host, private combat: Combat, n: number, spot: () => { x: number; y: number }) {
    const forms = FORMS.filter(k => CH[k]);
    for (let i = 0; i < n; i++) {
      const p = spot(), key = forms[i % forms.length], sp = sc.add.sprite(p.x, p.y, `c_${key}_idle`).setDepth(p.y); setIdle(sp, key, i % 8);
      const tag = sc.add.text(p.x, p.y - 40, NAMES[i % NAMES.length] + (i >= NAMES.length ? String(i) : ''), { fontFamily: 'sans-serif', fontSize: '6px', color: '#bfe8ff', stroke: '#06121a', strokeThickness: 2, resolution: 6 }).setOrigin(0.5).setDepth(99990);
      this.list.push({ key, sp, sh: pxShadow(sc, p.x, p.y, 22, 8, 0.45), tag, x: p.x, y: p.y, dir: i % 8, last: 0, busy: false, ranged: RANGED.has(key) });
    }
  }
  destroy() { for (const b of this.list) { b.sp.destroy(); b.sh.destroy(); b.tag.destroy(); } this.list = []; }
  update(time: number, dt: number) {
    const mons = this.combat.mons.filter(m => m.alive && !m.boss && !m.bounty && !m.animal);
    for (const b of this.list) {
      // the nearest monster that is not too far; otherwise stroll somewhere
      let t: (typeof mons)[number] | undefined, best = 520;
      for (const m of mons) { const d = Math.hypot(m.x - b.x, m.y - b.y); if (d < best) { best = d; t = m; } }
      const reach = b.ranged ? 120 : 28;
      const tx = t ? t.x : (b.wander ??= { x: b.x + (Math.random() - 0.5) * 300, y: b.y + (Math.random() - 0.5) * 200 }).x, ty = t ? t.y : b.wander!.y;
      const dx = tx - b.x, dy = ty - b.y, dist = Math.hypot(dx, dy);
      if (!b.busy && dist > (t ? reach : 6)) {
        const sp = 84 * dt / 1000, a0 = Math.atan2(dy, dx);
        let moved = false;
        for (const da of [0, 0.6, -0.6, 1.2, -1.2]) { const nx = b.x + Math.cos(a0 + da) * sp, ny = b.y + Math.sin(a0 + da) * sp; if (this.sc.canStand(nx, ny)) { b.x = nx; b.y = ny; moved = true; break; } }
        if (!moved) b.wander = undefined;
        b.dir = dirOf(dx, dy); playAnim(b.sp, b.key, 'walk', b.dir);
      } else if (!t) { b.wander = undefined; if (!b.busy) setIdle(b.sp, b.key, b.dir); }
      else if (!b.busy && time - b.last > 900 + Math.random() * 500) {
        b.last = time; b.busy = true; b.dir = dirOf(dx, dy); playAnim(b.sp, b.key, 'attack', b.dir, false);
        const m = t;
        this.sc.time.delayedCall(hitMs(b.key, 'attack', 250), () => {
          const hit = () => { if (!m.alive) return; fx2(this.sc, b.ranged ? 'fx_hit_arrow' : 'fx_hit_sword', m.x, m.y - m.m.size * 0.4, 99950, 0.7); m.hp -= m.max * (0.12 + Math.random() * 0.1); m.sp.setTintFill(0xffffff); this.sc.time.delayedCall(50, () => m.sp.clearTint()); if (m.hp <= 0) this.combat.botKill(m); };
          if (b.ranged) this.combat.vfx.bolt(b.x, b.y - 18, m.x, m.y - m.m.size * 0.35, 0xffe8a0, 0.9, 800, hit, true); else hit();
        });
        this.sc.time.delayedCall(650, () => { b.busy = false; });
      }
      b.sp.setPosition(b.x, b.y).setDepth(b.y); b.sh.setPosition(b.x, b.y); b.tag.setPosition(b.x, b.y - 40);
    }
  }
}
