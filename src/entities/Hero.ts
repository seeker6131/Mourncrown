import Phaser from 'phaser';
import { ensureHeroTexture } from '../art/textures';
import type { Dir } from '../art/heroArt';
import { S } from '../core/events';
import { equippedLook } from '../systems/inventory';

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

  constructor(private scene: Phaser.Scene, x: number, y: number) {
    this.x = x; this.y = y;
    this.shadow = scene.add.image(x, y, 'fx_shadow').setDepth(1).setScale(0.75, 0.9);
    this.sprite = scene.add.sprite(x, y, 'hero_a0_w0').setOrigin(0.5, 36 / 40);
    this.refreshLook();
  }

  refreshLook() {
    const s = S();
    const a = equippedLook(s, 'armor');
    const w = Math.max(0, equippedLook(s, 'weapon'));
    const key = ensureHeroTexture(this.scene, a, w);
    if (key !== this.texKey) {
      this.texKey = key;
      this.play(this.state === 'dead' ? 'hurt' : this.state === 'walk' ? 'walk' : 'idle', true);
    }
  }

  play(anim: string, force = false) {
    const key = `${this.texKey}_${this.dir}_${anim}`;
    if (!force && this.sprite.anims.currentAnim?.key === key && this.sprite.anims.isPlaying) return;
    this.sprite.play(key);
  }

  setFacing(vx: number, vy: number) {
    if (Math.abs(vx) < 0.01 && Math.abs(vy) < 0.01) return;
    this.facing.set(vx, vy).normalize();
    if (Math.abs(vx) > Math.abs(vy) * 0.9) { this.dir = 'side'; this.flip = vx < 0; }
    else { this.dir = vy < 0 ? 'up' : 'down'; this.flip = false; }
    this.sprite.setFlipX(this.flip);
  }

  busy(now: number) { return now < this.lockUntil || this.state === 'dead'; }

  doAttack(now: number, dur: number) {
    this.state = 'attack';
    this.lockUntil = now + dur;
    this.play('attack', true);
    this.sprite.anims.timeScale = Math.max(1, 220 / Math.max(120, dur));
  }

  doCast(now: number, dur = 380) {
    this.state = 'cast';
    this.lockUntil = now + dur;
    this.sprite.anims.timeScale = 1;
    this.play('cast', true);
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
    this.scene.tweens.add({ targets: this.sprite, angle: this.flip ? -90 : 90, alpha: 0.7, duration: 500, ease: 'Bounce.easeOut' });
  }

  revive(x: number, y: number) {
    this.state = 'idle';
    this.x = x; this.y = y;
    this.sprite.setAngle(0).setAlpha(1);
    this.dir = 'down';
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
    this.sync();
  }

  sync() {
    this.sprite.setPosition(Math.round(this.x), Math.round(this.y));
    this.sprite.setDepth(this.y);
    this.shadow.setPosition(this.x, this.y - 1);
    const t = this.scene.time.now;
    if (t < this.invulnUntil) this.sprite.setAlpha(Math.floor(t / 60) % 2 ? 0.5 : 1);
    else if (this.state !== 'dead') this.sprite.setAlpha(1);
  }
}
