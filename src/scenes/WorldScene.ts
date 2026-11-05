import Phaser from 'phaser';
import { generateWorld, MAP_W, MAP_H, G, zoneAt, iso, unIso, WORLD_PX_W, WORLD_PX_H, CHEST_LOOT, type WorldMap } from '../world/mapgen';
import { paintGroundIso, WATER_DEPTH } from '../art/isoArt';
import { HOUSE_ANCHOR } from '../art/textures';
import { hasAi, aiPixels } from '../art/aiAssets';
import { Hero } from '../entities/Hero';
import { Monster } from '../entities/Monster';
import { bus, EV, S, runtime } from '../core/events';
import { derive, gainExp, calcDamage, type Derived } from '../systems/stats';
import { addItem, useItem, countItem } from '../systems/inventory';
import { onKill, refreshCollect } from '../systems/quests';
import { MONSTERS, type MonsterKind } from '../data/monsters';
import { SKILLS, SKILL_BY_ID, type SkillId } from '../data/skills';
import { itemDef } from '../data/items';
import { saveGame } from '../core/save';
import { sfx, startMusic } from '../audio/sfx';

/** Input shared between UI scene (touch) and world. */
export const controls = { mx: 0, my: 0, attackHeld: false, joyActive: false };

interface Projectile {
  sprite: Phaser.GameObjects.Image; glow?: Phaser.GameObjects.Image;
  vx: number; vy: number; life: number; owner: 'hero' | 'enemy';
  dmg: number; radius: number; onHit?: (x: number, y: number) => void; homing?: boolean; trail?: number;
}

interface Loot { sprite: Phaser.GameObjects.Image; id: string; qty: number; born: number; x: number; y: number }

export class WorldScene extends Phaser.Scene {
  map!: WorldMap;
  hero!: Hero;
  monsters: Monster[] = [];
  projectiles: Projectile[] = [];
  loot: Loot[] = [];
  npcs: { id: string; x: number; y: number; sprite: Phaser.GameObjects.Sprite; marker: Phaser.GameObjects.Image }[] = [];
  der!: Derived;
  cooldowns: Record<string, number> = {};
  target: Monster | null = null;
  lastHurt = 0;
  lastRegen = 0;
  lastSpawnCheck = 0;
  lastAutosave = 0;
  lastPotion = 0;
  bossDeadAt = -1e9;
  boss: Monster | null = null;
  currentZone = '';
  nearNpc: string | null = null;
  fireflies: { s: Phaser.GameObjects.Image; t: number; bx: number; by: number }[] = [];
  leafEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
  clouds: Phaser.GameObjects.Image[] = [];
  stuckT = 0;
  autoSideStep = 0;
  keys!: Record<string, Phaser.Input.Keyboard.Key>;
  dead = false;
  chests: { id: number; x: number; y: number; img: Phaser.GameObjects.Image; glow: Phaser.GameObjects.Image | null }[] = [];
  nightLights: Phaser.GameObjects.Image[] = [];
  nightOverlay!: Phaser.GameObjects.Image;
  heroLight!: Phaser.GameObjects.Image;
  heroRing!: Phaser.GameObjects.Image;
  targetRing!: Phaser.GameObjects.Image;
  night = 0;
  rays: Phaser.GameObjects.Image[] = [];

  constructor() { super('World'); }

