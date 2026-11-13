// Raid battle (docs/GUILD_WAR.md 7): the hero goes into a matched rival village (a BOT village until the game is online)
// with 3 minutes to wreck it. Buildings and defenses have HP; towers shoot back, spikes hurt, bunkers send soldiers out,
// the war banner makes everything near it stronger; the village's hired guards come running. Stars: half wrecked or the
// guild hall = ⭐, hall + half = ⭐⭐, everything = ⭐⭐⭐. The server checks the time and the damage, then pays out (raidEnd).
import Phaser from 'phaser';
import { S, bus, EV } from '../core/events';
import { act, refused } from '../net/client';
import { derive, calcDamage, skillMult } from '../systems/stats';
import type { SkillDef } from '../data/skills';
import { saveGame } from '../core/save';
import { sfx } from '../audio/sfx';
import { guildOf, type Rival, type RivalStruct } from '../systems/guild';
import type { War } from '../systems/war';
import { DEFENSES, defStat, GUARDS, GUILD_BLD, type DefenseId, type GuardType, type GuildBld } from '../data/guild';
import * as L from './villageLayout';
import { CH, playAnim, setIdle, hitMs, formKeyOf } from './chars';
import { fx2 } from './fx2';
import { pxShadow } from './pxShadow';
import { burnFx, fireKey } from './guildTown';
import { makeRuin, charTint } from './ruin';
import { flagPole } from './flag';
import { flagFor } from '../data/flag';

export interface RaidStart { rival: Rival; structs: RivalStruct[]; secs: number; /** guild war view: the server runs the fight (systems/war.ts) */ war?: boolean }
interface Ally { key: string; sp: Phaser.GameObjects.Sprite; sh: Phaser.GameObjects.Image; tag: Phaser.GameObjects.Text; x: number; y: number; dir: number; busy: boolean; last: number; ranged: boolean; gone?: boolean }
/** what the battle needs from the top-down scene */
export interface RaidHost extends Phaser.Scene {
  hero: Phaser.GameObjects.Sprite; dead: boolean;
  obj(name: string, x: number, y: number, fw?: number, fd?: number, shadow?: boolean, sc?: number): Phaser.GameObjects.Image | null;
  canStand(x: number, y: number): boolean;
  combat: { float(x: number, y: number, t: string, col: string, size: number): void; vfx: { bolt(x: number, y: number, tx: number, ty: number, col: number, size?: number, speed?: number, hit?: () => void, arrow?: boolean): void; impact(x: number, y: number, col: number, big?: boolean): void; dust(x: number, y: number, n: number, r: number): void } };
}
interface Target { fk?: string; fx?: Phaser.GameObjects.GameObject[]; id: string; name: string; kind: 'hall' | 'building' | 'defense'; x: number; y: number; rx: number; ry: number; hp: number; max: number; alive: boolean; img: Phaser.GameObjects.Image | null; bar: Phaser.GameObjects.Graphics; def?: { id: DefenseId; dmg: number; range: number; rate: number; aoe?: number; slow?: number; spawn?: number; buff?: number; shot?: string; next: number; spawned?: boolean } }
interface Guard { type: GuardType; sp: Phaser.GameObjects.Sprite; sh: Phaser.GameObjects.Image; bar: Phaser.GameObjects.Graphics; x: number; y: number; hp: number; max: number; atk: number; range: number; rate: number; last: number; dir: number; alive: boolean; post: { x: number; y: number }; busy: boolean }

const ART: Record<GuildBld, string> = { hall: 'townhall', barracks: 'tower', forge: 'forge', kitchen: 'kitchen', tavern: 'tavern', market: 'market', warehouse: 'warehouse', lumber: 'lumber', quarry: 'quarry', barn: 'barn' };
const artLv = (lv: number) => lv >= 5 ? 2 : lv >= 3 ? 1 : 0;
const DEF_SC: Record<string, number> = { spikes: 0.62, palisade: 0.7, archer: 0.62, cannon: 0.6, ballista: 0.62, bunker: 0.6, banner: 0.8 };
const RANGED = new Set(['hr4', 'hr5', 'hr6', 'hr7', 'hr8', 'hr9']);
const dirOf = (dx: number, dy: number) => (Math.round((Math.PI / 2 - Math.atan2(dy, dx)) / (Math.PI / 4)) % 8 + 8) % 8;

