// Monsters, combat, loot and stage flow for the top-down world.
import Phaser from 'phaser';
import { MONSTERS } from '../data/monsters';
import { RARITY_COLORS, RARITY_NAMES, itemDef } from '../data/items';
import { S, bus, EV } from '../core/events';
import { saveGame } from '../core/save';
import { derive, gainExp, calcDamage } from '../systems/stats';
import { addItem } from '../systems/inventory';
import { applyKill } from '../systems/rewards';
import { selfEffect, skillHit } from '../systems/skillCast';
import type { SkillDef } from '../data/skills';
import { CH, playAnim, setIdle, hasAnim } from './chars';
import { STAGES, scaleStats, type Stage, type StageMon } from './stages';

export interface Mon {
  sp: Phaser.GameObjects.Sprite; m: StageMon; hp: number; max: number; atk: number; def: number; exp: number; gold: [number, number];
  x: number; y: number; hx: number; hy: number; dir: number; last: number; alive: boolean; bar: Phaser.GameObjects.Graphics; boss: boolean; hitT: number; atkT: number; spT?: number; animal?: boolean; wanderT?: number;
}

export interface Host extends Phaser.Scene {
  hero: Phaser.GameObjects.Sprite; dir: number; isBlocked(x: number, y: number): boolean; surfAt(x: number, y: number): string;
  burst(sp: Phaser.GameObjects.Sprite, soul: number): void; heroDie(): void; dead: boolean; stageN: number;
}

const dirOf = (dx: number, dy: number) => (Math.round((Math.PI / 2 - Math.atan2(dy, dx)) / (Math.PI / 4)) % 8 + 8) % 8;
/** wild game that wanders every map (meat and hides) */
const GAME: StageMon[] = [{ key: 'mo16', kind: 'deer', name: 'กวางป่า', size: 48 }, { key: 'mo17', kind: 'boar', name: 'หมูป่า', size: 48 }];
const RANGED = new Set(['hr4', 'hr5', 'hr6', 'hr7', 'hr8', 'hr9']);
const MAGIC = new Set(['hr7', 'hr8', 'hr9']);
/** damage number styles: physical / physical crit / magic / magic crit */
const DMG = {
  phys: { col: '#ffffff', stroke: '#2a1a10', size: 10 },
  physCrit: { col: '#ffcf3a', stroke: '#5a1a00', size: 16 },
  magic: { col: '#8fe8ff', stroke: '#06203a', size: 10 },
  magicCrit: { col: '#ff7aff', stroke: '#2a0640', size: 16 },
};

export class Combat {
  mons: Mon[] = [];
  stage: Stage | null = null;
  constructor(public s: Host) {}

