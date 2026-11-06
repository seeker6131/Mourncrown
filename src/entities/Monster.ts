import Phaser from 'phaser';
import { MONSTERS, type MonsterDef, type MonsterKind } from '../data/monsters';
import type { WorldScene } from '../scenes/WorldScene';
import { AI_FACES_LEFT, resOf } from '../art/aiAssets';

export type MState = 'idle' | 'wander' | 'chase' | 'attack' | 'return' | 'flee' | 'dead';

export class Monster {
  def: MonsterDef;
  sprite: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Image;
  hpBar: Phaser.GameObjects.Graphics;
  x: number; y: number;
  hp: number; maxHp: number;
  state: MState = 'idle';
  stateUntil = 0;
  lastAttack = 0;
  tx = 0; ty = 0;
  homeX: number; homeY: number;
  homeR: number;
  hitFlashUntil = 0;
  knockX = 0; knockY = 0;
  spawnIndex: number;
  // boss
  phase = 1;
  nextSpecial = 0;
  hoverT = Math.random() * 10;
  aiArt = false;
  multi = false;
  facesLeft = false;
  animT = Math.random() * 10;
  base = 1;

  constructor(private scene: WorldScene, kind: MonsterKind, x: number, y: number, homeR: number, spawnIndex: number) {
    this.def = MONSTERS[kind];
    this.x = x; this.y = y; this.homeX = x; this.homeY = y; this.homeR = homeR;
    this.spawnIndex = spawnIndex;
    this.hp = this.maxHp = this.def.hp;
    const boss = !!this.def.boss;
    const sr = kind === 'treant' ? 2.6 : kind === 'wolf' ? 1.1 : Math.max(0.6, this.def.bodyRadius / 9);
    this.shadow = scene.add.image(x, y, 'fx_shadow').setDepth(1).setScale(sr, boss ? sr * 0.75 : 1);
    const f0 = scene.anims.get(`mon_${kind}_idle`).frames[0].frame;
    this.multi = f0.texture.key.startsWith('an_');
    this.aiArt = f0.texture.key.startsWith('ai_') || this.multi;
    this.facesLeft = this.aiArt && AI_FACES_LEFT[kind];
    const h = f0.height;
    this.sprite = scene.add.sprite(x, y, f0.texture.key, f0.name).setOrigin(0.5, (h - (this.aiArt ? 2 : 2)) / h);
    this.base = 1 / resOf(f0.texture.key);
    this.sprite.setScale(this.base);
    this.sprite.play(`mon_${kind}_idle`);
    this.sprite.anims.setProgress(Math.random());
    this.hpBar = scene.add.graphics().setDepth(100000);
    this.sprite.on('animationcomplete', (a: Phaser.Animations.Animation) => {
      if (this.state === 'dead') return;
      if (a.key.endsWith('_attack') || a.key.endsWith('_hurt') || a.key.endsWith('_cast')) this.sprite.play(`mon_${this.def.kind}_idle`);
    });
    // spawn pop-in
    this.sprite.setAlpha(0).setScale(0.6 * this.base);
    scene.tweens.add({ targets: this.sprite, alpha: 1, scale: this.base, duration: 300, ease: 'Back.easeOut' });
  }

  get alive() { return this.state !== 'dead'; }
  get cy() { return this.def.kind === 'treant' ? this.y - 30 : this.y - Math.min(60, Math.max(8, this.sprite.displayHeight * 0.4)); }

  playAnim(name: string) {
    const key = `mon_${this.def.kind}_${name}`;
    const cur = this.sprite.anims.currentAnim?.key;
    if (cur === key && this.sprite.anims.isPlaying) return;
    if (cur && (cur.endsWith('_attack') || cur.endsWith('_cast')) && this.sprite.anims.isPlaying && name !== 'hurt') return;
    this.sprite.play(key);
  }

