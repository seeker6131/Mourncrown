// Village defense (test / simulation until online): an enemy BOT guild storms our guild village. Raiders come through the
// gates and smash buildings and defenses; on the alarm our hired guards and our bot guild-mates sprint at them, the
// towers shoot, and the player fights. The battle ends when every raider is down or after 3 minutes; the stars the
// enemy got (what they wrecked) go to the server rules (dev 'guildDefend' -> raidOutcome: losses, or points + shield).
import Phaser from 'phaser';
import { S, bus, EV } from '../core/events';
import { act, refused } from '../net/client';
import { derive, calcDamage, skillMult } from '../systems/stats';
import { saveGame } from '../core/save';
import { sfx } from '../audio/sfx';
import { guildOf, hallLv, barracksLv, meOf, isRuin, bldHp, type Wreck } from '../systems/guild';
import { DEFENSES, defStat, GUARDS, GUILD_BLD, GUILD_BLD_ORDER, RIVAL_NAMES, type GuildBld } from '../data/guild';
import type { SkillDef } from '../data/skills';
import * as L from './villageLayout';
import { CH, playAnim, setIdle, hitMs, formKeyOf } from './chars';
import { fx2 } from './fx2';
import { pxShadow } from './pxShadow';
import { burnFx, fireKey, type GuildTown } from './guildTown';
import { makeRuin, charTint } from './ruin';
import type { War } from '../systems/war';

export interface DefHost extends Phaser.Scene {
  hero: Phaser.GameObjects.Sprite; dead: boolean; canStand(x: number, y: number): boolean;
  combat: { float(x: number, y: number, t: string, col: string, size: number): void; vfx: { bolt(x: number, y: number, tx: number, ty: number, col: number, size?: number, speed?: number, hit?: () => void, arrow?: boolean): void; dust(x: number, y: number, n: number, r: number): void } };
}
interface Unit { side: 'atk' | 'def'; key: string; name: string; sp: Phaser.GameObjects.Sprite; sh: Phaser.GameObjects.Image; bar: Phaser.GameObjects.Graphics; tag: Phaser.GameObjects.Text;
  x: number; y: number; hp: number; max: number; atk: number; range: number; rate: number; speed: number; last: number; dir: number; alive: boolean; busy: boolean; ranged: boolean; magic: boolean }
interface Bld { dmg0?: number; orig?: string; fx?: Phaser.GameObjects.GameObject[]; fk?: string; id: string; name: string; kind: 'hall' | 'building' | 'defense' | 'house'; x: number; y: number; rx: number; hp: number; max: number; alive: boolean; img?: Phaser.GameObjects.Image; shoot?: { dmg: number; range: number; rate: number; next: number; aoe?: number; spikes?: boolean } }

const RANGED = new Set(['hr4', 'hr5', 'hr6', 'hr7', 'hr8', 'hr9', 'np10']);
const MAGIC = new Set(['hr7', 'hr8', 'hr9']);
const dirOf = (dx: number, dy: number) => (Math.round((Math.PI / 2 - Math.atan2(dy, dx)) / (Math.PI / 4)) % 8 + 8) % 8;

export class DefenseBattle {
  units: Unit[] = [];
  blds: Bld[] = [];
  end = 0; over = false; enemy = RIVAL_NAMES[Math.floor(Math.random() * RIVAL_NAMES.length)];
  heroDownUntil = 0;
  waves = 0;
  raider = { hp: 0, atk: 0, forms: [] as string[], spawnT: 0 };
  constructor(public sc: DefHost, public town: GuildTown, public war: War | null = null) { if (war) this.enemy = war.rival.name; }