  /** where a respawning monster may appear (set by the scene: a free spot away from the hero and the gate) */
  pickSpot: (() => { x: number; y: number }) | null = null;
  bossSpot: { x: number; y: number } | null = null;
  /** Farming map: lots of monsters spread over the map; every kill respawns after a while, the boss every 5 minutes. */
  spawnMap(n: number, pick: () => { x: number; y: number }, bossSpot: { x: number; y: number } | null) {
    const st = STAGES[n - 1]; this.stage = st; this.pickSpot = pick; this.bossSpot = bossSpot;
    for (let i = 0; i < st.count; i++) { const p = pick(); this.spawn(st.land.mobs[(i + n) % st.land.mobs.length], p.x, p.y, false); }
    if (st.boss && bossSpot) this.spawn(st.land.boss, bossSpot.x, bossSpot.y, true);
    for (let i = 0; i < 6; i++) { const p = pick(); this.spawn(GAME[i % 2], p.x, p.y, false); this.mons[this.mons.length - 1].animal = true; }
  }
  /** bring a dead monster back somewhere else on the map */
  respawn(m: Mon) {
    const delay = m.boss ? 300000 : m.animal ? 20000 : 8000 + Math.random() * 6000;
    this.s.time.delayedCall(delay, () => {
      if (!this.s.sys.isActive() || this.s.stageN !== this.stage?.n) return;
      const i = this.mons.indexOf(m); if (i >= 0) this.mons.splice(i, 1);
      m.sp.destroy(); m.bar.destroy();
      const p = m.boss && this.bossSpot ? this.bossSpot : this.pickSpot!();
      this.spawn(m.m, p.x, p.y, m.boss);
      const nm = this.mons[this.mons.length - 1]; nm.animal = m.animal;
      nm.sp.setAlpha(0); this.s.tweens.add({ targets: nm.sp, alpha: 1, duration: 600 });
      if (m.boss) bus.emit(EV.TOAST, `${m.m.name} ปรากฏตัวอีกครั้ง!`, '#ff8a6a');
    });
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

  // ---------- skills ----------
  shieldHp = 0; shieldUntil = 0; shieldFx: Phaser.GameObjects.Ellipse | null = null;
  /** shield soaks damage first */
  absorb(dmg: number) {
    if (this.shieldHp <= 0 || this.s.time.now > this.shieldUntil) { this.shieldHp = 0; this.shieldFx?.destroy(); this.shieldFx = null; return dmg; }
    const a = Math.min(this.shieldHp, dmg); this.shieldHp -= a;
    if (a > 0) this.float(this.s.hero.x, this.s.hero.y - 48, `🛡${a}`, '#ffe080', 8);
    if (this.shieldHp <= 0) { this.shieldFx?.destroy(); this.shieldFx = null; }
    return dmg - a;
  }
  alive() { return this.mons.filter(m => m.alive); }
  nearest(r: number) { const h = this.s.hero; return this.alive().filter(m => Math.hypot(m.x - h.x, m.y - h.y) < r).sort((a, b) => Math.hypot(a.x - h.x, a.y - h.y) - Math.hypot(b.x - h.x, b.y - h.y)); }
  hitSk(m: Mon, sk: SkillDef, knock = 0) {
    if (!m.alive) return 0;
    const r = skillHit(S(), sk, m.def);
    this.hurtMon(m, r.dmg, r.crit, sk.stat === 'matk');
    if (knock && m.alive && !m.boss) { const h = this.s.hero, a = Math.atan2(m.y - h.y, m.x - h.x), nx = m.x + Math.cos(a) * knock, ny = m.y + Math.sin(a) * knock; if (!this.s.isBlocked(nx, ny)) { m.x = nx; m.y = ny; } }
    return r.dmg;
  }
  ring(x: number, y: number, r: number, col: number, dur = 380) {
    const c = this.s.add.ellipse(x, y, 8, 4).setStrokeStyle(3, col, 1).setDepth(99953).setBlendMode(Phaser.BlendModes.ADD);
    this.s.tweens.add({ targets: c, width: r * 2, height: r * 1.2, alpha: 0, duration: dur, ease: 'Quad.easeOut', onComplete: () => c.destroy() });
    this.glowTex(); const g = this.s.add.image(x, y - 6, 'fx_dot').setTint(col).setBlendMode(Phaser.BlendModes.ADD).setDepth(99952).setScale(r / 20);
    this.s.tweens.add({ targets: g, alpha: 0, scale: r / 12, duration: dur, onComplete: () => g.destroy() });
  }
  /** Cast a skill (already paid for by systems/skillCast.beginCast). Returns the text to float over the hero. */
  castSkill(sk: SkillDef) {
    const h = this.s.hero, col = sk.color ?? 0xffe8a0, s = S();
    const near = this.nearest(240)[0];
    const aim = near ? Math.atan2(near.y - h.y, near.x - h.x) : Math.atan2(Math.cos(this.s.dir * Math.PI / 4), Math.sin(this.s.dir * Math.PI / 4));
    const fx = Math.cos(aim), fy = Math.sin(aim);
    if (near) this.s.dir = dirOf(fx, fy);
    this.float(h.x, h.y - 56, sk.name, '#' + col.toString(16).padStart(6, '0'), 10);
    const times = (n: number, gap: number, f: (i: number) => void) => { for (let i = 0; i < n; i++) this.s.time.delayedCall(i * gap, () => f(i)); };
    switch (sk.kind) {
      case 'strike': {
        const n = sk.count ?? 1;
        times(n, 170, i => {
          const cx = h.x + fx * 20, cy = h.y - 10 + fy * 14;
          this.slash(cx, cy, dirOf(fx, fy), i % 2 ? 'hr3' : 'hr12'); this.ring(cx, cy + 8, 26, col, 260);
          for (const m of this.alive()) if (Math.hypot(m.x - cx, m.y - (cy + 10)) < 34 + m.m.size * 0.25) this.hitSk(m, sk, sk.id === 't2_slam' ? 22 : 6);
        });
        this.s.cameras.main.shake(120, 0.004); break;
      }
      case 'spin': {
        const n = sk.count ?? 2, r = sk.radius ?? 48;
        times(n, 220, () => { this.ring(h.x, h.y, r, col, 300); for (let k = 0; k < 4; k++) this.slash(h.x, h.y - 10, k * 2, 'hr3'); for (const m of this.alive()) if (Math.hypot(m.x - h.x, m.y - h.y) < r + m.m.size * 0.25) this.hitSk(m, sk, 8); });
        break;
      }
      case 'dash': {
        let tx = h.x, ty = h.y;
        for (let d = 0; d < 110; d += 4) { const nx = h.x + fx * d, ny = h.y + fy * d; if (this.s.isBlocked(nx, ny)) break; tx = nx; ty = ny; }
        const x0 = h.x, y0 = h.y, hitSet = new Set<Mon>();
        for (let k = 0; k < 6; k++) this.s.time.delayedCall(k * 30, () => { const gh = this.s.add.image(h.x, h.y, h.texture.key, h.frame.name).setOrigin(h.originX, h.originY).setTint(col).setAlpha(0.5).setDepth(h.depth - 1); this.s.tweens.add({ targets: gh, alpha: 0, duration: 260, onComplete: () => gh.destroy() }); });
        this.s.tweens.add({ targets: h, x: tx, y: ty, duration: 200, ease: 'Quad.easeOut', onUpdate: () => {
          for (const m of this.alive()) if (!hitSet.has(m) && Math.hypot(m.x - h.x, m.y - h.y) < 22 + m.m.size * 0.25) { hitSet.add(m); this.hitSk(m, sk, 18); }
        } });
        this.sparks(x0, y0 - 8, col, 10); break;
      }
      case 'leap': {
        const r = sk.radius ?? 60, tgt = near && Math.hypot(near.x - h.x, near.y - h.y) < 170 ? { x: near.x - fx * 16, y: near.y - fy * 10 } : { x: h.x + fx * 60, y: h.y + fy * 60 };
        if (this.s.isBlocked(tgt.x, tgt.y)) { tgt.x = h.x; tgt.y = h.y; }
        this.s.tweens.add({ targets: h, x: tgt.x, y: tgt.y, duration: 320, ease: 'Sine.easeInOut' });
        this.s.tweens.add({ targets: h, scale: 1.25, duration: 160, yoyo: true });
        this.s.time.delayedCall(330, () => { this.ring(h.x, h.y, r, col, 450); this.ring(h.x, h.y, r * 0.6, 0xffffff, 300); this.sparks(h.x, h.y - 4, col, 18); this.s.cameras.main.shake(260, 0.01);
          for (const m of this.alive()) if (Math.hypot(m.x - h.x, m.y - h.y) < r + m.m.size * 0.25) this.hitSk(m, sk, 16); });
        break;
      }
      case 'shot': case 'pierce': {
        const n = sk.count ?? 1, spr = sk.spread ?? (sk.kind === 'pierce' ? 0.12 : 0.18), pierce = sk.kind === 'pierce', len = pierce ? 230 : 190;
        const magic = sk.stat === 'matk';
        times(n, sk.id === 'a2_double' || sk.id === 'm3_volley' ? 110 : 0, i => {
          const a = sk.id === 'a2_double' || sk.id === 'm3_volley' ? aim + (i - (n - 1) / 2) * 0.05 : aim + (i - (n - 1) / 2) * spr;
          const sx = h.x, sy = h.y - 18, ex = sx + Math.cos(a) * len, ey = sy + Math.sin(a) * len;
          // who is on the line? (sorted by distance) — first one only unless piercing
          const on = this.alive().map(m => { const px = m.x - sx, py = m.y - m.m.size * 0.35 - sy, t = px * Math.cos(a) + py * Math.sin(a), dd = Math.abs(-px * Math.sin(a) + py * Math.cos(a)); return { m, t, dd }; })
            .filter(o => o.t > 0 && o.t < len && o.dd < 12 + o.m.m.size * 0.2).sort((p, q) => p.t - q.t);
          const hits = pierce ? on : on.slice(0, 1);
          const stopT = !pierce && hits[0] ? hits[0].t : len;
          const tx = sx + Math.cos(a) * stopT, ty = sy + Math.sin(a) * stopT;
          this.glowTex();
          const big = sk.proj === 'fire' || sk.id === 'm2_fire';
          const p = magic || sk.proj === 'orb' || sk.proj === 'dark' || big ? this.s.add.image(sx, sy, 'fx_dot').setTint(col).setBlendMode(Phaser.BlendModes.ADD).setScale(big ? 0.8 : 0.5)
            : this.s.add.rectangle(sx, sy, pierce ? 22 : 12, pierce ? 3 : 2, col).setRotation(a);
          p.setDepth(99950);
          const tr = this.s.time.addEvent({ delay: 20, repeat: 10, callback: () => { const t = this.s.add.image(p.x, p.y, 'fx_dot').setTint(col).setBlendMode(Phaser.BlendModes.ADD).setDepth(99949).setScale(0.3).setAlpha(0.6); this.s.tweens.add({ targets: t, alpha: 0, scale: 0.05, duration: 240, onComplete: () => t.destroy() }); } });
          this.s.tweens.add({ targets: p, x: tx, y: ty, duration: stopT * 1.1, onComplete: () => {
            p.destroy(); tr.remove(); this.sparks(tx, ty, col, 6);
            if (big) { this.ring(tx, ty, sk.radius ?? 40, col); for (const m of this.alive()) if (Math.hypot(m.x - tx, m.y - m.m.size * 0.35 - ty) < (sk.radius ?? 40)) this.hitSk(m, sk, 10); }
            else for (const o of hits) this.hitSk(o.m, sk, pierce ? 4 : 6);
          } });
        });
        break;
      }
      case 'rain': {
        const tg = this.nearest(230).slice(0, sk.count ?? 5);
        tg.forEach((m, i) => this.s.time.delayedCall(i * 90, () => {
          if (!m.alive) return;
          const tx = m.x, ty = m.y - m.m.size * 0.3;
          this.glowTex();
          const fall = sk.fall ?? 'arrow';
          const o = fall === 'arrow' || fall === 'blade' ? this.s.add.rectangle(tx - 30, ty - 120, fall === 'blade' ? 4 : 2, fall === 'blade' ? 18 : 14, col).setRotation(-0.25)
            : this.s.add.image(tx - 30, ty - 120, 'fx_dot').setTint(col).setBlendMode(Phaser.BlendModes.ADD).setScale(fall === 'meteor' ? 1 : 0.5);
          o.setDepth(99950);
          if (fall === 'bolt') { const g = this.s.add.graphics().setDepth(99951).setBlendMode(Phaser.BlendModes.ADD); g.lineStyle(2, col, 1).beginPath().moveTo(tx, ty - 120); for (let k = 1; k <= 6; k++) g.lineTo(tx + (Math.random() - 0.5) * 14, ty - 120 + k * 20); g.strokePath(); this.s.tweens.add({ targets: g, alpha: 0, duration: 300, onComplete: () => g.destroy() }); }
          this.s.tweens.add({ targets: o, x: tx, y: ty, duration: fall === 'bolt' ? 60 : 220, ease: 'Quad.easeIn', onComplete: () => { o.destroy(); this.ring(tx, ty + 6, fall === 'meteor' ? 30 : 14, col, 300); if (fall === 'meteor') this.s.cameras.main.shake(100, 0.006); this.hitSk(m, sk, 4); } });
        }));
        if (!tg.length) this.float(h.x, h.y - 40, 'ไม่มีเป้าหมาย', '#cfcfcf', 8);
        break;
      }
      case 'nova': {
        const r = sk.radius ?? 64;
        this.ring(h.x, h.y, r, col, 450); this.ring(h.x, h.y, r * 0.7, 0xffffff, 320); this.sparks(h.x, h.y - 10, col, 16);
        let total = 0;
        for (const m of this.alive()) if (Math.hypot(m.x - h.x, m.y - h.y) < r + m.m.size * 0.25) total += this.hitSk(m, sk, 26);
        if (sk.id === 'm4_dread' && total > 0) { const d = derive(s), heal = Math.min(Math.round(total * 0.1), d.maxHp - s.hp); s.hp += heal; if (heal > 0) this.float(h.x, h.y - 40, `+${heal}`, '#7aff8a', 10); }
        break;
      }
      case 'buff': case 'heal': case 'shield': {
        const r = selfEffect(s, sk);
        this.ring(h.x, h.y, 30, col, 600); this.ring(h.x, h.y, 20, 0xffffff, 450);
        for (let k = 0; k < 12; k++) { const p = this.s.add.rectangle(h.x + (Math.random() - 0.5) * 26, h.y - Math.random() * 10, 2, 2, col).setDepth(99952); this.s.tweens.add({ targets: p, y: p.y - 34 - Math.random() * 16, alpha: 0, duration: 700 + Math.random() * 400, onComplete: () => p.destroy() }); }
        if (r.heal !== undefined) this.float(h.x, h.y - 40, `+${r.heal}`, '#7aff8a', 12);
        if (r.shield) {
          this.shieldHp = r.shield; this.shieldUntil = this.s.time.now + 12000;
          this.shieldFx?.destroy(); this.shieldFx = this.s.add.ellipse(h.x, h.y - 16, 34, 42).setStrokeStyle(2, col, 0.9).setFillStyle(col, 0.12).setDepth(99948);
          this.float(h.x, h.y - 40, `🛡 ${r.shield}`, '#ffe080', 11);
        }
        break;
      }
    }
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
    const magic = MAGIC.has(formKey);
    this.s.time.delayedCall(ranged ? 260 : 120, () => {
      if (!ranged) this.slash(h.x + fx * 10, h.y - 14 + fy * 6, this.s.dir, formKey);
      for (const m of hits) {
        if (!m.alive) continue;
        if (ranged) { if (magic) this.magicBolt(h.x, h.y - 20, m, formKey === 'hr9' ? 0xff3a5a : formKey === 'hr8' ? 0xc08aff : 0x6ad8ff); else this.arrow(h.x, h.y - 18, m); }
        const r = calcDamage(magic ? d.matk : d.atk, m.def, 1, d.crit);
        this.s.time.delayedCall(ranged ? 170 : 0, () => this.hurtMon(m, r.dmg, r.crit, magic));
      }
    });
  }

  tex(key: string, draw: (k: CanvasRenderingContext2D) => void, w = 32, h = 32) {
    if (this.s.textures.exists(key)) return;
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!); this.s.textures.addCanvas(key, c);
  }
  glowTex() { this.tex('fx_dot', k => { const g = k.createRadialGradient(16, 16, 0, 16, 16, 16); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)'); k.fillStyle = g; k.fillRect(0, 0, 32, 32); }); }

  /** sword swing: bright crescent arc + spark streaks */
  slash(x: number, y: number, dir: number, form: string) {
    const col = form === 'hr3' ? 0x9ae8ff : form === 'hr12' || form === 'hr11' ? 0xffa040 : 0xfff2c8;
    const g = this.s.add.graphics().setDepth(99955).setBlendMode(Phaser.BlendModes.ADD);
    const a0 = Math.PI / 2 - dir * Math.PI / 4;   // facing angle in screen space
    let t = 0;
    const ev = this.s.time.addEvent({ delay: 16, repeat: 9, callback: () => {
      t++; g.clear();
      const sweep = Math.min(1, t / 5), fade = t <= 5 ? 1 : 1 - (t - 5) / 5;
      for (let i = 0; i < 3; i++) {
        g.lineStyle(4 - i, i ? col : 0xffffff, (0.9 - i * 0.25) * fade);
        g.beginPath(); g.arc(x, y, 18 + i * 3, a0 - 1.1, a0 - 1.1 + 2.2 * sweep, false); g.strokePath();
      }
      if (t >= 10) { ev.remove(); g.destroy(); }
    } });
  }

  sparks(x: number, y: number, col: number, n: number) {
    this.glowTex();
    for (let i = 0; i < n; i++) {
      const p = this.s.add.image(x, y, 'fx_dot').setTint(col).setBlendMode(Phaser.BlendModes.ADD).setDepth(99956).setScale(0.18 + Math.random() * 0.12);
      const a = Math.random() * Math.PI * 2, d = 8 + Math.random() * 16;
      this.s.tweens.add({ targets: p, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d * 0.7, alpha: 0, scale: 0.05, duration: 260 + Math.random() * 200, onComplete: () => p.destroy() });
    }
  }

  arrow(x: number, y: number, m: Mon) {
    const tx = m.x, ty = m.y - m.m.size * 0.35, a = Math.atan2(ty - y, tx - x);
    const ar = this.s.add.rectangle(x, y, 12, 2, 0xf0e2b8).setRotation(a).setDepth(99950);
    const tr = this.s.add.rectangle(x, y, 18, 1, 0xffffff, 0.35).setRotation(a).setDepth(99949).setBlendMode(Phaser.BlendModes.ADD);
    this.s.tweens.add({ targets: [ar, tr], x: tx, y: ty, duration: 150, onComplete: () => { ar.destroy(); tr.destroy(); this.sparks(tx, ty, 0xffe8a0, 5); } });
  }

  magicBolt(x: number, y: number, m: Mon, col: number) {
    this.glowTex();
    const tx = m.x, ty = m.y - m.m.size * 0.35;
    const orb = this.s.add.image(x, y, 'fx_dot').setTint(col).setBlendMode(Phaser.BlendModes.ADD).setDepth(99951).setScale(0.55);
    const core = this.s.add.image(x, y, 'fx_dot').setBlendMode(Phaser.BlendModes.ADD).setDepth(99952).setScale(0.22);
    const trail = this.s.time.addEvent({ delay: 20, repeat: 8, callback: () => {
      const t = this.s.add.image(orb.x, orb.y, 'fx_dot').setTint(col).setBlendMode(Phaser.BlendModes.ADD).setDepth(99950).setScale(0.4).setAlpha(0.7);
      this.s.tweens.add({ targets: t, scale: 0.05, alpha: 0, duration: 260, onComplete: () => t.destroy() });
    } });
    this.s.tweens.add({ targets: [orb, core], x: tx, y: ty, duration: 170, ease: 'Quad.easeIn', onComplete: () => {
      orb.destroy(); core.destroy(); trail.remove();
      const boom = this.s.add.image(tx, ty, 'fx_dot').setTint(col).setBlendMode(Phaser.BlendModes.ADD).setDepth(99953).setScale(0.3);
      this.s.tweens.add({ targets: boom, scale: 1.6, alpha: 0, duration: 320, onComplete: () => boom.destroy() });
      const ring = this.s.add.circle(tx, ty, 4).setStrokeStyle(2, col, 1).setDepth(99953);
      this.s.tweens.add({ targets: ring, radius: 20, alpha: 0, duration: 340, onComplete: () => ring.destroy() });
      this.sparks(tx, ty, col, 8);
    } });
  }

  hurtMon(m: Mon, dmg: number, crit: boolean, magic = false) {
    if (!m.alive) return;
    m.hp -= dmg; m.hitT = this.s.time.now;
    const st = magic ? (crit ? DMG.magicCrit : DMG.magic) : (crit ? DMG.physCrit : DMG.phys);
    this.dmgText(m.x + (Math.random() - 0.5) * 10, m.y - m.m.size * 0.75, dmg, st, crit, magic);
    if (!magic) this.sparks(m.x, m.y - m.m.size * 0.4, crit ? 0xffd040 : 0xffffff, crit ? 9 : 4);
    if (crit) this.s.cameras.main.shake(110, 0.005);
    m.sp.setTintFill(0xffffff); this.s.time.delayedCall(60, () => m.sp.clearTint());
    const h = this.s.hero, a = Math.atan2(m.y - h.y, m.x - h.x), kb = m.boss ? 1 : 6;
    m.x += Math.cos(a) * kb; m.y += Math.sin(a) * kb;
    if (m.hp <= 0) this.kill(m);
  }

  kill(m: Mon) {
    m.alive = false; m.bar.clear();
    const ph = m.sp.getData('ph') as Phaser.GameObjects.Ellipse | undefined;
    if (ph) { this.s.tweens.add({ targets: ph, alpha: 0, scale: 1.4, duration: 300, onComplete: () => ph.destroy() }); m.sp.setVisible(false); }
    else if (m.boss && hasAnim(m.m.key, 'die')) {
      playAnim(m.sp, m.m.key, 'die', m.dir, false); this.s.cameras.main.shake(400, 0.008);
      m.sp.once('animationcomplete', () => this.s.tweens.add({ targets: m.sp, alpha: 0, delay: 600, duration: 900, onComplete: () => m.sp.setVisible(false) }));
    } else { this.s.burst(m.sp, m.boss ? 0xffd27a : 0xbfe8ff); m.sp.setVisible(false); }
    // rewards are decided by a pure system function (moves to the server when the game goes online)
    const s = S(), st = this.stage!;
    const r = applyKill(s, st.n, m.m, m.boss, m.boss);
    this.respawn(m);
    this.float(m.x, m.y - 20, `+${r.exp} EXP  +${r.gold}G`, '#bfffb0', 8);
    if (r.levels > 0) this.float(this.s.hero.x, this.s.hero.y - 50, `LEVEL UP! Lv ${s.level}`, '#ffd24a', 14);
    this.float(m.x + 14, m.y - 8, `🪵${r.wood} 🪨${r.stone} 🍖${r.food}`, '#ffd8a0', 7);
    r.mats.forEach((q, i) => this.float(m.x - 14, m.y - 46 - i * 10, `+${q.qty} ${itemDef(q.id).name}`, '#c8e8ff', 8));
    r.gear.forEach((q, i) => this.float(m.x, m.y - 34 - i * 12, `${RARITY_NAMES[q.rar]} ${itemDef(q.id).name}`, '#' + RARITY_COLORS[q.rar].toString(16).padStart(6, '0'), 9));
    if (m.boss) bus.emit(EV.TOAST, 'ปราบบอสสำเร็จ! จะกลับมาอีกใน 5 นาที', '#ffd040');
    saveGame(s);
  }

  /** big readable damage numbers: pop in, hang, drift up; crits get a label and a bigger punch */
  dmgText(x: number, y: number, dmg: number, st: { col: string; stroke: string; size: number }, crit: boolean, magic: boolean) {
    const z = this.s.cameras.main.zoom, res = Math.max(3, z * 3);
    const txt = (crit ? (magic ? '✦' : '') : '') + dmg.toLocaleString();
    const t = this.s.add.text(x, y, txt, { fontFamily: 'Arial Black, Impact, sans-serif', fontSize: st.size + 'px', fontStyle: 'bold', color: st.col, stroke: st.stroke, strokeThickness: crit ? 4 : 3, resolution: res })
      .setOrigin(0.5).setDepth(99999).setScale(crit ? 1.9 : 1.3);
    this.s.tweens.add({ targets: t, scale: 1, duration: crit ? 180 : 120, ease: 'Back.easeOut' });
    this.s.tweens.add({ targets: t, y: y - (crit ? 26 : 18), alpha: 0, delay: crit ? 520 : 380, duration: 600, ease: 'Quad.easeIn', onComplete: () => t.destroy() });
    if (crit) {
      const lb = this.s.add.text(x, y - st.size * 0.9, magic ? 'MAGIC CRIT!' : 'CRITICAL!', { fontFamily: 'sans-serif', fontSize: '7px', fontStyle: 'bold', color: st.col, stroke: '#000000', strokeThickness: 2, resolution: res }).setOrigin(0.5).setDepth(99999);
      this.s.tweens.add({ targets: lb, y: lb.y - 24, alpha: 0, delay: 420, duration: 600, onComplete: () => lb.destroy() });
    }
  }

  float(x: number, y: number, t: string, col: string, size: number) {
    const z = this.s.cameras.main.zoom;
    const tx = this.s.add.text(x, y, t, { fontFamily: 'sans-serif', fontSize: size + 'px', color: col, stroke: '#0b0f0c', strokeThickness: 3, resolution: Math.max(2, z * 2) }).setOrigin(0.5).setDepth(99999);
    this.s.tweens.add({ targets: tx, y: y - 18, alpha: 0, duration: 1100, ease: 'Quad.easeOut', onComplete: () => tx.destroy() });
  }

  update(time: number, dt: number) {
    const h = this.s.hero, s = S(), d = derive(s);
    if (this.shieldFx) { if (time > this.shieldUntil) { this.shieldFx.destroy(); this.shieldFx = null; this.shieldHp = 0; } else this.shieldFx.setPosition(h.x, h.y - 16); }
    for (const m of this.mons) {
      if (!m.alive) continue;
      const dx = h.x - m.x, dy = h.y - m.y, dist = Math.hypot(dx, dy);
      const base = MONSTERS[m.m.kind], reach = base.attackRange + m.m.size * 0.2;
      const angry = !m.animal || (!base.flee && m.hitT > 0);
      const aggro = !angry ? 0 : m.boss ? 260 : 130;
      let moving = false;
      if (m.animal && !angry) {
        let tx = 0, ty = 0;
        if (base.flee && dist < 120) { tx = -dx / dist; ty = -dy / dist; }      // run from the hunter
        else { if (!m.wanderT || time > m.wanderT) { m.wanderT = time + 1500 + Math.random() * 2500; m.dir = Math.floor(Math.random() * 8); (m as Mon & { idle?: boolean }).idle = Math.random() < 0.5; }
          if (!(m as Mon & { idle?: boolean }).idle) { tx = Math.sin(m.dir * Math.PI / 4) * 0.35; ty = Math.cos(m.dir * Math.PI / 4) * 0.35; } }
        if (tx || ty) {
          const sp = base.speed * dt / 1000, nx = m.x + tx * sp, ny = m.y + ty * sp;
          if (!this.s.isBlocked(nx, m.y) && Math.abs(nx - m.hx) < 260) m.x = nx;
          if (!this.s.isBlocked(m.x, ny) && Math.abs(ny - m.hy) < 200) m.y = ny;
          m.dir = dirOf(tx, ty); moving = true;
        }
      }
      if (!this.s.dead && dist < aggro && dist > reach * 0.8 && time - m.hitT > 180) {
        const sp = (base.speed + 8) * dt / 1000, nx = m.x + dx / dist * sp, ny = m.y + dy / dist * sp;
        if (!this.s.isBlocked(nx, m.y)) m.x = nx;
        if (!this.s.isBlocked(m.x, ny)) m.y = ny;
        m.dir = dirOf(dx, dy); moving = true;
      } else if (dist >= aggro && angry) {
        const bx = m.hx - m.x, by = m.hy - m.y, bd = Math.hypot(bx, by);
        if (bd > 6) { const sp = base.speed * 0.5 * dt / 1000; m.x += bx / bd * sp; m.y += by / bd * sp; m.dir = dirOf(bx, by); moving = true; }
      }
      if (m.boss && !this.s.dead && dist < 200 && time - (m.spT ?? 0) > 6500 && hasAnim(m.m.key, 'special')) {
        m.spT = time; m.atkT = time + 600; m.dir = dirOf(dx, dy);
        playAnim(m.sp, m.m.key, 'special', m.dir, false);
        const cx = h.x, cy = h.y, R = 46;
        const warn = this.s.add.ellipse(cx, cy, R * 2, R * 1.2, 0xff2a2a, 0.18).setStrokeStyle(2, 0xff5a4a, 0.9).setDepth(2);
        this.s.tweens.add({ targets: warn, alpha: { from: 0.4, to: 1 }, duration: 200, yoyo: true, repeat: 2 });
        this.s.time.delayedCall(1100, () => {
          warn.destroy(); if (!m.alive) return;
          this.glowTex();
          const boom = this.s.add.image(cx, cy - 6, 'fx_dot').setTint(0xff6a3a).setBlendMode(Phaser.BlendModes.ADD).setDepth(99954).setScale(1);
          this.s.tweens.add({ targets: boom, scale: 4, alpha: 0, duration: 450, onComplete: () => boom.destroy() });
          this.sparks(cx, cy - 6, 0xffa050, 14); this.s.cameras.main.shake(250, 0.01);
          if (!this.s.dead && Math.hypot((h.x - cx) / R, (h.y - cy) / (R * 0.6)) < 1) {
            const r = calcDamage(m.atk * 2.2, d.def, 1, 0, Math.random, 0); s.hp = Math.max(0, s.hp - this.absorb(r.dmg));
            this.float(h.x, h.y - 40, `-${r.dmg}`, '#ff4a3a', 13); if (s.hp <= 0) this.s.heroDie();
          }
        });
      }
      if (angry && !this.s.dead && dist <= reach && time - m.last > base.attackCooldown) {
        m.last = time; m.atkT = time; m.dir = dirOf(dx, dy);
        if (CH[m.m.key] && hasAnim(m.m.key, 'attack')) playAnim(m.sp, m.m.key, 'attack', m.dir, false);
        this.s.time.delayedCall(220, () => {
          if (!m.alive || this.s.dead || Math.hypot(h.x - m.x, h.y - m.y) > reach + 8) return;
          const r = calcDamage(m.atk, d.def, 1, 0.05, Math.random, d.evade);
          s.hp = Math.max(0, s.hp - this.absorb(r.dmg));
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
