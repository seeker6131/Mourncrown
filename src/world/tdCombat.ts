// Monsters, combat, loot and stage flow for the top-down world.
import Phaser from 'phaser';
import { MONSTERS } from '../data/monsters';
import { RARITY_COLORS, RARITY_NAMES, itemDef } from '../data/items';
import { S } from '../core/events';
import { saveGame } from '../core/save';
import { derive, gainExp, calcDamage } from '../systems/stats';
import { addItem } from '../systems/inventory';
import { pickBase, rollRarity, makeGear } from '../systems/loot';
import { CH, playAnim, setIdle, hasAnim } from './chars';
import { STAGES, scaleStats, type Stage, type StageMon } from './stages';

export interface Mon {
  sp: Phaser.GameObjects.Sprite; m: StageMon; hp: number; max: number; atk: number; def: number; exp: number; gold: [number, number];
  x: number; y: number; hx: number; hy: number; dir: number; last: number; alive: boolean; bar: Phaser.GameObjects.Graphics; boss: boolean; hitT: number; atkT: number;
}

export interface Host extends Phaser.Scene {
  hero: Phaser.GameObjects.Sprite; dir: number; isBlocked(x: number, y: number): boolean; surfAt(x: number, y: number): string;
  burst(sp: Phaser.GameObjects.Sprite, soul: number): void; heroDie(): void; dead: boolean;
}

const dirOf = (dx: number, dy: number) => (Math.round((Math.PI / 2 - Math.atan2(dy, dx)) / (Math.PI / 4)) % 8 + 8) % 8;
const RANGED = new Set(['hr4', 'hr5', 'hr6', 'hr7', 'hr8', 'hr9']);

export class Combat {
  mons: Mon[] = [];
  stage: Stage | null = null;
  cleared = false;
  constructor(public s: Host) {}

  spawnStage(n: number, spots: [number, number][]) {
    const st = STAGES[n - 1]; this.stage = st;
    const list: StageMon[] = [];
    for (let i = 0; i < st.count; i++) list.push(st.land.mobs[(i + n) % st.land.mobs.length]);
    if (st.boss) list.push(st.land.boss);
    list.forEach((m, i) => { const p = spots[i % spots.length]; this.spawn(m, p[0] + (i % 3) * 14, p[1] + Math.floor(i / spots.length) * 18, m === st.land.boss); });
  }

  spawn(m: StageMon, x: number, y: number, boss: boolean) {
    const base = MONSTERS[m.kind]; const st = scaleStats(base, this.stage!.level, boss);
    const sc = this.s;
    let sp: Phaser.GameObjects.Sprite;
    if (CH[m.key]) { sp = sc.add.sprite(x, y, `c_${m.key}_idle`); setIdle(sp, m.key, 0); }
    else { sp = sc.add.sprite(x, y, '__DEFAULT').setVisible(false); }
    const ph = CH[m.key] ? null : sc.add.ellipse(x, y - m.size * 0.3, m.size * 0.6, m.size * 0.5, 0x5a2a3a).setStrokeStyle(1, 0x140a10);
    if (ph) sp.setData('ph', ph);
    const bar = sc.add.graphics().setDepth(99960);
    this.mons.push({ sp, m, hp: st.hp, max: st.hp, atk: st.atk, def: st.def, exp: st.exp, gold: st.gold, x, y, hx: x, hy: y, dir: 0, last: 0, alive: true, bar, boss, hitT: 0, atkT: 0 });
  }

