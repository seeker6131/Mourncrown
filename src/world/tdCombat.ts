import { fx2, hasFx2 } from './fx2';
// Monsters, combat, loot and stage flow for the top-down world.
import { pxShadow } from './pxShadow';
import Phaser from 'phaser';
import { MONSTERS } from '../data/monsters';
import { RARITY_COLORS, RARITY_NAMES, itemDef } from '../data/items';
import { S, bus, EV } from '../core/events';
import { saveGame } from '../core/save';
import { derive, gainExp, calcDamage } from '../systems/stats';
import { addItem } from '../systems/inventory';
import { act, refused } from '../net/client';
import { sfx } from '../audio/sfx';
import { element } from '../audio/skillSfx';
import { SKILL_PFX, playPfx } from './pfx';
import { SETS } from '../data/sets';
import { Vfx } from './vfx';
import { slashFx } from '../systems/premium';
import { sellJunk } from '../systems/inventory';
import { invSize } from '../core/state';
import { selfEffect, skillHit } from '../systems/skillCast';
import type { SkillDef } from '../data/skills';
import { CH, playAnim, setIdle, hasAnim, hitMs } from './chars';
import { STAGES, WILD, wildStage, dungeonStage, DUNGEON_WAVES, scaleStats, type Stage, type StageMon } from './stages';

export interface Mon {
  sp: Phaser.GameObjects.Sprite; m: StageMon; hp: number; max: number; atk: number; def: number; exp: number; gold: [number, number];
  x: number; y: number; hx: number; hy: number; dir: number; last: number; alive: boolean; bar: Phaser.GameObjects.Graphics; boss: boolean; hitT: number; atkT: number; spT?: number; animal?: boolean; wanderT?: number; fleeT?: number; sid: number; elite: boolean;
}

export interface Host extends Phaser.Scene {
  hero: Phaser.GameObjects.Sprite; dir: number; isBlocked(x: number, y: number): boolean; surfAt(x: number, y: number): string;
  burst(sp: Phaser.GameObjects.Sprite, soul: number): void; heroDie(): void; dead: boolean; stageN: number;
  /** an animal kicks back: push the hero away and stun for ms */
  stunHero(ms: number, fromX: number, fromY: number): void;
  /** forced moves: may the hero be put here / nearest good spot (never inside or wedged against obstacles) */
  canLand(x: number, y: number): boolean; landing(x: number, y: number): { x: number; y: number } | null;
  /** other players nearby who may grab loot left on the ground (Deepwild simulation; online: real players) */
  others?(): { x: number; y: number; name: string; grab(x: number, y: number): void }[];
}

/** sprites drawn on a bigger canvas than the rest of their family (the remade dragon) */
const SPRITE_SCALE: Record<string, number> = { bs3: 0.62 };
/** boss special per land, monsters that hit heavily, projectile colours */
const BOSS_FX: Record<string, string> = { forest: 'earth-spike', haunt: 'grasping-hands', lava: 'flame-pillar', snow: 'ice-spikes', dung: 'necro-skulls' };
export const MONSTER_PFX = (land: string) => ['claw-swipe', 'blunt-hit', 'crit-hit', 'hit-spark', BOSS_FX[land] ?? 'earth-spike'];
const HEAVY = new Set(['golem', 'yeti', 'treant', 'stag', 'dragon', 'frostgiant', 'skking', 'skeleton']);
const RANGED_COL: Record<string, number> = { wisp: 0x9affd8, ghost: 0x9ad8ff, skarcher: 0xe8dcc0, goblin: 0xe8dcc0, imp: 0xff8a3a };
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

const AURA = [0.32, 0.42, 0.55, 0.75, 0.95, 1.25];
interface Loot { did: number; id: string; qty: number; rar: number; set?: string; x: number; y: number; im: Phaser.GameObjects.Image; aura: Phaser.GameObjects.Image; beam?: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite; born: number; landed: boolean; busy: boolean; retryT: number; lured?: boolean }

export class Combat {
  mons: Mon[] = [];
  stage: Stage | null = null;
  vfx: Vfx;
  constructor(public s: Host) { this.vfx = new Vfx(s); }