  // ---------------------------------------------------------------- guild war view (the server runs the fight)
  /** the server's numbers: our buildings burn / fall as the war goes; the raiders on the field match their squad */
  applyWar(w: War, quiet = false) {
    for (const b of this.blds) {
      const q = w.ours.blds.find(x => x.id === b.id); if (!q) continue;
      if (q.hp < b.hp - 0.5) {
        this.liveImg(b); b.hp = q.hp; this.burn(b);
        if (b.hp <= 0 && b.alive) { b.alive = false; if (!quiet) { fx2(this.sc, 'fx_collapse', b.x, b.y + 4, b.y + 5, b.kind === 'defense' ? 0.8 : 1.5); this.sc.combat.vfx.dust(b.x, b.y, 14, b.rx); bus.emit(EV.TOAST, `💥 ${this.enemy} ทำลาย ${b.name}!`, '#ff9a7a'); } }
      }
    }
    const want = Math.min(10, Math.ceil(w.theirs.troops)), alive = this.units.filter(u => u.side === 'atk' && u.alive).length;
    const now = this.sc.time.now;
    if (alive < want && now > this.raider.spawnT) {
      this.raider.spawnT = now + 1500;
      const gates = [{ x: L.NORTH_GATE.x, y: 70 }, { x: L.WEST_EXIT.x + 40, y: L.WEST_EXIT.y }, { x: L.SOUTH_GATE.x, y: L.SOUTH_GATE.y - 30 }];
      for (let i = 0; i < Math.min(2, want - alive); i++) {
        const gt = gates[Math.floor(Math.random() * gates.length)], k = this.raider.forms[Math.floor(Math.random() * this.raider.forms.length)];
        this.add('atk', k, `⚔ ${this.enemy}`, gt.x + (Math.random() - 0.5) * 40, gt.y + Math.random() * 20, this.raider.hp, this.raider.atk, 70);
        fx2(this.sc, 'fx_boss_spawn', gt.x, gt.y + 6, gt.y, 0.9);
      }
    }
  }

