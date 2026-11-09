// Visual effects for combat: glowing additive textures drawn once on canvas + Phaser particle bursts.
// No camera shake (the Director asked for none) — impact comes from light, particles and shockwaves instead.
import Phaser from 'phaser';

const D = 99950;   // effects draw above characters

function canvasTex(scene: Phaser.Scene, key: string, w: number, h: number, draw: (k: CanvasRenderingContext2D) => void) {
  if (scene.textures.exists(key)) return;
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!);
  scene.textures.addCanvas(key, c);
}

/** create every effect texture once per game */
export function vfxTextures(scene: Phaser.Scene) {
  canvasTex(scene, 'vfx_glow', 64, 64, k => {
    const g = k.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.75)'); g.addColorStop(0.6, 'rgba(255,255,255,0.18)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    k.fillStyle = g; k.fillRect(0, 0, 64, 64);
  });
  canvasTex(scene, 'vfx_star', 48, 48, k => {
    k.translate(24, 24);
    for (const [len, wd, a] of [[24, 3.2, 1], [14, 2.2, 0.8]] as const) for (let i = 0; i < 4; i++) {
      k.save(); k.rotate(i * Math.PI / 2 + (len === 14 ? Math.PI / 4 : 0));
      const g = k.createLinearGradient(0, 0, len, 0); g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(1, 'rgba(255,255,255,0)');
      k.fillStyle = g; k.beginPath(); k.moveTo(0, -wd); k.lineTo(len, 0); k.lineTo(0, wd); k.closePath(); k.fill(); k.restore();
    }
  });
  canvasTex(scene, 'vfx_ring', 128, 128, k => {
    for (const [r, w, a] of [[58, 6, 0.35], [56, 3, 1], [52, 2, 0.5]] as const) { k.strokeStyle = `rgba(255,255,255,${a})`; k.lineWidth = w; k.beginPath(); k.arc(64, 64, r, 0, Math.PI * 2); k.stroke(); }
  });
  canvasTex(scene, 'vfx_slash', 128, 128, k => {
    // crescent: thick in the middle, tapering to sharp tips, bright inner edge
    k.translate(64, 64);
    const arc = (r0: number, r1: number, alpha: number) => {
      k.beginPath();
      for (let i = 0; i <= 40; i++) { const t = i / 40, a = -1.25 + t * 2.5, w = Math.sin(t * Math.PI); k.lineTo(Math.cos(a) * (r0 + (r1 - r0) * w), Math.sin(a) * (r0 + (r1 - r0) * w)); }
      for (let i = 40; i >= 0; i--) { const a = -1.25 + (i / 40) * 2.5; k.lineTo(Math.cos(a) * r0, Math.sin(a) * r0); }
      k.closePath(); k.fillStyle = `rgba(255,255,255,${alpha})`; k.fill();
    };
    arc(40, 62, 0.35); arc(44, 58, 0.7); arc(48, 55, 1);
  });
  canvasTex(scene, 'vfx_shard', 10, 10, k => { k.fillStyle = '#fff'; k.beginPath(); k.moveTo(5, 0); k.lineTo(10, 5); k.lineTo(5, 10); k.lineTo(0, 5); k.closePath(); k.fill(); });
  canvasTex(scene, 'vfx_smoke', 48, 48, k => {
    for (let i = 0; i < 6; i++) { const x = 14 + Math.random() * 20, y = 14 + Math.random() * 20, r = 10 + Math.random() * 8; const g = k.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)'); k.fillStyle = g; k.fillRect(0, 0, 48, 48); }
  });
  canvasTex(scene, 'vfx_rune', 128, 128, k => {
    k.translate(64, 64); k.strokeStyle = 'rgba(255,255,255,0.95)';
    k.lineWidth = 2.5; k.beginPath(); k.arc(0, 0, 58, 0, Math.PI * 2); k.stroke();
    k.lineWidth = 1.5; k.beginPath(); k.arc(0, 0, 46, 0, Math.PI * 2); k.stroke();
    for (let i = 0; i < 12; i++) { k.save(); k.rotate(i * Math.PI / 6); k.beginPath(); k.moveTo(0, -46); k.lineTo(4, -52); k.lineTo(0, -58); k.lineTo(-4, -52); k.closePath(); k.stroke(); k.restore(); }
    k.beginPath(); for (let i = 0; i <= 6; i++) { const a = i * Math.PI * 2 / 3 * 2 - Math.PI / 2; k.lineTo(Math.cos(a) * 44, Math.sin(a) * 44); } k.stroke();
  });
  canvasTex(scene, 'vfx_plus', 16, 16, k => { k.fillStyle = '#fff'; k.fillRect(6, 1, 4, 14); k.fillRect(1, 6, 14, 4); });
  canvasTex(scene, 'vfx_beam', 16, 128, k => {
    const g = k.createLinearGradient(0, 0, 16, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    k.fillStyle = g; k.fillRect(0, 0, 16, 128);
    const v = k.createLinearGradient(0, 0, 0, 128); v.addColorStop(0, 'rgba(0,0,0,1)'); v.addColorStop(0.3, 'rgba(0,0,0,0)'); k.globalCompositeOperation = 'destination-out'; k.fillStyle = v; k.fillRect(0, 0, 16, 128);
  });
}