  /** where a respawning monster may appear (set by the scene: a free spot away from the hero and the gate) */
  pickSpot: (() => { x: number; y: number }) | null = null;
  bossSpot: { x: number; y: number } | null = null;
  /** Farming map: lots of monsters spread over the map; every kill respawns after a while, the boss every 5 minutes. */
  spawnMap(n: number, pick: () => { x: number; y: number }, bossSpot: { x: number; y: number } | null) {
    if (n === WILD) {   // the Deepwild: herds of game only, at the hero's level
      this.stage = wildStage(S().level); this.pickSpot = pick; this.bossSpot = null;
      for (let i = 0; i < 40; i++) { const p = pick(); this.spawn(GAME[i % 3 === 0 ? 1 : 0], p.x, p.y, false); this.mons[this.mons.length - 1].animal = true; }
      return;
    }
    const st = STAGES[n - 1]; this.stage = st; this.pickSpot = pick; this.bossSpot = bossSpot;
    for (let i = 0; i < st.count; i++) { const p = pick(); this.spawn(st.land.mobs[(i + n) % st.land.mobs.length], p.x, p.y, false); }
    if (st.boss && bossSpot) this.spawn(st.land.boss, bossSpot.x, bossSpot.y, true);
  }
  // ---------- loot on the ground: the item itself with a rarity aura; flies into the hero when close ----------
  ground: Loot[] = [];
  hitSfxT = 0;
  bagWarnT = 0;
  dropLoot(x: number, y: number, drops: { did: number; id: string; qty: number; rar: number; set?: string }[]) {
    const sc = this.s;
    drops.forEach((d, i) => {
      const def = itemDef(d.id), key = sc.textures.exists(`icon_${def.icon}`) ? `icon_${def.icon}` : 'td_glow', col = RARITY_COLORS[d.rar];
      const tx = x + (Math.random() - 0.5) * 50, ty = y + 4 + (Math.random() - 0.5) * 26;
      const aura = sc.add.image(x, y, 'td_glow').setTint(col).setBlendMode(Phaser.BlendModes.ADD).setDepth(ty - 1).setScale(AURA[d.rar]);
      sc.tweens.add({ targets: aura, alpha: { from: 0.55, to: 1 }, scale: { from: AURA[d.rar] * 0.85, to: AURA[d.rar] * 1.15 }, duration: 600 - d.rar * 40, yoyo: true, repeat: -1 });
      let beam: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite | undefined;
      const pillar = d.rar >= 3 ? fx2(sc, d.rar >= 5 ? 'fx_drop_sl' : d.rar >= 4 ? 'fx_drop_legend' : 'fx_drop_epic', x, y + 2, ty - 1, 0.55 + d.rar * 0.06) : null;
      if (pillar) beam = pillar;   // PixelLab light pillar (looping) for Super Rare and better
      else if (d.rar >= 3) {   // a pillar of light for Super Rare and better
        beam = sc.add.image(x, y, 'td_glow').setTint(col).setBlendMode(Phaser.BlendModes.ADD).setOrigin(0.5, 0.92).setDepth(ty - 1).setDisplaySize(6 + d.rar * 3, 40 + d.rar * 18).setAlpha(0.7);
        sc.tweens.add({ targets: beam, alpha: { from: 0.35, to: 0.85 }, duration: 500, yoyo: true, repeat: -1 });
      }
      const im = sc.add.image(x, y - 8, key).setDepth(ty + 1); im.setScale(13 / Math.max(im.width, im.height, 1));
      const g: Loot = { ...d, x: tx, y: ty, im, aura, beam, born: sc.time.now, landed: false, busy: false, retryT: 0 };
      this.ground.push(g);
      // pop out of the monster in a little arc, then land
      sc.tweens.addCounter({ from: 0, to: 1, duration: 380, delay: i * 70, ease: 'Linear',
        onUpdate: tw => { const t = tw.getValue() ?? 0, px = x + (tx - x) * t, py = y + (ty - y) * t - Math.sin(Math.PI * t) * 22; im.setPosition(px, py - 6); aura.setPosition(px, py); beam?.setPosition(px, py); },
        onComplete: () => { g.landed = true; im.setPosition(tx, ty - 6); sc.tweens.add({ targets: im, y: ty - 9, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }); } });
    });
  }
  removeLoot(g: Loot, fade = false) {
    this.ground = this.ground.filter(q => q !== g);
    const objs = [g.im, g.aura, g.beam].filter(Boolean) as Phaser.GameObjects.Image[];
    if (fade) this.s.tweens.add({ targets: objs, alpha: 0, duration: 400, onComplete: () => objs.forEach(o => o.destroy()) }); else objs.forEach(o => { this.s.tweens.killTweensOf(o); o.destroy(); });
  }
  flyLoot(g: Loot) {
    g.busy = true; const sc = this.s, h = sc.hero, x0 = g.im.x, y0 = g.im.y;
    sc.tweens.killTweensOf(g.im);
    sc.tweens.addCounter({ from: 0, to: 1, duration: 230, ease: 'Quad.easeIn',
      onUpdate: tw => { const t = tw.getValue() ?? 0, px = x0 + (h.x - x0) * t, py = y0 + (h.y - 14 - y0) * t; g.im.setPosition(px, py).setDepth(h.y + 2); g.aura.setPosition(px, py + 6); g.beam?.setPosition(px, py + 6); },
      onComplete: () => this.pickLoot(g) });
  }
  pickLoot(g: Loot) {
    const r = act('pickup', { did: g.did }), sc = this.s;
    if (refused(r)) {
      if (r.refused === 'bag') {   // bag full: the item drops back and waits
        g.busy = false; g.retryT = sc.time.now + 4000; g.im.setPosition(g.x, g.y - 6); g.aura.setPosition(g.x, g.y); g.beam?.setPosition(g.x, g.y);
        if (sc.time.now > this.bagWarnT) { this.bagWarnT = sc.time.now + 5000; bus.emit(EV.TOAST, 'กระเป๋าเต็ม! ของยังตกอยู่บนพื้น', '#ff8a6a'); }
        return;
      }
      this.removeLoot(g); return;
    }
    this.removeLoot(g); sfx.pickup();
    const def = itemDef(r.id), col = '#' + RARITY_COLORS[r.rar].toString(16).padStart(6, '0');
    this.float(sc.hero.x, sc.hero.y - 52, `+${def.name}${r.qty > 1 ? ' x' + r.qty : ''}`, col, 8);
    const gear = ['weapon', 'armor', 'accessory'].includes(def.type);
    if ((gear && r.rar >= 2) || (!gear && r.rar >= 3)) bus.emit('loot:popup', { id: r.id, rar: r.rar, set: r.set });
    bus.emit(EV.STATE_CHANGED);
  }
  updateLoot(time: number) {
    const h = this.s.hero, others = this.s.others?.() ?? [];
    for (const g of [...this.ground]) {
      if (time - g.born > 60000) { this.removeLoot(g, true); continue; }
      if (!g.landed || g.busy) continue;
      const d = Math.hypot(g.x - h.x, g.y - h.y);
      if (!this.s.dead && time > g.retryT && (d < 60 || (d < 120 && time - g.born < 1500))) { this.flyLoot(g); continue; }
      // left on the ground: someone else may take it
      if (time - g.born > 3500 && d > 110 && others.length) {
        const o = others.find(q => Math.hypot(q.x - g.x, q.y - g.y) < 16);
        if (o) { act('dropLost', { did: g.did }); this.float(g.x, g.y - 20, `${o.name} เก็บไปแล้ว!`, '#ff9a7a', 8); this.removeLoot(g, true); continue; }
        if (!g.lured) { const n = others.filter(q => Math.hypot(q.x - g.x, q.y - g.y) < 260).sort((a, b) => Math.hypot(a.x - g.x, a.y - g.y) - Math.hypot(b.x - g.x, b.y - g.y))[0]; if (n) { n.grab(g.x, g.y); g.lured = true; } }
      }
    }
  }

  /** Daily dungeon: waves of the land's monsters, then its boss. They fight back (challenge mode) and never respawn. */
  dungeon: { wave: number; left: number; onWave: (w: number) => void; onClear: () => void } | null = null;
  startDungeon(li: number, level: number, pick: () => { x: number; y: number }, onWave: (w: number) => void, onClear: () => void) {
    this.stage = dungeonStage(li, level); this.pickSpot = pick; this.bossSpot = null;
    this.dungeon = { wave: 0, left: 0, onWave, onClear }; this.nextWave();
  }
  nextWave() {
    const d = this.dungeon!, L = this.stage!.land;
    if (d.wave < DUNGEON_WAVES.length) { const n = DUNGEON_WAVES[d.wave]; for (let i = 0; i < n; i++) { const p = this.pickSpot!(); this.spawn(L.mobs[(i + d.wave) % L.mobs.length], p.x, p.y, false); } d.left = n; }
    else { const p = this.pickSpot!(); this.spawn(L.boss, p.x, p.y, true); d.left = 1; }
    d.wave++; d.onWave(d.wave);
  }
  /** bring a dead monster back somewhere else on the map */
  respawn(m: Mon) {
    const delay = m.boss ? 300000 : m.animal ? (this.stage?.n === WILD ? 12000 : 20000) : 8000 + Math.random() * 6000;
    this.s.time.delayedCall(delay, () => {
      if (!this.s.sys.isActive() || this.s.stageN !== this.stage?.n) return;
      const i = this.mons.indexOf(m); if (i >= 0) this.mons.splice(i, 1);
      (m.sp.getData('sh') as Phaser.GameObjects.Image | undefined)?.destroy(); (m.sp.getData('aura') as Phaser.GameObjects.Image | undefined)?.destroy(); (m.sp.getData('aura2') as Phaser.GameObjects.Sprite | undefined)?.destroy(); m.sp.destroy(); m.bar.destroy();
      const p = m.boss && this.bossSpot ? this.bossSpot : this.pickSpot!();
      this.spawn(m.m, p.x, p.y, m.boss);
      const nm = this.mons[this.mons.length - 1]; nm.animal = m.animal;
      nm.sp.setAlpha(0); this.s.tweens.add({ targets: nm.sp, alpha: 1, duration: 600 });
      if (m.boss) bus.emit(EV.TOAST, `${m.m.name} ปรากฏตัวอีกครั้ง!`, '#ff8a6a');
    });
  }