  start() {
    const sc = this.sc, s = S(), g = guildOf(s); if (!g) return;
    const d = derive(s), hl = hallLv(s), heroHit = Math.max(d.atk, d.matk);
    this.end = sc.time.now + 180000;
    // our buildings and defenses become targets (their pictures come from the town)
    for (const t of GUILD_BLD_ORDER) {
      const b = g.buildings.find(q => q.type === t)!, P = L.PLOTS[L.PLOT_OF[t]], img = this.town.views.get('b:' + t)?.objs[0] as Phaser.GameObjects.Image | undefined;
      if (isRuin(b)) continue;   // already a ruin: nothing left to burn
      if (this.war && !this.war.ours.blds.some(q => q.id === 'b:' + t)) continue;
      const max = bldHp(t, b.level), d0 = b.dmg ?? 0;
      this.blds.push({ id: 'b:' + t, name: `${GUILD_BLD[t as GuildBld].icon} ${GUILD_BLD[t as GuildBld].name}`, kind: t === 'hall' ? 'hall' : 'building', x: P.x, y: P.y, rx: t === 'hall' ? 84 : 70, hp: max * (1 - d0), max, alive: true, img: img?.setTint ? img : undefined, dmg0: d0, fk: fireKey(d0) });
    }
    { // our own house burns too (it is not counted for the enemy's stars)
      const me = meOf(s), m = me && g.members.find(q => q.id === g.me);
      if (!this.war && m && m.houseLv > 0 && !(m.houseDmg && m.houseDmg >= 1)) {
        const P = L.PLOTS[L.housePlot(m.house)], img = this.town.views.get('h:' + m.house)?.objs.find(o => (o as Phaser.GameObjects.Image).setTint) as Phaser.GameObjects.Image | undefined, max = 500 + 300 * m.houseLv, d0 = m.houseDmg ?? 0;
        this.blds.push({ id: 'house', name: '🏠 บ้านของคุณ', kind: 'house', x: P.x, y: P.y, rx: 44, hp: max * (1 - d0), max, alive: true, img, dmg0: d0, fk: fireKey(d0) });
      }
    }
    for (const q of g.defenses) {
      const D = DEFENSES[q.type], st = defStat(D, q.level), P = L.SLOTS[q.slot], img = this.town.views.get('d:' + q.slot)?.objs[0] as Phaser.GameObjects.Image | undefined;
      this.blds.push({ id: 'd:' + q.slot, name: D.name, kind: 'defense', x: P.x, y: P.y, rx: 24, hp: q.hp, max: st.hp, alive: true, img: img?.setTint ? img : undefined, shoot: st.dmg ? { dmg: st.dmg, range: st.range, rate: st.rate || 1200, next: 0, aoe: D.aoe, spikes: q.type === 'spikes' } : undefined });
    }
    // the raiders: rival players (bots) of every class, as strong as our village
    const forms = ['hr1', 'hr5', 'hr10', 'hr7', 'hr2', 'hr11', 'hr4', 'hr8', 'hr3', 'hr6'].filter(k => CH[k]);
    const gates = [{ x: L.NORTH_GATE.x, y: 70 }, { x: L.WEST_EXIT.x + 40, y: L.WEST_EXIT.y }, { x: L.SOUTH_GATE.x, y: L.SOUTH_GATE.y - 30 }];
    // three waves through the three gates, ~12 s apart, so the fight lasts and the player matters
    const n = Math.min(15, 6 + hl * 2), per = Math.ceil(n / 3);
    this.raider = { hp: heroHit * 6, atk: d.maxHp / 20, forms, spawnT: 0 };
    this.waves = this.war ? 0 : 3;
    if (!this.war) for (let w = 0; w < 3; w++) sc.time.delayedCall(w * 12000, () => {
      if (this.over) return;
      for (let i = w * per; i < Math.min(n, (w + 1) * per); i++) {
        const gt = gates[i % gates.length], k = forms[i % forms.length];
        this.add('atk', k, `⚔ ${this.enemy}`, gt.x + ((i * 23) % 50) - 25, gt.y + ((i * 17) % 30), heroHit * 6, d.maxHp / 20, 70);
      }
      for (const gt of gates) fx2(sc, 'fx_boss_spawn', gt.x, gt.y + 6, gt.y, 1.2);
      this.waves--; if (w > 0) bus.emit(EV.TOAST, `⚔ ศัตรูระลอกที่ ${w + 1} มาแล้ว!`, '#ff8a6a');
    });
    // defenders: our hired guards and the other members, from where they are now (the town hides its walkers meanwhile)
    const k = 1 + 0.15 * (Math.max(1, barracksLv(s)) - 1);
    const walkers = this.town.guards?.npcs ?? [];
    for (const w of walkers) { w.sp.setVisible(false); w.shadow.setVisible(false); w.tag.setVisible(false); }
    let gi = 0;
    for (const t of ['spear', 'archer'] as const) for (let i = 0; i < g.guards[t]; i++) {
      const w = walkers.filter(q => q.key === GUARDS[t].key)[i], gs = GUARDS[t];
      this.add('def', gs.key, gs.name, w?.sp.x ?? L.PLAZA.x + gi * 12, w?.sp.y ?? L.PLAZA.y + 60, Math.max(gs.hp * k, heroHit * 4) * (g.hungry ? 0.5 : 1), Math.max(gs.atk * k * 3, heroHit * 0.6) * (g.hungry ? 0.5 : 1), 98); gi++;
    }
    for (const m of g.members) {
      if (!m.sim) continue;
      const fk = formKeyOf(m.cls, m.lv >= 80 ? 3 : m.lv >= 40 ? 2 : m.lv >= 10 ? 1 : 0), w = walkers.find(q => q.name.includes(m.name));
      this.add('def', fk, m.name, w?.sp.x ?? L.doorOf(L.housePlot(m.house)).x, w?.sp.y ?? L.doorOf(L.housePlot(m.house)).y + 16, heroHit * 5, heroHit * 0.9, 102);
    }
    sfx.cast(); sc.cameras.main.flash(250, 255, 60, 40);
    if (this.war) { this.applyWar(this.war, true); bus.emit(EV.TOAST, `🛡 หมู่บ้านเรา: ${this.enemy} กำลังบุก! ฆ่าทหารศัตรู = กองทัพศัตรูอ่อนลง`, '#ff8a6a'); return; }
    bus.emit(EV.TOAST, `⚠ ${this.enemy} บุกหมู่บ้าน! ทหารและเพื่อนกิลด์วิ่งไปป้องกัน — ช่วยกันสู้!`, '#ff8a6a');
  }
  private add(side: 'atk' | 'def', key: string, name: string, x: number, y: number, hp: number, atk: number, speed: number) {
    if (!CH[key]) return;
    const sc = this.sc, sp = sc.add.sprite(x, y, `c_${key}_idle`).setDepth(y); setIdle(sp, key, 0);
    const tag = sc.add.text(x, y, name, { fontFamily: 'sans-serif', fontSize: '6px', color: side === 'atk' ? '#ff9a8a' : '#9fffb0', stroke: '#0b0f0c', strokeThickness: 2, resolution: 8 }).setOrigin(0.5, 1).setDepth(99990);
    this.units.push({ side, key, name, sp, sh: pxShadow(sc, x, y, 22, 8, 0.45), bar: sc.add.graphics().setDepth(99961), tag, x, y, hp, max: hp, atk, range: RANGED.has(key) ? 130 : 30, rate: 1100 + Math.random() * 400, speed, last: 0, dir: 0, alive: true, busy: false, ranged: RANGED.has(key), magic: MAGIC.has(key) });
  }