  takeHit(dmg: number, fromX: number, fromY: number, knock = 6) {
    if (!this.alive) return;
    this.hp -= dmg;
    const d = Math.hypot(this.x - fromX, this.y - fromY) || 1;
    const k = this.def.boss ? knock * 0.15 : knock;
    this.knockX = ((this.x - fromX) / d) * k; this.knockY = ((this.y - fromY) / d) * k;
    if (this.def.boss) this.sprite.setTint(0xffa0a0); else this.sprite.setTintFill(0xffffff);
    this.hitFlashUntil = this.scene.time.now + (this.def.boss ? 60 : 80);
    if (!this.def.boss || Math.random() < 0.3) this.sprite.play(`mon_${this.def.kind}_hurt`);
    if (this.hp <= 0) { this.die(); return; }
    if (this.def.flee) {
      // a cornered deer may kick back before bolting (stuns the hunter)
      const sc = this.scene, hero = sc.hero;
      if (Math.hypot(hero.x - this.x, hero.y - this.y) < 30 && Math.random() < (this.def.stun ?? 0) && sc.time.now - this.lastAttack > this.def.attackCooldown) {
        this.lastAttack = sc.time.now;
        this.face(hero.x < this.x);
        this.sprite.play(`mon_${this.def.kind}_attack`);
        sc.time.delayedCall(220, () => { if (this.alive && Math.hypot(hero.x - this.x, hero.y - this.y) < 34) sc.damageHero(this.def.atk, this, 1, true); });
      }
      this.state = 'flee'; this.stateUntil = this.scene.time.now + 2600;
      for (const o of this.scene.monsters) if (o !== this && o.alive && o.def.kind === this.def.kind && Math.hypot(o.x - this.x, o.y - this.y) < 60 && o.state !== 'flee') { o.state = 'flee'; o.stateUntil = this.scene.time.now + 2200; }
      return;
    }
    if (this.state === 'idle' || this.state === 'wander' || this.state === 'return') this.provoke();
  }

  provoke() {
    if (!this.alive) return;
    if (this.state === 'idle' || this.state === 'wander' || this.state === 'return') this.state = 'chase';
    // packmates of the same kind nearby join the fight
    for (const o of this.scene.monsters) if (o !== this && o.alive && o.def.kind === this.def.kind && (o.state === 'idle' || o.state === 'wander') && Math.hypot(o.x - this.x, o.y - this.y) < 50) o.state = 'chase';
  }

  die() {
    this.state = 'dead';
    this.hpBar.clear();
    this.sprite.clearTint();
    if (this.scene.anims.exists(`mon_${this.def.kind}_die`)) {
      this.sprite.setScale(this.base).setRotation(0).play(`mon_${this.def.kind}_die`);
      this.scene.tweens.add({ targets: this.sprite, alpha: 0, delay: 1500, duration: 600 });
      this.scene.tweens.add({ targets: this.shadow, alpha: 0, duration: 1500 });
      this.scene.time.delayedCall(2200, () => this.destroy());
      return;
    }
    this.sprite.setTint(0xff9090);
    this.sprite.anims.stop();
    this.scene.playFx('fxa_smoke', this.x, this.y - 4, this.y + 1, { scale: 0.5 * (this.def.bodyRadius / 7), normal: true });
    this.scene.tweens.add({ targets: this.sprite, alpha: 0, scaleY: 0.2 * this.base, scaleX: 1.4 * this.base, y: this.y + 2, duration: this.def.boss ? 1600 : 380, ease: 'Quad.easeIn' });
    this.scene.tweens.add({ targets: this.shadow, alpha: 0, duration: 400 });
    this.scene.time.delayedCall(this.def.boss ? 1700 : 500, () => this.destroy());
  }

  destroy() {
    this.sprite.destroy(); this.shadow.destroy(); this.hpBar.destroy();
    (this as unknown as { cast?: Phaser.GameObjects.Image }).cast?.destroy();
  }