export class RaidBattle {
  targets: Target[] = [];
  guards: Guard[] = [];
  start = 0; end = 0; over = false;
  allies: Ally[] = [];
  heroDownUntil = 0;
  constructor(public sc: RaidHost, public data: RaidStart) {}

  // ---------------------------------------------------------------- guild war view (the system fights; the hero may help)
  /** the server's numbers: buildings burn / fall as the war goes; our squad on the field matches its strength */
  applyWar(w: War, quiet = false) {
    for (const t of this.targets) {
      const b = w.theirs.blds.find(q => q.id === t.id); if (!b) continue;
      if (b.hp < t.hp - 0.5) { t.hp = b.hp; this.burn(t); if (t.hp <= 0 && t.alive) this.fall(t, quiet); }
    }
    const want = Math.min(8, Math.ceil(w.ours.troops * 0.8)), have = this.allies.filter(a => !a.gone);
    for (let i = have.length; i < want; i++) this.addAlly(i);
    for (let i = want; i < have.length; i++) { const a = have[i]; a.gone = true; this.sc.tweens.add({ targets: [a.sp, a.tag], alpha: 0, angle: 70, duration: 500, onComplete: () => { a.sp.destroy(); a.tag.destroy(); a.sh.destroy(); } }); }
  }
  private addAlly(i: number) {
    const g = guildOf(S()); if (!g) return;
    const m = g.members[i % g.members.length], key = formKeyOf(m.cls, m.t ?? (m.lv >= 80 ? 3 : m.lv >= 40 ? 2 : m.lv >= 10 ? 1 : 0), m.lk); if (!CH[key]) return;   // (t: the form the member wears)
    const x = L.SOUTH_GATE.x + ((i * 29) % 90) - 45, y = L.SOUTH_GATE.y - 20 - ((i * 17) % 40);
    const sp = this.sc.add.sprite(x, y, `c_${key}_idle`).setDepth(y); setIdle(sp, key, 4);
    const tag = this.sc.add.text(x, y - 40, `🛡 ${m.name}`, { fontFamily: 'sans-serif', fontSize: '6px', color: '#9fffb0', stroke: '#0b0f0c', strokeThickness: 2, resolution: 8 }).setOrigin(0.5, 1).setDepth(99990);
    this.allies.push({ key, sp, sh: pxShadow(this.sc, x, y, 22, 8, 0.45), tag, x, y, dir: 4, busy: false, last: 0, ranged: RANGED.has(key) });
  }
  /** our squad: each member walks to the nearest standing building and swings at it (the damage itself is the server's) */
  private allyStep(time: number, dt: number) {
    for (const a of this.allies) {
      if (a.gone) continue;
      const t = this.targets.filter(q => q.alive).sort((p, q) => this.dist(p, a.x, a.y) - this.dist(q, a.x, a.y))[0];
      if (!t) { if (!a.busy) setIdle(a.sp, a.key, a.dir); continue; }
      const reach = a.ranged ? 110 : 22, d = this.dist(t, a.x, a.y), tx = t.x + Math.max(-t.rx * 0.6, Math.min(t.rx * 0.6, a.x - t.x)), ty = t.y + 14;
      if (!a.busy && d > reach) {
        const ax = tx - a.x, ay = ty - a.y, ad = Math.max(1, Math.hypot(ax, ay)), sp = 74 * dt / 1000;
        for (const da of [0, 0.5, -0.5, 1, -1, 1.6, -1.6]) { const an = Math.atan2(ay, ax) + da, nx = a.x + Math.cos(an) * sp, ny = a.y + Math.sin(an) * sp; if (this.sc.canStand(nx, ny)) { a.x = nx; a.y = ny; break; } }
        a.dir = dirOf(ax, ay); playAnim(a.sp, a.key, 'walk', a.dir); void ad;
      } else if (!a.busy && time - a.last > 1100 + Math.random() * 500) {
        a.last = time; a.busy = true; a.dir = dirOf(tx - a.x, ty - a.y); playAnim(a.sp, a.key, 'attack', a.dir, false);
        this.sc.time.delayedCall(hitMs(a.key, 'attack', 260), () => {
          if (this.over || !t.alive) return;
          const hit = () => { if (t.img?.active) { t.img.setTintFill(0xffd8b0); this.sc.time.delayedCall(50, () => t.img?.active && t.img.setTint(charTint(t.fk === 'ruin' ? 0 : Math.max(0, 1 - t.hp / t.max)))); } fx2(this.sc, a.ranged ? 'fx_hit_arrow' : 'fx_hit_sword', tx, t.y - 24, 99950, 0.6); };
          if (a.ranged) this.sc.combat.vfx.bolt(a.x, a.y - 18, tx, t.y - 24, 0xffe8a0, 0.8, 700, hit, true); else hit();
        });
        this.sc.time.delayedCall(700, () => { a.busy = false; });
      } else if (!a.busy && d <= reach) setIdle(a.sp, a.key, a.dir);
      a.sp.setPosition(a.x, a.y).setDepth(a.y); a.sh.setPosition(a.x, a.y); a.tag.setPosition(a.x, a.y - 40);
    }
  }
  /** a building gives way: dust, a collapse, a burning ruin */
  private fall(t: Target, quiet = false) {
    t.alive = false; t.hp = 0; t.bar.clear(); this.burn(t);
    if (quiet) return;
    fx2(this.sc, 'fx_collapse', t.x, t.y + 4, t.y + 5, t.kind === 'defense' ? 0.8 : 1.6); this.sc.combat.vfx.dust(t.x, t.y, 16, t.rx);
  }