  stars() { const cnt = this.blds.filter(b => b.kind !== 'house'), all = cnt.length, down = cnt.filter(b => !b.alive).length, hall = this.blds.some(b => b.kind === 'hall' && !b.alive), p = down / Math.max(1, all); return p >= 1 ? 3 : hall && p >= 0.5 ? 2 : hall || p >= 0.5 ? 1 : 0; }
  title() { const l = Math.max(0, Math.ceil((this.end - this.sc.time.now) / 1000)), left = this.units.filter(u => u.side === 'atk' && u.alive).length + (this.waves > 0 ? ' (+ระลอกถัดไป)' : ''); return `🛡 ป้องกันหมู่บ้านจาก ${this.enemy} • ⏱ ${Math.floor(l / 60)}:${String(l % 60).padStart(2, '0')} • ศัตรูเหลือ ${left} • เสียหาย ${'⭐'.repeat(this.stars()) || 'ยังไม่เสียอะไร'}`; }

  heroAttack(form: string) {
    const h = this.sc.hero, ranged = RANGED.has(form), reach = ranged ? 150 : 48, d = derive(S()), magic = MAGIC.has(form);
    this.sc.time.delayedCall(hitMs(form, 'attack', ranged ? 260 : 120), () => {
      const t = this.units.filter(u => u.side === 'atk' && u.alive && Math.hypot(u.x - h.x, u.y - h.y) < reach).sort((a, b) => Math.hypot(a.x - h.x, a.y - h.y) - Math.hypot(b.x - h.x, b.y - h.y))[0];
      if (!t || this.over) return;
      const r = calcDamage(magic ? d.matk : d.atk, 6, 1, d.crit), land = () => { if (!t.alive) return; fx2(this.sc, r.crit ? 'fx_hit_crit' : magic ? 'fx_hit_magic' : ranged ? 'fx_hit_arrow' : 'fx_hit_sword', t.x, t.y - 18, 99952, 0.85); this.sc.combat.float(t.x, t.y - 40, `${r.dmg}`, r.crit ? '#ffcf3a' : '#ffffff', r.crit ? 14 : 10); this.hurt(t, r.dmg, true); };
      if (ranged) this.sc.combat.vfx.bolt(h.x, h.y - 18, t.x, t.y - 18, magic ? 0xc08aff : 0xffe8a0, 1, 900, land, !magic); else land();
    });
  }
  skill(sk: SkillDef) {
    if (this.over || sk.kind === 'buff' || sk.kind === 'heal' || sk.kind === 'shield') return;
    const s = S(), d = derive(s), h = this.sc.hero, far = sk.kind === 'shot' || sk.kind === 'pierce' || sk.kind === 'rain';
    const R = far ? 170 : (sk.radius ?? sk.range ?? 50) + 12, mult = sk.power * skillMult(s, sk.id) * (far ? 1 : Math.max(1, sk.count ?? 1));
    this.sc.time.delayedCall(sk.kind === 'leap' ? 360 : 260, () => {
      const tg = this.units.filter(u => u.side === 'atk' && u.alive && Math.hypot(u.x - h.x, u.y - h.y) < R);
      for (const u of far ? tg.slice(0, sk.count ?? 1) : tg) { const r = calcDamage(sk.stat === 'matk' ? d.matk : d.atk, 6, mult, d.crit); this.sc.combat.float(u.x, u.y - 40, `${r.dmg}`, '#ffcf3a', 12); this.hurt(u, r.dmg, true); }
    });
  }
  hurt(u: Unit, dmg: number, byHero = false) {
    if (!u.alive) return;
    u.hp -= dmg; u.sp.setTintFill(0xffffff); this.sc.time.delayedCall(60, () => u.sp.clearTint());
    if (u.hp > 0) return;
    u.alive = false; u.bar.clear(); u.tag.destroy(); u.sh.destroy();
    fx2(this.sc, 'fx_mon_death', u.x, u.y - 6, u.y + 1, 0.9);
    this.sc.tweens.add({ targets: u.sp, alpha: 0, angle: u.side === 'atk' ? 80 : -80, duration: 500, onComplete: () => u.sp.destroy() });
    if (this.war) { if (u.side === 'atk' && byHero) act('warKill', {}); return; }
    if (u.side === 'atk' && this.waves <= 0 && this.units.every(q => q.side !== 'atk' || !q.alive)) this.finish();
  }
  hurtBld(b: Bld, dmg: number) {
    if (!b.alive) return;
    this.liveImg(b);
    if (this.war) { if (b.img) { b.img.setTintFill(0xffb0a0); this.sc.time.delayedCall(60, () => b.img?.active && b.img.setTint(charTint(b.fk === 'ruin' ? 0 : Math.max(0, 1 - b.hp / b.max)))); } return; }   // the server owns the damage
    b.hp -= dmg; if (b.img) { b.img.setTintFill(0xffb0a0); this.sc.time.delayedCall(60, () => b.img?.active && b.img.setTint(charTint(b.fk === 'ruin' ? 0 : Math.max(0, 1 - b.hp / b.max)))); }
    this.burn(b);
    if (b.hp > 0) return;
    b.alive = false; fx2(this.sc, 'fx_collapse', b.x, b.y + 4, b.y + 5, b.kind === 'defense' ? 0.8 : 1.5); this.sc.combat.vfx.dust(b.x, b.y, 14, b.rx);
    bus.emit(EV.TOAST, `💥 ${this.enemy} ทำลาย ${b.name}!`, '#ff9a7a');
  }
  /** flames grow as a building loses HP (same look for every building); at 0 it falls into a burning ruin */
  /** the town may redraw a building while we fight (its state changed): pick up the new picture */
  liveImg(b: Bld) {
    if (b.img?.active) return;
    const id = b.id === 'house' ? 'h:' + (guildOf(S())?.members.find(m => m.id === guildOf(S())!.me)?.house ?? -1) : b.id;
    b.img = this.town.views.get(id)?.objs.find(o => (o as Phaser.GameObjects.Image).setTint && o.active) as Phaser.GameObjects.Image | undefined;
    b.orig = undefined; b.fk = undefined;
  }
  burn(b: Bld) {
    if (!b.img?.active) return;
    const f = Math.max(0, Math.min(1, 1 - b.hp / b.max)), fk = b.hp <= 0 ? 'ruin' : fireKey(f >= 0.15 ? f : 0);
    if (fk === b.fk) return;
    b.fk = fk; b.fx?.forEach(o => o.destroy());
    if (fk === 'ruin') { const src = b.img.texture.key, dst = 'o_ruin_' + src.replace(/^o_/, ''); b.orig ??= src; if (makeRuin(this.sc, src, dst)) b.img.setTexture(dst); }
    b.fx = fk ? burnFx(this.sc, b.img, fk === 'ruin' ? 1 : f) : [];
  }
  hitHero(dmg: number) {
    const s = S(), d = derive(s), r = calcDamage(dmg, d.def, 1, 0.05, Math.random, d.evade), h = this.sc.hero;
    if (this.sc.time.now < this.heroDownUntil) return;
    if (r.miss) { this.sc.combat.float(h.x, h.y - 40, 'MISS', '#cfcfcf', 10); return; }
    s.hp = Math.max(0, s.hp - r.dmg); sfx.hurt(); this.sc.combat.float(h.x, h.y - 40, `-${r.dmg}`, '#ff6a5a', 10);
    h.setTintFill(0xff8080); this.sc.time.delayedCall(70, () => h.clearTint());
    if (s.hp <= 0) {   // knocked out: back on your feet at the plaza a moment later, the fight goes on
      this.heroDownUntil = this.sc.time.now + 3000; h.setAlpha(0.3);
      bus.emit(EV.TOAST, '💀 ล้มลง! ลุกขึ้นที่ลานกลางใน 3 วินาที', '#ff8a8a');
      this.sc.time.delayedCall(3000, () => { s.hp = Math.round(d.maxHp * 0.5); h.setPosition(L.VILLAGE_SPAWN.x, L.VILLAGE_SPAWN.y).setAlpha(1); });
    }
  }