  spawn(m: StageMon, x: number, y: number, boss: boolean) {
    const base = MONSTERS[m.kind]; const st = scaleStats(base, this.stage!.level, boss);
    const reg = act('spawn', { key: m.key, boss, animal: !!base.animal });   // the server names the spawn and decides golden monsters
    if (reg.elite) st.hp *= 5;
    const sc = this.s;
    let sp: Phaser.GameObjects.Sprite;
    if (CH[m.key]) { sp = sc.add.sprite(x, y, `c_${m.key}_idle`); setIdle(sp, m.key, 0); sp.setScale(SPRITE_SCALE[m.key] ?? 1); }
    else { sp = sc.add.sprite(x, y, '__DEFAULT').setVisible(false); }
    const ph = CH[m.key] ? null : sc.add.ellipse(x, y - m.size * 0.3, m.size * 0.6, m.size * 0.5, 0x5a2a3a).setStrokeStyle(1, 0x140a10);
    if (ph) sp.setData('ph', ph);
    const bar = sc.add.graphics().setDepth(99960);
    const shw = m.size * (boss ? 0.75 : 0.62);
    const sh = pxShadow(sc, x, y, shw, shw * 0.34, 0.45);
    sp.setData('sh', sh);
    if (reg.elite) fx2(sc, 'fx_golden_spawn', x, y - 10, y + 1, 1.1);
    if (boss) fx2(sc, 'fx_boss_spawn', x, y + 4, y - 1, 1.6);
    if (reg.elite) {   // golden monster: gold aura, a bit bigger
      sp.setScale(1.2);
      const au = sc.add.image(x, y - m.size * 0.35, 'td_glow').setTint(0xffd84a).setBlendMode(Phaser.BlendModes.ADD).setDepth(y - 1).setScale(m.size / 40);
      sc.tweens.add({ targets: au, alpha: { from: 0.45, to: 1 }, scale: { from: m.size / 44, to: m.size / 34 }, duration: 700, yoyo: true, repeat: -1 });
      sp.setData('aura', au);
      const ea = fx2(sc, 'fx_elite_aura', x, y + 2, y + 1, m.size / 40); if (ea) sp.setData('aura2', ea);
    }
    this.mons.push({ sp, m, hp: st.hp, max: st.hp, atk: st.atk, def: st.def, exp: st.exp, gold: st.gold, x, y, hx: x, hy: y, dir: 0, last: 0, alive: true, bar, boss, hitT: 0, atkT: 0, sid: reg.sid, elite: reg.elite });
  }

  // ---------- skills ----------
  shieldHp = 0; shieldUntil = 0; shieldEnd: (() => void) | null = null;
  /** shield soaks damage first */
  absorb(dmg: number) {
    if (this.shieldHp <= 0 || this.s.time.now > this.shieldUntil) { this.shieldHp = 0; return dmg; }
    const a = Math.min(this.shieldHp, dmg); this.shieldHp -= a;
    if (a > 0) this.float(this.s.hero.x, this.s.hero.y - 48, `🛡${a}`, '#ffe080', 8);
    if (this.shieldHp <= 0) { this.shieldEnd?.(); this.shieldEnd = null; }
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
    this.vfx.wave(x, y, r, col, dur); this.vfx.glow(x, y - 6, col, r / 30, dur, 0.8);
  }