  create() {
    this.monsters = []; this.projectiles = []; this.loot = []; this.npcs = []; this.cooldowns = {}; this.fireflies = []; this.clouds = [];
    this.dead = false; this.boss = null; this.target = null; this.chests = []; this.nightLights = []; this.rays = [];
    const s = S();
    this.map = generateWorld();
    this.der = derive(s);

    // ground
    if (!this.textures.exists('ground')) this.textures.addCanvas('ground', paintGroundIso(this.map.ground));
    this.add.image(0, 0, 'ground').setOrigin(0).setDepth(0);

    // objects
    const ai = hasAi(this, 'house_0');
    for (const o of this.map.objects) {
      if (o.type === 'campfire') {
        if (ai) {
          const cf = this.add.image(o.x, o.y + 4, 'ai_campfire').setOrigin(0.5, 0.92).setDepth(o.y);
          this.tweens.add({ targets: cf, scaleY: { from: 0.97, to: 1.04 }, duration: 160, yoyo: true, repeat: -1 });
          this.burstLoop(o.x, o.y - 10);
        } else this.add.sprite(o.x, o.y, 'obj_campfire').setOrigin(0.5, 0.9).setDepth(o.y).play('campfire_burn');
        this.nightLights.push(this.addGlow(o.x, o.y - 8, 0xff9a3a, 1.6, true));
        continue;
      }
      if (o.type === 'house' || o.type === 'building') {
        const key = `obj_${o.type}_${o.v}`;
        const w = o.solid!.w, h = o.solid!.h;
        const sx0 = o.tx - Math.floor((w - 1) / 2), sy0 = o.ty - h + 1;
        const c = iso(sx0 + w / 2, sy0 + h / 2), bot = iso(sx0 + w, sy0 + h);
        this.add.image(c.x + 10, c.y + 4, 'fx_shadow').setScale(w * 1.15, h * 1.25).setAlpha(0.8).setDepth(1);
        if (ai) {
          this.add.image(c.x, bot.y + 3, key).setOrigin(0.5, 1).setDepth(c.y + 10);
        } else {
          const n = iso(o.tx - 2, o.ty - 2);
          const img = this.add.image(n.x, n.y, `obj_house_${o.v % 2}`);
          img.setOrigin(HOUSE_ANCHOR.ax / img.width, HOUSE_ANCHOR.ay / img.height).setDepth(o.y + 10);
        }
        // warm window light (brighter at night)
        this.nightLights.push(this.addGlow(c.x - 14, c.y - 6, 0xffc060, 0.75, true), this.addGlow(c.x + 18, c.y - 2, 0xffc060, 0.7, true));
        if (o.type === 'building' && o.v === 1) this.addGlow(c.x, c.y - 92, 0x7ad8ff, 1.2, true); // tower crystal
        if (o.type === 'building' && o.v === 0) this.nightLights.push(this.addGlow(c.x + 12, c.y - 10, 0xff8a3a, 1.1, true)); // forge
        continue;
      }
      if (o.type === 'chest') {
        const opened = S().chests.includes(o.v);
        const img = this.add.image(o.x, o.y + 4, opened ? 'obj_chest_1' : 'obj_chest_0').setOrigin(0.5, 0.95).setDepth(o.y);
        this.add.image(o.x, o.y + 3, 'fx_shadow').setScale(0.8, 0.7).setDepth(1);
        const glow = opened ? null : this.addGlow(o.x, o.y - 4, 0xffd060, 0.45, true);
        this.chests.push({ id: o.v, x: o.x, y: o.y, img, glow });
        continue;
      }
      if (o.type === 'wall') {
        if (ai && o.v < 6) {
          if ((o.tx + o.ty) % 2) continue; // ai wall pieces span ~2 tiles
          this.add.image(o.x, o.y + 6, `obj_wall_${o.v}`).setOrigin(0.5, 0.92).setDepth(o.y + 2);
          continue;
        }
        const img = this.add.image(o.x, o.y + 4, `obj_wall_${o.v}`);
        const hh = o.v >= 6 ? 26 : 24;
        img.setOrigin(19 / img.width, (hh + 12) / img.height).setDepth(o.y + 2);
        continue;
      }
      if (o.type === 'tree' || o.type === 'pine') this.add.image(o.x + 5, o.y + 4, 'fx_shadow').setScale(o.type === 'tree' ? 2.4 : 1.8, 1.7).setAlpha(0.85).setDepth(1);
      if (['bigrock', 'bush', 'tent', 'stall', 'well', 'statue', 'haystack', 'stairs', 'altar'].includes(o.type)) this.add.image(o.x + 3, o.y + 3, 'fx_shadow').setScale(1.4, 1.1).setDepth(1);
      let key = `obj_${o.type}_${o.v}`;
      if (!this.textures.exists(key)) key = `obj_${o.type}_0`;
      if (!this.textures.exists(key)) continue;
      const flat = o.type === 'flower' || o.type === 'tuft' || o.type === 'lily';
      const oy = o.type === 'lily' ? WATER_DEPTH + 2 : flat ? 2 : 4;
      const originY: Record<string, number> = ai
        ? { fence: 0.85, crate: 0.9, stall: 0.92, altar: 0.88, tent: 0.92, wall: 0.92, barrel: 0.95, stairs: 0.9, well: 0.92, chest: 0.92 }
        : { fence: 0.78, crate: 0.75, stall: 0.85, altar: 0.86, tent: 0.92 };
      const img = this.add.image(o.x, o.y + oy, key).setOrigin(0.5, originY[o.type] ?? 0.97);
      img.setDepth(o.type === 'lily' ? 1 : flat ? o.y - 12 : o.type === 'arch' ? o.y + 6 : o.y);
      if (o.type === 'tree' || o.type === 'pine') {
        img.setFlipX(((o.x * 7 + o.y * 3) & 8) > 0);
        // gentle canopy sway
        this.tweens.add({ targets: img, scaleX: { from: 1, to: 1.015 }, duration: 1800 + (o.x % 700), yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: o.y % 1000 });
        if (o.v === 2) this.addGlow(o.x, o.y - 30, 0x5ae0d0, 1.2, true);
      }
      if (o.type === 'lamp') this.nightLights.push(this.addGlow(o.x + (ai ? -6 : 0), o.y - (ai ? 28 : 26), 0xffd060, 0.9, true));
      if (o.type === 'crystal') this.addGlow(o.x, o.y - 12, 0x5ae0ff, 1.8, true);
      if (o.type === 'altar') this.addGlow(o.x, o.y - (ai ? 30 : 22), 0xb07aff, 1.8, true);
      if (o.type === 'mushrooms' && o.v === 1) this.addGlow(o.x, o.y - 6, 0x6ae0ff, 0.6, true);
    }

    // NPCs
    for (const n of this.map.npcs) {
      const { x, y } = iso(n.x + 0.5, n.y + 0.5);
      this.add.image(x, y, 'fx_shadow').setDepth(1).setScale(0.8);
      const sp = this.add.sprite(x, y, `npc_${n.id}`).setOrigin(0.5, 0.95).setDepth(y).play(`npc_${n.id}_idle`);
      const marker = this.add.image(x, y - 40, 'fx_qmark').setDepth(99999).setVisible(false);
      this.tweens.add({ targets: marker, y: y - 44, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      sp.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.tryTalk(n.id));
      this.npcs.push({ id: n.id, x, y, sprite: sp, marker });
    }

    // hero
    let start = s.pos.x > 0 ? s.pos : this.map.heroStart;
    if (!this.canMove(start.x, start.y, 5)) start = this.map.heroStart;
    this.hero = new Hero(this, start.x, start.y);
    this.heroRing = this.add.image(start.x, start.y, 'fx_selhero').setDepth(1.5).setScale(0.75);
    this.targetRing = this.add.image(0, 0, 'fx_seltarget').setDepth(1.5).setVisible(false);
    this.tweens.add({ targets: this.targetRing, alpha: { from: 1, to: 0.5 }, duration: 500, yoyo: true, repeat: -1 });

    // monsters
    this.map.spawns.forEach((sp, i) => { for (let k = 0; k < sp.count; k++) this.spawnAt(i); });
    this.spawnBoss();

    // camera
    const cam = this.cameras.main;
    cam.setBounds(0, 0, WORLD_PX_W, WORLD_PX_H);
    cam.setBackgroundColor('#1c2e1c');
    cam.startFollow(this.hero.sprite, true, 0.15, 0.15);
    cam.setRoundPixels(true);
    this.applyZoom();
    this.scale.on('resize', this.applyZoom, this);
    this.events.once('shutdown', () => { this.scale.off('resize', this.applyZoom, this); bus.off(EV.STATE_CHANGED, this.onState, this); });

    this.createAmbient();

    // keyboard (desktop testing)
    if (this.input.keyboard) {
      this.keys = this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,ONE,TWO,THREE,FOUR,E,Q') as Record<string, Phaser.Input.Keyboard.Key>;
      this.input.keyboard.on('keydown-ONE', () => this.castSkill('cyclone'));
      this.input.keyboard.on('keydown-TWO', () => this.castSkill('flame'));
      this.input.keyboard.on('keydown-THREE', () => this.castSkill('thunder'));
      this.input.keyboard.on('keydown-FOUR', () => this.castSkill('heal'));
      this.input.keyboard.on('keydown-E', () => this.interact());
      this.input.keyboard.on('keydown-Q', () => this.quickPotion());
    }

    bus.on(EV.STATE_CHANGED, this.onState, this);
    this.scene.launch('UI');
    this.scene.bringToTop('UI');
    startMusic();
    this.refreshNpcMarkers();
  }

  onState() {
    this.der = derive(S());
    this.hero.refreshLook();
    refreshCollect(S());
    this.refreshNpcMarkers();
  }

  applyZoom() {
    const h = this.scale.height, w = this.scale.width;
    // ~250 world px tall view, but keep at least 420 px wide
    const z = Math.max(1, Math.min(h / 250, w / 420));
    this.cameras.main.setZoom(z);
  }

  // ---------- Ambient / atmosphere ----------
  burstLoop(x: number, y: number) {
    this.time.addEvent({ delay: 220, loop: true, callback: () => {
      const v = this.cameras.main.worldView;
      if (!v.contains(x, y)) return;
      const p = this.add.image(x + Math.random() * 10 - 5, y, 'fx_px').setTint(Math.random() < 0.5 ? 0xffb040 : 0xff6a2a).setBlendMode(Phaser.BlendModes.ADD).setDepth(y + 20).setScale(0.6);
      this.tweens.add({ targets: p, y: y - 16 - Math.random() * 14, x: p.x + Math.random() * 8 - 4, alpha: 0, duration: 700 + Math.random() * 500, onComplete: () => p.destroy() });
    } });
  }

  addGlow(x: number, y: number, color: number, scale: number, flicker: boolean) {
    const g = this.add.image(x, y, 'fx_glow').setTint(color).setBlendMode(Phaser.BlendModes.ADD).setScale(scale).setAlpha(0.45).setDepth(99990);
    if (flicker) this.tweens.add({ targets: g, alpha: { from: 0.32, to: 0.55 }, scale: { from: scale * 0.92, to: scale * 1.05 }, duration: 300 + Math.random() * 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    return g;
  }

  createAmbient() {
    // day/night colour grading (multiply) sits under the additive light glows
    this.nightOverlay = this.add.image(0, 0, 'fx_px').setBlendMode(Phaser.BlendModes.MULTIPLY).setDepth(99970).setOrigin(0.5);
    this.heroLight = this.add.image(0, 0, 'fx_glow').setTint(0xffc880).setBlendMode(Phaser.BlendModes.ADD).setScale(2.6, 2).setDepth(99975).setAlpha(0);
    // drifting cloud shadows for depth
    for (let i = 0; i < 7; i++) {
      const c = this.add.image(Math.random() * WORLD_PX_W, Math.random() * WORLD_PX_H, 'fx_glow').setTint(0x0a0a20).setAlpha(0.13).setScale(9 + Math.random() * 5, 6 + Math.random() * 3).setDepth(99980);
      this.clouds.push(c);
    }
    // fireflies / motes
    for (let i = 0; i < 36; i++) {
      const s = this.add.image(0, 0, 'fx_glow').setScale(0.1).setBlendMode(Phaser.BlendModes.ADD).setDepth(99995).setTint(0xd8ff7a);
      this.fireflies.push({ s, t: Math.random() * 100, bx: Math.random(), by: Math.random() });
    }
    // god rays over meadow/grove
    for (const [x, y] of [[34, 30], [40, 46], [28, 50], [70, 8], [84, 6], [62, 30], [96, 34]] as const) {
      const rp = iso(x, y);
      const r = this.add.image(rp.x, rp.y, 'fx_ray').setBlendMode(Phaser.BlendModes.ADD).setAngle(-25).setScale(2.4, 2.2).setAlpha(0.18).setDepth(99985);
      this.rays.push(r);
    }
    // falling leaves & petals
    this.leafEmitter = this.add.particles(0, 0, 'fx_leaf', {
      x: { min: -200, max: 400 }, y: -10,
      lifespan: 9000, speedY: { min: 12, max: 26 }, speedX: { min: -14, max: 6 },
      rotate: { min: 0, max: 360 }, frequency: 500, quantity: 1, alpha: { start: 1, end: 0.2 },
    }).setDepth(99996);
    const petals = this.add.particles(0, 0, 'fx_petal', {
      x: { min: -200, max: 400 }, y: -10,
      lifespan: 9000, speedY: { min: 10, max: 22 }, speedX: { min: -10, max: 10 },
      rotate: { min: 0, max: 360 }, frequency: 900, quantity: 1,
    }).setDepth(99996);
    const follow = () => {
      const v = this.cameras.main.worldView;
      this.leafEmitter.setPosition(v.x + v.width * 0.3, v.y);
      petals.setPosition(v.x + v.width * 0.3, v.y);
    };
    this.events.on('update', follow);
    this.events.once('shutdown', () => this.events.off('update', follow));
    // water sparkles
    this.time.addEvent({
      delay: 140, loop: true, callback: () => {
        const v = this.cameras.main.worldView;
        for (let k = 0; k < 3; k++) {
          const px = v.x + Math.random() * v.width, py = v.y + Math.random() * v.height;
          if (this.groundAt(px, py - WATER_DEPTH) !== G.Water || this.groundAt(px, py) !== G.Water) continue;
          const sp = this.add.image(px, py, 'fx_spark').setScale(0.4).setDepth(2).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
          this.tweens.add({ targets: sp, alpha: 0.9, scale: 0.7, duration: 300, yoyo: true, onComplete: () => sp.destroy() });
          break;
        }
      },
    });
  }

  updateAmbient(time: number, dt: number) {
    const v = this.cameras.main.worldView;
    // ---- day / night cycle (one full day = 6 minutes) ----
    const st = S();
    st.dayTime = (st.dayTime + dt / 360000) % 1;
    const t = st.dayTime;
    let dusk = 0, night = 0;
    if (t > 0.55 && t < 0.65) { dusk = Math.sin(((t - 0.55) / 0.1) * Math.PI); night = (t - 0.55) / 0.1; }
    else if (t >= 0.65 && t < 0.9) night = 1;
    else if (t >= 0.9) { night = 1 - (t - 0.9) / 0.1; dusk = Math.sin(((t - 0.9) / 0.1) * Math.PI) * 0.6; }
    this.night = night;
    const mixc = (a: number, b: number, k: number) => Phaser.Display.Color.Interpolate.ColorWithColor(Phaser.Display.Color.ValueToColor(a), Phaser.Display.Color.ValueToColor(b), 100, Math.round(k * 100));
    let c = mixc(0xfff6ea, 0x3c4a8c, night);
    const cc = Phaser.Display.Color.GetColor(c.r, c.g, c.b);
    c = mixc(cc, 0xff9a60, dusk * 0.55);
    this.nightOverlay.setTint(Phaser.Display.Color.GetColor(c.r, c.g, c.b));
    this.nightOverlay.setPosition(v.centerX, v.centerY).setDisplaySize(v.width + 64, v.height + 64);
    for (const l of this.nightLights) { const b0 = (l.getData('base') as number | undefined) ?? (l.setData('base', l.scaleX), l.scaleX); l.setScale(b0 * (1 + night * 0.9)); }
    this.rays.forEach((r, i) => r.setAlpha((0.14 + Math.sin(time * 0.0006 + i * 1.7) * 0.07) * (1 - night) * (1 - dusk * 0.5)));
    this.heroLight.setPosition(this.hero.x, this.hero.y - 10).setAlpha(night * 0.35);
    for (const c of this.clouds) {
      c.x += dt * 0.012; c.y += dt * 0.004;
      if (c.x > WORLD_PX_W + 300) { c.x = -300; c.y = Math.random() * WORLD_PX_H; }
    }
    const zone = this.currentZone;
    const dense = Math.min(1, (zone === 'forest' || zone === 'grove' || zone === 'arena' ? 1 : 0.35) + this.night * 0.8);
    this.fireflies.forEach((f, i) => {
      f.t += dt * 0.001;
      const x = v.x + ((f.bx * v.width + Math.sin(f.t * 0.7 + i) * 30 + f.t * 4) % (v.width + 40));
      const y = v.y + ((f.by * v.height + Math.cos(f.t * 0.5 + i * 2) * 24) % (v.height + 20));
      f.s.setPosition(x, y);
      f.s.setAlpha((0.4 + Math.sin(f.t * 3 + i) * 0.4) * dense);
      f.s.setTint(zone === 'grove' ? 0x8af0ff : zone === 'arena' ? 0xc89aff : 0xe0ff8a);
    });
    this.leafEmitter.setTexture(zone === 'grove' ? 'fx_px' : 'fx_leaf');
    void time;
  }

  // ---------- Collision ----------
  blockedAt(px: number, py: number): boolean {
    const t = unIso(px, py);
    const tx = Math.floor(t.tx), ty = Math.floor(t.ty);
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return true;
    return this.map.blocked[ty * MAP_W + tx] === 1;
  }

  groundAt(px: number, py: number): number {
    const t = unIso(px, py);
    const tx = Math.floor(t.tx), ty = Math.floor(t.ty);
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return -1;
    return this.map.ground[ty * MAP_W + tx];
  }

  canMove(x: number, y: number, r: number): boolean {
    return !this.blockedAt(x - r, y - 2) && !this.blockedAt(x + r, y - 2) && !this.blockedAt(x - r, y + 1) && !this.blockedAt(x + r, y + 1);
  }

  moveHero(dx: number, dy: number): boolean {
    const h = this.hero, r = h.radius;
    let moved = false;
    if (dx && this.canMove(h.x + dx, h.y, r)) { h.x += dx; moved = true; }
    if (dy && this.canMove(h.x, h.y + dy, r)) { h.y += dy; moved = true; }
    return moved;
  }

  // ---------- Spawning ----------
  spawnAt(i: number) {
    const sp = this.map.spawns[i];
    for (let tries = 0; tries < 20; tries++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * sp.r;
      const { x, y } = iso(sp.x + Math.cos(a) * r, sp.y + Math.sin(a) * r);
      if (!this.canMove(x, y, 6) && sp.kind !== 'wisp') continue;
      this.monsters.push(new Monster(this, sp.kind, x, y, sp.r * 16 * 0.8, i));
      return;
    }
  }

  spawnBoss() {
    const b = this.map.bossPos;
    this.boss = new Monster(this, 'treant', b.x, b.y, 40, -1);
    this.monsters.push(this.boss);
  }

  respawnTick(time: number) {
    if (time - this.lastSpawnCheck < 3000) return;
    this.lastSpawnCheck = time;
    this.monsters = this.monsters.filter(m => m.alive || m.sprite.active);
    this.map.spawns.forEach((sp, i) => {
      const alive = this.monsters.filter(m => m.spawnIndex === i && m.alive).length;
      const sc = iso(sp.x, sp.y);
      const far = Math.hypot(this.hero.x - sc.x, this.hero.y - sc.y) > 120;
      if (alive < sp.count && far) this.spawnAt(i);
    });
    if ((!this.boss || !this.boss.alive) && time - this.bossDeadAt > 90000) {
      const b = this.map.bossPos;
      if (Math.hypot(this.hero.x - b.x, this.hero.y - b.y) > 220) this.spawnBoss();
    }
  }

  // ---------- Main loop ----------
  update(time: number, dt: number) {
    dt = Math.min(dt, 50);
    const s = S();
    s.playTime += dt / 1000;
    const h = this.hero;

    // input
    let mx = controls.mx, my = controls.my;
    if (this.keys) {
      const k = this.keys;
      const kx = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0);
      const ky = (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0);
      if (kx || ky) { const l = Math.hypot(kx, ky); mx = kx / l; my = ky / l; }
      if (k.SPACE.isDown) this.basicAttack(time);
    }
    const manualMove = Math.hypot(mx, my) > 0.15;
    let moving = false;
    if (h.state !== 'dead') {
      if (manualMove && !h.busy(time)) {
        const sp = this.der.moveSpeed * (dt / 1000);
        moving = this.moveHero(mx * sp, my * sp);
        h.setFacing(mx, my);
      } else if (s.auto && !manualMove) {
        moving = this.autoBattle(time, dt);
      }
      if (controls.attackHeld) this.basicAttack(time);
    }
    h.updateVisual(time, moving);

    for (const m of this.monsters) m.update(time, dt);
    this.updateProjectiles(dt);
    this.updateLoot(time);
    this.respawnTick(time);
    this.updateAmbient(time, dt);
    this.heroRing.setPosition(h.x, h.y).setVisible(h.state !== 'dead');
    const tgt = this.target && this.target.alive ? this.target : this.nearestEnemy(60);
    if (tgt) this.targetRing.setVisible(true).setPosition(tgt.x, tgt.y).setScale(tgt.def.boss ? 2.2 : tgt.def.bodyRadius / 8);
    else this.targetRing.setVisible(false);
    this.checkChests();

    // regen
    if (time - this.lastRegen > 2000 && h.state !== 'dead') {
      this.lastRegen = time;
      const outOfCombat = time - this.lastHurt > 5000;
      const before = s.hp + s.mp;
      s.hp = Math.min(this.der.maxHp, s.hp + Math.ceil(this.der.maxHp * (outOfCombat ? 0.03 : 0.005)));
      s.mp = Math.min(this.der.maxMp, s.mp + Math.ceil(this.der.maxMp * 0.025));
      if (s.hp + s.mp !== before) bus.emit(EV.STATE_CHANGED);
    }

    // zone + npc proximity
    const z = zoneAt(h.x, h.y);
    if (z.id !== this.currentZone) { this.currentZone = z.id; bus.emit(EV.ZONE, z.name, z.id); }
    let near: string | null = null;
    for (const n of this.npcs) if (Math.hypot(n.x - h.x, n.y - h.y) < 30) near = n.id;
    if (near !== this.nearNpc) { this.nearNpc = near; bus.emit(EV.NEAR_NPC, near); }

    s.pos = { x: Math.round(h.x), y: Math.round(h.y) };
    if (time - this.lastAutosave > 30000) { this.lastAutosave = time; saveGame(s); }
  }

  // ---------- Auto battle ----------
  autoBattle(time: number, dt: number): boolean {
    const s = S(), h = this.hero;
    if (s.hp < this.der.maxHp * 0.35) this.quickPotion(true);
    if (s.mp < this.der.maxMp * 0.12 && time - this.lastPotion > 1500) {
      const mp = s.inventory.find(i => i.id === 'mp_potion');
      if (mp) { this.lastPotion = time; useItem(s, mp.uid); sfx.potion(); this.floatText(h.x, h.y - 30, '+MP', '#7ab8ff'); bus.emit(EV.STATE_CHANGED); }
    }
    if (s.hp < this.der.maxHp * 0.55 && this.skillReady('heal', time)) { this.castSkill('heal'); return false; }

    if (!this.target || !this.target.alive || Math.hypot(this.target.x - h.x, this.target.y - h.y) > 300) {
      this.target = null;
      let best = 260;
      for (const m of this.monsters) {
        if (!m.alive) continue;
        if (m.def.boss && m.state === 'idle' && s.level < 10) continue; // don't suicide into the boss early
        const d = Math.hypot(m.x - h.x, m.y - h.y);
        if (d < best) { best = d; this.target = m; }
      }
    }
    const t = this.target;
    if (!t) return false;
    const d = Math.hypot(t.x - h.x, t.y - h.y);
    // skills
    if (!h.busy(time)) {
      const near = this.monsters.filter(m => m.alive && Math.hypot(m.x - h.x, m.y - h.y) < 46).length;
      if (near >= 1 && this.skillReady('cyclone', time) && (near >= 2 || t.def.boss || t.hp > t.maxHp * 0.5)) { this.castSkill('cyclone'); return false; }
      if (d < 140 && this.skillReady('thunder', time) && (this.monsters.filter(m => m.alive && Math.hypot(m.x - h.x, m.y - h.y) < 130).length >= 2 || t.def.boss || t.hp > 150)) { this.castSkill('thunder'); return false; }
      if (d < 150 && d > 30 && this.skillReady('flame', time)) { h.setFacing(t.x - h.x, t.y - h.y); this.castSkill('flame'); return false; }
    }
    const reach = t.def.bodyRadius + 14;
    if (d > reach) {
      if (h.busy(time)) return false;
      const sp = this.der.moveSpeed * (dt / 1000);
      let vx = (t.x - h.x) / d, vy = (t.y - h.y) / d;
      if (this.autoSideStep > time) { const tmp = vx; vx = -vy; vy = tmp; }
      const moved = this.moveHero(vx * sp, vy * sp);
      h.setFacing(vx, vy);
      if (!moved) { this.stuckT += dt; if (this.stuckT > 250) { this.autoSideStep = time + 500; this.stuckT = 0; } }
      else this.stuckT = 0;
      return moved;
    }
    h.setFacing(t.x - h.x, t.y - h.y);
    this.basicAttack(time);
    return false;
  }

  nearestEnemy(maxD: number): Monster | null {
    let best: Monster | null = null, bd = maxD;
    for (const m of this.monsters) { if (!m.alive) continue; const d = Math.hypot(m.x - this.hero.x, m.y - this.hero.y); if (d < bd) { bd = d; best = m; } }
    return best;
  }

  checkChests() {
    const s = S(), h = this.hero;
    if (h.state === 'dead') return;
    for (const c of this.chests) {
      if (s.chests.includes(c.id)) continue;
      if (Math.hypot(c.x - h.x, c.y - h.y) > 20) continue;
      s.chests.push(c.id);
      c.img.setTexture('obj_chest_1');
      c.glow?.destroy(); c.glow = null;
      sfx.levelUp();
      this.burst(c.x, c.y - 8, 0xffd060, 20, 60);
      const ray = this.add.image(c.x, c.y, 'fx_ray').setOrigin(0.5, 1).setTint(0xffe080).setBlendMode(Phaser.BlendModes.ADD).setScale(0.8, 0.1).setDepth(99700);
      this.tweens.add({ targets: ray, scaleY: 0.6, alpha: 0, duration: 900, onComplete: () => ray.destroy() });
      const loot = CHEST_LOOT[c.id % CHEST_LOOT.length];
      this.dropLoot(c.x, c.y + 6, 'gold', loot.gold);
      for (const it of loot.items) this.dropLoot(c.x, c.y + 6, it.id, it.qty);
      bus.emit(EV.TOAST, 'พบหีบสมบัติ!', '#ffd84a');
      saveGame(s);
    }
  }

  quickPotion(auto = false) {
    const s = S(), now = this.time.now;
    if (now - this.lastPotion < (auto ? 1500 : 400)) return;
    if (s.hp >= this.der.maxHp) return;
    const pot = s.inventory.find(i => i.id === 'hp_potion_l' && s.hp < this.der.maxHp * 0.4) ?? s.inventory.find(i => i.id === 'hp_potion') ?? s.inventory.find(i => i.id === 'hp_potion_l');
    if (!pot) { if (!auto) bus.emit(EV.TOAST, 'ไม่มียาฟื้นพลัง', '#ff8a8a'); return; }
    this.lastPotion = now;
    const r = useItem(s, pot.uid);
    if (r) { sfx.potion(); this.floatText(this.hero.x, this.hero.y - 30, '+' + r.heal, '#7aff8a'); this.healFx(); }
    bus.emit(EV.STATE_CHANGED);
  }

  // ---------- Combat: hero ----------
  basicAttack(time: number) {
    const h = this.hero;
    if (h.busy(time) || time - h.lastAttack < this.der.attackInterval) return;
    h.lastAttack = time;
    // auto-face nearest enemy in reach
    let best: Monster | null = null, bd = 44;
    for (const m of this.monsters) {
      if (!m.alive) continue;
      const d = Math.hypot(m.x - h.x, m.y - h.y) - m.def.bodyRadius;
      if (d < bd) { bd = d; best = m; }
    }
    if (best) h.setFacing(best.x - h.x, best.y - h.y);
    const dur = Math.min(260, this.der.attackInterval * 0.8);
    h.doAttack(time, dur);
    sfx.swing();
    // slash visual
    const ang = Math.atan2(h.facing.y, h.facing.x);
    const sx = h.x + h.facing.x * 14, sy = h.y - 9 + h.facing.y * 12;
    const sl = this.add.image(sx, sy, 'fx_slash').setRotation(ang).setDepth(h.y + 5).setBlendMode(Phaser.BlendModes.ADD).setScale(0.7).setAlpha(0.95);
    this.tweens.add({ targets: sl, scale: 1, alpha: 0, rotation: ang + 0.5, duration: 200, onComplete: () => sl.destroy() });
    this.time.delayedCall(70, () => {
      let hitAny = false;
      for (const m of this.monsters) {
        if (!m.alive) continue;
        const dx = m.x - h.x, dy = (m.y - h.y);
        const d = Math.hypot(dx, dy);
        if (d > 30 + m.def.bodyRadius) continue;
        const dot = d > 0 ? (dx * h.facing.x + dy * h.facing.y) / d : 1;
        if (dot < 0.2 && d > 10 + m.def.bodyRadius) continue;
        this.hitMonster(m, this.der.atk, 1, 'phys');
        hitAny = true;
      }
      if (hitAny) this.cameras.main.shake(60, 0.0025);
    });
  }

  hitMonster(m: Monster, atk: number, mult: number, kind: 'phys' | 'magic', knock = 6) {
    const r = calcDamage(atk, m.def.def, mult, this.der.crit);
    m.takeHit(r.dmg, this.hero.x, this.hero.y, knock);
    if (r.crit) sfx.crit(); else sfx.hit();
    this.floatText(m.x + (Math.random() * 10 - 5), m.cy - 10, String(r.dmg), r.crit ? '#ffd040' : kind === 'magic' ? '#9ad8ff' : '#ffffff', r.crit ? 1.4 : 1);
    this.hitSpark(m.x, m.cy, r.crit ? 0xffd040 : kind === 'magic' ? 0x8ad0ff : 0xffffff);
    if (r.crit) this.cameras.main.shake(90, 0.005);
    if (m.def.boss) bus.emit(EV.BOSS_HP, Math.max(0, m.hp), m.maxHp, m.def.name);
    if (!m.alive) this.onMonsterKilled(m);
  }

  skillReady(id: SkillId, time: number) {
    const sk = SKILL_BY_ID[id], s = S();
    return s.level >= sk.unlockLevel && (this.cooldowns[id] ?? 0) <= time && s.mp >= sk.mp;
  }

  castSkill(id: SkillId) {
    const time = this.time.now, s = S(), h = this.hero, sk = SKILL_BY_ID[id];
    if (h.state === 'dead') return;
    if (s.level < sk.unlockLevel) { bus.emit(EV.TOAST, `ปลดล็อกที่เลเวล ${sk.unlockLevel}`, '#ff8a8a'); sfx.error(); return; }
    if ((this.cooldowns[id] ?? 0) > time) return;
    if (s.mp < sk.mp) { bus.emit(EV.TOAST, 'MP ไม่พอ', '#7ab8ff'); sfx.error(); return; }
    if (h.busy(time) && h.state !== 'attack') return;
    s.mp -= sk.mp;
    this.cooldowns[id] = time + sk.cooldown;
    bus.emit(EV.SKILL_CAST, id, sk.cooldown);
    bus.emit(EV.STATE_CHANGED);
    const d = this.der;
    switch (id) {
      case 'cyclone': {
        h.doAttack(time, 420);
        h.sprite.anims.timeScale = 1.6;
        sfx.cyclone();
        const ring = this.add.image(h.x, h.y - 8, 'fx_slash').setBlendMode(Phaser.BlendModes.ADD).setDepth(h.y + 6).setScale(1.2);
        const ring2 = this.add.image(h.x, h.y - 8, 'fx_slash').setBlendMode(Phaser.BlendModes.ADD).setDepth(h.y + 6).setScale(1.5).setRotation(Math.PI).setTint(0x9ad8ff);
        this.tweens.add({ targets: [ring, ring2], rotation: '+=12', scale: 2.4, alpha: 0, duration: 450, onComplete: () => { ring.destroy(); ring2.destroy(); } });
        this.burst(h.x, h.y - 6, 0xbfe8ff, 18, 60);
        for (const delay of [60, 220]) this.time.delayedCall(delay, () => {
          for (const m of this.monsters) if (m.alive && Math.hypot(m.x - h.x, m.y - h.y) < 46 + m.def.bodyRadius) this.hitMonster(m, d.atk, sk.power / 2 + 0.1, 'phys', 10);
        });
        this.cameras.main.shake(150, 0.004);
        break;
      }
      case 'flame': {
        h.doCast(time, 300);
        sfx.flame();
        let vx = h.facing.x, vy = h.facing.y;
        // aim at nearest enemy in front if any
        let best: Monster | null = null, bd = 170;
        for (const m of this.monsters) { if (!m.alive) continue; const dd = Math.hypot(m.x - h.x, m.y - h.y); if (dd < bd) { bd = dd; best = m; } }
        if (best) { vx = best.x - h.x; vy = best.cy - (h.y - 10); const l = Math.hypot(vx, vy); vx /= l; vy /= l; h.setFacing(vx, vy); }
        const fb = this.add.image(h.x + vx * 10, h.y - 10 + vy * 8, 'fx_fireball').setDepth(99000).setBlendMode(Phaser.BlendModes.ADD);
        const glow = this.add.image(fb.x, fb.y, 'fx_glow').setTint(0xff7a2a).setBlendMode(Phaser.BlendModes.ADD).setScale(0.8).setAlpha(0.7).setDepth(98999);
        this.projectiles.push({
          sprite: fb, glow, vx: vx * 220, vy: vy * 220, life: 900, owner: 'hero', dmg: 0, radius: 10, trail: 0xff8a3a,
          onHit: (x, y) => this.explode(x, y, d.matk, sk.power),
        });
        break;
      }
      case 'thunder': {
        h.doCast(time, 420);
        const targets = this.monsters.filter(m => m.alive && Math.hypot(m.x - h.x, m.y - h.y) < 130)
          .sort((a, b) => Math.hypot(a.x - h.x, a.y - h.y) - Math.hypot(b.x - h.x, b.y - h.y)).slice(0, 5);
        if (!targets.length) {
          // strike in front anyway for feedback
          this.boltAt(h.x + h.facing.x * 50, h.y + h.facing.y * 40);
        }
        targets.forEach((m, i) => this.time.delayedCall(120 + i * 90, () => {
          if (!m.alive) return;
          this.boltAt(m.x, m.y);
          this.hitMonster(m, d.matk, sk.power, 'magic', 2);
        }));
        sfx.thunder();
        this.cameras.main.flash(120, 200, 220, 255, false);
        break;
      }
      case 'heal': {
        h.doCast(time, 450);
        const amt = Math.round(d.maxHp * sk.power + d.int * 4);
        const real = Math.min(amt, d.maxHp - s.hp);
        s.hp += real;
        sfx.heal();
        this.healFx();
        this.floatText(h.x, h.y - 30, '+' + real, '#7aff8a', 1.2);
        bus.emit(EV.STATE_CHANGED);
        break;
      }
    }
  }

  healFx() {
    const h = this.hero;
    const ring = this.add.image(h.x, h.y - 2, 'fx_ring').setTint(0x7aff9a).setBlendMode(Phaser.BlendModes.ADD).setScale(0.2, 0.1).setDepth(2);
    this.tweens.add({ targets: ring, scaleX: 1, scaleY: 0.5, alpha: 0, duration: 600, onComplete: () => ring.destroy() });
    for (let i = 0; i < 14; i++) {
      const p = this.add.image(h.x + (Math.random() * 24 - 12), h.y - Math.random() * 10, 'fx_spark').setTint(0x9aff9a).setBlendMode(Phaser.BlendModes.ADD).setDepth(99000).setScale(0.6);
      this.tweens.add({ targets: p, y: p.y - 30 - Math.random() * 20, alpha: 0, duration: 700 + Math.random() * 400, delay: i * 30, onComplete: () => p.destroy() });
    }
  }

  boltAt(x: number, y: number) {
    const b = this.add.image(x, y, 'fx_bolt').setOrigin(0.5, 1).setBlendMode(Phaser.BlendModes.ADD).setDepth(99500).setScale(1, 1.1);
    const g = this.add.image(x, y - 4, 'fx_glow').setTint(0x9ad8ff).setBlendMode(Phaser.BlendModes.ADD).setScale(1.6).setDepth(99499);
    this.tweens.add({ targets: [b, g], alpha: 0, duration: 260, delay: 60, onComplete: () => { b.destroy(); g.destroy(); } });
    this.burst(x, y - 4, 0xd8f0ff, 10, 50);
  }

  explode(x: number, y: number, matk: number, power: number) {
    sfx.boom();
    const g = this.add.image(x, y, 'fx_glow').setTint(0xff7a2a).setBlendMode(Phaser.BlendModes.ADD).setScale(0.5).setDepth(99500);
    this.tweens.add({ targets: g, scale: 2.4, alpha: 0, duration: 380, onComplete: () => g.destroy() });
    const r = this.add.image(x, y, 'fx_ring').setTint(0xffb040).setBlendMode(Phaser.BlendModes.ADD).setScale(0.2).setDepth(99500);
    this.tweens.add({ targets: r, scale: 1.1, alpha: 0, duration: 350, onComplete: () => r.destroy() });
    this.burst(x, y, 0xffa040, 16, 70);
    this.cameras.main.shake(140, 0.005);
    for (const m of this.monsters) if (m.alive && Math.hypot(m.x - x, m.cy - y) < 34 + m.def.bodyRadius) this.hitMonster(m, matk, power, 'magic', 8);
  }

  burst(x: number, y: number, color: number, n: number, speed: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = speed * (0.4 + Math.random() * 0.6);
      const p = this.add.image(x, y, 'fx_px').setTint(color).setDepth(99600).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: p, x: x + Math.cos(a) * sp * 0.5, y: y + Math.sin(a) * sp * 0.4, alpha: 0, duration: 300 + Math.random() * 300, ease: 'Quad.easeOut', onComplete: () => p.destroy() });
    }
  }

  hitSpark(x: number, y: number, color: number) {
    const s = this.add.image(x, y, 'fx_spark').setTint(color).setBlendMode(Phaser.BlendModes.ADD).setDepth(99600).setScale(0.5).setRotation(Math.random());
    this.tweens.add({ targets: s, scale: 1.6, alpha: 0, duration: 180, onComplete: () => s.destroy() });
    this.burst(x, y, color, 5, 40);
  }

  floatText(x: number, y: number, text: string, color: string, size = 1) {
    const z = this.cameras.main.zoom;
    const t = this.add.text(x, y, text, {
      fontFamily: '"Trebuchet MS", sans-serif', fontStyle: 'bold', fontSize: `${Math.round(9 * size)}px`, color,
      stroke: '#1a0e14', strokeThickness: 3, resolution: Math.max(2, z),
    }).setOrigin(0.5).setDepth(100001);
    t.setScale(0.6);
    this.tweens.add({ targets: t, scale: 1, duration: 120, ease: 'Back.easeOut' });
    this.tweens.add({ targets: t, y: y - 20, alpha: 0, duration: 800, delay: 250, ease: 'Quad.easeIn', onComplete: () => t.destroy() });
  }

  // ---------- Combat: enemies ----------
  damageHero(atk: number, from: Monster | null, mult = 1) {
    const s = S(), h = this.hero, time = this.time.now;
    if (h.state === 'dead' || time < h.invulnUntil) return;
    const r = calcDamage(atk, this.der.def, mult, 0.05, Math.random, this.der.evade);
    this.lastHurt = time;
    if (r.miss) { this.floatText(h.x, h.y - 30, 'MISS', '#c8c8ff', 0.9); return; }
    s.hp = Math.max(0, s.hp - r.dmg);
    sfx.hurt();
    h.hurtFlash();
    h.invulnUntil = time + 250;
    this.floatText(h.x, h.y - 30, '-' + r.dmg, '#ff5a5a', r.crit ? 1.3 : 1.05);
    this.cameras.main.shake(90, 0.004);
    if (from) { const d = Math.hypot(h.x - from.x, h.y - from.y) || 1; this.moveHero((h.x - from.x) / d * 4, (h.y - from.y) / d * 4); }
    if (s.hp <= 0) this.heroDie();
    bus.emit(EV.STATE_CHANGED);
  }

  heroDie() {
    const s = S();
    this.hero.die();
    sfx.die();
    const lost = Math.floor(s.gold * 0.1);
    s.gold -= lost;
    this.target = null;
    bus.emit(EV.HERO_DIED, lost);
    this.time.delayedCall(3200, () => {
      const st = this.map.heroStart;
      this.hero.revive(st.x, st.y);
      s.hp = this.der.maxHp; s.mp = this.der.maxMp;
      this.hero.invulnUntil = this.time.now + 2000;
      bus.emit(EV.STATE_CHANGED);
      bus.emit(EV.TOAST, 'ฟื้นคืนชีพที่หมู่บ้าน', '#ffe08a');
    });
  }

  enemyShoot(m: Monster) {
    const h = this.hero;
    const sx = m.x + (h.x < m.x ? -8 : 8), sy = m.y - 12;
    const dx = h.x - sx, dy = (h.y - 8) - sy, d = Math.hypot(dx, dy) || 1;
    if (m.def.kind === 'goblin') {
      sfx.arrow();
      const a = this.add.image(sx, sy, 'fx_arrow').setRotation(Math.atan2(dy, dx)).setDepth(99000);
      this.projectiles.push({ sprite: a, vx: dx / d * 190, vy: dy / d * 190, life: 1200, owner: 'enemy', dmg: m.def.atk, radius: 7 });
    } else {
      sfx.magic();
      const o = this.add.image(sx, sy, 'fx_orb').setDepth(99000).setBlendMode(Phaser.BlendModes.ADD);
      const g = this.add.image(sx, sy, 'fx_glow').setTint(0x3fd6e0).setBlendMode(Phaser.BlendModes.ADD).setScale(0.6).setAlpha(0.6).setDepth(98999);
      this.projectiles.push({ sprite: o, glow: g, vx: dx / d * 95, vy: dy / d * 95, life: 2600, owner: 'enemy', dmg: m.def.atk, radius: 7, homing: true, trail: 0x6ae8ff });
    }
  }

  bossSpecials(b: Monster, time: number) {
    if (b.nextSpecial === 0) { b.nextSpecial = time + 3000; sfx.bossRoar(); bus.emit(EV.BOSS_HP, b.hp, b.maxHp, b.def.name); this.cameras.main.shake(500, 0.006); }
    if (b.phase === 1 && b.hp < b.maxHp * 0.5) {
      b.phase = 2;
      sfx.bossRoar();
      this.cameras.main.shake(600, 0.01);
      bus.emit(EV.TOAST, 'ผู้พิทักษ์คลุ้มคลั่ง!', '#ff6a4a');
      b.sprite.setTint(0xffb0a0);
      for (let i = 0; i < 3; i++) this.monsters.push(new Monster(this, i === 2 ? 'wisp' : 'shroom', b.x + (i - 1) * 30, b.y + 24, 40, -2));
    }
    if (time < b.nextSpecial) return;
    const h = this.hero;
    const pick = Math.random();
    b.nextSpecial = time + (b.phase === 2 ? 3200 : 4500);
    b.sprite.play('mon_treant_cast');
    if (pick < 0.5) {
      // root eruptions telegraphed under hero
      const n = b.phase === 2 ? 3 : 2;
      for (let i = 0; i < n; i++) {
        const tx = h.x + (i ? (Math.random() * 60 - 30) : 0), ty = h.y + (i ? (Math.random() * 40 - 20) : 0);
        const w = this.add.image(tx, ty, 'fx_warn').setDepth(3).setScale(0.2, 0.12);
        this.tweens.add({ targets: w, scaleX: 1.1, scaleY: 0.7, duration: 850 });
        this.time.delayedCall(950, () => {
          w.destroy();
          sfx.boom();
          this.burst(tx, ty, 0x8a6a3a, 14, 50);
          const spike = this.add.image(tx, ty, 'fx_thorn').setOrigin(0, 0.5).setRotation(-Math.PI / 2).setScale(2.2).setDepth(ty);
          this.tweens.add({ targets: spike, scaleX: 0.1, alpha: 0, delay: 300, duration: 300, onComplete: () => spike.destroy() });
          this.cameras.main.shake(120, 0.006);
          if (Math.hypot(h.x - tx, (h.y - ty) * 1.5) < 30) this.damageHero(b.def.atk, null, 1.4);
        });
      }
    } else {
      // thorn volley
      const n = b.phase === 2 ? 14 : 10;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + time * 0.001;
        const t = this.add.image(b.x, b.y - 24, 'fx_thorn').setRotation(a).setDepth(99000);
        this.projectiles.push({ sprite: t, vx: Math.cos(a) * 110, vy: Math.sin(a) * 110, life: 2200, owner: 'enemy', dmg: b.def.atk * 0.8, radius: 6 });
      }
      sfx.arrow();
    }
  }

  updateProjectiles(dt: number) {
    const sec = dt / 1000, h = this.hero;
    for (const p of this.projectiles) {
      if (p.homing) {
        const dx = h.x - p.sprite.x, dy = (h.y - 8) - p.sprite.y, d = Math.hypot(dx, dy) || 1;
        p.vx += (dx / d * 95 - p.vx) * 0.02; p.vy += (dy / d * 95 - p.vy) * 0.02;
      }
      p.sprite.x += p.vx * sec; p.sprite.y += p.vy * sec;
      p.glow?.setPosition(p.sprite.x, p.sprite.y);
      p.life -= dt;
      if (p.trail && Math.random() < 0.6) {
        const t = this.add.image(p.sprite.x, p.sprite.y, 'fx_px').setTint(p.trail).setBlendMode(Phaser.BlendModes.ADD).setDepth(98998);
        this.tweens.add({ targets: t, alpha: 0, y: t.y - 4, duration: 300, onComplete: () => t.destroy() });
      }
      let hit = false;
      if (p.owner === 'hero') {
        for (const m of this.monsters) if (m.alive && Math.hypot(m.x - p.sprite.x, m.cy - p.sprite.y) < p.radius + m.def.bodyRadius) { hit = true; break; }
      } else if (h.state !== 'dead' && Math.hypot(h.x - p.sprite.x, (h.y - 8) - p.sprite.y) < p.radius + 4) {
        hit = true; this.damageHero(p.dmg, null);
      }
      if (!hit && this.blockedAt(p.sprite.x, p.sprite.y + 8) && p.owner === 'hero' && this.groundAt(p.sprite.x, p.sprite.y + 8) !== G.Water) hit = true;
      if (hit || p.life <= 0) {
        if (p.onHit) p.onHit(p.sprite.x, p.sprite.y);
        p.life = -1;
        p.sprite.destroy(); p.glow?.destroy();
      }
    }
    this.projectiles = this.projectiles.filter(p => p.life > 0);
  }

  // ---------- Rewards ----------
  onMonsterKilled(m: Monster) {
    const s = S();
    const lv = gainExp(s, m.def.exp);
    onKill(s, m.def.kind);
    this.floatText(m.x, m.cy - 18, `+${m.def.exp} EXP`, '#c89aff', 0.9);
    const gold = Math.round(Phaser.Math.Between(m.def.gold[0], m.def.gold[1]));
    this.dropLoot(m.x, m.y, 'gold', gold);
    for (const d of m.def.drops) {
      if (Math.random() < d.chance * (d.chance < 1 ? this.der.dropBonus : 1)) {
        const q = d.min ? Phaser.Math.Between(d.min, d.max ?? d.min) : 1;
        this.dropLoot(m.x, m.y, d.id, q);
      }
    }
    this.burst(m.x, m.cy, 0xffffff, 10, 50);
    if (m.def.boss) {
      this.bossDeadAt = this.time.now;
      s.bossDefeated++;
      bus.emit(EV.BOSS_HP, null);
      bus.emit(EV.TOAST, 'ปราบผู้พิทักษ์ธอร์นวูดสำเร็จ!', '#ffd040');
      this.cameras.main.flash(400, 255, 240, 200);
      // also clean up summoned adds
      for (const o of this.monsters) if (o.spawnIndex === -2 && o.alive) o.die();
    }
    if (this.target === m) this.target = null;
    if (lv > 0) this.levelUpFx();
    bus.emit(EV.STATE_CHANGED);
  }

  levelUpFx() {
    const h = this.hero;
    sfx.levelUp();
    this.der = derive(S());
    bus.emit(EV.LEVEL_UP, S().level);
    const pillar = this.add.image(h.x, h.y, 'fx_ray').setOrigin(0.5, 1).setTint(0xffe080).setBlendMode(Phaser.BlendModes.ADD).setScale(1.2, 0.2).setDepth(99700);
    this.tweens.add({ targets: pillar, scaleY: 1, duration: 300, yoyo: true, hold: 500, onComplete: () => pillar.destroy() });
    const ring = this.add.image(h.x, h.y, 'fx_ring').setTint(0xffd040).setBlendMode(Phaser.BlendModes.ADD).setScale(0.2, 0.1).setDepth(2);
    this.tweens.add({ targets: ring, scaleX: 1.6, scaleY: 0.8, alpha: 0, duration: 800, onComplete: () => ring.destroy() });
    for (let i = 0; i < 24; i++) {
      const p = this.add.image(h.x + Math.random() * 30 - 15, h.y, 'fx_spark').setTint(0xffe080).setBlendMode(Phaser.BlendModes.ADD).setDepth(99701).setScale(0.6);
      this.tweens.add({ targets: p, y: h.y - 40 - Math.random() * 30, alpha: 0, duration: 900, delay: i * 25, onComplete: () => p.destroy() });
    }
    this.floatText(h.x, h.y - 44, 'LEVEL UP!', '#ffd040', 1.5);
  }

  dropLoot(x: number, y: number, id: string, qty: number) {
    const icon = id === 'gold' ? 'icon_gold' : `icon_${itemDef(id).icon}`;
    const tx = x + Phaser.Math.Between(-16, 16), ty = y + Phaser.Math.Between(-8, 10);
    const sp = this.add.image(x, y - 8, icon).setDepth(ty).setScale(0.45);
    this.tweens.add({ targets: sp, x: tx, duration: 450 });
    this.tweens.add({ targets: sp, y: { from: y - 8, to: ty - 22 }, duration: 220, ease: 'Quad.easeOut', yoyo: false, onComplete: () => this.tweens.add({ targets: sp, y: ty - 6, duration: 230, ease: 'Bounce.easeOut' }) });
    if (id !== 'gold' && itemDef(id).rarity >= 1) {
      const g = this.add.image(tx, ty - 6, 'fx_glow').setTint(itemDef(id).rarity >= 2 ? 0x6fb6ff : 0x7ee08a).setBlendMode(Phaser.BlendModes.ADD).setScale(0.5).setAlpha(0.6).setDepth(ty - 1);
      sp.setData('glow', g);
    }
    this.loot.push({ sprite: sp, id, qty, born: this.time.now, x: tx, y: ty });
  }

  updateLoot(time: number) {
    const h = this.hero, s = S();
    for (const l of this.loot) {
      if (time - l.born < 600 || h.state === 'dead') continue;
      const d = Math.hypot(l.x - h.x, l.y - h.y);
      if (d < 70) {
        // magnet
        l.x += (h.x - l.x) * 0.15; l.y += (h.y - l.y) * 0.15;
        l.sprite.setPosition(l.x, l.y - 6);
        (l.sprite.getData('glow') as Phaser.GameObjects.Image | undefined)?.setPosition(l.x, l.y - 6);
      }
      if (d < 10) {
        if (l.id === 'gold') { s.gold += l.qty; sfx.coin(); this.floatText(h.x, h.y - 34, `+${l.qty} G`, '#ffd040', 0.85); }
        else {
          if (!addItem(s, l.id, l.qty)) { bus.emit(EV.TOAST, 'กระเป๋าเต็ม!', '#ff8a8a'); l.born = time + 3000; continue; }
          sfx.pickup();
          const def = itemDef(l.id);
          bus.emit(EV.TOAST, `ได้รับ ${def.name}${l.qty > 1 ? ' x' + l.qty : ''}`, '#' + [0xe8e2d0, 0x7ee08a, 0x6fb6ff, 0xd48cff][def.rarity].toString(16));
          refreshCollect(s);
        }
        l.sprite.destroy();
        (l.sprite.getData('glow') as Phaser.GameObjects.Image | undefined)?.destroy();
        l.qty = 0;
        bus.emit(EV.STATE_CHANGED);
      }
    }
    this.loot = this.loot.filter(l => l.qty > 0);
  }

  // ---------- NPCs ----------
  interact() {
    if (this.nearNpc) this.tryTalk(this.nearNpc);
  }

  tryTalk(id: string) {
    const n = this.npcs.find(q => q.id === id);
    if (!n) return;
    if (Math.hypot(n.x - this.hero.x, n.y - this.hero.y) > 40) { bus.emit(EV.TOAST, 'เดินเข้าไปใกล้กว่านี้', '#e8c872'); return; }
    sfx.click();
    bus.emit(EV.NPC_TALK, id);
  }

  refreshNpcMarkers() {
    const s = S();
    for (const n of this.npcs) {
      if (n.id !== 'elder') continue;
      const active = s.quests.find(q => q.status !== 'done');
      if (active?.status === 'ready') n.marker.setTexture('fx_qdone').setVisible(true);
      else if (!active && s.quests.length < 6) n.marker.setTexture('fx_qmark').setVisible(true);
      else n.marker.setVisible(false);
    }
  }

  // helpers for UI
  countItem(id: string) { return countItem(S(), id); }
  getCooldown(id: SkillId) { return Math.max(0, (this.cooldowns[id] ?? 0) - this.time.now); }
  get skills() { return SKILLS; }
  get monsterDefs() { return MONSTERS; }
  spawnTest(kind: MonsterKind) { this.monsters.push(new Monster(this, kind, this.hero.x + 40, this.hero.y, 30, -2)); }
}

export function worldRuntime() { return runtime; }