  update(time: number, dt: number) {
    if (this.over) return;
    if (!this.war && time > this.end) { this.finish(); return; }
    const h = this.sc.hero, heroUp = time > this.heroDownUntil;
    for (const u of this.units) {
      if (!u.alive) continue;
      // pick a target: raiders hit the nearest defender / the hero when close, otherwise the nearest building;
      // defenders go for the nearest raider anywhere
      let tx = 0, ty = 0, hit: (() => void) | null = null, reach = u.range;
      if (u.side === 'atk') {
        const foes = this.units.filter(q => q.side === 'def' && q.alive), near = foes.sort((a, b) => Math.hypot(a.x - u.x, a.y - u.y) - Math.hypot(b.x - u.x, b.y - u.y))[0];
        const dh = heroUp ? Math.hypot(h.x - u.x, h.y - u.y) : 1e9, dn = near ? Math.hypot(near.x - u.x, near.y - u.y) : 1e9;
        if (Math.min(dh, dn) < 90) { if (dh < dn) { tx = h.x; ty = h.y; hit = () => this.hitHero(u.atk); } else { tx = near!.x; ty = near!.y; const n2 = near!; hit = () => this.hurt(n2, u.atk); } }
        else {
          const b = this.blds.filter(q => q.alive).sort((a, c) => Math.hypot(a.x - u.x, a.y + 20 - u.y) - Math.hypot(c.x - u.x, c.y + 20 - u.y))[0];
          if (!b) { if (!this.war) { this.finish(); return; } continue; }
          tx = b.x + Math.max(-b.rx * 0.6, Math.min(b.rx * 0.6, u.x - b.x)); ty = b.y + 18; reach = u.ranged ? u.range : 26; const b2 = b; hit = () => this.hurtBld(b2, b2.max / (b2.kind === 'hall' ? 30 : b2.kind === 'defense' ? 10 : 18));   // ~18 hits a building, ~30 the hall
        }
      } else {
        const t = this.units.filter(q => q.side === 'atk' && q.alive).sort((a, b) => Math.hypot(a.x - u.x, a.y - u.y) - Math.hypot(b.x - u.x, b.y - u.y))[0];
        if (!t) continue; tx = t.x; ty = t.y; hit = () => this.hurt(t, u.atk);
      }
      const dx = tx - u.x, dy = ty - u.y, dist = Math.hypot(dx, dy);
      if (!u.busy && dist > reach) {
        this.step(u, dx / dist, dy / dist, u.speed * dt / 1000);
        u.dir = dirOf(dx, dy); playAnim(u.sp, u.key, 'walk', u.dir);
      } else if (!u.busy && time - u.last > u.rate && hit) {
        u.last = time; u.busy = true; u.dir = dirOf(dx, dy); playAnim(u.sp, u.key, 'attack', u.dir, false);
        const fire = hit;
        this.sc.time.delayedCall(hitMs(u.key, 'attack', 300), () => {
          if (!u.alive || this.over) return;
          if (u.ranged) this.sc.combat.vfx.bolt(u.x, u.y - 18, tx, ty - 16, u.magic ? 0xc08aff : 0xffe8a0, 1, 750, fire, !u.magic); else fire();
        });
        this.sc.time.delayedCall(700, () => { u.busy = false; });
      } else if (!u.busy) setIdle(u.sp, u.key, u.dir);
      u.sp.setPosition(u.x, u.y).setDepth(u.y); u.sh.setPosition(u.x, u.y); u.tag.setPosition(u.x, u.y - 40);
      if (u.hp < u.max) u.bar.clear().fillStyle(0x1a0a08, 0.9).fillRect(u.x - 12, u.y - 50, 24, 4).fillStyle(u.side === 'atk' ? 0xd83a2a : 0x4ad86a, 1).fillRect(u.x - 11, u.y - 49, 22 * u.hp / u.max, 2);
    }
    // our towers shoot the raiders, spikes bite them
    for (const b of this.blds) {
      const T = b.shoot; if (!b.alive || !T || time < T.next) continue;
      const t = this.units.filter(u => u.side === 'atk' && u.alive && Math.hypot(u.x - b.x, u.y - b.y) < (T.spikes ? 32 : T.range)).sort((a, c) => Math.hypot(a.x - b.x, a.y - b.y) - Math.hypot(c.x - b.x, c.y - b.y))[0];
      if (!t) continue; T.next = time + T.rate;
      if (T.spikes) { this.hurt(t, T.dmg); continue; }
      const ty = t.y - 16;
      this.sc.combat.vfx.bolt(b.x, b.y - 40, t.x, ty, T.aoe ? 0x2a2a2a : 0xffe8a0, T.aoe ? 1.5 : 1, T.aoe ? 320 : 700, () => {
        if (T.aoe) { fx2(this.sc, 'fx_boom', t.x, ty + 10, ty + 10, 0.8); for (const u of this.units) if (u.side === 'atk' && u.alive && Math.hypot(u.x - t.x, u.y - t.y) < T.aoe) this.hurt(u, T.dmg); }
        else this.hurt(t, T.dmg);
      }, !T.aoe);
    }
  }