  /** Cast a skill (already paid for by systems/skillCast.beginCast). Returns the text to float over the hero. */
  castSkill(sk: SkillDef) {
    const h = this.s.hero, col = sk.color ?? 0xffe8a0, s = S();
    const near = this.nearest(240)[0];
    const aim = near ? Math.atan2(near.y - h.y, near.x - h.x) : Math.atan2(Math.cos(this.s.dir * Math.PI / 4), Math.sin(this.s.dir * Math.PI / 4));
    const fx = Math.cos(aim), fy = Math.sin(aim);
    if (near) this.s.dir = dirOf(fx, fy);
    // the 4th-form finishers get a big PixelLab effect on top (where the hero lands, or on each target hit)
    const ULT: Record<string, [string, 'land' | 'targets', number]> = { s4_judgment: ['fx_ult_sword', 'land', 360], t4_titan: ['fx_ult_tank', 'land', 340], a4_storm: ['fx_ult_bow', 'targets', 600], m4_meteor: ['fx_ult_mage', 'targets', 650] };
    const u = ULT[sk.id];
    if (u) {
      if (u[1] === 'land') this.s.time.delayedCall(u[2], () => fx2(this.s, u[0], h.x, h.y + 4, h.y + 2, 1.3));
      else this.nearest(230).slice(0, sk.count ?? 5).forEach((m, i) => this.s.time.delayedCall(u[2] + i * 90, () => fx2(this.s, u[0], m.x, m.y + 2, m.y + 2, 0.9)));
    }
    this.float(h.x, h.y - 56, sk.name, '#' + col.toString(16).padStart(6, '0'), 10);
    const times = (n: number, gap: number, f: (i: number) => void) => { for (let i = 0; i < n; i++) this.s.time.delayedCall(i * gap, () => f(i)); };
    // PixelLab effect art layered over the procedural effects
    const el = element(sk), V = this.vfx;
    const pf = (SKILL_PFX[sk.id] ?? []).some(u => this.s.anims.exists('pfx_' + u.fx));
    const artOn = !pf;
    const blastKey = el === 'fire' ? 'px_fx_blast_fire' : el === 'dark' ? 'px_fx_blast_arcane' : 'px_fx_blast_w';
    const blastTint = el === 'fire' || el === 'dark' ? undefined : col;
    const circle = (x: number, y: number, size: number, dur = 600) => !artOn ? null : V.art('px_fx_circle_w', x, y, { s0: size * 0.35, s1: size, sy: 0.55, a0: 0.95, tint: col, dur, depth: y - 2, spin: 60 });
    const blast = (x: number, y: number, size: number, delay = 0) => !artOn ? null : V.art(blastKey, x, y, { s0: size * 0.3, s1: size, a0: 1, dur: 420, tint: blastTint, delay });
    const slashArt = (x: number, y: number, a: number, size: number, flip = false) => !artOn ? null : V.art('px_fx_slash', x, y, { rot: a - Math.PI / 2 + (flip ? Math.PI : 0), s0: size * 0.7, s1: size * 1.1, a0: 1, dur: 360, tint: col });
    switch (sk.kind) {
      case 'strike': {
        const n = sk.count ?? 1;
        times(n, 170, i => {
          const cx = h.x + fx * 20, cy = h.y - 10 + fy * 14;
          this.vfx.slash(cx, cy, aim, col, 1.5, i % 2 === 1); this.vfx.impact(cx + fx * 10, cy + fy * 6, col, true); slashArt(cx, cy, aim, 0.55, i % 2 === 1);
          if (sk.id === 't2_slam' || sk.id === 's2_cleave') { this.vfx.debris(cx, cy + 10, col, 10); this.vfx.dust(cx, cy + 10, 6); }
          for (const m of this.alive()) if (Math.hypot(m.x - cx, m.y - (cy + 10)) < 34 + m.m.size * 0.25) this.hitSk(m, sk, sk.id === 't2_slam' ? 22 : 6);
        }); break;
      }
      case 'spin': {
        const n = sk.count ?? 2, r = sk.radius ?? 48;
        times(n, 220, i => { this.ring(h.x, h.y, r, col, 300); circle(h.x, h.y, r / 70, 380); for (let k = 0; k < 2 && artOn; k++) V.art('px_fx_slash', h.x, h.y - 10, { rot: k * Math.PI + i, s0: r / 90, s1: r / 70, a0: 1, dur: 300, tint: col, spin: 200 }); for (let k = 0; k < 4; k++) this.vfx.slash(h.x, h.y - 10, k * Math.PI / 2 + i * 0.8, col, 1.25); this.vfx.burst(h.x, h.y - 10, col, 16, 160, 420); this.vfx.dust(h.x, h.y, 6, 40); for (const m of this.alive()) if (Math.hypot(m.x - h.x, m.y - h.y) < r + m.m.size * 0.25) this.hitSk(m, sk, 8); });
        break;
      }
      case 'dash': {
        let tx = h.x, ty = h.y;
        for (let d = 4; d < 110; d += 4) { const nx = h.x + fx * d, ny = h.y + fy * d; if (!this.s.canLand(nx, ny)) break; tx = nx; ty = ny; }
        const x0 = h.x, y0 = h.y, hitSet = new Set<Mon>();
        for (let k = 0; k < 6; k++) this.s.time.delayedCall(k * 30, () => { const gh = this.s.add.image(h.x, h.y, h.texture.key, h.frame.name).setOrigin(h.originX, h.originY).setTint(col).setAlpha(0.5).setDepth(h.depth - 1); this.s.tweens.add({ targets: gh, alpha: 0, duration: 260, onComplete: () => gh.destroy() }); });
        this.s.tweens.add({ targets: h, x: tx, y: ty, duration: 200, ease: 'Quad.easeOut', onUpdate: () => {
          for (const m of this.alive()) if (!hitSet.has(m) && Math.hypot(m.x - h.x, m.y - h.y) < 22 + m.m.size * 0.25) { hitSet.add(m); this.hitSk(m, sk, 18); }
        } });
        this.vfx.dust(x0, y0, 10, 40); this.vfx.glow(x0, y0 - 10, col, 1.2, 300);
        this.s.time.delayedCall(200, () => { this.vfx.impact(h.x, h.y - 10, col, true); this.vfx.dust(h.x, h.y, 8, 30); blast(h.x, h.y - 8, 0.55); });
        slashArt(x0 + fx * 50, y0 - 10 + fy * 30, aim, 0.8);
        break;
      }
      case 'leap': {
        const r = sk.radius ?? 60, tgt = near && Math.hypot(near.x - h.x, near.y - h.y) < 170 ? { x: near.x - fx * 16, y: near.y - fy * 10 } : { x: h.x + fx * 60, y: h.y + fy * 60 };
        { const ok = this.s.landing(tgt.x, tgt.y); tgt.x = ok ? ok.x : h.x; tgt.y = ok ? ok.y : h.y; }
        this.s.tweens.add({ targets: h, x: tgt.x, y: tgt.y, duration: 320, ease: 'Sine.easeInOut' });
        this.s.tweens.add({ targets: h, scale: 1.25, duration: 160, yoyo: true });
        this.vfx.glow(h.x, h.y - 10, col, 1, 300);
        this.s.time.delayedCall(330, () => { circle(h.x, h.y, r / 55, 700); blast(h.x, h.y - 6, r / 60); this.vfx.pillar(h.x, h.y, col, 170, 650); this.vfx.wave(h.x, h.y, r * 1.2, col, 520); this.vfx.wave(h.x, h.y, r * 0.7, 0xffffff, 380); this.vfx.glow(h.x, h.y - 8, col, 2.4, 420); this.vfx.debris(h.x, h.y, col, 18); this.vfx.dust(h.x, h.y, 12, 50); this.vfx.burst(h.x, h.y - 8, col, 24, 200, 520);
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
          const big = sk.proj === 'fire' || sk.id === 'm2_fire';
          if (i === 0) this.vfx.glow(sx, sy, col, magic ? 1 : 0.6, 220);
          const proj = el === 'fire' ? 'px_fx_fireball' : el === 'ice' ? 'px_fx_icespike' : undefined;
          if (magic && i === 0) circle(h.x, h.y, 0.5, 450);
          this.vfx.bolt(sx, sy, tx, ty, col, big ? 1.8 : pierce ? 1.3 : magic ? 1.1 : 1, pierce ? 700 : 560, () => {
            if (magic || big) blast(tx, ty, big ? 0.9 : 0.4);
            if (big) {
              this.vfx.impact(tx, ty, col, true); this.vfx.wave(tx, ty + 8, sk.radius ?? 40, col, 420); this.vfx.burst(tx, ty, 0xffb040, 26, 200, 600, 0.22, 120);
              for (const m of this.alive()) if (Math.hypot(m.x - tx, m.y - m.m.size * 0.35 - ty) < (sk.radius ?? 40)) this.hitSk(m, sk, 10);
            } else {
              this.vfx.impact(tx, ty, col, pierce);
              for (const o of hits) { this.hitSk(o.m, sk, pierce ? 4 : 6); if (pierce) this.vfx.impact(o.m.x, o.m.y - o.m.m.size * 0.35, col); }
            }
          }, !magic && sk.proj !== 'orb' && sk.proj !== 'dark' && !big, magic || big ? proj : undefined);
          if (pierce) { const ln = this.s.add.image(sx, sy, 'vfx_beam').setOrigin(0.5, 1).setRotation(a + Math.PI / 2).setTint(col).setBlendMode(Phaser.BlendModes.ADD).setDepth(99950).setScale(0.6, stopT / 128).setAlpha(0.8); this.s.tweens.add({ targets: ln, alpha: 0, scaleX: 0.1, duration: 380, onComplete: () => ln.destroy() }); }
        });
        break;
      }
      case 'rain': {
        const tg = this.nearest(230).slice(0, sk.count ?? 5);
        tg.forEach((m, i) => this.s.time.delayedCall(i * 90, () => {
          if (!m.alive) return;
          const tx = m.x, ty = m.y - m.m.size * 0.3;
          const fall = sk.fall ?? 'arrow';
          if (pf && (fall === 'meteor' || fall === 'bolt')) {
            const fxk = fall === 'meteor' ? 'meteor' : 'lightning-strike', u = SKILL_PFX[sk.id].find(q => q.fx === fxk);
            const t = playPfx(this.s, fxk, m.x, m.y + 2, { scale: u?.scale, flip: Math.random() < 0.5 });
            this.s.time.delayedCall(Math.max(0, t), () => { if (m.alive) { this.hitSk(m, sk, 4); this.vfx.impact(m.x, m.y - m.m.size * 0.3, col, true); } });
            return;
          }
          if (fall === 'bolt') {
            const g = this.s.add.graphics().setDepth(99951).setBlendMode(Phaser.BlendModes.ADD);
            for (const [w, a2] of [[5, 0.35], [2, 1]] as const) { g.lineStyle(w, w > 2 ? col : 0xffffff, a2).beginPath().moveTo(tx, ty - 160); let px = tx; for (let k = 1; k <= 8; k++) { px = tx + (Math.random() - 0.5) * 22; g.lineTo(px, ty - 160 + k * 20); } g.strokePath(); }
            this.s.tweens.add({ targets: g, alpha: 0, duration: 260, onComplete: () => g.destroy() });
            this.vfx.impact(tx, ty, col, true); this.vfx.glow(tx, ty - 40, col, 1.6, 260); artOn && V.art('px_fx_lightning', tx, ty + 10, { oy: 1, s0: 1.2, s1: 1.4, a0: 1, dur: 480 }); this.hitSk(m, sk, 4); return;
          }
          const meteor = fall === 'meteor';
          this.vfx.bolt(tx - 40, ty - 160, tx, ty, col, meteor ? 2.2 : fall === 'blade' ? 1.3 : 1, meteor ? 520 : 800, () => {
            if (meteor && artOn) V.art('px_fx_blast_fire', tx, ty, { s0: 0.4, s1: 1.1, dur: 460 });
            if (fall === 'blade') slashArt(tx, ty, Math.PI / 2, 0.45);
            if (meteor) { this.vfx.impact(tx, ty, col, true); this.vfx.wave(tx, ty + 8, 42, col, 460); this.vfx.debris(tx, ty + 6, col, 14); this.vfx.burst(tx, ty, 0xffa040, 22, 190, 560, 0.22, 140); }
            else { this.vfx.impact(tx, ty, col, fall === 'blade'); this.vfx.wave(tx, ty + 6, 16, col, 280); }
            this.hitSk(m, sk, 4);
          }, fall === 'arrow', meteor ? 'px_fx_fireball' : undefined);
        }));
        if (!tg.length) this.float(h.x, h.y - 40, 'ไม่มีเป้าหมาย', '#cfcfcf', 8);
        break;
      }
      case 'nova': {
        const r = sk.radius ?? 64;
        circle(h.x, h.y, r / 45, 650); blast(h.x, h.y - 8, r / 55);
        this.vfx.wave(h.x, h.y, r * 1.15, col, 520); this.vfx.wave(h.x, h.y, r * 0.75, 0xffffff, 380); this.vfx.glow(h.x, h.y - 10, col, r / 22, 460); this.vfx.burst(h.x, h.y - 10, col, 34, r * 3.2, 600, 0.2);
        if (sk.id === 't3_quake') { this.vfx.debris(h.x, h.y, col, 20); this.vfx.dust(h.x, h.y, 14, 60); }
        if (sk.id === 'a3_trap') this.vfx.burst(h.x, h.y, 0x6ad86a, 20, 120, 700, 0.16, -60);
        let total = 0;
        for (const m of this.alive()) if (Math.hypot(m.x - h.x, m.y - h.y) < r + m.m.size * 0.25) total += this.hitSk(m, sk, 26);
        if (sk.id === 'm4_dread' && total > 0) { const d = derive(s), heal = Math.min(Math.round(total * 0.1), d.maxHp - s.hp); s.hp += heal; if (heal > 0) this.float(h.x, h.y - 40, `+${heal}`, '#7aff8a', 10); }
        break;
      }
      case 'buff': case 'heal': case 'shield': {
        fx2(this.s, sk.kind === 'heal' ? 'fx_heal' : sk.kind === 'shield' ? 'fx_shield_up' : 'fx_buff', h.x, h.y + 4, h.y + 1, 1);
        const r = selfEffect(s, sk);
        if (!pf) this.vfx.aura(h, col, sk.kind === 'buff' ? 1600 : 1100, sk.kind === 'heal');
        circle(h.x, h.y, 0.75, 900); if (artOn) V.art('px_fx_pillar', h.x, h.y + 4, { oy: 1, s0: 0.6, s1: 1.1, sy: 1.4, a0: 1, dur: 800, tint: sk.kind === 'shield' ? undefined : col });
        if (!pf) { this.vfx.pillar(h.x, h.y, col, sk.kind === 'buff' ? 150 : 110, 600); this.vfx.wave(h.x, h.y, 36, col, 500); }
        this.vfx.glow(h.x, h.y - 16, col, 1.4, 400);
        if (r.heal !== undefined) this.float(h.x, h.y - 40, `+${r.heal}`, '#7aff8a', 12);
        if (r.shield) {
          this.shieldHp = r.shield; this.shieldUntil = this.s.time.now + 12000;
          this.shieldEnd?.(); this.shieldEnd = this.vfx.bubble(h, col, 12000);
          this.float(h.x, h.y - 40, `🛡 ${r.shield}`, '#ffe080', 11);
        }
        break;
      }
    }
    this.skillPfx(sk, aim, fx, fy);
  }