  update(time: number, dt: number) {
    if (!this.alive) return;
    const sc = this.scene;
    const hero = sc.hero;
    const def = this.def;
    const sec = dt / 1000;
    if (time > this.hitFlashUntil && this.hitFlashUntil) { this.sprite.clearTint(); if (this.phase === 2) this.sprite.setTint(0xffc8b8); this.hitFlashUntil = 0; }
    // knockback
    if (Math.abs(this.knockX) + Math.abs(this.knockY) > 0.1) {
      this.tryMove(this.knockX * 0.35, this.knockY * 0.35);
      this.knockX *= 0.65; this.knockY *= 0.65;
    }
    const hd = Math.hypot(hero.x - this.x, hero.y - this.y);
    const heroAlive = hero.state !== 'dead';
    const homeD = Math.hypot(this.x - this.homeX, this.y - this.homeY);
    const leash = def.boss ? 260 : def.aggro * 2.2 + this.homeR;

    if (def.kind === 'treant' && (this.state === 'chase' || this.state === 'attack')) sc.bossSpecials(this, time);

    switch (this.state) {
      case 'idle':
      case 'wander': {
        // monsters never start a fight: they only chase after being hit (or a packmate is hit)
        if (time > this.stateUntil) {
          if (this.state === 'idle' && !def.boss) {
            const a = Math.random() * Math.PI * 2, r = Math.random() * this.homeR;
            this.tx = this.homeX + Math.cos(a) * r; this.ty = this.homeY + Math.sin(a) * r;
            this.state = 'wander'; this.stateUntil = time + 2500;
          } else { this.state = 'idle'; this.stateUntil = time + 1500 + Math.random() * 2500; }
        }
        if (this.state === 'wander') {
          if (this.moveToward(this.tx, this.ty, def.speed * 0.5 * sec) < 3) { this.state = 'idle'; this.stateUntil = time + 1500 + Math.random() * 2000; }
          else this.playAnim('move');
        } else this.playAnim('idle');
        break;
      }
      case 'chase': {
        if (!heroAlive || homeD > leash) { this.state = 'return'; break; }
        const range = def.attackRange;
        if (def.ranged && hd < range * 0.5) {
          // kite away
          this.moveToward(this.x * 2 - hero.x, this.y * 2 - hero.y, def.speed * 0.8 * sec);
          this.playAnim('move');
        } else if (hd > range) {
          this.moveToward(hero.x, hero.y, def.speed * sec);
          this.playAnim('move');
        } else this.playAnim('idle');
        this.face(hero.x < this.x);
        if (hd <= range + 2 && time - this.lastAttack > def.attackCooldown) {
          this.lastAttack = time;
          this.state = 'attack';
          this.stateUntil = time + (def.ranged ? 650 : 520);
          this.sprite.play(`mon_${def.kind}_attack`);
          const windup = def.ranged ? 380 : 300;
          sc.time.delayedCall(windup, () => {
            if (!this.alive) return;
            if (def.ranged) sc.enemyShoot(this);
            else if (Math.hypot(hero.x - this.x, hero.y - this.y) < range + 10) sc.damageHero(def.atk, this, 1, !!def.stun && Math.random() < def.stun);
          });
          if (def.kind === 'wolf' || def.kind === 'slime' || def.kind === 'boar') {
            // lunge
            const d = hd || 1;
            sc.tweens.addCounter({ from: 0, to: 1, duration: 200, onUpdate: (tw) => { const v = (1 - tw.getValue()!) * 1.6; this.tryMove(((hero.x - this.x) / d) * v, ((hero.y - this.y) / d) * v); } });
          }
        }
        break;
      }
      case 'attack':
        if (time > this.stateUntil) this.state = 'chase';
        break;
      case 'flee': {
        if (time > this.stateUntil) { this.state = 'idle'; this.stateUntil = time + 1200; this.homeX = this.x; this.homeY = this.y; break; }
        const d = hd || 1;
        const moved = this.tryMove(((this.x - hero.x) / d) * def.speed * 1.25 * sec, ((this.y - hero.y) / d) * def.speed * 1.25 * sec);
        if (!moved) this.tryMove((Math.random() - 0.5) * def.speed * sec * 2, (Math.random() - 0.5) * def.speed * sec * 2);
        this.face(hero.x > this.x);
        this.playAnim('move');
        break;
      }
      case 'return':
        this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.5 * sec);
        if (this.moveToward(this.homeX, this.homeY, def.speed * 1.2 * sec) < 4) { this.state = 'idle'; this.hp = this.maxHp; }
        else this.playAnim('move');
        break;
    }

