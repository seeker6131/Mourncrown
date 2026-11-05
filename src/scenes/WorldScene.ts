import Phaser from 'phaser';
import { generateWorld, MAP_W, MAP_H, G, zoneAt, iso, unIso, WORLD_PX_W, WORLD_PX_H, CHEST_LOOT, PLOTS, type WorldMap } from '../world/mapgen';
import { tick as settleTick, collect as settleCollect, buildingAt } from '../systems/settlement';
import { BUILDINGS, RES_NAMES, unlockedPlots, type BuildingId, type ResKey } from '../data/buildings';
import { skillMult, currentSkills, activeTier } from '../systems/stats';
import { CLASSES } from '../data/classes';
import { paintGroundIso, WATER_DEPTH } from '../art/isoArt';
import { HOUSE_ANCHOR } from '../art/textures';
import { hasAi, resOf } from '../art/aiAssets';
import { Hero } from '../entities/Hero';
import { Monster } from '../entities/Monster';
import { bus, EV, S, runtime } from '../core/events';
import { derive, gainExp, calcDamage, type Derived } from '../systems/stats';
import { addItem, useItem, countItem } from '../systems/inventory';
import { onKill, refreshCollect } from '../systems/quests';
import { MONSTERS, type MonsterKind } from '../data/monsters';
import { SKILLS, SKILL_BY_ID, type SkillId, type SkillDef } from '../data/skills';
import { itemDef, RARITY_COLORS, RARITY_NAMES } from '../data/items';
import { isGear, GEAR_BASES, baseTier, pickBase, rollRarity, makeGear } from '../systems/loot';
import { FONT } from '../ui/kit';
import { saveGame } from '../core/save';
import { sfx, startMusic } from '../audio/sfx';

/** Input shared between UI scene (touch) and world. */
export const controls = { mx: 0, my: 0, attackHeld: false, joyActive: false };

interface Projectile {
  sprite: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite; glow?: Phaser.GameObjects.Image;
  vx: number; vy: number; life: number; owner: 'hero' | 'enemy';
  dmg: number; radius: number; onHit?: (x: number, y: number) => void; homing?: boolean; trail?: number; pierce?: boolean; onTouch?: (m: Monster) => void;
}

