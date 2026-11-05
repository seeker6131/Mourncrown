import Phaser from 'phaser';
import { ensureHeroTexture } from '../art/textures';
import type { Dir } from '../art/heroArt';
import { S } from '../core/events';
import { equippedLook } from '../systems/inventory';
import { hasAi, recolorHero } from '../art/aiAssets';
import { ensureHeroAnims, hasAnim } from '../art/animAssets';
import { hasForms, formAnim, portraitKey, FORM_RES } from '../art/formAssets';
import { formCode } from '../data/classes';
import { activeTier } from '../systems/stats';

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
  anim = false;
  animPre = 'h_novice0_';
  actionDur = 260;
  forms = false;
  /** villager outfit override (in the village / gathering mode) */
  casual = false;
  formTint: number | undefined;

  constructor(private scene: Phaser.Scene, x: number, y: number) {
    this.x = x; this.y = y;
    this.shadow = scene.add.image(x, y, 'fx_shadow').setDepth(1).setScale(0.75, 0.9);
    this.ai = hasAi(scene, 'hero_0');
    this.anim = hasAnim(scene, 'h_novice0_idle');
    this.forms = hasForms(scene);
    this.sprite = scene.add.sprite(x, y, this.ai ? 'ai_hero_0' : 'hero_a0_w0').setOrigin(0.5, this.ai ? 0.97 : 36 / 40);
    this.refreshLook();
  }

  refreshLook() {
    const s = S();
    const a = equippedLook(s, 'armor');
    const w = Math.max(0, equippedLook(s, 'weapon'));
    if (this.forms) { this.texKey = 'fs_V0_idle'; return; }
    if (this.anim) { this.animPre = ensureHeroAnims(this.scene, s.cls ?? 'novice', s.tier ?? 0); this.texKey = 'an_hero_idle'; }
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
  code() { const s = S(); return this.casual ? 'V0' : formCode(s.cls ?? 'novice', activeTier(s)); }

  portrait(): { key: string; frame?: string | number } { if (this.forms) { const k = portraitKey(this.scene, formCode(S().cls ?? 'novice', activeTier(S()))); if (k) return { key: k }; } if (this.anim) { const k = `an_hero_idle_${this.animPre.slice(2, -1)}`; return { key: this.scene.textures.exists(k) ? k : 'an_hero_idle', frame: 0 }; } return this.ai ? { key: this.aiKeys[1] } : { key: this.texKey, frame: 'down_idle_0' }; }

  play(anim: string, force = false) {
    if (this.ai || this.forms) return;
    const key = `${this.texKey}_${this.dir}_${anim}`;
    if (!force && this.sprite.anims.currentAnim?.key === key && this.sprite.anims.isPlaying) return;
    this.sprite.play(key);
  }

  setFacing(vx: number, vy: number) {
    if (Math.abs(vx) < 0.01 && Math.abs(vy) < 0.01) return;
    this.facing.set(vx, vy).normalize();
    if (Math.abs(vx) > Math.abs(vy) * 0.9) { this.dir = 'side'; this.flip = vx < 0; }
    else { this.dir = vy < 0 ? 'up' : 'down'; this.flip = false; }
    if (this.ai || this.forms) { this.diag = (vy < -0.25 ? 2 : 0) + (vx >= 0 ? 1 : 0) as 0 | 1 | 2 | 3; return; }
    this.sprite.setFlipX(this.flip);
  }

  busy(now: number) { return now < this.lockUntil || this.state === 'dead'; }

  doAttack(now: number, dur: number) {
    this.state = 'attack';
    this.lockUntil = now + dur;
    this.play('attack', true);
    this.actionStart = now; this.actionDur = dur;
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
    this.scene.time.delayedCall(220, () => { this.sprite.clearTint(); if (this.formTint) this.sprite.setTint(this.formTint); });
  }

  die() {
    this.state = 'dead';
    this.sprite.anims.timeScale = 1;
    this.play('hurt', true);
    if (this.forms) {
      const r = this.formPlay('die', true); this.sprite.setFlipX((this.diag & 1) === 0);
      if (r.fake) this.scene.tweens.add({ targets: this.sprite, angle: (this.diag & 1) ? 90 : -90, duration: 500, ease: 'Bounce.easeOut' });
      return;
    }
    if (this.anim) { this.sprite.setFlipX((this.diag & 1) === 0).setRotation(0).setScale(0.5); this.sprite.play(this.animPre + 'die'); return; }
    if (this.ai) this.setPose(7, (this.diag & 1) === 0);
    this.scene.tweens.add({ targets: this.sprite, angle: this.flip || (this.ai && !(this.diag & 1)) ? -90 : 90, alpha: 0.7, duration: 500, ease: 'Bounce.easeOut' });
  }

  revive(x: number, y: number) {
    this.state = 'idle';
    this.x = x; this.y = y;
    this.sprite.setAngle(0).setAlpha(1);
    this.dir = 'down'; this.diag = 1;
    if (this.forms) this.formPlay('idle', true);
    else if (this.anim) this.sprite.play(this.animPre + 'idle');
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
    if (this.forms) this.formPose(now);
    else if (this.anim) this.animPose(now);
    else if (this.ai) this.aiPose(now, moving);
    this.sync();
  }

  setPose(i: number, flip: boolean) {
    const key = this.aiKeys[i];
    if (this.sprite.texture.key !== key) this.sprite.setTexture(key);
    this.sprite.setFlipX(flip);
  }

  /** Pose selection + procedural motion for the single-frame AI hero art. */
  formPlay(anim: string, restart = false) {
    const r = formAnim(this.scene, this.code(), anim);
    if (restart || this.sprite.anims.currentAnim?.key !== r.key) this.sprite.play(r.key);
    if (r.tint !== this.formTint) { this.formTint = r.tint; if (r.tint) this.sprite.setTint(r.tint); else this.sprite.clearTint(); }
    return r;
  }

  /** Frame animation from the Director's per-form sheets. */
  formPose(now: number) {
    const left = (this.diag & 1) === 0, up = this.diag >= 2;
    this.sprite.setFlipX(left).setRotation(0).setScale(1 / FORM_RES);
    if (this.state === 'attack') {
      const r = this.formPlay('attack', now - this.actionStart < 20);
      if (now - this.actionStart < 20) this.sprite.anims.timeScale = Math.max(1, 300 / Math.max(120, this.actionDur));
      void r;
    } else if (this.state === 'cast') {
      this.formPlay('skill', now - this.actionStart < 20); this.sprite.anims.timeScale = 1;
    } else if (this.state === 'walk') { this.formPlay(up ? 'walkup' : 'walk'); this.sprite.anims.timeScale = 1; }
    else {
      if (up) { this.formPlay('walkup'); this.sprite.anims.pause(this.sprite.anims.currentAnim!.frames[0]); }
      else { this.formPlay('idle'); if (this.sprite.anims.isPaused) this.sprite.anims.resume(); }
      this.sprite.anims.timeScale = 1;
    }
  }

  playA(name: string, ts = 1) {
    const key = this.animPre + name;
    if (this.sprite.anims.currentAnim?.key !== key || !this.sprite.anims.isPlaying && this.sprite.anims.currentAnim?.repeat === -1) this.sprite.play(key);
    this.sprite.anims.timeScale = ts;
  }

  /** Real frame-by-frame animation from the Director's sheets. */
  animPose(now: number) {
    const left = (this.diag & 1) === 0, up = this.diag >= 2;
    this.sprite.setFlipX(left).setRotation(0);
    if (this.state === 'attack') {
      const key = this.animPre + 'attack';
      if (this.sprite.anims.currentAnim?.key !== key || now - this.actionStart < 20) { this.sprite.play(key); this.sprite.anims.timeScale = Math.max(1, 250 / Math.max(120, this.actionDur)); }
    } else if (this.state === 'cast') {
      const key = this.animPre + 'cast';
      if (this.sprite.anims.currentAnim?.key !== key || now - this.actionStart < 20) this.sprite.play(key);
    } else if (this.state === 'walk') this.playA(up ? 'walkup' : 'walk');
    else this.playA(up ? 'idleup' : 'idle');
    this.sprite.setScale(0.5);
  }

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
    this.sprite.setPosition(Math.round(this.x), Math.round(this.y) + (this.ai && !this.anim && this.state === 'walk' ? -Math.round(Math.abs(Math.sin(this.walkT)) * 2) : 0));
    this.sprite.setDepth(this.y);
    this.shadow.setPosition(this.x, this.y - 1);
    const t = this.scene.time.now;
    if (t < this.invulnUntil) this.sprite.setAlpha(Math.floor(t / 60) % 2 ? 0.5 : 1);
    else if (this.state !== 'dead') this.sprite.setAlpha(1);
  }
}
