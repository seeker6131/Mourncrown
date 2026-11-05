import Phaser from 'phaser';
import { ensureHeroTexture } from '../art/textures';
import type { Dir } from '../art/heroArt';
import { S } from '../core/events';
import { equippedLook } from '../systems/inventory';
import { hasAi, recolorHero } from '../art/aiAssets';

export type HeroState = 'idle' | 'walk' | 'attack' | 'cast' | 'hurt' | 'dead';

export class Hero {
  sprite: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Image;
  x: number; y: number;
  dir: Dir = 'down';
  flip = false;
  state: HeroState = 'idle';
  texKey = '';
  lockUntil = 0; // time until which actions are locked (attack/cast)
  invulnUntil = 0;
  lastAttack = 0;
  facing = new Phaser.Math.Vector2(0, 1);
  readonly radius = 5;
  ai = false;
  aiKeys: string[] = [];
  walkT = 0;
  diag: 0 | 1 | 2 | 3 = 1; // 0 down-left, 1 down-right, 2 up-left, 3 up-right
  actionStart = 0;

  constructor(private scene: Phaser.Scene, x: number, y: number) {
    this.x = x; this.y = y;
    this.shadow = scene.add.image(x, y, 'fx_shadow').setDepth(1).setScale(0.75, 0.9);
    this.ai = hasAi(scene, 'hero_0');
    this.sprite = scene.add.sprite(x, y, this.ai ? 'ai_hero_0' : 'hero_a0_w0').setOrigin(0.5, this.ai ? 0.97 : 36 / 40);
    this.refreshLook();
  }

  refreshLook() {
    const s = S();
    const a = equippedLook(s, 'armor');
    const w = Math.max(0, equippedLook(s, 'weapon'));
    if (this.ai) {
      this.aiKeys = recolorHero(this.scene, Math.max(0, a));
      this.texKey = this.aiKeys[0];
      return;
    }
    const key = ensureHeroTexture(this.scene, a, w);
    if (key !== this.texKey) {
      this.texKey = key;
      this.play(this.state === 'dead' ? 'hurt' : this.state === 'walk' ? 'walk' : 'idle', true);
    }
  }

  /** Texture + frame to show the hero in UI portraits. */
  portrait(): { key: string; frame?: string } { return this.ai ? { key: this.aiKeys[1] } : { key: this.texKey, frame: 'down_idle_0' }; }

  play(anim: string, force = false) {
    if (this.ai) return;
    const key = `${this.texKey}_${this.dir}_${anim}`;
    if (!force && this.sprite.anims.currentAnim?.key === key && this.sprite.anims.isPlaying) return;
    this.sprite.play(key);
  }

  setFacing(vx: number, vy: number) {
    if (Math.abs(vx) < 0.01 && Math.abs(vy) < 0.01) return;
    this.facing.set(vx, vy).normalize();
    if (Math.abs(vx) > Math.abs(vy) * 0.9) { this.dir = 'side'; this.flip = vx < 0; }
    else { this.dir = vy < 0 ? 'up' : 'down'; this.flip = false; }
    if (this.ai) { this.diag = (vy < -0.25 ? 2 : 0) + (vx >= 0 ? 1 : 0) as 0 | 1 | 2 | 3; return; }
    this.sprite.setFlipX(this.flip);
  }

  busy(now: number) { return now < this.lockUntil || this.state === 'dead'; }

  doAttack(now: number, dur: number) {
    this.state = 'attack';
    this.lockUntil = now + dur;
    this.play('attack', true);
    this.actionStart = now;
    this.sprite.anims.timeScale = Math.max(1, 220 / Math.max(120, dur));
  }

  doCast(now: number, dur = 380) {
    this.state = 'cast';
    this.lockUntil = now + dur;
    this.sprite.anims.timeScale = 1;
    this.play('cast', true);
    this.actionStart = now;
  }

  hurtFlash() {
    this.sprite.setTintFill(0xffffff);
    this.scene.time.delayedCall(70, () => { this.sprite.clearTint(); this.sprite.setTint(0xff8080); });
    this.scene.time.delayedCall(220, () => this.sprite.clearTint());
  }

  die() {
    this.state = 'dead';
    this.sprite.anims.timeScale = 1;
    this.play('hurt', true);
    if (this.ai) this.setPose(7, (this.diag & 1) === 0);
    this.scene.tweens.add({ targets: this.sprite, angle: this.flip || (this.ai && !(this.diag & 1)) ? -90 : 90, alpha: 0.7, duration: 500, ease: 'Bounce.easeOut' });
  }

  revive(x: number, y: number) {
    this.state = 'idle';
    this.x = x; this.y = y;
    this.sprite.setAngle(0).setAlpha(1);
    this.dir = 'down'; this.diag = 1;
    this.play('idle', true);
  }

  updateVisual(now: number, moving: boolean) {
    if (this.state === 'dead') { this.sync(); return; }
    if (now >= this.lockUntil && (this.state === 'attack' || this.state === 'cast' || this.state === 'hurt')) this.state = 'idle';
    if (this.state === 'idle' || this.state === 'walk') {
      this.state = moving ? 'walk' : 'idle';
      this.sprite.anims.timeScale = 1;
      this.play(this.state);
    }
    if (this.ai) this.aiPose(now, moving);
    this.sync();
  }

  setPose(i: number, flip: boolean) {
    const key = this.aiKeys[i];
    if (this.sprite.texture.key !== key) this.sprite.setTexture(key);
    this.sprite.setFlipX(flip);
  }

  /** Pose selection + procedural motion for the single-frame AI hero art. */
  aiPose(now: number, moving: boolean) {
    const left = (this.diag & 1) === 0, up = this.diag >= 2;
    let sx = 1, sy = 1, rot = 0, oy = 0;
    if (this.state === 'attack') {
      const t = Math.min(1, (now - this.actionStart) / 260);
      this.setPose(5, left);
      sx = 1 + Math.sin(t * Math.PI) * 0.08; rot = (left ? -1 : 1) * Math.sin(t * Math.PI) * 0.12;
    } else if (this.state === 'cast') {
      this.setPose(6, left);
      sy = 1 + Math.sin((now - this.actionStart) / 60) * 0.03;
    } else if (this.state === 'walk') {
      this.walkT += 0.016 * 11;
      const step = Math.sin(this.walkT);
      if (up) this.setPose(left ? 2 : 3, false);
      else this.setPose(step > 0 ? 4 : (left ? 0 : 1), step > 0 ? left : false);
      oy = -Math.abs(step) * 2; rot = step * 0.05;
    } else {
      this.setPose(up ? (left ? 2 : 3) : (left ? 0 : 1), false);
      sy = 1 + Math.sin(now / 420) * 0.02; sx = 2 - sy;
    }
    this.sprite.setScale(sx * 0.5, sy * 0.5).setRotation(rot);
    this.sprite.y += oy;
  }

  sync() {
    this.sprite.setPosition(Math.round(this.x), Math.round(this.y) + (this.ai && this.state === 'walk' ? -Math.round(Math.abs(Math.sin(this.walkT)) * 2) : 0));
    this.sprite.setDepth(this.y);
    this.shadow.setPosition(this.x, this.y - 1);
    const t = this.scene.time.now;
    if (t < this.invulnUntil) this.sprite.setAlpha(Math.floor(t / 60) % 2 ? 0.5 : 1);
    else if (this.state !== 'dead') this.sprite.setAlpha(1);
  }
}