const lighten = (c: number, f = 0.55) => { const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255; return (Math.round(r + (255 - r) * f) << 16) | (Math.round(g + (255 - g) * f) << 8) | Math.round(b + (255 - b) * f); };

export class Vfx {
  constructor(public s: Phaser.Scene) { vfxTextures(s); }

  /** flash of light that swells and fades */
  glow(x: number, y: number, col: number, size = 1, dur = 320, alpha = 1) {
    const g = this.s.add.image(x, y, 'vfx_glow').setTint(col).setBlendMode(Phaser.BlendModes.ADD).setDepth(D).setScale(size * 0.4).setAlpha(alpha);
    this.s.tweens.add({ targets: g, scale: size * 1.3, alpha: 0, duration: dur, ease: 'Quad.easeOut', onComplete: () => g.destroy() });
  }
  /** glowing embers flying out */
  burst(x: number, y: number, col: number, n = 14, speed = 120, life = 450, scale = 0.16, gravity = 0) {
    const em = this.s.add.particles(x, y, 'vfx_glow', {
      speed: { min: speed * 0.35, max: speed }, angle: { min: 0, max: 360 }, scale: { start: scale, end: 0 }, alpha: { start: 1, end: 0 },
      lifespan: { min: life * 0.6, max: life }, tint: [col, lighten(col), 0xffffff], blendMode: 'ADD', gravityY: gravity, emitting: false,
    }).setDepth(D + 2);
    em.explode(n); this.s.time.delayedCall(life + 80, () => em.destroy());
  }
  /** 4-point star flash at the point of impact */
  star(x: number, y: number, col: number, size = 1) {
    const st = this.s.add.image(x, y, 'vfx_star').setTint(lighten(col, 0.4)).setBlendMode(Phaser.BlendModes.ADD).setDepth(D + 3).setScale(0.2 * size).setAngle(Math.random() * 90);
    this.s.tweens.add({ targets: st, scale: 1.1 * size, angle: st.angle + 45, alpha: 0, duration: 260, ease: 'Quad.easeOut', onComplete: () => st.destroy() });
  }
  /** big glowing crescent swing (angle in radians, screen space) */
  slash(x: number, y: number, angle: number, col: number, size = 1, flip = false) {
    for (const [tint, sc, a, delay] of [[col, 1, 0.9, 0], [lighten(col, 0.75), 0.82, 1, 20]] as const) {
      const im = this.s.add.image(x, y, 'vfx_slash').setTint(tint).setBlendMode(Phaser.BlendModes.ADD).setDepth(D + 1)
        .setRotation(angle + (flip ? Math.PI : 0)).setFlipY(flip).setScale(0.45 * size * sc).setAlpha(0);
      this.s.tweens.add({ targets: im, alpha: a, duration: 50, delay });
      this.s.tweens.add({ targets: im, scale: 0.62 * size * sc, rotation: im.rotation + (flip ? -0.5 : 0.5), duration: 220, delay, ease: 'Cubic.easeOut' });
      this.s.tweens.add({ targets: im, alpha: 0, duration: 200, delay: delay + 120, onComplete: () => im.destroy() });
    }
    // sparks flung off the blade tip
    const tx = x + Math.cos(angle) * 30 * size, ty = y + Math.sin(angle) * 30 * size;
    const em = this.s.add.particles(tx, ty, 'vfx_glow', {
      speed: { min: 60, max: 180 }, angle: { min: Phaser.Math.RadToDeg(angle) - 60, max: Phaser.Math.RadToDeg(angle) + 60 }, scale: { start: 0.12, end: 0 },
      lifespan: 320, tint: [col, 0xffffff], blendMode: 'ADD', emitting: false,
    }).setDepth(D + 2);
    em.explode(8); this.s.time.delayedCall(400, () => em.destroy());
  }
  /** hit: star + flash + embers (+ ring for big hits) */
  impact(x: number, y: number, col: number, big = false) {
    this.star(x, y, col, big ? 1.6 : 0.9);
    this.glow(x, y, col, big ? 1.4 : 0.7, big ? 360 : 220);
    this.burst(x, y, col, big ? 18 : 7, big ? 170 : 110, big ? 500 : 320, big ? 0.2 : 0.13);
    if (big) this.wave(x, y + 4, 34, col, 320);
  }
  /** flat shockwave ring on the ground */
  wave(x: number, y: number, r: number, col: number, dur = 420, thick = 1) {
    for (const [d, a] of [[0, 1], [70, 0.55]] as const) {
      const ring = this.s.add.image(x, y, 'vfx_ring').setTint(col).setBlendMode(Phaser.BlendModes.ADD).setDepth(2).setScale(0.05, 0.03).setAlpha(a * thick);
      this.s.tweens.add({ targets: ring, scaleX: r / 58, scaleY: r / 58 * 0.55, alpha: 0, duration: dur, delay: d, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
    }
  }
  /** dust puffs (landings, dashes) */
  dust(x: number, y: number, n = 8, spread = 30) {
    const em = this.s.add.particles(x, y, 'vfx_smoke', {
      speedX: { min: -spread * 2, max: spread * 2 }, speedY: { min: -30, max: 5 }, scale: { start: 0.5, end: 1.3 }, alpha: { start: 0.55, end: 0 },
      lifespan: { min: 400, max: 750 }, tint: 0x8a7a64, emitting: false,
    }).setDepth(3);
    em.explode(n); this.s.time.delayedCall(800, () => em.destroy());
  }
  /** rock shards kicked up that fall back down */
  debris(x: number, y: number, col: number, n = 12) {
    const em = this.s.add.particles(x, y, 'vfx_shard', {
      speed: { min: 80, max: 200 }, angle: { min: 200, max: 340 }, gravityY: 520, scale: { start: 0.9, end: 0.4 }, rotate: { min: 0, max: 360 },
      lifespan: 650, tint: [col, 0x6a5a48, 0x9a8a70], emitting: false,
    }).setDepth(D);
    em.explode(n); this.s.time.delayedCall(700, () => em.destroy());
  }
  /** column of light from the sky */
  pillar(x: number, y: number, col: number, h = 140, dur = 600) {
    const b = this.s.add.image(x, y, 'vfx_beam').setOrigin(0.5, 1).setTint(col).setBlendMode(Phaser.BlendModes.ADD).setDepth(D).setScale(0.4, h / 128).setAlpha(0);
    this.s.tweens.add({ targets: b, alpha: 1, scaleX: 2.2, duration: 120, yoyo: true, hold: dur * 0.4, onComplete: () => b.destroy() });
    const em = this.s.add.particles(x, y, 'vfx_glow', {
      x: { min: -14, max: 14 }, speedY: { min: -160, max: -60 }, scale: { start: 0.14, end: 0 }, lifespan: 600, tint: [col, 0xffffff], blendMode: 'ADD', frequency: 25, quantity: 2,
    }).setDepth(D + 1);
    this.s.time.delayedCall(dur * 0.7, () => em.stop()); this.s.time.delayedCall(dur + 700, () => em.destroy());
  }
  /** spinning rune circle under a target + rising motes for `ms` */
  aura(target: Phaser.GameObjects.Components.Transform, col: number, ms = 900, plus = false) {
    const ring = this.s.add.image(target.x, target.y, 'vfx_rune').setTint(col).setBlendMode(Phaser.BlendModes.ADD).setDepth(2).setScale(0.1, 0.06).setAlpha(0.95);
    this.s.tweens.add({ targets: ring, scaleX: 0.42, scaleY: 0.24, duration: 220, ease: 'Back.easeOut' });
    this.s.tweens.add({ targets: ring, angle: 360, duration: 1600, repeat: -1 });
    const em = this.s.add.particles(0, 0, plus ? 'vfx_plus' : 'vfx_glow', {
      follow: target as unknown as Phaser.Types.Math.Vector2Like, x: { min: -14, max: 14 }, y: { min: -6, max: 4 }, speedY: { min: -70, max: -30 },
      scale: plus ? { start: 0.7, end: 0.2 } : { start: 0.13, end: 0 }, alpha: { start: 1, end: 0 }, lifespan: 700, tint: [col, lighten(col)], blendMode: 'ADD', frequency: plus ? 70 : 35,
    }).setDepth(D + 1);
    const upd = this.s.time.addEvent({ delay: 16, loop: true, callback: () => ring.setPosition(target.x, target.y) });
    this.s.time.delayedCall(ms, () => { em.stop(); upd.remove(); this.s.tweens.add({ targets: ring, alpha: 0, scaleX: 0.55, scaleY: 0.32, duration: 260, onComplete: () => ring.destroy() }); });
    this.s.time.delayedCall(ms + 800, () => em.destroy());
  }
  /** glowing projectile flying to (tx,ty) with a particle trail; calls hit() on arrival */
  bolt(x: number, y: number, tx: number, ty: number, col: number, size = 1, speed = 520, hit?: () => void, arrow = false) {
    const ang = Math.atan2(ty - y, tx - x), dist = Math.hypot(tx - x, ty - y), dur = Math.max(80, dist / speed * 1000);
    const head = arrow
      ? this.s.add.rectangle(x, y, 14 * size, 2.5 * size, lighten(col, 0.7)).setRotation(ang)
      : this.s.add.image(x, y, 'vfx_glow').setTint(col).setBlendMode(Phaser.BlendModes.ADD).setScale(0.5 * size);
    head.setDepth(D + 2);
    const core = arrow ? null : this.s.add.image(x, y, 'vfx_glow').setBlendMode(Phaser.BlendModes.ADD).setScale(0.22 * size).setDepth(D + 3);
    const em = this.s.add.particles(0, 0, 'vfx_glow', {
      follow: head as unknown as Phaser.Types.Math.Vector2Like, speed: { min: 5, max: 30 }, scale: { start: (arrow ? 0.12 : 0.28) * size, end: 0 }, alpha: { start: 0.9, end: 0 },
      lifespan: arrow ? 200 : 320, tint: [col, lighten(col)], blendMode: 'ADD', frequency: 12, quantity: arrow ? 1 : 2,
    }).setDepth(D + 1);
    this.s.tweens.add({ targets: core ? [head, core] : [head], x: tx, y: ty, duration: dur, ease: 'Quad.easeIn', onComplete: () => {
      head.destroy(); core?.destroy(); em.stop(); this.s.time.delayedCall(400, () => em.destroy()); hit?.();
    } });
  }
  /** shimmering bubble around a target */
  bubble(target: Phaser.GameObjects.Components.Transform, col: number, ms: number) {
    const b = this.s.add.image(target.x, target.y - 16, 'vfx_ring').setTint(col).setBlendMode(Phaser.BlendModes.ADD).setDepth(D).setScale(0.05);
    const fill = this.s.add.image(target.x, target.y - 16, 'vfx_glow').setTint(col).setBlendMode(Phaser.BlendModes.ADD).setDepth(D - 1).setAlpha(0.22).setScale(0.05);
    this.s.tweens.add({ targets: b, scaleX: 0.36, scaleY: 0.42, duration: 260, ease: 'Back.easeOut' });
    this.s.tweens.add({ targets: fill, scaleX: 0.75, scaleY: 0.9, duration: 260, ease: 'Back.easeOut' });
    this.s.tweens.add({ targets: [b, fill], alpha: { from: 0.6, to: 1 }, duration: 500, yoyo: true, repeat: -1 });
    const upd = this.s.time.addEvent({ delay: 16, loop: true, callback: () => { b.setPosition(target.x, target.y - 16); fill.setPosition(target.x, target.y - 16); } });
    const end = () => { upd.remove(); this.s.tweens.killTweensOf([b, fill]); this.s.tweens.add({ targets: [b, fill], alpha: 0, scale: 0.6, duration: 250, onComplete: () => { b.destroy(); fill.destroy(); } }); };
    this.s.time.delayedCall(ms, end);
    return end;
  }
}