  /** draw the rival village: its buildings (level art), house levels (scenery), defenses on the wall road, guards at their posts */
  build() {
    const sc = this.sc, r = this.data.rival;
    this.start = sc.time.now; this.end = this.start + this.data.secs * 1000;
    for (const st of this.data.structs) {
      if (st.kind === 'defense') {
        const P = L.SLOTS[st.slot ?? 0], d = DEFENSES[st.type as DefenseId], s2 = defStat(d, st.level);
        const img = sc.obj('def_' + st.type, P.x, P.y, 0.6, 6, true, DEF_SC[st.type] ?? 0.65);
        this.add(st, d.name, P.x, P.y, 26, 16, img, { id: d.id, dmg: s2.dmg, range: s2.range, rate: s2.rate, aoe: d.aoe, slow: d.slow, spawn: d.spawn, buff: d.buff, shot: d.shot, next: 0 });
      } else {
        const t = st.type as GuildBld, P = L.PLOTS[L.PLOT_OF[t]];
        const img = sc.obj(`${ART[t]}_${artLv(st.level)}`, P.x, P.y, 0.82, 50, true, t === 'hall' ? 1.1 : 1);
        if (t === 'hall') { const fpx = flagFor(this.data.rival.name); flagPole(sc, P.x - 120, P.y + 30, fpx, 2, 66); flagPole(sc, P.x + 120, P.y + 30, fpx, 2, 66); }   // the enemy guild's flag
        this.add(st, `${GUILD_BLD[t].icon} ${GUILD_BLD[t].name} Lv${st.level}`, P.x, P.y, t === 'hall' ? 84 : 70, 46, img);
      }
    }
    // the members' houses are scenery (houses are never raided)
    r.houses.forEach((lv, i) => { if (lv > 0) { const P = L.PLOTS[L.housePlot(i)]; sc.obj(`house_${artLv(lv)}`, P.x, P.y, 0.82, 22, true, L.HOUSE_SCALE); } });
    // guards: spearmen and archers at the hall, the plaza and the gates
    const posts = [L.PLOTS[L.HALL_PLOT], { x: L.PLAZA.x - 60, y: L.PLAZA.y + 70 }, { x: L.NORTH_GATE.x, y: 140 }, L.PLOTS[L.PLOT_OF.warehouse], L.PLOTS[L.PLOT_OF.barracks], L.PLOTS[L.PLOT_OF.market]];
    const k = 1 + 0.15 * (r.barracks - 1);
    for (let i = 0; i < r.guards; i++) { const p = posts[i % posts.length]; this.addGuard(i % 3 === 2 ? 'archer' : 'spear', p.x + ((i * 37) % 60) - 30, p.y + 40 + ((i * 23) % 30), k); }
  }
  private add(st: RivalStruct, name: string, x: number, y: number, rx: number, ry: number, img: Phaser.GameObjects.Image | null, def?: Target['def']) {
    const bar = this.sc.add.graphics().setDepth(99960);
    this.targets.push({ id: st.id, name, kind: st.kind, x, y, rx, ry, hp: st.hp, max: st.hp, alive: true, img, bar, def });
  }
  addGuard(type: GuardType, x: number, y: number, k = 1) {
    const g = GUARDS[type], key = g.key; if (!CH[key]) return;
    const sp = this.sc.add.sprite(x, y, `c_${key}_idle`).setDepth(y); setIdle(sp, key, 0);
    const sh = pxShadow(this.sc, x, y, 22, 8, 0.45);
    this.guards.push({ type, sp, sh, bar: this.sc.add.graphics().setDepth(99960), x, y, hp: g.hp * k, max: g.hp * k, atk: g.atk * k, range: g.range, rate: g.rate, last: 0, dir: 0, alive: true, post: { x, y }, busy: false });
  }