  /** pixelfx layer for a skill: on the hero, in front, on the targets (same picks as the skill), or where a dash / leap lands */
  skillPfx(sk: SkillDef, aim: number, fx: number, fy: number) {
    const uses = SKILL_PFX[sk.id]; if (!uses) return;
    const h = this.s.hero, left = fx < -0.2;
    const targets = (): { x: number; y: number }[] => {
      if (sk.kind === 'rain') return this.nearest(230).slice(0, sk.count ?? 5);
      if (sk.kind === 'pierce') return this.alive().filter(m => { const px = m.x - h.x, py = m.y - h.y, t = px * fx + py * fy, d = Math.abs(-px * fy + py * fx); return t > 0 && t < 230 && d < 24; });
      return this.nearest(sk.kind === 'shot' ? 200 : 120).slice(0, Math.max(1, sk.count ?? 1));
    };
    for (const u of uses) {
      if (u.at === 'target' && sk.kind === 'rain' && (sk.fall === 'meteor' || sk.fall === 'bolt')) continue;   // played by the rain itself
      const depth = u.behind ? h.y - 1 : undefined, o = { scale: (u.scale ?? 1) * 0.9, flip: left, depth };
      if (u.at === 'hero') playPfx(this.s, u.fx, h.x, h.y, { ...o, delay: u.delay });
      else if (u.at === 'front') playPfx(this.s, u.fx, h.x + fx * 26, h.y + fy * 14 + 4, { ...o, delay: u.delay });
      else if (u.at === 'land') this.s.time.delayedCall(u.delay ?? 0, () => playPfx(this.s, u.fx, h.x, h.y, o));
      else targets().forEach((m, i) => playPfx(this.s, u.fx, m.x, m.y, { ...o, delay: (u.delay ?? 0) + i * 90 }));
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
    // damage and the slash effect land on the frame where the weapon / bow / staff strikes
    this.s.time.delayedCall(hitMs(formKey, formKey === 'hg' ? (hasAnim('hg', 'hunt') ? 'hunt' : 'chop') : 'attack', ranged ? 260 : 120), () => {
      if (!ranged) this.slash(h.x + fx * 10, h.y - 14 + fy * 6, this.s.dir, formKey);
      for (const m of hits) {
        if (!m.alive) continue;
        if (ranged) { if (magic) this.magicBolt(h.x, h.y - 20, m, formKey === 'hr9' ? 0xff3a5a : formKey === 'hr8' ? 0xc08aff : 0x6ad8ff); else this.arrow(h.x, h.y - 18, m); }
        const r = calcDamage(magic ? d.matk : d.atk, m.def, 1, d.crit);
        this.s.time.delayedCall(ranged ? 170 : 0, () => { if (m.alive) this.hitFx(m, formKey, r.crit, magic, ranged); this.hurtMon(m, r.dmg, r.crit, magic); });
      }
    });
  }

  /** PixelLab hit effect on the monster, by the hero's class line (tools/gen_vfx2.py) */
  hitFx(m: Mon, form: string, crit: boolean, magic: boolean, ranged: boolean) {
    const n = +form.replace(/\D/g, '') || 0;
    const key = crit ? 'fx_hit_crit' : magic ? 'fx_hit_magic' : ranged ? 'fx_hit_arrow' : n >= 10 ? 'fx_hit_holy' : n >= 1 ? 'fx_hit_sword' : 'fx_hit_punch';
    fx2(this.s, key, m.x + (Math.random() - 0.5) * 6, m.y - m.m.size * 0.4, 99952, crit ? 0.75 : 0.9)?.setFlipX(Math.random() < 0.5);
  }

  tex(key: string, draw: (k: CanvasRenderingContext2D) => void, w = 32, h = 32) {
    if (this.s.textures.exists(key)) return;
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!); this.s.textures.addCanvas(key, c);
  }
  glowTex() { this.tex('fx_dot', k => { const g = k.createRadialGradient(16, 16, 0, 16, 16, 16); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)'); k.fillStyle = g; k.fillRect(0, 0, 32, 32); }); }

  /** sword swing: big glowing crescent + sparks off the blade */
  slashN = 0;
  slash(x: number, y: number, dir: number, form: string) {
    const col = slashFx(S()) ?? (form === 'hr3' ? 0x9ae8ff : form === 'hr12' || form === 'hr11' ? 0xffa040 : form === 'hr2' ? 0xc8e0ff : 0xfff2c8);
    const fx = Math.sin(dir * Math.PI / 4), fy = Math.cos(dir * Math.PI / 4);
    if (form === 'hg') { this.vfx.thrust(x + fx * 4, y + fy * 3, Math.atan2(fy, fx), col, 0.9); return; }   // hunting spear: a stab, not a sweep
    this.vfx.slash(x + fx * 6, y + fy * 4, Math.atan2(fy, fx), col, form === 'hero' ? 0.85 : 1.05, (this.slashN++ & 1) === 1);
  }

  sparks(x: number, y: number, col: number, n: number) { this.vfx.burst(x, y, col, n, 90 + n * 6, 360, 0.13); }

  arrow(x: number, y: number, m: Mon) {
    const tx = m.x, ty = m.y - m.m.size * 0.35;
    this.vfx.bolt(x, y, tx, ty, 0xffe8a0, 1, 900, () => this.vfx.impact(tx, ty, 0xffe0a0), true);
  }

  magicBolt(x: number, y: number, m: Mon, col: number) {
    const tx = m.x, ty = m.y - m.m.size * 0.35;
    this.vfx.glow(x, y, col, 0.6, 200);
    this.vfx.bolt(x, y, tx, ty, col, 1.1, 650, () => { this.vfx.impact(tx, ty, col, true); });
  }

  hurtMon(m: Mon, dmg: number, crit: boolean, magic = false) {
    if (!m.alive) return;
    m.hp -= dmg; m.hitT = this.s.time.now;
    if (this.s.time.now > this.hitSfxT) { this.hitSfxT = this.s.time.now + 70; if (crit) sfx.crit(); else sfx.hit(); }
    const st = magic ? (crit ? DMG.magicCrit : DMG.magic) : (crit ? DMG.physCrit : DMG.phys);
    this.dmgText(m.x + (Math.random() - 0.5) * 10, m.y - m.m.size * 0.75, dmg, st, crit, magic);
    if (!magic) this.vfx.impact(m.x, m.y - m.m.size * 0.4, crit ? 0xffd040 : 0xfff4dc, crit);
    else if (crit) this.vfx.star(m.x, m.y - m.m.size * 0.4, 0xff9cff, 1.4);
    m.sp.setTintFill(0xffffff); this.s.time.delayedCall(60, () => m.sp.clearTint());
    const h = this.s.hero, a = Math.atan2(m.y - h.y, m.x - h.x), kb = m.boss ? 1 : 6;
    m.x += Math.cos(a) * kb; m.y += Math.sin(a) * kb;
    if (m.hp <= 0) { this.kill(m); return; }
    if (m.animal) {   // game never fights: it bolts a short way, and now and then kicks the hunter back (short stun)
      m.fleeT = this.s.time.now + 1100;
      const base = MONSTERS[m.m.kind];
      if (Math.random() < (base.stun ?? 0.25) && Math.hypot(m.x - h.x, m.y - h.y) < 48 && this.s.time.now - m.last > 2500) {
        m.last = this.s.time.now; m.dir = dirOf(h.x - m.x, h.y - m.y); m.atkT = this.s.time.now;
        if (hasAnim(m.m.key, 'attack')) playAnim(m.sp, m.m.key, 'attack', m.dir, false);
        this.s.time.delayedCall(160, () => { if (m.alive && !this.s.dead) this.s.stunHero(700, m.x, m.y); });
      }
    }
  }

  kill(m: Mon) {
    m.alive = false; m.bar.clear();
    { const sh = m.sp.getData('sh') as Phaser.GameObjects.Image | undefined; if (sh) this.s.tweens.add({ targets: sh, alpha: 0, duration: 400 }); }
    const ph = m.sp.getData('ph') as Phaser.GameObjects.Ellipse | undefined;
    if (ph) { this.s.tweens.add({ targets: ph, alpha: 0, scale: 1.4, duration: 300, onComplete: () => ph.destroy() }); m.sp.setVisible(false); }
    else if (m.boss && hasAnim(m.m.key, 'die')) {
      playAnim(m.sp, m.m.key, 'die', m.dir, false);
      m.sp.once('animationcomplete', () => this.s.tweens.add({ targets: m.sp, alpha: 0, delay: 600, duration: 900, onComplete: () => m.sp.setVisible(false) }));
    } else { this.s.burst(m.sp, m.boss ? 0xffd27a : 0xbfe8ff); m.sp.setVisible(false); if (!m.animal) fx2(this.s, 'fx_mon_death', m.x, m.y - 6, m.y + 1, 0.8); }
    if (m.boss) { fx2(this.s, 'fx_boss_death', m.x, m.y, m.y + 2, 1.5); this.s.cameras.main.flash(180, 255, 230, 200); }
    // rewards are decided by a pure system function (moves to the server when the game goes online)
    const s = S();
    (m.sp.getData('aura') as Phaser.GameObjects.Image | undefined)?.destroy();
    (m.sp.getData('aura2') as Phaser.GameObjects.Sprite | undefined)?.destroy();
    const r = act('kill', { sid: m.sid, kind: m.m.kind, key: m.m.key, name: m.m.name, size: m.m.size, boss: m.boss });
    if (!this.dungeon) this.respawn(m);
    if (this.dungeon) { const d = this.dungeon; if (--d.left <= 0) { if (d.wave > DUNGEON_WAVES.length) this.s.time.delayedCall(50, d.onClear); else this.s.time.delayedCall(1500, () => this.s.sys.isActive() && this.nextWave()); } }
    if (refused(r)) { this.float(m.x, m.y - 20, '⛔ เซิร์ฟไม่รับ', '#ff8a6a', 8); return; }
    if (r.elite) { bus.emit(EV.TOAST, `✨ ปราบมอนทอง! ทอง x5 EXP x3`, '#ffd84a'); this.vfx.star(m.x, m.y - 20, 0xffd84a, 2); }
    if (r.drops?.length) this.dropLoot(m.x, m.y, r.drops);
    if (r.gold) sfx.coinSoft();
    if (r.junk?.count) this.float(this.s.hero.x, this.s.hero.y - 70, `VIP ขายของอัตโนมัติ ${r.junk.count} ชิ้น +${r.junk.gold}G`, '#ffd84a', 8);
    this.float(m.x, m.y - 20, r.gold ? `+${r.exp} EXP  +${r.gold}G` : `+${r.exp} EXP`, '#bfffb0', 8);
    if (r.levels > 0) this.float(this.s.hero.x, this.s.hero.y - 50, `LEVEL UP! Lv ${s.level}`, '#ffd24a', 14);
    if (r.food) this.float(m.x + 14, m.y - 8, `🍖${r.food}`, '#ffd8a0', 8);

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
    this.updateLoot(time);
    for (const m of this.mons) {
      if (!m.alive) continue;
      const dx = h.x - m.x, dy = h.y - m.y, dist = Math.hypot(dx, dy);
      const base = MONSTERS[m.m.kind], reach = base.attackRange + m.m.size * 0.2;
      // every creature is peaceful until the hero hits it (fleeing game never fights); it calms down when the hero gets far away
      const dg = !!this.dungeon;
      if (!dg && m.hitT > 0 && dist > 320) m.hitT = 0;
      const angry = (m.hitT > 0 || dg) && !m.animal;
      const aggro = !angry ? 0 : dg ? 420 : m.boss ? 260 : 130;
      let moving = false;
      // stand still while swinging / casting (no sliding across the ground with an attack pose)
      const busy = time - m.atkT < (m.boss ? 750 : 500) || time - (m.spT ?? -1e9) < 1300;
      if (!angry && !busy) {
        let tx = 0, ty = 0;
        const fleeing = m.animal && (m.fleeT ?? 0) > time;
        if (fleeing) { tx = -dx / dist; ty = -dy / dist; }      // hit game bolts away for a moment (a bit slower than the hero)
        else { if (!m.wanderT || time > m.wanderT) { m.wanderT = time + 1500 + Math.random() * 2500; m.dir = Math.floor(Math.random() * 8); (m as Mon & { idle?: boolean }).idle = Math.random() < 0.5; }
          if (!(m as Mon & { idle?: boolean }).idle) { tx = Math.sin(m.dir * Math.PI / 4) * 0.35; ty = Math.cos(m.dir * Math.PI / 4) * 0.35; } }
        if (tx || ty) {
          const sp = (fleeing ? Math.min(base.speed * 1.4, 84) : base.speed * 1.25) * dt / 1000, nx = m.x + tx * sp, ny = m.y + ty * sp;
          // wander around their own spawn point (fleeing game may go a bit further)
          const lim = fleeing ? 220 : m.boss ? 60 : 110;
          if (!this.s.isBlocked(nx, m.y) && Math.abs(nx - m.hx) < lim) m.x = nx; else if (!fleeing) m.wanderT = 0;
          if (!this.s.isBlocked(m.x, ny) && Math.abs(ny - m.hy) < lim * 0.75) m.y = ny; else if (!fleeing) m.wanderT = 0;
          m.dir = dirOf(tx, ty); moving = true;
        }
      }
      if (!busy && !this.s.dead && dist < aggro && dist > reach * 0.8 && time - m.hitT > 180) {
        // chasing is always a bit slower than the hero (hero 92 px/s) so the player can get away
        const sp = Math.min((base.speed + 8) * 1.25, 78) * dt / 1000, nx = m.x + dx / dist * sp, ny = m.y + dy / dist * sp;
        if (!this.s.isBlocked(nx, m.y)) m.x = nx;
        if (!this.s.isBlocked(m.x, ny)) m.y = ny;
        m.dir = dirOf(dx, dy); moving = true;
      } else if (!busy && dist >= aggro && angry) {
        const bx = m.hx - m.x, by = m.hy - m.y, bd = Math.hypot(bx, by);
        if (bd > 6) { const sp = base.speed * 0.6 * dt / 1000; m.x += bx / bd * sp; m.y += by / bd * sp; m.dir = dirOf(bx, by); moving = true; }
      }
      if (angry && m.boss && !this.s.dead && dist < 200 && time - (m.spT ?? 0) > 6500 && hasAnim(m.m.key, 'special')) {
        m.spT = time; m.atkT = time + 600; m.dir = dirOf(dx, dy);
        playAnim(m.sp, m.m.key, 'special', m.dir, false);
        const cx = h.x, cy = h.y, R = 46;
        const warn = this.s.add.ellipse(cx, cy, R * 2, R * 1.2, 0xff2a2a, 0.18).setStrokeStyle(2, 0xff5a4a, 0.9).setDepth(2);
        this.s.tweens.add({ targets: warn, alpha: { from: 0.4, to: 1 }, duration: 200, yoyo: true, repeat: 2 });
        this.s.time.delayedCall(1100, () => {
          warn.destroy(); if (!m.alive) return;
          this.glowTex();
          if (hasFx2(`fx_${m.m.key}_special`)) fx2(this.s, `fx_${m.m.key}_special`, cx, cy + 6, 99953, m.m.key === 'bs3' ? 0.6 : 1);
          else playPfx(this.s, BOSS_FX[this.stage?.land.id ?? 'forest'], cx, cy + 6, { scale: 0.95, depth: 99953 });
          const boom = this.s.add.image(cx, cy - 6, 'fx_dot').setTint(0xff6a3a).setBlendMode(Phaser.BlendModes.ADD).setDepth(99954).setScale(1);
          this.s.tweens.add({ targets: boom, scale: 4, alpha: 0, duration: 450, onComplete: () => boom.destroy() });
          this.sparks(cx, cy - 6, 0xffa050, 14);
          if (!this.s.dead && Math.hypot((h.x - cx) / R, (h.y - cy) / (R * 0.6)) < 1) {
            const r = calcDamage(m.atk * 2.2, d.def, 1, 0, Math.random, 0); s.hp = Math.max(0, s.hp - this.absorb(r.dmg));
            this.float(h.x, h.y - 40, `-${r.dmg}`, '#ff4a3a', 13); if (s.hp <= 0) this.s.heroDie();
          }
        });
      }
      if (angry && !this.s.dead && dist <= reach && time - m.last > base.attackCooldown) {
        m.last = time; m.atkT = time; m.dir = dirOf(dx, dy);
        if (CH[m.m.key] && hasAnim(m.m.key, 'attack')) playAnim(m.sp, m.m.key, 'attack', m.dir, false);
        if (m.boss) { const lx = dx / dist * 14, ly = dy / dist * 9; this.s.tweens.add({ targets: m, x: m.x + lx, y: m.y + ly, duration: 140, yoyo: true, ease: 'Quad.easeOut' }); }   // a heavy lunge at the hero
        const land = () => {
          if (!m.alive || this.s.dead || Math.hypot(h.x - m.x, h.y - m.y) > reach + 30) return;
          const r = calcDamage(m.atk, d.def, 1, 0.05, Math.random, d.evade);
          s.hp = Math.max(0, s.hp - this.absorb(r.dmg));
          if (!r.miss) {
            sfx.hurt();
            const heavy = m.boss || HEAVY.has(m.m.kind), left = h.x < m.x;
            if (m.boss && hasFx2(`fx_${m.m.key}_hit`)) fx2(this.s, `fx_${m.m.key}_hit`, h.x, h.y - 14, 99953, 0.9)?.setFlipX(left);
            else playPfx(this.s, m.boss ? 'crit-hit' : heavy ? 'blunt-hit' : base.ranged ? 'hit-spark' : 'claw-swipe', h.x, h.y - (m.boss ? 4 : 6), { scale: m.boss ? 0.6 : heavy ? 0.6 : 0.7, flip: left });
            if (m.boss) this.vfx.impact(h.x, h.y - 16, 0xff6a3a, true);
          }
          this.float(h.x, h.y - 40, r.miss ? 'MISS' : `-${r.dmg}`, r.miss ? '#cfcfcf' : '#ff6a5a', 10);
          if (!r.miss) { h.setTintFill(0xff8080); this.s.time.delayedCall(70, () => h.clearTint()); }
          if (s.hp <= 0) this.s.heroDie();
        };
        if (base.ranged) {   // archers and spirits fire a projectile; the hit lands when it arrives
          const col = RANGED_COL[m.m.kind] ?? 0xc8a0ff;
          this.s.time.delayedCall(hitMs(m.m.key, 'attack', 260), () => { if (m.alive && !this.s.dead) this.vfx.bolt(m.x, m.y - m.m.size * 0.45, h.x, h.y - 16, col, 0.8, 300, land, m.m.kind === 'skarcher' || m.m.kind === 'goblin'); });
        } else this.s.time.delayedCall(hitMs(m.m.key, 'attack', 220), land);   // the hit lands on the frame the claw / weapon strikes
      }
      if (CH[m.m.key]) {
        const attacking = time - m.atkT < 600;
        if (!attacking) { if (moving) playAnim(m.sp, m.m.key, 'walk', m.dir); else if (m.sp.anims.isPlaying) setIdle(m.sp, m.m.key, m.dir); }
      }
      m.sp.setPosition(m.x, m.y).setDepth(m.y);
      (m.sp.getData('aura') as Phaser.GameObjects.Image | undefined)?.setPosition(m.x, m.y - m.m.size * 0.35).setDepth(m.y - 1);
      (m.sp.getData('aura2') as Phaser.GameObjects.Sprite | undefined)?.setPosition(m.x, m.y + 2).setDepth(m.y + 1);
      (m.sp.getData('sh') as Phaser.GameObjects.Image | undefined)?.setPosition(m.x, m.y - 1);
      const ph = m.sp.getData('ph') as Phaser.GameObjects.Ellipse | undefined;
      if (ph) ph.setPosition(m.x, m.y - m.m.size * 0.3).setDepth(m.y);
      const w = m.boss ? 60 : 22, top = m.y - m.m.size * (m.boss ? 0.95 : 0.85) * (SPRITE_SCALE[m.m.key] ? 1.05 : 1);
      m.bar.clear().fillStyle(0x0b0f0c, 0.8).fillRect(m.x - w / 2 - 1, top - 1, w + 2, 4).fillStyle(m.boss ? 0xff4a3a : 0xd84a3a, 1).fillRect(m.x - w / 2, top, w * Math.max(0, m.hp / m.max), 2);
    }
  }
}