  /** hero swing: hit monsters in front (melee) or the nearest in sight (ranged forms) */
  heroAttack(formKey: string) {
    const h = this.s.hero, d = derive(S()), ranged = RANGED.has(formKey);
    const fx = Math.sin(this.s.dir * Math.PI / 4), fy = Math.cos(this.s.dir * Math.PI / 4);
    const targets = this.mons.filter(m => m.alive).filter(m => {
      const dx = m.x - h.x, dy = m.y - h.y, dist = Math.hypot(dx, dy);
      if (ranged) return dist < 150;
      const reach = 30 + m.m.size * 0.25;
      return dist < reach && (dx * fx + dy * fy) > -6;
    }).sort((a, b) => Math.hypot(a.x - h.x, a.y - h.y) - Math.hypot(b.x - h.x, b.y - h.y));
    const hits = ranged ? targets.slice(0, 1) : targets.slice(0, 3);
    this.s.time.delayedCall(ranged ? 260 : 150, () => {
      for (const m of hits) {
        if (!m.alive) continue;
        if (ranged) this.bolt(h.x, h.y - 18, m, formKey.startsWith('hr4') || formKey === 'hr5' || formKey === 'hr6' ? 0xe8d8a0 : 0x9ad8ff);
        const r = calcDamage(ranged ? Math.max(d.atk, d.matk) : d.atk, m.def, 1, d.crit);
        this.s.time.delayedCall(ranged ? 160 : 0, () => this.hurtMon(m, r.dmg, r.crit));
      }
    });
  }

  bolt(x: number, y: number, m: Mon, col: number) {
    const b = this.s.add.circle(x, y, 2.5, col).setDepth(99950).setBlendMode(Phaser.BlendModes.ADD);
    this.s.tweens.add({ targets: b, x: m.x, y: m.y - m.m.size * 0.35, duration: 160, onComplete: () => b.destroy() });
  }

  hurtMon(m: Mon, dmg: number, crit: boolean) {
    if (!m.alive) return;
    m.hp -= dmg; m.hitT = this.s.time.now;
    this.float(m.x, m.y - m.m.size * 0.7, `${dmg}`, crit ? '#ffd24a' : '#ffffff', crit ? 12 : 9);
    m.sp.setTintFill(0xffffff); this.s.time.delayedCall(60, () => m.sp.clearTint());
    const h = this.s.hero, a = Math.atan2(m.y - h.y, m.x - h.x), kb = m.boss ? 1 : 6;
    m.x += Math.cos(a) * kb; m.y += Math.sin(a) * kb;
    if (m.hp <= 0) this.kill(m);
  }

  kill(m: Mon) {
    m.alive = false; m.bar.clear();
    const ph = m.sp.getData('ph') as Phaser.GameObjects.Ellipse | undefined;
    if (ph) { this.s.tweens.add({ targets: ph, alpha: 0, scale: 1.4, duration: 300, onComplete: () => ph.destroy() }); }
    else this.s.burst(m.sp, m.boss ? 0xffd27a : 0xbfe8ff);
    m.sp.setVisible(false);
    const s = S(), st = this.stage!, d = derive(s);
    const g = Phaser.Math.Between(m.gold[0], m.gold[1]); s.gold += g;
    const lv = gainExp(s, m.exp * d.expBonus);
    this.float(m.x, m.y - 20, `+${Math.round(m.exp * d.expBonus)} EXP  +${g}G`, '#bfffb0', 8);
    if (lv > 0) this.float(this.s.hero.x, this.s.hero.y - 50, `LEVEL UP! Lv ${s.level}`, '#ffd24a', 14);
    // loot: rarity floor and magic find grow with the stage
    const drops = m.boss ? 3 : Math.random() < 0.16 + st.n * 0.002 ? 1 : 0;
    for (let i = 0; i < drops; i++) {
      const base = pickBase(Math.random, st.level), rar = rollRarity(Math.random, st.mf + d.mf, m.boss ? Math.max(st.minRar, 2) : st.minRar);
      if (addItem(s, base.id, 1, 0, makeGear(Math.random, base.id, rar)))
        this.float(m.x, m.y - 34 - i * 12, `${RARITY_NAMES[rar]} ${itemDef(base.id).name}`, '#' + RARITY_COLORS[rar].toString(16).padStart(6, '0'), 9);
    }
    saveGame(s);
    if (this.mons.every(q => !q.alive) && !this.cleared) {
      this.cleared = true;
      const sv = s as unknown as { tdCleared?: number };
      sv.tdCleared = Math.max(sv.tdCleared ?? 0, st.n); saveGame(s);
      this.s.events.emit('stageCleared', st.n);
    }
  }