  /** stars as the result screen will count them */
  stars() {
    const all = this.targets.length, down = this.targets.filter(t => !t.alive).length, hall = this.targets.some(t => t.kind === 'hall' && !t.alive), pct = down / Math.max(1, all);
    return pct >= 1 ? 3 : hall && pct >= 0.5 ? 2 : hall || pct >= 0.5 ? 1 : 0;
  }
  left() { return Math.max(0, Math.ceil((this.end - this.sc.time.now) / 1000)); }
  title() { const l = this.left(), d = this.targets.filter(t => !t.alive).length; return `⚔ ปล้น ${this.data.rival.name} • ⏱ ${Math.floor(l / 60)}:${String(l % 60).padStart(2, '0')} • ทำลาย ${d}/${this.targets.length} • ${'⭐'.repeat(this.stars()) || 'ยังไม่ได้ดาว'}`; }

  /** a hero swing: a guard in reach first, else the nearest building / defense in reach */
  heroAttack(form: string) {
    const h = this.sc.hero, ranged = RANGED.has(form), reach = ranged ? 150 : 46, d = derive(S());
    const magic = ['hr7', 'hr8', 'hr9'].includes(form);
    this.sc.time.delayedCall(hitMs(form, 'attack', ranged ? 260 : 120), () => {
      if (this.over) return;
      const g = this.guards.filter(q => q.alive && Math.hypot(q.x - h.x, q.y - h.y) < reach + 8).sort((a, b) => Math.hypot(a.x - h.x, a.y - h.y) - Math.hypot(b.x - h.x, b.y - h.y))[0];
      const t = g ? null : this.targets.filter(q => q.alive && this.dist(q, h.x, h.y) < reach).sort((a, b) => this.dist(a, h.x, h.y) - this.dist(b, h.x, h.y))[0];
      const tx = g ? g.x : t?.x, ty = g ? g.y - 18 : t ? t.y - 30 : 0; if (tx === undefined) return;
      const r = calcDamage(magic ? d.matk : d.atk, g ? 8 : 0, 1, d.crit);
      const land = () => {
        if (this.over) return;
        fx2(this.sc, r.crit ? 'fx_hit_crit' : magic ? 'fx_hit_magic' : ranged ? 'fx_hit_arrow' : +form.replace(/\D/g, '') >= 10 ? 'fx_hit_holy' : form === 'hero' || form === 'hg' ? 'fx_hit_punch' : 'fx_hit_sword', tx, ty, 99952, 0.9);
        this.sc.combat.float(tx, ty - 22, `${r.dmg}`, r.crit ? '#ffcf3a' : '#ffffff', r.crit ? 14 : 10);
        if (g) this.hurtGuard(g, r.dmg); else if (t) this.hurtTarget(t, r.dmg);
      };
      if (ranged) this.sc.combat.vfx.bolt(h.x, h.y - 18, tx, ty, magic ? 0xc08aff : 0xffe8a0, 1, 900, land, !magic); else land();
    });
  }
  /** skills hit buildings too: close skills everything round the hero, ranged skills the nearest few in sight */
  skill(sk: SkillDef) {
    if (this.over || sk.kind === 'buff' || sk.kind === 'heal' || sk.kind === 'shield') return;
    const s = S(), d = derive(s), atk = sk.stat === 'matk' ? d.matk : d.atk, h = this.sc.hero;
    const far = sk.kind === 'shot' || sk.kind === 'pierce' || sk.kind === 'rain', R = far ? 170 : (sk.radius ?? sk.range ?? 50) + 12;
    const mult = sk.power * skillMult(s, sk.id) * (far ? 1 : Math.max(1, sk.count ?? 1));
    this.sc.time.delayedCall(sk.kind === 'leap' ? 360 : 260, () => {
      if (this.over) return;
      for (const g of this.guards) if (g.alive && Math.hypot(g.x - h.x, g.y - h.y) < R) { const r = calcDamage(atk, 8, mult, d.crit); this.sc.combat.float(g.x, g.y - 40, `${r.dmg}`, '#ffcf3a', 11); this.hurtGuard(g, r.dmg); }
      const tg = this.targets.filter(t => t.alive && this.dist(t, h.x, h.y) < R).sort((a, b) => this.dist(a, h.x, h.y) - this.dist(b, h.x, h.y));
      for (const t of far ? tg.slice(0, sk.count ?? 1) : tg) { const r = calcDamage(atk, 0, mult, d.crit); this.sc.combat.float(t.x, t.y - 50, `${r.dmg}`, '#ffcf3a', 13); fx2(this.sc, 'fx_boom', t.x, t.y - 10, 99952, 0.8); this.hurtTarget(t, r.dmg); }
    });
  }
  /** distance from the hero to a building / defense footprint (a box from its foot up to its back wall) */
  dist(t: Target, x: number, y: number) { const dx = Math.max(0, Math.abs(x - t.x) - t.rx), dy = y > t.y ? y - t.y : y < t.y - t.ry ? t.y - t.ry - y : 0; return Math.hypot(dx, dy); }
  /** the same fire as in our own village: flames grow with the damage, a destroyed building is a burning ruin */
  burn(t: Target) {
    if (!t.img) return;
    const f = Math.max(0, Math.min(1, 1 - t.hp / t.max)), fk = t.hp <= 0 ? 'ruin' : fireKey(f >= 0.15 ? f : 0);
    if (fk === (t.fk ?? '')) return;
    t.fk = fk; t.fx?.forEach(o => o.destroy());
    if (fk === 'ruin') { const src = t.img.texture.key, dst = 'o_ruin_' + src.replace(/^o_/, ''); if (makeRuin(this.sc, src, dst)) t.img.setTexture(dst); }
    t.fx = fk ? burnFx(this.sc, t.img, fk === 'ruin' ? 1 : f) : [];
  }
  hurtTarget(t: Target, dmg: number) {
    if (this.data.war) {   // the server owns the building HP; it answers with what is left
      const r = act('warHit', { id: t.id, dmg: Math.round(dmg) }); sfx.hit();
      if (refused(r)) return;
      if (t.img) { t.img.setTintFill(0xffffff); this.sc.time.delayedCall(50, () => t.img?.active && t.img.setTint(charTint(t.fk === 'ruin' ? 0 : Math.max(0, 1 - t.hp / t.max)))); }
      t.hp = r.hp; this.burn(t);
      if (t.hp <= 0 && t.alive) { this.fall(t); fx2(this.sc, 'fx_coins', t.x, t.y - 40, 99955, 0.9); sfx.crit(); bus.emit(EV.TOAST, `🗡 คุณทำลาย ${t.name}!`, '#ffd84a'); }
      return;
    }
    t.hp -= dmg; sfx.hit();
    if (t.img) { t.img.setTintFill(0xffffff); this.sc.time.delayedCall(50, () => t.img?.active && t.img.setTint(charTint(t.fk === 'ruin' ? 0 : Math.max(0, 1 - t.hp / t.max)))); }
    this.burn(t);
    if (t.hp > 0) return;
    t.alive = false; t.hp = 0; t.bar.clear();
    fx2(this.sc, 'fx_collapse', t.x, t.y + 4, t.y + 5, t.kind === 'defense' ? 0.8 : 1.6); fx2(this.sc, 'fx_coins', t.x, t.y - 40, 99955, 0.9);
    sfx.crit(); this.sc.combat.vfx.dust(t.x, t.y, 16, t.rx);
    bus.emit(EV.TOAST, `💥 ทำลาย ${t.name}! ${'⭐'.repeat(this.stars())}`, '#ffd84a');
    if (this.targets.every(q => !q.alive)) this.finish('all');
  }
  hurtGuard(g: Guard, dmg: number) {
    g.hp -= dmg; g.sp.setTintFill(0xffffff); this.sc.time.delayedCall(60, () => g.sp.clearTint()); sfx.hit();
    if (g.hp > 0) return;
    g.alive = false; g.bar.clear(); g.sh.destroy();
    this.sc.tweens.add({ targets: g.sp, alpha: 0, angle: 80, duration: 500, onComplete: () => g.sp.destroy() });
  }
  hurtHero(dmg: number, x: number, y: number) {
    const s = S(), d = derive(s), r = calcDamage(dmg, d.def, 1, 0.05, Math.random, d.evade);
    if (r.miss) { this.sc.combat.float(this.sc.hero.x, this.sc.hero.y - 40, 'MISS', '#cfcfcf', 10); return; }
    s.hp = Math.max(0, s.hp - r.dmg); sfx.hurt();
    this.sc.combat.float(this.sc.hero.x, this.sc.hero.y - 40, `-${r.dmg}`, '#ff6a5a', 10); this.sc.combat.vfx.impact(x, y, 0xff8a5a);
    this.sc.hero.setTintFill(0xff8080); this.sc.time.delayedCall(70, () => this.sc.hero.clearTint());
    if (s.hp <= 0 && this.data.war) {   // in a war a fallen hero gets up again at the gate; the war goes on without them meanwhile
      if (this.sc.time.now < this.heroDownUntil) return;
      const h = this.sc.hero, d = derive(s); this.heroDownUntil = this.sc.time.now + 3000; h.setAlpha(0.3);
      bus.emit(EV.TOAST, '💀 ล้มลง! ลุกขึ้นที่ประตูใน 3 วินาที — กองทัพยังสู้ต่อ', '#ff8a8a');
      this.sc.time.delayedCall(3000, () => { s.hp = Math.round(d.maxHp * 0.6); h.setPosition(L.SOUTH_GATE.x, L.SOUTH_GATE.y - 40).setAlpha(1); });
      return;
    }
    if (s.hp <= 0) this.finish('dead');
  }
  /** banner: everything near a standing war banner is stronger */
  boost(x: number, y: number) { let m = 1; for (const t of this.targets) if (t.alive && t.def?.buff && Math.hypot(t.x - x, t.y - y) < t.def.range) m += t.def.buff / 100; return m; }