    // visuals
    let yOff = 0;
    if (def.kind === 'wisp') { this.hoverT += sec * 3; yOff = -6 + Math.sin(this.hoverT) * 2; }
    if (this.aiArt) yOff += this.aiMotion(time, sec);
    this.sprite.setPosition(Math.round(this.x), Math.round(this.y + yOff)).setDepth(this.y);
    this.shadow.setPosition(this.x, this.y - 1);
    if (this.state !== 'idle' && this.state !== 'wander' && this.state !== 'flee' && Math.abs(hero.x - this.x) > 2 && this.state !== 'return') this.face(hero.x < this.x);
    else if (this.state === 'wander' || this.state === 'return') this.face((this.state === 'wander' ? this.tx : this.homeX) < this.x);
    this.drawHp();
  }

  spawning() { return this.sprite.alpha < 1; }

  face(left: boolean) { this.sprite.setFlipX(left !== this.facesLeft); }

  /** Procedural animation for single-image AI sprites: breathing, hopping, lunging. */
  aiMotion(time: number, sec: number): number {
    const k = this.def.kind;
    const moving = this.state === 'chase' || this.state === 'wander' || this.state === 'return' || this.state === 'flee';
    this.animT += sec * (moving ? (k === 'wolf' ? 14 : 9) : 3);
    let sx = 1, sy = 1, y = 0, rot = 0;
    const atk = time - this.lastAttack < 450 && this.state !== 'idle';
    if (moving && (k === 'wolf' || k === 'goblin' || k === 'shroom') && Math.floor(this.animT / Math.PI) !== Math.floor((this.animT - sec * (k === 'wolf' ? 14 : 9)) / Math.PI)) this.scene.dust(this.x, this.y);
    if (this.multi) {
      if (!moving) sy = 1 + Math.sin(this.animT) * 0.02;
      if (k === 'wisp') y = Math.sin(this.animT) * 1.5;
    } else if (k === 'slime') {
      if (moving) { const hop = Math.abs(Math.sin(this.animT)); y = -hop * 5; sy = 0.85 + hop * 0.25; sx = 1.15 - hop * 0.2; }
      else { sy = 1 + Math.sin(this.animT) * 0.05; sx = 2 - sy; }
    } else if (k === 'wolf') {
      if (moving) { y = -Math.abs(Math.sin(this.animT)) * 2; rot = Math.sin(this.animT) * 0.06; }
      else sy = 1 + Math.sin(this.animT) * 0.025;
    } else if (k === 'wisp') {
      sx = 1 + Math.sin(this.animT * 1.7) * 0.06; sy = 1 + Math.cos(this.animT * 1.3) * 0.08;
    } else if (k === 'treant') {
      sy = 1 + Math.sin(this.animT) * 0.015; rot = Math.sin(this.animT * 0.7) * 0.015;
    } else {
      if (moving) { y = -Math.abs(Math.sin(this.animT)) * 3; rot = Math.sin(this.animT) * 0.08; }
      else sy = 1 + Math.sin(this.animT) * 0.035;
    }
    if (atk) { const t = (time - this.lastAttack) / 450; const p = Math.sin(t * Math.PI); sx *= 1 + p * 0.18; sy *= 1 - p * 0.08; }
    if (this.hitFlashUntil && time < this.hitFlashUntil + 120) { sx *= 1.1; sy *= 0.9; }
    if (this.alive && !this.spawning()) this.sprite.setScale(sx * this.base, sy * this.base).setRotation(rot);
    return y;
  }

  drawHp() {
    const g = this.hpBar;
    g.clear();
    if (this.def.boss || this.hp >= this.maxHp) return;
    const w = 18, top = this.y - this.sprite.displayHeight + 2 + (this.def.kind === 'wisp' ? -6 : 0);
    g.fillStyle(0x140c1c, 0.9).fillRect(this.x - w / 2 - 1, top - 1, w + 2, 4);
    g.fillStyle(0x5a1a1a).fillRect(this.x - w / 2, top, w, 2);
    g.fillStyle(0xe8443a).fillRect(this.x - w / 2, top, w * Math.max(0, this.hp / this.maxHp), 2);
  }

  moveToward(tx: number, ty: number, step: number): number {
    const dx = tx - this.x, dy = ty - this.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.001) return 0;
    const s = Math.min(step, d);
    // separation from other monsters
    let sx = 0, sy = 0;
    for (const o of this.scene.monsters) {
      if (o === this || !o.alive) continue;
      const ox = this.x - o.x, oy = this.y - o.y; const od = Math.hypot(ox, oy);
      const min = this.def.bodyRadius + o.def.bodyRadius;
      if (od > 0 && od < min) { sx += (ox / od) * (min - od) * 0.3; sy += (oy / od) * (min - od) * 0.3; }
    }
    this.tryMove((dx / d) * s + sx, (dy / d) * s + sy);
    return d;
  }

  tryMove(dx: number, dy: number) {
    const r = Math.min(this.def.bodyRadius, 6);
    const flying = this.def.kind === 'wisp';
    let m = false;
    if (flying || this.scene.canMove(this.x + dx, this.y, r)) { this.x += dx; m = true; }
    if (flying || this.scene.canMove(this.x, this.y + dy, r)) { this.y += dy; m = true; }
    return m;
  }
}