interface Loot { sprite: Phaser.GameObjects.Image; id: string; qty: number; born: number; x: number; y: number; gear?: { rar?: number; aff?: { k: string; v: number }[] } }

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
  shieldHp = 0;
  wardrobe: { x: number; y: number } | null = null;
  shieldUntil = 0;
  nodes: { img: Phaser.GameObjects.Image; sh: Phaser.GameObjects.Image | null; x: number; y: number; tx: number; ty: number; hp: number; max: number; kind: ResKey; solid: boolean; regrowAt: number; tex: string }[] = [];
  plotViews: { x: number; y: number; objs: Phaser.GameObjects.GameObject[]; bubble: Phaser.GameObjects.Container | null; key: string }[] = [];
  lastSettle = 0;
  shadows: Phaser.GameObjects.Image[] = [];
  lastShadowNight = -1;
  heroShadow: Phaser.GameObjects.Image | null = null;
  swayers: { img: Phaser.GameObjects.Image; amp: number; ph: number; bend: number; freq: number }[] = [];
  lastStep = 0;
  butterflies: { s: Phaser.GameObjects.Image; t: number; x: number; y: number; vx: number; vy: number }[] = [];

  constructor() { super('World'); }

  create() {
    this.monsters = []; this.projectiles = []; this.loot = []; this.npcs = []; this.cooldowns = {}; this.fireflies = []; this.clouds = [];
    this.dead = false; this.boss = null; this.target = null; this.chests = []; this.nightLights = []; this.rays = []; this.nodes = []; this.plotViews = []; this.shadows = []; this.heroShadow = null; this.swayers = []; this.butterflies = [];
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
        if (this.anims.exists('env_campfire')) {
          this.castShadow(this.add.sprite(o.x, o.y + 6, '__DEFAULT').setDepth(o.y).setScale(0.5).play('env_campfire'), 0.5);
          this.burstLoop(o.x, o.y - 12);
        } else if (ai) {
          const cf = this.fit(this.add.image(o.x, o.y + 4, 'ai_campfire').setOrigin(0.5, 0.92).setDepth(o.y));
          this.tweens.add({ targets: cf, scaleY: { from: cf.scaleY * 0.96, to: cf.scaleY * 1.05 }, scaleX: { from: cf.scaleX * 1.02, to: cf.scaleX * 0.98 }, duration: 130, yoyo: true, repeat: -1 });
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
        if (!ai) this.add.image(c.x + 10, c.y + 4, 'fx_shadow').setScale(w * 1.15, h * 1.25).setAlpha(0.8).setDepth(1);
        if (ai) {
          const bimg = this.fit(this.add.image(c.x, bot.y + 3, key).setOrigin(0.5, 1).setDepth(c.y + 10));
          this.castShadow(bimg);
          this.addChimney(bimg, o.type === 'house' ? (o.v ? [0.33, 0.04] : [0.27, 0.03]) : o.v === 0 ? [0.77, 0.05] : null);
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
      if (o.type === 'wardrobe') {
        const t = this.fit(this.add.image(o.x, o.y + 6, 'obj_tent_0').setOrigin(0.5, 0.92).setDepth(o.y).setTint(0xc8a0ff));
        this.castShadow(t, 0.8);
        const ic = this.add.image(o.x, o.y - 44, 'fx_hanger').setDepth(99999);
        this.tweens.add({ targets: ic, y: o.y - 48, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        const lb = this.add.text(o.x, o.y + 10, 'ห้องแต่งตัว', { fontFamily: FONT, fontSize: '7px', color: '#e8d0ff', stroke: '#0b0705', strokeThickness: 2, resolution: 4 }).setOrigin(0.5, 0).setDepth(o.y + 30);
        void lb;
        this.wardrobe = { x: o.x, y: o.y + 14 };
        continue;
      }
      if (o.type === 'chest') {
        const opened = S().chests.includes(o.v);
        const img = this.fit(this.add.image(o.x, o.y + 4, opened ? 'obj_chest_1' : 'obj_chest_0').setOrigin(0.5, 0.95).setDepth(o.y));
        this.castShadow(img, 0.8);
        this.add.image(o.x, o.y + 3, 'fx_shadow').setScale(0.8, 0.7).setDepth(1);
        const glow = opened ? null : this.addGlow(o.x, o.y - 4, 0xffd060, 0.45, true);
        this.chests.push({ id: o.v, x: o.x, y: o.y, img, glow });
        continue;
      }
      if (o.type === 'wall') {
        if (ai && o.v < 6) {
          if ((o.tx + o.ty) % 2) continue; // ai wall pieces span ~2 tiles
          this.castShadow(this.fit(this.add.image(o.x, o.y + 6, `obj_wall_${o.v}`).setOrigin(0.5, 0.92).setDepth(o.y + 2)), 0.8);
          continue;
        }
        const img = this.add.image(o.x, o.y + 4, `obj_wall_${o.v}`);
        const hh = o.v >= 6 ? 26 : 24;
        img.setOrigin(19 / img.width, (hh + 12) / img.height).setDepth(o.y + 2);
        continue;
      }
      if (o.type === 'tree' || o.type === 'pine') this.add.image(o.x, o.y + 4, 'fx_shadow').setScale(1.2, 1).setAlpha(0.7).setDepth(1);
      if (['bigrock', 'bush', 'tent', 'stall', 'well', 'statue', 'haystack', 'stairs', 'altar'].includes(o.type)) this.add.image(o.x + 3, o.y + 3, 'fx_shadow').setScale(1.4, 1.1).setDepth(1);
      if (o.type === 'lamp' && this.anims.exists('env_lamp')) {
        const lp = this.add.sprite(o.x, o.y + 4, '__DEFAULT').setDepth(o.y).setScale(0.5).play('env_lamp');
        lp.anims.setProgress(Math.random());
        this.castShadow(lp, 0.8);
        this.nightLights.push(this.addGlow(o.x + 5, o.y - 20, 0xffd060, 0.9, true));
        continue;
      }
      let key = `obj_${o.type}_${o.v}`;
      if (!this.textures.exists(key)) key = `obj_${o.type}_0`;
      if (!this.textures.exists(key)) continue;
      const flat = o.type === 'flower' || o.type === 'tuft' || o.type === 'lily';
      const oy = o.type === 'lily' ? WATER_DEPTH + 2 : flat ? 2 : 4;
      const originY: Record<string, number> = ai
        ? { fence: 0.85, crate: 0.9, stall: 0.92, altar: 0.88, tent: 0.92, wall: 0.92, barrel: 0.95, stairs: 0.9, well: 0.92, chest: 0.92 }
        : { fence: 0.78, crate: 0.75, stall: 0.85, altar: 0.86, tent: 0.92 };
      const img = this.fit(this.add.image(o.x, o.y + oy, key).setOrigin(0.5, originY[o.type] ?? 0.97));
      img.setDepth(o.type === 'lily' ? 1 : flat ? o.y - 12 : o.type === 'arch' ? o.y + 6 : o.y);
      if (o.type === 'tree' || o.type === 'pine') img.setFlipX(((o.x * 7 + o.y * 3) & 8) > 0);
      const shd = !flat && o.type !== 'mushrooms' ? this.castShadow(img, o.type === 'tree' || o.type === 'pine' ? 1 : 0.85) : null;
      if (o.type === 'tree' || o.type === 'pine' || o.type === 'rock' || o.type === 'bigrock') {
        const wood = o.type === 'tree' || o.type === 'pine';
        const max = wood ? 6 : o.type === 'bigrock' ? 7 : 3;
        this.nodes.push({ img, sh: shd, x: o.x, y: o.y, tx: o.tx, ty: o.ty, hp: max, max, kind: wood ? 'wood' : 'stone', solid: !!o.solid, regrowAt: 0, tex: img.texture.key });
      }
      if (o.type === 'tree' || o.type === 'pine') {
        if (o.v === 2) this.addGlow(o.x, o.y - 30, 0x5ae0d0, 1.2, true);
      }
      const amp: Record<string, number> = { tree: 0.016, pine: 0.014, tuft: 0.16, flower: 0.13, bush: 0.035, mushrooms: 0.05, haystack: 0.01 };
      if (amp[o.type]) this.swayers.push({ img, amp: amp[o.type], ph: (o.x * 0.013 + o.y * 0.007) % 6.28, bend: 0, freq: o.type === 'tree' || o.type === 'pine' ? 0.9 : 1.8 });
      if (o.type === 'lily') this.tweens.add({ targets: img, y: img.y + 1, duration: 1400 + (o.x % 600), yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      if (o.type === 'lamp') this.nightLights.push(this.addGlow(o.x + (ai ? -6 : 0), o.y - (ai ? 28 : 26), 0xffd060, 0.9, true));
      if (o.type === 'crystal') this.addGlow(o.x, o.y - 12, 0x5ae0ff, 1.8, true);
      if (o.type === 'altar') this.addGlow(o.x, o.y - (ai ? 30 : 22), 0xb07aff, 1.8, true);
      if (o.type === 'mushrooms' && o.v === 1) this.addGlow(o.x, o.y - 6, 0x6ae0ff, 0.6, true);
    }

    // waving banners
    if (this.anims.exists('env_flag')) for (const [fx, fy] of [[26, 36], [26, 42], [9, 34], [88, 34], [88, 46]] as const) {
      const p = iso(fx + 0.5, fy + 0.5);
      if (!this.canMove(p.x, p.y, 2)) continue;
      const f = this.add.sprite(p.x, p.y + 4, '__DEFAULT').setDepth(p.y).setScale(0.5).play('env_flag');
      f.anims.setProgress(Math.random());
      this.castShadow(f, 0.7);
    }

    // NPCs
    for (const n of this.map.npcs) {
      const { x, y } = iso(n.x + 0.5, n.y + 0.5);
      this.add.image(x, y, 'fx_shadow').setDepth(1).setScale(0.8);
      const sp = this.add.sprite(x, y, `npc_${n.id}`).setOrigin(0.5, 0.95).setDepth(y).play(`npc_${n.id}_idle`);
      if (sp.texture.key.startsWith('an_')) sp.setScale(0.5);
      this.castShadow(sp, 0.8);
      const marker = this.add.image(x, y - 40, 'fx_qmark').setDepth(99999).setVisible(false);
      this.tweens.add({ targets: marker, y: y - 44, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      sp.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.tryTalk(n.id));
      this.npcs.push({ id: n.id, x, y, sprite: sp, marker });
    }

    this.buildPlots();

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
      ['ONE', 'TWO', 'THREE'].forEach((k, i) => this.input.keyboard!.on('keydown-' + k, () => { const id = currentSkills(S())[i]; if (id) this.castSkill(id); }));
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
    const z = Math.max(1, Math.min(h / 320, w / 560));
    this.cameras.main.setZoom(z);
  }

  // ---------- Ambient / atmosphere ----------
  animateNature(time: number, dt: number) {
    const v = this.cameras.main.worldView;
    const t = time / 1000;
    const h = this.hero;
    for (const sw of this.swayers) {
      const im = sw.img;
      if (im.x < v.x - 60 || im.x > v.right + 60 || im.y < v.y - 10 || im.y > v.bottom + 140) continue;
      // travelling wind gusts across the map
      const gust = 0.55 + 0.45 * Math.sin(t * 0.45 - im.x * 0.004 - im.y * 0.002);
      let target = 0;
      if (sw.amp > 0.05) {
        // grass & flowers bend away from the hero and monsters
        const dx = im.x - h.x, dy = im.y - h.y;
        if (Math.abs(dx) < 14 && Math.abs(dy) < 8) target = Math.sign(dx || 1) * 0.5;
        for (const m of this.monsters) if (Math.abs(im.x - m.x) < 12 && Math.abs(im.y - m.y) < 7) target = Math.sign(im.x - m.x || 1) * 0.45;
      } else if (sw.amp > 0.02) {
        const dx = im.x - h.x, dy = im.y - h.y;
        if (Math.abs(dx) < 18 && Math.abs(dy) < 10 && h.state === 'walk') target = Math.sin(t * 20) * 0.08; // bush rustle
      }
      sw.bend += (target - sw.bend) * Math.min(1, dt * 0.012);
      im.setRotation(sw.amp * (Math.sin(t * sw.freq + sw.ph) * gust + 0.35 * gust) + sw.bend);
    }
    // butterflies in meadow/village by day
    if (this.butterflies.length < 10 && this.night < 0.5 && (this.currentZone === 'meadow' || this.currentZone === 'village') && Math.random() < 0.03) {
      const x = v.x + Math.random() * v.width, y = v.y + Math.random() * v.height;
      const s = this.add.image(x, y, 'fx_bfly').setTint([0xffb0d8, 0xfff07a, 0xa8d8ff, 0xffffff][Math.floor(Math.random() * 4)]).setDepth(99950);
      this.butterflies.push({ s, t: Math.random() * 10, x, y, vx: 0, vy: 0 });
    }
    for (const b of this.butterflies) {
      b.t += dt / 1000;
      b.vx += (Math.random() - 0.5) * 0.08; b.vy += (Math.random() - 0.5) * 0.06;
      b.vx = Phaser.Math.Clamp(b.vx, -0.5, 0.5); b.vy = Phaser.Math.Clamp(b.vy, -0.35, 0.35);
      b.x += b.vx * dt * 0.06; b.y += b.vy * dt * 0.06;
      b.s.setPosition(b.x, b.y + Math.sin(b.t * 6) * 2).setScale(Math.abs(Math.sin(b.t * 14)) * 0.9 + 0.15, 1).setFlipX(b.vx < 0);
      const off = b.x < v.x - 40 || b.x > v.right + 40 || b.y < v.y - 40 || b.y > v.bottom + 40 || this.night > 0.6;
      if (off) { b.s.destroy(); b.t = -1; }
    }
    this.butterflies = this.butterflies.filter(b => b.t >= 0);
  }

  /** Draw hi-res (2x) art at world scale. */
  fit<T extends Phaser.GameObjects.Image>(img: T): T { const r = resOf(img.texture.key); if (r !== 1) img.setScale(1 / r); return img; }

  /** Rising, drifting chimney smoke at a point given as a fraction of the building sprite. */
  addChimney(img: Phaser.GameObjects.Image, at: [number, number] | null) {
    if (!at) return;
    const x = img.x - img.displayWidth / 2 + at[0] * img.displayWidth;
    const y = img.y - img.displayHeight + at[1] * img.displayHeight;
    this.time.addEvent({ delay: 420, loop: true, callback: () => {
      if (!this.cameras.main.worldView.contains(x, y + 40)) return;
      if (this.anims.exists('env_smoke') && Math.random() < 0.4) {
        const sm = this.playFx('env_smoke', x + 4, y - 2, 99960, { scale: 0.35, normal: true, alpha: 0.75 });
        if (sm) { sm.setOrigin(0.3, 1); this.tweens.add({ targets: sm, x: x + 14, y: y - 12, duration: 1200 }); }
        return;
      }
      const p = this.add.image(x + Math.random() * 3, y, 'fx_glow').setTint(0xc8c0c8).setAlpha(0.32).setScale(0.12).setDepth(99960);
      const life = 2600 + Math.random() * 1200;
      this.tweens.add({ targets: p, y: y - 34 - Math.random() * 10, x: p.x + 10 + Math.random() * 12, scale: 0.42, alpha: 0, duration: life, ease: 'Sine.easeOut', onComplete: () => p.destroy() });
    } });
  }

  /** Dust puff at the feet (footsteps, running animals). */
  dust(x: number, y: number, col = 0xb8a080) {
    for (let i = 0; i < 2; i++) {
      const p = this.add.image(x + Math.random() * 6 - 3, y, 'fx_px').setTint(col).setAlpha(0.7).setDepth(y - 1).setScale(1);
      this.tweens.add({ targets: p, y: y - 3 - Math.random() * 3, x: p.x + Math.random() * 6 - 3, alpha: 0, scale: 1.8, duration: 400 + Math.random() * 200, onComplete: () => p.destroy() });
    }
  }

  /** Build (and cache) a pixel-art cast-shadow texture: the silhouette sheared onto the ground, sun from the upper-left. */
  shadowTex(img: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite): { key: string; ox: number; oy: number } {
    const fr = img.frame;
    const flip = img.flipX;
    const key = `sh_${fr.texture.key}_${fr.name}_${flip ? 1 : 0}_${img.originY.toFixed(2)}`;
    if (!this.textures.exists(key)) {
      const W = fr.cutWidth, H = fr.cutHeight;
      const ox = img.originX * W, oy = img.originY * H;
      const SH = 0.75, SQ = 0.3;
      const src = fr.source.image as HTMLImageElement | HTMLCanvasElement;
      const sil = document.createElement('canvas'); sil.width = W; sil.height = H;
      const sc = sil.getContext('2d')!;
      sc.imageSmoothingEnabled = false;
      if (flip) { sc.translate(W, 0); sc.scale(-1, 1); }
      sc.drawImage(src, fr.cutX, fr.cutY, W, H, 0, 0, W, H);
      sc.setTransform(1, 0, 0, 1, 0, 0);
      sc.globalCompositeOperation = 'source-in';
      sc.fillStyle = '#140a24'; sc.fillRect(0, 0, W, H);
      const top = Math.ceil(oy * SQ);
      const cv = document.createElement('canvas'); cv.width = Math.ceil(W + oy * SH) + 2; cv.height = Math.ceil(top + (H - oy)) + 2;
      const c = cv.getContext('2d')!;
      c.imageSmoothingEnabled = false;
      for (let y = 0; y < H; y++) {
        const h = oy - y;
        if (h < 0) { c.drawImage(sil, 0, y, W, 1, 0, Math.round(top - h * 0.3), W, 1); continue; }
        c.drawImage(sil, 0, y, W, 1, Math.round(h * SH), Math.round(top - h * SQ), W, 1);
      }
      this.textures.addCanvas(key, cv);
      this.textures.get(key).customData = { ox: ox / cv.width, oy: top / cv.height };
    }
    const d = this.textures.get(key).customData as { ox: number; oy: number };
    return { key, ox: d.ox, oy: d.oy };
  }

  castShadow(img: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite, strength = 1) {
    const t = this.shadowTex(img);
    const sh = this.add.image(img.x, img.y, t.key).setOrigin(t.ox, t.oy).setDepth(1.2).setAlpha(0.32 * strength).setScale(Math.abs(img.scaleX), Math.abs(img.scaleY));
    sh.setData('a', 0.32 * strength);
    this.shadows.push(sh);
    return sh;
  }

  /** Moving cast shadow that follows an animated sprite (hero, monsters). */
  followShadow(img: Phaser.GameObjects.Sprite, sh: Phaser.GameObjects.Image | null, baseX: number, baseY: number, alpha: number): Phaser.GameObjects.Image {
    const t = this.shadowTex(img);
    if (!sh) sh = this.add.image(baseX, baseY, t.key).setDepth(1.3);
    if (sh.texture.key !== t.key) sh.setTexture(t.key);
    sh.setScale(1 / resOf(img.texture.key));
    sh.setOrigin(t.ox, t.oy).setPosition(Math.round(baseX), Math.round(baseY)).setAlpha(alpha * (1 - this.night * 0.75));
    return sh;
  }

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
    if (Math.abs(this.lastShadowNight - night) > 0.02) { this.lastShadowNight = night; for (const sh of this.shadows) sh.setAlpha((sh.getData('a') as number) * (1 - night * 0.75)); }
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
    this.animateNature(time, dt);
    { const t = unIso(h.x, h.y); const inTown = this.currentZone === 'village' || (t.tx >= 3 && t.tx <= 27 && t.ty >= 49 && t.ty <= 68);
      h.casual = inTown || s.outfit === 'gather'; }
    this.updateSettlement(time);
    if (time % 1000 < 20) this.regrowNodes(time);
    if (h.state === 'walk' && time - this.lastStep > 210) { this.lastStep = time; this.dust(h.x, h.y); }
    this.heroRing.setPosition(h.x, h.y).setVisible(h.state !== 'dead');
    this.heroShadow = this.followShadow(h.sprite, this.heroShadow, h.x, h.y, h.state === 'dead' ? 0 : 0.3);
    for (const m of this.monsters) {
      if (!m.sprite.active) { (m as unknown as { cast?: Phaser.GameObjects.Image }).cast?.destroy(); continue; }
      const mm = m as unknown as { cast?: Phaser.GameObjects.Image };
      const near = Math.abs(m.x - h.x) < 400 && Math.abs(m.y - h.y) < 260;
      if (!near) { mm.cast?.setVisible(false); continue; }
      mm.cast = this.followShadow(m.sprite, mm.cast ?? null, m.x, m.y, m.alive ? (m.def.kind === 'wisp' ? 0.15 : 0.28) : 0);
      mm.cast.setVisible(true);
    }
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
    this.plotViews.forEach((v, i) => { if (Math.hypot(v.x - h.x, v.y - h.y) < 30) near = 'plot:' + i; });
    if (this.wardrobe && Math.hypot(this.wardrobe.x - h.x, this.wardrobe.y - h.y) < 32) near = 'wardrobe';
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
    for (const id of currentSkills(s)) {
      const k = SKILL_BY_ID[id];
      if ((k.kind === 'heal') && s.hp < this.der.maxHp * 0.55 && this.skillReady(id, time)) { this.castSkill(id); return false; }
    }

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
    if (!t) {
      const n = this.nearestNode(170);
      if (!n) return false;
      const dn = Math.hypot(n.x - h.x, n.y - h.y);
      if (dn > 18) { if (h.busy(time)) return false; const sp = this.der.moveSpeed * (dt / 1000); const vx = (n.x - h.x) / dn, vy = (n.y + 6 - h.y) / dn; const mv = this.moveHero(vx * sp, vy * sp); h.setFacing(vx, vy); return mv; }
      this.basicAttack(time);
      return false;
    }
    const d = Math.hypot(t.x - h.x, t.y - h.y);
    // skills
    if (!h.busy(time)) {
      const near = this.monsters.filter(m => m.alive && Math.hypot(m.x - h.x, m.y - h.y) < 46).length;
      for (const id of currentSkills(s)) {
        const k = SKILL_BY_ID[id];
        if (!this.skillReady(id, time) || k.kind === 'heal') continue;
        if (k.kind === 'buff' || k.kind === 'shield') { if (d < 120) { this.castSkill(id); return false; } continue; }
        const aoe = k.kind === 'spin' || k.kind === 'nova' || k.kind === 'rain';
        if (d <= k.range + t.def.bodyRadius && (!aoe || near >= 2 || t.def.boss || t.hp > t.maxHp * 0.4)) { this.castSkill(id); return false; }
      }
    }
    const ranged = CLASSES[s.cls ?? 'novice'].ranged && activeTier(s) > 0;
    const reach = ranged ? 95 : t.def.bodyRadius + 14;
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

  heroArrow(ang: number, atk: number) {
    const h = this.hero;
    const a = this.add.image(h.x + Math.cos(ang) * 8, h.y - 10 + Math.sin(ang) * 6, 'fx_arrow').setRotation(ang).setDepth(99000);
    this.projectiles.push({ sprite: a, vx: Math.cos(ang) * 260, vy: Math.sin(ang) * 260, life: 650, owner: 'hero', dmg: 0, radius: 6,
      onHit: (x, y) => { const m = this.monsters.find(q => q.alive && Math.hypot(q.x - x, q.cy - y) < 6 + q.def.bodyRadius + 2); if (m) this.hitMonster(m, atk, 1, 'phys', 3); } });
  }

  heroOrb(ang: number, matk: number) {
    const h = this.hero;
    const o = this.add.image(h.x + Math.cos(ang) * 8, h.y - 12 + Math.sin(ang) * 6, 'fx_orb').setDepth(99000).setBlendMode(Phaser.BlendModes.ADD).setTint(S().cls === 'cleric' ? 0xffe890 : 0xffffff);
    this.projectiles.push({ sprite: o, vx: Math.cos(ang) * 200, vy: Math.sin(ang) * 200, life: 750, owner: 'hero', dmg: 0, radius: 7, trail: S().cls === 'cleric' ? 0xffe890 : 0x8ad0ff,
      onHit: (x, y) => { const m = this.monsters.find(q => q.alive && Math.hypot(q.x - x, q.cy - y) < 7 + q.def.bodyRadius + 2); if (m) this.hitMonster(m, matk, 1, 'magic', 3); } });
  }

  // ---------- Gathering ----------
  nearestNode(maxD: number) {
    let best: WorldScene['nodes'][number] | null = null, bd = maxD;
    for (const n of this.nodes) { if (n.hp <= 0) continue; const d = Math.hypot(n.x - this.hero.x, n.y - this.hero.y); if (d < bd) { bd = d; best = n; } }
    return best;
  }

  hitNode(n: WorldScene['nodes'][number]) {
    const s = S();
    if (n.hp <= 0) return;
    n.hp--;
    const big = n.kind === 'wood' ? 2 : n.max > 4 ? 2 : 1;
    let amt = big + (Math.random() < 0.3 ? 1 : 0);
    if (s.outfit === 'gather') amt *= 2;
    if (n.hp <= 0) amt += n.kind === 'wood' ? 6 : 4;
    s.res[n.kind] += amt;
    sfx.hit();
    const x0 = n.img.x;
    this.tweens.add({ targets: n.img, x: x0 + 1.5, duration: 40, yoyo: true, repeat: 2, onComplete: () => n.img.setX(x0) });
    this.burst(n.x, n.y - (n.kind === 'wood' ? 10 : 4), n.kind === 'wood' ? 0xc89050 : 0xb0aab8, 6, 40);
    if (n.kind === 'wood') for (let i = 0; i < 3; i++) {
      const lf = this.add.image(n.x + Math.random() * 30 - 15, n.y - 30 - Math.random() * 20, 'fx_leaf').setDepth(n.y + 1);
      this.tweens.add({ targets: lf, y: n.y, x: lf.x + Math.random() * 16 - 8, rotation: 4, alpha: 0, duration: 900, onComplete: () => lf.destroy() });
    }
    this.floatText(n.x, n.y - 24, `+${amt} ${RES_NAMES[n.kind]}`, n.kind === 'wood' ? '#e8b878' : '#d0d0e0', 0.85);
    if (n.hp <= 0) {
      n.img.setVisible(false); n.sh?.setVisible(false);
      n.img.setData('stump', this.add.image(n.x, n.y + 4, n.kind === 'wood' ? 'fx_stump' : 'fx_rubble').setOrigin(0.5, 0.9).setDepth(n.y));
      if (n.solid) this.map.blocked[n.ty * MAP_W + n.tx] = 0;
      n.regrowAt = this.time.now + (n.kind === 'wood' ? 120000 : 180000);
    }
    bus.emit(EV.STATE_CHANGED);
  }

  regrowNodes(time: number) {
    for (const n of this.nodes) {
      if (n.hp > 0 || time < n.regrowAt) continue;
      if (Math.hypot(n.x - this.hero.x, n.y - this.hero.y) < 20) continue;
      n.hp = n.max; n.img.setVisible(true).setAlpha(0); n.sh?.setVisible(true);
      (n.img.getData('stump') as Phaser.GameObjects.Image | undefined)?.destroy();
      this.tweens.add({ targets: n.img, alpha: 1, duration: 800 });
      if (n.solid) this.map.blocked[n.ty * MAP_W + n.tx] = 1;
    }
  }

  // ---------- Settlement ----------
  buildPlots() {
    for (const v of this.plotViews) { v.objs.forEach(o => o.destroy()); v.bubble?.destroy(); }
    this.plotViews = [];
    const s = S();
    PLOTS.forEach(([px, py], i) => {
      const c = iso(px + 0.5, py + 0.5);
      const b = buildingAt(s, i);
      const objs: Phaser.GameObjects.GameObject[] = [];
      this.map.blocked[py * MAP_W + px] = b ? 1 : 0;
      if (!b && i >= unlockedPlots(s.bossDefeated)) {
        const lock = this.add.image(c.x, c.y - 10, 'icon_res_lock').setDepth(c.y).setAlpha(0.85);
        objs.push(lock);
      } else if (!b) {
        const sign = this.fit(this.add.image(c.x, c.y + 4, 'obj_sign_0').setOrigin(0.5, 0.95).setDepth(c.y));
        const ham = this.add.image(c.x, c.y - 30, 'icon_res_hammer').setDepth(99999).setScale(0.6);
        this.tweens.add({ targets: ham, y: c.y - 34, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        objs.push(sign, ham);
      } else {
        objs.push(...this.drawBuilding(b.type as BuildingId, b.level, c.x, c.y));
        const lv = this.add.text(c.x, c.y + 10, `Lv${b.level}`, { fontFamily: FONT, fontSize: '7px', color: '#ffe7a0', stroke: '#0b0705', strokeThickness: 2, resolution: 4 }).setOrigin(0.5, 0).setDepth(c.y + 30);
        objs.push(lv);
      }
      this.plotViews.push({ x: c.x, y: c.y, objs, bubble: null, key: b ? `${b.type}${b.level}` : 'empty' });
    });
  }

  drawBuilding(type: BuildingId, level: number, x: number, y: number): Phaser.GameObjects.GameObject[] {
    const o: Phaser.GameObjects.GameObject[] = [];
    const add = (k: string, dx: number, dy: number, s = 1) => {
      if (!this.textures.exists(k)) return;
      const im = this.fit(this.add.image(x + dx, y + dy, k).setOrigin(0.5, 0.95));
      im.setScale(im.scaleX * s).setDepth(y + dy);
      o.push(im, this.castShadow(im, 0.8));
    };
    if (this.textures.exists(`ai_bld_${type}`)) { add(`ai_bld_${type}`, 0, 12); return o; }
    if (type === 'forge') { add('obj_building_0', 0, 14, 0.8); }
    else if (type === 'kitchen') {
      add('obj_stall_0', -4, 4, 0.9); add('obj_barrel_0', 18, 6);
      if (this.anims.exists('env_campfire')) { const cf = this.add.sprite(x - 20, y + 10, '__DEFAULT').setScale(0.4).setDepth(y + 10).play('env_campfire'); o.push(cf); }
    }
    else if (type === 'warehouse') { add('obj_crate_0', -14, 2); add('obj_crate_0', -2, 8); add('obj_crate_0', -8, -4, 1.1); add('obj_barrel_0', 12, 2); add('obj_barrel_0', 18, 10); add('obj_crate_0', 8, -6); add('obj_haystack_0', -20, 10); }
    if (level >= 3) add('obj_lamp_0', -22, -4);
    return o;
  }

  updateSettlement(time: number) {
    if (time - this.lastSettle < 1000) return;
    this.lastSettle = time;
    const s = S();
    settleTick(s);
    PLOTS.forEach((_, i) => {
      const b = buildingAt(s, i), v = this.plotViews[i];
      if (!v) return;
      const key = b ? `${b.type}${b.level}` : 'empty';
      if (key !== v.key) { this.buildPlots(); return; }
      const res = b ? BUILDINGS[b.type as BuildingId].produces : undefined;
      const show = !!res && b!.stored >= 1;
      if (show && !v.bubble) {
        const bub = this.add.container(v.x, v.y - 44).setDepth(99998);
        const g = this.add.graphics().fillStyle(0xffffff, 0.95).fillCircle(0, 0, 9).fillTriangle(-4, 7, 4, 7, 0, 13).lineStyle(1.5, 0x3a8a3a, 1).strokeCircle(0, 0, 9);
        bub.add([g, this.add.image(0, 0, `icon_res_${res}`).setScale(0.5)]);
        this.tweens.add({ targets: bub, y: v.y - 48, duration: 650, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        v.bubble = bub;
      } else if (!show && v.bubble) { v.bubble.destroy(); v.bubble = null; }
      // walk close to collect
      if (show && Math.hypot(v.x - this.hero.x, v.y - this.hero.y) < 34) {
        const r = settleCollect(s, i);
        if (r) { sfx.coin(); this.floatText(v.x, v.y - 30, `+${r.amount} ${RES_NAMES[r.res]}`, '#9fffb0', 1); bus.emit(EV.STATE_CHANGED); }
      }
    });
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
    let node: WorldScene['nodes'][number] | null = null;
    if (best) h.setFacing(best.x - h.x, best.y - h.y);
    else { node = this.nearestNode(30); if (node) h.setFacing(node.x - h.x, node.y - 6 - h.y); }
    const dur = Math.min(260, this.der.attackInterval * 0.8);
    const st = S(), rng = CLASSES[st.cls ?? 'novice'].ranged && activeTier(st) > 0 ? CLASSES[st.cls].ranged : false;
    if (rng) {
      const t = this.nearestEnemy(140);
      if (!t) { node = this.nearestNode(30); }
      if (t) {
        const ang = Math.atan2(t.cy - (h.y - 10), t.x - h.x);
        h.setFacing(Math.cos(ang), Math.sin(ang));
        h.doAttack(time, dur);
        if (rng === 'arrow') { sfx.arrow(); this.heroArrow(ang, this.der.atk); }
        else { sfx.magic(); this.heroOrb(ang, this.der.matk); }
        return;
      }
    }
    h.doAttack(time, dur);
    sfx.swing();
    // slash visual
    const ang = Math.atan2(h.facing.y, h.facing.x);
    const sx = h.x + h.facing.x * 14, sy = h.y - 9 + h.facing.y * 12;
    const fxs = this.playFx('fxa_slash', h.x + h.facing.x * 12, h.y - 9 + h.facing.y * 10, h.y + 5, { scale: 0.55, rot: ang });
    if (fxs) { fxs.setOrigin(0.4, 0.5); }
    else {
    const sl = this.add.image(sx, sy, 'fx_slash').setRotation(ang).setDepth(h.y + 5).setBlendMode(Phaser.BlendModes.ADD).setScale(0.7).setAlpha(0.95);
    this.tweens.add({ targets: sl, scale: 1, alpha: 0, rotation: ang + 0.5, duration: 200, onComplete: () => sl.destroy() });
    }
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
      if (!hitAny && node) this.hitNode(node);
    });
  }

  hitMonster(m: Monster, atk: number, mult: number, kind: 'phys' | 'magic', knock = 6) {
    const r = calcDamage(atk * (S().outfit === 'gather' ? 0.6 : 1), m.def.def, mult, this.der.crit);
    m.takeHit(r.dmg, this.hero.x, this.hero.y, knock);
    if (this.der.leech > 0) { const st = S(); st.hp = Math.min(this.der.maxHp, st.hp + r.dmg * this.der.leech); }
    if (r.crit) sfx.crit(); else sfx.hit();
    this.floatText(m.x + (Math.random() * 10 - 5), m.cy - 10, String(r.dmg), r.crit ? '#ffd040' : kind === 'magic' ? '#9ad8ff' : '#ffffff', r.crit ? 1.4 : 1);
    this.hitSpark(m.x, m.cy, r.crit ? 0xffd040 : kind === 'magic' ? 0x8ad0ff : 0xffffff);
    if (m.def.boss) bus.emit(EV.BOSS_HP, Math.max(0, m.hp), m.maxHp, m.def.name);
    if (!m.alive) this.onMonsterKilled(m);
  }

  skillReady(id: SkillId, time: number) {
    const sk = SKILL_BY_ID[id], s = S();
    return currentSkills(s).includes(id) && (this.cooldowns[id] ?? 0) <= time && s.mp >= sk.mp;
  }

  castSkill(id: SkillId) {
    const time = this.time.now, s = S(), h = this.hero, sk = SKILL_BY_ID[id];
    if (!sk || h.state === 'dead') return;
    if (!currentSkills(s).includes(id)) { sfx.error(); return; }
    if ((this.cooldowns[id] ?? 0) > time) return;
    if (s.mp < sk.mp) { bus.emit(EV.TOAST, 'MP ไม่พอ', '#7ab8ff'); sfx.error(); return; }
    if (h.busy(time) && h.state !== 'attack') return;
    s.mp -= sk.mp;
    this.cooldowns[id] = time + sk.cooldown;
    bus.emit(EV.SKILL_CAST, id, sk.cooldown);
    bus.emit(EV.STATE_CHANGED);
    const d = this.der;
    const base = (sk.stat === 'matk' ? d.matk : d.atk);
    const mult = sk.power * skillMult(s, id);
    const kind = sk.stat === 'matk' ? 'magic' : 'phys';
    const col = sk.color ?? 0xffffff;
    const tgt = this.nearestEnemy(Math.max(60, sk.range + 30));
    if (tgt) h.setFacing(tgt.x - h.x, tgt.y - h.y);
    const fx = h.facing.x, fy = h.facing.y, ang = Math.atan2(fy, fx);
    const hitArea = (x: number, y: number, r: number, m2 = mult, knock = 8) => {
      for (const m of this.monsters) if (m.alive && Math.hypot(m.x - x, (m.y - y) * 1.3) < r + m.def.bodyRadius) this.hitMonster(m, base, m2, kind, knock);
    };
    switch (sk.kind) {
      case 'strike': {
        const n = sk.count ?? 1;
        h.doAttack(time, 260 * n);
        for (let i = 0; i < n; i++) this.time.delayedCall(80 + i * 200, () => {
          sfx.crit();
          const fxs = this.playFx('fxa_slash', h.x + fx * 14, h.y - 9 + fy * 10, h.y + 5, { scale: 0.8, rot: ang + (i % 2 ? Math.PI * 0.9 : 0) });
          fxs?.setOrigin(0.4, 0.5).setTint(col);
          hitArea(h.x + fx * 18, h.y + fy * 14, 18, mult, 14);
        });
        break;
      }
      case 'spin': {
        const n = sk.count ?? 1, R = sk.radius ?? 42;
        h.doAttack(time, 220 * n + 100);
        sfx.cyclone();
        for (let i = 0; i < n; i++) this.time.delayedCall(60 + i * 220, () => {
          const r1 = this.add.image(h.x, h.y - 8, 'fx_slash').setBlendMode(Phaser.BlendModes.ADD).setDepth(h.y + 6).setScale(R / 22).setTint(col);
          const r2 = this.add.image(h.x, h.y - 8, 'fx_slash').setBlendMode(Phaser.BlendModes.ADD).setDepth(h.y + 6).setScale(R / 18).setRotation(Math.PI).setTint(col);
          this.tweens.add({ targets: [r1, r2], rotation: '+=9', alpha: 0, duration: 260, onComplete: () => { r1.destroy(); r2.destroy(); } });
          this.surround(h.x, h.y, col, { rings: 1, height: 12, radius: R * 0.7, motes: 6, dur: 300 });
          hitArea(h.x, h.y, R, mult, 10);
        });
        break;
      }
      case 'dash': case 'leap': {
        const dist = sk.kind === 'leap' && tgt ? Math.min(sk.radius ? sk.range : 90, Math.hypot(tgt.x - h.x, tgt.y - h.y) - 8) : (sk.radius ?? 70);
        const sx = h.x, sy = h.y;
        let ex = sx + fx * dist, ey = sy + fy * dist;
        // stop at obstacles
        for (let t = 0.1; t <= 1; t += 0.1) if (!this.canMove(sx + fx * dist * t, sy + fy * dist * t, 5)) { ex = sx + fx * dist * (t - 0.1); ey = sy + fy * dist * (t - 0.1); break; }
        h.doAttack(time, 360);
        h.invulnUntil = time + 400;
        sfx.swing();
        const hitSet = new Set<Monster>();
        this.tweens.addCounter({ from: 0, to: 1, duration: sk.kind === 'leap' ? 320 : 200, ease: sk.kind === 'leap' ? 'Sine.easeInOut' : 'Quad.easeOut',
          onUpdate: tw => {
            const t = tw.getValue()!;
            h.x = sx + (ex - sx) * t; h.y = sy + (ey - sy) * t;
            if (sk.kind === 'leap') h.sprite.y -= Math.sin(t * Math.PI) * 26;
            else {
              const g = this.add.image(h.x, h.y - 10, h.sprite.texture.key, h.sprite.frame.name).setScale(h.sprite.scaleX, h.sprite.scaleY).setFlipX(h.sprite.flipX).setTint(col).setAlpha(0.45).setDepth(h.y - 1).setOrigin(h.sprite.originX, h.sprite.originY).setPosition(h.x, h.y);
              this.tweens.add({ targets: g, alpha: 0, duration: 220, onComplete: () => g.destroy() });
              for (const m of this.monsters) if (m.alive && !hitSet.has(m) && Math.hypot(m.x - h.x, m.y - h.y) < 16 + m.def.bodyRadius) { hitSet.add(m); this.hitMonster(m, base, mult, kind, 16); }
            }
          },
          onComplete: () => {
            if (sk.kind === 'leap') {
              sfx.boom();
              this.playFx('fxa_explode', h.x, h.y + 8, h.y + 20, { scale: 0.45, normal: true })?.setOrigin(0.5, 0.85).setTint(col);
              const ring = this.add.image(h.x, h.y, 'fx_ring').setTint(col).setBlendMode(Phaser.BlendModes.ADD).setScale(0.2, 0.1).setDepth(2);
              this.tweens.add({ targets: ring, scaleX: (sk.radius ?? 50) / 26, scaleY: (sk.radius ?? 50) / 52, alpha: 0, duration: 450, onComplete: () => ring.destroy() });
              this.burst(h.x, h.y, col, 22, 90);
              hitArea(h.x, h.y, sk.radius ?? 50, mult, 14);
            }
          } });
        break;
      }
      case 'shot': {
        const n = sk.count ?? 1, sp = sk.spread ?? 0;
        h.doAttack(time, 300);
        if (sk.proj === 'arrow') sfx.arrow(); else sfx.flame();
        for (let i = 0; i < n; i++) {
          const a2 = ang + (i - (n - 1) / 2) * sp;
          const delay = sp === 0 || sp < 0.08 ? i * 120 : 0;
          this.time.delayedCall(delay, () => this.skillProjectile(sk, a2, base, mult, kind, false));
        }
        break;
      }
      case 'pierce': {
        const n = sk.count ?? 1, sp = sk.spread ?? 0;
        h.doAttack(time, 320);
        sfx.magic();
        for (let i = 0; i < n; i++) this.skillProjectile(sk, ang + (i - (n - 1) / 2) * sp, base, mult, kind, true);
        break;
      }
      case 'rain': {
        h.doCast(time, 420);
        const targets = this.monsters.filter(m => m.alive && Math.hypot(m.x - h.x, m.y - h.y) < (sk.radius ?? 130))
          .sort((p, q) => Math.hypot(p.x - h.x, p.y - h.y) - Math.hypot(q.x - h.x, q.y - h.y)).slice(0, sk.count ?? 5);
        if (sk.fall === 'bolt') { sfx.thunder(); this.cameras.main.flash(100, 200, 220, 255, false); }
        targets.forEach((m, i) => this.time.delayedCall(120 + i * 90, () => {
          if (!m.alive) return;
          this.fallOn(m, sk, () => { if (m.alive) this.hitMonster(m, base, mult, kind, 3); });
        }));
        if (!targets.length) this.fallOn(null, sk, () => undefined, h.x + fx * 50, h.y + fy * 40);
        break;
      }
      case 'nova': {
        const R = sk.radius ?? 52;
        h.doCast(time, 380);
        sfx.boom();
        this.surround(h.x, h.y, col, { rings: 2, height: 22, radius: R * 0.6, motes: 16, dur: 500 });
        const ring = this.add.image(h.x, h.y, 'fx_ring').setTint(col).setBlendMode(Phaser.BlendModes.ADD).setScale(0.2, 0.1).setDepth(2);
        this.tweens.add({ targets: ring, scaleX: R / 26, scaleY: R / 52, alpha: 0, duration: 500, onComplete: () => ring.destroy() });
        this.burst(h.x, h.y - 6, col, 26, R * 1.6);
        this.time.delayedCall(120, () => hitArea(h.x, h.y, R, mult, 18));
        if (id === 'm4_dread') { const st = S(); st.hp = Math.min(this.der.maxHp, st.hp + this.der.maxHp * 0.08); }
        break;
      }
      case 'buff': {
        h.doCast(time, 400);
        sfx.bossRoar();
        (s as typeof s & { skillBuff?: unknown }).skillBuff = { ...sk.buff, until: Date.now() + (sk.buff?.dur ?? 10000) };
        this.der = derive(s);
        this.surround(h.x, h.y, col, { rings: 3, height: 30, radius: 16, motes: 14, dur: 900 });
        this.floatText(h.x, h.y - 40, sk.name, '#' + col.toString(16).padStart(6, '0'), 1.1);
        this.time.delayedCall((sk.buff?.dur ?? 10000) + 100, () => { this.der = derive(S()); bus.emit(EV.STATE_CHANGED); });
        break;
      }
      case 'heal': {
        h.doCast(time, 450);
        const amt = Math.round((d.maxHp * sk.power + (sk.stat === 'matk' ? d.matk * 0.8 : 0)) * skillMult(s, id));
        const real = Math.min(amt, d.maxHp - s.hp);
        s.hp += real;
        sfx.heal();
        this.healFx();
        this.floatText(h.x, h.y - 30, '+' + real, '#7aff8a', 1.2);
        break;
      }
      case 'shield': {
        h.doCast(time, 400);
        sfx.upgradeOk();
        this.shieldHp = Math.round(d.maxHp * sk.power * skillMult(s, id));
        this.shieldUntil = time + 12000;
        this.surround(h.x, h.y, col, { rings: 3, height: 34, radius: 17, motes: 16, beam: true, dur: 900 });
        this.floatText(h.x, h.y - 40, `โล่ ${this.shieldHp}`, '#ffe080', 1.1);
        break;
      }
    }
    bus.emit(EV.STATE_CHANGED);
  }

  /** Projectile fired by a skill (arrow / orb / fire / dark). */
  skillProjectile(sk: SkillDef, ang: number, base: number, mult: number, kind: 'phys' | 'magic', pierce: boolean) {
    const h = this.hero;
    const col = sk.color ?? (sk.proj === 'fire' ? 0xff8a3a : sk.proj === 'dark' ? 0xff3a5a : 0x8ad0ff);
    const x = h.x + Math.cos(ang) * 10, y = h.y - 12 + Math.sin(ang) * 6;
    let spr: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite;
    if (sk.proj === 'arrow') spr = this.add.image(x, y, 'fx_arrow').setRotation(ang).setScale(pierce ? 1.4 : 1).setTint(sk.color ?? 0xffffff);
    else if (sk.proj === 'fire') spr = this.playFx('fxa_fireball', x, y, 99000, { scale: 0.5, rot: ang })?.setOrigin(0.75, 0.5) ?? this.add.image(x, y, 'fx_fireball');
    else spr = this.add.image(x, y, 'fx_orb').setBlendMode(Phaser.BlendModes.ADD).setTint(col).setScale(pierce ? 1.6 : 1.1);
    spr.setDepth(99000);
    const glow = sk.proj === 'arrow' && !sk.color ? undefined : this.add.image(x, y, 'fx_glow').setTint(col).setBlendMode(Phaser.BlendModes.ADD).setScale(0.5).setAlpha(0.6).setDepth(98999);
    const hitSet = new Set<Monster>();
    const speed = sk.proj === 'arrow' ? 280 : 210;
    this.projectiles.push({
      sprite: spr, glow, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, life: (sk.range + 40) / speed * 1000, owner: 'hero', dmg: 0, radius: 7, trail: col, pierce,
      onTouch: (m: Monster) => {
        if (hitSet.has(m)) return;
        hitSet.add(m);
        if (sk.radius && !pierce) { this.explode(spr.x, spr.y, base, mult); return; }
        this.hitMonster(m, base, mult, kind, pierce ? 4 : 6);
      },
    });
  }

  /** Something falls from the sky onto a monster (or a point). */
  fallOn(m: Monster | null, sk: SkillDef, onHit: () => void, px?: number, py?: number) {
    const x = m ? m.x : px!, y = m ? m.y : py!;
    const col = sk.color ?? 0xffffff;
    if (sk.fall === 'bolt') { this.boltAt(x, y); onHit(); return; }
    const tex = sk.fall === 'arrow' ? 'fx_arrow' : sk.fall === 'blade' ? 'fx_slash' : 'fx_fireball';
    const n = sk.fall === 'meteor' ? 1 : 3;
    for (let k = 0; k < n; k++) {
      const ox = (k - (n - 1) / 2) * 6;
      const sp = this.add.image(x + ox + (sk.fall === 'meteor' ? -40 : 0), y - 90, tex).setDepth(99000)
        .setRotation(sk.fall === 'meteor' ? Math.PI * 0.3 : Math.PI / 2).setScale(sk.fall === 'meteor' ? 1.4 : sk.fall === 'blade' ? 0.6 : 1).setTint(col);
      if (sk.fall !== 'arrow') sp.setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: sp, x: x + ox, y: y - 4, duration: 200 + k * 40, ease: 'Quad.easeIn', onComplete: () => {
        sp.destroy();
        this.burst(x, y - 2, col, sk.fall === 'meteor' ? 18 : 5, sk.fall === 'meteor' ? 80 : 30);
        if (sk.fall === 'meteor') { sfx.boom(); this.playFx('fxa_explode', x, y + 8, y + 20, { scale: 0.4, normal: true })?.setOrigin(0.5, 0.85).setTint(0xff6a6a); }
        if (k === 0) onHit();
      } });
    }
  }

  /**
   * Aura that wraps around a character: every piece is split into a BACK half (drawn behind the
   * character) and a FRONT half (drawn over it), so the character stands inside the effect.
   */
  surround(x: number, y: number, color: number, o: { rings?: number; height?: number; radius?: number; motes?: number; beam?: boolean; dur?: number } = {}) {
    const R = o.radius ?? 15, H = o.height ?? 34, dur = o.dur ?? 900;
    const back = y - 0.5, front = y + 0.5;
    const add = Phaser.BlendModes.ADD;
    // ground ring
    const g = this.add.image(x, y, 'fx_ring').setTint(color).setBlendMode(add).setScale(0.15, 0.07).setDepth(2).setAlpha(0.9);
    this.tweens.add({ targets: g, scaleX: R / 26, scaleY: R / 52, alpha: 0, duration: dur, ease: 'Quad.easeOut', onComplete: () => g.destroy() });
    // glowing cylinder wall: back half behind the character, front half over it
    const cb = this.add.image(x, y, 'fx_aura_back').setOrigin(0.5, 62 / 72).setTint(color).setBlendMode(add).setDepth(back);
    const cf = this.add.image(x, y, 'fx_aura_front').setOrigin(0.5, 62 / 72).setTint(color).setBlendMode(add).setDepth(front);
    for (const [im, al] of [[cb, 1], [cf, 0.75]] as const) {
      im.setScale(R / 28, 0.15).setAlpha(al);
      this.tweens.add({ targets: im, scaleY: H / 56, duration: dur * 0.25, ease: 'Back.easeOut' });
      this.tweens.add({ targets: im, alpha: 0, scaleX: (R / 28) * 1.15, delay: dur * 0.55, duration: dur * 0.45, onComplete: () => im.destroy() });
    }
    // rising rings, split into back/front halves
    const n = o.rings ?? 3;
    for (let i = 0; i < n; i++) {
      const halves = [
        this.add.image(x, y, 'fx_ring').setCrop(0, 0, 64, 32).setDepth(back).setAlpha(0.85),
        this.add.image(x, y, 'fx_ring').setCrop(0, 32, 64, 32).setDepth(front).setAlpha(0.55),
      ];
      for (const r of halves) {
        r.setTint(color).setBlendMode(add).setScale(R / 30, R / 60);
        this.tweens.add({ targets: r, y: y - H, scaleX: R / 48, scaleY: R / 96, alpha: 0, duration: dur * 0.9, delay: i * dur * 0.18, ease: 'Sine.easeOut', onComplete: () => r.destroy() });
      }
    }
    // light column: bright behind, faint veil in front
    if (o.beam) {
      const bb = this.add.image(x, y + 2, 'fx_ray').setOrigin(0.5, 1).setTint(color).setBlendMode(add).setScale(R / 22, 0.1).setDepth(back).setAlpha(0.9);
      const bf = this.add.image(x, y + 2, 'fx_ray').setOrigin(0.5, 1).setTint(color).setBlendMode(add).setScale(R / 22, 0.1).setDepth(front).setAlpha(0.3);
      this.tweens.add({ targets: [bb, bf], scaleY: H / 70, duration: dur * 0.3, yoyo: true, hold: dur * 0.4, onComplete: () => { bb.destroy(); bf.destroy(); } });
    }
    // motes spiralling upward around the body; depth flips as they pass behind/in front
    for (let i = 0; i < (o.motes ?? 12); i++) {
      const a0 = Math.random() * Math.PI * 2, spin = (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 2);
      const p = this.add.image(x, y, 'fx_spark').setTint(color).setBlendMode(add).setScale(0.7);
      this.tweens.addCounter({ from: 0, to: 1, duration: dur * (0.8 + Math.random() * 0.5), delay: i * (dur / 30),
        onUpdate: tw => {
          const t = tw.getValue()!; const a = a0 + t * spin;
          const r = R * (1 - t * 0.45);
          const sy = Math.sin(a);
          p.setPosition(x + Math.cos(a) * r, y + sy * r * 0.4 - t * H).setDepth(sy > 0 ? front : back).setAlpha((1 - t) * (sy > 0 ? 0.9 : 0.6));
        },
        onComplete: () => p.destroy() });
    }
  }

  healFx() {
    const h = this.hero;
    const a = this.playFx('fxa_heal', h.x, h.y + 3, h.y - 0.5, { scale: 0.5 });
    this.surround(h.x, h.y, 0x5cff8a, { rings: a ? 2 : 3, height: 34, radius: 15, motes: 18, beam: !a, dur: 1000 });
  }

  boltAt(x: number, y: number) {
    if (this.playFx('fxa_bolt', x, y + 3, y - 0.5, { scale: 0.55 })) {
      const g0 = this.add.image(x, y - 4, 'fx_glow').setTint(0x9ad8ff).setBlendMode(Phaser.BlendModes.ADD).setScale(1.4).setDepth(99499);
      this.tweens.add({ targets: g0, alpha: 0, duration: 300, delay: 120, onComplete: () => g0.destroy() });
      this.burst(x, y - 4, 0xd8f0ff, 8, 50);
      return;
    }
    const b = this.add.image(x, y + 1, 'fx_bolt').setOrigin(0.5, 1).setBlendMode(Phaser.BlendModes.ADD).setDepth(y - 0.5).setScale(1, 1.1);
    const g = this.add.image(x, y - 4, 'fx_glow').setTint(0x9ad8ff).setBlendMode(Phaser.BlendModes.ADD).setScale(1.6).setDepth(99499);
    this.tweens.add({ targets: [b, g], alpha: 0, duration: 260, delay: 60, onComplete: () => { b.destroy(); g.destroy(); } });
    this.burst(x, y - 4, 0xd8f0ff, 10, 50);
  }

  explode(x: number, y: number, matk: number, power: number) {
    sfx.boom();
    this.playFx('fxa_explode', x, y + 10, y + 20, { scale: 0.5, normal: true })?.setOrigin(0.5, 0.85);
    const g = this.add.image(x, y, 'fx_glow').setTint(0xff7a2a).setBlendMode(Phaser.BlendModes.ADD).setScale(0.5).setDepth(99500);
    this.tweens.add({ targets: g, scale: 2.4, alpha: 0, duration: 380, onComplete: () => g.destroy() });
    const r = this.add.image(x, y, 'fx_ring').setTint(0xffb040).setBlendMode(Phaser.BlendModes.ADD).setScale(0.2).setDepth(99500);
    this.tweens.add({ targets: r, scale: 1.1, alpha: 0, duration: 350, onComplete: () => r.destroy() });
    this.burst(x, y, 0xffa040, 16, 70);
    for (const m of this.monsters) if (m.alive && Math.hypot(m.x - x, m.cy - y) < 34 + m.def.bodyRadius) this.hitMonster(m, matk, power, 'magic', 8);
  }

  burst(x: number, y: number, color: number, n: number, speed: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = speed * (0.4 + Math.random() * 0.6);
      const p = this.add.image(x, y, 'fx_px').setTint(color).setDepth(99600).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: p, x: x + Math.cos(a) * sp * 0.5, y: y + Math.sin(a) * sp * 0.4, alpha: 0, duration: 300 + Math.random() * 300, ease: 'Quad.easeOut', onComplete: () => p.destroy() });
    }
  }

  /** Play a one-shot (or looping) frame animation; returns null if the art isn't loaded. */
  playFx(key: string, x: number, y: number, depth: number, o: { scale?: number; rot?: number; normal?: boolean; alpha?: number; flip?: boolean } = {}) {
    if (!this.anims.exists(key)) return null;
    const sp = this.add.sprite(x, y, '__DEFAULT').setDepth(depth).setScale(o.scale ?? 0.5).setRotation(o.rot ?? 0).setAlpha(o.alpha ?? 1).setFlipX(!!o.flip);
    if (!o.normal) sp.setBlendMode(Phaser.BlendModes.ADD);
    sp.play(key);
    if (this.anims.get(key).repeat !== -1) sp.once('animationcomplete', () => sp.destroy());
    return sp;
  }

  hitSpark(x: number, y: number, color: number) {
    if (this.playFx('fxa_hit', x, y, 99600, { scale: 0.42, rot: Math.random() * 6 })) { this.burst(x, y, color, 4, 40); return; }
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
    if (this.shieldHp > 0 && time < this.shieldUntil) {
      const ab = Math.min(this.shieldHp, r.dmg); this.shieldHp -= ab; r.dmg -= ab;
      this.floatText(h.x + 10, h.y - 34, `🛡${ab}`, '#ffe080', 0.85);
      if (r.dmg <= 0) return;
    }
    s.hp = Math.max(0, s.hp - r.dmg);
    sfx.hurt();
    h.hurtFlash();
    h.invulnUntil = time + 250;
    this.floatText(h.x, h.y - 30, '-' + r.dmg, '#ff5a5a', r.crit ? 1.3 : 1.05);
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
    if (b.nextSpecial === 0) { b.nextSpecial = time + 3000; sfx.bossRoar(); bus.emit(EV.BOSS_HP, b.hp, b.maxHp, b.def.name); }
    if (b.phase === 1 && b.hp < b.maxHp * 0.5) {
      b.phase = 2;
      sfx.bossRoar();
      bus.emit(EV.TOAST, 'ผู้พิทักษ์คลุ้มคลั่ง!', '#ff6a4a');
      b.sprite.setTint(0xffb0a0);
      for (let i = 0; i < 3; i++) { const add = new Monster(this, i === 2 ? 'wisp' : 'shroom', b.x + (i - 1) * 30, b.y + 24, 40, -2); add.state = 'chase'; this.monsters.push(add); }
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
        for (const m of this.monsters) if (m.alive && Math.hypot(m.x - p.sprite.x, m.cy - p.sprite.y) < p.radius + m.def.bodyRadius) {
          if (p.onTouch) p.onTouch(m);
          if (!p.pierce) { hit = true; break; }
        }
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
    const lv = gainExp(s, m.def.exp * this.der.expBonus);
    onKill(s, m.def.kind);
    this.floatText(m.x, m.cy - 18, `+${m.def.exp} EXP`, '#c89aff', 0.9);
    const gold = Math.round(Phaser.Math.Between(m.def.gold[0], m.def.gold[1]));
    this.dropLoot(m.x, m.y, 'gold', gold);
    for (const d of m.def.drops) {
      if (isGear(itemDef(d.id))) continue; // gear comes from the rarity roll below
      if (Math.random() < d.chance) {
        const q = d.min ? Phaser.Math.Between(d.min, d.max ?? d.min) : 1;
        this.dropLoot(m.x, m.y, d.id, q);
      }
    }
    // equipment drops: random base, random rarity (magic find helps), random affixes
    const gearDrops = m.def.boss ? 3 : Math.random() < 0.16 + m.def.level * 0.004 ? 1 : 0;
    for (let i = 0; i < gearDrops; i++) {
      const base = m.def.boss ? GEAR_BASES.filter(b => baseTier(b) >= 3)[Math.floor(Math.random() * GEAR_BASES.filter(b => baseTier(b) >= 3).length)] : pickBase(Math.random, m.def.level);
      const rar = rollRarity(Math.random, this.der.mf, m.def.boss ? (i === 0 ? 3 : 2) : 0);
      this.dropLoot(m.x, m.y, base.id, 1, makeGear(Math.random, base.id, rar));
    }
    this.burst(m.x, m.cy, 0xffffff, 10, 50);
    const food = ({ slime: 1, shroom: 2, wolf: 4, goblin: 3, wisp: 1, treant: 40 } as Record<string, number>)[m.def.kind] ?? 1;
    s.res.food += food;
    this.floatText(m.x + 12, m.cy - 6, `+${food} อาหาร`, '#ffb090', 0.8);
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
    const a = this.playFx('fxa_lvlup', h.x, h.y + 3, h.y - 0.5, { scale: 0.55 });
    this.surround(h.x, h.y, 0xffd860, { rings: a ? 3 : 4, height: 44, radius: 17, motes: 24, beam: !a, dur: 1300 });
    this.floatText(h.x, h.y - 44, 'LEVEL UP!', '#ffd040', 1.5);
  }

  dropLoot(x: number, y: number, id: string, qty: number, gear?: { rar?: number; aff?: { k: string; v: number }[] }) {
    const icon = id === 'gold' ? 'icon_gold' : `icon_${itemDef(id).icon}`;
    const tx = x + Phaser.Math.Between(-16, 16), ty = y + Phaser.Math.Between(-8, 10);
    const sp = this.add.image(x, y - 8, icon).setDepth(ty).setScale(0.45);
    this.tweens.add({ targets: sp, x: tx, duration: 450 });
    this.tweens.add({ targets: sp, y: { from: y - 8, to: ty - 22 }, duration: 220, ease: 'Quad.easeOut', yoyo: false, onComplete: () => this.tweens.add({ targets: sp, y: ty - 6, duration: 230, ease: 'Bounce.easeOut' }) });
    const rar = id === 'gold' ? -1 : gear ? gear.rar ?? 0 : itemDef(id).rarity;
    const extras: Phaser.GameObjects.GameObject[] = [];
    if (rar >= 1) {
      const col = RARITY_COLORS[rar];
      extras.push(this.add.image(tx, ty - 6, 'fx_glow').setTint(col).setBlendMode(Phaser.BlendModes.ADD).setScale(0.35 + rar * 0.12).setAlpha(0.7).setDepth(ty - 1));
      if (gear && rar >= 2) {
        // loot beam for rare+ gear, taller for epic/legendary
        const beam = this.add.image(tx, ty - 2, 'fx_ray').setOrigin(0.5, 1).setTint(col).setBlendMode(Phaser.BlendModes.ADD).setScale(0.35, 0.25 + rar * 0.12).setAlpha(0.8).setDepth(ty + 1);
        this.tweens.add({ targets: beam, alpha: { from: 0.45, to: 0.9 }, duration: 700, yoyo: true, repeat: -1 });
        extras.push(beam);
        const label = this.add.text(tx, ty - 18, `${RARITY_NAMES[rar]} ${itemDef(id).name}`, { fontFamily: FONT, fontSize: '7px', color: '#' + col.toString(16).padStart(6, '0'), stroke: '#0b0705', strokeThickness: 2, resolution: Math.max(3, this.cameras.main.zoom * 1.5) }).setOrigin(0.5, 1).setDepth(100002);
        extras.push(label);
        if (rar >= 3) { sfx.levelUp(); this.cameras.main.flash(150, 255, 200, 120); }
      }
    }
    sp.setData('extras', extras);
    this.loot.push({ sprite: sp, id, qty, born: this.time.now, x: tx, y: ty, gear });
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
        for (const e of (l.sprite.getData('extras') as (Phaser.GameObjects.Image | Phaser.GameObjects.Text)[]) ?? []) e.setPosition(l.x, e.type === 'Text' ? l.y - 18 : l.y - (e.texture?.key === 'fx_ray' ? 2 : 6));
      }
      if (d < 10) {
        if (l.id === 'gold') { s.gold += l.qty; sfx.coin(); this.floatText(h.x, h.y - 34, `+${l.qty} G`, '#ffd040', 0.85); }
        else {
          if (!addItem(s, l.id, l.qty, 0, l.gear)) { bus.emit(EV.TOAST, 'กระเป๋าเต็ม!', '#ff8a8a'); l.born = time + 3000; continue; }
          sfx.pickup();
          const def = itemDef(l.id);
          const rr = l.gear ? l.gear.rar ?? 0 : def.rarity;
          bus.emit(EV.TOAST, `ได้รับ ${l.gear ? '[' + RARITY_NAMES[rr] + '] ' : ''}${def.name}${l.qty > 1 ? ' x' + l.qty : ''}`, '#' + RARITY_COLORS[rr].toString(16).padStart(6, '0'));
          refreshCollect(s);
        }
        l.sprite.destroy();
        for (const e of (l.sprite.getData('extras') as Phaser.GameObjects.GameObject[]) ?? []) e.destroy();
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
    if (id === 'wardrobe') { sfx.click(); bus.emit(EV.NPC_TALK, 'wardrobe'); return; }
    if (id.startsWith('plot:')) {
      const i = Number(id.slice(5));
      if (i >= unlockedPlots(S().bossDefeated) && !buildingAt(S(), i)) { sfx.error(); bus.emit(EV.TOAST, 'ที่ดินถูกคำสาปปกคลุม — ปราบผู้พิทักษ์ธอร์นวูดเพื่อชำระ', '#c89aff'); return; }
      sfx.click(); bus.emit(EV.PLOT, i); return;
    }
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