  update(time: number, dt: number) {
    if (this.over) return;
    const h = this.sc.hero;
    if (this.data.war) this.allyStep(time, dt);
    else if (time >= this.end) { this.finish('time'); return; }
    // HP bars over damaged targets
    for (const t of this.targets) if (t.alive && t.hp < t.max) { const w = t.kind === 'defense' ? 28 : 56, top = t.img ? t.img.y - t.img.displayHeight * t.img.originY - 6 : t.y - 80; t.bar.clear().fillStyle(0x1a0a08, 0.9).fillRect(t.x - w / 2 - 1, top - 1, w + 2, 5).fillStyle(0xd83a2a, 1).fillRect(t.x - w / 2, top, w * t.hp / t.max, 3); }
    // defenses
    for (const t of this.targets) {
      const D = t.def; if (!t.alive || !D || !D.rate || this.sc.dead || time < this.heroDownUntil) continue;
      const dist = Math.hypot(h.x - t.x, h.y - t.y);
      if (D.spawn && !D.spawned && dist < D.range) { D.spawned = true; for (let i = 0; i < D.spawn; i++) this.addGuard('spear', t.x + (i ? 18 : -18), t.y + 18); bus.emit(EV.TOAST, '🛡 ทหารวิ่งออกจากบังเกอร์!', '#ff9a7a'); }
      if (!D.dmg || dist > D.range || time < D.next) continue;
      D.next = time + D.rate;
      const dmg = D.dmg * this.boost(t.x, t.y);
      if (D.id === 'spikes') { if (dist < 30) { this.hurtHero(dmg, h.x, h.y - 6); this.sc.combat.vfx.dust(h.x, h.y, 4, 10); } continue; }
      const sx = t.x, sy = t.y - (t.img ? t.img.displayHeight * 0.6 : 30);
      if (D.id === 'cannon' && t.img) { t.img.setVisible(false); const f = fx2(this.sc, 'fx_cannon', t.x, t.y, t.y, DEF_SC.cannon); if (f) f.once('animationcomplete', () => t.img?.setVisible(true)); else t.img.setVisible(true); }
      const tx = h.x, ty = h.y - 14;
      this.sc.combat.vfx.bolt(sx, sy, tx, ty, D.shot === 'ball' ? 0x2a2a2a : 0xffe8a0, D.shot === 'ball' ? 1.6 : 1, D.shot === 'ball' ? 300 : 700, () => {
        if (this.over) return;
        if (D.aoe) { fx2(this.sc, 'fx_boom', tx, ty + 10, ty + 10, 0.8); if (Math.hypot(h.x - tx, h.y - ty - 14) < D.aoe) this.hurtHero(dmg, tx, ty); }
        else if (Math.hypot(h.x - tx, h.y - 14 - ty) < 26) this.hurtHero(dmg, tx, ty);
      }, D.shot === 'arrow');
    }
    // guards: run at the hero when close, strike when in reach, go back to their post when the hero leaves
    for (const g of this.guards) {
      if (!g.alive) continue;
      const dx = h.x - g.x, dy = h.y - g.y, dist = Math.hypot(dx, dy), key = GUARDS[g.type].key;
      const chase = !this.sc.dead && time > this.heroDownUntil && dist < 230, want = chase ? (dist > g.range ? { x: h.x, y: h.y } : null) : (Math.hypot(g.post.x - g.x, g.post.y - g.y) > 6 ? g.post : null);
      if (want && !g.busy) {
        const ax = want.x - g.x, ay = want.y - g.y, ad = Math.hypot(ax, ay), sp = (chase ? 82 : 50) * dt / 1000;
        const nx = g.x + ax / ad * sp, ny = g.y + ay / ad * sp;
        if (this.sc.canStand(nx, g.y)) g.x = nx; if (this.sc.canStand(g.x, ny)) g.y = ny;
        g.dir = dirOf(ax, ay); playAnim(g.sp, key, 'walk', g.dir);
      } else if (!g.busy) setIdle(g.sp, key, g.dir);
      if (chase && dist <= g.range + 4 && time - g.last > g.rate && !g.busy) {
        g.last = time; g.busy = true; g.dir = dirOf(dx, dy); playAnim(g.sp, key, 'attack', g.dir, false);
        const boost = this.boost(g.x, g.y);
        this.sc.time.delayedCall(hitMs(key, 'attack', 300), () => {
          if (!g.alive || this.over) return;
          if (g.type === 'archer') this.sc.combat.vfx.bolt(g.x, g.y - 18, h.x, h.y - 14, 0xffe8a0, 1, 700, () => { if (!this.over && Math.hypot(h.x - g.x, h.y - g.y) < g.range + 40) this.hurtHero(g.atk * boost, h.x, h.y - 14); }, true);
          else if (Math.hypot(h.x - g.x, h.y - g.y) < g.range + 14) this.hurtHero(g.atk * boost, h.x, h.y - 14);
        });
        g.sp.once('animationcomplete', () => { g.busy = false; });
        this.sc.time.delayedCall(900, () => { g.busy = false; });
      }
      g.sp.setPosition(g.x, g.y).setDepth(g.y); g.sh.setPosition(g.x, g.y);
      if (g.hp < g.max) g.bar.clear().fillStyle(0x1a0a08, 0.9).fillRect(g.x - 12, g.y - 52, 24, 4).fillStyle(0xd83a2a, 1).fillRect(g.x - 11, g.y - 51, 22 * g.hp / g.max, 2);
    }
  }