  float(x: number, y: number, t: string, col: string, size: number) {
    const z = this.s.cameras.main.zoom;
    const tx = this.s.add.text(x, y, t, { fontFamily: 'sans-serif', fontSize: size + 'px', color: col, stroke: '#0b0f0c', strokeThickness: 3, resolution: Math.max(2, z * 2) }).setOrigin(0.5).setDepth(99999);
    this.s.tweens.add({ targets: tx, y: y - 18, alpha: 0, duration: 1100, ease: 'Quad.easeOut', onComplete: () => tx.destroy() });
  }

  update(time: number, dt: number) {
    const h = this.s.hero, s = S(), d = derive(s);
    for (const m of this.mons) {
      if (!m.alive) continue;
      const dx = h.x - m.x, dy = h.y - m.y, dist = Math.hypot(dx, dy);
      const base = MONSTERS[m.m.kind], aggro = m.boss ? 260 : 130, reach = base.attackRange + m.m.size * 0.2;
      let moving = false;
      if (!this.s.dead && dist < aggro && dist > reach * 0.8 && time - m.hitT > 180) {
        const sp = (base.speed + 8) * dt / 1000, nx = m.x + dx / dist * sp, ny = m.y + dy / dist * sp;
        if (!this.s.isBlocked(nx, m.y)) m.x = nx;
        if (!this.s.isBlocked(m.x, ny)) m.y = ny;
        m.dir = dirOf(dx, dy); moving = true;
      } else if (dist >= aggro) {
        const bx = m.hx - m.x, by = m.hy - m.y, bd = Math.hypot(bx, by);
        if (bd > 6) { const sp = base.speed * 0.5 * dt / 1000; m.x += bx / bd * sp; m.y += by / bd * sp; m.dir = dirOf(bx, by); moving = true; }
      }
      if (!this.s.dead && dist <= reach && time - m.last > base.attackCooldown) {
        m.last = time; m.atkT = time; m.dir = dirOf(dx, dy);
        if (CH[m.m.key] && hasAnim(m.m.key, 'attack')) playAnim(m.sp, m.m.key, 'attack', m.dir, false);
        this.s.time.delayedCall(220, () => {
          if (!m.alive || this.s.dead || Math.hypot(h.x - m.x, h.y - m.y) > reach + 8) return;
          const r = calcDamage(m.atk, d.def, 1, 0.05, Math.random, d.evade);
          s.hp = Math.max(0, s.hp - r.dmg);
          this.float(h.x, h.y - 40, r.miss ? 'MISS' : `-${r.dmg}`, r.miss ? '#cfcfcf' : '#ff6a5a', 10);
          if (!r.miss) { h.setTintFill(0xff8080); this.s.time.delayedCall(70, () => h.clearTint()); this.s.cameras.main.shake(90, 0.003); }
          if (s.hp <= 0) this.s.heroDie();
        });
      }
      if (CH[m.m.key]) {
        const attacking = time - m.atkT < 600;
        if (!attacking) { if (moving) playAnim(m.sp, m.m.key, 'walk', m.dir); else if (m.sp.anims.isPlaying) setIdle(m.sp, m.m.key, m.dir); }
      }
      m.sp.setPosition(m.x, m.y).setDepth(m.y);
      const ph = m.sp.getData('ph') as Phaser.GameObjects.Ellipse | undefined;
      if (ph) ph.setPosition(m.x, m.y - m.m.size * 0.3).setDepth(m.y);
      const w = m.boss ? 60 : 22, top = m.y - m.m.size * (m.boss ? 0.95 : 0.85);
      m.bar.clear().fillStyle(0x0b0f0c, 0.8).fillRect(m.x - w / 2 - 1, top - 1, w + 2, 4).fillStyle(m.boss ? 0xff4a3a : 0xd84a3a, 1).fillRect(m.x - w / 2, top, w * Math.max(0, m.hp / m.max), 2);
    }
  }
}