  /** walk toward (ax, ay); when the straight way is blocked, try turning further and further to either side */
  step(u: Unit, ax: number, ay: number, sp: number) {
    const a0 = Math.atan2(ay, ax), side = (u.dir % 2) ? 1 : -1;
    for (const da of [0, 0.5, -0.5, 1, -1, 1.6, -1.6, 2.3, -2.3]) {
      const a = a0 + da * side, nx = u.x + Math.cos(a) * sp, ny = u.y + Math.sin(a) * sp;
      if (this.sc.canStand(nx, ny)) { u.x = nx; u.y = ny; return; }
    }
  }
  finish() {
    if (this.over) return; this.over = true;
    // what burned: the share of toughness each building lost in this fight (the server adds it to the damage it had)
    const wreck: Wreck = { b: {} };
    for (const b of this.blds) {
      const lost = Math.max(0, (b.alive ? 1 - b.hp / b.max : 1) - (b.dmg0 ?? 0)); if (lost < 0.05) continue;
      if (b.kind === 'house') wreck.house = lost; else if (b.id.startsWith('b:')) wreck.b![b.id.slice(2) as GuildBld] = b.alive ? lost : 1;
    }
    const stars = this.stars(), r = act('dev', { op: 'guildDefend', n: stars, name: this.enemy, wreck });
    if (!refused(r)) for (const m of r.got) bus.emit(EV.TOAST, m, m.startsWith('🛡') ? '#9fffb0' : '#ff9a7a');
    if (!stars) { fx2(this.sc, 'fx_raid_victory', this.sc.hero.x, this.sc.hero.y - 20, 99995, 1.4); sfx.levelUp(); bus.emit(EV.TOAST, '🏆 ป้องกันหมู่บ้านสำเร็จ!', '#ffd84a'); }
    saveGame(S()); bus.emit(EV.STATE_CHANGED);
    this.sc.time.delayedCall(2500, () => {
      for (const u of this.units) { u.sp.destroy(); u.sh.destroy(); u.bar.destroy(); if (u.tag.active) u.tag.destroy(); }
      for (const b of this.blds) { b.fx?.forEach(o => o.destroy()); if (b.img?.active) { if (b.orig) b.img.setTexture(b.orig); b.img.clearTint(); b.img.setAlpha(1); } }
      this.town.render();   // the village now shows what really burned (fires / ruins from the saved state)
      for (const w of this.town.guards?.npcs ?? []) { w.sp.setVisible(true); w.shadow.setVisible(true); w.tag.setVisible(true); }
      this.units = []; (this.sc as unknown as { defense?: DefenseBattle }).defense = undefined;
    });
  }
}