  /** the end: ask the server for the result, show it, go home */
  finish(why: 'time' | 'all' | 'dead' | 'leave') {
    if (this.data.war) { if (why === 'leave') bus.emit('td:warSwap'); return; }   // a war ends on the server's clock
    if (this.over) return; this.over = true;
    const destroyed = this.targets.filter(t => !t.alive).map(t => t.id);
    const r = act('raidEnd', { destroyed });
    const s = S();
    if (why === 'dead') s.hp = Math.max(1, Math.round(derive(s).maxHp * 0.3));
    const head = why === 'all' ? '🏆 ทำลายหมดทั้งหมู่บ้าน!' : why === 'time' ? '⏱ หมดเวลา!' : why === 'dead' ? '💀 ฮีโร่ล้ม — ถอยทัพ' : '🏳 ถอนทัพ';
    if (refused(r)) bus.emit(EV.TOAST, `${head} เซิร์ฟไม่รับผลการปล้น`, '#ff8a8a');
    else {
      bus.emit(EV.TOAST, `${head} ${'⭐'.repeat(r.stars) || 'ไม่ได้ดาว'} • ทำลาย ${r.destroyed}/${r.total}`, '#ffd84a');
      bus.emit(EV.TOAST, `ของเข้าคลังหมู่บ้าน 💰${r.gain.gold} 🪵${r.gain.wood} 🪨${r.gain.stone} 🍖${r.gain.food} • แต้มบุญ +${r.pts}`, '#9fffb0');
      if (r.stars) { sfx.levelUp(); fx2(this.sc, 'fx_raid_victory', this.sc.hero.x, this.sc.hero.y - 20, 99995, 1.4); }
    }
    saveGame(s); bus.emit(EV.STATE_CHANGED);
    this.sc.time.delayedCall(2600, () => { this.sc.cameras.main.fadeOut(300); this.sc.time.delayedCall(320, () => this.sc.scene.restart({ stage: 0, guild: true })); });
  }
}
